# QPM-GR Cursor Rules (Detailed, Repo-Specific)

You are an expert TypeScript userscript developer maintaining **QPM-GR** (Quinoa Pet Manager – Garden Rooms). Follow these rules precisely for any edit, review, or plan in this repo.

## Scope & Source of Truth
- **Source**: `src/`, `scripts/`, `scraped-data/`, `docs/`.
- **Generated (do NOT edit)**: `dist/`, root `*.user.js`, `main-*.js`, `.d.ts` files. Change source, then rebuild.
- **Unused**: `src/config/firebase.*` templates exist; Firebase is **not used**. Do not add Firebase logic or secrets.
- **Entry point**: `src/main.ts` wires features, UI, stores, and sprite system.

## Architecture & Patterns to Mirror
- **Features (`src/features/*`)**: Expose `start*/init*/initialize*` functions (e.g., `startCropTypeLocking`, `initPublicRooms`, `initializeAutoFavorite`). Maintain signatures unless explicitly requested. Use existing debouncing/timer patterns in features like `mutationReminder`, `turtleTimer`, `shopRestockTracker`.
- **UI windows/overlays (`src/ui/*`)**: Mirror lifecycle and DOM scaffolding from `originalPanel.ts`, `modalWindow.ts`, `publicRoomsWindow.ts`, `petHutchWindow.ts`, `xpTrackerWindow.ts`. Ensure create/destroy/cleanup symmetry and keep toggle functions intact.
- **Stores (`src/store/*`)**: Follow init + selectors pattern (`inventory.ts`, `stats.ts`, `achievements.ts`, `xpTracker.ts`, `pets.ts`). Keep storage keys/persistence unchanged unless requested. Respect jotai bridge patterns in `core/jotaiBridge.ts`.
- **Sprites (`src/sprite-v2/*`)**: Stay consistent with `index.ts`, `compat.ts`, `renderer.ts`, `manifest.ts`. Do not invent new resource keys; reuse existing manifest and warmup patterns.
- **Networking**: Aries API only, via `GM_xmlhttpRequest` in `src/services/ariesRooms.ts` and `integrations/ariesBridge.ts`. Keep headers/URLs explicit; no hidden fetches. Validate response shapes.
- **Scripts**: `scripts/build-userscript.js`, `scrape-game-data.js`, `parse-discord-html.js`, `diagnose-discord-html.js`. Preserve side-effect order unless there is a stated reason to change.
- **Data**: Static tables in `src/data/*` and `scraped-data/*.json` are canonical; keep shapes stable. Utilities like `src/utils/gardenData.ts` rely on them.
- **Reference projects**: Use as behavioral/style guides (no verbatim copying):
  - **MagicGarden-modMenu**: HUD + menu helper in `src/ui/hud.ts`/`menu.ts`; per-feature menus under `src/ui/menus/*`; WebSocket hook (`hooks/ws-hook`) that intercepts page WS early; sprite cache warmup via `ui/spriteIconCache.ts`; anti-AFK nudges in `utils/antiafk`; Aries Mod API install + localStorage migration utilities; draggable windows with position persistence; debug overlays (Jotai explorer, sprite/audio/ws inspectors). Preserve similar ergonomics: fast-mount HUD, persistent window state, early WS hook, sprite warmup before UI render.
  - **MGTools**: Modular controller/core/ui split (e.g., `controller/room-poll.js` for periodic room checks, `controller/version-check.js` for remote version fetch, `controller/shortcuts.js` for global hotkeys; `core/network.js`/`core/storage.js` wrapping `GM_xmlhttpRequest` and `GM_*Value`; `ui/connection-status.js`, `ui/version-badge.js`, `ui/hotkey-help.js` for status badges and help overlays). Tampermonkey metadata targets multiple MG domains + Discord embeds. Use as guidance for: robust GM storage wrappers, network helpers, connection/version badges, multi-domain match patterns, hotkey help, and room polling cadence—adapt to our Aries-based flow without copying code.

## Coding Style (TS/JS)
- Prefer `const`; narrow types; avoid `any`/implicit `any`. Explicit return types on exported functions.
- Small, focused functions; use early returns to reduce nesting. Keep side effects contained to stores or explicit effect handlers.
- Descriptive names with auxiliaries (`isLoading`, `hasError`, `shouldRetry`). Preserve existing public API names and shapes.
- Error handling: check null/shape for external data (Aries responses, scraped JSON). Log concise errors; avoid noisy per-frame logs.
- No silent failures: handle Promise rejections; guard DOM queries (use `waitFor` where appropriate from `src/utils/dom.ts`).
- Keep DOM selectors and storage keys stable unless explicitly changing them.

## Data & Types
- Keep field names/shapes in `src/data/*` and `src/types/*` stable. If a schema change is required, call it out and update all consumers in `features/`, `store/`, `ui/`.
- Do not mutate shared data tables in-place unless that is the established pattern; prefer derived copies for transformations.

## Change Boundaries
- Touch only files explicitly in scope. Do not “drive-by” edit unrelated code.
- Never edit generated outputs (`dist/`, `*.user.js`, `main-*.js`, `.d.ts`).
- If adding dependencies, update both `package.json` and `package-lock.json`.
- Keep Tampermonkey metadata blocks intact in built userscripts.
- Preserve public exports used by `src/main.ts` and UI windows unless requested to change.

## Security & Privacy
- **No secrets in code.** Do not add API keys, tokens, or Firebase configs.
- Validate and sanitize external data before use; avoid injecting untrusted strings into HTML without escaping.
- Keep Aries requests explicit; no dynamic URL construction from untrusted input.
- Avoid leaking stack traces to UI; console logging is acceptable.
- Be mindful of polling/intervals—avoid excessive network or DOM churn.

## Performance & Resource Management
- Avoid unnecessary DOM queries inside tight loops; reuse references when possible.
- Avoid heavy logging or per-frame console output; prefer targeted, removable logs.
- For sprite operations, avoid duplicating texture lookups; reuse cache helpers in `sprite-v2`.
- In scripts, avoid large in-memory copies of scraped data; stream/iterate when practical.

## Build & Run (reference only, do not rewrite without request)
- `npm run build`
- `npm run build:userscript`
- `npm run dev`
- `npm run preview`
- `npm run scrape-game-data`
- `npm run parse-discord-html` (already configured with increased memory)

## Prompt Hygiene (when asking the model)
- Keep asks to 1–3 concrete edits. Name target files. Add: “Do not change anything else or any generated files.”
- If context grows large, restate goal + target files before continuing.
- If three attempts fail, restate constraints and narrow the scope.

## Verification Expectations
- Describe manual sanity checks relevant to touched code (e.g., public rooms panel load/search, crop locking behavior, sprite overlays rendering, timers firing, store state persistence).
- Prefer lightweight, removable logging; avoid permanent noisy logs.
- No test suite exists; suggest minimal manual steps instead of adding heavy test infra unless requested.

## Refactors & Safety
- Maintain function signatures and exports used by `src/main.ts`, `ui/*`, and `store/*` unless explicitly told to change.
- Preserve storage keys, cache keys, and DOM selectors unless change is requested and coordinated.
- Do not reorder script side effects without rationale.

## If in doubt
- Ask for clarification on scope, target files, acceptance criteria, and allowed changes before altering behavior or APIs.
