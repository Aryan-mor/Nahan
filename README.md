# Nahan

Nahan is a secure, offline-first messenger built with React, Vite, and PGP encryption. It is designed to function as a Progressive Web App (PWA) with strong privacy guarantees.

## Features

- **End-to-End Encryption:** Uses OpenPGP.js for secure message exchange.
- **Offline-First:** Works without an internet connection using local storage and service workers.
- **PWA Support:** Installable on mobile and desktop devices.
- **QR Code Exchange:** Securely exchange public keys via QR codes.
- **No Tracking:** No analytics, no tracking, no data collection.

## Architecture

- **Frontend:** React, Tailwind CSS, HeroUI
- **Build Tool:** Vite
- **Encryption:** OpenPGP.js
- **State Management:** Zustand
- **PWA:** vite-plugin-pwa, Workbox

## Getting Started

1.  Clone the repository.
2.  Install dependencies: `pnpm install`
3.  Start the development server: `pnpm dev`
4.  Build for production: `pnpm build`

## License

This project is licensed under the GNU General Public License v3.0 (GPLv3). See the [LICENSE](LICENSE) file for details.
