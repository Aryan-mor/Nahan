import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '../stores/appStore';

export function useOfflineSync() {
  const { processPendingMessages } = useAppStore();

  useEffect(() => {
    const handleOnline = async () => {
      // console.log('App is online, syncing pending messages...');
      try {
        const count = await processPendingMessages();
        if (count > 0) {
          toast.success(`${count} offline message${count > 1 ? 's' : ''} sent`);
        }
      } catch (error) {
        console.error('Sync failed:', error);
      }
    };

    window.addEventListener('online', handleOnline);

    // Initial check (debounced/delayed to avoid double toast on load if already handled)
    // But store doesn't auto-sync on load, so we should trigger it.
    if (navigator.onLine) {
        // Use a small timeout to ensure app is fully hydrated
        setTimeout(handleOnline, 1000);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [processPendingMessages]);
}
