# Nahan Security Documentation

This document provides a comprehensive overview of Nahan's security architecture, encryption mechanisms, and privacy guarantees.

## Table of Contents

1. [Cryptographic Stack](#cryptographic-stack)
2. [Storage Security](#storage-security)
3. [Stealth Mode & Steganography](#stealth-mode--steganography)
4. [Key Management](#key-management)
5. [Zero Metadata Policy](#zero-metadata-policy)
6. [Self-Detection Prevention](#self-detection-prevention)
7. [Secure Boot Flow](#secure-boot-flow)
8. [Threat Model](#threat-model)

## Cryptographic Stack

### Nahan Compact Protocol

Nahan uses a custom, lightweight protocol built on `tweetnacl` instead of OpenPGP:

- **Encryption:** X25519 (Elliptic Curve Diffie-Hellman)
- **Signing:** Ed25519 (Edwards-curve Digital Signature Algorithm)
- **Key Size:** 32 bytes (256 bits) for both public and private keys

**Message Format:**
```
[Version (1 byte: 0x01)]
[Nonce (24 bytes)]
[Sender Public Key (32 bytes)]
[Encrypted Payload (variable)]
```

- **No Text Headers:** Binary-only format prevents metadata leakage
- **AEAD:** `tweetnacl.box()` provides authenticated encryption (no separate signature needed)
- **Compression:** `pako.deflate()` applied before encryption to reduce payload size

### Key Derivation (PBKDF2)

User PINs are used to derive encryption keys via PBKDF2:

- **Algorithm:** PBKDF2 with SHA-256
- **Iterations:** 600,000 (high iteration count to prevent fast offline brute-force attacks)
- **Salt:** 16 random bytes per encryption
- **Key Length:** 256 bits (32 bytes)

**Security Rationale:**
- 6-digit PIN has 1,000,000 possible combinations
- With 600,000 iterations, each guess takes ~500ms-1s on average hardware
- Full brute-force search would take several days of constant CPU work
- Makes offline attacks computationally expensive

### Storage Encryption (AES-GCM)

Sensitive data in `localStorage` is encrypted using AES-GCM:

- **Algorithm:** AES-256-GCM
- **IV Size:** 12 bytes (96 bits)
- **Authentication Tag:** 16 bytes (128 bits)
- **Key Derivation:** PBKDF2 (600,000 iterations) from user PIN

**Storage Format:**
```json
{
  "version": 1,
  "encrypted": "<base64-ciphertext>",
  "salt": "<base64-salt>",
  "iv": "<base64-iv>",
  "tag": "<base64-authentication-tag>"
}
```

**Important:** The ciphertext and authentication tag are stored separately to prevent corruption during decryption.

## Storage Security

### Single-Vault Architecture (IndexedDB)

All sensitive data is stored in a single `secure_vault` table:

**Database Schema:**
- **Name:** `nahan_secure_v1`
- **Table:** `secure_vault`
- **Columns:**
  - `id` (string, primary key)
  - `payload` (encrypted string)

**Zero Metadata Policy:**
- No readable names, emails, or message snippets in database
- All data encrypted before storage
- Standardized IDs prevent metadata inference:
  - Identity: `user_identity`
  - Contacts: `con_{uuid}`
  - Messages: `msg_{uuid}`

**Encryption Process:**
1. Object serialized to JSON
2. Encrypted with `sessionPassphrase` using `encryptData()` from `secureStorage.ts`
3. Stored as encrypted blob in `payload` column
4. Decryption happens on read using `decryptData()`

### Store Separation

**Sensitive Store (`useAppStore`):**
- **Storage Key:** `nahan-secure-data`
- **Encryption:** AES-GCM via `secureStorage` wrapper
- **Persisted Fields:** `identity`, `contacts` only
- **Never Persisted:** `sessionPassphrase`, `activeChat`, `messages`

**UI Store (`useUIStore`):**
- **Storage Key:** `nahan-ui-storage`
- **Encryption:** None (non-sensitive data)
- **Persisted Fields:** `language`, `camouflageLanguage`, `isLocked`, `failedAttempts`, `isStandalone`, `activeTab`, `theme`

**Rationale:** Separation allows app to boot and show lock screen without requiring passphrase, while ensuring sensitive data is always encrypted.

## Stealth Mode & Steganography

### Unicode Tags Block (Plane 14)

Nahan uses Unicode Tags from Plane 14 for steganography:

- **Palette:** 16 consecutive characters from `\u{E0021}` to `\u{E0030}`
- **Base-16 Mapping:** 4 bits per invisible character (1 tag per 4 bits of data)
- **Encoding:** Binary → Base-16 → Unicode Tags → Embedded in cover text
- **Decoding:** Extract Tags → Base-16 decode → Binary

**Why Tags Block?**
- Stable across platforms (not stripped by OS/clipboard)
- Non-printing (invisible to users)
- High density (16 characters = 4 bits each = 64 possible values)
- Survives copy/paste operations

### Stealth Safety Calculation

Safety ratio determines how well-hidden the data is:

```
Safety Ratio = (Cover Text Length / (Payload Size * 2)) * 100
```

- **Green Zone (80%+):** Safe to send, no warnings
- **Orange Zone (60-80%):** Acceptable, minor warning
- **Red Zone (<60%):** Blocked for auto-stealth, manual override with warning

**Protocol Overhead:**
- Version byte: 1 byte
- Nonce: 24 bytes
- Sender public key: 32 bytes
- Compression overhead: ~10-20%
- Total: ~57 bytes + compressed payload

### Cover Text Selection

**Best-Fit Pool Algorithm:**
1. Calculate required visible characters: `(tagString.length / 2) + 5% buffer`
2. Filter poetry database for poems with `totalLength >= requiredChars`
3. Sort candidates by length (ascending)
4. Randomly select from top 5-10 smallest candidates
5. Extract only full verses to meet requirement (never break verses)

**Language Support:**
- Persian (`fa`): 100+ poems from classical Persian poetry
- English (`en`): 100+ poems from English literature
- Short poems prioritized for small payloads

### RTL-Aware Injection

For Persian/Arabic text, ZWCs are injected at "safe-to-break" positions:
- After spaces
- After non-joining letters (`ا`, `د`, `ذ`, `ر`, `ز`, `ژ`, `و`)
- After punctuation (`.`, `،`, `؟`, `!`)

This preserves cursive joining and prevents visual artifacts.

## Key Management

### Identity Generation

1. User creates 6-digit PIN during onboarding
2. `CryptoService.generateKeyPair()` creates Ed25519 keypair
3. Private key encrypted with PIN using `encryptPrivateKey()`
4. Identity stored in vault with encrypted private key
5. Public key and fingerprint derived and stored

### Key Exchange

**Stealth ID Sharing:**
- Contact information encoded as: `ID|name|publicKey`
- Compressed with `pako.deflate()`
- Prefixed with packet type byte (`0x02`)
- Embedded in short poetry using steganography
- Recipient extracts and adds contact automatically

**Detection:**
- Clipboard observer detects Nahan messages/IDs
- Extracts packet type byte to distinguish message (`0x01`) from ID (`0x02`)
- Auto-imports messages, prompts for ID confirmation

### PIN Verification

1. User enters PIN on lock screen
2. `unlockApp(pin)` called
3. Vault entry decrypted with PIN attempt to get identity structure
4. `verifyPrivateKeyPassphrase()` verifies PIN against encrypted private key
5. If valid: `setPassphrase(pin)` enables encryption layer
6. Identity and contacts decrypted and loaded into state
7. App unlocks

## Zero Metadata Policy

### What is Zero Metadata?

No readable information about users, contacts, or messages is stored in plaintext anywhere:

- **IndexedDB:** Only encrypted blobs with unreadable IDs
- **LocalStorage:** Only encrypted JSON strings
- **Memory:** Decrypted data only exists during active session
- **Network:** No network calls (100% offline)

### Implementation

1. **Database:** Single vault table, all payloads encrypted
2. **Store Persistence:** Sensitive fields encrypted before persistence
3. **Message Storage:** Plaintext only in memory, encrypted in database
4. **Contact Storage:** Names/emails encrypted in vault payloads

## Self-Detection Prevention

### Problem
When a user copies their own Stealth ID, the clipboard observer might detect it as a new contact.

### Solution

**Fingerprint Comparison:**
1. When ID packet detected, extract public key
2. Generate fingerprint from detected public key: `getFingerprint(publicKey)`
3. Compare with user's own identity fingerprint
4. If match: Silently ignore (no modal shown)
5. If mismatch: Proceed with "New Contact Detected" modal

**Implementation Locations:**
- `src/hooks/useClipboardDetection.ts`: Compares fingerprints before calling `onDetection`
- `src/App.tsx`: Additional safety check in `handleDetection` callback

## Secure Boot Flow

### Initialization Sequence

1. **App Boot:**
   - `initializeApp()` called
   - Old unencrypted `localStorage` key removed (`nahan-storage`)
   - IndexedDB initialized
   - Check if identity exists in vault (without requiring passphrase)

2. **Identity Detection:**
   - If identity exists: Set placeholder identity, lock app, show Lock Screen
   - If no identity: Show Onboarding screen

3. **Unlock Flow:**
   - User enters PIN
   - `unlockApp(pin)` verifies PIN
   - `setPassphrase(pin)` enables encryption layer
   - Vault entries decrypted with PIN
   - Identity and contacts loaded into state
   - App unlocks

4. **Session:**
   - `sessionPassphrase` stored in-memory only
   - All vault operations use `sessionPassphrase`
   - On lock: `sessionPassphrase` cleared, sensitive state cleared

### Migration Logic

**Old Storage Cleanup:**
- `localStorage.removeItem('nahan-storage')` called on every boot
- Ensures old unencrypted data is permanently deleted

**Database Migration:**
- On database version upgrade (< 2), old tables deleted:
  - `user_identity`
  - `contacts`
  - `messages`
- New `secure_vault` table created

## Threat Model

### Protected Against

1. **Device Theft:**
   - All data encrypted with user PIN
   - 600,000 PBKDF2 iterations make brute-force slow
   - No plaintext data in storage

2. **Metadata Leakage:**
   - Zero metadata policy: No readable names/emails in database
   - Encrypted payloads prevent inspection
   - Standardized IDs prevent inference

3. **Message Interception:**
   - End-to-end encryption (X25519)
   - Stealth mode hides messages in cover text
   - No network transmission (offline-only)

4. **Self-Detection:**
   - Fingerprint comparison prevents detecting own identity
   - Silent ignore for matching fingerprints

### Not Protected Against

1. **Malware on Device:**
   - If device is compromised, attacker can access decrypted data in memory
   - Mitigation: Lock app when not in use

2. **Physical Access + PIN Extraction:**
   - If attacker has device and can extract PIN (keylogger, shoulder surfing)
   - Mitigation: 6-digit PIN with high iteration count slows brute-force

3. **Cover Text Analysis:**
   - Advanced steganalysis might detect ZWCs in cover text
   - Mitigation: Safety ratio ensures sufficient cover text density

## Security Best Practices

1. **PIN Management:**
   - Use a strong 6-digit PIN (avoid patterns like 123456)
   - Don't share your PIN
   - Lock app when not in use

2. **Stealth Mode:**
   - Use longer cover text for better safety ratio
   - Avoid reusing cover text patterns
   - Verify safety ratio before sending

3. **Key Exchange:**
   - Verify contact fingerprints before trusting
   - Use Stealth ID sharing for secure key exchange
   - Don't share public keys in plaintext

4. **Data Backup:**
   - Export encrypted data regularly
   - Store export file securely (encrypted with strong password)
   - Never store export password with export file

## Compliance & Privacy

- **100% Offline:** No network calls, no data transmission
- **No Analytics:** No tracking, no telemetry, no data collection
- **No Third-Party Services:** All encryption/compression uses local libraries
- **Open Source:** Full source code available for audit
- **GPLv3 License:** Ensures code remains open and auditable

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly. Do not open public issues for security vulnerabilities.

