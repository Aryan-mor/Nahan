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
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

/**
 * Encrypt data using the currently loaded Master Key (Version 2)
 */
export async function encryptData(data: string, _legacyPassphraseIgnored?: string): Promise<string> {
  if (!_activeMasterKey) {
    throw new Error('Master Key not loaded - cannot encrypt');
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    _activeMasterKey,
    encoder.encode(data)
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
    salt: '', // Not used for key derivation in V2 (Key is constant)
  };

  return JSON.stringify(obj);
}

/**
 * Decrypt data using the Master Key (Strict V2)
 */
export async function decryptData(encryptedData: string, _legacyPassphraseIgnored?: string): Promise<string> {
  if (!_activeMasterKey) {
    throw new Error('Master Key not loaded - cannot decrypt');
  }
  return decryptWithKey(encryptedData, _activeMasterKey);
}

/**
 * Pure Decryption Utility (Worker Compatible)
 */
export async function decryptWithKey(encryptedData: string, key: CryptoKey): Promise<string> {
  const obj = JSON.parse(encryptedData);

  if (obj.version !== 2) {
    throw new Error(`Unsupported encryption version: ${obj.version}. Migration required.`);
  }

  const iv = Uint8Array.from(atob(obj.iv), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(obj.encrypted), c => c.charCodeAt(0));
  const tag = Uint8Array.from(atob(obj.tag), c => c.charCodeAt(0));

  const encryptedWithTag = new Uint8Array(ciphertext.length + tag.length);
  encryptedWithTag.set(ciphertext, 0);
  encryptedWithTag.set(tag, ciphertext.length);

  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      encryptedWithTag
    );

    return new TextDecoder().decode(decrypted);
  } catch (_) {
    throw new Error('Decryption failed');
  }
}

/**
 * KEY WRAPPING UTILITIES (For System Settings)
 */

/**
 * Derive a Key-Wrapping Key (KWK) from PIN + Hardware Secret
 * using PBKDF2
 */
async function deriveWrapperKey(pin: string, hardwareSecret: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const pinBuffer = encoder.encode(pin);

  // Combine PIN and Hardware Secret
  const combinedMaterial = new Uint8Array(pinBuffer.length + hardwareSecret.length);
  combinedMaterial.set(pinBuffer, 0);
  combinedMaterial.set(hardwareSecret, pinBuffer.length);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    combinedMaterial,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Use a fixed salt for the wrapper key (we rely on the hardware secret for entropy)
  // Or we could store a salt too. Let's use a static salt for simplicity + hardware strength.
  const salt = encoder.encode('nahan-wrapper-salt-v1');

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-KW', length: 256 }, // AES-KW for wrapping
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * Wrap the Master Key for storage
 */
export async function wrapMasterKey(
  masterKey: CryptoKey,
  pin: string,
  hardwareSecret: Uint8Array
): Promise<string> {
  const wrapperKey = await deriveWrapperKey(pin, hardwareSecret);

  const wrappedIndex = await crypto.subtle.wrapKey(
    'raw',
    masterKey,
    wrapperKey,
    'AES-KW'
  );

  return btoa(String.fromCharCode(...new Uint8Array(wrappedIndex)));
}

/**
 * Unwrap the Master Key from storage
 */
export async function unwrapMasterKey(
  wrappedKeyBase64: string,
  pin: string,
  hardwareSecret: Uint8Array
): Promise<CryptoKey> {
  const wrapperKey = await deriveWrapperKey(pin, hardwareSecret);
  const wrappedKey = Uint8Array.from(atob(wrappedKeyBase64), c => c.charCodeAt(0));

  return await crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    wrapperKey,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

// --------------------------------------------------------------------------
// LEGACY HELPERS (TEMPORARY FOR MIGRATION)
// --------------------------------------------------------------------------

/**
 * Legacy V1 Decryption (PIN only)
 * Kept strictly for the one-time migration process.
 */
export async function decryptLegacyData(encryptedData: string, passphrase: string): Promise<string> {
   // Copy of the old derived key logic
   const deriveLegacyKey = async (passphrase: string, salt: Uint8Array) => {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      return await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
   };

   try {
     const obj = JSON.parse(encryptedData);
     // If it's already V2, this function fails (intended)
     if (obj.version && obj.version !== 1) throw new Error('Not V1 data');

     const salt = Uint8Array.from(atob(obj.salt), c => c.charCodeAt(0));
     const iv = Uint8Array.from(atob(obj.iv), c => c.charCodeAt(0));
     const ciphertext = Uint8Array.from(atob(obj.encrypted), c => c.charCodeAt(0));
     const tag = Uint8Array.from(atob(obj.tag), c => c.charCodeAt(0));

     const key = await deriveLegacyKey(passphrase, salt);

     const combined = new Uint8Array(ciphertext.length + tag.length);
     combined.set(ciphertext, 0);
     combined.set(tag, ciphertext.length);

     const decrypted = await crypto.subtle.decrypt(
       { name: 'AES-GCM', iv },
       key,
       combined
     );

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
    return encryptData(value).then(encrypted => {
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
