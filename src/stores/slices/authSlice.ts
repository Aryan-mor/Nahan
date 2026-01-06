/* eslint-disable max-lines-per-function */
import { StateCreator } from 'zustand';

import { CryptoService } from '../../services/crypto';
import { clearKeyCache, setPassphrase } from '../../services/secureStorage';
import { Identity, storageService } from '../../services/storage';
import * as logger from '../../utils/logger';
import { AppState, AuthSlice } from '../types';
import { useUIStore } from '../uiStore';

const cryptoService = CryptoService.getInstance();

// Extended navigator interface for standalone property
interface NavigatorStandalone extends Navigator {
  standalone?: boolean;
}

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
  error: null,
  identity: null,
  isLoading: true,
  sessionPassphrase: null,

  initializeApp: async () => {
    set({ isLoading: true });
    try {
      // Boot Cleanup: Permanently delete old unencrypted data
      localStorage.removeItem('nahan-storage');

      // Initialize DB
      await storageService.initialize();

      // Update UI state (non-sensitive) - can be done without passphrase
      // Check if app is running in standalone mode
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as NavigatorStandalone).standalone ||
        document.referrer.includes('android-app://');

      // Update UI store (non-sensitive, doesn't require passphrase)
      useUIStore.getState().setStandalone(!!isStandaloneMode);

      // Check if identity exists (without requiring passphrase for boot detection)
      const identityExists = await storageService.hasIdentity();
      const passphrase = get().sessionPassphrase;

      if (!passphrase) {
        // No passphrase - can't decrypt data, but we can detect if identity exists
        if (identityExists) {
          // Identity exists but not unlocked - we need to decrypt the vault entry to get
          // the identity structure (including encrypted privateKey) for PIN verification.
          // But we can't decrypt the vault entry without a passphrase.
          //
          // Solution: We'll decrypt the vault entry in unlockApp with the PIN attempt.
          // For boot detection, we set a placeholder to prevent Onboarding from showing.
          // The unlockApp will decrypt with the PIN attempt to get the identity structure.

          // Set placeholder - unlockApp will decrypt vault entry with PIN attempt
          set({ identity: { id: 'placeholder' } as unknown as Identity, contacts: [] });
          // Lock the app to force PIN entry
          useUIStore.getState().setLocked(true);
        } else {
          // No identity exists - allow Onboarding to show
          set({ identity: null, contacts: [] });
        }
        set({ isLoading: false });
        return;
      }

      // Passphrase available - decrypt and load real data
      const [identities, contacts] = await Promise.all([
        storageService.getIdentities(passphrase),
        storageService.getContacts(passphrase),
      ]);

      // ALWAYS update state with loaded identity/contacts for UI rendering
      // The UI needs the identity to be set so it can show the LockScreen
      // SecureStorage middleware will block any unencrypted writes to disk
      // Load the first identity found (single-identity architecture)
      const identity = identities.length > 0 ? identities[0] : null;
      set({ identity, contacts });

      // Security Check: If we have an identity (not onboarding) but no session passphrase
      // (e.g. after page reload), we MUST lock the app to force password re-entry.
      if (identity) {
        const { sessionPassphrase } = get();
        const { isLocked } = useUIStore.getState();
        if (!isLocked && !sessionPassphrase) {
          useUIStore.getState().setLocked(true);
        }
      }
    } catch (error) {
      logger.error('Failed to load data:', error);
      set({ error: 'Failed to initialize application' });
    } finally {
      set({ isLoading: false });
    }
  },

  addIdentity: async (identity) => {
    set({ identity });
    const { sessionPassphrase } = get();
    if (sessionPassphrase) {
      await storageService.updateIdentityLastUsed(identity.fingerprint, sessionPassphrase);
    }
  },

  wipeData: async () => {
    await storageService.clearAllData();
    // Reset UI state (non-sensitive)
    useUIStore.getState().setLocked(false);
    useUIStore.getState().resetFailedAttempts();
    // Reset sensitive state
    set({
      identity: null,
      contacts: [],
      sessionPassphrase: null,
      activeChat: null,
      messages: [],
    });
    // Reload to ensure clean slate
    window.location.reload();
  },

  unlockApp: async (pin: string) => {
    // Check if identity exists (even if placeholder)
    const identityExists = await storageService.hasIdentity();
    if (!identityExists) return false;

    try {
      // CRITICAL: Clear any stale key cache at the very beginning
      // This ensures fresh key derivation for the unlock attempt
      setPassphrase(null);
      clearKeyCache();
      logger.log('[AUTH] Cache Cleared');

      // Step 1: Decrypt the vault entry with PIN attempt to get identity structure
      // This decrypts the vault entry and returns the identity object
      // The identity.privateKey is already encrypted with the user's PIN
      // Use fresh PIN (no cached keys) for decryption
      logger.debug('[unlockApp] Attempting to decrypt identity from vault');
      let identityWithEncryptedPrivateKey = null;
      try {
        identityWithEncryptedPrivateKey = await storageService.getIdentity(pin);
      } catch (error) {
        logger.warn('[unlockApp] getIdentity failed (likely wrong PIN):', error);
        return false;
      }
      
      if (!identityWithEncryptedPrivateKey) {
        // Decryption failed - likely wrong PIN
        logger.warn('[unlockApp] Failed to decrypt identity - wrong PIN or corrupted data');
        return false;
      }

      logger.debug('[unlockApp] Identity decrypted, verifying private key');

      // Step 2: Verify PIN via cryptoService using the encrypted privateKey from identity
      // The privateKey in the identity is already encrypted with the user's PIN
      const isValid = await cryptoService.verifyPrivateKeyPassphrase(
        identityWithEncryptedPrivateKey.privateKey,
        pin,
      );

      if (!isValid) {
        // PIN verification failed - wrong PIN
        logger.warn('[unlockApp] PIN verification failed - wrong PIN');
        return false;
      }

      // Step 3: Set passphrase FIRST to enable encryption layer
      // This clears the key cache to ensure fresh keys are used
      setPassphrase(pin);

      // Step 4: Re-fetch the decrypted identity and contacts (now that PIN is verified)
      // The identity we got above is already decrypted (we decrypted the vault entry with PIN)
      // But we re-fetch to ensure consistency and load contacts
      const decryptedIdentity = await storageService.getIdentity(pin);
      const decryptedContacts = await storageService.getContacts(pin);

      if (!decryptedIdentity) {
        logger.error('[unlockApp] Failed to re-fetch identity after PIN verification');
        return false;
      }

      // Step 5: Replace placeholder with real decrypted identity and load contacts
      set({
        sessionPassphrase: pin,
        identity: decryptedIdentity,
        contacts: decryptedContacts,
      });

      // Pre-load chat summaries while still in "unlocking" state
      await get().refreshChatSummaries();

      // Step 6: Update UI lock state in uiStore
      useUIStore.getState().setLocked(false);
      useUIStore.getState().resetFailedAttempts();

      return true;
    } catch (error) {
      // Log the full error for debugging
      logger.error('[unlockApp] Unlock failed:', error);

      // Check if it's a decryption error (wrong PIN or corrupted data)
      if (error instanceof Error) {
        if (error.message.includes('Decryption failed')) {
          logger.error('[unlockApp] Decryption error - wrong PIN or corrupted vault data');
        } else if (error.message.includes('invalid passphrase')) {
          logger.error('[unlockApp] Invalid passphrase - wrong PIN');
        } else {
          logger.error('[unlockApp] Unexpected error during unlock:', error.message);
        }
      }

      return false;
    }
  },

  lockApp: () => {
    // Update UI state (non-sensitive)
    useUIStore.getState().setLocked(true);
    // Clear sensitive in-memory state
    set({ sessionPassphrase: null, activeChat: null, messages: [] });
  },

  setSessionPassphrase: (passphrase) => set({ sessionPassphrase: passphrase }),
});
