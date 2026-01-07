/**
 * UI Store - Non-sensitive UI state (unencrypted)
 * Stores UI preferences that don't contain sensitive data
 * This store uses plain localStorage (no encryption needed)
 */

import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface UIState {
  // Language & UI Preferences
  language: string | null;
  camouflageLanguage: 'fa' | 'en';

  // Security UI State (non-sensitive - UI state only)
  isLocked: boolean;
  failedAttempts: number;

  // Navigation (non-sensitive)
  activeTab: 'chats' | 'keys' | 'settings';
  // Chat Scroll Positions
  scrollPositions: Record<string, number>;

  // PWA State (non-sensitive)
  deferredPrompt: BeforeInstallPromptEvent | null;
  isStandalone: boolean;
  isInstallPromptVisible: boolean;

  // Actions
  setLanguage: (lang: string) => void;
  setCamouflageLanguage: (lang: 'fa' | 'en') => void;
  setLocked: (locked: boolean) => void;
  incrementFailedAttempts: () => void;
  resetFailedAttempts: () => void;
  setActiveTab: (tab: 'chats' | 'keys' | 'settings') => void;
  setScrollPosition: (id: string, position: number) => void;
  setDeferredPrompt: (prompt: BeforeInstallPromptEvent | null) => void;
  setStandalone: (isStandalone: boolean) => void;
  setInstallPromptVisible: (visible: boolean) => void;
  installPWA: () => Promise<void>;
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set, get) => ({
      // Initial State
      language: null,
      camouflageLanguage: 'fa',
      isLocked: false,
      failedAttempts: 0,
      activeTab: 'chats',
      scrollPositions: {},
      deferredPrompt: null,
      isStandalone: false,
      isInstallPromptVisible: false,

      // Actions
      setLanguage: (lang) => set({ language: lang }),
      setCamouflageLanguage: (lang) => set({ camouflageLanguage: lang }),
      setLocked: (locked) => set({ isLocked: locked }),
      incrementFailedAttempts: () => set((state) => ({ failedAttempts: state.failedAttempts + 1 })),
      resetFailedAttempts: () => set({ failedAttempts: 0 }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setScrollPosition: (id, position) =>
        set((state) => ({
          scrollPositions: { ...state.scrollPositions, [id]: position },
        })),

      setDeferredPrompt: (prompt) => set({ deferredPrompt: prompt }),
      setStandalone: (isStandalone) => set({ isStandalone }),
      setInstallPromptVisible: (visible) => set({ isInstallPromptVisible: visible }),
      installPWA: async () => {
        const { deferredPrompt } = get();
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
          set({ deferredPrompt: null, isInstallPromptVisible: false });
        }
      },
    }),
    {
      name: 'nahan-ui-storage',
      version: 1,
      storage: createJSONStorage(() => localStorage), // Plain localStorage (non-sensitive)
    },
  ),
    {
      name: 'Nahan_UIStore',
      enabled: import.meta.env.DEV,
    },
  ),
);

