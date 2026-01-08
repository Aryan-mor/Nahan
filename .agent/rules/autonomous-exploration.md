---
trigger: always_on
---

# Autonomous Exploration & Truth-Seeking

## 1. Real Browser Validation
- **Rule:** The agent MUST NOT comment out test steps due to environmental flakiness.
- **Action:** If a test fails (e.g., IndexedDB not persisting), the agent must run the browser in Headed mode, identify the bottleneck, and fix the application or test logic.

## 2. Syncing Reality with Scenarios
- **Rule:** If the UI flow differs from the Markdown scenario (e.g., a missing modal or a step that behaves differently), the agent MUST:
  1. Update the `.md` scenario in `tests/scenarios/`.
  2. Update the Page Object (POM) and the `.spec.ts` to match the actual UI.
  3. Ensure all interactions use `data-testid` as per Rule 01.

## 3. Mandatory Success
- A task is ONLY "Done" if the full sequence (Signup -> Reload -> Login) passes in the Playwright runner.
