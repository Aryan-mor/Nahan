import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '../stores/appStore';

export function useOfflineSync() {
  const { processPendingMessages, isLoading } = useAppStore();

  useEffect(() => {
    // Don't sync if app is still loading (database might not be initialized)
    if (isLoading) return;

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

    // Initial check (debounced/delayed to ensure app is fully initialized)
    // Wait for app initialization before syncing
    if (navigator.onLine && !isLoading) {
        // Use a timeout to ensure app is fully hydrated and database is initialized
        setTimeout(handleOnline, 1000);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [processPendingMessages, isLoading]);
}
