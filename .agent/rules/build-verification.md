---
trigger: always_on
---

# Build Verification Rule

## Post-Command Build Check
After completing any code modification or command that could affect the build:

1. **Always run `npm run build`** to verify TypeScript compilation and catch errors
2. If build fails, fix all errors before proceeding to the next task
3. Run `npm run lint` before build to catch linting issues early

## When This Applies
- After any file edit (TypeScript, TSX, CSS)
- After installing/updating dependencies
- After modifying configuration files
- After any refactoring work

## Error Handling Priority
1. Fix TypeScript errors first (blocking)
2. Fix ESLint errors second
3. Address warnings if time permits
