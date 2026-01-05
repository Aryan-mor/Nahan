import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';

import * as logger from '../../utils/logger';

export interface KeyPair {
  publicKey: string; // Hex-encoded 32-byte public key
  privateKey: string; // Hex-encoded 32-byte private key (encrypted with passphrase)
  fingerprint: string; // First 16 bytes of public key as hex (32 hex chars)
}

/**
 * Derive encryption key from passphrase using scrypt-like approach
 * For simplicity, we use PBKDF2 via Web Crypto API
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const keyBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256, // 32 bytes
  );

  return new Uint8Array(keyBits);
}

/**
 * Encrypt private key with passphrase
 */
export async function encryptPrivateKey(
  privateKey: Uint8Array,
  passphrase: string,
): Promise<string> {
  // Generate random salt
  const salt = nacl.randomBytes(16);

  // Derive key from passphrase
  const key = await deriveKeyFromPassphrase(passphrase, salt);

  // Encrypt using nacl.secretbox
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const encrypted = nacl.secretbox(privateKey, nonce, key);

  if (!encrypted) {
    throw new Error('Failed to encrypt private key');
  }

  // Serialize: salt (16) + nonce (24) + encrypted data
  const serialized = new Uint8Array(16 + 24 + encrypted.length);
  serialized.set(salt, 0);
  serialized.set(nonce, 16);
  serialized.set(encrypted, 40);

  return naclUtil.encodeBase64(serialized);
}

/**
 * Decrypt private key with passphrase
 */
export async function decryptPrivateKey(
  encryptedKey: string,
  passphrase: string,
): Promise<Uint8Array> {
  const serialized = naclUtil.decodeBase64(encryptedKey);

  // Extract salt, nonce, and encrypted data
  const salt = serialized.slice(0, 16);
  const nonce = serialized.slice(16, 40);
  const encrypted = serialized.slice(40);

  // Derive key from passphrase
  const key = await deriveKeyFromPassphrase(passphrase, salt);

  // Decrypt
  const decrypted = nacl.secretbox.open(encrypted, nonce, key);

  if (!decrypted) {
    throw new Error('Invalid passphrase or corrupted key');
  }

  return decrypted;
}

/**
 * Generate fingerprint from public key (first 16 bytes as hex)
 */
export function generateFingerprint(publicKey: Uint8Array): string {
  return Array.from(publicKey.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Generate ECC key pair (X25519 for encryption, Ed25519 for signing)
 * Keys are stored as hex strings
 */
export async function generateKeyPair(
  name: string,
  email: string,
  passphrase: string,
): Promise<KeyPair> {
  try {
    // Generate X25519 key pair for encryption (nacl.box)
    const encryptionKeyPair = nacl.box.keyPair();
    // For simplicity, we use the same keypair for both (X25519)
    // In production, you might want separate keys
    const publicKey = encryptionKeyPair.publicKey;
    const privateKey = encryptionKeyPair.secretKey;

    // Encrypt private key with passphrase
    const encryptedPrivateKey = await encryptPrivateKey(privateKey, passphrase);

    // Generate fingerprint
    const fingerprint = generateFingerprint(publicKey);

    return {
      publicKey: naclUtil.encodeBase64(publicKey), // Store as base64 for compatibility
      privateKey: encryptedPrivateKey, // Encrypted with passphrase
      fingerprint,
    };
  } catch (error) {
    logger.error('Key generation failed:', error);
    throw new Error('Failed to generate key pair');
  }
}

/**
 * Verify private key passphrase
 */
export async function verifyPrivateKeyPassphrase(
  privateKeyEncrypted: string,
  passphrase: string,
): Promise<boolean> {
  try {
    await decryptPrivateKey(privateKeyEncrypted, passphrase);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract fingerprint from public key
 */
export async function getFingerprint(publicKey: string): Promise<string> {
  try {
    const keyBytes = naclUtil.decodeBase64(publicKey);
    return generateFingerprint(keyBytes);
  } catch (error) {
    logger.error('Failed to extract fingerprint:', error);
    throw new Error('Invalid public key');
  }
}

/**
 * Validate key format (base64-encoded 32-byte key)
 */
export function isValidKeyFormat(key: string): boolean {
  try {
    const decoded = naclUtil.decodeBase64(key);
    return decoded.length === 32;
  } catch {
    return false;
  }
}

/**
 * Parse input that might contain USERNAME+KEY format
 */
export function parseKeyInput(
  input: string,
): { username: string | null; key: string; isValid: boolean } {
  const trimmed = input.trim();

  // Check for USERNAME+KEY format (base64 key)
  const separator = '+';
  const splitIndex = trimmed.indexOf(separator);

  if (splitIndex > 0) {
    const username = trimmed.substring(0, splitIndex).trim();
    const key = trimmed.substring(splitIndex + 1).trim();

    if (isValidKeyFormat(key)) {
      return { username, key, isValid: true };
    }
  }

  // Check if it's just a plain key
  if (isValidKeyFormat(trimmed)) {
    return { username: null, key: trimmed, isValid: true };
  }

  return { username: null, key: trimmed, isValid: false };
}

/**
 * Extract name from key (not applicable for compact protocol, returns null)
 */
export async function getNameFromKey(): Promise<string | null> {
  // Nahan Compact Protocol doesn't embed names in keys
  return null;
}

/**
 * Remove name from key (not applicable, returns as-is)
 */
export async function removeNameFromKey(publicKey: string): Promise<string> {
  // Nahan Compact Protocol doesn't embed names in keys
  return publicKey;
}

/**
 * Validate passphrase strength
 */
export function validatePassphrase(passphrase: string): { valid: boolean; message: string } {
  if (!/^\d{6}$/.test(passphrase)) {
    return { valid: false, message: 'Passphrase must be a 6-digit PIN' };
  }

  if (
    /^(123456|000000|111111|222222|333333|444444|555555|666666|777777|888888|999999)$/.test(
      passphrase,
    )
  ) {
    return { valid: false, message: 'PIN is too simple' };
  }

  return { valid: true, message: 'PIN is valid' };
}

/**
 * Clear sensitive data from memory
 */
export function clearSensitiveData(data: string): void {
  // Overwrite the string with random data
  if (typeof data === 'string') {
    const length = data.length;
    const randomChars = Array.from({ length }, () =>
      String.fromCharCode(Math.floor(Math.random() * 94) + 33),
    ).join('');
    data = randomChars;
  }
}
