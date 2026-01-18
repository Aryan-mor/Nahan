/*
 * Re-trigger HMR by adding this comment.
 * The store interface and implementation have been updated to use initializeApp.
 */
import { create } from 'zustand';
import { createJSONStorage, persist, StateStorage } from 'zustand/middleware';

import { secureStorage } from '../services/secureStorage';

import { createAuthSlice } from './slices/authSlice';
import { createContactSlice } from './slices/contactSlice';
import { createMessageSlice } from './slices/messageSlice';
import { createProcessingSlice } from './slices/processingSlice';
import { createStealthSlice } from './slices/stealthSlice';
import { AppState } from './types';

export const useAppStore = create<AppState>()(
  persist(
    (set, get, api) => ({
      ...createAuthSlice(set, get, api),
      ...createContactSlice(set, get, api),
      ...createMessageSlice(set, get, api),
      ...createProcessingSlice(set, get, api),
      ...createStealthSlice(set, get, api),
    }),
    {
      name: 'nahan-secure-data',
      version: 1,
      storage: createJSONStorage(() => secureStorage as unknown as StateStorage),
      partialize: (state) => ({
        // ONLY persist these two sensitive fields (must be encrypted)
        identity: state.identity,
        contacts: state.contacts,
        // sessionPassphrase is NEVER persisted (in-memory only)
        // activeChat, messages are NOT persisted
        // Messages are stored in IndexedDB only (via storageService)
        // UI state (language, PWA, isLocked, failedAttempts) is in separate unencrypted store
      }),
      migrate: (persistedState: unknown, _version: number) => {
        // SecureStorage Wraps data in { version: 2, encrypted: ... }
        // If we see this, it means we have the encrypted blob, not the state.
        // We cannot decrypt it here (sync), so we return empty state to use defaults.
        // The app will manually rehydrate/decrypt when the Master Key is available.
        if (
          persistedState &&
          typeof persistedState === 'object' &&
          'encrypted' in persistedState &&
          'iv' in persistedState
        ) {
          return {};
        }
        return persistedState;
      },
    },
  ),
);

if (typeof window !== 'undefined') {
  // @ts-expect-error - testing
  window.useAppStore = useAppStore;
}
