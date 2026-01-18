/* eslint-disable no-console */
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import tsconfigPaths from 'vite-tsconfig-paths';

// Custom plugin to inline favicon and other head links
const inlineFaviconPlugin = () => {
  return {
    name: 'inline-favicon',
    transformIndexHtml(html) {
      try {
        const faviconPath = path.resolve(__dirname, 'public/favicon.ico');
        const appleIconPath = path.resolve(__dirname, 'public/apple-touch-icon.png');
        const pwa192Path = path.resolve(__dirname, 'public/pwa-192x192.png');
        const pwa512Path = path.resolve(__dirname, 'public/pwa-512x512.png');

        const faviconBase64 = fs.readFileSync(faviconPath).toString('base64');
        const appleIconBase64 = fs.readFileSync(appleIconPath).toString('base64');
        const pwa192Base64 = fs.readFileSync(pwa192Path).toString('base64');
        const pwa512Base64 = fs.readFileSync(pwa512Path).toString('base64');

        return html
          .replace(
            '<link rel="icon" href="/favicon.ico" sizes="any" />',
            `<link rel="icon" href="data:image/x-icon;base64,${faviconBase64}" sizes="any" />`,
          )
          .replace(
            '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
            `<link rel="apple-touch-icon" href="data:image/png;base64,${appleIconBase64}" />`,
          )
          .replace(
            'href="/pwa-192x192.png"',
            `href="data:image/png;base64,${pwa192Base64}"`,
          )
          .replace(
            'href="/pwa-512x512.png"',
            `href="data:image/png;base64,${pwa512Base64}"`,
          );
      } catch (error) {
        console.warn('Failed to inline favicon/icons:', error);
        return html;
      }
    },
  };
};

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    inlineFaviconPlugin(),
    viteSingleFile({
      useRecommendedBuildConfig: false,
      removeViteModuleLoader: false, // Keep the loader to avoid syntax errors with module resolution
    }),
  ],
  publicDir: false,
  resolve: {
    alias: {
      'virtual:pwa-register/react': path.resolve(__dirname, 'src/utils/pwa-shim.ts'),
      'virtual:pwa-register': path.resolve(__dirname, 'src/utils/pwa-shim.ts'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'public',
    emptyOutDir: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: true, // Enable CSS code split to generate CSS file for plugin to inline
    reportCompressedSize: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        format: 'iife',
        manualChunks: undefined,
        // entryFileNames: 'assets/[name]-[hash].js', // Default is fine
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
