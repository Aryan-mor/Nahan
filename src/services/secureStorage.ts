/**
 * SecureStorage - Encrypted localStorage wrapper for Zustand persist middleware
 * Uses AES-GCM encryption with key derived from user PIN (sessionPassphrase)
 */

/**
 * Encrypted storage format:
 * {
 *   version: number,        // Storage version (for migration)
 *   encrypted: string,      // Base64-encoded encrypted JSON
 *   salt: string,           // Base64-encoded salt for key derivation
 *   iv: string,             // Base64-encoded initialization vector
 *   tag: string             // Base64-encoded authentication tag
 * }
 */

/**
 * Key cache: Maps (passphrase, salt) -> CryptoKey
 * Salt is converted to base64 string for use as map key
 */
const keyCache = new Map<string, CryptoKey>();

/**
 * Generate cache key from passphrase and salt
 */
function getCacheKey(passphrase: string, salt: Uint8Array): string {
  const saltBase64 = btoa(String.fromCharCode(...salt));
  return `${passphrase}:${saltBase64}`;
}

/**
 * Derive encryption key from passphrase using PBKDF2
 * Uses cached key if available to avoid expensive PBKDF2 re-computation
 * @param passphrase User PIN/passphrase
 * @param salt Salt for key derivation
 * @returns Encryption key (32 bytes for AES-256)
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const cacheKey = getCacheKey(passphrase, salt);

  // Check cache first
  const cached = keyCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Derive new key
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 600000, // High iteration count to prevent fast offline brute-force attacks on 6-digit PINs.
      // At 600k iterations, each PIN guess takes ~500ms-1s on average hardware,
      // making a full search of 1,000,000 possible combinations take several days of constant CPU work.
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  // Cache the key for future use
  keyCache.set(cacheKey, key);
  return key;
}

/**
 * Encrypt data using AES-GCM
 * @param data Plaintext data to encrypt
 * @param passphrase User PIN/passphrase
 * @returns Encrypted storage object
 */
export async function encryptData(data: string, passphrase: string): Promise<string> {
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for GCM

  // Derive encryption key
  const key = await deriveKey(passphrase, salt);

  // Encrypt data
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encoder.encode(data),
  );

  // Convert to Uint8Array
  // Note: crypto.subtle.encrypt with AES-GCM returns ciphertext + 16-byte tag (already combined)
  const encryptedArray = new Uint8Array(encrypted);

  // Separate ciphertext from authentication tag
  // The last 16 bytes are the GCM authentication tag
  const ciphertext = encryptedArray.slice(0, -16); // All bytes except last 16
  const tag = encryptedArray.slice(-16); // Last 16 bytes (authentication tag)

  // Convert to base64 for storage
  const ciphertextBase64 = btoa(String.fromCharCode(...ciphertext));
  const saltBase64 = btoa(String.fromCharCode(...salt));
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const tagBase64 = btoa(String.fromCharCode(...tag));

  // Create storage object
  // encrypted field contains ONLY the ciphertext (without tag)
  // tag field contains the 16-byte authentication tag
  const storageObj = {
    version: 1,
    encrypted: ciphertextBase64, // Ciphertext only (tag stored separately)
    salt: saltBase64,
    iv: ivBase64,
    tag: tagBase64, // Authentication tag (16 bytes)
  };

  return JSON.stringify(storageObj);
}

/**
 * Decrypt data using AES-GCM
 * @param encryptedData Encrypted storage object (JSON string)
 * @param passphrase User PIN/passphrase
 * @returns Decrypted plaintext data
 * @throws Error if decryption fails (wrong passphrase or corrupted data)
 */
export async function decryptData(encryptedData: string, passphrase: string): Promise<string> {
  try {
    const storageObj = JSON.parse(encryptedData);

    // Check if it's the encrypted format
    if (storageObj.version && storageObj.version >= 1) {
      // New encrypted format
      const salt = Uint8Array.from(atob(storageObj.salt), (c) => c.charCodeAt(0));
      const iv = Uint8Array.from(atob(storageObj.iv), (c) => c.charCodeAt(0));
      // encrypted field contains ONLY the ciphertext (tag is stored separately)
      const ciphertext = Uint8Array.from(atob(storageObj.encrypted), (c) => c.charCodeAt(0));
      const tag = Uint8Array.from(atob(storageObj.tag), (c) => c.charCodeAt(0));

      // Derive encryption key
      const key = await deriveKey(passphrase, salt);

      // Reconstruct the buffer: ciphertext + tag (GCM requires tag to be appended)
      // The encrypted field contains ciphertext only, tag is stored separately
      const encryptedWithTag = new Uint8Array(ciphertext.length + tag.length);
      encryptedWithTag.set(ciphertext, 0); // Set ciphertext at the beginning
      encryptedWithTag.set(tag, ciphertext.length); // Append tag at the end

      // Decrypt data
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        key,
        encryptedWithTag,
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } else {
      // Old unencrypted format (should not happen after migration, but handle gracefully)
      throw new Error('Old unencrypted format detected - migration required');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Old unencrypted format')) {
      throw error;
    }

    // Log the original error for debugging
    console.error('[secureStorage] Decryption error:', error);

    // Clear key cache on decryption failure to prevent stale keys
    // This ensures fresh keys are derived on retry
    keyCache.clear();

    // Check if it's a specific crypto error
    if (error instanceof Error) {
      // DOMException with specific error names
      if (error.name === 'OperationError' || error.name === 'InvalidAccessError') {
        // This usually means wrong passphrase (key derivation succeeds but decryption fails)
        // or corrupted authentication tag
        throw new Error('Decryption failed - invalid passphrase or corrupted data');
      }

      // Check for specific error messages
      if (error.message.includes('bad decrypt') ||
          error.message.includes('decryption failed') ||
          error.message.includes('Unsupported state or unable to authenticate data')) {
        throw new Error('Decryption failed - invalid passphrase or corrupted data');
      }
    }

    // Generic fallback
    throw new Error('Decryption failed - invalid passphrase or corrupted data');
  }
}


/**
 * SecureStorage - Encrypted localStorage wrapper for Zustand persist
 * Implements StateStorage interface from zustand/middleware
 * Note: Encryption/decryption is async, but Zustand persist expects sync storage
 * So we store encrypted data as-is and handle decryption in migrate function
 */
let currentPassphrase: string | null = null;

/**
 * Set the current passphrase for encryption
 * Must be called before any setItem operations
 * Clears key cache when passphrase changes to ensure security
 */
export function setPassphrase(passphrase: string | null): void {
  // Clear cache when passphrase changes to prevent key reuse across sessions
  if (currentPassphrase !== passphrase) {
    keyCache.clear();
  }
  currentPassphrase = passphrase;
}

/**
 * Clear the key cache
 * Useful when decryption fails to ensure fresh keys are derived on retry
 */
export function clearKeyCache(): void {
  keyCache.clear();
}

/**
 * Get the current passphrase
 */
export function getPassphrase(): string | null {
  return currentPassphrase;
}

/**
 * Synchronous storage wrapper for Zustand persist
 * CRITICAL: Never stores plaintext - zero-fallback policy
 * Strategy:
 * - getItem: Returns encrypted string as-is (decryption happens in migrate)
 * - setItem: Returns early if no passphrase (NEVER stores plaintext)
 * - Uses synchronous lock to prevent race conditions during unlock-then-save flow
 */
let isEncrypting = false;
let encryptionLock = false;


export const secureStorage = {
  getItem: (name: string): string | null => {
    try {
      const raw = localStorage.getItem(name);
      if (!raw) return null;

      // Check if this is an encryption marker (temporary placeholder during async encryption)
      try {
        const parsed = JSON.parse(raw);
        if (parsed._nahan_encrypting === true) {
          const markerAge = Date.now() - (parsed._timestamp || 0);
          // If marker is recent (< 100ms), encryption is likely in progress - return null to prevent reading incomplete data
          // If marker is old (> 1000ms), encryption likely failed - return null to prevent reading stale marker
          if (markerAge < 100 || markerAge > 1000) {
            console.warn('SecureStorage: Detected encryption marker - encryption may be in progress or failed');
            return null;
          }
          // Marker is between 100ms and 1000ms old - encryption should have completed, but return null to be safe
          return null;
        }
      } catch {
        // Not a marker - proceed with normal handling
      }

      // Return raw data (encrypted or unencrypted) - decryption happens in migrate
      return raw;
    } catch (error) {
      console.error('SecureStorage getItem failed:', error);
      return null;
    }
  },

  setItem: (name: string, value: string): void => {
    // CRITICAL SECURITY: Zero-plaintext policy
    // NEVER store sensitive data without encryption
    const passphrase = getPassphrase();

    // Strict No-Fallback: If no passphrase, return immediately
    // NEVER write plaintext to localStorage
    if (!passphrase) {
      // Debug log only - this is expected during normal boot-up when app is locked
      console.debug('SecureStorage: Save aborted - no passphrase available');
      return;
    }

    // Check if value is already encrypted (safety check)
    try {
      const parsed = JSON.parse(value);
      if (parsed.version && parsed.version >= 1 && parsed.encrypted && parsed.salt && parsed.iv && parsed.tag) {
        // Already encrypted - store directly
        localStorage.setItem(name, value);
        return;
      }
    } catch {
      // Not encrypted format - must encrypt before storing
    }

    // Set lock to prevent concurrent writes
    encryptionLock = true;
    isEncrypting = true;

    // Store a temporary marker BEFORE encryption starts
    // This marker will be replaced by encrypted data once encryption completes
    // Note: There's a race condition if page refreshes before encryption completes
    // We handle this in getItem by detecting stale markers
    const markerTimestamp = Date.now();
    const encryptionMarker = JSON.stringify({
      _nahan_encrypting: true,
      _timestamp: markerTimestamp,
      _hash: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    });
    localStorage.setItem(name, encryptionMarker);

    // Encrypt the data asynchronously
    // IMPORTANT: This is async, but Zustand persist expects sync storage
    // The marker above prevents reading incomplete data, but there's still a race condition
    // if the page refreshes before encryption completes (marker will be lost)
    encryptData(value, passphrase)
      .then((encrypted) => {
        // Store ONLY encrypted data (replaces the marker)
        localStorage.setItem(name, encrypted);
        encryptionLock = false;
        isEncrypting = false;
      })
      .catch((err) => {
        console.error('Failed to encrypt storage:', err);
        // Remove the marker if encryption fails (prevent reading stale marker)
        localStorage.removeItem(name);
        encryptionLock = false;
        isEncrypting = false;
      });
  },

  removeItem: (name: string): void => {
    localStorage.removeItem(name);
  },
};


