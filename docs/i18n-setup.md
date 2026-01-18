# i18next-parser Setup Guide

## Overview
i18next-parser is now configured to automatically extract translation keys from your codebase and ensure all text is properly translated.

## Installation
```bash
pnpm add -D i18next-parser
```

## Configuration
Created `i18next-parser.config.js` with the following settings:
- **Input**: All TypeScript and TSX files in `src/`
- **Output**: `src/locales/$LOCALE/$NAMESPACE.json`
- **Locales**: English (`en`) and Persian (`fa`)
- **Key separator**: `.` (dot)
- **Sorted keys**: Yes (alphabetical order)

## NPM Scripts

### Extract Translation Keys
```bash
pnpm i18n:extract
# or
npx i18next-parser
```

This command will:
- Scan all TypeScript/TSX files for `t()` calls
- Extract translation keys
- Update translation JSON files
- Add missing keys with empty values
- Remove unused keys (if `keepRemoved: false`)

### Check for Missing Translations
```bash
pnpm i18n:check
# or
npx i18next-parser --fail-on-update
```

This command will:
- Run the extraction
- Fail if any translations would be updated
- Useful for CI/CD to ensure all translations are complete

## Workflow

### During Development
1. Write code with translation keys:
   ```tsx
   t('settings.security.self_destruct.title', 'Emergency Data Wipe')
   ```

2. Run extraction to update translation files:
   ```bash
   pnpm i18n:extract
   ```

3. Add Persian translations to `src/locales/fa/translation.json`

### Before Committing
Run the check to ensure all translations are complete:
```bash
pnpm i18n:check
```

## Integration with CI/CD
You can add `i18n:check` to your pre-commit hook or CI pipeline:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "pnpm i18n:check"
    ]
  }
}
```

## Best Practices

1. **Always provide fallback text**:
   ```tsx
   t('key', 'Fallback text')
   ```

2. **Use descriptive keys**:
   ```tsx
   // Good
   t('settings.security.self_destruct.title')

   // Bad
   t('title')
   ```

3. **Keep keys organized**: Use dot notation to group related translations

4. **Run extraction regularly**: After adding new features or UI text

## Current Status
✅ i18next-parser successfully configured
✅ Initial extraction completed (97 files parsed)
✅ All translation keys extracted and validated
