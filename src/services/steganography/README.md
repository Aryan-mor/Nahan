# Steganography Provider Architecture

Nahan uses a flexible provider-based architecture for steganography, allowing for multiple encoding algorithms (NH01-NH07) to coexist.

## Architecture

- **StegoFactory**: Manages algorithm providers and handles selection.
- **StegoProvider**: Interface that all algorithms must implement.
- **BaseStegoProvider**: Abstract base class providing common utilities like Magic Headers.

## Algorithms

| NH01 | Unicode Tags | 3 | Desktop | High capacity, but visible in many text editors as boxes |
| NH02 | Zero Width Binary | 4 | Mobile | Invisible on most platforms, optimized for iOS Safari |
| NH03 | Emoji Map | 2 | Social | Hides data in emoji sequences. 2 emojis = 1 byte. |
| NH04 | Whitespace | 5 | Universal | Hides data in spaces. High stealth, low capacity. |
| NH05 | Script Expert | 4 | Regional | (Pending) Language-specific (e.g. Persian kashida) |
| NH06 | Hybrid | 5 | Universal | (Pending) Combination of multiple techniques |
| **NH07** | **Base122** | **5** | **Universal** | **Binary-to-Text for images (Legacy)** |

## Algorithm Characteristics

### NH01: Unicode Tags
- **Platform**: Best for Desktop/Web. Some mobile apps strip these.
- **Efficiency**: ~1.7 visible chars per encrypted byte.
- **Stealth**: Medium (detectable if viewed in HEX or certain editors).

### NH02: Zero Width Binary
- **Platform**: Mobileized. Bypasses iOS "tofu" issues.
- **Efficiency**: Requires 4 word boundaries per byte.
- **Stealth**: High (completely invisible on modern rendering engines).

### NH03: Emoji Map (Social Media)
- **Efficiency**: Exactly 2 emojis per byte of data (4-bit encoding).
- **Platform Limits**:
  - **Twitter**: ~140 bytes (within 280 char limit).
  - **WhatsApp**: ~2KB (within 4096 char limit).
- **Stealth**: Low (obvious sequence of emojis), but bypasses most text-only filters.

### NH04: Whitespace Encoding
- **Mechanism**: Single space = bit 0, Double space = bit 1.
- **Efficiency**: 8 spaces + 64 spaces overhead per payload.
- **Stealth**: Highest (indistinguishable from manual typing to the naked eye).
- **Best For**: Short secrets, passwords, or keys.

## Magic Headers

All payloads encoded with this new architecture include a 4-byte Magic Header:
`[ 'N', 'H', '0', X ]` where X is the algorithm number (1-7).

This allows the decoder to automatically detect the algorithm used.

## NH07: Base122 (Image Steganography)

NH07 is the default provider for Image Steganography. It encodes binary data into a text-safe format (Base122) that is then embedded into image pixels using LSB-2.

### Features
- **High Efficiency**: ~7 bits per byte (14% overhead).
- **Binary Safety**: Encodes arbitrary binary data (encrypted payloads) into UTF-8 safe strings.
- **Magic Header**: Prefixes payloads with `NH07` for automatic detection.

### Backward Compatibility
The NH07 provider automatically handles legacy payloads created before the Magic Header system was introduced. When decoding, if no header is found, it treats the data as a raw Base122 string, ensuring older messages can still be decrypted.

### Direct Usage Example

```typescript
import { StegoFactory, AlgorithmType } from '@/services/steganography';

const factory = StegoFactory.getInstance();
const nh07 = factory.getProvider(AlgorithmType.NH07);

// Encode (adds header)
const encoded = await nh07.encode(payload);

// Decode (handles header automatically)
const decoded = await nh07.decode(encoded);
```

## Usage

### Using the Factory (New Way)

```typescript
import { StegoFactory, AlgorithmType } from '@/services/steganography';

const factory = StegoFactory.getInstance();
const provider = factory.getProvider(AlgorithmType.NH07);

// Encode
const stegoText = await provider.encode(payload);

// Decode
const decodedPayload = await provider.decode(stegoText);
```

### Using Legacy Service

The existing `ImageSteganographyService` is maintained for backward compatibility and wraps NH07 logic where appropriate (future state). Currently, it operates as before but the underlying modules share the same codebase.

```typescript
import { steganographyService } from '@/services/steganography';

const result = await steganographyService.encode(file, privateKey, passphrase);
```

## iOS Compatibility & Text Rendering

For mobile platforms, especially iOS, text rendering engines can display "tofu" (empty boxes) or large gaps if invisible characters are injected incorrectly.

### NH02 (Zero Width Binary) Strategy

NH02 uses specific optimizations to ensure invisibility on iOS Safari and Chrome:
- **Character Set**: Uses ZWNJ (`U+200C`) and ZWJ (`U+200D`).
- **Word-Boundary Injection**: Characters are ONLY injected between words (after spaces).
- **Ligature Safety**: No characters are injected *within* words, preventing the breaking of cursive scripts like Persian or Arabic.

**Injection Pattern:**
- Correct: `Word` + ` ` + `[ZWNJ][ZWJ]` + `Word`
- Incorrect: `W` + `[ZWNJ]` + `o` + `[ZWJ]` + `rd` (Breaks ligatures and rendering)
