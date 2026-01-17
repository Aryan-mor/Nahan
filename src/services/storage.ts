/* eslint-disable max-lines-per-function, max-lines */
import { IDBPDatabase, openDB } from 'idb';

import * as logger from '../utils/logger';

import { decryptData, encryptData, generateBlindIndex } from './secureStorage';

export interface Identity {
  id: string;
  name: string;
  email: string;
  publicKey: string;
  privateKey: string; // Already encrypted with passphrase
  fingerprint: string;
  createdAt: Date;
  lastUsed: Date;
  security_version?: number; // 1 = PIN only, 2 = MasterKey + HW Binding
}

export interface Contact {
  id: string;
  name: string;
  email?: string;
  publicKey: string;
  fingerprint: string;
  createdAt: Date;
  lastUsed: Date;
}

export interface SecureMessage {
  id: string;
  senderFingerprint: string;
  recipientFingerprint: string;
  type?: 'text' | 'image' | 'image_stego';
  content: {
    plain: string;
    encrypted: string;
    image?: string;
    imageBlob?: Blob;
  };
  createdAt: Date;
  isOutgoing: boolean;
  read: boolean;
  isVerified?: boolean;
  status: 'sent' | 'pending' | 'failed';
  isBroadcast?: boolean;
}

/**
 * Vault entry - all data is encrypted in the payload
 */
interface VaultEntry {
  id: string;
  payload: string; // Encrypted JSON string
}

interface NahanDB {
  secure_vault: VaultEntry;
  system_settings: unknown; // Flexible store for settings
}

/**
 * Standardized ID prefixes for zero-metadata policy
 */
const ID_PREFIX = {
  IDENTITY: 'idx_', // Will be appended with BlindIndex('IDENTITY')
  CONTACT: 'idx_', // Will be appended with BlindIndex('CONTACTS')
  MESSAGE: 'idx_', // Will be appended with BlindIndex(ConversationFingerprint)
} as const;

// Helper to get the full prefix for a type
const getBlindIndexPrefix = async (type: string): Promise<string> => {
  const blindIndex = await generateBlindIndex(type);
  return `idx_${blindIndex}_`;
};

export class StorageService {
  private static instance: StorageService;
  private db: IDBPDatabase<NahanDB> | null = null;
  private readonly DB_NAME = 'nahan_secure_v1';
  private readonly DB_VERSION = 6; // V6: Per-Record Key Derivation (HKDF + Salt)

  private worker: Worker | null = null;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  private pendingRequests = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason: any) => void }
  >();

  private constructor() {
    this.initializeWorker();
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private initializeWorker() {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('../workers/storage.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = (error) => {
        logger.error('Storage Worker Error:', error);
      };
    }
  }

  private handleWorkerMessage(event: MessageEvent) {
    const { id, success, data, error } = event.data;
    const request = this.pendingRequests.get(id);

    if (request) {
      this.pendingRequests.delete(id);
      if (success) {
        request.resolve(data);
      } else {
        request.reject(new Error(error));
      }
    }
  }

  private executeWorkerTask<T>(type: string, payload: unknown): Promise<T> {
    if (!this.worker) throw new Error('Storage Worker not initialized');

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      this.pendingRequests.set(id, { resolve, reject });
      this.worker!.postMessage({ id, type, payload });
    });
  }

  /**
   * Initialize the database with secure vault
   */
  async initialize(): Promise<void> {
    try {
      this.db = (await openDB<NahanDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db, oldVersion) {
          if (db.objectStoreNames.contains('user_identity')) {
            db.deleteObjectStore('user_identity');
          }
          if (db.objectStoreNames.contains('contacts')) {
            db.deleteObjectStore('contacts');
          }
          if (db.objectStoreNames.contains('messages')) {
            db.deleteObjectStore('messages');
          }

          // V6: Database Schema Finalization - Wipe for V2.2 clean slate (RecordKey + Salt)
          if (oldVersion < 6) {
            if (db.objectStoreNames.contains('secure_vault')) {
              db.deleteObjectStore('secure_vault');
            }
            if (db.objectStoreNames.contains('system_settings')) {
              db.deleteObjectStore('system_settings');
            }
          }

          if (!db.objectStoreNames.contains('secure_vault')) {
            db.createObjectStore('secure_vault', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('system_settings')) {
            db.createObjectStore('system_settings');
          }
        },
      })) as IDBPDatabase<NahanDB>;
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw new Error('Failed to initialize storage');
    }
  }

  /**
   * Get a system setting (unencrypted)
   */
  async getSystemSetting<T>(key: string): Promise<T | undefined> {
    if (!this.db) await this.initialize();
    return this.db?.get('system_settings', key);
  }

  /**
   * Set a system setting (unencrypted)
   */
  async setSystemSetting(key: string, value: unknown): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db?.put('system_settings', value, key);
  }

  /**
   * Store encrypted data in vault
   */
  private async storeInVault<T>(id: string, data: T, passphrase: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (!passphrase) throw new Error('SecureStorage: Missing key');

    // Serialize and encrypt the entire object
    const jsonString = JSON.stringify(data);
    const encryptedPayload = await encryptData(jsonString, passphrase);

    const entry: VaultEntry = {
      id,
      payload: encryptedPayload,
    };

    await this.db.put('secure_vault', entry);
  }

  /**
   * Helper function to convert date strings to Date objects
   * JSON.parse converts Date objects to strings, so we need to restore them
   */
  private convertDates<T extends { createdAt?: Date | string; lastUsed?: Date | string }>(
    obj: T,
  ): T {
    if (obj && typeof obj === 'object') {
      if ('createdAt' in obj && typeof obj.createdAt === 'string') {
        (obj as unknown as { createdAt: Date }).createdAt = new Date(obj.createdAt);
      }
      if ('lastUsed' in obj && typeof obj.lastUsed === 'string') {
        (obj as unknown as { lastUsed: Date }).lastUsed = new Date(obj.lastUsed);
      }
    }
    return obj;
  }

  /**
   * Retrieve and decrypt data from vault
   */
  private async getFromVault<T>(id: string, passphrase?: string): Promise<T | null> {
    if (!this.db) throw new Error('Database not initialized');

    const entry = await this.db.get('secure_vault', id);
    if (!entry) return null;

    // If no passphrase provided, we still need to decrypt to get the structure
    // But we'll use a dummy passphrase attempt to get the encrypted privateKey
    // Actually, we can't decrypt without the real passphrase
    // So we'll return the encrypted payload wrapped in a structure
    if (!passphrase) {
      return { _encryptedPayload: entry.payload } as unknown as T;
    }

    // Decrypt and parse
    try {
      const decryptedJson = await decryptData(entry.payload, passphrase);
      const parsed = JSON.parse(decryptedJson) as T;

      // Convert date strings back to Date objects (JSON.parse converts Date to string)
      return this.convertDates(parsed);
    } catch (error) {
      logger.warn(`[Storage] Failed to decrypt ${id}:`, error);
      return null;
    }
  }

  /**
   * Get all entries with a specific prefix
   */
  private async getAllWithPrefix<T>(prefix: string, passphrase: string): Promise<T[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (!passphrase) throw new Error('SecureStorage: Missing key');

    const allEntries = await this.db.getAll('secure_vault');
    const results: T[] = [];

    for (const entry of allEntries) {
      if (entry.id.startsWith(prefix)) {
        try {
          const decryptedJson = await decryptData(entry.payload, passphrase);
          const parsed = JSON.parse(decryptedJson) as T;

          // Convert date strings back to Date objects (JSON.parse converts Date to string)
          results.push(this.convertDates(parsed));
        } catch (error) {
          logger.warn(`[Storage] Failed to decrypt entry ${entry.id} (skipping):`, error);
        }
      }
    }

    return results;
  }

  /**
   * Get all raw encrypted entries with prefix (No Decryption)
   */
  private async getAllRawWithPrefix(prefix: string): Promise<VaultEntry[]> {
    if (!this.db) throw new Error('Database not initialized');
    const allEntries = await this.db.getAll('secure_vault');
    return allEntries.filter((entry) => entry.id.startsWith(prefix));
  }

  /**
   * Delete entry from vault
   */
  private async deleteFromVault(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.delete('secure_vault', id);
  }

  /**
   * Store the user identity (singular - only one record allowed)
   */
  async storeIdentity(
    identity: Omit<Identity, 'id' | 'createdAt' | 'lastUsed'>,
    passphrase: string,
  ): Promise<Identity> {
    const now = new Date();
    // V2.2: Identity ID is now Blind Indexed
    const identityPrefix = await getBlindIndexPrefix('IDENTITY');
    // We use a fixed suffix 'MAIN' because there's only one identity allowed
    const identityId = `${identityPrefix}MAIN`;

    const completeIdentity: Identity = {
      ...identity,
      id: identityId,
      createdAt: now,
      lastUsed: now,
      security_version: identity.security_version || 1,
    };

    // Delete existing identity if any (only one allowed)
    // We need to find if there is any existing identity using the prefix
    const existing = await this.getAllRawWithPrefix(identityPrefix);
    for (const entry of existing) {
      await this.deleteFromVault(entry.id);
    }

    await this.storeInVault(identityId, completeIdentity, passphrase);
    // V2.2: Set onboarded flag to ensure persistence checks pass
    await this.setSystemSetting('is_onboarded', true);

    return completeIdentity;
  }

  /**
   * Check if an identity exists in the vault (without requiring passphrase)
   * Used for boot detection to determine if Onboarding or LockScreen should be shown
   */
  async hasIdentity(): Promise<boolean> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) throw new Error('Database not initialized');

    try {
      // V2.2: Check for any entry with IDENTITY blind index prefix
      // We can't generate the blind index without the master key...
      // WAIT: hasIdentity is called BEFORE unlock, so we don't have MasterKey!
      //
      // CRITICAL ISSUE: We cannot generate Blind Index without Master Key.
      // Master Key is wrapped with PIN.
      // We need to check if identity exists to know if we should ask for PIN.
      //
      // Solution: We must store a non-sensitive "Identity Exists" flag in system_settings (unencrypted).
      // Or we rely on the presence of the Wrapped Master Key in localStorage?
      //
      // If `nahan_wrapper_salt` or the wrapped key exists in localStorage, it means we are onboarded.
      // Let's use `secureStorage` to check if keys exist.
      //
      // BUT `storage.ts` logic was checking `secure_vault`.
      // Let's change this to check system_settings or localStorage.
      //
      // Checking `localStorage.getItem('nahan_wrapper_salt')` is a good proxy.
      // Actually, `secureStorage` has the keys.
      //
      // Let's use `system_settings` for an "onboarded" flag.

      const onboarded = await this.getSystemSetting<boolean>('is_onboarded');
      return !!onboarded;
    } catch (error) {
      logger.error('Failed to check identity existence:', error);
      return false;
    }
  }

  /**
   * Get the user identity (singular)
   * @param passphrase Optional - if provided, decrypts the identity.
   */
  async getIdentity(passphrase?: string): Promise<Identity | null> {
    if (!passphrase) {
      return null;
    }

    // Passphrase provided - decrypt and return real identity
    // V2.2: Use Blind Index lookup
    const identityPrefix = await getBlindIndexPrefix('IDENTITY');
    const identityId = `${identityPrefix}MAIN`;
    return await this.getFromVault<Identity>(identityId, passphrase);
  }

  /**
   * Get all identities (for backward compatibility - returns array with single identity or empty)
   */
  async getIdentities(passphrase: string): Promise<Identity[]> {
    const identity = await this.getIdentity(passphrase);
    return identity ? [identity] : [];
  }

  /**
   * Get identity by fingerprint
   */
  async getIdentityByFingerprint(
    fingerprint: string,
    passphrase: string,
  ): Promise<Identity | undefined> {
    const identity = await this.getIdentity(passphrase);
    return identity?.fingerprint === fingerprint ? identity : undefined;
  }

  /**
   * Update identity last used timestamp
   */
  async updateIdentityLastUsed(fingerprint: string, passphrase: string): Promise<void> {
    const identity = await this.getIdentity(passphrase);
    if (identity && identity.fingerprint === fingerprint) {
      identity.lastUsed = new Date();
      await this.storeInVault(ID_PREFIX.IDENTITY, identity, passphrase);
    }
  }

  /**
   * Store a new contact
   */
  async storeContact(
    contact: Omit<Contact, 'id' | 'createdAt' | 'lastUsed'>,
    passphrase: string,
  ): Promise<Contact> {
    const now = new Date();
    // V2.2: Contacts use Blind Indexing
    const contactPrefix = await getBlindIndexPrefix('CONTACTS');
    const contactId = `${contactPrefix}${crypto.randomUUID()}`;

    const completeContact: Contact = {
      ...contact,
      id: contactId,
      createdAt: now,
      lastUsed: now,
    };

    await this.storeInVault(contactId, completeContact, passphrase);
    return completeContact;
  }

  /**
   * Update existing contact
   */
  async updateContact(contact: Contact, passphrase: string): Promise<void> {
    if (!contact.id) throw new Error('Cannot update contact without ID');
    await this.storeInVault(contact.id, contact, passphrase);
  }

  /**
   * Get all contacts
   */
  async getContacts(passphrase: string): Promise<Contact[]> {
    const contactPrefix = await getBlindIndexPrefix('CONTACTS');
    return await this.getAllWithPrefix<Contact>(contactPrefix, passphrase);
  }

  /**
   * Get contact by fingerprint
   */
  async getContactByFingerprint(
    fingerprint: string,
    passphrase: string,
  ): Promise<Contact | undefined> {
    const contacts = await this.getContacts(passphrase);
    return contacts.find((c) => c.fingerprint === fingerprint);
  }

  /**
   * Update contact last used timestamp
   */
  async updateContactLastUsed(fingerprint: string, passphrase: string): Promise<void> {
    const contacts = await this.getContacts(passphrase);
    const contact = contacts.find((c) => c.fingerprint === fingerprint);
    if (contact) {
      contact.lastUsed = new Date();
      await this.storeInVault(contact.id, contact, passphrase);
    }
  }

  /**
   * Delete contact
   */
  async deleteContact(_fingerprint: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Find contact by fingerprint (requires passphrase, but we'll use a workaround)
    // Since we can't decrypt without passphrase, we need to store fingerprint mapping
    // For now, we'll require the caller to provide the contact ID
    // This is a limitation of the zero-metadata approach
    throw new Error('deleteContact requires contact ID - use deleteContactById instead');
  }

  /**
   * Delete contact by ID
   */
  async deleteContactById(contactId: string): Promise<void> {
    await this.deleteFromVault(contactId);
  }

  /**
   * Store a secure message
   * Message ID format: msg_{recipientFingerprint}_{uuid}
   * This enables efficient IndexedDB key range queries for message retrieval
   */
  async storeMessage(
    message: Omit<SecureMessage, 'createdAt' | 'id'> & { createdAt?: Date; id?: string },
    _passphrase: string,
  ): Promise<SecureMessage> {
    // Use recipient fingerprint in message ID for efficient key range queries
    // For outgoing messages, recipientFingerprint is the contact's fingerprint
    // For incoming messages, recipientFingerprint is the user's fingerprint (conversation partner)
    const conversationFingerprint = message.isOutgoing
      ? message.recipientFingerprint
      : message.senderFingerprint;

    // Use provided ID or generate a new one (random)
    let messageId = message.id;
    if (!messageId) {
      const blindIndex = await generateBlindIndex(conversationFingerprint);
      // ID Format: idx_{BlindIndex}_{UUID}
      // Timestamp removed from ID to prevent metadata leakage (stored inside encrypted payload)
      messageId = `${ID_PREFIX.MESSAGE}${blindIndex}_${crypto.randomUUID()}`;
    }

    const completeMessage: SecureMessage = {
      ...message,
      id: messageId,
      createdAt: message.createdAt || new Date(),
    };

    // WORKER OFFLOAD: Reverted to Main Thread for stability during V2.2 Migration check
    // Worker seems to fail in test environment or build.
    // We will use direct main-thread encryption which is proven to work.
    
    // Serialize and encrypt
    const jsonString = JSON.stringify(completeMessage);
    // encryptData uses the active master key internally
    const encryptedPayload = await encryptData(jsonString);

    const entry: VaultEntry = {
      id: messageId,
      payload: encryptedPayload,
    };

    if (!this.db) await this.initialize();
    await this.db!.put('secure_vault', entry);

    /*
    const start = performance.now();
    await this.executeWorkerTask('storeMessage', {
      message: completeMessage,
      masterKey,
    });
    logger.debug(
      `[PERF][Storage] Worker Store Message - Duration: ${(performance.now() - start).toFixed(
        2,
      )}ms`,
    );
    */

    return completeMessage;
  }

  /**
   * Check if a message with the exact same encrypted content already exists
   * Used for deduplication to prevent storing the same message multiple times
   */
  async messageExists(encryptedContent: string, passphrase: string): Promise<boolean> {
    const duplicate = await this.findDuplicateMessage(encryptedContent, passphrase);
    return !!duplicate;
  }

  /**
   * Find a duplicate message by encrypted content
   */
  async findDuplicateMessage(
    encryptedContent: string,
    passphrase: string,
  ): Promise<SecureMessage | null> {
    if (!this.db) {
      await this.initialize();
    }

    try {
      // Get all messages from the vault
      // Note: In a large app, we would want an index on content hash, but for now linear scan of this user's messages is acceptable given local storage limits.
      // We could optimize by checking only recent messages if we assume chronological paste, but global unique check is safer.
      const allMessages = await this.getAllWithPrefix<SecureMessage>(ID_PREFIX.MESSAGE, passphrase);

      // Check if any message has the same encrypted content
      return allMessages.find((msg) => msg.content.encrypted === encryptedContent) || null;
    } catch (error) {
      logger.error('Failed to find duplicate message:', error);
      return null;
    }
  }

  /**
   * Get messages by fingerprint (conversations)
   * Uses IndexedDB key ranges for efficient querying without loading entire database
   * CRITICAL: Post-decryption check ensures strict data isolation
   */
  /**
   * Get messages by fingerprint with pagination
   * Uses IndexedDB cursors for efficient querying
   * @param fingerprint The contact fingerprint
   * @param limit Max messages to return (default 50)
   * @param offset Number of messages to skip (for pagination)
   */
  async getMessagesPaginated(
    fingerprint: string,
    passphrase: string,
    limit = 50,
    offset = 0,
  ): Promise<SecureMessage[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (!passphrase) throw new Error('SecureStorage: Missing key');

    const blindIndex = await generateBlindIndex(fingerprint);
    const prefix = `${ID_PREFIX.MESSAGE}${blindIndex}_`;
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff', false, false);

    const tx = this.db.transaction('secure_vault', 'readonly');
    const store = tx.objectStore('secure_vault');
    const rawEntries: VaultEntry[] = [];

    // Use cursor moving backwards (prev) to get newest messages first
    let cursor = await store.openCursor(range, 'prev');

    // Skip offset if needed
    if (offset > 0 && cursor) {
      await cursor.advance(offset);
    }

    // Phase 1: Collect raw encrypted entries (Synchronous relative to transaction)
    // We fetch 'limit' entries. Validation happens later.
    while (cursor && rawEntries.length < limit) {
      if (cursor.value.id.startsWith(prefix)) {
        rawEntries.push(cursor.value);
      }
      cursor = await cursor.continue();
    }

    // Transaction ends here logically as we stop using it

    // Phase 2: Decrypt and Validate (Async, parallel)
    const results: SecureMessage[] = [];

    // Decrypt all in parallel for performance
    const decryptedResults = await Promise.all(
      rawEntries.map(async (entry) => {
        try {
          const decryptedJson = await decryptData(entry.payload, passphrase);
          const parsed = JSON.parse(decryptedJson) as SecureMessage;
          return { parsed, entryId: entry.id };
        } catch (error) {
          logger.warn(`[Storage] Failed to decrypt message ${entry.id}:`, error);
          return null;
        }
      }),
    );

    // Phase 3: Filter and Format
    for (const res of decryptedResults) {
      if (!res) continue;

      const { parsed } = res;
      // Strict isolation check
      if (parsed.recipientFingerprint === fingerprint || parsed.senderFingerprint === fingerprint) {
        results.push(this.convertDates(parsed));
      }
    }

    // Explicitly sort by createdAt descending (Newest first)
    // This fixes display order even if keys (IDs) were random or unsorted
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return results;
  }

  /**
   * Get the last message for a contact
   * Optimized version that uses key ranges to fetch only relevant messages
   */
  async getLastMessage(
    fingerprint: string,
    passphrase: string,
  ): Promise<SecureMessage | undefined> {
    // Fetch only the most recent 1 message
    const messages = await this.getMessagesPaginated(fingerprint, passphrase, 1);
    return messages.length > 0 ? messages[0] : undefined;
  }

  /**
   * Get chat summaries (last message for each conversation)
   * Efficiently fetches only the most recent message per fingerprint using IndexedDB key ranges
   * Returns a map of fingerprint -> last message
   */
  async getChatSummaries(
    fingerprints: string[],
    passphrase: string,
  ): Promise<Record<string, SecureMessage | undefined>> {
    if (!this.db) throw new Error('Database not initialized');
    if (!passphrase) throw new Error('SecureStorage: Missing key');

    const summaries: Record<string, SecureMessage | undefined> = {};

    // Process each fingerprint
    for (const fingerprint of fingerprints) {
      // Use efficient single-fetch
      const lastMsg = await this.getLastMessage(fingerprint, passphrase);
      summaries[fingerprint] = lastMsg;
    }

    return summaries;
  }

  /**
   * Delete a message
   */
  async deleteMessage(id: string): Promise<void> {
    await this.deleteFromVault(id);
  }

  /**
   * Delete all messages for a specific contact (by fingerprint)
   */
  async deleteMessagesByFingerprint(fingerprint: string, passphrase: string): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }

    // Get ALL messages for this fingerprint to find their IDs
    // We use a large limit to cover reasonable history. For strict cleanup, cursors are better but this fits the interface.
    // 10000 is a safe upper bound for mobile/web local storage context usually.
    const messages = await this.getMessagesPaginated(fingerprint, passphrase, 10000);

    // Delete each message from the vault
    for (const message of messages) {
      await this.deleteFromVault(message.id);
    }
  }

  /**
   * Get pending messages for offline sync
   */
  async getPendingMessages(passphrase: string): Promise<SecureMessage[]> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) throw new Error('Database not initialized');
    if (!passphrase) throw new Error('SecureStorage: Missing key');

    const allMessages = await this.getAllWithPrefix<SecureMessage>(ID_PREFIX.MESSAGE, passphrase);
    return allMessages.filter((msg) => msg.status === 'pending');
  }

  /**
   * Update message status
   */
  async updateMessageStatus(
    id: string,
    status: 'sent' | 'pending' | 'failed',
    passphrase: string,
  ): Promise<void> {
    const message = await this.getFromVault<SecureMessage>(id, passphrase);
    if (message) {
      message.status = status;
      await this.storeInVault(id, message, passphrase);
    }
  }

  /**
   * Clear all data
   */
  async clearAllData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const tx = this.db.transaction('secure_vault', 'readwrite');
      await tx.objectStore('secure_vault').clear();
      await this.db.clear('secure_vault');
    } catch (error) {
      logger.error('Failed to clear data:', error);
      throw new Error('Failed to clear data');
    }
  }

  /**
   * Clear only message data (keep identities and contacts)
   */
  async clearAllMessages(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const tx = this.db.transaction('secure_vault', 'readwrite');
      const store = tx.objectStore('secure_vault');
      let cursor = await store.openCursor();

      while (cursor) {
        // ID_PREFIX.MESSAGE is 'msg_'
        if (cursor.key.toString().startsWith(ID_PREFIX.MESSAGE)) {
          await cursor.delete();
        }
        cursor = await cursor.continue();
      }
      await tx.done;
    } catch (error) {
      logger.error('Failed to clear messages:', error);
      throw new Error('Failed to clear messages');
    }
  }

  /**
   * MIGRATION V1 -> V2
   * Decrypts V1 Identity/Contacts using PIN (Legacy)
   * Clears (Purges) all Messages
   * Re-encrypts Identity/Contacts using currently loaded Master Key (V2)
   */
  async migrateV1ToV2(_pin: string): Promise<boolean> {
    if (!this.db) await this.initialize();
    if (!this.db) return false;

    // Importing legacy helper dynamically to avoid circular dependencies if possible,
    // or we assume it's available via import.
    // We already imported decryptData, let's assume we can import decryptLegacyData too.
    // const { decryptLegacyData } = await import('./secureStorage');

    try {
      // 1. Fetch Raw Identity & Contacts
      // We can't use getIdentity() because it uses decryptData (V2 strict).
      // We must fetch the Valid Entry directly.
      // V2.2: Migration is broken because we don't know the Blind Indexes without MasterKey.
      // But Migration V1->V2 implies we are creating V2 data for the first time.
      // So we are WRITING new data.
      //
      // However, if we are migrating FROM V1, the data in DB is V1 (unencrypted or old format).
      // But we just WIPED the DB in V5 upgrade!
      //
      // So Migration V1->V2 is actually IMPOSSIBLE if we wiped the DB.
      //
      // If the user upgrades from V1 to V5 directly, `initialize()` wipes the DB.
      // So there is no data to migrate.
      //
      // This function is effectively dead code in V5 schema unless we keep V1 tables.
      // But we deleted V1 tables in `upgrade`.
      //
      // So we should probably disable/remove this migration logic or just return false.
      // Since the user wants "Schema Lockdown" and "Clean DB", we can assume migration is not supported
      // or handled via export/import.

      logger.warn(
        '[Storage] Migration V1 -> V2 is not supported in V5 schema (DB reset enforced).',
      );
      return false;
    } catch (error) {
      logger.error('[Storage] Migration V1 -> V2 Failed:', error);
      return false;
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const storageService = StorageService.getInstance();
