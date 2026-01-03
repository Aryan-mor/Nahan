/** @type {import('tailwindcss').Config} */
import { heroui } from '@heroui/react';

export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // Industrial dark theme colors
        industrial: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        persian: ['Vazirmatn', 'sans-serif'],
      },
    },
  },
  plugins: [
    heroui({
      themes: {
        dark: {
          colors: {
            background: '#020617', // industrial-950
            foreground: '#f1f5f9', // industrial-100
            default: {
              50: '#0f172a', // industrial-900
              100: '#1e293b', // industrial-800
              200: '#334155', // industrial-700
              300: '#475569', // industrial-600
              400: '#64748b', // industrial-500
              500: '#94a3b8', // industrial-400
              600: '#cbd5e1', // industrial-300
              700: '#e2e8f0', // industrial-200
              800: '#f1f5f9', // industrial-100
              900: '#f8fafc', // industrial-50
              DEFAULT: '#334155', // industrial-700
              foreground: '#f1f5f9', // industrial-100
            },
            primary: {
              DEFAULT: '#64748b', // industrial-500
              foreground: '#ffffff',
            },
            content1: '#1e293b', // industrial-800
            content2: '#334155', // industrial-700
            content3: '#475569', // industrial-600
            content4: '#64748b', // industrial-500
          },
        },
      },
    }),
  ],
};
