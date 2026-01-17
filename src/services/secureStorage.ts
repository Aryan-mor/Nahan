/* eslint-disable max-lines */
import * as logger from '../utils/logger';

/**
 * SecureStorage - Encrypted localStorage wrapper
 * V2 Architecture: Master Key (MK) Encryption
 * - Data is encrypted with a random Master Key (MK).
 * - MK is encrypted (wrapped) with a KDF derived from PIN + WebAuthn Secret.
 * - This file manages the active MK and encryption ops.
 */

let _activeMasterKey: CryptoKey | null = null;
// let _encryptionLock = false; // Unused

// We still need to track if we have a key loaded
let _isKeyLoaded = false;

/**
 * Storage Format V2:
 * {
 *   version: 2,
 *   encrypted: string (base64 ciphertext),
 *   iv: string (base64 iv),
 *   tag: string (base64 tag),
 *   salt: string (base64 salt - used for diversification if needed, or strictly random)
 * }
 */

/**
 * Set the Master Key for the current session.
 * Called after unwrapping the key during login/unlock.
 */
export function setMasterKey(key: CryptoKey | null) {
  _activeMasterKey = key;
  _isKeyLoaded = !!key;
  if (!key) {
    logger.debug('[SecureStorage] Master Key cleared');
  } else {
    logger.debug('[SecureStorage] Master Key set');
  }
}

export function getMasterKey(): CryptoKey | null {
  return _activeMasterKey;
}

/**
 * Generate a new random Master Key (AES-GCM 256)
 */
export async function generateMasterKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // Extractable (must be able to wrap it)
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
  );
}

/**
 * Derive a Record Key using HKDF (SHA-256)
 * Output = HKDF(MasterKey, Salt, Info="RecordEncryption")
 */
async function deriveRecordKey(masterKey: CryptoKey, salt: Uint8Array): Promise<CryptoKey> {
  const mkRaw = await crypto.subtle.exportKey('raw', masterKey);
  const mkKeyMaterial = await crypto.subtle.importKey('raw', mkRaw, 'HKDF', false, ['deriveKey']);

  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: new TextEncoder().encode('RecordEncryption'),
    },
    mkKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt data using the currently loaded Master Key (Version 2)
 */
/**
 * Pure Encryption Utility (Worker Compatible)
 */
export async function encryptWithKey(data: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // V2.2: Mandatory random salt for future key diversification
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // V2.2: Derive Per-Record Key
  const recordKey = await deriveRecordKey(key, salt);

  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    recordKey,
    encoder.encode(data),
  );

  const encryptedArray = new Uint8Array(encrypted);
  // Separate tag (last 16 bytes)
  const ciphertext = encryptedArray.slice(0, -16);
  const tag = encryptedArray.slice(-16);

  const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const len = bytes.byteLength;
    const CHUNK_SIZE = 0x8000;
    for (let i = 0; i < len; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
  };

  const obj = {
    version: 2,
    encrypted: uint8ArrayToBase64(ciphertext),
    iv: btoa(String.fromCharCode(...iv)),
    tag: btoa(String.fromCharCode(...tag)),
    salt: btoa(String.fromCharCode(...salt)), // Stored for future diversification
  };

  return JSON.stringify(obj);
}

/**
 * Encrypt data using the currently loaded Master Key (Version 2)
 */
export async function encryptData(
  data: string,
  _legacyPassphraseIgnored?: string,
): Promise<string> {
  if (!_activeMasterKey) {
    throw new Error('Master Key not loaded - cannot encrypt');
  }
  return encryptWithKey(data, _activeMasterKey);
}

/**
 * Decrypt data using the Master Key (Strict V2)
 */
export async function decryptData(
  encryptedData: string,
  _legacyPassphraseIgnored?: string,
): Promise<string> {
  if (!_activeMasterKey) {
    throw new Error('Master Key not loaded - cannot decrypt');
  }
  return decryptWithKey(encryptedData, _activeMasterKey);
}

/**
 * Pure Decryption Utility (Worker Compatible)
 */
// eslint-disable-next-line max-lines-per-function
export async function decryptWithKey(encryptedData: string, key: CryptoKey): Promise<string> {
  const obj = JSON.parse(encryptedData);

  if (obj.version !== 2) {
    throw new Error(`Unsupported encryption version: ${obj.version}. Migration required.`);
  }

  // Optimized Base64 Decoding
  const fromBase64 = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const iv = fromBase64(obj.iv);
  const ciphertext = fromBase64(obj.encrypted);
  const tag = fromBase64(obj.tag);
  const salt = obj.salt ? fromBase64(obj.salt) : new Uint8Array(0);

  // V2.2: Re-derive Record Key if salt is present
  // If no salt (legacy V2.0/2.1), fallback to Master Key (Backward Compat if needed, but we are resetting DB)
  // Since we are resetting DB, we enforce salt presence.
  if (salt.length !== 16) {
    throw new Error('Invalid or missing salt in V2.2 record');
  }

  const recordKey = await deriveRecordKey(key, salt);

  const encryptedWithTag = new Uint8Array(ciphertext.length + tag.length);
  encryptedWithTag.set(ciphertext, 0);
  encryptedWithTag.set(tag, ciphertext.length);

  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      recordKey,
      encryptedWithTag,
    );

    return new TextDecoder().decode(decrypted);
  } catch (_) {
    throw new Error('Decryption failed');
  }
}

/**
 * KEY WRAPPING UTILITIES (For System Settings)
 */

// Worker instance for auth operations
let _authWorker: Worker | null = null;
const _pendingAuthRequests = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
>();

function getAuthWorker(): Worker {
  if (!_authWorker) {
    _authWorker = new Worker(new URL('../workers/auth.worker.ts', import.meta.url), {
      type: 'module',
    });
    _authWorker.onmessage = (event) => {
      const { id, success, data, error } = event.data;
      const request = _pendingAuthRequests.get(id);
      if (request) {
        _pendingAuthRequests.delete(id);
        if (success) {
          request.resolve(data);
        } else {
          request.reject(new Error(error));
        }
      }
    };
  }
  return _authWorker;
}

/**
 * Helper to manage dynamic salt
 */
function getOrGenerateSalt(): Uint8Array {
  // Worker Guard: Workers should not call this, but if imported, ensure we don't crash on parse
  if (typeof localStorage === 'undefined') {
    throw new Error('localStorage not available (Worker context?)');
  }

  const SALT_KEY = 'nahan_wrapper_salt';
  let saltBase64 = localStorage.getItem(SALT_KEY);

  if (!saltBase64) {
    // Generate 16-byte random salt
    const randomSalt = crypto.getRandomValues(new Uint8Array(16));
    // Convert to base64 for storage
    const binary = String.fromCharCode.apply(null, Array.from(randomSalt));
    saltBase64 = btoa(binary);
    localStorage.setItem(SALT_KEY, saltBase64);
    logger.debug('[SecureStorage] Generated new dynamic wrapper salt');
  }

  return Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));
}

/**
 * Derive a Key-Wrapping Key (KWK) from PIN + Hardware Secret
 * using PBKDF2 in a WORKER
 */
async function deriveWrapperKey(pin: string, hardwareSecret: Uint8Array): Promise<CryptoKey> {
  const salt = getOrGenerateSalt();
  const worker = getAuthWorker();

  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    _pendingAuthRequests.set(id, {
      resolve: async (jwk: JsonWebKey) => {
        // Import the JWK back to a CryptoKey on the main thread
        try {
          const key = await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'AES-KW', length: 256 },
            false,
            ['wrapKey', 'unwrapKey'],
          );
          resolve(key);
        } catch (e) {
          reject(e);
        }
      },
      reject,
    });

    worker.postMessage({
      id,
      type: 'deriveWrapperKey',
      payload: {
        pin,
        hardwareSecret,
        salt,
      },
    });
  });
}

/**
 * Generate a Blind Index for metadata obfuscation
 * Uses HMAC-SHA256(MasterKey, input)
 */
export async function generateBlindIndex(input: string): Promise<string> {
  if (!_activeMasterKey) {
    throw new Error('Master Key not loaded - cannot generate blind index');
  }

  try {
    // 1. Export Master Key raw bytes
    const mkRaw = await crypto.subtle.exportKey('raw', _activeMasterKey);

    // 2. Import as HMAC key
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      mkRaw,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    // 3. Sign the input
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(input));

    // 4. Return as hex string
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    logger.error('Failed to generate blind index:', error);
    throw new Error('Blind indexing failed');
  }
}

/**
 * Wrap the Master Key for storage
 */
export async function wrapMasterKey(
  masterKey: CryptoKey,
  pin: string,
  hardwareSecret: Uint8Array,
): Promise<string> {
  const wrapperKey = await deriveWrapperKey(pin, hardwareSecret);

  const wrappedIndex = await crypto.subtle.wrapKey('raw', masterKey, wrapperKey, 'AES-KW');

  return btoa(String.fromCharCode(...new Uint8Array(wrappedIndex)));
}

/**
 * Unwrap the Master Key from storage
 */
export async function unwrapMasterKey(
  wrappedKeyBase64: string,
  pin: string,
  hardwareSecret: Uint8Array,
): Promise<CryptoKey> {
  const wrapperKey = await deriveWrapperKey(pin, hardwareSecret);
  const wrappedKey = Uint8Array.from(atob(wrappedKeyBase64), (c) => c.charCodeAt(0));

  return await crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    wrapperKey,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
  );
}

// --------------------------------------------------------------------------
// LEGACY HELPERS (TEMPORARY FOR MIGRATION)
// --------------------------------------------------------------------------

/**
 * Legacy V1 Decryption (PIN only)
 * Kept strictly for the one-time migration process.
 */
export async function decryptLegacyData(
  encryptedData: string,
  passphrase: string,
): Promise<string> {
  // Copy of the old derived key logic
  const deriveLegacyKey = async (passphrase: string, salt: Uint8Array) => {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
  };

  try {
    const obj = JSON.parse(encryptedData);
    // If it's already V2, this function fails (intended)
    if (obj.version && obj.version !== 1) throw new Error('Not V1 data');

    const salt = Uint8Array.from(atob(obj.salt), (c) => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(obj.iv), (c) => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(obj.encrypted), (c) => c.charCodeAt(0));
    const tag = Uint8Array.from(atob(obj.tag), (c) => c.charCodeAt(0));

    const key = await deriveLegacyKey(passphrase, salt);

    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext, 0);
    combined.set(tag, ciphertext.length);

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined);

    return new TextDecoder().decode(decrypted);
  } catch (_e) {
    throw new Error('Legacy decryption failed');
  }
}

// --------------------------------------------------------------------------
// ZUSTAND WRAPPER
// --------------------------------------------------------------------------

export const secureStorage = {
  getItem: (name: string): string | null => {
    return localStorage.getItem(name);
  },

  setItem: (name: string, value: string): Promise<void> => {
    if (!_activeMasterKey) {
      logger.debug('SecureStorage: Save aborted - Master Key not loaded');
      return Promise.resolve();
    }

    try {
      const parsed = JSON.parse(value);
      if (parsed.version === 2) {
        localStorage.setItem(name, value);
        return Promise.resolve();
      }
    } catch {
      // Not encrypted
    }

    // Encrypt async and return promise so Zustand can await it
    return encryptData(value).then((encrypted) => {
      localStorage.setItem(name, encrypted);
    });
  },

  removeItem: (name: string): void => {
    localStorage.removeItem(name);
  },
};

// Re-export specific functions for direct usage
export function setPassphrase(_p: string | null) {
  // Legacy compatibility: Does nothing in V2 mode as we use setMasterKey
  // But we might want to warn if used
}

export function clearKeyCache() {
  setMasterKey(null);
}
