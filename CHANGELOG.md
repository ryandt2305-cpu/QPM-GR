# Changelog

All notable changes to QPM-GR are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [3.0.64] — Current

### Changed
- XP Tracker, Ability Tracker, and Turtle Timer windows rebuilt with cleaner, smarter layouts
- `src/ui/originalPanel.ts` refactored from a single 8,700-line monolith into modular files:
  - `src/ui/panelHelpers.ts` — shared formatters and UI helpers
  - `src/ui/panelState.ts` — UIState interface and factory
  - `src/ui/panelStyles.ts` — all CSS/style injection
  - `src/ui/abilityAnalysis.ts` — ability computation logic
  - `src/ui/turtleTimerLogic.ts` — turtle timer update logic
  - `src/ui/notificationSection.ts` — notification section and state
  - `src/ui/shopHistoryWindow.ts` — shop history modal
  - `src/ui/sections/` — 10 individual section builders

### Removed
- Dead `createJournalCheckerSectionOld` function (unused)
- Firebase dependency and `src/config/` (replaced by Aries API)
- `git` package (unused)
- `jsdom` and `jszip` moved from `dependencies` to `devDependencies` (build scripts only)

---

## [3.0.6x] — Stability & Fixes

### Fixed
- Missing import in `xpTrackerWindow` (v3.0.59)
- XP Tracker strength calculations and slot 2 data issues
- Bulk favorite sidebar positioning — uses stable container bounds, no longer shifts when inventory filters are applied (v3.0.51)
- Crop size indicator updated with catalog integration for new plants
- Journal badges updated for new plant types via catalog integration

### Added
- Garden Filters feature
- Egg Indicator feature (egg mutation probability display)
- Correct egg mutation calculation

### Changed
- Auto-favorite rules updated

---

## [3.0.54]

### Added
- Pony / Horse / Firehorse pet metadata

---

## [3.0.5x] — Foundation

### Added
- Initial public release structure
- Pet Hub Analytics (compare pets, ability uptime, rarity/level display)
- Auto-favorite system (configurable rules for pets and crops)
- Bulk favoriting (crop-type locking)
- Journal Checker with sprite display and progress tracking
- Ability Tracker (real-time proc logging and contribution analysis)
- Shop Restock Tracker with dual prediction system (time-based + window-based)
- Discord HTML import for historical restock data
- Turtle Timer (plant/egg/support timing for Turtle pets)
- XP Tracker (session XP, XP/min, XP/hour)
- Crop Size Indicator (floor-accurate size display)
- Weather Hub (current weather, mutation opportunity alerts)
- Notification system (mutations, restocks, harvest reminders)
- Aries Mod bridge integration (read-only snapshot export)
- `QPM_DEBUG_API` global for in-browser debugging

### Infrastructure
- TypeScript strict mode throughout
- Vite IIFE bundle + userscript header wrapper (`scripts/build-userscript.js`)
- Sprite system (sprite-v2) via PIXI hook — no hardcoded atlas access
- Runtime catalog capture via Object.* hook — no hardcoded game data
- Jotai store bridge for reactive state access
- GM_* storage wrapper with localStorage fallback

