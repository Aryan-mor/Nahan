import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface HelpState {
  hasSeenOnboarding: boolean;
  isHelpModalOpen: boolean;
  activeHelpTopic: string | null;
  setHasSeenOnboarding: (seen: boolean) => void;
  openHelpModal: () => void;
  closeHelpModal: () => void;
  startHelpTopic: (topic: string) => void;
  endHelpTopic: () => void;
}

export const useHelpStore = create<HelpState>()(
  persist(
    (set) => ({
      hasSeenOnboarding: false,
      isHelpModalOpen: false,
      activeHelpTopic: null,
      setHasSeenOnboarding: (seen) => set({ hasSeenOnboarding: seen }),
      openHelpModal: () => set({ isHelpModalOpen: true }),
      closeHelpModal: () => set({ isHelpModalOpen: false }),
      startHelpTopic: (topic) => set({ activeHelpTopic: topic, isHelpModalOpen: false }),
      endHelpTopic: () => set({ activeHelpTopic: null }),
    }),
    {
      name: 'nahan-help-storage',
      partialize: (state) => ({ hasSeenOnboarding: state.hasSeenOnboarding }),
    },
  ),
);
