import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import App from './App';
import './i18n';
import './index.css';
import * as logger from './utils/logger';

/**
 * SECURITY AUDIT: Network API Verification
 *
 * This application is designed to be 100% offline. No network-related APIs are used:
 * - NO fetch() calls
 * - NO axios or HTTP client libraries
 * - NO WebSocket connections
 * - NO XMLHttpRequest
 * - NO external API calls
 *
 * All cryptographic operations use local libraries:
 * - tweetnacl: Local ECC encryption (X25519, Ed25519)
 * - pako: Local compression (deflate/inflate)
 *
 * Data storage is local-only:
 * - IndexedDB via Dexie.js (browser-local database)
 * - LocalStorage via Zustand persist (browser-local storage)
 *
 * The only external resource loading is:
 * - Static assets (images, fonts) bundled at build time
 * - Service Worker for PWA offline functionality (also local)
 *
 * This ensures complete privacy: all encryption/decryption happens on-device,
 * and no data ever leaves the user's browser.
 */

// English comment: Forcefully unregister all service workers in development to prevent React hook conflicts
if (import.meta.env.DEV) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
        logger.info('Nahan Dev: Rogue Service Worker killed.');
      }
    });
  }
}

// Force dark mode for the industrial theme
document.documentElement.classList.add('dark');

logger.info('Attempting to register Service Worker...');
const _updateSW = registerSW({
  onNeedRefresh() {
    logger.info('[PWA] New content available, please refresh.');
  },
  onOfflineReady() {
    logger.info('[PWA] App is ready to work offline.');
  },
  immediate: true,
});

// Expose store for E2E testing
import { StorageService } from './services/storage';
import { useAppStore } from './stores/appStore';
import { useUIStore } from './stores/uiStore';
if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).appStore = useAppStore;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).appStore = useAppStore;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).uiStore = useUIStore;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).storageService = StorageService.getInstance();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
