import { IDBPDatabase, openDB } from 'idb';

export interface Identity {
  id: string;
  name: string;
  email: string;
  publicKey: string;
  privateKey: string; // Encrypted with passphrase
  fingerprint: string;
  createdAt: Date;
  lastUsed: Date;
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
  content: {
    plain: string;
    encrypted: string;
  };
  createdAt: Date;
  isOutgoing: boolean;
  read: boolean;
  isVerified?: boolean;
  status: 'sent' | 'pending' | 'failed';
}

interface NahanDB {
  identities: Identity;
  contacts: Contact;
  messages: SecureMessage;
}

export class StorageService {
  private static instance: StorageService;
  private db: IDBPDatabase<NahanDB> | null = null;
  private readonly DB_NAME = 'nahan-secure-messenger';
  private readonly DB_VERSION = 3;

  private constructor() {}

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    try {
      this.db = (await openDB<NahanDB>(this.DB_NAME, this.DB_VERSION, {
        async upgrade(db, oldVersion, newVersion, transaction) {
          // Create identities store
          if (!db.objectStoreNames.contains('identities')) {
            const identityStore = db.createObjectStore('identities', { keyPath: 'id' });
            identityStore.createIndex('fingerprint', 'fingerprint', { unique: true });
            identityStore.createIndex('email', 'email', { unique: true });
            identityStore.createIndex('createdAt', 'createdAt');
          }

          // Create contacts store
          if (!db.objectStoreNames.contains('contacts')) {
            const contactStore = db.createObjectStore('contacts', { keyPath: 'id' });
            contactStore.createIndex('fingerprint', 'fingerprint', { unique: true });
            contactStore.createIndex('email', 'email', { unique: true });
            contactStore.createIndex('name', 'name');
            contactStore.createIndex('createdAt', 'createdAt');
          }

          // Create messages store
          if (!db.objectStoreNames.contains('messages')) {
            const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
            messageStore.createIndex('senderFingerprint', 'senderFingerprint');
            messageStore.createIndex('recipientFingerprint', 'recipientFingerprint');
            messageStore.createIndex('createdAt', 'createdAt');
            messageStore.createIndex('isOutgoing', 'isOutgoing');
            messageStore.createIndex('status', 'status');
          } else {
             const messageStore = transaction.objectStore('messages');
             
             if (oldVersion < 2) {
                // Version 2 migration logic (delete and recreate)
                db.deleteObjectStore('messages');
                const newMessageStore = db.createObjectStore('messages', { keyPath: 'id' });
                newMessageStore.createIndex('senderFingerprint', 'senderFingerprint');
                newMessageStore.createIndex('recipientFingerprint', 'recipientFingerprint');
                newMessageStore.createIndex('createdAt', 'createdAt');
                newMessageStore.createIndex('isOutgoing', 'isOutgoing');
                newMessageStore.createIndex('status', 'status');
             } else if (oldVersion < 3) {
                // Version 3 migration: Add status index and field
                if (!messageStore.indexNames.contains('status')) {
                  messageStore.createIndex('status', 'status');
                }
                
                // Migrate existing messages to have status='sent'
                let cursor = await messageStore.openCursor();
                while (cursor) {
                  const msg = cursor.value;
                  if (!msg.status) {
                    msg.status = 'sent';
                    await cursor.update(msg);
                  }
                  cursor = await cursor.continue();
                }
             }
          }
        },
      })) as IDBPDatabase<NahanDB>;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw new Error('Failed to initialize storage');
    }
  }

  /**
   * Store a new identity
   */
  async storeIdentity(
    identity: Omit<Identity, 'id' | 'createdAt' | 'lastUsed'>,
  ): Promise<Identity> {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date();
    const completeIdentity: Identity = {
      ...identity,
      id: crypto.randomUUID(),
      createdAt: now,
      lastUsed: now,
    };

    try {
      await this.db.add('identities', completeIdentity);
      return completeIdentity;
    } catch (error) {
      console.error('Failed to store identity:', error);
      throw new Error('Failed to store identity');
    }
  }

  /**
   * Get all identities
   */
  async getIdentities(): Promise<Identity[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      return await this.db.getAll('identities');
    } catch (error) {
      console.error('Failed to get identities:', error);
      throw new Error('Failed to get identities');
    }
  }

  /**
   * Get identity by fingerprint
   */
  async getIdentityByFingerprint(fingerprint: string): Promise<Identity | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const index = this.db.transaction('identities').store.index('fingerprint');
      return await index.get(fingerprint);
    } catch (error) {
      console.error('Failed to get identity by fingerprint:', error);
      throw new Error('Failed to get identity');
    }
  }

  /**
   * Update identity last used timestamp
   */
  async updateIdentityLastUsed(fingerprint: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const identity = await this.getIdentityByFingerprint(fingerprint);
      if (identity) {
        identity.lastUsed = new Date();
        await this.db.put('identities', identity);
      }
    } catch (error) {
      console.error('Failed to update identity last used:', error);
    }
  }

  /**
   * Store a new contact
   */
  async storeContact(contact: Omit<Contact, 'id' | 'createdAt' | 'lastUsed'>): Promise<Contact> {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date();
    const completeContact: Contact = {
      ...contact,
      id: crypto.randomUUID(),
      createdAt: now,
      lastUsed: now,
    };

    try {
      await this.db.add('contacts', completeContact);
      return completeContact;
    } catch (error) {
      console.error('Failed to store contact:', error);
      throw new Error('Failed to store contact');
    }
  }

  /**
   * Get all contacts
   */
  async getContacts(): Promise<Contact[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      return await this.db.getAll('contacts');
    } catch (error) {
      console.error('Failed to get contacts:', error);
      throw new Error('Failed to get contacts');
    }
  }

  /**
   * Get contact by fingerprint
   */
  async getContactByFingerprint(fingerprint: string): Promise<Contact | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const index = this.db.transaction('contacts').store.index('fingerprint');
      return await index.get(fingerprint);
    } catch (error) {
      console.error('Failed to get contact by fingerprint:', error);
      throw new Error('Failed to get contact');
    }
  }

  /**
   * Update contact last used timestamp
   */
  async updateContactLastUsed(fingerprint: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const contact = await this.getContactByFingerprint(fingerprint);
      if (contact) {
        contact.lastUsed = new Date();
        await this.db.put('contacts', contact);
      }
    } catch (error) {
      console.error('Failed to update contact last used:', error);
    }
  }

  /**
   * Delete contact
   */
  async deleteContact(fingerprint: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const contact = await this.getContactByFingerprint(fingerprint);
      if (contact) {
        await this.db.delete('contacts', contact.id);
      }
    } catch (error) {
      console.error('Failed to delete contact:', error);
      throw new Error('Failed to delete contact');
    }
  }

  /**
   * Store a secure message
   */
  async storeMessage(message: Omit<SecureMessage, 'id' | 'createdAt'>): Promise<SecureMessage> {
    if (!this.db) throw new Error('Database not initialized');

    const completeMessage: SecureMessage = {
      ...message,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };

    try {
      await this.db.add('messages', completeMessage);
      return completeMessage;
    } catch (error) {
      console.error('Failed to store message:', error);
      throw new Error('Failed to store message');
    }
  }

  /**
   * Get messages by fingerprint (conversations)
   */
  async getMessagesByFingerprint(fingerprint: string): Promise<SecureMessage[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const tx = this.db.transaction('messages', 'readonly');
      const senderIndex = tx.store.index('senderFingerprint');
      const recipientIndex = tx.store.index('recipientFingerprint');

      // Get messages where contact is sender OR recipient
      const [senderMessages, recipientMessages] = await Promise.all([
        senderIndex.getAll(fingerprint),
        recipientIndex.getAll(fingerprint),
      ]);

      // Deduplicate if needed (though IDs should be unique, sender/recipient logic might overlap if self-chat? Unlikely)
      // Merge and sort
      const allMessages = [...senderMessages, ...recipientMessages];

      // Remove duplicates based on ID (just in case)
      const uniqueMessages = Array.from(new Map(allMessages.map((m) => [m.id, m])).values());

      return uniqueMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    } catch (error) {
      console.error('Failed to get messages:', error);
      throw new Error('Failed to get messages');
    }
  }

  /**
   * Get the last message for a contact
   */
  async getLastMessage(fingerprint: string): Promise<SecureMessage | undefined> {
    try {
      const messages = await this.getMessagesByFingerprint(fingerprint);
      return messages.length > 0 ? messages[messages.length - 1] : undefined;
    } catch (error) {
      console.error('Failed to get last message:', error);
      return undefined;
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.delete('messages', id);
    } catch (error) {
      console.error('Failed to delete message:', error);
      throw new Error('Failed to delete message');
    }
  }

  /**
   * Get pending messages for offline sync
   */
  async getPendingMessages(): Promise<SecureMessage[]> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.getAllFromIndex('messages', 'status', 'pending');
  }

  /**
   * Update message status
   */
  async updateMessageStatus(id: string, status: 'sent' | 'pending' | 'failed'): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const tx = this.db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    
    const message = await store.get(id);
    if (message) {
      message.status = status;
      await store.put(message);
    }
    await tx.done;
  }

  /**
   * Clear all data
   */
  async clearAllData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const tx = this.db.transaction(['identities', 'contacts', 'messages'], 'readwrite');
      await Promise.all([
        tx.objectStore('identities').clear(),
        tx.objectStore('contacts').clear(),
        tx.objectStore('messages').clear(),
      ]);
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw new Error('Failed to clear data');
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
