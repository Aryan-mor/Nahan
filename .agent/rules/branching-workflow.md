---
trigger: manual
---

# Branching Strategy & Workflow

## 1. Automatic Branching for Features & Fixes
- **Trigger**: When the user requests a new feature implementation or asks to fix a bug.
- **Rule**: You MUST create and switch to a new git branch before writing any code.
- **Naming Convention**:
  - For features: `feat/<short-description>` (e.g., `feat/biometric-unlock`)
  - For bugs: `fix/<issue-description>` (e.g., `fix/clipboard-crash`)
  - For refactoring: `refactor/<scope>` (e.g., `refactor/message-store`)

## 2. Workflow Sequence
1. **Analyze Request**: Determine if it is a `feat`, `fix`, or `refactor`.
2. **Create Branch**: Run `git checkout -b <branch-name>`.
3. **Confirm**: Notify the user that you are working on the new branch.
