---
trigger: manual
globs: ready to push
---

# Git Lifecycle

## 1. Pre-Push Validation
- **Action Plan:** When this command is issued, execute the following sequence:
  1. Run all Playwright E2E tests (
pm run test:e2e).
  2. Run
pm run lint.
  3. Run
pm run build.


Commit Action: - If and ONLY if all the above steps return Exit Code 0, the agent must:
  1. Stage all changed files (git add .).
  2. Generate a descriptive and professional commit message in English based on the actual changes performed in the session (e.g., following Conventional Commits like feat:, fix:, refactor:).
  3. Execute the commit.

Error Handling: - If any step fails, the agent must Stop Immediately.

  Provide a serious, detailed negative feedback report explaining why the build or tests failed.

  Suggest or implement fixes. Do NOT commit if there is a single lint error or a failing test.
