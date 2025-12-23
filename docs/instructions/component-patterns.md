# Component Patterns

Pointers to copy existing patterns instead of inventing new ones.

## UI
- Window scaffolding: `src/ui/originalPanel.ts`, `src/ui/modalWindow.ts` for layout/DOM wiring.
- Feature-specific windows: `src/ui/publicRoomsWindow.ts`, `src/ui/petHubWindow.ts`, `src/ui/petHutchWindow.ts`, `src/ui/xpTrackerWindow.ts` show how to mount controls, toggle visibility, and hook stores.
- Overlays/graphics: `src/ui/gardenHighlightOverlay.ts` and other overlays follow a create/destroy lifecycle; mirror their cleanup.

## Features
- Start/initialize pattern: most features expose `start*`/`init*` functions (e.g., `startCropTypeLocking`, `initializeHarvestReminder`, `initPublicRooms`, `initializeAutoFavorite`) that wire into stores and UI. Reuse that shape for new features.
- Cross-feature helpers: check `src/features/mutationReminder.ts`, `src/features/shopRestockTracker.ts`, `src/features/valueCalculator.ts` for how to subscribe to stores and debounce updates.

## Stores
- Use existing stores as templates for state and persistence: `src/store/inventory.ts`, `src/store/pets.ts`, `src/store/stats.ts`, `src/store/achievements.ts`, `src/store/xpTracker.ts`. They expose init/setup functions plus readers/selectors; keep that API style for new state.

## Sprite system
- Follow `src/sprite-v2/index.ts` and `src/sprite-v2/compat.ts` for sprite registration and debug hooks. Avoid diverging from manifest/renderer patterns already established.

## Utilities & data
- DOM helpers: `src/utils/dom.ts` (ready/sleep/query/waitFor/addStyle).
- Logging: `src/utils/logger.ts`.
- Storage: `src/utils/storage.ts` handles persistence; reuse it for new keys.
- Data loaders: `src/data/*` and `src/utils/gardenData.ts` show how data tables are shaped; match their formats.

## Scripts
- Build pipeline: `scripts/build-userscript.js`.
- Data ingest: `scripts/scrape-game-data.js`, `scripts/parse-discord-html.js`, `scripts/diagnose-discord-html.js`—follow existing flow if extending.
