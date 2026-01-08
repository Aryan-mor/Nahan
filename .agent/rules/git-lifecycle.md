# Git Lifecycle

## 1. Pre-Push Validation
- **Trigger Command:** "ready to push"
- **Action Plan:** When this command is issued, execute the following sequence:
  1. Run all Playwright E2E tests (
pm run test:e2e).
  2. Run 
pm run lint.
  3. Run 
pm run build.
- **Exit Condition:** If any step fails, provide a detailed error log and fix suggestions. Do NOT proceed to push until all checks are Green.
