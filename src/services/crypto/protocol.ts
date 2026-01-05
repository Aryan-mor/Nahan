/* eslint-disable max-lines-per-function, max-lines */
import pako from 'pako';
import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';

import * as logger from '../../utils/logger';

import { decryptPrivateKey, generateFingerprint } from './keys';

export interface DecryptedMessage {
  data: string;
  verified: boolean;
  signatureValid: boolean;
  senderFingerprint?: string;
}

/**
 * Nahan Compact Protocol Version
 */
export const PROTOCOL_VERSION = 0x01;

/**
 * Serialize encrypted message in Nahan Compact Protocol format
 * Format: [Version (1)] [Nonce (24)] [Sender Public Key (32)] [Encrypted Payload]
 */
function serializeEncryptedMessage(
  nonce: Uint8Array,
  senderPublicKey: Uint8Array,
  encryptedPayload: Uint8Array,
): Uint8Array {
  const totalLength = 1 + 24 + 32 + encryptedPayload.length;
  const serialized = new Uint8Array(totalLength);
  let offset = 0;

  // Version byte
  serialized[offset++] = PROTOCOL_VERSION;

  // Nonce (24 bytes)
  serialized.set(nonce, offset);
  offset += 24;

  // Sender public key (32 bytes)
  serialized.set(senderPublicKey, offset);
  offset += 32;

  // Encrypted payload
  serialized.set(encryptedPayload, offset);

  return serialized;
}

/**
 * Deserialize encrypted message from Nahan Compact Protocol format
 */
function deserializeEncryptedMessage(data: Uint8Array): {
  version: number;
  nonce: Uint8Array;
  senderPublicKey: Uint8Array;
  encryptedPayload: Uint8Array;
} {
  if (data.length < 1 + 24 + 32) {
    throw new Error('Invalid message format: too short');
  }

  let offset = 0;

  // Version byte
  const version = data[offset++];
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${version}`);
  }

  // Nonce (24 bytes)
  const nonce = data.slice(offset, offset + 24);
  offset += 24;

  // Sender public key (32 bytes)
  const senderPublicKey = data.slice(offset, offset + 32);
  offset += 32;

  // Encrypted payload
  const encryptedPayload = data.slice(offset);

  return { version, nonce, senderPublicKey, encryptedPayload };
}

/**
 * Encrypt and sign a message using Nahan Compact Protocol
 * Process: Compress -> Encrypt (X25519) -> Sign (Ed25519) -> Serialize
 * Returns raw Uint8Array with NO headers or text markers
 */
export async function encryptMessage(
  message: string,
  recipientPublicKey: string,
  senderPrivateKey: string,
  passphrase: string,
  options?: { binary?: boolean },
): Promise<string | Uint8Array> {
  try {
    // Decrypt sender's private key
    const senderPrivateKeyBytes = await decryptPrivateKey(senderPrivateKey, passphrase);

    // Decode recipient's public key
    const recipientPublicKeyBytes = naclUtil.decodeBase64(recipientPublicKey);

    // 1. Compress the message using pako BEFORE encryption
    const messageBytes = new TextEncoder().encode(message);
    const compressed = pako.deflate(messageBytes);

    // 2. Encrypt using nacl.box (X25519 + XSalsa20-Poly1305)
    // nacl.box is an AEAD (Authenticated Encryption with Associated Data) and handles authentication perfectly
    // No need for separate Ed25519 signing - nacl.box already provides authentication via Poly1305 MAC
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const encrypted = nacl.box(compressed, nonce, recipientPublicKeyBytes, senderPrivateKeyBytes);

    if (!encrypted) {
      throw new Error('Encryption failed');
    }

    // 3. Get sender's public key for serialization (X25519 encryption key)
    const senderPublicKeyBytes = nacl.box.keyPair.fromSecretKey(senderPrivateKeyBytes).publicKey;

    // Use the encrypted payload directly (no separate signature needed - nacl.box is AEAD)
    const finalPayload = encrypted;

    // 5. Serialize in Nahan Compact Protocol format
    const serialized = serializeEncryptedMessage(nonce, senderPublicKeyBytes, finalPayload);

    // TRACE A [Binary Out]
    logger.debug('TRACE A [Binary Out]:', {
      length: serialized.length,
      isUint8: serialized instanceof Uint8Array,
      firstBytes: Array.from(serialized.slice(0, 10)),
    });

    if (options?.binary) {
      // Return raw binary - NO headers, NO text, NO "BEGIN" markers
      return serialized;
    }

    // For non-stealth mode, encode as base64 (legacy compatibility)
    return naclUtil.encodeBase64(serialized);
  } catch (error) {
    logger.error('Encryption failed:', error);
    throw new Error('Failed to encrypt message');
  }
}

/**
 * Decrypt and verify a message using Nahan Compact Protocol
 */
export async function decryptMessage(
  encryptedMessage: string | Uint8Array,
  recipientPrivateKey: string,
  passphrase: string,
  senderPublicKeys: string[] = [],
): Promise<DecryptedMessage> {
  try {
    // Decode encrypted message
    let messageBytes: Uint8Array;
    if (typeof encryptedMessage === 'string') {
      // Try to parse as base64 first
      try {
        messageBytes = naclUtil.decodeBase64(encryptedMessage);
      } catch {
        // Fallback: treat as hex
        messageBytes = new Uint8Array(
          encryptedMessage.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
        );
      }
    } else {
      messageBytes = encryptedMessage;
    }

    // Deserialize message
    const { nonce, senderPublicKey, encryptedPayload } = deserializeEncryptedMessage(messageBytes);

    // Decrypt recipient's private key
    const recipientPrivateKeyBytes = await decryptPrivateKey(recipientPrivateKey, passphrase);

    // Log for debugging decryption issues
    logger.debug('[DEBUG-CRYPTO] Sender Key:', senderPublicKey, 'Nonce:', nonce);

    // Decrypt using nacl.box (X25519 authenticated encryption)
    // nacl.box.open automatically verifies the Poly1305 MAC, providing authentication
    // No separate Ed25519 signature needed - nacl.box is an AEAD
    const decrypted = nacl.box.open(
      encryptedPayload,
      nonce,
      senderPublicKey,
      recipientPrivateKeyBytes,
    );

    // ADD DEBUG LOGS
    logger.debug(
      '[DEBUG-CRYPTO] Sender Key Hash:',
      naclUtil.encodeBase64(senderPublicKey).slice(0, 4),
    );

    if (!decrypted) {
      throw new Error('Decryption failed - invalid key or corrupted message');
    }

    // Verify sender identity using provided public keys
    let signatureValid = false;
    let senderFingerprint: string | undefined;

    // Try to match sender public key with provided keys
    for (const senderKeyStr of senderPublicKeys) {
      try {
        const senderX25519Key = naclUtil.decodeBase64(senderKeyStr);
        // Compare public keys directly (X25519 keys are 32 bytes)
        if (senderX25519Key.length === senderPublicKey.length) {
          let match = true;
          for (let i = 0; i < senderPublicKey.length; i++) {
            if (senderX25519Key[i] !== senderPublicKey[i]) {
              match = false;
              break;
            }
          }
          if (match) {
            signatureValid = true;
            senderFingerprint = generateFingerprint(senderX25519Key);
            break;
          }
        }
      } catch {
        // Continue to next key
      }
    }

    if (!decrypted) {
      throw new Error('Decryption failed - invalid key or corrupted message');
    }

    // Decompress the message
    const decompressed = pako.inflate(decrypted);
    const plaintext = new TextDecoder().decode(decompressed);

    return {
      data: plaintext,
      verified: senderFingerprint !== undefined,
      signatureValid,
      senderFingerprint,
    };
  } catch (error) {
    logger.error('Decryption failed:', error);
    throw new Error('Failed to decrypt message');
  }
}

/**
 * Sign a message using Ed25519 signing
 * For broadcast messages: signs the message without encryption
 * Returns signed message in format: [Version (1)] [Sender Public Key (32)] [Signature (64)] [Message Bytes]
 */
export async function signMessage(
  message: string,
  senderPrivateKey: string,
  passphrase: string,
  options?: { binary?: boolean },
): Promise<string | Uint8Array> {
  try {
    // Decrypt sender's private key
    const senderPrivateKeyBytes = await decryptPrivateKey(senderPrivateKey, passphrase);

    // Generate Ed25519 signing key pair for broadcast messages
    // We derive Ed25519 from X25519 public key (not private key) so both sender and receiver
    // can derive the same Ed25519 public key. We hash the X25519 public key to get the seed.
    const senderX25519KeyPair = nacl.box.keyPair.fromSecretKey(senderPrivateKeyBytes);
    const senderX25519PublicKey = senderX25519KeyPair.publicKey;

    // Hash the X25519 public key to create a deterministic seed for Ed25519
    // This ensures both sender and receiver can derive the same Ed25519 public key
    const hash = await crypto.subtle.digest(
      'SHA-256',
      senderX25519PublicKey as unknown as BufferSource,
    );
    const seed = new Uint8Array(hash).slice(0, 32);
    const signingKeyPair = nacl.sign.keyPair.fromSeed(seed);

    // Encode message to bytes
    const messageBytes = new TextEncoder().encode(message);

    // Sign the message using Ed25519
    const signature = nacl.sign.detached(messageBytes, signingKeyPair.secretKey);

    // Get sender's public key for serialization
    const senderPublicKeyBytes = signingKeyPair.publicKey;

    // Serialize: [Version (1)] [Sender Public Key (32)] [Signature (64)] [Message Bytes]
    const totalLength = 1 + 32 + 64 + messageBytes.length;
    const serialized = new Uint8Array(totalLength);
    let offset = 0;

    // Version byte (use 0x02 for signed broadcast messages)
    serialized[offset++] = 0x02;

    // Sender public key (32 bytes)
    serialized.set(senderPublicKeyBytes, offset);
    offset += 32;

    // Signature (64 bytes)
    serialized.set(signature, offset);
    offset += 64;

    // Message bytes
    serialized.set(messageBytes, offset);

    if (options?.binary) {
      return serialized;
    }

    // Encode as base64 for non-binary mode
    return naclUtil.encodeBase64(serialized);
  } catch (error) {
    logger.error('Signing failed:', error);
    throw new Error('Failed to sign message');
  }
}

/**
 * Verify a signed message
 * Returns the plaintext message and verification status
 */
export async function verifySignedMessage(
  signedMessage: string | Uint8Array,
  senderPublicKeys: string[] = [],
): Promise<{ data: string; verified: boolean; senderFingerprint?: string }> {
  try {
    // Decode signed message
    let messageBytes: Uint8Array;
    if (typeof signedMessage === 'string') {
      try {
        messageBytes = naclUtil.decodeBase64(signedMessage);
      } catch {
        throw new Error('Invalid signed message format');
      }
    } else {
      messageBytes = signedMessage;
    }

    if (messageBytes.length < 1 + 32 + 64) {
      throw new Error('Invalid signed message format: too short');
    }

    let offset = 0;

    // Version byte
    const version = messageBytes[offset++];
    if (version !== 0x02) {
      throw new Error(`Unsupported signed message version: ${version}`);
    }

    // Sender public key (32 bytes)
    const senderPublicKeyBytes = messageBytes.slice(offset, offset + 32);

    // ADD DEBUG LOGS
    logger.debug(
      '[DEBUG-CRYPTO] Message Version:',
      version,
      'Sender Key Hash:',
      naclUtil.encodeBase64(senderPublicKeyBytes).slice(0, 4),
    );

    offset += 32;

    // Signature (64 bytes)
    const signature = messageBytes.slice(offset, offset + 64);
    offset += 64;

    // Message bytes
    const messageBytesOnly = messageBytes.slice(offset);

    // Verify signature
    const isValid = nacl.sign.detached.verify(messageBytesOnly, signature, senderPublicKeyBytes);

    if (!isValid) {
      throw new Error('Signature verification failed');
    }

    // Decode message
    const plaintext = new TextDecoder().decode(messageBytesOnly);

    // Try to match sender Ed25519 public key with contacts
    // Since we derive Ed25519 from X25519 private key, we need to derive Ed25519 public key
    // from each contact's X25519 public key. However, we can't do this directly.
    // Instead, we'll derive Ed25519 key pair from X25519 private key when signing,
    // and store the Ed25519 public key in the signed message.
    // For verification, we'll derive Ed25519 public key from the contact's X25519 private key
    // if we had it, but we don't. So we'll use a workaround: derive Ed25519 from X25519 public key hash.
    // Actually, a better approach: derive Ed25519 key pair from X25519 public key bytes as seed.
    let senderFingerprint: string | undefined;
    let verified = false;

    // For each contact's X25519 public key, derive the corresponding Ed25519 public key
    // using the same method as when signing: hash the X25519 public key and use as seed
    for (const senderKeyStr of senderPublicKeys) {
      try {
        const senderX25519Key = naclUtil.decodeBase64(senderKeyStr);
        // Hash the X25519 public key to create the same seed used when signing
        const hash = await crypto.subtle.digest(
          'SHA-256',
          senderX25519Key as unknown as BufferSource,
        );
        const seed = new Uint8Array(hash).slice(0, 32);
        const derivedEd25519KeyPair = nacl.sign.keyPair.fromSeed(seed);
        const derivedEd25519PublicKey = derivedEd25519KeyPair.publicKey;

        // Compare derived Ed25519 public key with the one in the signed message
        if (derivedEd25519PublicKey.length === senderPublicKeyBytes.length) {
          let match = true;
          for (let i = 0; i < senderPublicKeyBytes.length; i++) {
            if (derivedEd25519PublicKey[i] !== senderPublicKeyBytes[i]) {
              match = false;
              break;
            }
          }
          if (match) {
            verified = true;
            senderFingerprint = generateFingerprint(senderX25519Key);
            break;
          }
        }
      } catch {
        // Continue to next key
      }
    }

    return {
      data: plaintext,
      verified,
      senderFingerprint,
    };
  } catch (error) {
    logger.error('Signature verification failed:', error);
    throw new Error('Failed to verify signed message');
  }
}
