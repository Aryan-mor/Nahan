/* eslint-disable max-lines-per-function */
import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';

import * as logger from '../../utils/logger';

import { decryptPrivateKey, generateFingerprint } from './keys';
import { deserializeSignedMessage, serializeSignedMessage } from './serialization';

const getCrypto = () => {
  if (typeof crypto !== 'undefined' && crypto.subtle) return crypto;
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) return window.crypto;
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) return globalThis.crypto;
  
  logger.error('Crypto API Debug:', {
    hasCrypto: typeof crypto !== 'undefined',
    hasWindow: typeof window !== 'undefined',
    hasWindowCrypto: typeof window !== 'undefined' && !!window.crypto,
    hasGlobalThis: typeof globalThis !== 'undefined',
    hasGlobalThisCrypto: typeof globalThis !== 'undefined' && !!globalThis.crypto,
    cryptoSubtle: typeof crypto !== 'undefined' ? !!crypto.subtle : false,
  });
  
  throw new Error('Crypto API not available');
};

/**
 * Sign a message using Ed25519 signing
 * For broadcast messages: signs the message without encryption
 * Returns signed message in format: [Version (1)] [Sender Public Key (32)] [Signature (64)] [Message Bytes]
 */
export async function signMessage(
  message: string | Uint8Array,
  senderPrivateKey: string,
  passphrase: string,
  options?: { binary?: boolean },
): Promise<string | Uint8Array> {
  try {
    logger.log('[DEBUG] signMessage start');
    // Decrypt sender's private key
    const rawSenderPrivateKeyBytes = await decryptPrivateKey(senderPrivateKey, passphrase);
    const senderPrivateKeyBytes = rawSenderPrivateKeyBytes instanceof Uint8Array 
      ? rawSenderPrivateKeyBytes 
      : new Uint8Array(rawSenderPrivateKeyBytes);

    // Generate Ed25519 signing key pair for broadcast messages
    // We derive Ed25519 from X25519 public key (not private key) so both sender and receiver
    // can derive the same Ed25519 public key. We hash the X25519 public key to get the seed.
    const senderX25519KeyPair = nacl.box.keyPair.fromSecretKey(senderPrivateKeyBytes);
    const senderX25519PublicKey = senderX25519KeyPair.publicKey;

    // Hash the X25519 public key to create a deterministic seed for Ed25519
    // This ensures both sender and receiver can derive the same Ed25519 public key
    const cryptoApi = getCrypto();
    
    const hash = await cryptoApi.subtle.digest(
      'SHA-256',
      senderX25519PublicKey, // Uint8Array is a BufferSource
    );
    
    const seed = new Uint8Array(hash).slice(0, 32);
    const signingKeyPair = nacl.sign.keyPair.fromSeed(seed);

    // Encode message to bytes
    const messageBytes = typeof message === 'string'
      ? new TextEncoder().encode(message)
      : message;

    // Sign the message using Ed25519
    // Ensure we have valid Uint8Arrays for nacl
    const safeMessageBytes = messageBytes instanceof Uint8Array ? messageBytes : new Uint8Array(messageBytes);
    const safeSecretKey = signingKeyPair.secretKey instanceof Uint8Array ? signingKeyPair.secretKey : new Uint8Array(signingKeyPair.secretKey);
    
    const signature = nacl.sign.detached(safeMessageBytes, safeSecretKey);

    // Get sender's public key for serialization
    const senderPublicKeyBytes = signingKeyPair.publicKey;

    // Serialize
    const serialized = serializeSignedMessage(senderPublicKeyBytes, signature, messageBytes);

    if (options?.binary) {
      return serialized;
    }

    // Encode as base64 for non-binary mode
    return naclUtil.encodeBase64(serialized);
  } catch (error) {
    logger.error('Signing failed:', error);
    const err = error instanceof Error ? error : new Error(String(error));
    const debugInfo = {
        msg: err.message,
        stack: err.stack,
    };
    throw new Error(`Failed to sign message: ${JSON.stringify(debugInfo)}`);
  }
}

/**
 * Verify a signed message
 * Returns the plaintext message and verification status
 */
export async function verifySignedMessage(
  signedMessage: string | Uint8Array,
  senderPublicKeys: string[] = [],
  options?: { binary?: boolean },
): Promise<{ data: string | Uint8Array; verified: boolean; senderFingerprint?: string; senderPublicKey?: string }> {
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

    const {
      senderPublicKey: senderPublicKeyBytes,
      signature,
      messageBytes: messageBytesOnly,
      version,
    } = deserializeSignedMessage(messageBytes);

    // ADD DEBUG LOGS
    logger.log(
      '[DEBUG-CRYPTO] Message Version:',
      version,
      'Sender Key Hash:',
      naclUtil.encodeBase64(senderPublicKeyBytes).slice(0, 4),
    );

    // Verify signature
    const isValid = nacl.sign.detached.verify(messageBytesOnly, signature, senderPublicKeyBytes);

    if (!isValid) {
      throw new Error('Signature verification failed');
    }

    // Decode message
    const data = options?.binary 
      ? messageBytesOnly 
      : new TextDecoder().decode(messageBytesOnly);

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
        const hash = await getCrypto().subtle.digest(
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
      data,
      verified,
      senderFingerprint,
      senderPublicKey: naclUtil.encodeBase64(senderPublicKeyBytes),
    };
  } catch (error) {
    logger.error('Signature verification failed:', error);
    throw new Error('Failed to verify signed message');
  }
}
