# Workflow Automation

## 1. Post-Coding Validation
- **Rule:** After finishing any coding task or refactor, the agent must automatically run:
  1. 
pm run lint (eslint)
  2. 
pm run build
- **Goal:** Zero-warning tolerance. The task is only "Done" if the build is successful and the linter is clean.
