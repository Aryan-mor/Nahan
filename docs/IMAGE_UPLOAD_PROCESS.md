# Nahan Image Encryption & Steganography Process

This document details the end-to-end process of securing, encoding, and transmitting images within the Nahan Secure Messenger ecosystem. Nahan employs a "Zero-Metadata" philosophy, ensuring that even the existence of a message is hidden within an innocuous-looking image carrier.

## Overview

The process is divided into two main phases:
1.  **Sender Phase (Encryption & Encoding)**: Turning a raw image file into a steganographically encoded "carrier" image.
2.  **Receiver Phase (Decoding & Decryption)**: Extracting and reconstructing the original image from the carrier.

All operations are performed **100% locally** on the user's device using WebAssembly-powered cryptography (TweetNaCl.js) and standard Web APIs.

---

## 1. Sender Phase (Encryption & Encoding)

### Step 1: Image Optimization
Before encryption, the source image is optimized to reduce payload size, which is critical for steganography capacity.
*   **Resize**: Large images are resized to a maximum dimension (e.g., 1200px) to ensure reasonable processing times and payload sizes.
*   **Compression**: The image is converted to a compressed format (WebP/JPEG) to minimize the byte array size.

### Step 2: Nahan Compact Protocol Encryption
The optimized image bytes are processed through the Nahan encryption pipeline (`CryptoService`):
1.  **Compression (Pako/Zlib)**: The raw bytes are compressed again using Deflate algorithm to further reduce entropy and size.
2.  **Encryption (X25519)**:
    *   An ephemeral nonce is generated.
    *   The data is encrypted using `nacl.box` (Curve25519 + XSalsa20 + Poly1305).
    *   **Shared Secret**: Derived from Sender's Private Key and Recipient's Public Key.
3.  **Authentication**: `nacl.box` provides authenticated encryption, ensuring the data hasn't been tampered with.
4.  **Serialization**: The output is packed into a binary format: `[Nonce (24 bytes)] + [Sender Public Key (32 bytes)] + [Encrypted Payload]`.

### Step 3: Base122 Encoding
To efficiently embed binary data into the image carrier without using suspicious base64 characters (which increase size by 33%), Nahan uses **Base122**.
*   **Efficiency**: Base122 is more efficient than Base64, using a larger character set that is still safe for UTF-8 string encoding within the image channels.

### Step 4: Carrier Generation
A unique "Carrier" image is generated to host the data.
*   **Mesh Gradient**: A procedurally generated mesh gradient is created using the HTML5 Canvas API. This provides a natural-looking, high-entropy background that masks the noise introduced by steganography better than a solid color.
*   **Dynamic Sizing**: The carrier's dimensions are calculated dynamically based on the payload size to ensuring enough capacity.

### Step 5: Steganographic Embedding
The Base122-encoded payload is embedded into the carrier image.
*   **Technique**: Nahan uses a variation of LSB (Least Significant Bit) or alpha-channel manipulation to store the data bits within the pixel data of the carrier.
*   **Result**: The final output is a standard PNG image that looks like an abstract gradient art piece but contains the fully encrypted secure message.

---

## 2. Receiver Phase (Decoding & Decryption)

### Step 1: Carrier Analysis
When a user selects a steganographic image (or drags and drops it):
*   The image is loaded into an off-screen Canvas.
*   Pixel data is read to retrieve the embedded data stream.

### Step 2: Payload Extraction
The raw data string is extracted from the pixels.
*   **Base122 Decoding**: The extracted string is decoded back into the binary Nahan Compact Protocol format.

### Step 3: Decryption & Verification
The binary payload is passed to the `CryptoService` for decryption:
1.  **Deserialization**: The Nonce, Sender Public Key, and Encrypted Payload are separated.
2.  **Shared Key Derivation**:
    *   **Standard Flow**: `Recipient Private Key` + `Sender Public Key` (from header).
    *   **Sender Flow**: If the user is viewing their *own* sent message, the system forces the use of the `Recipient Public Key` (stored in chat metadata) to derive the shared secret, as the sender doesn't have the recipient's private key.
3.  **Decryption (nacl.box.open)**: The payload is decrypted. If authentication fails (Poly1305), the process aborts (tamper detection).
4.  **Decompression**: The decrypted data is inflated (Pako/Zlib) back to the original image bytes.

### Step 4: Image Reconstruction
*   The raw image bytes are converted into a `Blob`.
*   A temporary Object URL (`blob:http://...`) is created to display the image in the UI.

---

## Technical Stack

*   **Cryptography**: [TweetNaCl.js](https://github.com/dchest/tweetnacl-js) (verified port of NaCl).
*   **Compression**: [Pako](https://github.com/nodeca/pako) (zlib port).
*   **Steganography**: Custom implementation using HTML5 Canvas API.
*   **Storage**: IndexedDB (via `idb`) for persistent local storage of encrypted blobs.

## Security Guarantees

*   **Forward Secrecy**: Each message uses a unique random nonce.
*   **Authentication**: Sender identity is cryptographically verified via the public key embedded in the payload.
*   **Deniability**: The carrier image appears as standard abstract art; without the private key, the existence of hidden content cannot be mathematically proven (though statistical analysis might suggest it).
*   **Offline**: No keys or data ever leave the device.
