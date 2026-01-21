import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface HelpState {
  hasSeenOnboarding: boolean;
  isHelpModalOpen: boolean;
  setHasSeenOnboarding: (seen: boolean) => void;
  openHelpModal: () => void;
  closeHelpModal: () => void;
}

export const useHelpStore = create<HelpState>()(
  persist(
    (set) => ({
      hasSeenOnboarding: false,
      isHelpModalOpen: false,
      setHasSeenOnboarding: (seen) => set({ hasSeenOnboarding: seen }),
      openHelpModal: () => set({ isHelpModalOpen: true }),
      closeHelpModal: () => set({ isHelpModalOpen: false }),
    }),
    {
      name: 'nahan-help-storage',
      partialize: (state) => ({ hasSeenOnboarding: state.hasSeenOnboarding }),
    },
  ),
);
