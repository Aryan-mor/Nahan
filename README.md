# Nahan

**Nahan** is a high-security Steganographic Communication Vault. It enables users to cloak encrypted messages within innocuous digital carriers, such as ordinary images or seemingly standard text, providing a metadata-less channel for covert information exchange in restricted environments. By decoupling the message from the transport medium, Nahan ensures resilient, zero-footprint communication.

[**Try Nahan Now**](https://aryan-mor.github.io/Nahan/)

## Features

- **End-to-End Encryption:** Uses `tweetnacl` (X25519/Ed25519) for secure message exchange via the Nahan Compact Protocol
- **Hardware-Bound Encryption (V2):** Master Key architecture with WebAuthn PRF binding (or high-entropy seed fallback), ensuring keys cannot be extracted from the device interactively.
- **Stealth Mode:** Zero-Width Character (ZWC) steganography to hide encrypted messages within poetry/cover text
- **Offline-First:** Works without an internet connection using local storage and service workers
- **PWA Support:** Installable on mobile and desktop devices
- **Zero Metadata:** Single-vault IndexedDB storage with encrypted payloads
- **Secure Storage:** AES-GCM encrypted localStorage with PBKDF2 key derivation (600,000 iterations)
- **No Tracking:** No analytics, no tracking, no data collection, 100% offline

## Architecture

### Frontend Stack
- **Framework:** React 18 with TypeScript
- **Styling:** Tailwind CSS, HeroUI components
- **Build Tool:** Vite
- **State Management:** Zustand (with encrypted persist middleware)
- **PWA:** vite-plugin-pwa, Workbox

### Cryptographic Stack
- **Encryption:** `tweetnacl` (X25519 for encryption, Ed25519 for signing)
- **Compression:** `pako` (deflate/inflate)
- **Steganography:** Unicode Tags Block (Plane 14) for invisible character embedding
- **Key Derivation:** PBKDF2 with 600,000 iterations
- **Storage Encryption:** AES-GCM with 12-byte IV and 16-byte authentication tag

### Storage Architecture

#### Single-Vault System (IndexedDB)
All sensitive data (identity, contacts, messages) is stored in a single `secure_vault` table in IndexedDB:

- **Zero Metadata Policy:** No readable names, emails, or message snippets in database
- **Encrypted Payloads:** Each object is JSON-serialized, encrypted with `sessionPassphrase`, and stored as an encrypted blob
- **Standardized IDs:**
  - Identity: `user_identity`
  - Contacts: `con_{uuid}`
  - Messages: `idx_{BlindIndex}`

#### Encrypted LocalStorage (Zustand Persist)
Non-runtime sensitive state (identity, contacts) is persisted in `localStorage` using:

- **AES-GCM Encryption:** Encrypted with key derived from user PIN
- **Dynamic Salting (V2.1):** Per-installation random salt for key wrapping
- **PBKDF2 Key Derivation:** 600,000 iterations for brute-force protection
- **Versioned Storage:** Supports migration between storage formats

### Message Flow

1. **Encryption:** Plaintext → `pako.deflate()` → `tweetnacl.box()` → Binary `Uint8Array`
2. **Steganography (Stealth Mode):** Binary → Base-16 mapping → Unicode Tags → Embedded in cover text
3. **Storage:** Encrypted message stored in IndexedDB vault with encrypted payload
4. **Decryption:** Reverse process: Extract Tags → Base-16 decode → `tweetnacl.box.open()` → `pako.inflate()` → Plaintext

### Stealth Mode

**Long Press Interaction:**
- **Single Click/Tap:** Auto-Stealth mode - automatically encrypts, picks random safe cover text, and sends
- **Long Press (>500ms):** Opens Stealth Modal for manual cover text customization

**Stealth Safety:**
- Calculates safety ratio: `(coverTextLength / (payloadSize * 2)) * 100`
- Green Zone: 80%+ (safe to send)
- Orange Zone: 60-80% (acceptable)
- Red Zone: <60% (blocked for auto-stealth, allowed for manual with warning)

**Cover Text Selection:**
- Uses "Best-Fit Pool" algorithm: Filters poems by required length, selects randomly from top 5-10 smallest candidates
- Supports Persian (`fa`) and English (`en`) poetry databases
- Automatically expands cover text if safety ratio is too low

### Security Features

#### Self-Detection Prevention
The app prevents detecting its own identity as a new contact:
- Compares detected public key fingerprint with user's own identity fingerprint
- Silently ignores clipboard detections that match the user's identity
- Prevents redundant "New Contact Detected" modals

#### Secure Boot Flow
1. App initializes and checks for existing identity in vault
2. If identity exists but no `sessionPassphrase`: Shows Lock Screen (PIN pad)
3. User enters PIN: `unlockApp(pin)` verifies PIN, sets passphrase, decrypts vault entries
4. App unlocks and loads decrypted identity/contacts into state

#### Zero-Plaintext Policy
- **Sensitive Store (`useAppStore`):** Only `identity` and `contacts` persisted, encrypted with `secureStorage`
- **UI Store (`useUIStore`):** Non-sensitive state (language, theme, lock state) in plain `localStorage`
- **IndexedDB:** All data encrypted in vault payloads
- **In-Memory:** `sessionPassphrase` never persisted, cleared on lock

## Getting Started

### Prerequisites
- Node.js 18+ and pnpm

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd nahan
```

2. Install dependencies:
```bash
pnpm install
```

3. Start the development server:
```bash
pnpm dev
```

4. Build for production:
```bash
pnpm build
```

### Development Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build
- `pnpm check` - Type check without emitting
- `pnpm test` - Run unit tests
- `pnpm test:ui` - Run tests with UI
- `pnpm lint` - Run ESLint

## Project Structure

```
src/
├── components/          # React components
│   ├── ChatInput.tsx   # Message input with long-press detection
│   ├── ChatView.tsx    # Chat interface
│   ├── StealthModal.tsx # Stealth mode configuration
│   └── ...
├── services/           # Core services
│   ├── crypto.ts       # Nahan Compact Protocol (tweetnacl)
│   ├── camouflage.ts   # Steganography (Unicode Tags)
│   ├── storage.ts      # IndexedDB vault service
│   └── secureStorage.ts # AES-GCM localStorage encryption
├── stores/             # Zustand stores
│   ├── appStore.ts     # Sensitive data (encrypted)
│   └── uiStore.ts      # UI state (unencrypted)
├── hooks/              # Custom React hooks
│   ├── useLongPress.ts # Long press detection
│   └── ...
├── constants/          # Constants and data
│   └── poetryDb.ts     # Multi-language poetry database
└── locales/            # i18n translations
```

## Security Architecture

See [SECURITY.md](./SECURITY.md) for detailed security documentation.

For details on how Nahan handles Image Steganography and Encryption, see [Image Upload Process](./docs/IMAGE_UPLOAD_PROCESS.md).


## License

This project is licensed under the GNU General Public License v3.0 (GPLv3). See the [LICENSE](LICENSE) file for details.
