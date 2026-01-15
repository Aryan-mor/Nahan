/* eslint-disable max-lines-per-function, max-lines */
import { IDBPDatabase, openDB } from 'idb';

import * as logger from '../utils/logger';

import { decryptData, encryptData } from './secureStorage';

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
  IDENTITY: 'user_identity',
  CONTACT: 'con_',
  MESSAGE: 'msg_',
} as const;

export class StorageService {
  private static instance: StorageService;
  private db: IDBPDatabase<NahanDB> | null = null;
  private readonly DB_NAME = 'nahan_secure_v1';
  private readonly DB_VERSION = 3; // Increment to trigger migration for system_settings

  private worker: Worker | null = null;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  private pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (reason: any) => void }>();

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

            // Delete old tables if they exist
            if (db.objectStoreNames.contains('user_identity')) {
              db.deleteObjectStore('user_identity');
            }
            if (db.objectStoreNames.contains('contacts')) {
              db.deleteObjectStore('contacts');
            }


          // Create secure_vault table (single table for all encrypted data)
          if (!db.objectStoreNames.contains('secure_vault')) {
            db.createObjectStore('secure_vault', { keyPath: 'id' });
          }

          // Version 3: System Settings (Unencrypted/Less sensitive metadata for Bootstrapping)
          if (oldVersion < 3) {
            if (!db.objectStoreNames.contains('system_settings')) {
              db.createObjectStore('system_settings');
            }
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
  private convertDates<T extends { createdAt?: Date | string; lastUsed?: Date | string }>(obj: T): T {
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
    return allEntries.filter(entry => entry.id.startsWith(prefix));
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
    const completeIdentity: Identity = {
      ...identity,
      id: ID_PREFIX.IDENTITY,
      createdAt: now,
      lastUsed: now,
      security_version: identity.security_version || 1,
    };

    // Delete existing identity if any (only one allowed)
    await this.deleteFromVault(ID_PREFIX.IDENTITY);

    await this.storeInVault(ID_PREFIX.IDENTITY, completeIdentity, passphrase);
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
      const entry = await this.db.get('secure_vault', ID_PREFIX.IDENTITY);
      return entry !== undefined;
    } catch (error) {
      logger.error('Failed to check identity existence:', error);
      return false;
    }
  }

  /**
   * Get the user identity (singular)
   * @param passphrase Optional - if provided, decrypts the identity. If not, attempts to decrypt with empty string to get structure (for boot detection).
   */
  async getIdentity(passphrase?: string): Promise<Identity | null> {
    if (!passphrase) {
      // No passphrase provided - we need to decrypt the vault entry to get the identity structure
      // The identity.privateKey is already encrypted with the user's PIN, so we can extract it
      // from the decrypted vault entry. However, we can't decrypt the vault entry without a passphrase.
      //
      // Solution: We'll attempt to decrypt with an empty string or a known dummy value.
      // This will fail, but we can catch the error. Actually, better approach:
      // We'll try to decrypt with an empty passphrase. If it fails, we return null.
      // But actually, we can't decrypt without the real passphrase.
      //
      // The real solution: We decrypt the vault entry to get the identity JSON structure.
      // The identity object contains the encrypted privateKey. We need this for PIN verification.
      // But we can't decrypt the vault entry without the sessionPassphrase.
      //
      // I think the correct approach is: In initializeApp, we don't load the identity at all.
      // We just check if it exists. Then in unlockApp, we decrypt with the PIN attempt.
      // But the user wants to load the raw identity for verification.
      //
      // Actually, wait - the user's request says to return the identity "AS-IS" from the database.
      // But the identity is encrypted in the vault. So we need to decrypt it to get the structure.
      // The decrypted identity will have encrypted names/emails, but the privateKey will be
      // the encrypted privateKey (which is what we need for verification).
      //
      // But we can't decrypt the vault entry without the passphrase. So we need a different approach.
      //
      // I think the solution is: We decrypt the vault entry with the PIN attempt in unlockApp.
      // For boot detection, we just check if the entry exists. But the user wants the identity
      // loaded for verification.
      //
      // Let me re-read the user's request: "return the identity object AS-IS from the database (with encrypted names/emails)"
      // This suggests the identity object should be returned, but with encrypted fields. But the
      // entire identity is encrypted in the vault. So we need to decrypt the vault entry to get
      // the identity object. But we can't decrypt without a passphrase.
      //
      // I think the solution is: We decrypt the vault entry to get the identity structure.
      // The identity object itself has the encrypted privateKey. We can use this for verification.
      // But to decrypt the vault entry, we need the sessionPassphrase, which we don't have on boot.
      //
      // Actually, I think the user wants us to decrypt the vault entry to get the identity structure,
      // but the names/emails inside the identity are encrypted separately. But that doesn't make sense
      // with our current architecture where the entire identity is encrypted in the vault.
      //
      // Let me try a different approach: We'll decrypt the vault entry to get the identity JSON.
      // This requires a passphrase. But for boot detection, we can't decrypt. So we return null.
      // Then in unlockApp, we decrypt with the PIN attempt.

      // Return null if no passphrase - unlockApp will decrypt with PIN attempt
      return null;
    }

    // Passphrase provided - decrypt and return real identity
    return await this.getFromVault<Identity>(ID_PREFIX.IDENTITY, passphrase);
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
  async getIdentityByFingerprint(fingerprint: string, passphrase: string): Promise<Identity | undefined> {
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
  async storeContact(contact: Omit<Contact, 'id' | 'createdAt' | 'lastUsed'>, passphrase: string): Promise<Contact> {
    const now = new Date();
    const contactId = `${ID_PREFIX.CONTACT}${crypto.randomUUID()}`;
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
   * Get all contacts
   */
  async getContacts(passphrase: string): Promise<Contact[]> {
    return await this.getAllWithPrefix<Contact>(ID_PREFIX.CONTACT, passphrase);
  }

  /**
   * Get contact by fingerprint
   */
  async getContactByFingerprint(fingerprint: string, passphrase: string): Promise<Contact | undefined> {
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
  async storeMessage(message: Omit<SecureMessage, 'createdAt' | 'id'> & { createdAt?: Date; id?: string }, _passphrase: string): Promise<SecureMessage> {
    // Use recipient fingerprint in message ID for efficient key range queries
    // For outgoing messages, recipientFingerprint is the contact's fingerprint
    // For incoming messages, recipientFingerprint is the user's fingerprint (conversation partner)
    const conversationFingerprint = message.isOutgoing
      ? message.recipientFingerprint
      : message.senderFingerprint;

    // Use provided ID or generate a new one (random)
    const messageId = message.id || `${ID_PREFIX.MESSAGE}${conversationFingerprint}_z${Date.now()}_${crypto.randomUUID()}`;

    const completeMessage: SecureMessage = {
      ...message,
      id: messageId,
      createdAt: message.createdAt || new Date(),
    };

    // WORKER OFFLOAD: Move encryption and DB write to worker
    // Main thread just prepares the object and keys
    // We need the MasterKey (CryptoKey) to pass to worker
    // Note: passphrase arg is legacy/ignored in V2 if we use getMasterKey directly in secureStorage
    // But here we need to get the key.
    // secureStorage.getMasterKey() is synch.

    // Dynamic import to avoid circular dependency if needed, or assume global import
    const { getMasterKey } = await import('./secureStorage');
    const masterKey = getMasterKey();

    if (!masterKey) {
       throw new Error('Master Key not available for worker storage');
    }

    const start = performance.now();
    await this.executeWorkerTask('storeMessage', {
      message: completeMessage,
      masterKey
    });
    logger.debug(`[PERF][Storage] Worker Store Message - Duration: ${(performance.now() - start).toFixed(2)}ms`);

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
  async findDuplicateMessage(encryptedContent: string, passphrase: string): Promise<SecureMessage | null> {
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
    offset = 0
  ): Promise<SecureMessage[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (!passphrase) throw new Error('SecureStorage: Missing key');

    const prefix = `${ID_PREFIX.MESSAGE}${fingerprint}_`;
    const range = IDBKeyRange.bound(
      prefix,
      prefix + '\uffff',
      false,
      false
    );

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
      })
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
  async getLastMessage(fingerprint: string, passphrase: string): Promise<SecureMessage | undefined> {
    // Fetch only the most recent 1 message
    const messages = await this.getMessagesPaginated(fingerprint, passphrase, 1);
    return messages.length > 0 ? messages[0] : undefined;
  }

  /**
   * Get chat summaries (last message for each conversation)
   * Efficiently fetches only the most recent message per fingerprint using IndexedDB key ranges
   * Returns a map of fingerprint -> last message
   */
  async getChatSummaries(fingerprints: string[], passphrase: string): Promise<Record<string, SecureMessage | undefined>> {
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
  async updateMessageStatus(id: string, status: 'sent' | 'pending' | 'failed', passphrase: string): Promise<void> {
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
  async migrateV1ToV2(pin: string): Promise<boolean> {
    if (!this.db) await this.initialize();
    if (!this.db) return false;

    // Importing legacy helper dynamically to avoid circular dependencies if possible,
    // or we assume it's available via import.
    // We already imported decryptData, let's assume we can import decryptLegacyData too.
    const { decryptLegacyData } = await import('./secureStorage');

    try {
       // 1. Fetch Raw Identity & Contacts
       // We can't use getIdentity() because it uses decryptData (V2 strict).
       // We must fetch the Valid Entry directly.
       const identityEntry = await this.db.get('secure_vault', ID_PREFIX.IDENTITY);
       const contactEntries = await this.getAllRawWithPrefix(ID_PREFIX.CONTACT);

       if (!identityEntry) return false;

       // 2. Decrypt Legacy Data
       const identityJson = await decryptLegacyData(identityEntry.payload, pin);
       const identity = JSON.parse(identityJson) as Identity;

       const contacts: Contact[] = [];
       for (const entry of contactEntries) {
         try {
           const contactJson = await decryptLegacyData(entry.payload, pin);
           contacts.push(JSON.parse(contactJson));
         } catch (_e) {
           // Skip bad contact
         }
       }

       // 3. Purge Messages
       await this.clearAllMessages();

       // 4. Re-Encrypt Identity & Contacts with V2 Master Key
       // Assumption: The global Master Key (_activeMasterKey) has been set to the NEW key before calling this.
       // secureStorage.encryptData uses the globally set Master Key.

       // Update Identity to Version 2
       identity.security_version = 2;
       await this.storeIdentity(identity, 'IGNORED_IN_V2');

       // Re-store contacts
       for (const contact of contacts) {
          await this.storeContact(contact, 'IGNORED_IN_V2');
       }

       logger.log('[Storage] Migration V1 -> V2 Successful');
       return true;

    } catch (error) {
       logger.error('[Storage] Migration V1 -> V2 Failed:', error);
       // Critical Failure: We should probably rollback or alert.
       // For now, return false.
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
