# Nahan Architecture Documentation (V2.2 - Schema Locked)

**Last Updated:** 2025-12-22
**Schema Version:** V2.2 (Finalized)

## 1. Overview

Nahan is a zero-metadata, offline-first secure communication vault. It uses a single-vault IndexedDB architecture where all records are encrypted and indexed using "Blind Indexes" to prevent metadata leakage.

## 2. Database Schema (V2.2)

The database structure is now **LOCKED**. No further breaking changes are allowed.

### 2.1 IndexedDB Structure

- **Database Name:** `nahan_secure_v1`
- **Version:** 5
- **Stores:**
  - `secure_vault`: Stores all encrypted entities (Identity, Contacts, Messages).
  - `system_settings`: Stores unencrypted app state (e.g., `is_onboarded`).

### 2.2 Record Identifiers (Blind Indexing)

To prevent metadata leakage through record IDs, we use **Blind Indexing**.
The `BlindIndex` is derived using `HMAC-SHA256(MasterKey, Input)`.

| Entity | ID Format | Blind Index Input | Description |
| :--- | :--- | :--- | :--- |
| **Identity** | `idx_{BlindIndex}_MAIN` | `"IDENTITY"` | Single user identity record. |
| **Contact** | `idx_{BlindIndex}_{UUID}` | `"CONTACTS"` | Contact records. Blind Index groups them logically without revealing "Contact" prefix. |
| **Message** | `idx_{BlindIndex}_{UUID}` | `ConversationFingerprint` | Messages are indexed by the conversation they belong to. |

### 2.3 Encryption & Salting

All data in `secure_vault` is encrypted using **AES-GCM (256-bit)**.

- **Master Key:** Random 256-bit key generated on install.
- **Key Wrapping:** Master Key is wrapped with PIN + Hardware Secret + **Dynamic Salt**.
-39→- **Record Salting:** Every encrypted record includes a **unique 16-byte random salt** in its JSON payload for future key diversification.
40→- **HKDF Derivation:** `RecordKey = HKDF(MasterKey, RecordSalt, "RecordEncryption")`. Data is encrypted with this derived key, not the Master Key directly.
41→
42→**Encrypted Payload Format:**
```json
{
  "version": 2,
  "encrypted": "<base64_ciphertext>",
  "iv": "<base64_iv>",
  "tag": "<base64_tag>",
  "salt": "<base64_random_salt>" // MANDATORY in V2.2
}
```

## 3. Data Flow

1. **Boot:** Check `system_settings` for `is_onboarded` flag.
2. **Unlock:** User enters PIN -> Unwrap Master Key -> Generate Blind Indexes.
3. **Read:**
   - Identity: `get("idx_" + HMAC("IDENTITY") + "MAIN")`
   - Contacts: `getAll("idx_" + HMAC("CONTACTS") + "_")`
   - Messages: `getAll("idx_" + HMAC(Fingerprint) + "_")`
4. **Write:**
   - Generate Record Salt -> Encrypt Payload -> Store with Blind Index ID.

## 4. Security Guarantees

- **Zero Metadata:** No plaintext IDs (`con_`, `msg_`, `user_identity`) exist in the database.
- **Anti-Forensics:** An attacker with access to the DB cannot distinguish between contacts and messages without the Master Key (all start with `idx_`).
- **Future Proofing:** Mandatory salts ensure we can upgrade KDF/Encryption in V3 without re-encrypting everything immediately (key diversification support).
