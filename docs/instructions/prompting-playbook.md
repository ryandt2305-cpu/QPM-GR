# Prompting Playbook

Guidelines to keep prompts effective and scoped for QPM-GR.

## Before you ask
- Clarify the goal, expected behavior, and acceptance checks.
- List target files from `context-map.md` (e.g., `src/features/cropTypeLocking.ts`, `src/ui/publicRoomsWindow.ts`).
- Call out what must **not** change (e.g., no edits to `dist/`, no schema changes in `data/` tables).

## Prompt shape
- Small batches: request 1–3 changes per message; avoid “build the whole feature” asks.
- Provide diffs/lines where possible; mention existing patterns to mirror from `component-patterns.md`.
- Include guard clause: “Do not change anything beyond X/Y.”

## When context bloats
- Start a fresh chat after long sessions; re-share: goal, relevant files, and any prior decisions.

## Error loops
- After ~3 failed attempts, restate the goal, supply logs/errors, and constrain the scope further or revert to last good state.

## Testing/verification
- Ask for minimal checks relevant to the change (e.g., “explain how to sanity-check the Aries public rooms panel”).
