/* eslint-disable max-lines-per-function, max-lines */
/**
 * Comprehensive Integration Tests for P2P and Broadcast Message Flows
 * Tests the complete message sending and receiving pipeline including:
 * - Version 0x01: Standard encrypted P2P messages
 * - Version 0x02: Signed broadcast messages
 */

import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CamouflageService } from '../../services/camouflage';
import { CryptoService } from '../../services/crypto';
import { Identity, storageService, Contact } from '../../services/storage';
import { useAppStore } from '../appStore';

// Mock storage service
vi.mock('../../services/storage', async () => {
  const actual = await vi.importActual('../../services/storage');
  return {
    ...actual,
    storageService: {
      initialize: vi.fn().mockResolvedValue(undefined),
      storeMessage: vi.fn().mockImplementation(async (message, _passphrase) => ({
        id: `msg-${Date.now()}-${Math.random()}`,
        ...message,
        createdAt: new Date(),
      })),
      getMessagesByFingerprint: vi.fn().mockResolvedValue([]),
      messageExists: vi.fn().mockResolvedValue(false),
      hasIdentity: vi.fn().mockResolvedValue(false),
    },
  };
});

// Mock secureStorage
vi.mock('../../services/secureStorage', () => ({
  secureStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  setPassphrase: vi.fn(),
}));

// Mock UI store
vi.mock('../uiStore', () => ({
  useUIStore: {
    getState: () => ({
      camouflageLanguage: 'fa',
    }),
  },
}));

const camouflageService = CamouflageService.getInstance();
const cryptoService = CryptoService.getInstance();

describe('P2P Message Flow (Version 0x01)', () => {
  let userAIdentity: Identity;
  let userBContact: Contact;
  let userAPassphrase: string;

  beforeEach(async () => {
    // Initialize storage
    await storageService.initialize();

    // Generate User A identity
    userAPassphrase = '123456';
    const userAKeyPair = await cryptoService.generateKeyPair('User A', 'userA@test.com', userAPassphrase);
    userAIdentity = {
      id: 'user-a-identity',
      name: 'User A',
      email: 'userA@test.com',
      publicKey: userAKeyPair.publicKey,
      privateKey: userAKeyPair.privateKey,
      fingerprint: userAKeyPair.fingerprint,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    // Generate User B contact (public key only)
    const userBKeyPair = nacl.box.keyPair();
    const userBPublicKeyBase64 = naclUtil.encodeBase64(userBKeyPair.publicKey);
    const userBFingerprint = await cryptoService.getFingerprint(userBPublicKeyBase64);

    userBContact = {
      id: 'user-b-contact',
      name: 'User B',
      fingerprint: userBFingerprint,
      publicKey: userBPublicKeyBase64,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    // Reset store state
    useAppStore.setState({
      identity: userAIdentity,
      contacts: [userBContact],
      sessionPassphrase: userAPassphrase,
      activeChat: userBContact,
      messages: [],
      messageInput: '',
    });
  });

  it('should encrypt message and embed into ZWC for P2P communication', async () => {
    const messageText = 'Hello User B';
    const store = useAppStore.getState();

    // Verify initial state
    expect(store.activeChat?.id).toBe(userBContact.id);
    expect(store.activeChat?.id).not.toBe('system_broadcast');

    // Call sendAutoStealthMessage
    const stealthOutput = await store.sendAutoStealthMessage(messageText);

    // Verify output is Persian text with ZWC
    expect(stealthOutput).toBeTruthy();
    expect(typeof stealthOutput).toBe('string');
    expect(stealthOutput.length).toBeGreaterThan(0);

    // Verify it contains Persian characters (cover text)
    expect(stealthOutput).toMatch(/[\u0600-\u06FF]/);

    // Verify ZWC is present
    const hasZWC = camouflageService.hasZWC(stealthOutput);
    expect(hasZWC).toBe(true);

    // Extract binary and verify version byte
    const extractedBinary = camouflageService.decodeFromZWC(stealthOutput, false);
    expect(extractedBinary.length).toBeGreaterThan(0);

    // First byte should be 0x01 (encrypted message)
    const versionByte = extractedBinary[0];
    expect(versionByte).toBe(0x01);
  });

  it('should call encryptMessage (not signMessage) for P2P messages', async () => {
    const messageText = 'Hello User B';
    const store = useAppStore.getState();

    // Spy on crypto methods
    const encryptSpy = vi.spyOn(cryptoService, 'encryptMessage');
    const signSpy = vi.spyOn(cryptoService, 'signMessage');

    await store.sendAutoStealthMessage(messageText);

    // Verify encryptMessage was called
    expect(encryptSpy).toHaveBeenCalledWith(
      messageText,
      userBContact.publicKey,
      userAIdentity.privateKey,
      userAPassphrase,
      { binary: true }
    );

    // Verify signMessage was NOT called
    expect(signSpy).not.toHaveBeenCalled();

    encryptSpy.mockRestore();
    signSpy.mockRestore();
  });

  it('should store P2P message with recipient fingerprint', async () => {
    const messageText = 'Hello User B';
    const store = useAppStore.getState();

    await store.sendAutoStealthMessage(messageText);

    // Verify storageService.storeMessage was called with correct recipient
    expect(storageService.storeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderFingerprint: userAIdentity.fingerprint,
        recipientFingerprint: userBContact.fingerprint, // User B's fingerprint, not 'BROADCAST'
        content: expect.objectContaining({
          plain: messageText,
        }),
        isBroadcast: undefined, // Should not be set for P2P
      }),
      userAPassphrase
    );
  });

  it('should process incoming P2P message correctly', async () => {
    const messageText = 'Hello User B';
    const store = useAppStore.getState();

    // Step 1: User A sends message
    const stealthOutput = await store.sendAutoStealthMessage(messageText);

    // Step 2: User B receives and processes the message
    // Set up User B's identity and contacts
    const userBKeyPair = await cryptoService.generateKeyPair('User B', 'userB@test.com', '123456');
    const userBIdentity = {
      id: 'user-b-identity',
      name: 'User B',
      email: 'userB@test.com',
      publicKey: userBKeyPair.publicKey,
      privateKey: userBKeyPair.privateKey,
      fingerprint: userBKeyPair.fingerprint,
      createdAt: new Date(),
      lastUsed: new Date(),
    };
    const userAContact = {
      id: 'user-a-contact',
      name: 'User A',
      fingerprint: userAIdentity.fingerprint,
      publicKey: userAIdentity.publicKey,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    useAppStore.setState({
      identity: userBIdentity,
      contacts: [userAContact],
      sessionPassphrase: '123456',
      activeChat: null,
      messages: [],
    });

    const userBStore = useAppStore.getState();

    // Process the incoming message
    await userBStore.processIncomingMessage(stealthOutput);

    // Verify message was stored with correct recipient (User B's fingerprint)
    expect(storageService.storeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderFingerprint: userAIdentity.fingerprint,
        recipientFingerprint: userBIdentity.fingerprint, // User B's own fingerprint
        content: expect.objectContaining({
          plain: messageText,
        }),
        isOutgoing: false,
        isBroadcast: undefined,
      }),
      '123456'
    );
  });

  it('should detect ZWC and route to decryptMessage for version 0x01', async () => {
    const messageText = 'Hello User B';
    const store = useAppStore.getState();

    // Send message to get ZWC output
    const stealthOutput = await store.sendAutoStealthMessage(messageText);

    // Set up receiver
    const userBKeyPair8 = await cryptoService.generateKeyPair('User B', 'userB@test.com', '123456');
    const userBIdentity = {
      id: 'user-b-identity',
      name: 'User B',
      email: 'userB@test.com',
      publicKey: userBKeyPair8.publicKey,
      privateKey: userBKeyPair8.privateKey,
      fingerprint: userBKeyPair8.fingerprint,
      createdAt: new Date(),
      lastUsed: new Date(),
    };
    const userAContact = {
      id: 'user-a-contact',
      name: 'User A',
      fingerprint: userAIdentity.fingerprint,
      publicKey: userAIdentity.publicKey,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    useAppStore.setState({
      identity: userBIdentity,
      contacts: [userAContact],
      sessionPassphrase: '123456',
    });

    const userBStore = useAppStore.getState();

    // Spy on crypto methods
    const decryptSpy = vi.spyOn(cryptoService, 'decryptMessage');
    const verifySpy = vi.spyOn(cryptoService, 'verifySignedMessage');

    // Process incoming message
    await userBStore.processIncomingMessage(stealthOutput);

    // Verify decryptMessage was called (not verifySignedMessage)
    expect(decryptSpy).toHaveBeenCalled();
    expect(verifySpy).not.toHaveBeenCalled();

    decryptSpy.mockRestore();
    verifySpy.mockRestore();
  });
});

describe('Broadcast Message Flow (Version 0x02)', () => {
  let userAIdentity: Identity;
  let userBContact: Contact;
  let userAPassphrase: string;
  let broadcastContact: Contact;

  beforeEach(async () => {
    await storageService.initialize();

    userAPassphrase = '123456';
    const userAKeyPair = await cryptoService.generateKeyPair('User A', 'userA@test.com', userAPassphrase);
    userAIdentity = {
      id: 'user-a-identity',
      name: 'User A',
      email: 'userA@test.com',
      publicKey: userAKeyPair.publicKey,
      privateKey: userAKeyPair.privateKey,
      fingerprint: userAKeyPair.fingerprint,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    const userBKeyPair = nacl.box.keyPair();
    const userBPublicKeyBase64 = naclUtil.encodeBase64(userBKeyPair.publicKey);
    const userBFingerprint = await cryptoService.getFingerprint(userBPublicKeyBase64);

    userBContact = {
      id: 'user-b-contact',
      name: 'User B',
      fingerprint: userBFingerprint,
      publicKey: userBPublicKeyBase64,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    // Create broadcast contact
    broadcastContact = {
      id: 'system_broadcast',
      name: 'Broadcast Channel',
      fingerprint: 'BROADCAST',
      publicKey: '',
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    useAppStore.setState({
      identity: userAIdentity,
      contacts: [userBContact],
      sessionPassphrase: userAPassphrase,
      activeChat: broadcastContact,
      messages: [],
      messageInput: '',
    });
  });

  it('should sign message and embed into ZWC for broadcast', async () => {
    const messageText = 'This is a public announcement';
    const store = useAppStore.getState();

    // Verify we're in broadcast mode
    expect(store.activeChat?.id).toBe('system_broadcast');

    // Call sendAutoStealthMessage
    const stealthOutput = await store.sendAutoStealthMessage(messageText);

    // Verify output is Persian text with ZWC
    expect(stealthOutput).toBeTruthy();
    expect(typeof stealthOutput).toBe('string');
    expect(stealthOutput.length).toBeGreaterThan(0);
    expect(stealthOutput).toMatch(/[\u0600-\u06FF]/);

    // Verify ZWC is present
    const hasZWC = camouflageService.hasZWC(stealthOutput);
    expect(hasZWC).toBe(true);

    // Extract binary and verify version byte
    const extractedBinary = camouflageService.decodeFromZWC(stealthOutput, false);
    expect(extractedBinary.length).toBeGreaterThan(0);

    // First byte should be 0x02 (signed broadcast message)
    const versionByte = extractedBinary[0];
    expect(versionByte).toBe(0x02);
  });

  it('should call signMessage (not encryptMessage) for broadcast messages', async () => {
    const messageText = 'This is a public announcement';
    const store = useAppStore.getState();

    // Spy on crypto methods
    const encryptSpy = vi.spyOn(cryptoService, 'encryptMessage');
    const signSpy = vi.spyOn(cryptoService, 'signMessage');

    await store.sendAutoStealthMessage(messageText);

    // Verify signMessage was called
    expect(signSpy).toHaveBeenCalledWith(
      messageText,
      userAIdentity.privateKey,
      userAPassphrase,
      { binary: true }
    );

    // Verify encryptMessage was NOT called
    expect(encryptSpy).not.toHaveBeenCalled();

    encryptSpy.mockRestore();
    signSpy.mockRestore();
  });

  it('should store broadcast message with BROADCAST recipient fingerprint', async () => {
    const messageText = 'This is a public announcement';
    const store = useAppStore.getState();

    await store.sendAutoStealthMessage(messageText);

    // Verify storageService.storeMessage was called with BROADCAST recipient
    expect(storageService.storeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderFingerprint: userAIdentity.fingerprint,
        recipientFingerprint: 'BROADCAST', // Fixed fingerprint for broadcasts
        content: expect.objectContaining({
          plain: messageText,
        }),
        isBroadcast: true, // Should be marked as broadcast
      }),
      userAPassphrase
    );
  });

  it('should process incoming broadcast message correctly', async () => {
    const messageText = 'This is a public announcement';
    const store = useAppStore.getState();

    // Step 1: User A sends broadcast
    const stealthOutput = await store.sendAutoStealthMessage(messageText);

    // Step 2: User B receives and processes the broadcast
    const userBKeyPair5 = await cryptoService.generateKeyPair('User B', 'userB@test.com', '123456');
    const userBIdentity = {
      id: 'user-b-identity',
      name: 'User B',
      email: 'userB@test.com',
      publicKey: userBKeyPair5.publicKey,
      privateKey: userBKeyPair5.privateKey,
      fingerprint: userBKeyPair5.fingerprint,
      createdAt: new Date(),
      lastUsed: new Date(),
    };
    const userAContact = {
      id: 'user-a-contact',
      name: 'User A',
      fingerprint: userAIdentity.fingerprint,
      publicKey: userAIdentity.publicKey,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    useAppStore.setState({
      identity: userBIdentity,
      contacts: [userAContact],
      sessionPassphrase: '123456',
      activeChat: null,
      messages: [],
    });

    const userBStore = useAppStore.getState();

    // Process the incoming broadcast message
    await userBStore.processIncomingMessage(stealthOutput);

    // Verify message was stored with BROADCAST recipient fingerprint
    expect(storageService.storeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderFingerprint: userAIdentity.fingerprint,
        recipientFingerprint: 'BROADCAST', // Should be BROADCAST, not User B's fingerprint
        content: expect.objectContaining({
          plain: messageText,
        }),
        isOutgoing: false,
        isBroadcast: true, // Should be marked as broadcast
      }),
      '123456'
    );
  });

  it('should detect ZWC and route to verifySignedMessage for version 0x02', async () => {
    const messageText = 'This is a public announcement';
    const store = useAppStore.getState();

    // Send broadcast message
    const stealthOutput = await store.sendAutoStealthMessage(messageText);

    // Set up receiver
    const userBKeyPair6 = await cryptoService.generateKeyPair('User B', 'userB@test.com', '123456');
    const userBIdentity = {
      id: 'user-b-identity',
      name: 'User B',
      email: 'userB@test.com',
      publicKey: userBKeyPair6.publicKey,
      privateKey: userBKeyPair6.privateKey,
      fingerprint: userBKeyPair6.fingerprint,
      createdAt: new Date(),
      lastUsed: new Date(),
    };
    const userAContact = {
      id: 'user-a-contact',
      name: 'User A',
      fingerprint: userAIdentity.fingerprint,
      publicKey: userAIdentity.publicKey,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    useAppStore.setState({
      identity: userBIdentity,
      contacts: [userAContact],
      sessionPassphrase: '123456',
    });

    const userBStore = useAppStore.getState();

    // Spy on crypto methods
    const decryptSpy = vi.spyOn(cryptoService, 'decryptMessage');
    const verifySpy = vi.spyOn(cryptoService, 'verifySignedMessage');

    // Process incoming broadcast message
    await userBStore.processIncomingMessage(stealthOutput);

    // Verify verifySignedMessage was called (not decryptMessage)
    expect(verifySpy).toHaveBeenCalled();
    expect(decryptSpy).not.toHaveBeenCalled();

    decryptSpy.mockRestore();
    verifySpy.mockRestore();
  });

  it('should verify signature against sender public key', async () => {
    const messageText = 'This is a public announcement';
    const store = useAppStore.getState();

    // Send broadcast message
    const stealthOutput = await store.sendAutoStealthMessage(messageText);

    // Set up receiver with User A's public key in contacts
    const userBKeyPair7 = await cryptoService.generateKeyPair('User B', 'userB@test.com', '123456');
    const userBIdentity = {
      id: 'user-b-identity',
      name: 'User B',
      email: 'userB@test.com',
      publicKey: userBKeyPair7.publicKey,
      privateKey: userBKeyPair7.privateKey,
      fingerprint: userBKeyPair7.fingerprint,
      createdAt: new Date(),
      lastUsed: new Date(),
    };
    const userAContact = {
      id: 'user-a-contact',
      name: 'User A',
      fingerprint: userAIdentity.fingerprint,
      publicKey: userAIdentity.publicKey, // User A's public key for verification
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    useAppStore.setState({
      identity: userBIdentity,
      contacts: [userAContact],
      sessionPassphrase: '123456',
    });

    const userBStore = useAppStore.getState();

    // Process incoming broadcast message
    await userBStore.processIncomingMessage(stealthOutput);

    // Verify verifySignedMessage was called with User A's public key
    expect(storageService.storeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderFingerprint: userAIdentity.fingerprint,
        isVerified: true, // Signature should be verified
        isBroadcast: true,
      }),
      '123456'
    );
  });
});

describe('Version Byte Routing', () => {
  it.skip('should never call decryptMessage on version 0x02 messages', async () => {
    // Create a version 0x02 message manually
    const messageText = 'Test broadcast';
    const messageBytes = new TextEncoder().encode(messageText);

    // Create a minimal version 0x02 packet structure
    const version0x02Packet = new Uint8Array(1 + 32 + 64 + messageBytes.length);
    version0x02Packet[0] = 0x02; // Version byte
    // console.log('TEST DEBUG: Created packet with version:', version0x02Packet[0]);
    // console.log('TEST DEBUG: Packet content:', Array.from(version0x02Packet.slice(0, 10)));

    // Embed into ZWC
    const coverText = 'در سخن گفتن خطای جاهلان پیدا شود';
    const stealthOutput = camouflageService.embed(version0x02Packet, coverText, 'fa');

    // Set up receiver
    const userBKeyPair3 = await cryptoService.generateKeyPair('User B', 'userB@test.com', '123456');
    const userBIdentity = {
      id: 'user-b-identity',
      name: 'User B',
      email: 'userB@test.com',
      publicKey: userBKeyPair3.publicKey,
      privateKey: userBKeyPair3.privateKey,
      fingerprint: userBKeyPair3.fingerprint,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    useAppStore.setState({
      identity: userBIdentity,
      contacts: [],
      sessionPassphrase: '123456',
    });

    const store = useAppStore.getState();

    // Spy on crypto methods
    const decryptSpy = vi.spyOn(cryptoService, 'decryptMessage');
    const verifySpy = vi.spyOn(cryptoService, 'verifySignedMessage');

    // Attempt to process - should fail gracefully but NOT call decryptMessage
    try {
      await store.processIncomingMessage(stealthOutput);
    } catch (_error) {
      // Expected to fail (no valid signature), but should NOT call decryptMessage
    }

    // CRITICAL: decryptMessage should NEVER be called on version 0x02
    expect(decryptSpy).not.toHaveBeenCalled();

    decryptSpy.mockRestore();
    verifySpy.mockRestore();
  });

  it('should never call verifySignedMessage on version 0x01 messages', async () => {
    // Create a version 0x01 encrypted message
    const userAKeyPair = await cryptoService.generateKeyPair('User A', 'userA@test.com', '123456');
    const userAIdentity = {
      id: 'user-a-identity',
      name: 'User A',
      email: 'userA@test.com',
      publicKey: userAKeyPair.publicKey,
      privateKey: userAKeyPair.privateKey,
      fingerprint: userAKeyPair.fingerprint,
      createdAt: new Date(),
      lastUsed: new Date(),
    };
    const userBKeyPairNacl = nacl.box.keyPair();
    const userBPublicKey = naclUtil.encodeBase64(userBKeyPairNacl.publicKey);

    const messageText = 'Test P2P message';
    const encryptedBinary = await cryptoService.encryptMessage(
      messageText,
      userBPublicKey,
      userAIdentity.privateKey,
      '123456',
      { binary: true }
    ) as Uint8Array;

    // Verify version byte
    expect(encryptedBinary[0]).toBe(0x01);

    // Embed into ZWC
    const coverText = 'در سخن گفتن خطای جاهلان پیدا شود';
    const stealthOutput = camouflageService.embed(encryptedBinary, coverText, 'fa');

    // Set up receiver
    const userBKeyPair = await cryptoService.generateKeyPair('User B', 'userB@test.com', '123456');
    const userBIdentity = {
      id: 'user-b-identity',
      name: 'User B',
      email: 'userB@test.com',
      publicKey: userBKeyPair.publicKey,
      privateKey: userBKeyPair.privateKey,
      fingerprint: userBKeyPair.fingerprint,
      createdAt: new Date(),
      lastUsed: new Date(),
    };
    const userAContact = {
      id: 'user-a-contact',
      name: 'User A',
      fingerprint: userAIdentity.fingerprint,
      publicKey: userAIdentity.publicKey,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    useAppStore.setState({
      identity: userBIdentity,
      contacts: [userAContact],
      sessionPassphrase: '123456',
    });

    const store = useAppStore.getState();

    // Spy on crypto methods
    const decryptSpy = vi.spyOn(cryptoService, 'decryptMessage');
    const verifySpy = vi.spyOn(cryptoService, 'verifySignedMessage');

    // Process incoming message
    await store.processIncomingMessage(stealthOutput);

    // CRITICAL: verifySignedMessage should NEVER be called on version 0x01
    expect(verifySpy).not.toHaveBeenCalled();
    expect(decryptSpy).toHaveBeenCalled();

    decryptSpy.mockRestore();
    verifySpy.mockRestore();
  });
});

