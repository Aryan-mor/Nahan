import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register';
import App from './App'
import './index.css'

// English comment: Forcefully unregister all service workers in development to prevent React hook conflicts
if (import.meta.env.DEV) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
        console.log('Nahan Dev: Rogue Service Worker killed.');
      }
    });
  }
}

// Force dark mode for the industrial theme
document.documentElement.classList.add('dark');

console.log('Attempting to register Service Worker...');
const updateSW = registerSW({
  onNeedRefresh() {
    console.log('[PWA] New content available, please refresh.');
  },
  onOfflineReady() {
    console.log('[PWA] App is ready to work offline.');
  },
  immediate: true,
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
