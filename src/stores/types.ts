import { Contact, Identity, SecureMessage } from '../services/storage';

export interface AuthSlice {
  error: string | null;
  identity: Identity | null;
  isLoading: boolean;
  sessionPassphrase: string | null; // In-memory only
  initializeApp: () => Promise<void>;
  addIdentity: (identity: Identity) => Promise<void>;
  wipeData: () => Promise<void>;
  unlockApp: (pin: string) => Promise<boolean>;
  lockApp: () => void;
  setSessionPassphrase: (passphrase: string) => void;
}

export interface ContactSlice {
  contacts: Contact[];
  addContact: (contact: Contact) => void;
  removeContact: (fingerprint: string) => Promise<void>;
  getContactsWithBroadcast: () => Contact[];
}

export interface MessageSlice {
  activeChat: Contact | null;
  messages: SecureMessage[];
  chatSummaries: Record<string, SecureMessage | undefined>;
  messageInput: string;
  lastStorageUpdate: number;

  setActiveChat: (contact: Contact | null) => Promise<void>;
  setMessageInput: (val: string) => void;
  sendMessage: (text: string, image?: string, type?: 'text' | 'image' | 'image_stego') => Promise<string>;
  deleteMessage: (id: string) => Promise<void>;
  clearChatHistory: (fingerprint: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
  refreshChatSummaries: () => Promise<void>;
  processPendingMessages: () => Promise<number>;
  clearAllMessages: () => Promise<void>;
}

export interface ProcessingSlice {
  processIncomingMessage: (encryptedText: string, targetContactFingerprint?: string, skipNavigation?: boolean) => Promise<{ type: 'message' | 'contact'; fingerprint: string; isBroadcast: boolean; senderName: string } | null>;
  handleUniversalInput: (input: string, targetContactFingerprint?: string, skipNavigation?: boolean) => Promise<{ type: 'message' | 'contact'; fingerprint: string; isBroadcast: boolean; senderName: string } | null>;
}

export interface StealthSlice {
  isStealthMode: boolean;
  showStealthModal: boolean;
  pendingStealthBinary: Uint8Array | null;
  pendingStealthImage: string | null;
  pendingPlaintext: string | null;
  stealthDrawerMode: 'image' | 'dual';
  setStealthMode: (enabled: boolean) => void;
  setShowStealthModal: (show: boolean) => void;
  setPendingStealthBinary: (binary: Uint8Array | null) => void;
  setPendingStealthImage: (image: string | null) => void;
  setPendingPlaintext: (text: string | null) => void;
  setStealthDrawerMode: (mode: 'image' | 'dual') => void;
  confirmStealthSend: (finalOutput: string) => Promise<void>;
  sendAutoStealthMessage: (text: string) => Promise<string>;
}

export type AppState = AuthSlice & ContactSlice & MessageSlice & ProcessingSlice & StealthSlice;
