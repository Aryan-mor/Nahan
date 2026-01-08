# Playwright Testing Rules

These rules must be followed when creating or modifying E2E tests.

1. **Context First**: Always read this file before creating or modifying tests.

2. **Selectors (UPDATED)**: 
   - **MANDATORY**: Use data-testid attributes for selecting elements.
   - **MANDATORY**: Verify screens using root locator data-testid.
   - **FORBIDDEN**: getByText and regex text matching for structural verification.
   - Example: page.getByTestId('submit-button') instead of page.getByText('Submit').

3. **Data Integrity (Deletion)**: 
   - Every deletion scenario MUST include a "Technical Check".
   - You must verify via page.evaluate that the item is physically removed from IndexedDB.
   - Mere UI invisibility is insufficient.

4. **Memory Management (Images)**: 
   - Every test involving image deletion MUST spy on and verify URL.revokeObjectURL.
   - Ensure the count of revoked URLs matches the number of deleted images to prevent memory leaks.

5. **Project Structure**:
   - **Scenarios**: 	ests/scenarios/ (Markdown files)
   - **E2E Tests**: 	ests/e2e/ (Spec files)
   - **Page Objects**: 	ests/pages/ (POM classes)


6. Multi-User Testing (Rule 07):
   - Use isolated BrowserContext instances for each user.

7. Autonomous Correction & Zero Masking (Rule 08):
   - MANDATORY: Agents must fix root causes of test failures.
   - FORBIDDEN: Using try-catch to bypass assertions.
   - Tests must be deterministic.
