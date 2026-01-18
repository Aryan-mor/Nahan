/* eslint-disable max-lines-per-function, max-lines */
import { StateCreator } from 'zustand';

import { CryptoService } from '../../services/crypto';
import {
    generateMasterKey,
    getMasterKey,
    setMasterKey,
    unwrapMasterKey,
    wrapMasterKey
} from '../../services/secureStorage';
import { Identity, storageService } from '../../services/storage';
import { webAuthnService } from '../../services/webAuthnService';
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

      // Check Biometric Availability
      const isBioSupported = await webAuthnService.isSupported();
      const authId = await storageService.getSystemSetting('authenticator_id');
      const hasBioEnabled = isBioSupported && !!authId;

      logger.debug(`[Auth] Init Biometrics: Supported=${isBioSupported}, AuthID=${authId ? 'Present' : 'Missing'}, Enabled=${hasBioEnabled}`);

      set({
        isBiometricsSupported: isBioSupported,
        isBiometricsEnabled: hasBioEnabled
      });

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
    // Legacy support or direct injection
    set({ identity });
    const { sessionPassphrase } = get();
    if (sessionPassphrase) {
      await storageService.updateIdentityLastUsed(identity.fingerprint, sessionPassphrase);
    }
  },

  registerAccount: async (name: string, email: string, pin: string) => {
    try {
      // 1. Generate Master Key (V2)
      const masterKey = await generateMasterKey();
      setMasterKey(masterKey);

      // 2. Setup Hardware Binding (Fallback Seed Only for now to ensure smooth flow)
      // Note: Ideal flow would be to prompt registration here, but for now we follow the "Atomic Migration" style fallback
      // to ensure the user gets a V2 account immediately without friction.
      const randomValues = crypto.getRandomValues(new Uint8Array(32));
      const seedStr = btoa(String.fromCharCode(...randomValues));
      const hardwareSecret = new TextEncoder().encode(seedStr);

      // 3. Wrap Master Key
      const wrappedKey = await wrapMasterKey(masterKey, pin, hardwareSecret);

      // 4. Save V2 Infrastructure
      await storageService.setSystemSetting('wrapped_master_key', wrappedKey);
      await storageService.setSystemSetting('device_seed', seedStr);

      // 5. Generate Identity KeyPair (Passphrase is PIN)
      const keyPair = await cryptoService.generateKeyPair(name, email, pin);

      // 6. Store Identity (Encrypted with Master Key we just set)
      const identity = await storageService.storeIdentity({
        name: name,
        email: email,
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        fingerprint: keyPair.fingerprint,
        security_version: 2,
      }, pin);

      // 7. Update State
      set({
        identity,
        sessionPassphrase: pin,
        contacts: []
      });

      // Unlock
      useUIStore.getState().setLocked(false);

      logger.log('[Auth] New user registered with Security Version 2');
    } catch (error) {
      logger.error('Registration failed:', error);
      // Cleanup partial state if needed?
      // Ideally we should catch this and maybe clear master key.
      setMasterKey(null);
      throw error; // Re-throw for UI to handle
    }
  },

  wipeData: async () => {
    try {
      await storageService.clearAllData();
      // Critical: Clear all local storage to ensure fresh slate (including welcome screen state)
      localStorage.clear();

      // Reset UI state (non-sensitive)
      useUIStore.getState().setLocked(false);
      useUIStore.getState().resetFailedAttempts();
      // Reset sensitive state
      set({
        identity: null,
        contacts: [],
        sessionPassphrase: null,
        activeChat: null,
        messages: { ids: [], entities: {} },
      });

      // Close DB to ensure all transactions flush
      await storageService.close();

      // Reload to ensure clean slate
      window.location.reload();
    } catch (e) {
      logger.error('[Auth] wipeData Failed:', e);
      // Fallback reload if wipe failed?
      window.location.reload();
    }
  },

  unlockApp: async (pin: string) => {
    // 0. CRITICAL: Check if this is the self-destruct PIN (FIRST PRIORITY)
    const isSelfDestructPin = await storageService.verifySelfDestructPin(pin);
    if (isSelfDestructPin) {
      logger.warn('[Auth] Self-destruct PIN entered. Initiating emergency data wipe...');
      await get().wipeData();
      return false; // Return false to prevent unlock
    }

    // 1. Check for V2 (Master Key) existence
    const wrappedKey = await storageService.getSystemSetting<string>('wrapped_master_key');
    const deviceSeed = await storageService.getSystemSetting<string>('device_seed');


    try {
      if (wrappedKey) {
        // --- V2 UNLOCK FLOW ---
        logger.debug('[Auth] V2 Storage detected. Attempting unlock...');

        let hardwareSecret: Uint8Array | null = null;

        // Fallback to device seed if WebAuthn failed or not set
        // FIX: For PIN unlock, we should ALWAYS use the device seed (soft binding).
        // Calling getHardwareSecret here triggers the Biometric Prompt, which is wrong for PIN unlock.
        if (deviceSeed) {
          hardwareSecret = new TextEncoder().encode(deviceSeed);
        }

        if (!hardwareSecret) {
          // This creates a blocking state: "Hardware Key Missing"
          // In a real app, we'd prompt the user to insert key or re-register.
          logger.error('[Auth] Hardware secret missing (WebAuthn failed and no backup seed)');
          return false;
        }

        const masterKey = await unwrapMasterKey(wrappedKey, pin, hardwareSecret);
        setMasterKey(masterKey);

        // Load Data
        const identity = await storageService.getIdentity(pin); // Note: getIdentity still takes pin but we handle it
        // Actually, storageService.getIdentity calls getFromVault calls decryptData
        // secureStorage.decryptData now uses the setMasterKey internal state
        // The 'pin' arg in storageService methods is now ignored by secureStorage v2

        if (identity) {
          const contacts = await storageService.getContacts(pin);

          set({
            sessionPassphrase: pin, // Keep pin for UI consistency if needed
            identity,
            contacts,
          });

          logger.debug(`[Auth] Unlocked. Contacts: ${contacts.length}. Refreshing chats...`);

          await get().refreshChatSummaries();

          logger.debug('[Auth] Chat summaries refreshed.');

          useUIStore.getState().setLocked(false);
          useUIStore.getState().resetFailedAttempts();
          return true;
        }
        return false;


      } else {
        // --- V1 -> V2 MIGRATION FLOW (Purge & Renew) ---
        logger.warn('[Auth] Legacy V1 detected. Starting Migration...');

        // 1. Verify V1 Credential (using legacy helper)
        // We need to fetch the raw encrypted identity from IDB first to verify PIN
        const hasIdentity = await storageService.hasIdentity();
        if (!hasIdentity) return false;

        // Danger: We are doing a "Blind" migration attempt?
        // We MUST verify the PIN works on the old data before destroying it.
        // We can try to decrypt the Identity using the Legacy Helper.
        // But storageService.getIdentity tries to use the main decryptData.

        // Retrieve raw entry manually (bypass service wrapper to get string)
        // We can't easily bypass storageService without exposing internal DB.
        // Hack: We'll modify storageService to expose a raw fetch or just rely on
        // a try/catch block with a specific "Legacy" flag.

        // Better: We assume if we are here, we are V1.
        // We need to generate the V2 Key infrastructure first.

        // A. Generate New Master Key
        const newMasterKey = await generateMasterKey();

        // B. Setup Hardware Binding
        // Note: For extensive WebAuthn support during migration, we would handle it here.
        // Currently falling back to Device Seed for atomic migration.

        // Creating strong device seed (Fallback/Default for now to ensure atomic migration)
        const randomValues = crypto.getRandomValues(new Uint8Array(32));
        const seedStr = btoa(String.fromCharCode(...randomValues));
        const hardwareSecret = new TextEncoder().encode(seedStr);

        // C. Wrap Master Key
        const wrappedC = await wrapMasterKey(newMasterKey, pin, hardwareSecret);

        // D. Perform Data Migration
        // Set the new Master Key locally so storageService can use it for encryption during migration
        setMasterKey(newMasterKey);

        const success = await storageService.migrateV1ToV2(pin);

        if (!success) {
          logger.error('[Auth] Migration failed. Check PIN or Data Integrity.');
          setMasterKey(null); // Clear key on failure
          return false;
        }

        // E. Save V2 Infrastructure
        await storageService.setSystemSetting('wrapped_master_key', wrappedC);
        await storageService.setSystemSetting('device_seed', seedStr);
        // await storageService.setSystemSetting('authenticator_id', authId); // If we did WebAuthn

        logger.log('[Auth] Migration Success. Application upgraded to Security Version 2.');

        // F. Final Load (Unlock)
        const identity = await storageService.getIdentity(pin);
        if (identity) {
          const contacts = await storageService.getContacts(pin);
          set({
            sessionPassphrase: pin,
            identity,
            contacts,
          });
          await get().refreshChatSummaries();
          useUIStore.getState().setLocked(false);
          useUIStore.getState().resetFailedAttempts();
          return true;
        }
        return false;
      }
    } catch (error) {
      logger.error('Unlock failed during migration check', error);
      return false;
    }
  },

  lockApp: () => {
    // Update UI state (non-sensitive)
    useUIStore.getState().setLocked(true);
    // Clear sensitive in-memory state
    set({ sessionPassphrase: null, activeChat: null, messages: { ids: [], entities: {} } });
  },

  setSessionPassphrase: (passphrase) => set({ sessionPassphrase: passphrase }),

  isBiometricsSupported: false,
  isBiometricsEnabled: false,

  enableBiometrics: async () => {
    const { identity } = get();
    if (!identity) return false;

    try {
      // 1. Register with WebAuthn (get Hardware Secret)
      const credential = await webAuthnService.register(identity.fingerprint, identity.name);
      if (!credential || !credential.hardwareSecret) {
        logger.error('Biometrics: Failed to register or get secret');
        return false;
      }

      // 2. Wrap Master Key with Hardware Secret (using "BIOMETRIC_AUTH" as placeholder PIN)
      // We use a constant PIN for biometric slot because the security comes from the Hardware Secret
      const masterKey = getMasterKey();
      if (!masterKey) {
        logger.error('Biometrics: Master Key not loaded');
        return false;
      }

      const wrappedKey = await wrapMasterKey(masterKey, 'BIOMETRIC_AUTH', credential.hardwareSecret);

      // 3. Store Biometric Config
      await storageService.setSystemSetting('authenticator_id', credential.credentialId);
      await storageService.setSystemSetting('wrapped_biometric_key', wrappedKey);

      set({ isBiometricsEnabled: true });
      return true;
    } catch (e) {
      logger.error('Biometrics: Enable failed', e);
      return false;
    }
  },

  unlockWithBiometrics: async (options?: { signal?: AbortSignal }) => {
    try {
      const authId = await storageService.getSystemSetting<string>('authenticator_id');
      const wrappedKey = await storageService.getSystemSetting<string>('wrapped_biometric_key');

      if (!authId || !wrappedKey) {
        logger.error('Biometrics: No configuration found');
        return false;
      }

      // 1. Get Hardware Secret
      const hardwareSecret = await webAuthnService.getHardwareSecret(authId, options);
      if (!hardwareSecret) {
         // User cancelled or failed
         return false;
      }

      // 2. Unwrap Master Key
      const masterKey = await unwrapMasterKey(wrappedKey, 'BIOMETRIC_AUTH', hardwareSecret);
      setMasterKey(masterKey);

      // 3. Load Data & Unlock
      // We don't have the text PIN, so we pass mocked PIN or rely on V2 structure ignoring it if MK is set
      const identity = await storageService.getIdentity('BIOMETRIC_AUTH');
      if (identity) {
          const contacts = await storageService.getContacts('BIOMETRIC_AUTH');
          set({
            sessionPassphrase: 'BIOMETRIC_SESSION', // Placeholder to indicate session is active
            identity,
            contacts,
          });

          await get().refreshChatSummaries();
          useUIStore.getState().setLocked(false);
          useUIStore.getState().resetFailedAttempts();
          return true;
      }
      return false;
    } catch (e) {
      logger.error('Biometrics: Unlock failed', e);
      return false;
    }
  },

  disableBiometrics: async () => {
      try {
          await storageService.setSystemSetting('authenticator_id', null);
          await storageService.setSystemSetting('wrapped_biometric_key', null);
          set({ isBiometricsEnabled: false });
          return true;
      } catch (e) {
          logger.error('Biometrics: Disable failed', e);
          return false;
      }
  },
});
