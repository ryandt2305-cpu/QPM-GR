# Prompt Library

Drop these into Cursor and fill in specifics.

## Review a change
> Review the diff in `FILE(S)` for correctness, unintended side effects, and perf. Confirm no edits to generated outputs (`dist/`, `*.user.js`). List risks and concrete fixes.

## Refactor safely
> Refactor `FILE` to improve readability without changing public API. Keep function signatures and exports intact. Preserve behavior of timers, storage keys, and DOM selectors. Show the minimal diff.

## Add logging
> Add console logging around `FUNCTION` in `FILE` to trace inputs/outputs and errors. Avoid noisy per-frame logs. Include a short note on how to disable/remove logs.

## Add a feature slice
> Implement `FEATURE` in `TARGET_FILES`. Reuse patterns from `component-patterns.md` (e.g., start/init functions, store hooks, UI window toggles). Do not touch generated files. List manual verification steps.

## Sanity-check data changes
> Given updates to `src/data/FILE`, verify that field names and shapes still match consumers in `src/store/*` and `src/features/*`. Flag any mismatches and propose minimal fixes.
