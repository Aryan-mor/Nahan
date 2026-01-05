import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import i18next from 'eslint-plugin-i18next';

export default tseslint.config(
  { ignores: ['dist', 'build', 'dev-dist', '.husky', 'coverage', '**/*.d.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'i18next': i18next,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...i18next.configs.recommended.rules,
      
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      
      // 1. Unused Variables (Error)
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],

      // 2. File Size Limits (Keep it modular)
      'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50 }],

      // 3. Translation Enforcement (i18next)
      'i18next/no-literal-string': [
        'error',
        {
          markupOnly: true, // Only check strings inside JSX
          ignoreAttribute: [
            'style', 'className', 'path', 'type', 'key', 'id', 'width', 'height', 
            'viewBox', 'd', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 
            'strokeLinejoin', 'target', 'rel', 'as', 'dir', 'lang'
          ],
          validateTemplate: true,
        },
      ],

      // 4. Code Organization
      // Note: eslint-plugin-import is temporarily disabled during migration to Flat Config (ESLint v9)
      // due to compatibility issues. It will be re-enabled once a compatible version is available.
      // 'import/order': [
      //   'error',
      //   {
      //     groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
      //     'newlines-between': 'always',
      //     alphabetize: { order: 'asc', caseInsensitive: true },
      //   },
      // ],

      // 5. General Cleanliness
      'no-console': 'error', // Don't leave debug logs in production
      '@typescript-eslint/no-explicit-any': 'error', // No 'any' cheating in TS
    },
  },
);
