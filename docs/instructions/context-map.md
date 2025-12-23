# Context Map

Authoritative map of what lives where. Use this to give Cursor precise file context.

## Top-level
- `src/`: Source of truth for the userscript. Entry: `src/main.ts`.
- `scripts/`: Node helpers (`build-userscript.js`, `scrape-game-data.js`, `parse-discord-html.js`, `diagnose-discord-html.js`, etc.).
- `scraped-data/`: Canonical JSON inputs (`abilities.json`, `crops.json`, `pets.json`) used by data loaders and tests.
- `dist/`: Generated output (types and bundles); do not hand-edit.
- `docs/`: Product/engineering docs (being reorganized); `docs/instructions` is the AI-facing pack.
- Root artifacts: built userscripts (`quinoa-pet-manager.user.js`, `sprite.user.js`, `main-*.js`) are generated.

## `src/` layout
- `features/`: Feature logic (e.g., `cropTypeLocking.ts`, `mutationReminder.ts`, `publicRooms.ts`, `shopRestock*`, `turtleTimer.ts`).
- `ui/`: UI windows/overlays (`originalPanel.ts`, `modalWindow.ts`, `petHubWindow.ts`, `publicRoomsWindow.ts`, etc.).
- `store/`: State and side-effect management (`achievements.ts`, `inventory.ts`, `pets.ts`, `stats.ts`, `xpTracker.ts`).
- `sprite-v2/`: Sprite system (`index.ts`, `compat.ts`, `renderer.ts`, `hooks.ts`, `manifest.ts`).
- `integrations/`: External bridges, e.g., `ariesBridge.ts`.
- `services/`: Aries API clients (`ariesRooms.ts`, `ariesPlayers.ts`); uses `GM_xmlhttpRequest`, **not Firebase**.
- `config/`: Firebase templates (`firebase.config.ts` and `.template.ts`) are present but currently unused.
- `core/`: Glue (`atomRegistry.ts`, `jotaiBridge.ts`, `notifications.ts`, `pageContext.ts`).
- `data/`: Static data tables (`abilityGroups.ts`, `petMetadata.ts`, `weatherEvents.ts`, etc.).
- `types/`: Shared types (`gameAtoms.ts`, `publicRooms.ts`, `shops.ts`).
- `utils/`: Helpers (`dom.ts`, `logger.ts`, `storage.ts`, `virtualScroll.ts`, `petDataTester.ts`, `versionChecker.ts`).

## Build & run
- Build: `npm run build`
- Bundle userscript: `npm run build:userscript`
- Watch: `npm run dev`
- Preview: `npm run preview`
- Data tasks: `npm run scrape-game-data`, `npm run parse-discord-html` (increase memory via `--max-old-space-size` already set)

## Generated vs source of truth
- **Source of truth:** everything under `src/`, `scripts/`, `scraped-data/`, and markdown docs.
- **Generated:** `dist/`, root `*.user.js`, `main-*.js`, and type `.d.ts` files. Do not edit these directly.
