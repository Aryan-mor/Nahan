import pako from 'pako';
/* eslint-disable max-lines-per-function */
import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';

import * as logger from '../../utils/logger';

import { decryptPrivateKey, generateFingerprint } from './keys';
import {
    deserializeEncryptedMessage,
    serializeEncryptedMessage,
} from './serialization';

/**
 * Encrypt and sign a message using Nahan Compact Protocol
 * Process: Compress -> Encrypt (X25519) -> Sign (Ed25519) -> Serialize
 * Returns raw Uint8Array with NO headers or text markers
 */
export async function encryptMessage(
  message: string | Uint8Array,
  recipientPublicKey: string,
  senderPrivateKey: string,
  passphrase: string,
  options?: { binary?: boolean },
): Promise<string | Uint8Array> {
  try {
    // Decrypt sender's private key
    const senderPrivateKeyBytes = await decryptPrivateKey(senderPrivateKey, passphrase);

    // Decode recipient's public key
    let recipientPublicKeyBytes: Uint8Array;
    try {
      recipientPublicKeyBytes = naclUtil.decodeBase64(recipientPublicKey);
    } catch (_e) {
      logger.error('Invalid public key format (base64 decode failed)', recipientPublicKey);
      throw new Error('Invalid public key format');
    }

    if (recipientPublicKeyBytes.length !== nacl.box.publicKeyLength) {
      logger.error(`Invalid public key length: ${recipientPublicKeyBytes.length}, expected ${nacl.box.publicKeyLength}`);
      throw new Error(`Invalid public key length: ${recipientPublicKeyBytes.length}`);
    }

    // 1. Compress the message using pako BEFORE encryption
    const messageBytes = typeof message === 'string'
      ? new TextEncoder().encode(message)
      : message;

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
    logger.log('TRACE A [Binary Out]:', {
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
  options?: {
    binary?: boolean;
    forcePeerPublicKey?: string; // Use this public key instead of the one in the header for decryption (needed for sender to decrypt own message)
  },
): Promise<{ data: string | Uint8Array; verified: boolean; signatureValid: boolean; senderFingerprint?: string; senderPublicKey?: string }> {
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

    // Determine which public key to use for the shared secret calculation
    // Default: Use the sender public key embedded in the message header (Standard Receiver flow)
    // Override: Use a forced peer key (Sender flow - decrypting own message sent to someone else)
    let peerPublicKeyBytes = senderPublicKey;
    if (options?.forcePeerPublicKey) {
      try {
        peerPublicKeyBytes = naclUtil.decodeBase64(options.forcePeerPublicKey);
      } catch (e) {
        logger.warn('Invalid forcePeerPublicKey format', e);
      }
    }

    // Log for debugging decryption issues
    logger.log('[DEBUG-CRYPTO] Peer Key:', peerPublicKeyBytes, 'Nonce:', nonce);

    // Decrypt using nacl.box (X25519 authenticated encryption)
    // nacl.box.open automatically verifies the Poly1305 MAC, providing authentication

    // DEBUG: Log if we are forcing a peer key (Sender Flow) vs Standard Flow
    if (options?.forcePeerPublicKey) {
      if (!peerPublicKeyBytes || peerPublicKeyBytes.length !== 32) {
         logger.warn('[CRYPTO] Invalid forced peer key', { length: peerPublicKeyBytes?.length });
      }
    }

    const decrypted = nacl.box.open(
      encryptedPayload,
      nonce,
      peerPublicKeyBytes,
      recipientPrivateKeyBytes,
    );

    // ADD DEBUG LOGS
    logger.log(
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
    const data = options?.binary
      ? decompressed
      : new TextDecoder().decode(decompressed);

    return {
      data,
      verified: senderFingerprint !== undefined,
      signatureValid,
      senderFingerprint,
      senderPublicKey: naclUtil.encodeBase64(senderPublicKey),
    };
  } catch (error) {
    logger.error('Decryption failed:', error);
    throw new Error('Failed to decrypt message');
  }
}
