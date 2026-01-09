# Core Encryption & Steganography Protocols

This document serves as the **Source of Truth** for Nahan's encryption and steganography implementation. All development and testing must strictly adhere to these protocols.

## Protocol 01: Stealth ID (Poetry Identity)
*   **Concept:** Hiding the Ed25519 Public Key inside persistant Persian Poetry (or other supported languages) using Zero-Width Characters (ZWC).
*   **Format:** The output MUST appear as valid, readable text (e.g., Persian poetry) to the human eye.
*   **Forbidden:** NEVER use raw hashes (e.g., `#A1B2C3` or `0x...`) as an identity string in tests or UI.
*   **Mechanism:**
    *   Public Key (Hex/Bytes) -> Bitstream -> ZWC Mapping -> Injection into Cover Text (Poetry).
*   **Test Validation:**
    *   `expect(identityString).toMatch(/[\u0600-\u06FF]/)` (Must contain Persian characters when using FA locale).
    *   `expect(identityString).not.toContain(publicKey)` (Public key must be invisible).

## Protocol 02: Base122 Encoding
*   **Concept:** An efficient binary-to-text encoding scheme designed to maximize data density by using the full range of safe UTF-8 characters.
*   **Usage:** Exclusively used for **Image Steganography** payloads to reduce message overhead compared to Base64, allowing larger messages to fit in smaller images.
*   **Reference:** `src/services/steganography/base122.ts`.
*   **Constraint:** Must handle null bytes and control characters correctly according to the implementation.

## Protocol 03: Text Steganography (ZWC)
*   **Concept:** Hiding encrypted messages within a "Cover Text" using Zero-Width Characters.
*   **Logic:**
    1.  **Encrypt:** `AES-GCM(Message, SharedSecret) -> Ciphertext`
    2.  **Serialize:** `Protobuf/JSON(Ciphertext) -> Binary`
    3.  **Encode:** `Binary -> ZWC Steps (ZWNJ, ZWJ, etc.)`
    4.  **Inject:** `Cover Text + ZWC String -> StegoText`
*   **Appearance:** The result must look exactly like the original Cover Text to a casual observer.

## Protocol 04: Image Steganography (LSB + Base122)
*   **Concept:** Hiding encrypted data in the Least Significant Bits (LSB) of image pixels.
*   **Logic:**
    1.  **Encrypt:** `AES-GCM(Message, SharedSecret) -> Ciphertext`
    2.  **Encode:** `Base122(Ciphertext) -> EncodedString`
    3.  **Embed:** `LSB_Insert(Image, EncodedString) -> StegoImage`
*   **Constraint:** The visual difference between the original and stego-image should be imperceptible.
