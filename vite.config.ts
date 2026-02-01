/* eslint-disable max-lines-per-function */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  // Set base path:
  // - Production: '/Nahan/' (for GitHub Pages main deployment)
  // - PR Previews: Dynamic based on VITE_BASE_URL env var or relative './' if supported
  // - Development: '/'

  // Use VITE_BASE_URL if provided (e.g., by CI for PR previews), otherwise default to /Nahan/ for build
  const base = process.env.VITE_BASE_URL || (command === 'build' ? '/Nahan/' : '/');

  return {
    base,
    build: {
      sourcemap: 'hidden',
    },
    plugins: [
      react(),
      tsconfigPaths(),
      VitePWA({
        devOptions: {
          enabled: false,
          type: 'module',
          navigateFallback: 'index.html',
        },
        strategies: 'generateSW',
        manifestFilename: 'manifest.json',
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'maskable-icon.png',
          'version.json',
        ],
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
          runtimeCaching: [
            {
              urlPattern: ({ request }) =>
                request.destination === 'document' ||
                request.destination === 'script' ||
                request.destination === 'style' ||
                request.destination === 'image' ||
                request.destination === 'font',
              handler: 'CacheFirst',
              options: {
                cacheName: 'static-resources',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 365 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        manifest: {
          id: base,
          name: 'Nahan',
          short_name: 'Nahan',
          description: 'Secure, offline-first encrypted messaging application.',
          categories: ['social', 'productivity', 'utilities'],
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#020617',
          background_color: '#020617',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'maskable-icon.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
  };
});
