# Steganography Provider Architecture

Nahan uses a flexible provider-based architecture for steganography, allowing for multiple encoding algorithms (NH01-NH07) to coexist.

## Architecture

- **StegoFactory**: Manages algorithm providers and handles selection.
- **StegoProvider**: Interface that all algorithms must implement.
- **BaseStegoProvider**: Abstract base class providing common utilities like Magic Headers.

## Algorithms

| ID | Name | Stealth | Platform | Description |
|----|------|---------|----------|-------------|
| NH01 | Unicode Tags | 3 | Universal | Uses deprecated Unicode Tag characters |
| NH02 | Invisible Logic | 4 | Universal | Uses ZWNJ/ZWJ characters |
| NH03 | Emoji Map | 2 | Social | Hides data within emoji sequences |
| NH04 | Whitespace | 2 | Universal | Manipulates whitespace characters |
| NH05 | Script Expert | 4 | Universal | Language-specific (e.g. Persian kashida) |
| NH06 | Hybrid | 5 | Universal | Combination of multiple techniques |
| **NH07** | **Base122** | **5** | **Universal** | **Standard Binary-to-Text for Images (Legacy)** |

## Magic Headers

All payloads encoded with this new architecture include a 4-byte Magic Header:
`[ 'N', 'H', '0', X ]` where X is the algorithm number (1-7).

This allows the decoder to automatically detect the algorithm used.

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
