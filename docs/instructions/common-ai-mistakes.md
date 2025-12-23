# Common AI Mistakes to Avoid

Guardrails tailored to QPM-GR.

- **Do not edit generated output**: `dist/`, root `*.user.js`, `main-*.js`, or `.d.ts` files. Source changes belong in `src/` and `scripts/`.
- **No secret keys**: frontend/userscript code must not contain secrets. `config/firebase.*` exists but Firebase is not used; do not reintroduce it.
- **Preserve data shapes**: keep structures in `src/data/*`, `src/types/*`, and store outputs consistent; do not rename fields without explicit request.
- **Keep APIs stable**: functions consumed by `src/main.ts` and UI windows (e.g., `togglePetHutchWindow`, `initPublicRooms`, `startCropTypeLocking`) must keep signatures unless requested.
- **Do not alter network plumbing**: `services/ariesRooms.ts` and `integrations/ariesBridge.ts` rely on `GM_xmlhttpRequest`; keep that wiring intact unless specifically changing network behavior.
- **Leave build scripts predictable**: `scripts/build-userscript.js`, `scrape-game-data.js`, `parse-discord-html.js` have side-effect flows; do not reorder steps without reason.
