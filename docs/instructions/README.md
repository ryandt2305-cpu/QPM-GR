# QPM-GR Instructions Pack

Quick reference docs to load into Cursor when working on QPM-GR. Keep prompts scoped, point at the right files, and avoid touching generated artifacts.

## Files
- `context-map.md`: What lives where in the repo and which files are source of truth.
- `prompting-playbook.md`: How to structure prompts and reset context.
- `common-ai-mistakes.md`: Guardrails for this codebase.
- `component-patterns.md`: Where to copy existing patterns (UI, features, stores, utils).
- `security-checklist.md`: Userscript-specific safety checks.
- `prompt-library.md`: Reusable prompt snippets for reviews/refactors/tests.

## When to load
- Starting a feature or refactor: load `context-map.md`, `component-patterns.md`, `common-ai-mistakes.md`.
- Debugging/QA: add `security-checklist.md` and relevant sections from `prompt-library.md`.
