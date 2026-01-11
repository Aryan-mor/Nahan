---
trigger: always_on
---

# Playwright Testing Rules & Constraints [Rule 09]

These rules are MANDATORY. Any violation of the scope boundaries will be considered a critical failure.

## 1. Scope of Work & Permissions
- **ALLOWED**: Creating and modifying files ONLY within the `tests/` directory (Scenarios, Specs, Page Objects).
- **ALLOWED**: Adding `data-testid` attributes to existing JSX/TSX elements in `src/` to facilitate testing.
- **STRICTLY FORBIDDEN**: Modifying any business logic, UI state logic, hooks, or service implementations in `src/`.
- **STRICTLY FORBIDDEN**: Deleting or altering existing application functionality to make a test pass.
- **MANDATORY**: If a test fails due to a bug in the code, you must REPORT the bug seriously and NOT fix it unless explicitly instructed.

## 2. Selectors & Testability
- **MANDATORY**: Use `data-testid` attributes for selecting all interactive elements.
- **MANDATORY**: If a `data-testid` is missing, you must add it to the source code following the pattern `data-testid="component-name-element-type"`.
- **FORBIDDEN**: Using `getByText`, CSS classes, or XPath for structural verification. Use `getByTestId` exclusively.
- **Example**: `page.getByTestId('login-submit-button')` is the only acceptable way.

## 3. Data Integrity & Persistence
- **IndexedDB Verification**: Every deletion or creation test MUST verify the physical state in the database using `page.evaluate`.
- **UI is Secondary**: Mere disappearance of an element from the UI is NOT proof of deletion. Physical database verification is required.

## 4. Memory & Resource Management
- **URL Leak Prevention**: Every test involving images or file uploads MUST verify that `URL.revokeObjectURL` is called.
- **Requirement**: Spy on the function and assert that the number of revocations matches the number of objects created.

## 5. Project Structure
- **Scenarios (Documentation)**: `tests/scenarios/` (Markdown files describing the test steps).
- **E2E Specs**: `tests/e2e/` (Actual Playwright spec files).
- **Page Objects (POM)**: `tests/pages/` (Classes representing UI pages and actions).

## 6. Multi-User & Security (Rule 07 & 10)
- **Isolation**: Use separate `BrowserContext` instances for multi-user scenarios (e.g., Sender vs. Recipient).
- **Protocol Compliance**: Assertions must verify the encryption protocol. Verify that ZWC (Zero Width Characters) and Stealth IDs (Poetry) conform to the encryption-protocol.md definitions.

## 7. Autonomous Correction & Zero Masking
- **MANDATORY**: Fix the ROOT CAUSE of a test failure (only if it is within the test file or a missing `data-testid`).
- **FORBIDDEN**: Using `try-catch` to hide assertion failures or using `page.waitForTimeout` (use web-first assertions instead).
- **Deterministic Results**: Tests must pass 100% of the time in a clean environment.

## 8. Git Lifecycle Integration
- **MANDATORY**: Before issuing a "ready to push" command, you must run `npm run test:e2e`, `npm run lint`, and `npm run build`.
- **Automatic Commit**: If all checks pass, commit with a professional English message.
