// Mock for vite-plugin-pwa in portable build
// This prevents the PWA service worker from trying to register in the single-file build

export function registerSW() {
  return () => {};
}

export function useRegisterSW() {
  return {
    needRefresh: [false, null],
    offlineReady: [false, null],
    updateServiceWorker: async () => {},
  };
}
