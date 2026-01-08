# Coding Standards

## 1. Test IDs
- **Rule:** All interactive elements (buttons, links, inputs, and clickable icons) MUST have a data-testid attribute.
- **Root Elements:** Every screen/view MUST have a unique data-testid on its root element (e.g., data-testid="pin-create-screen").
- **Prohibited:** Usage of getByText or regex-based text matching for verifying screen visibility is STRICTLY FORBIDDEN.
- **Reasoning:** To ensure E2E tests (Playwright) remain robust and independent of CSS/UI changes and translations.
- **Enforcement:** Any code produced without data-testid is considered incomplete. Tests using getByText will be rejected.
