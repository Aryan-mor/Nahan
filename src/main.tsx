import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register';
import App from './App'
import './index.css'

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
