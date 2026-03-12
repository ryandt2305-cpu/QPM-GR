# Changelog

All notable changes to QPM-GR are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [3.1.14] - Current

### Added
- Sprite-v2: added a native decoder path for Magic Garden v114+ compressed (`.ktx2`) atlases so sprites load from the current runtime version instead of relying on cross-version compatibility fallbacks.
- Decoder pipeline now reports per-atlas hydration/source telemetry in `spriteBootReport()` (expected vs hydrated frames, source mode, and decoder success/failure counters) to make runtime verification deterministic.
- Compressed atlas handling is now stable through the in-script decoder flow, with compatibility behavior preserved for pre-v114 legacy image atlases.

### Notes
- if youre reading this hello, i hope you have a good day

---

## [3.1.13]

### Changed
- Pet Teams: hutch-balanced apply now pairs hutch pulls with outgoing active pets (favorited pets preferred) and reports clearer failure reasons
- Activity Log: added extended native activity logging and enabled the Utility Hub Activity Log card by default (customize choices persist)

---

## [3.1.12]

### Changed
- fixed Bulk Favorite, added toggle in Utility

---

## [3.1.11]

### Changed
- removed default pets keybind

---

## [3.1.1]

### Changed
- Feeding: detached instant feed buttons now resolve per-pet diets/allowed food totals per active slot
- Pet Optimizer: Double Harvest and Crop Refund compare/obsolete logic now ranks per ability family (Top 3 kept per family)
- Pet Teams: Sell All keybind location is now in the settings gear cog inside the Pet Teams window

---

## [3.1.09]

### Changed
- fix feed cards

---

## [3.1.08]

### Changed
- slot specific diet quantity

---

## [3.1.07]

### Changed
- Anti-AFK

---

## [3.1.06]

### Changed
- Pets: Shift can now be used as a modifier key for team keybinds
- Teams: added polished ability value badges with accurate Hunger Restore team-based calculations
- Feeding: feed buttons now show how much selected food remains in inventory
- Pet Optimizer: each ability section now includes `Create Team` from your top 3 pets

---

## [3.1.05]

### Changed
- Standardized one emoji-safe font fallback stack across panel and feature window roots
- Removed temporary mojibake text-repair observer workaround

### Fixed
- Icon/symbol glyphs rendering as `??` in panel labels, tabs, and buttons

---

## [3.1.0]

### Changed
- XP Tracker, Ability Tracker, and Turtle Timer windows rebuilt with cleaner, smarter layouts
- `src/ui/originalPanel.ts` refactored from a single 8,700-line monolith into modular files:
  - `src/ui/panelHelpers.ts` â€” shared formatters and UI helpers
  - `src/ui/panelState.ts` â€” UIState interface and factory
  - `src/ui/panelStyles.ts` â€” all CSS/style injection
  - `src/ui/abilityAnalysis.ts` â€” ability computation logic
  - `src/ui/turtleTimerLogic.ts` â€” turtle timer update logic
  - `src/ui/notificationSection.ts` â€” notification section and state
  - `src/ui/shopHistoryWindow.ts` â€” shop history modal
  - `src/ui/sections/` â€” 10 individual section builders

### Removed
- Dead `createJournalCheckerSectionOld` function (unused)
- Firebase dependency and `src/config/` (replaced by Aries API)
- `git` package (unused)
- `jsdom` and `jszip` moved from `dependencies` to `devDependencies` (build scripts only)

---

## [3.0.6x] â€” Stability & Fixes

### Fixed
- Missing import in `xpTrackerWindow` (v3.0.59)
- XP Tracker strength calculations and slot 2 data issues
- Bulk favorite sidebar positioning â€” uses stable container bounds, no longer shifts when inventory filters are applied (v3.0.51)
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

## [3.0.5x] â€” Foundation

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
- Sprite system (sprite-v2) via PIXI hook â€” no hardcoded atlas access
- Runtime catalog capture via Object.* hook â€” no hardcoded game data
- Jotai store bridge for reactive state access
- GM_* storage wrapper with localStorage fallback

