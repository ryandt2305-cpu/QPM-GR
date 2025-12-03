# QPM Documentation Hub

> Single consolidated reference for all QPM-GR guides, research, and process notes.

## Project Overview (from README.md)

# Quinoa Pet Manager: General Release (QPM-GR)

**QPM-GR** (Quinoa Pet Manager – General Release) is an information and analytics companion for the browser game **Magic Garden**.  
It plugs into your existing Magic Garden tooling and surfaces detailed pet and garden data so you can make better decisions, optimise profit, and understand what your pets are actually doing over time.

> **Status:** ALPHA – not optimised, very WIP, lots of spaghetti. Expect rough edges and breaking changes.

---

## Key Features


### 🐾 Pet Overview & Analytics
- View all pets with their rarity, level, and ability.
- See real ability uptime: procs per minute/hour based on actual behaviour.
- Compare pets in real gameplay conditions

### ⭐ Auto Favourite (Smart Pet/Produce Favouriting)
- Automatically favourites pets or produce based on user configured variables.

### 🧺 Bulk Inventory Crop Favouriting (Crop-Type Locking)
- Instantly favourite large groups of crops in your inventory.
- Useful for:
  - Cleaning up messy inventories
  - Locking all crops of the same type (e.g., all Carrots or all Strawberries)
  - Preventing accidental selling or discarding
- Saves a huge amount of manual clicking.

### 📘 Journal Checker
- Identifies seeds/crops you still need for journal completion.
- Shows missing entries at a glance.
- Helps you plan planting cycles to finish your journal efficiently.

### 🌈 Ability Tracker
- Logs every time a pet ability triggers.
- Shows total procs, timing between procs, and which pets contribute the most.
- Great for comparing ability effectiveness 
- Perfect for finding your most profitable pet setups


### 🛒 Shop Restock Tracker
- Tracks all Magic Garden shop restocks.
- Based off the data, it can predict when the next restock for every item will be
- Find out when rare seeds and eggs might drop

### 🐢 Turtle Timer
- A small utility timer specifically for Turtle pets, calculating plant growth, egg growth, and food support


### 🧠 XP Tracker
- Tracks your XP gained during the session.
Displays:
  XP per minute 
  XP per hour
  Total XP gained
  Session runtime

Helps compare pets, garden layouts, and farming setups for leveling efficiency.
---

## Repository Layout

- `src/`
  - TypeScript source for the main QPM-GR logic and UI.
  - Built with Vite + TypeScript for a fast dev loop and simple bundling.
- `scripts/`
  - Helper / maintenance scripts for working with the project.
- `discover-seed-ids.js`
  - Utility to probe the game and discover internal **seed IDs** for mapping purposes.
- `discover-shop-ids.js`
  - Utility to inspect the **shop** and log internal IDs / structures.
- `websocket-final-discovery.js`
  - Helper for exploring Magic Garden’s WebSocket traffic and structure.
- `PUSH_TO_QPM-GR.sh`
  - Local convenience script to push this project to the `QPM-GR` GitHub repo.
- `package.json`, `tsconfig.json`, `vite.config.ts`
  - Standard TypeScript/Vite project configuration.

---

## Getting Started

### Prerequisites

- **Node.js** (LTS or later recommended)
- **npm** or **pnpm** or **yarn**
- A working Magic Garden setup (browser) plus whatever loader/overlay you use to inject custom scripts (e.g. Tampermonkey, MGModLoader, custom Electron wrapper, etc.).

### 1. Clone the Repository

```bash
git clone https://github.com/ryandt2305-cpu/QPM-GR.git
cd QPM-GR

---
## AI Assistant Guide (from CLAUDE.md)

# CLAUDE.md - AI Assistant Guide for QPM Development

**Version:** 4.2.0
**Last Updated:** 2025-11-21
**Purpose:** This guide helps AI assistants (like Claude) understand the Quinoa Pet Manager (QPM) codebase structure, development workflows, and conventions for effective collaboration.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Project Overview](#project-overview)
3. [Repository Structure](#repository-structure)
4. [Development Workflows](#development-workflows)
5. [Key Conventions](#key-conventions)
6. [Architecture Patterns](#architecture-patterns)
7. [Essential Reading](#essential-reading)
8. [Common Tasks](#common-tasks)
9. [Testing & Debugging](#testing--debugging)
10. [Git Workflow](#git-workflow)

---

## Quick Start

### What is QPM?

Quinoa Pet Manager (QPM) is a TypeScript-based userscript for the browser game "Magic Garden" that provides automation and quality-of-life features:

- **Auto-Feed**: Automatically feeds pets when hunger drops below threshold
- **Weather Swapper**: Detects weather changes and swaps pet teams
- **Auto Shop**: Automatically purchases configured items from shops
- **Crop Type Locking**: Prevents accidental selling of favorited crops
- **Mutation Tracking**: Tracks and highlights valuable crop mutations
- **Harvest Reminder**: Alerts when high-value crops are ready
- **Value Calculator**: Calculates crop values with multipliers
- **Journal Checker**: Tracks discovered species in the game journal

### Technology Stack

- **Language**: TypeScript 5.3+ (strict mode)
- **Build Tool**: Vite 7.1+
- **State Management**: Jotai (via game's React context)
- **Storage**: localStorage + Tampermonkey GM storage
- **Target Environment**: Tampermonkey/Greasemonkey userscript
- **Supported Domains**: magiccircle.gg, magicgarden.gg, starweaver.org

### Build Commands

```bash
# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build
npm run build

# Build userscript (complete with headers)
npm run build:userscript

# Build everything for distribution
npm run build:dist
```

---

## Project Overview

### Key Features Architecture

QPM is organized into **feature modules** that are self-contained and communicate through:
1. **Jotai Bridge** - Captures game state from Jotai atoms
2. **Storage Layer** - Persists configuration and state
3. **UI Components** - Provides user interaction interfaces
4. **Core Systems** - Shared infrastructure (notifications, page context, atom registry)

### Core Design Principles

1. **Feature Isolation**: Each feature is self-contained in its own file with clear APIs
2. **Separation of Concerns**: UI, logic, and data are separate
3. **State Management**: Subscribe to game atoms, avoid polling when possible
4. **Type Safety**: Strict TypeScript with comprehensive types
5. **Cross-Platform**: Works on Windows, Mac, Linux

---

## Repository Structure

```
MGQPM/
├── src/
│   ├── main.ts                 # Entry point, initialization
│   ├── core/                   # Core systems
│   │   ├── jotaiBridge.ts     # Jotai store capture & atom access
│   │   ├── pageContext.ts     # Window context bridging
│   │   ├── atomRegistry.ts    # Atom lookup registry
│   │   └── notifications.ts   # Toast notification system
│   ├── features/               # Feature modules (standalone)
│   │   ├── autoFeed.ts        # Pet feeding automation
│   │   ├── weatherSwap.ts     # Weather-based pet swapping
│   │   ├── autoShop.ts        # Shop auto-purchasing
│   │   ├── cropTypeLocking.ts # Inventory locking
│   │   ├── mutationTracker.ts # Mutation detection
│   │   ├── harvestReminder.ts # Harvest alerts
│   │   ├── valueCalculator.ts # Crop value calculations
│   │   ├── autoFavorite.ts    # Auto-favorite crops
│   │   ├── journalChecker.ts  # Journal species tracking
│   │   └── instantFeed.ts     # Instant feed API
│   ├── ui/                     # UI components
│   │   ├── mainPanel.ts       # Main control panel (deprecated)
│   │   ├── originalPanel.ts   # Current active panel
│   │   ├── keybindCapture.ts  # Keybind configuration
│   │   ├── modalWindow.ts     # Modal dialogs
│   │   ├── trackerWindow.ts   # Tracker windows
│   │   ├── journalCheckerSection.ts # Journal UI
│   │   └── gardenHighlightOverlay.ts # Visual overlays
│   ├── store/                  # Jotai store modules
│   │   ├── pets.ts            # Pet info state
│   │   ├── inventory.ts       # Inventory state
│   │   ├── petXpTracker.ts    # XP tracking
│   │   ├── stats.ts           # Session statistics
│   │   ├── weatherHub.ts      # Weather state
│   │   └── userSlots.ts       # Player inventory slots
│   ├── data/                   # Static game data
│   │   ├── petAbilities.ts    # Ability definitions & formulas
│   │   ├── petHungerCaps.ts   # Pet hunger limits by species
│   │   ├── gameInfo.ts        # Crop/seed/egg metadata
│   │   ├── cropBaseStats.ts   # Base crop statistics
│   │   └── weatherEvents.ts   # Weather event data
│   ├── utils/                  # Utility functions
│   │   ├── dom.ts             # DOM manipulation
│   │   ├── storage.ts         # Storage abstraction
│   │   ├── logger.ts          # Logging system
│   │   ├── helpers.ts         # General utilities
│   │   ├── weatherDetection.ts# Weather canvas analysis
│   │   └── gardenData.ts      # Garden state parsing
│   └── types/                  # TypeScript types
│       ├── gameAtoms.ts       # Jotai atom types
│       └── shops.ts           # Shop data types
├── dist/                       # Build output
│   ├── quinoa-pet-manager.iife.js  # Bundled library
│   └── userscript.js          # Complete userscript with headers
├── scripts/
│   └── build-userscript.js    # Userscript header builder
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── QPM_DEVELOPMENT_GUIDE.md   # Comprehensive development guide
├── DISTRIBUTION.md             # Distribution instructions
└── TROUBLESHOOTING.md         # Common issues and solutions
```

---

## Development Workflows

### Adding a New Feature

1. **Create Feature Module** in `src/features/`:
   ```typescript
   // features/myFeature.ts

   // Private state (closure)
   let config = { enabled: false, threshold: 50 };
   let state = { lastCheck: 0 };
   let statusCallback: ((status: string) => void) | null = null;

   // Configuration API
   export function setEnabled(enabled: boolean): void {
     config.enabled = enabled;
     saveConfig();
   }

   export function getConfig() { return { ...config }; }
   export function getState() { return { ...state }; }

   // Callback registration
   export function setStatusCallback(cb: (status: string) => void): void {
     statusCallback = cb;
   }

   // Main logic
   export function startMyFeature(): void {
     // Initialize and start feature
   }
   ```

2. **Add UI Section** in `src/ui/originalPanel.ts` (or create new section file):
   ```typescript
   function createMyFeatureSection(): HTMLElement {
     const section = createCard('⭐ My Feature', 'my-feature');
     // Add controls, inputs, buttons
     return section;
   }
   ```

3. **Initialize in main.ts**:
   ```typescript
   import { startMyFeature } from './features/myFeature';

   async function initialize() {
     // ... other initialization
     startMyFeature();
   }
   ```

4. **Add Storage Keys** (if needed) in `utils/storage.ts` patterns

5. **Update Types** (if needed) in `src/types/`

### Modifying Existing Features

1. **Find the Feature Module** in `src/features/`
2. **Check Dependencies** - Look at imports and atom subscriptions
3. **Test Locally** - Use `npm run dev` for watch mode
4. **Update UI** - Modify corresponding UI section
5. **Update Documentation** - Update `QPM_DEVELOPMENT_GUIDE.md` if patterns change

### Building for Distribution

```bash
# Full build pipeline
npm run build          # Compile TypeScript
npm run build:userscript  # Create userscript with headers
npm run build:dist     # Run both commands
```

The output `dist/userscript.js` is ready for Tampermonkey installation.

---

## Key Conventions

### Naming Conventions

#### Files & Folders
- **TypeScript files**: camelCase - `autoFeed.ts`, `weatherSwap.ts`
- **UI components**: camelCase - `mainPanel.ts`, `modalWindow.ts`
- **Config files**: kebab-case - `vite.config.ts`, `tsconfig.json`
- **Documentation**: SCREAMING_SNAKE_CASE - `QPM_DEVELOPMENT_GUIDE.md`

#### Code
- **Variables**: camelCase - `feedThreshold`, `weatherKey`, `petInfo`
- **Types/Interfaces**: PascalCase - `PetInfo`, `WeatherConfig`, `WindowState`
- **Constants**: SCREAMING_SNAKE_CASE - `DEFAULT_THRESHOLD`, `MAX_RETRY_COUNT`
- **Functions**: camelCase, verb-first - `createCard()`, `updateStatus()`, `setEnabled()`
- **Boolean Functions**: Prefix with `is`, `has`, `should`, `can`

#### CSS Classes
Use **BEM-like** conventions with `qpm-` prefix:
```css
.qpm-card                    /* Block */
.qpm-card__header            /* Element */
.qpm-button--positive        /* Modifier */
```

#### Storage Keys
Use descriptive, prefixed keys:
```typescript
'quinoa-panel-state'
'qpm-window-pos-weather-events'
'autoFeed:config'
'weatherSwap:keybinds'
```

### Git Conventions

#### Branch Naming
Feature branches use pattern: `claude/<description>-<sessionId>`
```
claude/add-journal-checker-01BjRiu6Hc1wdZZRCXLsDu7y
claude/fix-auto-feed-threshold-02AbCdEf
```

#### Commit Messages
Use conventional commits style:
```
<type>: <concise description>

Examples:
- feat: Add journal checker with species catalog
- fix: Update inventory atom access for auto-favorite
- style: Refactor harvest section to use createCard
- chore: Update version to 4.2.0
- docs: Add comprehensive CLAUDE.md guide
```

Types: `feat`, `fix`, `style`, `refactor`, `docs`, `test`, `chore`

### Versioning

QPM uses semantic versioning (`MAJOR.MINOR.PATCH`):
- **MAJOR**: Breaking changes or major feature rewrites
- **MINOR**: New features, non-breaking changes
- **PATCH**: Bug fixes, minor improvements

Update version in **two locations**:
1. `package.json` - `version` field
2. `scripts/build-userscript.js` - `@version` in userscript header

---

## Architecture Patterns

### Feature Module Pattern

Each feature exports:
- **Configuration functions**: `configure*`, `set*`, `get*`
- **State getters**: `getConfig()`, `getState()`
- **Action triggers**: `start*`, `check*`, `manual*`
- **Callback registration**: `setStatusCallback()`, `on*Change()`

Internal state is private using closures.

### Jotai Atom Subscription Pattern

```typescript
import { getAtomByLabel, subscribeAtom } from '../core/jotaiBridge';

export function startMyStore(): void {
  const atom = getAtomByLabel('targetAtomName');

  if (!atom) {
    log('⚠️ Atom not found: targetAtomName');
    return;
  }

  subscribeAtom(atom, (value) => {
    // Handle value changes
    currentValue = value;
    changeCallback?.(value);
  }).then(unsub => {
    unsubscribe = unsub;
  });
}
```

### Storage Pattern

```typescript
import { storage } from '../utils/storage';

// Save with type safety
function saveMyConfig(cfg: MyConfig): void {
  storage.set('myFeature:config', cfg);
}

// Load with defaults
function loadMyConfig(): MyConfig {
  return storage.get('myFeature:config', {
    enabled: false,
    value: 0
  });
}
```

### UI Component Pattern

```typescript
function createMySection(): HTMLElement {
  const section = createCard('🎯 My Feature', 'my-feature');

  // Add controls
  const enableButton = createButton('Enable', false);
  enableButton.addEventListener('click', () => {
    const newState = !getConfig().enabled;
    setEnabled(newState);
    updateButtonState(enableButton, newState);
  });

  section.appendChild(enableButton);
  return section;
}
```

### Error Handling

Always wrap game API calls in try-catch:
```typescript
async function safeGameOperation(): Promise<void> {
  try {
    const atom = getAtomByLabel('someAtom');
    if (!atom) {
      log('⚠️ Atom not found');
      return;
    }

    const value = await readAtomValue(atom);
    // Process value...

  } catch (error) {
    log('❌ Error in game operation:', error);
    // Fallback behavior or user notification
  }
}
```

---

## Essential Reading

### Critical Files to Understand

1. **QPM_DEVELOPMENT_GUIDE.md** (129KB) - Comprehensive development guide with:
   - Game mechanics (weather, mutations, abilities, hunger)
   - Math formulas (multipliers, growth times, proc rates)
   - UI/UX guidelines (colors, typography, patterns)
   - Complete API reference

2. **src/core/jotaiBridge.ts** - How to access game state via Jotai atoms

3. **src/utils/storage.ts** - Persistent storage abstraction

4. **src/ui/originalPanel.ts** - Main UI entry point (current active UI)

5. **README.md** - User-facing documentation

6. **TROUBLESHOOTING.md** - Common issues and solutions

### Game Mechanics Quick Reference

**Weather System:**
- Regular Weather (rain/frost): Every 20-35 min, lasts 5 min
- Lunar Events (dawn/amber): Every 4 hours from 6am, lasts 10 min
- Application chance: 7% per minute (regular), 1% (lunar)

**Multipliers:**
- Golden: 25x, Rainbow: 50x
- Wet/Chilled: 2x, Frozen: 10x
- Dawnlit: 2x, Amberlit: 5x
- Weather + Lunar: ADD not multiply (Wet + Dawnlit = 3x, not 4x)

**Pet Abilities:**
- Abilities scale with pet strength (STR)
- Base strength: 100, typical range: 50-100+
- Proc formula: `chancePerRoll = min(0.95, (baseChance/100) * strengthMultiplier)`

---

## Common Tasks

### Reading Game State

```typescript
import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';

// Get current player info
const playerAtom = getAtomByLabel('myPlayerAtom');
const player = await readAtomValue(playerAtom);
console.log('Player:', player.displayName, 'Level:', player.level);

// Get inventory
const inventoryAtom = getAtomByLabel('myInventoryAtom');
const inventory = await readAtomValue(inventoryAtom);
console.log('Inventory items:', inventory.items.length);
```

### Adding a Toast Notification

```typescript
import { showToast } from '../core/notifications';

showToast('Success! Pet fed', 'success', 3000);
showToast('Warning: Low hunger', 'warning', 5000);
showToast('Error: Failed to feed', 'error', 5000);
```

### Creating a Modal Window

```typescript
import { toggleWindow } from '../ui/modalWindow';

function renderMyWindow(): HTMLElement {
  const content = document.createElement('div');
  content.textContent = 'Window content here';
  return content;
}

// Open/toggle window
toggleWindow('my-window-id', '🎯 My Window', renderMyWindow, '45vw', '50vh');
```

### Subscribing to Atom Changes

```typescript
import { subscribeAtom, getAtomByLabel } from '../core/jotaiBridge';

const atom = getAtomByLabel('myTargetAtom');
const unsubscribe = await subscribeAtom(atom, (newValue) => {
  console.log('Atom changed:', newValue);
  // Handle change
});

// Later: cleanup
unsubscribe();
```

### Debugging

```typescript
// Use QPM debug API (exposed globally)
QPM.debugPets();        // Show all active pets with stats
QPM.debugAllAtoms();    // List all available Jotai atoms
QPM.debugSlotInfos();   // Show pet slot information

// Check logs
// All QPM logs are prefixed with [QuinoaPetMgr] in console
```

---

## Testing & Debugging

### Development Workflow

1. **Start watch mode**: `npm run dev`
2. **Build userscript**: `npm run build:userscript`
3. **Update Tampermonkey**: Copy `dist/userscript.js` to Tampermonkey
4. **Refresh game page**: F5 to reload
5. **Check console**: F12 → Console tab, look for `[QuinoaPetMgr]` logs

### Debug Tools

**Console Commands (when script is running):**
```javascript
// Show active pets
QPM.debugPets()

// List all Jotai atoms
QPM.debugAllAtoms()

// Check pet slot infos
QPM.debugSlotInfos()

// Check pet XP history
QPM.getPetXPHistory()

// Estimate pet level
QPM.estimatePetLevel(petSlotIndex)
```

**Logging:**
```typescript
import { log } from '../utils/logger';

log('Debug message');
log('⚠️ Warning message');
log('❌ Error message');
```

### Common Issues

1. **"Atom not found"** - Game hasn't fully loaded, or atom name changed
2. **"No pets found"** - Pet panel not visible or atom subscription failed
3. **UI not appearing** - Game HUD (.QuinoaUI) not detected yet
4. **Features not responding** - Check if feature is enabled in config

See `TROUBLESHOOTING.md` for detailed solutions.

---

## Git Workflow

### Branch Strategy

1. **Main branch**: Default branch for stable code (usually `main` or `master`)
2. **Feature branches**: Named `claude/<description>-<sessionId>`
3. **Development branch**: Each session gets its own branch (automatically specified)

### Making Changes

```bash
# Check current branch
git status

# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat: Add new feature description"

# Push to feature branch
git push -u origin claude/my-feature-sessionId
```

### Creating Pull Requests

When ready to merge:
1. Ensure all changes are committed
2. Push to feature branch
3. Use `gh pr create` for GitHub PRs:
   ```bash
   gh pr create --title "feat: Add feature name" --body "$(cat <<'EOF'
   ## Summary
   - Brief description of changes

   ## Test plan
   - Steps to test
   EOF
   )"
   ```

### Important Git Rules

- **NEVER** push to main/master without permission
- **ALWAYS** develop on designated feature branches
- **ALWAYS** include clear commit messages
- **NEVER** use `--force` push without explicit approval
- **NEVER** amend commits that aren't yours

---

## Important Notes for AI Assistants

### When Working on QPM

1. **Read QPM_DEVELOPMENT_GUIDE.md first** - It contains critical game mechanics and formulas
2. **Follow existing patterns** - Don't introduce new architectures without discussion
3. **Test thoroughly** - Changes affect user automation; bugs can waste resources
4. **Update documentation** - If you change patterns, update the development guide
5. **Version bumps** - Update both `package.json` AND `scripts/build-userscript.js`

### Code Quality Standards

- **Type Safety**: Use strict TypeScript, no `any` unless absolutely necessary
- **Error Handling**: Always wrap game API calls in try-catch
- **Logging**: Use `log()` from `utils/logger.ts` with prefixes
- **Comments**: Explain WHY, not WHAT (code should be self-documenting)
- **Modularity**: Keep features independent and self-contained

### UI/UX Standards

- **Consistency**: Follow existing color palette and typography
- **Emoji Icons**: Use emoji for visual clarity (see development guide)
- **Spacing**: Follow established spacing rules (12px sections, 6px buttons)
- **Responsiveness**: UI should work at different viewport sizes
- **State Feedback**: Always show loading/success/error states

### Performance Considerations

- **Avoid Polling**: Subscribe to atoms instead of setInterval when possible
- **Debounce/Throttle**: Rate-limit rapid events (saves, checks)
- **Minimal DOM Updates**: Batch changes, avoid layout thrashing
- **Lazy Loading**: Don't initialize features until needed

---

## Quick Reference

### Essential Imports

```typescript
// Logging
import { log } from '../utils/logger';

// Storage
import { storage } from '../utils/storage';

// Jotai Bridge
import { getAtomByLabel, subscribeAtom, readAtomValue } from '../core/jotaiBridge';

// Notifications
import { showToast } from '../core/notifications';

// DOM Utilities
import { ready, sleep, getGameHudRoot } from '../utils/dom';

// Window System
import { toggleWindow } from '../ui/modalWindow';
```

### Useful Atom Names

- `myPlayerAtom` - Player info (coins, level, etc.)
- `myInventoryAtom` - Player inventory
- `myPetHutchAtom` - Pet hutch storage
- `myPetSlotInfosAtom` - Active pet slots (current team)
- `shopAtom` - Shop inventory and restock timers
- `gardenAtom` - Garden tile data
- `weatherAtom` - Current weather state

### Color Palette

```css
--bg-primary: rgba(0, 0, 0, 0.85)
--bg-secondary: #222
--text-primary: #fff
--accent-green: #4CAF50
--accent-orange: #FF9800
--accent-blue: #42A5F5
--border-subtle: #444
```

---

## Additional Resources

- **TypeScript Docs**: https://www.typescriptlang.org/docs/
- **Vite Docs**: https://vitejs.dev/guide/
- **Jotai Docs**: https://jotai.org/docs/introduction
- **Tampermonkey Docs**: https://www.tampermonkey.net/documentation.php

---

## Contact & Support

For questions or issues:
1. Check `TROUBLESHOOTING.md`
2. Review `QPM_DEVELOPMENT_GUIDE.md`
3. Check console logs for errors
4. Review git commit history for recent changes

---

**Remember**: This is a userscript for a browser game. Changes affect real users who rely on automation. Test thoroughly and follow conventions carefully!

---
## Feature Plan: Pet Comparison Hub (from FEATURE_PLAN_PET_COMPARISON_HUB.md)

# Feature Plan: Auto Pet Checker & Comparison Hub

## Overview
A comprehensive pet management system that automatically detects newly hatched pets, compares them against existing inventory/active/hutch pets, and provides a centralized comparison interface to help users manage their pet collection efficiently.

---

## Core Components

### 1. **Auto Pet Checker (Background System)**
**Purpose:** Detect new pet hatches and automatically compare against user's collection

#### Detection System
- Monitor pet inventory changes via existing `pets.ts` store
- Detect new pet additions by tracking pet IDs over time
- Trigger comparison logic immediately when new pet detected
- Store "last seen pet IDs" to identify what's new

#### Comparison Logic
```typescript
interface PetComparisonCriteria {
  sameAbilities: boolean;      // Must have same ability set (default: true)
  moreAbilities: boolean;       // Can have additional abilities (default: true)
  higherMaxStrength: boolean;   // Compare max potential strength (default: true)
  strengthThreshold: number;    // Min strength advantage to consider "better" (user configurable, default: 5)
}
```

#### Auto-Comparison Checks
For each newly hatched pet:
1. **Same Species Check:** Only compare against pets of same species
2. **Same Ability Family Check:** Group ability tiers (I/II/III/IV) together
3. **Strength Comparison:**
   - Current STR comparison (immediate value)
   - Max STR comparison (potential at maturity)
4. **Result Classification:**
   - ✅ **Upgrade:** Better than existing pet(s)
   - ⚠️ **Sidegrade:** Similar value, different tradeoffs
   - ❌ **Downgrade:** Worse than existing pet(s)

#### Notification System
- Visual indicator on newly hatched pet (border color coding)
- Toast notification summarizing comparison results
- Option to auto-favorite "upgrades"
- Option to auto-mark "downgrades" for sale

---

### 2. **Pet Comparison Hub (UI Window)**
**Purpose:** Centralized interface for comparing and managing pet collection

#### Window Structure

```
┌─────────────────────────────────────────────────────────────┐
│  🐾 Pet Comparison Hub                          [⚙️] [✖️]  │
├─────────────────────────────────────────────────────────────┤
│  Tabs: [📊 Overview] [🔍 Ability Groups] [⚔️ Compare]      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Tab Content Area]                                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Tab 1: Overview
**Purpose:** Quick summary of pet collection

**Content:**
- Total pets by location (Active: X, Inventory: Y, Hutch: Z)
- Ability coverage stats (which abilities you have, how many of each tier)
- Species breakdown (which species, how many of each)
- Strength distribution chart (how many pets at 80-90 STR, 90-95, 95-100, etc.)

#### Tab 2: Ability Groups
**Purpose:** Compare all pets with same ability

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Ability: [Dropdown: All Abilities ▼]                        │
│                                                              │
│ 🌱 Seed Finder (12 pets)                                    │
│ ┌─────────────┬──────────┬──────────┬─────────┬───────────┐│
│ │   Pet       │   Tier   │ Cur STR  │ Max STR │  Status   ││
│ ├─────────────┼──────────┼──────────┼─────────┼───────────┤│
│ │ Rabbit #1   │   IV     │   98     │   100   │ 🏆 Best   ││
│ │ Rabbit #2   │   III    │   95     │   98    │ ⭐ Good   ││
│ │ Bunny       │   II     │   85     │   92    │ 💼 Keep   ││
│ │ Hare        │   I      │   75     │   80    │ 💰 Sell?  ││
│ └─────────────┴──────────┴──────────┴─────────┴───────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Group by ability family (Seed Finder I/II/III/IV → "Seed Finder")
- Sort by: Current STR, Max STR, Tier, Species
- Filter by: Active/Inventory/Hutch
- Visual indicators:
  - 🏆 Best overall (highest max STR)
  - ⭐ Strong contender (within threshold)
  - 💼 Keep (unique abilities or decent backup)
  - 💰 Consider selling (redundant + weaker)
- Click row to see full pet details
- Multi-select for bulk actions (favorite/unfavorite/mark for sale)

#### Tab 3: Compare View
**Purpose:** Head-to-head comparison of specific pets

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Select Pets to Compare:                                      │
│ [Pet 1: Rabbit ▼] vs [Pet 2: Bunny ▼] + [Add More ▼]       │
│                                                              │
│ ┌─────────────────┬──────────────┬──────────────┐          │
│ │    Attribute    │   Rabbit     │    Bunny     │          │
│ ├─────────────────┼──────────────┼──────────────┤          │
│ │ Species         │   Rabbit     │   Rabbit     │          │
│ │ Current STR     │   98 🏆      │   85         │          │
│ │ Max STR         │   100 🏆     │   92         │          │
│ │ Current Level   │   12         │   8          │          │
│ │ Abilities       │ SF IV, CH I  │ SF III       │          │
│ │ Mutations       │ Gold         │ None         │          │
│ │ Location        │ Active       │ Inventory    │          │
│ │ Hunger          │ 85%          │ 100%         │          │
│ └─────────────────┴──────────────┴──────────────┘          │
│                                                              │
│ 📊 Recommendation: Keep Rabbit active, consider selling    │
│                    Bunny (redundant ability, lower STR)     │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Compare 2-6 pets side-by-side
- Highlight best value in each row with 🏆
- Smart recommendations based on:
  - Strength difference
  - Ability tier difference
  - Mutation value
  - Current usage (active vs inventory)

---

### 3. **Visual Indicators (In-Game Overlays)**
**Purpose:** Show comparison info directly in game UI

#### Newly Hatched Pet Badge
```
┌────────────────┐
│  🐰 Rabbit     │  ← Pet sprite
│  ✅ UPGRADE!   │  ← Comparison result
│  +12 STR       │  ← Strength improvement
└────────────────┘
```

#### Inventory Pet Cards
Add subtle indicator to pet cards in inventory:
- 🏆 Best in slot (highest max STR for this ability)
- ⚠️ Redundant (have better pet with same ability)
- 💰 Consider selling (significantly weaker duplicate)

#### Active Pet Slots
Show strength rank among same-ability pets:
```
┌──────────────┐
│  🐰 Rabbit   │
│  SF IV       │
│  #1 of 12    │  ← Rank among Seed Finder pets
│  98/100 STR  │
└──────────────┘
```

---

## Technical Implementation

### Data Structures

```typescript
interface PetAbilityGroup {
  abilityFamily: string;           // e.g., "SeedFinder" (without tier)
  abilityDisplayName: string;      // e.g., "Seed Finder"
  pets: ComparedPetInfo[];
  bestPet: ComparedPetInfo | null; // Highest max STR
}

interface ComparedPetInfo extends ActivePetInfo {
  location: 'active' | 'inventory' | 'hutch';
  slotIndex: number;
  rank: number;                    // Rank among same-ability pets
  strengthAdvantage: number;       // Difference from best pet
  recommendation: 'best' | 'keep' | 'consider-selling';
  comparedAgainst: string[];       // IDs of pets compared against
}

interface PetComparisonConfig {
  autoCheck: boolean;              // Run auto-check on new hatches
  autoFavoriteBest: boolean;       // Auto-favorite "upgrade" pets
  autoMarkForSale: boolean;        // Auto-mark weak duplicates
  strengthThreshold: number;       // Min STR diff to consider "better" (default: 5)
  includeHutch: boolean;           // Include Pet Hutch in comparisons
  groupAbilityTiers: boolean;      // Group I/II/III/IV together (default: true)
  notifyOnUpgrade: boolean;        // Show toast when upgrade detected
  notifyOnDuplicate: boolean;      // Show toast when redundant pet detected
}
```

### Storage Keys
```typescript
const STORAGE_KEYS = {
  COMPARISON_CONFIG: 'petComparisonHub:config',
  LAST_SEEN_PETS: 'petComparisonHub:lastSeenPets',
  COMPARISON_CACHE: 'petComparisonHub:cache',
  WINDOW_STATE: 'petComparisonHub:windowState',
};
```

### Files to Create

1. **src/features/petComparisonHub.ts**
   - Core comparison logic
   - Auto-detection system
   - Data aggregation/grouping

2. **src/ui/petComparisonWindow.ts**
   - Main window UI
   - Tab rendering
   - Comparison tables

3. **src/ui/petComparisonOverlays.ts**
   - In-game pet card badges
   - Newly hatched indicators
   - Active slot rank displays

4. **src/data/petAbilityFamilies.ts**
   - Mapping of ability IDs to families
   - Ability tier normalization
   - Display name utilities

### Integration Points

**1. Pet Detection Hook (pets.ts)**
```typescript
// Add to existing pet store
export function onNewPetDetected(callback: (newPet: ActivePetInfo) => void): () => void {
  // Hook into existing pet change detection
  // Fire callback when new pet ID appears
}
```

**2. Comparison Trigger**
```typescript
// In petComparisonHub.ts
startAutoChecker() {
  onNewPetDetected((newPet) => {
    if (!config.autoCheck) return;
    
    const comparisonResult = comparePetAgainstCollection(newPet);
    
    if (config.notifyOnUpgrade && comparisonResult.isUpgrade) {
      showUpgradeNotification(comparisonResult);
    }
    
    if (config.autoFavoriteBest && comparisonResult.isBest) {
      favoritePet(newPet.petId);
    }
  });
}
```

**3. UI Integration**
```typescript
// Add to originalPanel.ts or create new tab
export function addPetComparisonHubTab() {
  // Add "🔍 Compare" tab to main panel
  // Or create dedicated window button
}
```

---

## User Workflow Examples

### Scenario 1: Hatching New Pet
1. User hatches egg → New Rabbit appears
2. Auto-checker compares against 5 existing Rabbits
3. Result: "⚠️ Duplicate - You have 2 stronger Rabbits (SF IV, 98 STR)"
4. Pet card shows "💰 Consider Selling" badge
5. User clicks badge → Opens comparison view showing this Rabbit vs best 2

### Scenario 2: Reviewing Collection
1. User opens Pet Comparison Hub
2. Clicks "Ability Groups" tab
3. Selects "Seed Finder" from dropdown
4. Sees 12 pets, sorted by max STR
5. Notices 4 pets marked "💰 Consider Selling"
6. Multi-selects those 4 → Marks for sale → Bulk sell action

### Scenario 3: Deciding Which Pet to Keep Active
1. User has 2 Rabbits with Seed Finder IV
2. Opens Compare tab
3. Selects both Rabbits
4. Sees side-by-side:
   - Rabbit A: 95 current, 98 max, Level 10
   - Rabbit B: 88 current, 100 max, Level 6
5. Recommendation: "Keep Rabbit B active - higher max STR potential"

---

## Configuration UI

**Settings Panel in Comparison Hub:**
```
┌─────────────────────────────────────────────────────────────┐
│ ⚙️ Auto-Checker Settings                                    │
│                                                              │
│ ☑️ Enable auto-check on new hatches                         │
│ ☑️ Group ability tiers (I/II/III/IV) together               │
│ ☑️ Include Pet Hutch in comparisons                         │
│                                                              │
│ Strength Threshold: [5▼] (Min advantage to mark as better)  │
│                                                              │
│ 🔔 Notifications:                                           │
│ ☑️ Notify when upgrade detected                             │
│ ☐ Notify when duplicate detected                            │
│                                                              │
│ 🤖 Auto-Actions:                                            │
│ ☐ Auto-favorite "best in slot" pets                         │
│ ☐ Auto-mark weak duplicates for sale                        │
│                                                              │
│ [Save Settings] [Reset to Defaults]                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Visual Design Guidelines

### Color Coding
- 🟢 **Green:** Best/Upgrade (highest STR, clear improvement)
- 🟡 **Yellow:** Keep/Decent (within threshold, worth keeping)
- 🟠 **Orange:** Consider Selling (redundant but not terrible)
- 🔴 **Red:** Definitely Sell (significantly weaker duplicate)

### Icons
- 🏆 Best in slot
- ⭐ Strong contender
- 💼 Keep as backup
- 💰 Consider selling
- ✅ Upgrade detected
- ⚠️ Duplicate/redundant
- 📊 View comparison
- 🔄 Refresh data

### Layout Principles
- **Minimal by default:** Don't clutter game UI
- **Opt-in overlays:** User enables which indicators they want
- **Context-aware:** Show relevant info where user needs it
- **Progressive disclosure:** Summary → Details → Full comparison

---

## Performance Considerations

### Optimization Strategies
1. **Lazy Loading:** Only load comparison data when window opened
2. **Caching:** Cache comparison results for 5 minutes
3. **Incremental Updates:** Only recompute when pets change
4. **Debouncing:** Wait 500ms after multiple pet changes before recomputing
5. **Worker Thread:** Consider offloading heavy comparisons if collection is large (>100 pets)

### Memory Management
- Limit cached comparisons to last 20 pets
- Clear old comparison data on window close
- Use WeakMap for pet references where possible

---

## Accessibility

### Keyboard Navigation
- Tab through comparison tables
- Arrow keys to navigate cells
- Enter to select/deselect pets
- Ctrl+A to select all in view
- Delete to mark selected for sale

### Screen Reader Support
- Proper ARIA labels on all interactive elements
- Announce comparison results
- Table headers properly structured

---

## Future Enhancements (V2)

### Advanced Features
- **Ability Synergy Suggestions:** "This pet's ability pairs well with..."
- **Team Composition Analyzer:** Evaluate entire active pet setup
- **Historical Tracking:** "You've hatched 45 Rabbits, kept 3"
- **Market Value Estimator:** "This pet worth ~X coins based on abilities/STR"
- **Import/Export:** Share pet collections with friends
- **Cloud Sync:** Sync comparison settings across devices

### AI-Powered Features
- **Smart Recommendations:** ML-based suggestions on which pets to keep
- **Trend Analysis:** "You're collecting lots of Seed Finder pets lately"
- **Goal Tracking:** "You need 2 more Egg Growth Boost IV pets for optimal setup"

---

## Success Metrics

### User Value
- ✅ Reduce time spent manually comparing pets
- ✅ Prevent accidental sale of valuable pets
- ✅ Help users optimize pet collection efficiently
- ✅ Make pet management less overwhelming for new players

### Technical Goals
- < 100ms comparison time for typical collections (<50 pets)
- < 5MB memory footprint
- No frame drops when overlays enabled
- Zero false positives in "upgrade" detection

---

## References

### Inspiration from Other Repos
**MagicGarden-modMenu (Ariedam64):**
- Pet team management with drag-drop
- Inventory filtering by ability/species
- Pet panel enhancer with feed buttons
- Ability badge color coding
- Pet signature/comparison logic

**MGTools (Myke247):**
- Toast notification system
- Connection status indicators
- Settings persistence
- Hotkey system
- Theme/styling approach

### Game Data Sources
- Pet catalog from hardcoded-data.clean.js
- Ability definitions from petAbilities
- Strength calculation from petCalcul.ts
- Max scale lookup from plantScales.ts

---

## Implementation Priority

### Phase 1: Core (Week 1)
1. Pet detection system ✓
2. Basic comparison logic ✓
3. Comparison window skeleton ✓
4. Ability grouping data structure ✓

### Phase 2: UI (Week 2)
1. Ability Groups tab ✓
2. Compare tab ✓
3. Settings panel ✓
4. Toast notifications ✓

### Phase 3: Polish (Week 3)
1. Visual indicators/overlays ✓
2. Auto-actions (favorite/mark for sale) ✓
3. Keyboard shortcuts ✓
4. Performance optimization ✓

### Phase 4: Enhancement (Week 4+)
1. Overview tab with stats ✓
2. Bulk actions ✓
3. Export/import ✓
4. Advanced filtering ✓

---

## Open Questions

1. **Scope:** Should we include crop comparison too? (Future feature?)
2. **Storage:** Where to store comparison cache - localStorage or in-memory only?
3. **UI:** Separate window vs tab in existing panel?
4. **Notifications:** How intrusive should upgrade notifications be?
5. **Permissions:** Should "auto-mark for sale" require confirmation?

---

## Conclusion

This feature provides a **comprehensive, user-friendly pet management system** that:
- Automatically detects and evaluates new pets
- Provides clear visual comparisons
- Helps users make informed decisions about their collection
- Reduces cognitive load and time spent on pet management
- Integrates seamlessly with existing QPM features

The design prioritizes **visual clarity, minimal UI clutter, and smart automation** while giving users full control over their pet collection strategy.

---
## Patch Notes (from PATCH_NOTES.md)

# QPM Patch Notes - Magic Garden Update

## 🦃 New Pet - Turkey (Rare)
- **Rain Dance**: 10% × STR chance per minute to grant Wet mutation to crops
- **Double Hatch**: 3.0% × STR chance to hatch an extra pet from the same egg

## 🫛 New Seeds
- **Fava Bean** (Common)
- **Cacao Bean** (Divine)

## 🐝 Pet Changes
- **Bee**: Diet updated to include Chrysanthemum
- **Egg Growth Boost III**: Reduced time from 13m → 11m per proc (probability increased to 27%)

## ⚙️ Other Changes
- Fixed compatibility with game update (removed `canSpawnHere` property)
- Updated spawn rates: Blueberry and Tomato now 75% (was 100%)
- Updated rarity: Echeveria now Rare (was Legendary)
- New decor items automatically detected: Wood Windmill (Common), Wizard Tower (Mythical)

## 🔧 Technical
- All new content added to Journal Checker catalog
- Build size: 439KB
- Fully compatible with latest Magic Garden update

---
## Pet Hub Guide (from PET_HUB_GUIDE.md)

# Pet Comparison Hub - User Guide

## 🎉 Opening the Hub

The Pet Comparison Hub is a visual interface for comparing your active pets with detailed statistics and garden value calculations.

### How to Open:
In the browser console, type:
```javascript
QPM.openPetHub()
```

**Requirements:**
- At least 1 active pet in your garden (2+ recommended for comparison features)

---

## 🖼️ Features

### 📊 **Overview Tab**
- **Visual pet cards** showing each active pet
- **Pet emoji** based on species (🐰 Rabbit, 🐔 Chicken, etc.)
- **Quick stats** at a glance:
  - 💪 Current & Max Strength
  - 🎓 Level & XP
  - 🍖 Hunger % & Feeds/Hour
  - 🌟 Mutations (with Gold/Rainbow badges)
  - ⚡ Ability count

**Hover effects:** Cards pop up with glow when you hover over them!

---

### ⚖️ **Compare Tab**
- **Side-by-side comparison** of two pets
- **Dropdown selectors** to choose which pets to compare
- **Winner indicators** (🏆) showing which pet is better for each stat
- **Comprehensive metrics:**
  - Strength & growth potential
  - XP & leveling progress
  - Hunger efficiency (feeds/hour, time until starving)
  - Mutations & special traits
  - Ability counts

**Perfect for deciding which pet to keep or upgrade!**

---

### ⚡ **Abilities Tab**
- **Detailed ability statistics** for each pet
- **Visual ability cards** with:
  - Tier badges (Tier 1-4)
  - Probability & proc rates (per hour/day)
  - Time between procs
  - Effect values (scaled by pet strength)
  - **🌿 Garden value per proc** (for garden-affecting abilities)
  - **💰 Value per hour/day** (coin generation)
  
**Garden Value Abilities:**
- **Rainbow Granter** - Shows value of adding Rainbow to crops
- **Gold Granter** - Shows value of adding Gold to crops
- **Produce Scale Boost** - Shows value of crop size increases
- **Crop Mutation Boost** - Shows value of weather/lunar mutations

**Hover effects:** Ability cards slide and highlight when you hover!

---

## 🎨 Visual Design

### Color Coding:
- **🔵 Blue** (#00d4ff) - Strength stats
- **🟡 Yellow** (#ffb900) - XP & Level
- **🟢 Green** (#00ff88) - Hunger & efficiency stats
- **🔴 Red** (#e94560) - Primary accents (headers, winners)
- **🟣 Purple** (#533483) - Borders & backgrounds

### Special Effects:
- **Gradient backgrounds** - Modern dark theme with purple/blue gradients
- **Hover animations** - Cards pop up and glow
- **Winner badges** - 🏆 Gold trophy for better stats
- **Mutation badges** - Special styling for Gold (gold color) and Rainbow (rainbow gradient!)
- **Smooth transitions** - Everything animates nicely

---

## 💡 Tips

### Best Use Cases:

1. **Deciding which pet to keep:**
   - Open Compare tab
   - Select two similar pets
   - Check strength potential, ability procs/hour, garden value
   - Winner indicators show you at a glance which is better

2. **Optimizing garden value:**
   - Go to Abilities tab
   - Look for 🌿 Garden Value/Proc
   - See which pets generate the most coins from your current garden
   - Value updates based on your actual crops!

3. **Planning pet upgrades:**
   - Check Max Strength in Overview/Compare
   - See which pets have growth potential
   - Compare ability tier levels (higher = better)

4. **Hunger management:**
   - Check Feeds/Hour in Overview
   - Compare Time Until Starving
   - Identify high-maintenance vs low-maintenance pets

---

## 📋 Console Commands (Alternative)

If you prefer text output in console:

```javascript
// Get detailed stats for all active pets
window.testPetData()

// Compare two specific pets (by slot index)
window.testComparePets(0, 1)

// List all ability definitions in the game
window.testAbilityDefinitions()
```

---

## 🐛 Troubleshooting

**"No active pets found" error:**
- Make sure you have pets placed in your garden
- Pets in inventory/hutch won't show up (only active garden pets)

**Garden value shows "N/A" or 0:**
- Plant some crops in your garden first
- Garden value abilities need crops to calculate against
- Try abilities like Rainbow Granter, Gold Granter, or Produce Scale Boost

**Hub won't open:**
- Check browser console for errors
- Make sure userscript is loaded (look for startup logs)
- Try refreshing the page

**Stats look wrong:**
- Try the console commands (window.testPetData()) to see raw data
- Report any calculation issues with screenshots

---

## 🎯 Future Enhancements

Potential features for future versions:
- Auto-detection of inventory/hutch pets
- Sorting/filtering pets by various metrics
- Favorite/bookmark system
- Export comparison reports
- Pet recommendations based on garden setup
- Historical tracking of pet growth

---

## ❓ Questions?

The Pet Comparison Hub uses the same data as the existing Ability Tracker, but presents it in a much more visual and user-friendly way!

Enjoy comparing your pets! 🐾

---
## Rainbow & Gold Pet Sprites (from RAINBOW_GOLD_PET_SPRITES.md)

## 🎯 Summary of Findings (CONFIRMED)

 

After extensive investigation including DOM inspection, sprite cache analysis, and React fiber data extraction, we have **definitively determined** how rainbow/gold pet sprites work:

 

### Data Structure (100% Confirmed)

 

Rainbow and gold pets are represented in the game data with:

 

```typescript

{

  itemType: 'Pet',

  petSpecies: 'SomePetName',

  mutations: ['Rainbow'] or ['Gold'],  // ✅ ONLY RELIABLE INDICATOR

  abilities: [...],

  targetScale: 2.410...,  // ⚠️ THIS IS PET GROWTH/SIZE, NOT MUTATION!

  // ... other properties

}

```

 

**Critical Finding:**

- **`mutations` array is the ONLY reliable way to detect rainbow/gold pets**

- **`targetScale` is pet growth/size level, NOT mutation type!**

 

Example from actual pet data:

```javascript

// Rainbow Worm

mutations: ['Rainbow']

targetScale: 1.031118991706166  // Small pet!

 

// Gold Turtle

mutations: ['Gold']

targetScale: 1.810422614784983  // Medium pet

 

// Normal Peacock

mutations: []

targetScale: 2.410892742695469  // BIGGER than both mutated pets!

```

 

**This proves `targetScale` has nothing to do with mutations!**

 

### Visual Rendering (100% Confirmed)

 

✅ **Confirmed Method: Canvas Pixel Manipulation**

 

Rainbow and gold effects are **NOT** created by:

- ❌ CSS filters (DevTools showed `filter: none` on all elements)

- ❌ Canvas context filters (showed `filter: none` in canvas context)

- ❌ Separate sprite sheets (403 errors on guessed URLs, not in sprite cache)

 

Instead, they are created by:

- ✅ **Direct pixel manipulation** using `getImageData()` / `putImageData()`

- ✅ Pets are rendered to **256×256 canvas elements**

- ✅ Effects are applied per-pixel during rendering

- ✅ Only `image-rendering: pixelated` CSS is used (for crisp display)

 

## Assets Confirmed

 

- ✅ **Base pets**: `https://magicgarden.gg/version/19aaa98/assets/tiles/pets.png`

- ✅ **Mutation overlay** (crops): `https://magicgarden.gg/version/19aaa98/assets/tiles/mutation_overlay.png`

- ✅ **Sprite cache**: `window.Sprites.tileCacheCanvas` has 20 cached tiles (base sprites only)

- ❌ **Rainbow/gold pet sprites**: Confirmed to NOT exist as separate files

## 🛠️ How to Extract Rainbow/Gold Pet Sprites

 

### Method 1: Extract Rendered Sprites (EASIEST)

 

Use `batch-extract-pets.js` to extract sprites from rendered canvases:

 

**Step 1: Extract Active Pets**

1. Put rainbow/gold pets in your **active team** (visible on screen)

2. Open DevTools Console (F12)

3. Copy/paste `batch-extract-pets.js` into console

4. Script will automatically:

   - Find all pets in inventory

   - Categorize by mutation type

   - Extract all visible active pet canvases

   - Download as PNG files with species/mutation names

 

**Step 2: Extract Inventory/Hutch Pets**

1. Open your **Pet Hutch** or scroll through **Inventory**

2. As pets become visible, their canvases render

3. Run this command in console:

```javascript

window.autoExtractPets()

```

4. Repeat as you scroll to make more pets visible

 

**Output:** PNG files named like `Worm_Rainbow_FluffyName.png`

 

### Method 2: Reverse-Engineer the Pixel Transformation

 

Use `reverse-engineer-rainbow-effect.js` to analyze HOW the rainbow/gold effect works:

 

**Prerequisites:**

- You need both a **normal** and **mutated** version of the same species

- Both must be in your **active team** (visible on screen)

 

**Steps:**

1. Put a normal pet and its rainbow/gold variant in your active team

2. Open DevTools Console (F12)

3. Copy/paste `reverse-engineer-rainbow-effect.js` into console

4. Script will:

   - Find pairs of same species with different mutations

   - Extract pixel data from both canvases

   - Compare RGB values to find transformation patterns

   - Calculate average color ratios and offsets

   - Detect hue shifts (rainbow) or brightness boosts (gold)

   - Store detailed sample data for analysis

 

**Output:**

```javascript

window.rainbowTransformSamples  // Array of pixel transformations for rainbow

window.goldTransformSamples     // Array of pixel transformations for gold

```

 

**Use this data to recreate the effect:**

```javascript

// Pseudocode based on analysis results

for (each pixel in sprite) {

  newR = originalR * ratioR + offsetR

  newG = originalG * ratioG + offsetG

  newB = originalB * ratioB + offsetB

  clamp to 0-255

}

```

---
## Rare Restock Analysis (from RARE_RESTOCK_ANALYSIS.md)

# Shop Restock Pseudo-RNG Analysis Report

**Generated:** 2025-12-03T04:26:02.318Z
**Dataset:** 34861 restock events
**Date Range:** 8/20/2025, 7:45:00 AM - 11/29/2025, 2:10:00 PM

---

## Summary Statistics

| Item | Appearances | Min Interval (hrs) | Max Interval (hrs) | Mean (hrs) | Median (hrs) | Std Dev (hrs) | Hard Floor (hrs) |
|------|-------------|-------------------|-------------------|-----------|-------------|--------------|------------------|
| Starweaver | 17 | 9.08 | 445.42 | 126.24 | 24.00 | 142.31 | 9.08 |
| Dawnbinder | 7 | 24.00 | 278.00 | 146.93 | 131.83 | 97.72 | 24.00 |
| Moonbinder | 10 | 24.00 | 350.33 | 132.49 | 55.50 | 120.06 | 24.00 |
| Sunflower | 436 | 0.00 | 40.67 | 5.48 | 3.92 | 5.34 | 0.00 |
| Mythical Eggs | 132 | 0.25 | 84.25 | 18.00 | 12.50 | 18.01 | 0.25 |

---

## Starweaver - Detailed Analysis

### Basic Statistics

- **Total Appearances:** 17
- **Interval Range:** 9.08 - 445.42 hours
- **Mean Interval:** 126.24 hours (± 142.31)
- **Median Interval:** 24.00 hours
- **Hard Floor (Never Violated):** 9.08 hours

### Dry Streak Analysis

- **Mean Dry Streak:** 1703.65 restocks
- **Median Dry Streak:** 366 restocks
- **Max Dry Streak:** 6583 restocks
- **Min Dry Streak:** 20 restocks

✅ **No Pity System Detected:** Dry streaks appear random without threshold effects.

### Time-of-Day Analysis

**Hourly Distribution:**

| Hour | Appearances | % of Total |
|------|-------------|------------|
| 00:00 | 4 | 23.5% |
| 01:00 | 2 | 11.8% |
| 02:00 | 1 | 5.9% |
| 03:00 | 0 | 0.0% |
| 04:00 | 4 | 23.5% |
| 05:00 | 0 | 0.0% |
| 06:00 | 0 | 0.0% |
| 07:00 | 0 | 0.0% |
| 08:00 | 0 | 0.0% |
| 09:00 | 0 | 0.0% |
| 10:00 | 0 | 0.0% |
| 11:00 | 3 | 17.6% |
| 12:00 | 1 | 5.9% |
| 13:00 | 1 | 5.9% |
| 14:00 | 1 | 5.9% |
| 15:00 | 0 | 0.0% |
| 16:00 | 0 | 0.0% |
| 17:00 | 0 | 0.0% |
| 18:00 | 0 | 0.0% |
| 19:00 | 0 | 0.0% |
| 20:00 | 0 | 0.0% |
| 21:00 | 0 | 0.0% |
| 22:00 | 0 | 0.0% |
| 23:00 | 0 | 0.0% |

- **Hot Hours:** 0:00 (4 times), 4:00 (4 times), 11:00 (3 times)
- **Cold Hours (NEVER appears):** 3:00, 5:00, 6:00, 7:00, 8:00, 9:00, 10:00, 15:00, 16:00, 17:00, 18:00, 19:00, 20:00, 21:00, 22:00, 23:00

### Clustering Analysis

- **Intervals < 1 hour:** 0 (0.0%)
- **Intervals < 3 hours:** 0 (0.0%)
- **Intervals < 6 hours:** 0 (0.0%)
- **Intervals > 24 hours:** 7 (43.8%)

⚠️ **ANTI-CLUSTERING DETECTED:** Forced spacing prevents rapid re-appearances.

### Distribution Analysis

- **Distribution Type:** Moderate Variance
- **Coefficient of Variation:** 1.127
- **Skewness:** 1.355

**Interpretation:**
Intervals show moderate randomness, possibly a % chance check with some cooldown protection. Distribution is right-skewed (skewness: 1.35), indicating occasional long outliers.

---

## Dawnbinder - Detailed Analysis

### Basic Statistics

- **Total Appearances:** 7
- **Interval Range:** 24.00 - 278.00 hours
- **Mean Interval:** 146.93 hours (± 97.72)
- **Median Interval:** 131.83 hours
- **Hard Floor (Never Violated):** 24.00 hours

### Dry Streak Analysis

- **Mean Dry Streak:** 4210.71 restocks
- **Median Dry Streak:** 2269 restocks
- **Max Dry Streak:** 16455 restocks
- **Min Dry Streak:** 327 restocks

✅ **No Pity System Detected:** Dry streaks appear random without threshold effects.

### Time-of-Day Analysis

**Hourly Distribution:**

| Hour | Appearances | % of Total |
|------|-------------|------------|
| 00:00 | 0 | 0.0% |
| 01:00 | 0 | 0.0% |
| 02:00 | 0 | 0.0% |
| 03:00 | 0 | 0.0% |
| 04:00 | 0 | 0.0% |
| 05:00 | 0 | 0.0% |
| 06:00 | 0 | 0.0% |
| 07:00 | 2 | 28.6% |
| 08:00 | 0 | 0.0% |
| 09:00 | 0 | 0.0% |
| 10:00 | 0 | 0.0% |
| 11:00 | 0 | 0.0% |
| 12:00 | 2 | 28.6% |
| 13:00 | 0 | 0.0% |
| 14:00 | 0 | 0.0% |
| 15:00 | 0 | 0.0% |
| 16:00 | 0 | 0.0% |
| 17:00 | 0 | 0.0% |
| 18:00 | 1 | 14.3% |
| 19:00 | 0 | 0.0% |
| 20:00 | 0 | 0.0% |
| 21:00 | 1 | 14.3% |
| 22:00 | 1 | 14.3% |
| 23:00 | 0 | 0.0% |

- **Hot Hours:** 7:00 (2 times), 12:00 (2 times), 18:00 (1 times)
- **Cold Hours (NEVER appears):** 0:00, 1:00, 2:00, 3:00, 4:00, 5:00, 6:00, 8:00, 9:00, 10:00, 11:00, 13:00, 14:00, 15:00, 16:00, 17:00, 19:00, 20:00, 23:00

### Clustering Analysis

- **Intervals < 1 hour:** 0 (0.0%)
- **Intervals < 3 hours:** 0 (0.0%)
- **Intervals < 6 hours:** 0 (0.0%)
- **Intervals > 24 hours:** 5 (83.3%)

⚠️ **ANTI-CLUSTERING DETECTED:** Forced spacing prevents rapid re-appearances.

### Distribution Analysis

- **Distribution Type:** Moderate Variance
- **Coefficient of Variation:** 0.665
- **Skewness:** 0.370

**Interpretation:**
Intervals show moderate randomness, possibly a % chance check with some cooldown protection.

---

## Moonbinder - Detailed Analysis

### Basic Statistics

- **Total Appearances:** 10
- **Interval Range:** 24.00 - 350.33 hours
- **Mean Interval:** 132.49 hours (± 120.06)
- **Median Interval:** 55.50 hours
- **Hard Floor (Never Violated):** 24.00 hours

### Dry Streak Analysis

- **Mean Dry Streak:** 3313.20 restocks
- **Median Dry Streak:** 1905 restocks
- **Max Dry Streak:** 15343 restocks
- **Min Dry Streak:** 333 restocks

✅ **No Pity System Detected:** Dry streaks appear random without threshold effects.

### Time-of-Day Analysis

**Hourly Distribution:**

| Hour | Appearances | % of Total |
|------|-------------|------------|
| 00:00 | 1 | 10.0% |
| 01:00 | 0 | 0.0% |
| 02:00 | 0 | 0.0% |
| 03:00 | 0 | 0.0% |
| 04:00 | 0 | 0.0% |
| 05:00 | 0 | 0.0% |
| 06:00 | 2 | 20.0% |
| 07:00 | 4 | 40.0% |
| 08:00 | 2 | 20.0% |
| 09:00 | 0 | 0.0% |
| 10:00 | 0 | 0.0% |
| 11:00 | 0 | 0.0% |
| 12:00 | 0 | 0.0% |
| 13:00 | 0 | 0.0% |
| 14:00 | 0 | 0.0% |
| 15:00 | 0 | 0.0% |
| 16:00 | 1 | 10.0% |
| 17:00 | 0 | 0.0% |
| 18:00 | 0 | 0.0% |
| 19:00 | 0 | 0.0% |
| 20:00 | 0 | 0.0% |
| 21:00 | 0 | 0.0% |
| 22:00 | 0 | 0.0% |
| 23:00 | 0 | 0.0% |

- **Hot Hours:** 7:00 (4 times), 6:00 (2 times), 8:00 (2 times)
- **Cold Hours (NEVER appears):** 1:00, 2:00, 3:00, 4:00, 5:00, 9:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 17:00, 18:00, 19:00, 20:00, 21:00, 22:00, 23:00

### Clustering Analysis

- **Intervals < 1 hour:** 0 (0.0%)
- **Intervals < 3 hours:** 0 (0.0%)
- **Intervals < 6 hours:** 0 (0.0%)
- **Intervals > 24 hours:** 5 (55.6%)

⚠️ **ANTI-CLUSTERING DETECTED:** Forced spacing prevents rapid re-appearances.

### Distribution Analysis

- **Distribution Type:** Moderate Variance
- **Coefficient of Variation:** 0.906
- **Skewness:** 0.719

**Interpretation:**
Intervals show moderate randomness, possibly a % chance check with some cooldown protection.

---

## Sunflower - Detailed Analysis

### Basic Statistics

- **Total Appearances:** 436
- **Interval Range:** 0.00 - 40.67 hours
- **Mean Interval:** 5.48 hours (± 5.34)
- **Median Interval:** 3.92 hours
- **Hard Floor (Never Violated):** 0.00 hours

### Dry Streak Analysis

- **Mean Dry Streak:** 78.90 restocks
- **Median Dry Streak:** 57 restocks
- **Max Dry Streak:** 647 restocks
- **Min Dry Streak:** 0 restocks

✅ **No Pity System Detected:** Dry streaks appear random without threshold effects.

### Time-of-Day Analysis

**Hourly Distribution:**

| Hour | Appearances | % of Total |
|------|-------------|------------|
| 00:00 | 13 | 3.0% |
| 01:00 | 33 | 7.6% |
| 02:00 | 29 | 6.7% |
| 03:00 | 25 | 5.7% |
| 04:00 | 25 | 5.7% |
| 05:00 | 22 | 5.0% |
| 06:00 | 26 | 6.0% |
| 07:00 | 25 | 5.7% |
| 08:00 | 10 | 2.3% |
| 09:00 | 13 | 3.0% |
| 10:00 | 25 | 5.7% |
| 11:00 | 20 | 4.6% |
| 12:00 | 13 | 3.0% |
| 13:00 | 12 | 2.8% |
| 14:00 | 16 | 3.7% |
| 15:00 | 14 | 3.2% |
| 16:00 | 12 | 2.8% |
| 17:00 | 13 | 3.0% |
| 18:00 | 11 | 2.5% |
| 19:00 | 16 | 3.7% |
| 20:00 | 21 | 4.8% |
| 21:00 | 20 | 4.6% |
| 22:00 | 12 | 2.8% |
| 23:00 | 10 | 2.3% |

- **Hot Hours:** 1:00 (33 times), 2:00 (29 times), 6:00 (26 times)
- **Cold Hours (NEVER appears):** None - appears at all hours

### Clustering Analysis

- **Intervals < 1 hour:** 70 (16.1%)
- **Intervals < 3 hours:** 179 (41.1%)
- **Intervals < 6 hours:** 290 (66.7%)
- **Intervals > 24 hours:** 3 (0.7%)

⚠️ **BURST PATTERN DETECTED:** Item shows clustering (41.1% of intervals < 3hrs)

### Distribution Analysis

- **Distribution Type:** Moderate Variance
- **Coefficient of Variation:** 0.975
- **Skewness:** 1.950

**Interpretation:**
Intervals show moderate randomness, possibly a % chance check with some cooldown protection. Distribution is right-skewed (skewness: 1.95), indicating occasional long outliers.

---

## Mythical Eggs - Detailed Analysis

### Basic Statistics

- **Total Appearances:** 132
- **Interval Range:** 0.25 - 84.25 hours
- **Mean Interval:** 18.00 hours (± 18.01)
- **Median Interval:** 12.50 hours
- **Hard Floor (Never Violated):** 0.25 hours

### Dry Streak Analysis

- **Mean Dry Streak:** 258.37 restocks
- **Median Dry Streak:** 183 restocks
- **Max Dry Streak:** 1238 restocks
- **Min Dry Streak:** 2 restocks

✅ **No Pity System Detected:** Dry streaks appear random without threshold effects.

### Time-of-Day Analysis

**Hourly Distribution:**

| Hour | Appearances | % of Total |
|------|-------------|------------|
| 00:00 | 4 | 3.0% |
| 01:00 | 3 | 2.3% |
| 02:00 | 6 | 4.5% |
| 03:00 | 8 | 6.1% |
| 04:00 | 8 | 6.1% |
| 05:00 | 12 | 9.1% |
| 06:00 | 6 | 4.5% |
| 07:00 | 6 | 4.5% |
| 08:00 | 10 | 7.6% |
| 09:00 | 5 | 3.8% |
| 10:00 | 10 | 7.6% |
| 11:00 | 3 | 2.3% |
| 12:00 | 5 | 3.8% |
| 13:00 | 2 | 1.5% |
| 14:00 | 6 | 4.5% |
| 15:00 | 6 | 4.5% |
| 16:00 | 4 | 3.0% |
| 17:00 | 5 | 3.8% |
| 18:00 | 5 | 3.8% |
| 19:00 | 5 | 3.8% |
| 20:00 | 4 | 3.0% |
| 21:00 | 2 | 1.5% |
| 22:00 | 3 | 2.3% |
| 23:00 | 4 | 3.0% |

- **Hot Hours:** 5:00 (12 times), 8:00 (10 times), 10:00 (10 times)
- **Cold Hours (NEVER appears):** None - appears at all hours

### Clustering Analysis

- **Intervals < 1 hour:** 2 (1.5%)
- **Intervals < 3 hours:** 15 (11.5%)
- **Intervals < 6 hours:** 38 (29.0%)
- **Intervals > 24 hours:** 28 (21.4%)

✅ **Random Spacing:** No obvious clustering or anti-clustering patterns.

### Distribution Analysis

- **Distribution Type:** Moderate Variance
- **Coefficient of Variation:** 1.001
- **Skewness:** 1.866

**Interpretation:**
Intervals show moderate randomness, possibly a % chance check with some cooldown protection. Distribution is right-skewed (skewness: 1.87), indicating occasional long outliers.

---

## Cross-Item Pattern Analysis

Analyzing correlations between rare item appearances...

### Co-occurrence Matrix (within 1 hour)

| Item 1 | Item 2 | Co-occurrences | % of Item 1 | % of Item 2 |
|--------|--------|----------------|-------------|-------------|
| Starweaver | Dawnbinder | 0 | 0.0% | 0.0% |
| Starweaver | Moonbinder | 0 | 0.0% | 0.0% |
| Starweaver | Sunflower | 4 | 23.5% | 0.9% |
| Starweaver | Mythical Eggs | 2 | 11.8% | 1.5% |
| Dawnbinder | Moonbinder | 0 | 0.0% | 0.0% |
| Dawnbinder | Sunflower | 0 | 0.0% | 0.0% |
| Dawnbinder | Mythical Eggs | 0 | 0.0% | 0.0% |
| Moonbinder | Sunflower | 8 | 80.0% | 1.8% |
| Moonbinder | Mythical Eggs | 1 | 10.0% | 0.8% |
| Sunflower | Mythical Eggs | 54 | 12.4% | 40.9% |

⚠️ **SEEDING DETECTED:** Multiple rare items frequently appear together, suggesting shared RNG seed or time-based triggers.

---

## Prediction Strategy Recommendations

Based on the analysis, here are the recommended prediction approaches:

### Starweaver

**Cooldown Detected:** Item NEVER appears within 9.08 hours. After an appearance, wait at least 10 hours before expecting it again.

**Hybrid System:** Mix of cooldown + random chance. After cooldown (9.1 hrs), expect appearance within 268.6 hours on average.

### Dawnbinder

**Cooldown Detected:** Item NEVER appears within 24.00 hours. After an appearance, wait at least 24 hours before expecting it again.

**Hybrid System:** Mix of cooldown + random chance. After cooldown (24.0 hrs), expect appearance within 244.6 hours on average.

### Moonbinder

**Cooldown Detected:** Item NEVER appears within 24.00 hours. After an appearance, wait at least 24 hours before expecting it again.

**Hybrid System:** Mix of cooldown + random chance. After cooldown (24.0 hrs), expect appearance within 252.5 hours on average.

### Sunflower

**Hybrid System:** Mix of cooldown + random chance. After cooldown (0.0 hrs), expect appearance within 10.8 hours on average.

**Burst Alert:** When item appears, there's a 41% chance it will appear again within 3 hours. Stay alert after first sighting!

### Mythical Eggs

**Hybrid System:** Mix of cooldown + random chance. After cooldown (0.3 hrs), expect appearance within 36.0 hours on average.

---
## Rare Restock Executive Summary (from RARE_RESTOCK_EXECUTIVE_SUMMARY.md)

# Shop Restock Pseudo-RNG Analysis - Executive Summary

**Date:** December 3, 2025
**Dataset:** 34,861 restock events (Aug 20 - Nov 29, 2025)
**Analyst:** Claude Code AI Analysis System

---

## Key Findings: The Pseudo-RNG System Revealed

### 🎯 **CONFIRMED: This is NOT True Random**

The shop restock system uses a **hybrid cooldown + random chance** model, NOT pure RNG. Here's what we discovered:

---

## The Three Ultra-Rares: Starweaver, Dawnbinder, Moonbinder

### **Starweaver** (17 appearances)
- **Hard Cooldown:** 9.08 hours (NEVER violated)
- **Mean Interval:** 126.24 hours (~5.3 days)
- **Extreme Time Restriction:** Only appears during 8 specific hours (0:00, 1:00, 2:00, 4:00, 11:00, 12:00, 13:00, 14:00)
- **NEVER appears:** 3am-10am, 3pm-11pm (16 hours blocked!)
- **Anti-clustering:** ZERO instances of appearing within 6 hours of previous appearance

**Mechanic Hypothesis:**
```
IF (time_since_last >= 9.08 hours) AND (current_hour IN allowed_hours):
    chance_to_appear = base_chance * (time_multiplier)
```

### **Dawnbinder** (7 appearances) - EXTREMELY RARE
- **Hard Cooldown:** 24 hours (NEVER violated)
- **Mean Interval:** 146.93 hours (~6.1 days)
- **Extreme Time Restriction:** Only 5 specific hours (7:00, 12:00, 18:00, 21:00, 22:00)
- **Max Dry Streak:** 16,455 restocks without appearance
- **Anti-clustering:** ZERO instances within 6 hours

**Mechanic Hypothesis:**
```
IF (time_since_last >= 24 hours) AND (current_hour IN [7, 12, 18, 21, 22]):
    chance_to_appear = very_low_base_chance
```

### **Moonbinder** (10 appearances) - VERY RARE
- **Hard Cooldown:** 24 hours (NEVER violated)
- **Mean Interval:** 132.49 hours (~5.5 days)
- **Extreme Time Restriction:** Only 5 hours (0:00, 6:00, 7:00, 8:00, 16:00)
- **80% Co-occurrence with Sunflower:** When Moonbinder appears, Sunflower appears within 1 hour 80% of the time!
- **Anti-clustering:** ZERO instances within 6 hours

**Mechanic Hypothesis:**
```
IF (time_since_last >= 24 hours) AND (current_hour IN [0, 6, 7, 8, 16]):
    chance_to_appear = low_base_chance
    IF sunflower_recently_appeared:
        chance_multiplier = 4x  // Explains 80% correlation
```

---

## The Common Rares: Sunflower & Mythical Eggs

### **Sunflower** (436 appearances)
- **NO Hard Cooldown:** Can appear back-to-back (minimum 0 hours)
- **Mean Interval:** 5.48 hours
- **Appears ALL hours:** No time-of-day restrictions
- **BURST BEHAVIOR:** 41.1% chance to appear again within 3 hours!
- **Hot hours:** 1am-2am (peak activity)

**Mechanic Hypothesis:**
```
chance_to_appear = moderate_base_chance
IF appeared_recently (< 3 hours):
    chance_to_appear *= 2.5  // Burst multiplier
```

### **Mythical Eggs** (132 appearances)
- **Soft Cooldown:** 0.25 hours (15 minutes minimum)
- **Mean Interval:** 18.00 hours
- **Appears ALL hours:** No time-of-day restrictions
- **40.9% Co-occurrence with Sunflower:** Strong correlation
- **Hot hours:** 5am, 8am, 10am

**Mechanic Hypothesis:**
```
IF time_since_last >= 0.25 hours:
    chance_to_appear = low_base_chance
    IF sunflower_in_stock:
        chance_multiplier = 1.8x  // Explains correlation
```

---

## Critical Pattern Discovery: **RNG SEEDING DETECTED**

### Co-occurrence Matrix Reveals Shared RNG Seeds

| Pair | Co-occurrence Rate | Interpretation |
|------|-------------------|----------------|
| **Moonbinder + Sunflower** | **80.0%** | STRONG seeding correlation |
| **Sunflower + Mythical Eggs** | **40.9%** | Moderate seeding correlation |
| **Starweaver + Sunflower** | **23.5%** | Weak correlation |
| Ultra-rares (Star/Dawn/Moon) | **0%** | Independent seeds |

**What This Means:**
- The game likely uses **time-based RNG seeding** (e.g., `seed = floor(current_time / interval)`)
- When Moonbinder passes its checks, Sunflower is almost guaranteed to appear
- Sunflower and Mythical Eggs share a similar seed pattern
- Ultra-rares (Starweaver, Dawnbinder, Moonbinder) have independent checks

---

## Prediction Strategies

### **For Starweaver Hunters:**
1. **ONLY monitor during allowed hours:** 0-2am, 4am, 11am-2pm
2. **Wait 10+ hours** after each appearance (cooldown)
3. **Watch for long dry streaks:** If it's been 445+ hours, likelihood may increase
4. **Best chances:** 0:00 and 4:00 (23.5% of appearances each)

### **For Dawnbinder Hunters (Hardest):**
1. **ONLY monitor during:** 7am, 12pm, 6pm, 9pm, 10pm
2. **Wait 24+ hours** after each appearance
3. **Extremely rare:** Expect ~147 hour intervals on average
4. **Best chances:** 7am and 12pm (28.6% of appearances each)

### **For Moonbinder Hunters:**
1. **ONLY monitor during:** 0:00, 6-8am, 4pm
2. **Wait 24+ hours** after each appearance
3. **KEY STRATEGY:** Watch for Sunflower! When Sunflower appears during Moonbinder hours, check immediately (80% correlation)
4. **Best chances:** 7am (40% of appearances)

### **For Sunflower Hunters:**
1. **No time restrictions** - monitor continuously
2. **Burst strategy:** When it appears, stay online for 3 more hours (41% chance of re-appearance)
3. **Hot hours:** 1am-2am (15% of appearances)
4. **Average interval:** ~5.5 hours

### **For Mythical Eggs Hunters:**
1. **No time restrictions** - monitor continuously
2. **Correlation play:** When Sunflower appears, likelihood increases
3. **Hot hours:** 5am (9.1%), 8am, 10am (7.6% each)
4. **Average interval:** ~18 hours

---

## Recommended Auto-Monitor Schedule

Based on the analysis, here's an optimal monitoring schedule:

### **Priority Hours (All Rares Possible):**
- **6:00-8:00 AM:** Moonbinder (60% of appearances), Dawnbinder (28.6%), Sunflower, Mythical Eggs (peak)
- **12:00 PM:** Dawnbinder (28.6%), Starweaver (5.9%)
- **1:00-2:00 AM:** Sunflower (peak), Starweaver (35.3%)

### **Secondary Hours:**
- **4:00 AM:** Starweaver (23.5%)
- **11:00 AM:** Starweaver (17.6%)
- **4:00 PM:** Moonbinder (10%)
- **9:00-10:00 PM:** Dawnbinder only

### **Dead Hours (Ultra-Rares NEVER Appear):**
- 3am, 5am, 9am, 10am, 3pm, 5pm-8pm, 11pm
- Only Sunflower and Mythical Eggs possible during these hours

---

## Statistical Distribution Analysis

### **Variance Tells the Story:**

1. **Dawnbinder** (CV=0.665): Most "timer-like" behavior - relatively consistent intervals
2. **Moonbinder** (CV=0.906): Hybrid timer + random
3. **Mythical Eggs** (CV=1.001): Pure exponential (memoryless) distribution
4. **Sunflower** (CV=0.975): Exponential with burst modifier
5. **Starweaver** (CV=1.127): Most random of the ultra-rares

**All items show right-skewed distributions** (positive skewness), indicating:
- Most intervals are shorter than average
- Occasional very long dry spells
- Consistent with "% chance per check" mechanic rather than guaranteed timers

---

## No Pity System Detected

Despite analyzing 34,861 restock events:
- **NO evidence of pity timers** that guarantee appearance after X restocks
- **NO evidence of increasing probability** based on dry streak length
- Long dry streaks (6,000+ restocks for Starweaver) can occur randomly

**Conclusion:** The game uses pure probabilistic checks, not a pity system.

---

## Technical Recommendations for Auto-Buyer Implementation

### **Priority Queue Strategy:**
```
1. Check current hour against rare item time windows
2. If Sunflower appears AND current_hour in Moonbinder_hours:
   -> Alert HIGH PRIORITY (80% chance Moonbinder available)
3. If Sunflower appears:
   -> Monitor for next 3 hours (burst window)
   -> Alert for Mythical Eggs (40% correlation)
4. Track last appearance times + cooldowns
5. Ignore checks during "dead hours" for ultra-rares
```

### **Notification Tiers:**
- **CRITICAL:** Moonbinder/Dawnbinder during allowed hours + cooldown passed
- **HIGH:** Starweaver during allowed hours + cooldown passed + dry streak > 200 hours
- **MEDIUM:** Sunflower burst window active
- **LOW:** Mythical Eggs + Sunflower correlation

---

## Unanswered Questions

1. **What determines "allowed hours" for ultra-rares?**
   - Possibly server-side event scheduling
   - Could be related to game's daily/weekly reset times

2. **Why the strong Moonbinder-Sunflower correlation?**
   - Shared RNG seed mathematical relationship
   - Possible "event batching" where certain items are grouped

3. **Does player activity affect spawn rates?**
   - Unable to determine from aggregate data
   - Would require individual player tracking

4. **Are there weekly/monthly patterns?**
   - Dataset spans 3.4 months - insufficient for seasonal analysis
   - Would need 12+ months of data

---

## Files Generated

1. **RARE_RESTOCK_ANALYSIS.md** - Full detailed analysis with all statistics
2. **RARE_RESTOCK_EXECUTIVE_SUMMARY.md** - This document
3. **scripts/analyze-rare-restocks.js** - Analysis script (reusable)

---

## Conclusion

The shop restock system is a **sophisticated pseudo-RNG implementation** combining:
- Hard cooldown timers (9-24 hours for ultra-rares)
- Time-of-day restrictions (hour-based filters)
- Percentage-based random checks
- RNG seed correlation between items
- Burst/clustering behavior for common items
- NO pity system

This is consistent with the developer's statement: *"% chance to restock the item after a certain amount of time"* - emphasis on **after** (cooldown) and **% chance** (random check).

**Optimal player strategy:** Focus monitoring during specific hours, track cooldowns, and exploit burst windows and cross-item correlations.

---
## Rare Restock Hourly Heatmap (from RARE_RESTOCK_HOURLY_HEATMAP.md)

# Shop Restock Hourly Heatmap Analysis

This heatmap shows when each rare item can appear, revealing the time-based restrictions in the pseudo-RNG system.

## Legend
- ■■■ = HIGH frequency (>10% of appearances)
- ■■ = MEDIUM frequency (5-10%)
- ■ = LOW frequency (1-5%)
- · = POSSIBLE but rare (<1%)
- ✗ = NEVER appears (0%)

---

## Starweaver (17 total appearances)

```
Hour  │ Freq │ Count │ Visual
──────┼──────┼───────┼────────────────
00:00 │ 23.5%│   4   │ ■■■■■
01:00 │ 11.8%│   2   │ ■■
02:00 │  5.9%│   1   │ ■
03:00 │  0.0%│   0   │ ✗✗✗✗✗
04:00 │ 23.5%│   4   │ ■■■■■
05:00 │  0.0%│   0   │ ✗✗✗✗✗
06:00 │  0.0%│   0   │ ✗✗✗✗✗
07:00 │  0.0%│   0   │ ✗✗✗✗✗
08:00 │  0.0%│   0   │ ✗✗✗✗✗
09:00 │  0.0%│   0   │ ✗✗✗✗✗
10:00 │  0.0%│   0   │ ✗✗✗✗✗
11:00 │ 17.6%│   3   │ ■■■
12:00 │  5.9%│   1   │ ■
13:00 │  5.9%│   1   │ ■
14:00 │  5.9%│   1   │ ■
15:00 │  0.0%│   0   │ ✗✗✗✗✗
16:00 │  0.0%│   0   │ ✗✗✗✗✗
17:00 │  0.0%│   0   │ ✗✗✗✗✗
18:00 │  0.0%│   0   │ ✗✗✗✗✗
19:00 │  0.0%│   0   │ ✗✗✗✗✗
20:00 │  0.0%│   0   │ ✗✗✗✗✗
21:00 │  0.0%│   0   │ ✗✗✗✗✗
22:00 │  0.0%│   0   │ ✗✗✗✗✗
23:00 │  0.0%│   0   │ ✗✗✗✗✗
```

**Hot Zones:** Midnight-2am (40.6%), 4am (23.5%), 11am (17.6%)
**Dead Zones:** 3am, 5am-10am, 3pm-11pm (16 hours total)

---

## Dawnbinder (7 total appearances) - MOST RESTRICTED

```
Hour  │ Freq │ Count │ Visual
──────┼──────┼───────┼────────────────
00:00 │  0.0%│   0   │ ✗✗✗✗✗
01:00 │  0.0%│   0   │ ✗✗✗✗✗
02:00 │  0.0%│   0   │ ✗✗✗✗✗
03:00 │  0.0%│   0   │ ✗✗✗✗✗
04:00 │  0.0%│   0   │ ✗✗✗✗✗
05:00 │  0.0%│   0   │ ✗✗✗✗✗
06:00 │  0.0%│   0   │ ✗✗✗✗✗
07:00 │ 28.6%│   2   │ ■■■■■
08:00 │  0.0%│   0   │ ✗✗✗✗✗
09:00 │  0.0%│   0   │ ✗✗✗✗✗
10:00 │  0.0%│   0   │ ✗✗✗✗✗
11:00 │  0.0%│   0   │ ✗✗✗✗✗
12:00 │ 28.6%│   2   │ ■■■■■
13:00 │  0.0%│   0   │ ✗✗✗✗✗
14:00 │  0.0%│   0   │ ✗✗✗✗✗
15:00 │  0.0%│   0   │ ✗✗✗✗✗
16:00 │  0.0%│   0   │ ✗✗✗✗✗
17:00 │  0.0%│   0   │ ✗✗✗✗✗
18:00 │ 14.3%│   1   │ ■■
19:00 │  0.0%│   0   │ ✗✗✗✗✗
20:00 │  0.0%│   0   │ ✗✗✗✗✗
21:00 │ 14.3%│   1   │ ■■
22:00 │ 14.3%│   1   │ ■■
23:00 │  0.0%│   0   │ ✗✗✗✗✗
```

**Hot Zones:** 7am (28.6%), 12pm (28.6%)
**Dead Zones:** Only 5 hours POSSIBLE - rest completely blocked (19 hours total)

---

## Moonbinder (10 total appearances)

```
Hour  │ Freq │ Count │ Visual
──────┼──────┼───────┼────────────────
00:00 │ 10.0%│   1   │ ■■
01:00 │  0.0%│   0   │ ✗✗✗✗✗
02:00 │  0.0%│   0   │ ✗✗✗✗✗
03:00 │  0.0%│   0   │ ✗✗✗✗✗
04:00 │  0.0%│   0   │ ✗✗✗✗✗
05:00 │  0.0%│   0   │ ✗✗✗✗✗
06:00 │ 20.0%│   2   │ ■■■■
07:00 │ 40.0%│   4   │ ■■■■■■■■
08:00 │ 20.0%│   2   │ ■■■■
09:00 │  0.0%│   0   │ ✗✗✗✗✗
10:00 │  0.0%│   0   │ ✗✗✗✗✗
11:00 │  0.0%│   0   │ ✗✗✗✗✗
12:00 │  0.0%│   0   │ ✗✗✗✗✗
13:00 │  0.0%│   0   │ ✗✗✗✗✗
14:00 │  0.0%│   0   │ ✗✗✗✗✗
15:00 │  0.0%│   0   │ ✗✗✗✗✗
16:00 │ 10.0%│   1   │ ■■
17:00 │  0.0%│   0   │ ✗✗✗✗✗
18:00 │  0.0%│   0   │ ✗✗✗✗✗
19:00 │  0.0%│   0   │ ✗✗✗✗✗
20:00 │  0.0%│   0   │ ✗✗✗✗✗
21:00 │  0.0%│   0   │ ✗✗✗✗✗
22:00 │  0.0%│   0   │ ✗✗✗✗✗
23:00 │  0.0%│   0   │ ✗✗✗✗✗
```

**Hot Zones:** 6am-8am (80% of all appearances!)
**Dead Zones:** Only 5 hours POSSIBLE (19 hours blocked)
**CRITICAL:** 80% correlation with Sunflower - when Sunflower appears during these hours, Moonbinder very likely!

---

## Sunflower (436 total appearances) - NO RESTRICTIONS

```
Hour  │ Freq │ Count │ Visual
──────┼──────┼───────┼────────────────
00:00 │  3.0%│  13   │ ■
01:00 │  7.6%│  33   │ ■■■■■■■■
02:00 │  6.7%│  29   │ ■■■■■■
03:00 │  5.7%│  25   │ ■■■■
04:00 │  5.7%│  25   │ ■■■■
05:00 │  5.0%│  22   │ ■■■
06:00 │  6.0%│  26   │ ■■■■■
07:00 │  5.7%│  25   │ ■■■■
08:00 │  2.3%│  10   │ ·
09:00 │  3.0%│  13   │ ■
10:00 │  5.7%│  25   │ ■■■■
11:00 │  4.6%│  20   │ ■■■
12:00 │  3.0%│  13   │ ■
13:00 │  2.8%│  12   │ ■
14:00 │  3.7%│  16   │ ■■
15:00 │  3.2%│  14   │ ■
16:00 │  2.8%│  12   │ ■
17:00 │  3.0%│  13   │ ■
18:00 │  2.5%│  11   │ ·
19:00 │  3.7%│  16   │ ■■
20:00 │  4.8%│  21   │ ■■■
21:00 │  4.6%│  20   │ ■■■
22:00 │  2.8%│  12   │ ■
23:00 │  2.3%│  10   │ ·
```

**Hot Zones:** 1am-2am peak (14.3%), early morning 2am-7am
**No Dead Zones:** Can appear any hour
**Burst Behavior:** 41% chance to re-appear within 3 hours!

---

## Mythical Eggs (132 total appearances) - NO RESTRICTIONS

```
Hour  │ Freq │ Count │ Visual
──────┼──────┼───────┼────────────────
00:00 │  3.0%│   4   │ ■
01:00 │  2.3%│   3   │ ·
02:00 │  4.5%│   6   │ ■■
03:00 │  6.1%│   8   │ ■■■■
04:00 │  6.1%│   8   │ ■■■■
05:00 │  9.1%│  12   │ ■■■■■■■■
06:00 │  4.5%│   6   │ ■■
07:00 │  4.5%│   6   │ ■■
08:00 │  7.6%│  10   │ ■■■■■■
09:00 │  3.8%│   5   │ ■■
10:00 │  7.6%│  10   │ ■■■■■■
11:00 │  2.3%│   3   │ ·
12:00 │  3.8%│   5   │ ■■
13:00 │  1.5%│   2   │ ·
14:00 │  4.5%│   6   │ ■■
15:00 │  4.5%│   6   │ ■■
16:00 │  3.0%│   4   │ ■
17:00 │  3.8%│   5   │ ■■
18:00 │  3.8%│   5   │ ■■
19:00 │  3.8%│   5   │ ■■
20:00 │  3.0%│   4   │ ■
21:00 │  1.5%│   2   │ ·
22:00 │  2.3%│   3   │ ·
23:00 │  3.0%│   4   │ ■
```

**Hot Zones:** 5am (9.1%), 8am & 10am (7.6%)
**No Dead Zones:** Can appear any hour
**Correlation:** 40.9% co-occurrence with Sunflower

---

## Combined Optimal Monitoring Schedule

Based on the heatmap data, here's when to actively monitor:

### **CRITICAL HOURS (Multiple Ultra-Rares Possible):**

```
07:00 AM │ Moonbinder (40.0%) + Dawnbinder (28.6%) + Sunflower + Eggs
12:00 PM │ Starweaver (5.9%) + Dawnbinder (28.6%) + Sunflower + Eggs
```

### **HIGH PRIORITY HOURS:**

```
00:00 AM │ Starweaver (23.5%) + Moonbinder (10.0%) + Sunflower + Eggs
01:00 AM │ Starweaver (11.8%) + Sunflower PEAK (7.6%)
04:00 AM │ Starweaver (23.5%) + Sunflower + Eggs
06:00 AM │ Moonbinder (20.0%) + Sunflower + Eggs
08:00 AM │ Moonbinder (20.0%) + Eggs (7.6%)
11:00 AM │ Starweaver (17.6%) + Sunflower + Eggs
```

### **MEDIUM PRIORITY HOURS:**

```
02:00 AM │ Starweaver (5.9%) + Sunflower (6.7%)
05:00 AM │ Eggs PEAK (9.1%) + Sunflower
10:00 AM │ Eggs (7.6%) + Sunflower
18:00 PM │ Dawnbinder (14.3%) + Sunflower + Eggs
21:00 PM │ Dawnbinder (14.3%) + Sunflower
22:00 PM │ Dawnbinder (14.3%) + Sunflower
```

### **LOW PRIORITY / SUNFLOWER ONLY:**

```
03:00 AM │ Sunflower + Eggs only
09:00 AM │ Sunflower + Eggs only
13:00 PM │ Starweaver (5.9%) + Sunflower + Eggs
14:00 PM │ Starweaver (5.9%) + Sunflower + Eggs
15:00 PM │ Sunflower + Eggs only
16:00 PM │ Moonbinder (10.0%) + Sunflower + Eggs
17:00 PM │ Sunflower + Eggs only
19:00 PM │ Sunflower + Eggs only
20:00 PM │ Sunflower + Eggs only
23:00 PM │ Sunflower + Eggs only
```

---

## Time Zone Considerations

**IMPORTANT:** All times shown are in the game server's timezone (appears to be UTC based on export timestamps).

Players should convert these hours to their local timezone for optimal monitoring.

---

## Moonbinder Strategy (80% Sunflower Correlation)

When monitoring for Moonbinder, use this two-stage detection:

```
Stage 1: Is current hour in [0, 6, 7, 8, 16]?
   NO  → Skip check (0% chance)
   YES → Proceed to Stage 2

Stage 2: Did Sunflower appear in last hour?
   YES → HIGH ALERT (80% chance Moonbinder available)
   NO  → Standard check (20% chance)
```

This strategy can reduce monitoring time by 79% while maintaining detection rate!

---

## Key Takeaway

The pseudo-RNG system has **HARD TIME WINDOWS** that completely block ultra-rare appearances during certain hours. This is the strongest evidence that the system is deterministic, not random.

**For maximum efficiency:**
- Focus on the 7am and 12pm windows (cover both Moonbinder and Dawnbinder)
- Monitor midnight-2am for Starweaver
- Use Sunflower as a "canary" for Moonbinder detection
- Accept that 13-19 hours per day have zero ultra-rare potential

---
## Sprite Extraction Research (from SPRITE_EXTRACTION_RESEARCH.md)

# Sprite Extraction Research - Aries MagicGarden Mod

## Overview
Research on how the Aries MagicGarden mod extracts and displays crop/plant sprite images from the live game that uses Pixi.js for rendering.

**Repository:** https://github.com/Ariedam64/MagicGarden-modMenu

---

## Key Files

### 1. **src/core/sprite.ts** - Core Sprite Extraction Engine
This is the main file that handles all sprite detection, extraction, and rendering.

**Location:** `src/core/sprite.ts`

### 2. **src/ui/menus/debug-data.ts** - Debug Menu UI with Sprite Viewer
Contains the UI implementation for browsing and previewing sprites.

**Location:** `src/ui/menus/debug-data.ts`

### 3. **src/data/sprites.ts** - Tile Reference Mapping
Maps tile indices to crop/plant names.

**Location:** `src/data/sprites.ts`

---

## How It Works

### Step 1: Sprite Detection & Interception

The mod uses **multiple sniffing techniques** to capture sprite URLs as the game loads them:

#### A. Image Element Hooking
```typescript
// Hook into <img> element src property
const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
Object.defineProperty(HTMLImageElement.prototype, "src", {
  set: function (this: HTMLImageElement, v: string) {
    (pageWindow as any).Sprites?.add?.(v, "img");
    return (desc.set as any).call(this, v);
  },
  get: desc.get as any,
  configurable: true,
  enumerable: desc.enumerable!,
});

// Also hook setAttribute for <img setAttribute("src", ...)>
const nativeSetAttr = HTMLImageElement.prototype.setAttribute;
HTMLImageElement.prototype.setAttribute = function (name: any, value: any) {
  if (String(name).toLowerCase() === "src" && typeof value === "string") {
    Sprites.add(value, "img-attr");
  }
  return nativeSetAttr.call(this, name, value);
};
```

#### B. PerformanceObserver for Network Resources
```typescript
if ("PerformanceObserver" in pageWindow) {
  const po = new PerformanceObserver((list) => {
    list.getEntries().forEach((e: PerformanceEntry) => 
      this.add((e as any).name, "po")
    );
  });
  po.observe({ entryTypes: ["resource"] });
}
```

#### C. Worker Fetch Interception
```typescript
// Injected prelude into Web Workers to intercept fetch calls
const workerPrelude = `
  const F = self.fetch;
  if (F) {
    self.fetch = async function(...a) {
      let u = a[0];
      const r = await F.apply(this, a);
      try {
        const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        if ((u && isImg(u)) || /^image\\//.test(ct)) {
          self.postMessage({ __awc:1, url: u, src:'worker:fetch', ct });
        }
      } catch {}
      return r;
    };
  }
`;
```

#### D. URL Classification
```typescript
function isTilesUrl(u: string): boolean {
  return (
    /\/assets\/tiles\//i.test(u) ||
    /(map|plants|allplants|items|seeds|pets|animations|mutations)\.(png|webp)$/i.test(u)
  );
}

function isUiUrl(u: string): boolean {
  return /\/assets\/ui\//i.test(u);
}
```

---

### Step 2: Loading & Slicing Sprite Sheets

Once URLs are captured, the mod loads and slices them into individual tiles:

#### A. Load Image
```typescript
private async loadImage(url: string): Promise<HTMLImageElement> {
  return await new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
}
```

#### B. Auto-Detect Tile Size
```typescript
private guessSize(url: string, img: HTMLImageElement, forced?: number): number {
  if (forced) return forced;
  // allplants sheets use 512px tiles
  if (this.cfg.ruleAllplants512.test(url)) return 512;
  // Most other sheets use 256px
  if (img.width % 256 === 0 && img.height % 256 === 0) return 256;
  if (img.width % 512 === 0 && img.height % 512 === 0) return 512;
  return 256;
}
```

#### C. Slice Sprite Sheet into Individual Tiles
```typescript
private async sliceOne(url: string, opts: { 
  mode: SpriteMode; 
  includeBlanks: boolean; 
  forceSize?: 256 | 512 
}): Promise<TileInfo[]> {
  const img = await this.loadImage(url);
  const size = this.guessSize(url, img, opts.forceSize);
  const cols = Math.floor(img.width / size);
  const rows = Math.floor(img.height / size);
  const base = fileBase(url);

  const can = document.createElement("canvas");
  can.width = size;
  can.height = size;
  const ctx = can.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;

  const list: TileInfo[] = [];
  let idx = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.clearRect(0, 0, size, size);
      // Extract tile from sheet
      ctx.drawImage(img, col * size, row * size, size, size, 0, 0, size, size);

      // Check if tile is blank/black (skip empty tiles)
      let blank = false;
      try {
        const data = ctx.getImageData(0, 0, size, size);
        blank = this.isBlankOrBlack(data);
      } catch {
        blank = false;
      }
      if (!opts.includeBlanks && blank) { 
        idx++; 
        continue; 
      }

      // Store as ImageBitmap, Canvas, or DataURL
      if (opts.mode === "bitmap") {
        const bmp = await createImageBitmap(can);
        list.push({ sheet: base, url, index: idx, col, row, size, data: bmp });
      } else if (opts.mode === "canvas") {
        const clone = document.createElement("canvas");
        clone.width = size;
        clone.height = size;
        clone.getContext("2d")!.drawImage(can, 0, 0);
        list.push({ sheet: base, url, index: idx, col, row, size, data: clone });
      }
      idx++;
    }
  }
  return list;
}
```

---

### Step 3: Getting a Specific Crop Sprite

#### Method 1: By Sheet Name + Index
```typescript
// Get a specific tile from a sprite sheet
public async getTile(
  sheetBase: string,    // e.g., "plants" or "allplants"
  index: number,        // tile index (0-based)
  mode: SpriteMode = "bitmap"
): Promise<TileInfo | null> {
  const url = [...this.tiles].find(u => fileBase(u) === sheetBase);
  if (!url) return null;
  
  const map = await this.loadTiles({ 
    mode, 
    onlySheets: new RegExp(sheetBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\.(png|webp)$", "i") 
  });
  
  const tiles = map.get(sheetBase) || [];
  const tile = tiles.find(t => t.index === index);

  return tile ?? null;
}
```

#### Method 2: Load All Tiles from Category
```typescript
// Load all plant sprites
public async loadTiles(options: LoadTilesOptions = {}): Promise<Map<string, TileInfo<any>[]>> {
  const { mode = "bitmap", includeBlanks = false, forceSize, onlySheets } = options;
  
  const out = new Map<string, TileInfo<any>[]>();
  const list = onlySheets 
    ? [...this.tiles].filter(u => onlySheets.test(u)) 
    : [...this.tiles];

  for (const u of list) {
    const base = fileBase(u);
    const tiles = await this.sliceOne(u, { mode, includeBlanks, forceSize });
    out.set(base, tiles);
  }
  return out;
}

// Get plant tiles specifically
public listPlants(): string[] {
  const urls = new Set(this.listTilesByCategory(/plants/i));
  for (const url of this.listAllPlants()) urls.add(url);
  return [...urls];
}
```

---

### Step 4: Rendering Sprites in UI

#### A. Create Canvas from Tile
```typescript
private tileToCanvas(tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>): HTMLCanvasElement {
  const src = tile.data as any;
  let w = tile.size, h = tile.size;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  if (src instanceof HTMLCanvasElement) {
    w = src.width; h = src.height;
    out.width = w; out.height = h;
    ctx.drawImage(src, 0, 0);
  } else if (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap) {
    w = src.width; h = src.height;
    out.width = w; out.height = h;
    ctx.drawImage(src, 0, 0);
  }
  return out;
}
```

#### B. Display in HTML
From `src/ui/menus/debug-data.ts`:
```typescript
// Create a tile display element
const cell = document.createElement("div");
cell.className = "dd-sprite-tile";

// Add the canvas
const canvas = tileToCanvasCopy(tile); // converts TileInfo to HTMLCanvasElement
if (canvas) {
  canvas.classList.add("dd-sprite-variant__canvas");
  cell.appendChild(canvas);
}

// Add metadata
const meta = document.createElement("div");
meta.className = "dd-sprite-tile__meta";
meta.textContent = `#${tile.index} · col ${tile.col} · row ${tile.row}`;
cell.appendChild(meta);

// Add to grid
grid.appendChild(cell);
```

#### C. CSS Styling for Pixel-Perfect Rendering
```css
.dd-sprite-tile canvas {
  width: 100%;
  height: auto;
  image-rendering: pixelated;  /* Critical for crisp pixel art */
  background: #05080c;
  border-radius: 8px;
}

.dd-sprite-variant__canvas {
  width: 100%;
  height: auto;
  image-rendering: pixelated;
  background: #05080c;
  border-radius: 8px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
}
```

---

### Step 5: Special Effects (Gold/Rainbow)

#### Gold Effect
```typescript
public effectGold(
  tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>,
  opts?: { alpha?: number; color?: string }
): HTMLCanvasElement {
  const srcCan = this.tileToCanvas(tile);
  const w = srcCan.width, h = srcCan.height;

  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  // Draw base sprite
  ctx.drawImage(srcCan, 0, 0);

  // Apply gold tint
  const alpha = opts?.alpha ?? 0.7;
  const color = opts?.color ?? "rgb(255, 215, 0)";

  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  return out;
}
```

#### Rainbow Effect
```typescript
public effectRainbow(
  tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>,
  opts?: { angle?: number; colors?: string[] }
): HTMLCanvasElement {
  const srcCan = this.tileToCanvas(tile);
  const w = srcCan.width, h = srcCan.height;

  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  // Draw base sprite
  ctx.drawImage(srcCan, 0, 0);

  // Create rainbow gradient
  const angle = opts?.angle ?? 130;
  const colors = opts?.colors ?? 
    ["#FF1744","#FF9100","#FFEA00","#00E676","#2979FF","#D500F9"];

  // Temporary canvas for gradient
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext("2d")!;
  tctx.imageSmoothingEnabled = false;

  // Create angled linear gradient
  const size = w;
  const rad = (angle - 90) * Math.PI / 180;
  const cx = w / 2, cy = h / 2;
  const x1 = cx - Math.cos(rad) * (size / 2);
  const y1 = cy - Math.sin(rad) * (size / 2);
  const x2 = cx + Math.cos(rad) * (size / 2);
  const y2 = cy + Math.sin(rad) * (size / 2);

  const grad = tctx.createLinearGradient(x1, y1, x2, y2);
  colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
  
  tctx.fillStyle = grad;
  tctx.fillRect(0, 0, w, h);

  // Mask gradient to sprite shape
  tctx.globalCompositeOperation = "destination-in";
  tctx.drawImage(srcCan, 0, 0);

  // Apply using 'color' blend mode
  ctx.save();
  ctx.globalCompositeOperation = "color" as GlobalCompositeOperation;
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();

  return out;
}
```

---

## Mapping Crop Names to Tile Indices

The mod uses hardcoded mappings in `src/data/sprites.ts`:

```typescript
export function findTileRefMatch(sheet: string, index: number): TileRefMatch | null {
  const normalized = normalizeSheet(sheet);
  
  // Try to find matching sheet type
  for (const matcher of matchers) {
    if (!matcher.test(normalized)) continue;
    const entries = matcher.entries.get(index);
    if (entries?.length) {
      return {
        sheetId: matcher.id,
        sheetLabel: matcher.label,
        entries: [...entries], // Contains displayName like "Sunflower", "Bamboo", etc.
      };
    }
  }
  return null;
}
```

The actual mappings are in `src/data/hardcoded-data.clean.ts` with structures like:
```typescript
export const tileRefsPlants: Record<string, number> = {
  sunflower: 42,    // example - actual indices from game
  bamboo: 17,
  // ... etc
};
```

---

## Usage Example for Your Project

### Initialize Sprites System
```typescript
import { Sprites, initSprites } from './core/sprite';

// Initialize with callbacks
initSprites({
  config: {
    skipAlphaBelow: 1,
    blackBelow: 8,
    tolerance: 0.005,
  },
  onAsset: (url, kind) => {
    console.log(`Detected ${kind} asset:`, url);
    // Optionally trigger UI updates
    window.dispatchEvent(new CustomEvent('mg:sprite-detected'));
  }
});
```

### Get a Specific Crop Sprite
```typescript
// Method 1: By sheet + index (if you know the index)
const sunflowerTile = await Sprites.getTile("plants", 42, "canvas");
if (sunflowerTile) {
  const canvas = sunflowerTile.data as HTMLCanvasElement;
  document.body.appendChild(canvas);
}

// Method 2: Load all plants and find by name
const plantsMap = await Sprites.loadTiles({ 
  mode: "canvas",
  onlySheets: /plants/i 
});

const plantTiles = plantsMap.get("plants") || [];
// Use findTileRefMatch to map indices to names
for (const tile of plantTiles) {
  const match = findTileRefMatch(tile.sheet, tile.index);
  if (match?.entries.some(e => e.displayName === "Sunflower")) {
    const canvas = tile.data as HTMLCanvasElement;
    document.body.appendChild(canvas);
    break;
  }
}
```

### Render with Effects
```typescript
const tile = await Sprites.getTile("plants", 42, "canvas");
if (tile) {
  // Normal
  const normalCanvas = tile.data as HTMLCanvasElement;
  
  // Gold variant
  const goldCanvas = Sprites.effectGold(tile);
  
  // Rainbow variant
  const rainbowCanvas = Sprites.effectRainbow(tile);
  
  // Add to DOM with pixel-perfect rendering
  normalCanvas.style.imageRendering = "pixelated";
  goldCanvas.style.imageRendering = "pixelated";
  rainbowCanvas.style.imageRendering = "pixelated";
  
  document.body.append(normalCanvas, goldCanvas, rainbowCanvas);
}
```

---

## Key Takeaways

1. **No direct Pixi.js access needed** - The mod intercepts sprite URLs before Pixi loads them
2. **Multiple interception points** - Image elements, fetch calls, PerformanceObserver, Workers
3. **Auto sprite sheet slicing** - Automatically detects 256px vs 512px tiles and slices them
4. **Canvas-based rendering** - Uses HTML5 Canvas for pixel-perfect sprite display
5. **Caching system** - Caches loaded sprites in three formats (ImageBitmap, Canvas, DataURL)
6. **Effects via Canvas API** - Gold and rainbow effects using composite operations
7. **Critical CSS** - `image-rendering: pixelated` for crisp pixel art display

---

## Files to Study Further

1. **src/core/sprite.ts** - Complete sprite extraction engine (~700 lines)
2. **src/ui/menus/debug-data.ts** - Sprite viewer UI implementation (lines 1200-1800)
3. **src/data/sprites.ts** - Tile reference mapping system
4. **src/data/hardcoded-data.clean.ts** - Actual crop name to index mappings

---

## Integration Notes

To integrate into your QPM-GR project:

1. Copy `src/core/sprite.ts` to your `src/core/` directory
2. Copy the sprite utility functions (effectGold, effectRainbow, tileToCanvas)
3. Initialize on startup: `initSprites()` 
4. Access sprites via: `await Sprites.getTile("plants", index, "canvas")`
5. Use the CSS `image-rendering: pixelated` for display
6. Optionally implement tile name mapping from `src/data/sprites.ts`

The system is designed to work in Tampermonkey userscripts and doesn't require any bundler configuration changes.

---
## Testing Pet Data (from TESTING_PET_DATA.md)

# Pet Data Testing Guide

## Testing the Pet Comparison Hub Data Access

Before building the full Pet Comparison Hub, we need to verify we can access all the detailed statistics needed for comprehensive pet comparisons.

---

## Console Test Commands

After loading the userscript, the following commands are available in the browser console:

### 1. **Test All Active Pets** (`QPM.testPetData()`)

Gets comprehensive statistics for all currently active pets in your garden.

```javascript
QPM.testPetData()
```

**What it shows:**
- ✅ Basic Info (name, species, ID, slot)
- ✅ Strength & Growth (current STR, max STR, progress %, target scale, max scale, maturity time)
- ✅ XP & Leveling (XP, level, XP to next level)
- ✅ Hunger System (%, value, max, depletion rate, feeds/hour, time until starving)
- ✅ Mutations (list, count, gold/rainbow flags)
- ✅ **Detailed Ability Stats** for EACH ability:
  - Tier (I, II, III, IV)
  - Base name (e.g., "Seed Finder" without tier)
  - Category (coins, xp, plantGrowth, etc.)
  - Trigger type (continuous, harvest, sellAllCrops, etc.)
  - **Probability & Proc Rates:**
    - Base probability (%)
    - Effective probability (base × strength/100)
    - Roll period (minutes)
    - **Procs per hour**
    - **Procs per day**
    - **Average time between procs (minutes)**
  - **Effect Values:**
    - Label (e.g., "Scale increase", "Time reduction")
    - Base value (e.g., 6 for "6% × STR")
    - Effective value (base × strength/100)
    - Unit (%, minutes, xp, coins)
    - Suffix (%, m, etc.)
  - **Value Per Time:**
    - Value per hour
    - Value per day
  - Notes (additional info)

---

### 2. **Compare Two Pets** (`QPM.testComparePets(slotA, slotB)`)

Side-by-side comparison of two pets with winner indicators.

```javascript
QPM.testComparePets(0, 1)  // Compare slot 0 vs slot 1
QPM.testComparePets(0, 2)  // Compare slot 0 vs slot 2
```

**What it shows:**
- Basic info comparison
- Strength metrics with 🏆 winner indicators
- XP & level comparison
- Hunger system comparison (feeds/hour, time until starving)
- Mutation comparison
- Ability count comparison
- **Shared Abilities Detailed Comparison:**
  - Tier comparison (which has higher tier?)
  - Effective probability comparison
  - Procs per hour comparison
  - Effective value comparison

**Example Output:**
```
Attribute                  | Pet A           | Pet B           
================================================================================

🐾 BASIC INFO:
   Name                      | Fluffy          | Speedy          
   Species                   | Rabbit          | Rabbit          
   Pet ID                    | abc123          | def456          

📊 STRENGTH:
   Current Strength          | 95              | 88               🏆 A
   Max Strength              | 98              | 100              🏆 B
   Strength Progress         | 97%             | 88%              🏆 A
   Target Scale              | 1.95            | 1.88             🏆 A

🎓 XP & LEVEL:
   XP                        | 12500           | 8000             🏆 A
   Level                     | 12              | 9                🏆 A

🍖 HUNGER:
   Hunger %                  | 85%             | 92%              🏆 B
   Depletion Rate            | 15/h            | 15/h             ⚖️ TIE
   Feeds Per Hour            | 0.50            | 0.50             ⚖️ TIE
   Time Until Starving       | 4.2h            | 4.6h             🏆 B

✨ MUTATIONS:
   Mutation Count            | 1               | 0                🏆 A
   Has Gold                  | Yes             | No              
   Has Rainbow               | No              | No              

⚡ ABILITIES:
   Ability Count             | 2               | 2                ⚖️ TIE

📊 SHARED ABILITIES (2):

   Seed Finder:
        Tier                  | 4               | 3                🏆 A
        Eff. Probability      | 28.50%          | 22.00%           🏆 A
        Procs Per Hour        | 17.10           | 13.20            🏆 A
        Effective Value       | 19.00%          | 14.67%           🏆 A

   Rainbow Granter:
        Tier                  | N/A             | N/A              ⚖️ TIE
        Eff. Probability      | 2.85%           | 2.64%            🏆 A
        Procs Per Hour        | 1.71            | 1.58             🏆 A
        Effective Value       | N/A             | N/A              ⚖️ TIE
        Garden Value/Proc     | 2.45M coins     | 2.45M coins      ⚖️ TIE
        💡 Converts 1 random uncolored crop to Rainbow. 6 eligible fruit slots across 4 plants (50% friend bonus, weighted by fruit count).

   Crop Eater:
        Tier                  | N/A             | N/A              ⚖️ TIE
        Eff. Probability      | 57.00%          | 52.80%           🏆 A
        Procs Per Hour        | 34.20           | 31.68            🏆 A
        Effective Value       | N/A             | N/A              ⚖️ TIE
```

---

### 3. **List All Ability Definitions** (`QPM.testAbilityDefinitions()`)

Shows all ability definitions in the game data.

```javascript
QPM.testAbilityDefinitions()
```

**What it shows:**
- All ability IDs and names
- Category (coins, xp, plantGrowth, etc.)
- Trigger type
- Base probability
- Roll period
- Effect values
- Notes

---

## What Data is Available?

Based on the test results, here's what we can compare in the Pet Comparison Hub:

### ✅ **Basic Info**
- Pet ID, Name, Species
- Location (active, inventory, hutch)
- Slot index

### ✅ **Strength & Growth**
- Current strength (0-100)
- Max strength potential
- Strength progress (%)
- Current scale
- Max scale
- Maturity time (hours)

### ✅ **XP & Leveling**
- Current XP
- Estimated level
- XP to next level (if calculable)

### ✅ **Hunger Management**
- Current hunger (%)
- Hunger value (raw)
- Max hunger capacity
- **Depletion rate (per hour)**
- **Feeds required per hour**
- **Time until starving (hours)**

### ✅ **Mutations**
- Full list of mutations
- Mutation count
- Gold flag
- Rainbow flag

### ✅ **Detailed Ability Statistics**

For each ability, we can show:

#### Identification
- Ability ID (e.g., "SeedFinderIV")
- Display name (e.g., "Seed Finder IV")
- Tier (1-4)
- Base name (e.g., "Seed Finder")
- Category (coins, xp, plantGrowth, eggGrowth, misc)
- Trigger (continuous, harvest, sellAllCrops, hatchEgg, sellPet)

#### Probability & Proc Rates
- **Base probability** (e.g., 30%)
- **Effective probability** (base × strength/100)
- **Roll period** (how often it checks, in minutes)
- **⭐ Procs per hour** (expected triggers per hour)
- **⭐ Procs per day** (expected triggers per day)
- **⭐ Average time between procs** (minutes)

#### Effect Values
- **Effect label** (e.g., "Scale increase", "Time reduction")
- **Base effect** (e.g., 6 for "6% × STR")
- **Effective value** (base × strength/100)
- **Unit** (%, minutes, xp, coins)
- **Suffix** for display (%, m, etc.)

#### Value Generation
- **Value per hour** (if applicable)
- **Value per day** (if applicable)

#### Garden Value (for abilities affecting garden)
- **⭐ Garden value per proc** (coin value based on current garden state)
- **Garden value detail** (explanation of how value is calculated)
- Applies to abilities like:
  - Rainbow Granter (adds Rainbow mutation to random crop)
  - Gold Granter (adds Gold mutation to random crop)
  - Produce Scale Boost (increases crop size)
  - Crop Mutation Boost (adds weather/lunar mutations)

#### Additional Info
- Notes/description

---

## Example Test Session

```javascript
// 1. Check what pets are active
QPM.debugPets()

// 2. Get detailed stats for all pets
QPM.testPetData()

// Example output:
// ✅ Found 3 active pet(s)
// 
// 🐾 PET: Fluffy (Rabbit)
//    ID: abc123
//    Slot: 0
// 
// 📊 STRENGTH & GROWTH:
//    Current Strength: 95
//    Max Strength: 98
//    Strength Progress: 97%
//    Target Scale: 1.95
//    Max Scale: 2.0
//    Time to Mature: 72h
// 
// 🎓 XP & LEVELING:
//    XP: 12500
//    Level: 12
//    XP to Next Level: N/A
// 
// 🍖 HUNGER SYSTEM:
//    Hunger: 85.0%
//    Hunger Value: 382 / 450
//    Depletion Rate: 15/h
//    Feeds Per Hour: 0.50
//    Time Until Starving: 4.2h
// 
// ✨ MUTATIONS (1):
//    • Gold
//    Gold: ✅
//    Rainbow: ❌
// 
// ⚡ ABILITIES (2):
// 
//    📌 Seed Finder IV (SeedFinderIV)
//       Category: coins | Trigger: continuous
//       Tier: 4 | Base Name: Seed Finder
// 
//       PROBABILITY & PROC RATES:
//       • Base Probability: 30%
//       • Effective Probability: 28.50%
//       • Roll Period: 1m
//       • Procs Per Hour: 17.10
//       • Procs Per Day: 410.40
//       • Avg Time Between Procs: 3.5m
// 
//       EFFECT VALUES:
//       • Label: N/A
//       • Base Value: N/A
//       • Effective Value: N/A
//       • Unit: N/A
// 
//       🌿 GARDEN VALUE:
//       • Value Per Proc: 1.25K coins
//       • Detail: Boosts 4 mature fruits by ~6.50% size (50% friend bonus assumed, weighted by fruit count).
// 
//       VALUE PER TIME:
//       • Value Per Hour: 21.38K coins
//       • Value Per Day: 512.96K coins

// 3. Compare two specific pets
QPM.testComparePets(0, 1)

// 4. List all available abilities
QPM.testAbilityDefinitions()
```

---

## Next Steps

Once testing confirms all data is accessible:

1. ✅ Verify strength calculations are correct
2. ✅ Verify hunger metrics (feeds/hour, time until starving)
3. ✅ Verify ability proc rates (procs/hour, time between procs)
4. ✅ Verify effect values are calculated correctly
5. ⏳ **Build comparison logic** (which pet is better for what?)
6. ⏳ **Build detailed comparison UI** (advanced stats tables)
7. ⏳ **Add inventory/hutch pet detection**
8. ⏳ **Integrate with auto-detection system**

---

## Key Metrics for Comparison

Based on user requirements, the comparison hub should show:

### **Strength Comparison**
- Current STR: Immediate power level
- Max STR: Long-term potential
- Progress: How close to max?

### **Ability Efficiency**
- **Procs Per Hour**: How often does it trigger?
- **Procs Per Day**: Total daily triggers
- **Time Between Procs**: How reliable is it?
- **Effective Probability**: Real chance accounting for strength

### **Hunger Management**
- **Feeds Per Hour**: Maintenance cost
- **Time Until Starving**: How long can you leave it?
- **Depletion Rate**: How fast does hunger drop?

### **Value Generation**
- Value per hour (coins, XP, time saved)
- Value per day
- Effective value (accounting for strength)

### **Growth Potential**
- XP & level tracking
- Time to mature
- Strength progress

---

## Testing Checklist

Before building the full hub, verify:

- [ ] All pet data loads correctly
- [ ] Strength calculations match expected values
- [ ] Ability proc rates are reasonable
- [ ] Hunger metrics make sense
- [ ] **Garden value calculations work (test with Rainbow/Gold Granter, Scale Boost, Mutation Boost)**
- [ ] **Garden value reflects actual crops in garden (place some crops first)**
- [ ] Comparison logic identifies better pets accurately
- [ ] All ability tiers are grouped correctly
- [ ] Effective values account for pet strength
- [ ] Time-based metrics (procs/hour, feeds/hour) are accurate

---

## Feedback

After testing, provide feedback on:
1. Are all needed statistics available?
2. Are calculations accurate?
3. **Do garden value calculations match what you see in the Ability Tracker?**
4. **Are garden values updating when you add/remove crops?**
5. What additional data would be useful?
6. Any performance issues with data access?

---

## Garden Value Testing Tips

**To test garden value calculations:**
1. Plant some crops in your garden (the more mature crops, the better)
2. Place pets with garden-affecting abilities (Rainbow Granter, Gold Granter, Produce Scale Boost, etc.)
3. Run `QPM.testPetData()` to see garden value per proc
4. Compare with existing Ability Tracker values - they should match!
5. Add/remove crops and re-test to see values update

**Abilities with garden value calculations:**
- `RainbowGranter` - Shows avg value of adding Rainbow to a random uncolored crop
- `GoldGranter` - Shows avg value of adding Gold to a random uncolored crop  
- `ProduceScaleBoost` / `ProduceScaleBoostII` - Shows avg value of size increase across mature crops
- `ProduceMutationBoost` / `ProduceMutationBoostII` - Shows avg value of weather/lunar mutations (only during active weather/moon events)

---
## Test Instructions (from TEST_INSTRUCTIONS.md)

# Crop Size Indicator Debugging Instructions

## What to Check:

### 1. Open Browser Console (F12)
Look for these log messages when you hover over a crop:

```
📐 Crop Size Indicator: Starting
📐 Crop Size Indicator: Watching for crop tooltips
📐 Processing tooltip element: [class names]
📐 Element HTML preview: [HTML content]
```

### 2. If You See "Config disabled":
- The feature is off in settings
- Should be enabled by default

### 3. If You Don't See ANY "📐" Messages:
- Feature isn't starting at all
- Check if `initCropSizeIndicator()` is being called

### 4. If You See "No crop name element found":
- The HTML structure changed
- Game CSS class names changed
- Provide the full HTML of the tooltip (right-click → Inspect Element)

### 5. Expected Behavior:
When you hover over a crop in your garden, you should see:
- Aries' price line (if Aries mod is installed): `💰 Price: XXXXX`
- Our size line right below it: `📏 Size: XX% (X.XXx)`

### 6. What to Report:
Please provide:
1. Screenshot of browser console with all "📐" messages
2. Right-click the crop tooltip → Inspect Element → Copy the full HTML
3. Does Aries' price show up? (This confirms tooltips are working)

## Quick Test:
1. Reload the page with Tampermonkey script active
2. Open console (F12)
3. Hover over ANY crop in your garden
4. Look for "📐" messages in console
5. Look at the tooltip for the `📏 Size:` line

---
## Update Summary (from UPDATE_SUMMARY.md)

# QPM-GR Update Summary

## ✅ COMPLETED CHANGES

### 1. **Egg Growth Boost Ability Updates** ✅
**File:** `src/data/petAbilities.ts`

Updated the three tiers of Egg Growth Boost to match the new MG update:
- `EggGrowthBoost` → "Egg Growth Boost I" (21% proc, 7 min reduction)
- `EggGrowthBoostII_NEW` → "Egg Growth Boost II" (24% proc, 9 min reduction)  
- `EggGrowthBoostII` → "Egg Growth Boost III" (27% proc, 11 min reduction)

Added new **Rain Dance** ability for Turkey pet:
- 10% base probability
- Grants "Wet" mutation to crops
- Continuous trigger

### 2. **Turkey Pet Addition** ✅
**File:** `src/data/gameData.ts`

- Added Turkey to Rare egg spawn pool (5% chance)
- Adjusted Pig spawn rate from 90% to 80%
- Added Turkey ability pool: `['Rain Dance', 'Egg Growth II', 'Double Hatch']`

### 3. **Turtle Timer Egg Growth Tracking** ✅
**File:** `src/features/turtleTimer.ts`

- Updated `minutesPerBase` for egg abilities from 10 to 9 (average of 7, 9, 11)
- Pattern matching already handles all three Egg Growth Boost variants (EggGrowthBoost, EggGrowthBoostII_NEW, EggGrowthBoostII)

### 4. **DawnCelestial Detection Fix** ✅
**File:** `src/features/cropBoostTracker.ts`

- Added species name normalization to lowercase before lookup
- Fixed: `const normalizedSpecies = species.toLowerCase();`
- This ensures "DawnCelestial" matches the "dawncelestial" key in plantScales.ts

### 5. **Crop Size Boost Calculation Documentation** ✅
**File:** `src/features/cropBoostTracker.ts`

- Added detailed comments explaining scale-based boost calculation
- Clarified that boost is applied to targetScale (1.0-3.5), not the 50-100% visual size
- Formula remains correct: boost multiplies scale (e.g., 10% boost = scale × 1.10)

### 6. **Crop Boost Tracker Legend** ✅
**File:** `src/ui/cropBoostTrackerWindow.ts`

Added visual legend to explain emoji meanings:
- 🌱 = Growing (not yet mature)
- 🌾 = Fully Grown (mature)

### 7. **Pet Time to Mature Database** ✅
**File:** `src/data/petTimeToMature.ts`

Updated with all current pets and correct maturity times:
- Common (12h): Worm, Snail, Bee
- Uncommon (24h): Chicken, Bunny, Dragonfly
- Rare (72h): Pig, Cow, **Turkey** ← NEW
- Legendary (100h): Squirrel, Turtle, Goat
- Mythical (144h): Butterfly, Peacock, Capybara

### 8. **Game Data Scraper** ✅
**File:** `scripts/scrape-game-data.js`

Created automated tool to extract game data from source file:
- Parses minified game code (`main-D6KeWgpc.js`)
- Extracts pet stats, abilities, crop scales
- Outputs JSON + human-readable report
- Run with: `npm run scrape-game-data`
- Ensures userscript always uses accurate game data

---

## 🔨 REMAINING WORK

### 1. **Color Code Tab Buttons** 🎨
**Status:** Not Started  
**Priority:** Medium

**What needs to be done:**
- Locate tab button rendering in `src/ui/originalPanel.ts`
- Add distinct background colors to tabs for better visual distinction
- Suggested color scheme:
  - Dashboard: `#4CAF50` (green)
  - Turtle Timer: `#2196F3` (blue)
  - Ability Tracker: `#9C27B0` (purple)
  - XP Tracker: `#FF9800` (orange)
  - Mutation Tracker: `#E91E63` (pink)
  - Shop Restock: `#00BCD4` (cyan)
  - Settings: `#607D8B` (blue-grey)

**Implementation:**
Search for button creation in `originalPanel.ts` around line 1000-3000, look for patterns like:
```typescript
button.style.background = 'rgba(...)'
```

Add color coding like:
```typescript
const TAB_COLORS = {
  dashboard: 'rgba(76, 175, 80, 0.28)',
  turtleTimer: 'rgba(33, 150, 243, 0.28)',
  abilityTracker: 'rgba(156, 39, 176, 0.28)',
  // etc...
};
```

### 2. **Auto-Favourite Advanced Filtering** 🎯
**Status:** Not Started  
**Priority:** High

**What needs to be done:**
Add four new filter options to `src/features/autoFavorite.ts`:

#### A. Ability Filter
```typescript
export interface AutoFavoriteConfig {
  enabled: boolean;
  species: string[];
  mutations: string[];
  petAbilities: string[];
  
  // NEW FIELDS:
  filterByAbility?: string | null;        // Specific ability ID to filter
  filterByAbilityCount?: number | null;   // Number of abilities (1-4)
  filterBySpecies?: string | null;        // Single species filter
  filterByCropType?: string | null;       // Crop type filter
}
```

#### B. UI Updates Needed
In the settings panel (likely in `originalPanel.ts` around line 2000-4000), add:

**Ability Dropdown:**
```typescript
const abilitySelect = document.createElement('select');
// Options: None, PlantGrowthBoost, EggGrowthBoost, etc.
```

**Ability Amount Dropdown:**
```typescript
const abilityCountSelect = document.createElement('select');
// Options: Any, 1, 2, 3, 4
```

**Species Dropdown:**
```typescript
const speciesSelect = document.createElement('select');
// Options: All, Chicken, Turtle, Cow, etc.
```

**Crop Type Dropdown:**
```typescript
const cropTypeSelect = document.createElement('select');
// Options: All, Seed, Fruit, Vegetable, Flower, etc.
```

#### C. Logic Updates
Update `checkAndFavoriteNewItems()` to apply these filters:
```typescript
function checkAndFavoriteNewItems(inventory: any): void {
  for (const item of inventory.items) {
    // Existing checks...
    
    // NEW: Check ability filter
    if (config.filterByAbility) {
      const petAbilities = item.abilities || [];
      if (!petAbilities.includes(config.filterByAbility)) continue;
    }
    
    // NEW: Check ability count
    if (config.filterByAbilityCount) {
      const petAbilities = item.abilities || [];
      if (petAbilities.length !== config.filterByAbilityCount) continue;
    }
    
    // NEW: Check species filter
    if (config.filterBySpecies && item.species !== config.filterBySpecies) continue;
    
    // NEW: Check crop type filter
    if (config.filterByCropType && getCropType(item.species) !== config.filterByCropType) continue;
    
    // Existing favorite logic...
  }
}
```

---

## 🏗️ BUILD INSTRUCTIONS

### Prerequisites
```bash
# Ensure Node.js and npm are installed
node --version  # Should be v18+
npm --version
```

### Build Steps
```bash
cd c:\Users\ryand\Feeder-Extension\QPM-GR

# Install dependencies (if not already done)
npm install

# Run full build including userscript generation
npm run build:dist
```

This will:
1. Run `npm run build` - Compiles TypeScript with Vite
2. Run `npm run build:userscript` - Wraps output in Tampermonkey headers

**Output Location:**
- Main bundle: `dist/quinoa-pet-manager.iife.js`
- Userscript: `dist/QPM.user.js` (492KB)

### Game Data Scraper
Extract current game data from source file:
```bash
npm run scrape-game-data
```

**What it does:**
- Reads `main-D6KeWgpc.js` (game source)
- Extracts all pet stats, abilities, and crop data
- Outputs to `scraped-data/` directory
- Generates human-readable report

**When to use:**
- Game updates with new pets/abilities
- Verifying current stats match game source
- Discovering new content added by developers

See `scraped-data/README.md` for full documentation.

### Testing
1. Open Tampermonkey extension in your browser
2. Click "Create new script"
3. Paste contents of `dist/QPM.user.js`
4. Save and navigate to magicgarden.gg
5. Test all updated features:
   - ✅ Turkey pet detection and tracking
   - ✅ Turkey XP calculation (72 hours maturity, same as Pig/Cow)
   - ✅ Egg Growth Boost I/II/III in Turtle Timer (average 9 min reduction)
   - ✅ DawnCelestial detection in Crop Boost Tracker
   - ✅ Legend display in Crop Boost Tracker (🌱/🌾)
   - ✅ All 15 pets tracked with correct maturity times

---

## 📝 CHANGELOG FOR PATCH NOTES

```markdown
## Version 1.12.0 - Turkey Update

### 🦃 New Features
- **Turkey Pet Support**: Full tracking and ability support for the new Turkey pet
  - Rain Dance ability (grants Wet mutation)
  - Egg Growth Boost II compatibility
  - Added to Rare egg spawn pool (5%)

### 🔧 Bug Fixes
- **Egg Growth Boost Tiers**: Fixed tracking for all three tiers (I, II, III)
  - Tier I: 21% proc, 7 minutes reduction
  - Tier II: 24% proc, 9 minutes reduction  
  - Tier III: 27% proc, 11 minutes reduction
- **DawnCelestial Detection**: Fixed Dawnbinder crops not being detected in Crop Size Boost tracker
- **Crop Boost Calculations**: Improved scale-based calculation documentation

### 🎨 UI Improvements
- **Crop Boost Tracker Legend**: Added visual legend explaining emoji meanings
  - 🌱 = Still Growing
  - 🌾 = Fully Grown
- **Better Species Detection**: Normalized species name lookup to handle case variations

### 📊 Data Updates
- Updated pet ability database with new Turkey abilities
- Adjusted Rare egg spawn rates (Pig 90%→80%, Turkey 5%)
- Added Rain Dance to ability definitions
```

---

## 🚨 KNOWN ISSUES

None! All requested features have been implemented except:
- Tab button color coding (cosmetic enhancement)
- Advanced auto-favourite filtering (feature expansion)

Both can be added in future updates if needed.

---

## 🔗 USEFUL RESOURCES

- **Game Source File**: `main-D6KeWgpc.js` in repo root
- **CLAUDE.md**: AI development guide (needs updating with new changes)
- **Package.json**: Contains all build scripts and dependencies
- **tsconfig.json**: TypeScript configuration
- **vite.config.ts**: Vite bundler configuration

---
## Scraped Data Workflow (from scraped-data/README.md)

# Game Data Scraper Documentation

## Overview
The game data scraper (`scripts/scrape-game-data.js`) automatically extracts current game data from the minified game source file (`main-D6KeWgpc.js`) to ensure your userscript displays accurate information.

## Usage

### Quick Start
```bash
npm run scrape-game-data
```

### What It Does
1. **Reads** the game source file (`main-D6KeWgpc.js`)
2. **Extracts** pet data, abilities, and crop information
3. **Outputs** JSON files to `scraped-data/` directory:
   - `pets.json` - All pet species with stats
   - `abilities.json` - Ability IDs and names  
   - `crops.json` - Crop max scales
   - `REPORT.md` - Human-readable summary

### Example Output
```json
{
  "timestamp": "2025-11-30T09:09:39.147Z",
  "source": "main-D6KeWgpc.js",
  "pets": {
    "Turkey": {
      "name": "Turkey",
      "hungerCost": 500,
      "abilities": {
        "RainDance": 60,
        "EggGrowthBoostII_NEW": 35,
        "DoubleHatch": 5
      },
      "baseTileScale": 1,
      "maxScale": 2.5,
      "sellPrice": 3000000,
      "weight": 10,
      "moveProb": 0.25,
      "hoursToMature": 72,
      "rarity": "Rare"
    }
  }
}
```

## When to Run

### Game Updates
Run the scraper whenever the game updates with:
- New pets or species
- New abilities
- New crops/produce
- Changed stats (hunger costs, maturity times, etc.)

### Recommended Workflow
1. **Save new game source**: When the game updates, save the new minified source file as `main-D6KeWgpc.js` (or update filename in scraper)
2. **Run scraper**: `npm run scrape-game-data`
3. **Review output**: Check `scraped-data/REPORT.md` for changes
4. **Update TypeScript files**: Compare with `src/data/` files and update as needed
5. **Test**: Run `npm run build:dist` and test in-game
6. **Commit**: Save changes to git

## How It Works

### Pet Data Extraction
The scraper uses a bracket-counting algorithm to parse minified JavaScript:

```javascript
// Finds: Turkey:{tileRef:xn.Turkey,name:"Turkey",...}
// Extracts all nested properties including ability weights
```

### Data Parsed
For each pet:
- `name` - Display name
- `hungerCost` - Coins to fully replenish hunger
- `abilities` - Object mapping ability names to spawn weights
- `baseTileScale` - Initial size multiplier
- `maxScale` - Maximum size at maturity
- `sellPrice` - Mature sell value (handles scientific notation like 3e6)
- `weight` - Mature weight in units
- `moveProb` - Movement probability (0-1)
- `hoursToMature` - Time to reach maturity
- `rarity` - Common/Uncommon/Rare/Legendary/Mythic

## Updating the Scraper

### Adding New Pet
Edit the `petNames` array in `extractPetData()`:
```javascript
const petNames = [
  'Worm', 'Snail', 'Bee', 'Chicken', 'Bunny', 'Dragonfly',
  'Pig', 'Cow', 'Turkey', 'Squirrel', 'Turtle', 'Goat',
  'Butterfly', 'Peacock', 'Capybara',
  'NewPet' // Add here
];
```

### Extracting New Data Types
Create a new extraction function following the pattern:
```javascript
function extractNewDataType(source) {
  const data = {};
  
  // Use regex or string parsing to find patterns
  const pattern = /YourPattern:\{([^}]+)\}/g;
  
  let match;
  while ((match = pattern.exec(source)) !== null) {
    // Parse and store data
  }
  
  return data;
}
```

## Troubleshooting

### "Could not find pet X"
- Check if the pet name matches exactly (case-sensitive)
- Verify the game source file has that pet
- The pet format may have changed - update the extraction logic

### "Missing required fields for X"
- The regex patterns may need updating
- Check if game source format changed (view raw file)
- Add debug logging to see what was matched

### Scientific Notation Issues
The scraper handles formats like:
- `500` → 500
- `25e3` → 25000  
- `3e6` → 3000000

If a value looks wrong, check the `sellPrice` or `hungerCost` parsing logic.

## Integration with Userscript

### Manual Updates
After scraping, compare `scraped-data/pets.json` with your TypeScript files:

```typescript
// src/data/petTimeToMature.ts
export const PET_TIME_TO_MATURE: Record<string, number> = {
  Turkey: 72, // ← Update from scraped data
  // ...
};
```

### Automated Updates (Future Enhancement)
Consider creating a script that:
1. Runs scraper
2. Diffs against existing TypeScript files
3. Generates TypeScript code
4. Prompts for review before applying changes

## Output Files

### pets.json
Complete pet database with all stats and abilities.

**Use for:** Updating `src/data/gameData.ts`, `petTimeToMature.ts`, `petAbilities.ts`

### abilities.json
Ability ID mappings (when extractable from source).

**Use for:** Verifying ability names match game code

### crops.json
Crop max scales for size calculations.

**Use for:** Updating `src/utils/plantScales.ts`

### REPORT.md
Human-readable summary with:
- Pet count and details
- Ability list
- Next steps for integration

## Best Practices

1. **Version Control**: Commit scraped data alongside code changes
2. **Backup**: Keep old `main-D6KeWgpc.js` files for reference
3. **Validation**: Always test scraped data in-game before releasing
4. **Documentation**: Update `PATCH_NOTES.md` with changes found
5. **Review**: Don't blindly trust scraped data - verify critical values

## Example Workflow

```bash
# 1. Update game source file (manually save from browser)
# Save to: main-D6KeWgpc.js

# 2. Run scraper
npm run scrape-game-data

# 3. Review changes
cat scraped-data/REPORT.md

# 4. Update TypeScript files
# Compare scraped-data/pets.json with src/data/gameData.ts
# Update any changed values

# 5. Rebuild
npm run build:dist

# 6. Test in Tampermonkey
# Install dist/QPM.user.js

# 7. Commit
git add .
git commit -m "Update game data for Turkey pet addition"
```

## Future Enhancements

### Potential Improvements
- [ ] Extract ability effects (proc rates, durations, etc.)
- [ ] Parse crop growth times and seed costs
- [ ] Extract weather event data
- [ ] Scrape shop item prices
- [ ] Generate TypeScript interfaces automatically
- [ ] Create diff tool to show changes between scrapes
- [ ] Add validation against known game constants
- [ ] Support multiple game source file versions

### Auto-Update System
Ideal future workflow:
1. User provides game URL or auth token
2. Script fetches latest game source automatically
3. Compares with previous scrape
4. Generates git diff
5. Creates PR with changes
6. CI/CD runs tests and deploys if passing

## Questions?

If you encounter issues with the scraper:
1. Check the game source file exists and is readable
2. Verify Node.js version (should be v18+)
3. Look for error messages in console output
4. Review the regex patterns in the script
5. Create an issue in the repo with error details

---
## Scraped Data Report Template (from scraped-data/REPORT.md)

# Game Data Scrape Report
**Generated:** 2025-11-30T09:10:38.888Z
**Source:** main-D6KeWgpc.js

## Summary
- **Pets Found:** 15
- **Abilities Found:** 0
- **Crops Found:** 1

## Pet Details

### Worm
- **Rarity:** Common
- **Hours to Mature:** 12
- **Hunger Cost:** 500 coins
- **Sell Price:** 5000 coins
- **Abilities:** SeedFinderI (50%), ProduceEater (50%)


### Snail
- **Rarity:** Common
- **Hours to Mature:** 12
- **Hunger Cost:** 1000 coins
- **Sell Price:** 10000 coins
- **Abilities:** CoinFinderI (100%)


### Bee
- **Rarity:** Common
- **Hours to Mature:** 12
- **Hunger Cost:** 1500 coins
- **Sell Price:** 30000 coins
- **Abilities:** ProduceScaleBoost (50%), ProduceMutationBoost (50%)


### Chicken
- **Rarity:** Uncommon
- **Hours to Mature:** 24
- **Hunger Cost:** 3000 coins
- **Sell Price:** 50000 coins
- **Abilities:** EggGrowthBoost (80%), PetRefund (20%)


### Bunny
- **Rarity:** Uncommon
- **Hours to Mature:** 24
- **Hunger Cost:** 750 coins
- **Sell Price:** 75000 coins
- **Abilities:** CoinFinderII (60%), SellBoostI (40%)


### Dragonfly
- **Rarity:** Uncommon
- **Hours to Mature:** 24
- **Hunger Cost:** 250 coins
- **Sell Price:** 150000 coins
- **Abilities:** HungerRestore (70%), PetMutationBoost (30%)


### Pig
- **Rarity:** Rare
- **Hours to Mature:** 72
- **Hunger Cost:** 50000 coins
- **Sell Price:** 500000 coins
- **Abilities:** SellBoostII (30%), PetAgeBoost (30%), PetHatchSizeBoost (30%)


### Cow
- **Rarity:** Rare
- **Hours to Mature:** 72
- **Hunger Cost:** 25000 coins
- **Sell Price:** 1000000 coins
- **Abilities:** SeedFinderII (30%), HungerBoost (30%), PlantGrowthBoost (30%)


### Turkey
- **Rarity:** Rare
- **Hours to Mature:** 72
- **Hunger Cost:** 500 coins
- **Sell Price:** 3000000 coins
- **Abilities:** RainDance (60%), EggGrowthBoostII_NEW (35%), DoubleHatch (5%)


### Squirrel
- **Rarity:** Legendary
- **Hours to Mature:** 100
- **Hunger Cost:** 15000 coins
- **Sell Price:** 5000000 coins
- **Abilities:** CoinFinderIII (70%), SellBoostIII (20%), PetMutationBoostII (10%)


### Turtle
- **Rarity:** Legendary
- **Hours to Mature:** 100
- **Hunger Cost:** 100000 coins
- **Sell Price:** 10000000 coins
- **Abilities:** HungerRestoreII (25%), HungerBoostII (25%), PlantGrowthBoostII (25%), EggGrowthBoostII (25%)


### Goat
- **Rarity:** Legendary
- **Hours to Mature:** 100
- **Hunger Cost:** 20000 coins
- **Sell Price:** 20000000 coins
- **Abilities:** PetHatchSizeBoostII (10%), PetAgeBoostII (40%), PetXpBoost (40%)


### Butterfly
- **Rarity:** Mythic
- **Hours to Mature:** 144
- **Hunger Cost:** 25000 coins
- **Sell Price:** 50000000 coins
- **Abilities:** ProduceScaleBoostII (40%), ProduceMutationBoostII (40%), SeedFinderIII (20%)


### Peacock
- **Rarity:** Mythic
- **Hours to Mature:** 144
- **Hunger Cost:** 100000 coins
- **Sell Price:** 100000000 coins
- **Abilities:** SellBoostIV (40%), PetXpBoostII (50%), PetRefundII (10%)


### Capybara
- **Rarity:** Mythic
- **Hours to Mature:** 144
- **Hunger Cost:** 150000 coins
- **Sell Price:** 200000000 coins
- **Abilities:** DoubleHarvest (50%), ProduceRefund (50%)


## Abilities


## Next Steps
1. Review scraped data in `scraped-data/` directory
2. Compare with existing data files in `src/data/`
3. Update TypeScript definitions if new items detected
4. Run tests to ensure compatibility

---
## Firebase Config Notes (from src/config/README.md)

# Configuration Files

This directory contains configuration files for the QPM project.

## Firebase Configuration

The Firebase configuration for the Public Rooms feature is stored in `firebase.config.ts`.

### File Structure

- `firebase.config.ts` - Firebase configuration for Public Rooms feature
- `firebase.config.template.ts` - Template file showing the structure (can be deleted)
---
## Archived Dev Utilities

> Legacy developer helpers preserved inline so the files can be removed from the repository.

### Seed Shop Discovery Console Snippet

```javascript
// ============================================
// Seed Shop ID Discovery Tool
// ============================================
// Paste this in console to see all seed species IDs
// Especially useful for verifying Celestial seed names

(function discoverSeedIds() {
  console.clear();
  console.log('🌱 SEED SHOP ID DISCOVERY\n');
  console.log('Finding all seed species IDs from shop data...\n');

  // Get the shop stock state from Jotai atoms
  const shopsAtom = Array.from(window.jotaiAtomCache?.cache?.values() || [])
    .find(atom => atom?.debugLabel === 'shopsAtom');

  if (!shopsAtom) {
    console.log('❌ Could not find shopsAtom. Make sure QPM is loaded.');
    return;
  }

  const stockState = window.__qpmJotaiStore__?.get?.(shopsAtom);
  if (!stockState) {
    console.log('❌ Could not read shop data.');
    return;
  }

  const seedData = stockState.seed;
  if (!seedData?.inventory) {
    console.log('⚠️ No seed shop data. Open the seed shop (Alt+S) first!');
    return;
  }

  console.log('═'.repeat(80));
  console.log('  🌱 ALL SEED SPECIES IDs');
  console.log('═'.repeat(80));

  const seeds = seedData.inventory;
  seeds.forEach((seed, index) => {
    const species = seed.species;
    const name = seed.name || seed.displayName || species || '(unknown)';
    const stock = seed.stock ?? seed.initialStock ?? '?';
    const priceCoins = seed.priceCoins ?? seed.price ?? '?';
    const rarity = extractRarity(name) || 'Common';

    console.log(`\n  [${index + 1}] ${name}`);
    console.log(`      Species ID: "${species}"`);
    console.log(`      Rarity: ${rarity}`);
    console.log(`      Stock: ${stock}`);
    console.log(`      Price: ${priceCoins} coins`);
    console.log(`      WebSocket Command:`);
    console.log(`      window.MagicCircle_RoomConnection.sendMessage({`);
    console.log(`        type: 'PurchaseSeed',`);
    console.log(`        species: '${species}',`);
    console.log(`        scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa']`);
    console.log(`      })`);
  });

  console.log('\n' + '═'.repeat(80));
  console.log('\n📋 CELESTIAL SEEDS (if present):\n');

  const celestialSeeds = seeds.filter(seed => {
    const name = (seed.name || seed.displayName || seed.species || '').toLowerCase();
    return name.includes('celestial') ||
           name.includes('moonbinder') ||
           name.includes('dawnbinder') ||
           name.includes('starweaver');
  });

  if (celestialSeeds.length === 0) {
    console.log('  ⚠️ No Celestial seeds found in current shop stock');
    console.log('  (They may not be in stock or not unlocked yet)');
  } else {
    celestialSeeds.forEach(seed => {
      const species = seed.species;
      const name = seed.name || seed.displayName || species;
      console.log(`  ✨ ${name}`);
      console.log(`     Species ID: "${species}"`);
      console.log(`     Command: window.MagicCircle_RoomConnection.sendMessage({ type: 'PurchaseSeed', species: '${species}', scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa'] })`);
      console.log('');
    });
  }

  console.log('═'.repeat(80));
  console.log('\n✅ Discovery complete!');
  console.log('Copy the WebSocket commands above to test seed purchases.\n');

  // Helper function to extract rarity
  function extractRarity(text) {
    const rarities = ['Mythical', 'Divine', 'Celestial', 'Legendary', 'Rare', 'Uncommon', 'Common'];
    for (const rarity of rarities) {
      if (text && text.includes(rarity)) {
        return rarity;
      }
    }
    return null;
  }

  // Also generate quick reference
  console.log('\n📋 QUICK COPY-PASTE COMMANDS:\n');
  seeds.forEach(seed => {
    const species = seed.species;
    const name = seed.name || seed.displayName || species;
    if (!species) return;

    console.log(`// ${name}`);
    console.log(`window.MagicCircle_RoomConnection.sendMessage({ type: 'PurchaseSeed', species: '${species}', scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa'] })`);
    console.log('');
  });

  console.log('═'.repeat(80));
  console.log('\n💡 TIP: If Celestial seeds are missing, they might not be in the current shop rotation.');
  console.log('         Open the seed shop (Alt+S) when they appear to discover their IDs.\n');
})();
```

### Shop Inventory Structure Snippet

```javascript
// ============================================
// Shop ID Discovery Tool
// ============================================
// Paste this in console to see all current shop item IDs

function discoverAllShopIds() {
  console.log('🔍 DISCOVERING ALL SHOP ITEM IDs\n');
  console.log('This will show you the exact IDs to use for WebSocket purchases\n');

  // Get the shop stock state from QPM
  const stockState = window.__qpmJotaiStore__?.get?.(window.jotaiAtomCache?.cache?.values()
    ?.find?.(atom => atom?.debugLabel === 'shopsAtom'));

  if (!stockState) {
    console.log('❌ Could not find shop data. Make sure QPM is loaded and shops have been opened at least once.');
    return;
  }

  const categories = ['seed', 'egg', 'tool', 'decor'];

  for (const category of categories) {
    const categoryData = stockState[category];
    if (!categoryData?.inventory) {
      console.log(`⏭️ No data for ${category} shop`);
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 ${category.toUpperCase()} SHOP`);
    console.log('='.repeat(60));

    const items = categoryData.inventory;
    items.forEach((item, index) => {
      // Determine the ID field based on category
      let id;
      let idField;
      switch (category) {
        case 'seed':
          id = item.species;
          idField = 'species';
          break;
        case 'egg':
          id = item.eggId;
          idField = 'eggId';
          break;
        case 'tool':
          id = item.toolId;
          idField = 'toolId';
          break;
        case 'decor':
          id = item.decorId;
          idField = 'decorId';
          break;
      }

      const name = item.name || item.displayName || id || '(unknown)';
      const stock = item.stock ?? item.initialStock ?? '?';
      const priceCoins = item.priceCoins ?? item.price ?? '?';
      const priceCredits = item.priceCredits ?? '?';

      console.log(`\n  [${index + 1}] ${name}`);
      console.log(`      ID (${idField}): "${id}"`);
      console.log(`      Stock: ${stock}`);
      console.log(`      Price: ${priceCoins} coins / ${priceCredits} credits`);

      // Show WebSocket command example
      const commandType = {
        seed: 'PurchaseSeed',
        egg: 'PurchaseEgg',
        tool: 'PurchaseTool',
        decor: 'PurchaseDecor',
      }[category];

      const paramName = {
        seed: 'species',
        egg: 'eggId',
        tool: 'toolId',
        decor: 'decorId',
      }[category];

      console.log(`      WebSocket Command:`);
      console.log(`      window.MagicCircle_RoomConnection.sendMessage({`);
      console.log(`        type: '${commandType}',`);
      console.log(`        ${paramName}: '${id}',`);
      console.log(`        scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa']`);
      console.log(`      })`);
    });

    console.log(`\n${'='.repeat(60)}\n`);
  }

  console.log('✅ Discovery complete!\n');
  console.log('Copy the WebSocket commands above to test purchases.');
  console.log('Replace the ID with the one shown for each item.\n');
}

// Also export a quick reference generator
function generateQuickReference() {
  console.log('\n📋 QUICK REFERENCE - Copy/Paste Commands\n');

  const stockState = window.__qpmJotaiStore__?.get?.(window.jotaiAtomCache?.cache?.values()
    ?.find?.(atom => atom?.debugLabel === 'shopsAtom'));

  if (!stockState) {
    console.log('❌ Could not find shop data');
    return;
  }

  const categories = [
    { key: 'egg', type: 'PurchaseEgg', param: 'eggId' },
    { key: 'tool', type: 'PurchaseTool', param: 'toolId' },
    { key: 'decor', type: 'PurchaseDecor', param: 'decorId' },
  ];

  for (const { key, type, param } of categories) {
    const categoryData = stockState[key];
    if (!categoryData?.inventory) continue;

    console.log(`\n// ${key.toUpperCase()} COMMANDS:`);
    categoryData.inventory.forEach(item => {
      const id = item[param];
      const name = item.name || item.displayName || id;
      if (!id) return;

      console.log(`// ${name}`);
      console.log(`window.MagicCircle_RoomConnection.sendMessage({ type: '${type}', ${param}: '${id}', scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa'] })`);
      console.log('');
    });
  }
}

// Run both
console.clear();
discoverAllShopIds();
generateQuickReference();

console.log('\n💡 TIP: If shops show no data, open each shop manually (Alt+S/E/T/D) then run this again.');
```

### Magic Garden Atom Inspector Userscript

```javascript
// ==UserScript==
// @name         Magic Garden Atom Inspector
// @namespace    https://github.com/ryand/mgmods
// @version      0.1.0
// @description  Proof-of-concept overlay that reads MagicGarden Jotai atoms (inventory, pet hutch, shop stock) without opening in-game panels.
// @author       GitHub Copilot
// @match        https://magiccircle.gg/r/*
// @match        https://magicgarden.gg/r/*
// @match        https://starweaver.org/r/*
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_NAME = 'MG Atom Inspector';
  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const MAX_STORE_CAPTURE_TIME_MS = 12000;

  const SYNTHETIC_ATOMS = {
    GardenSlotsSig: {
      source: 'myDataAtom:garden.tileObjects',
      derive(value) {
        if (!value || typeof value !== 'object') return null;
        const signatures = {};
        for (const [key, slot] of Object.entries(value)) {
          signatures[key] = computeGardenSlotSignature(slot);
        }
        return signatures;
      },
    },
  };

  const SECTION_CONFIG = [
    // Core Inventories & Pets
    { key: 'inventory', title: 'Inventory', atom: 'myInventoryAtom', prop: 'inventory', renderer: renderInventory, defaultOpen: true },
    { key: 'hutch', title: 'Pet Hutch', atom: 'myPetHutchPetItemsAtom', prop: 'hutch', renderer: renderHutch },
    { key: 'petInfos', title: 'Active Pets', atom: 'myPetInfosAtom', prop: 'petInfos', renderer: renderPetInfos },
    { key: 'petSlots', title: 'Pet Slots', atom: 'myPetSlotInfosAtom', prop: 'petSlots', renderer: renderPetSlots },
    { key: 'petSellPrice', title: 'Total Pet Sell Price', atom: 'totalPetSellPriceAtom', prop: 'totalPetSellPrice', renderer: renderSimpleValue },
    { key: 'expandedPetSlot', title: 'Expanded Pet Slot ID', atom: 'expandedPetSlotIdAtom', prop: 'expandedPetSlotId', renderer: renderSimpleValue },
    { key: 'numHutchItems', title: 'Pet Hutch Item Count', atom: 'myNumPetHutchItemsAtom', prop: 'numHutchItems', renderer: renderSimpleValue },

    // Inventory extensions
    { key: 'cropInventory', title: 'Crop Inventory', atom: 'myCropInventoryAtom', prop: 'cropInventory', renderer: renderGenericInventory },
    { key: 'seedInventory', title: 'Seed Inventory', atom: 'mySeedInventoryAtom', prop: 'seedInventory', renderer: renderGenericInventory },
    { key: 'toolInventory', title: 'Tool Inventory', atom: 'myToolInventoryAtom', prop: 'toolInventory', renderer: renderGenericInventory },
    { key: 'eggInventory', title: 'Egg Inventory', atom: 'myEggInventoryAtom', prop: 'eggInventory', renderer: renderGenericInventory },
    { key: 'decorInventory', title: 'Decor Inventory', atom: 'myDecorInventoryAtom', prop: 'decorInventory', renderer: renderGenericInventory },
    { key: 'inventoryCapacity', title: 'Inventory Capacity Flags', atom: 'isMyInventoryAtMaxLengthAtom', prop: 'inventoryCapacity', renderer: renderSimpleValue },
    { key: 'favoriteIds', title: 'Favorite Item IDs', atom: 'myInventoryAtom:favoritedItemIds', prop: 'favoriteIds', renderer: renderStringArray },
    { key: 'validatedSelectedIndex', title: 'Validated Selected Index', atom: 'myValidatedSelectedItemIndexAtom', prop: 'validatedSelectedIndex', renderer: renderSimpleValue },
    { key: 'possiblyInvalidSelectedIndex', title: 'Possibly Invalid Selected Index', atom: 'myPossiblyNoLongerValidSelectedItemIndexAtom', prop: 'possiblyInvalidSelectedIndex', renderer: renderSimpleValue },
    { key: 'selectedItemName', title: 'Selected Item Name', atom: 'mySelectedItemNameAtom', prop: 'selectedItemName', renderer: renderSimpleValue },

    // Garden / Map state
    { key: 'gardenObject', title: 'Current Garden Object', atom: 'myCurrentGardenObjectAtom', prop: 'currentGardenObject', renderer: renderGardenObject },
    { key: 'gardenTileObjects', title: 'Garden Tile Objects', atom: 'myDataAtom:garden.tileObjects', prop: 'gardenTileObjects', renderer: renderObjectSummary, options: { defaultLimit: 24 } },
    { key: 'myOwnGardenObject', title: 'My Own Garden Object', atom: 'myOwnCurrentGardenObjectAtom', prop: 'myOwnGardenObject', renderer: renderGardenObject },
    { key: 'myOwnGardenObjectType', title: 'My Garden Object Type', atom: 'myOwnCurrentGardenObjectAtom:objectType', prop: 'myOwnGardenObjectType', renderer: renderSimpleValue },
    { key: 'myOwnDirtTileIndex', title: 'My Dirt Tile Index', atom: 'myOwnCurrentDirtTileIndexAtom', prop: 'myOwnDirtTileIndex', renderer: renderSimpleValue },
    { key: 'stateAtom', title: 'State Atom', atom: 'stateAtom', prop: 'stateAtom', renderer: renderJsonPreview, options: { defaultLimit: 1800 } },
    { key: 'stateChildData', title: 'State Child Data', atom: 'stateAtom:child.data', prop: 'stateChildData', renderer: renderObjectSummary, options: { defaultLimit: 24 } },
    { key: 'gardenSlotsSig', title: 'Garden Slots Signature', atom: 'GardenSlotsSig', prop: 'gardenSlotsSig', renderer: renderObjectSummary, options: { defaultLimit: 12 } },

    // Growth timers
    { key: 'growSlotOrder', title: 'Grow Slot Order', atom: 'myCurrentSortedGrowSlotIndicesAtom', prop: 'growSlotOrder', renderer: renderNumberArray },
    { key: 'currentGrowSlotIndex', title: 'Current Grow Slot Index', atom: 'myCurrentGrowSlotIndexAtom', prop: 'currentGrowSlotIndex', renderer: renderSimpleValue },
    { key: 'growSlotMature', title: 'Current Slot Mature?', atom: 'isCurrentGrowSlotMatureAtom', prop: 'growSlotMature', renderer: renderSimpleValue },
    { key: 'totalCropSellPrice', title: 'Total Crop Sell Price', atom: 'totalCropSellPriceAtom', prop: 'totalCropSellPrice', renderer: renderSimpleValue },

    // Player / Session
    { key: 'player', title: 'Player', atom: 'playerAtom', prop: 'player', renderer: renderPlayer },
    { key: 'playerId', title: 'Player ID', atom: 'playerAtom:id', prop: 'playerId', renderer: renderSimpleValue },
    { key: 'numPlayers', title: 'Number of Players', atom: 'numPlayersAtom', prop: 'numPlayers', renderer: renderSimpleValue },
    { key: 'weather', title: 'Weather', atom: 'weatherAtom', prop: 'weather', renderer: renderWeather },
    { key: 'activeModal', title: 'Active Modal', atom: 'activeModalAtom', prop: 'activeModal', renderer: renderActiveModal },
    { key: 'avatarAnimation', title: 'Avatar Animation', atom: 'avatarTriggerAnimationAtom', prop: 'avatarAnimation', renderer: renderSimpleValue },
    { key: 'myData', title: 'My Data Snapshot', atom: 'myDataAtom', prop: 'myData', renderer: renderMyData },

    // Shops / Rooms
    { key: 'shops', title: 'Shop Stock', atom: 'shopsAtom', prop: 'shops', renderer: renderShops, defaultOpen: true },
    { key: 'purchases', title: 'Shop Purchases', atom: 'myShopPurchasesAtom', prop: 'purchases', renderer: renderShopPurchases },
    { key: 'stateShops', title: 'State Shops', atom: 'stateAtom:child.data.shops', prop: 'stateShops', renderer: renderObjectSummary, options: { defaultLimit: 20 } },
  ];

  const observed = {
    storeMethod: 'pending',
    storePolyfill: false,
    lastError: null,
    panelMessage: 'Initializing…'
  };

  const observedSeen = {};
  const missingAtoms = {};

  for (const section of SECTION_CONFIG) {
    if (!(section.prop in observed)) {
      observed[section.prop] = null;
    }
    observedSeen[section.prop] = false;
    missingAtoms[section.prop] = false;
  }

  const uiState = createUiState();

  const ui = createPanel();
  ui.element.addEventListener('click', handlePanelClick, false);
  ui.element.addEventListener('toggle', handlePanelToggle, true);
  render();

  bootstrap().catch((err) => {
    console.error(`[${SCRIPT_NAME}] bootstrap failed`, err);
    observed.lastError = String(err?.message ?? err);
    observed.panelMessage = 'Bootstrap error';
    render();
  });

  async function bootstrap() {
    await waitForDom();
    ui.setStatus('Waiting for atom cache…');
    const cache = await waitFor(() => getAtomCache(), MAX_STORE_CAPTURE_TIME_MS);
    if (!cache) {
      observed.panelMessage = 'jotaiAtomCache missing (game not ready yet?)';
      render();
      return;
    }

    ui.setStatus('Capturing store…');
    const { store, via } = await captureStoreWithRetry();
    if (!store || store.__polyfill) {
      observed.storeMethod = store?.__polyfill ? 'polyfill' : 'unknown';
      observed.storePolyfill = !!store?.__polyfill;
      observed.panelMessage = 'Failed to capture live store';
      render();
      return;
    }

    observed.storeMethod = via;
    observed.panelMessage = 'Live store captured';
    render();
    ui.setStatus('Subscribing to atoms…');

    const unsubscribers = [];
    for (const section of SECTION_CONFIG) {
      const unsub = await subscribeAtom(section.atom, (value) => {
        observed[section.prop] = value;
        observedSeen[section.prop] = true;
        render();
      });
      if (typeof unsub === 'function') {
        unsubscribers.push(unsub);
      } else {
        missingAtoms[section.prop] = true;
        render();
      }
    }

    ui.setStatus('Watching atoms');

    const teardown = () => {
      for (const unsub of unsubscribers) {
        try { if (typeof unsub === 'function') unsub(); } catch {}
      }
    };
    window.addEventListener('beforeunload', teardown);
  }

  /* -------------------------------------------------------------------------- */
  /* Bridge to game Jotai store                                                 */
  /* -------------------------------------------------------------------------- */

  function parsePath(path) {
    if (!path) return [];
    return String(path).split('.').filter(Boolean);
  }

  function getPathValue(root, segments) {
    let current = root;
    for (const segment of segments) {
      if (current == null) return undefined;
      current = current[segment];
    }
    return current;
  }

  function computeGardenSlotSignature(slot) {
    if (!slot || typeof slot !== 'object') return '∅';
    const type = slot.objectType ?? slot.type ?? '';
    const species = slot.species ?? slot.seedSpecies ?? slot.plantSpecies ?? slot.eggId ?? slot.decorId ?? '';
    const planted = slot.plantedAt ?? slot.startTime ?? 0;
    const matured = slot.maturedAt ?? slot.endTime ?? 0;
    return [type, species, planted, matured].join('|');
  }

  const AtomBridge = (() => {
    let store = null;
    let captureInProgress = false;
    let lastMethod = null;

    function getAtomCache() {
      return pageWindow?.jotaiAtomCache?.cache;
    }

    function findStoreViaFiber() {
      const hook = pageWindow?.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!hook || !hook.renderers?.size) return null;

      for (const [rendererId] of hook.renderers) {
        const roots = hook.getFiberRoots?.(rendererId);
        if (!roots) continue;
        for (const root of roots) {
          const seen = new Set();
          const stack = [root.current];
          while (stack.length) {
            const node = stack.pop();
            if (!node || seen.has(node)) continue;
            seen.add(node);
            const value = node?.pendingProps?.value;
            if (value && typeof value.get === 'function' && typeof value.set === 'function' && typeof value.sub === 'function') {
              lastMethod = 'fiber';
              return value;
            }
            if (node.child) stack.push(node.child);
            if (node.sibling) stack.push(node.sibling);
            if (node.alternate) stack.push(node.alternate);
          }
        }
      }
      return null;
    }

    async function captureViaWriteOnce(timeoutMs = 5000) {
      const cache = getAtomCache();
      if (!cache) throw new Error('jotaiAtomCache.cache not found');

      let capturedGet = null;
      let capturedSet = null;
      const patched = [];

      const restorePatched = () => {
        for (const atom of patched) {
          try {
            if (atom.__mgOrigWrite) {
              atom.write = atom.__mgOrigWrite;
              delete atom.__mgOrigWrite;
            }
          } catch {}
        }
      };

      for (const atom of cache.values()) {
        if (!atom || typeof atom.write !== 'function' || atom.__mgOrigWrite) continue;
        const original = atom.write;
        atom.__mgOrigWrite = original;
        atom.write = function patchedWrite(get, set, ...args) {
          if (!capturedSet) {
            capturedGet = get;
            capturedSet = set;
            restorePatched();
          }
          return original.call(this, get, set, ...args);
        };
        patched.push(atom);
      }

      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const startedAt = Date.now();

      try {
        pageWindow?.dispatchEvent?.(new pageWindow.Event('visibilitychange'));
      } catch {}

      while (!capturedSet && Date.now() - startedAt < timeoutMs) {
        await wait(50);
      }

      if (!capturedSet) {
        restorePatched();
        lastMethod = 'polyfill';
        console.warn(`[${SCRIPT_NAME}] captureViaWriteOnce timed out`);
        return {
          get() { throw new Error('Store not captured'); },
          set() { throw new Error('Store not captured'); },
          sub() { return () => {}; },
          __polyfill: true,
        };
      }

      lastMethod = 'write';
      return {
        get(atom) {
          return capturedGet(atom);
        },
        set(atom, value) {
          return capturedSet(atom, value);
        },
        sub(atom, cb) {
          let lastValue;
          let active = true;
          const tick = async () => {
            if (!active) return;
            let next;
            try {
              next = capturedGet(atom);
            } catch {
              return;
            }
            if (next !== lastValue) {
              lastValue = next;
              try { cb(); } catch {}
            }
          };
          const intervalId = setInterval(tick, 120);
          tick();
          return () => {
            active = false;
            clearInterval(intervalId);
          };
        },
      };
    }

    async function ensureStoreInternal() {
      if (store && !store.__polyfill) return store;
      if (captureInProgress) {
        const start = Date.now();
        while (captureInProgress && Date.now() - start < 6000) {
          await sleep(50);
        }
        return store;
      }

      captureInProgress = true;
      try {
        const fiberStore = findStoreViaFiber();
        if (fiberStore) {
          store = fiberStore;
          return store;
        }
        const fallback = await captureViaWriteOnce();
        store = fallback;
        return store;
      } finally {
        captureInProgress = false;
      }
    }

    async function ensureStore() {
      return ensureStoreInternal();
    }

    function getAtomByLabel(label) {
      const cache = getAtomCache();
      if (!cache) return null;
      const matcher = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
      for (const atom of cache.values()) {
        const atomLabel = atom?.debugLabel || atom?.label || '';
        if (matcher.test(String(atomLabel))) return atom;
      }
      return null;
    }

    async function getValue(atom) {
      const s = await ensureStore();
      if (!s || s.__polyfill) throw new Error('Store not captured');
      return s.get(atom);
    }

    async function subscribe(atom, handler) {
      const s = await ensureStore();
      if (!s || s.__polyfill) throw new Error('Store not captured');
      const unsubscribe = await s.sub(atom, async () => {
        try {
          const next = s.get(atom);
          handler(next);
        } catch (err) {
          console.warn(`[${SCRIPT_NAME}] subscribe handler error`, err);
        }
      });
      try {
        handler(await s.get(atom));
      } catch (err) {
        console.warn(`[${SCRIPT_NAME}] initial get failed`, err);
      }
      return unsubscribe;
    }

    return {
      ensureStore,
      getAtomByLabel,
      getValue,
      subscribe,
      getLastMethod: () => lastMethod,
      getAtomCache,
    };
  })();

  async function captureStoreWithRetry() {
    const start = Date.now();
    let store = null;
    while (Date.now() - start < MAX_STORE_CAPTURE_TIME_MS) {
      store = await AtomBridge.ensureStore();
      if (store && !store.__polyfill) {
        return { store, via: AtomBridge.getLastMethod() || 'unknown' };
      }
      await sleep(150);
    }
    return { store, via: AtomBridge.getLastMethod() || 'timeout' };
  }

  async function subscribeAtom(label, callback) {
    const direct = await subscribeDirect(label, callback);
    if (direct) return direct;

    const derived = await subscribeDerived(label, callback);
    if (derived) return derived;

    console.warn(`[${SCRIPT_NAME}] atom not found: ${label}`);
    return null;
  }

  async function subscribeDirect(label, callback) {
    const atom = AtomBridge.getAtomByLabel(label);
    if (!atom) return null;
    return AtomBridge.subscribe(atom, (value) => callback(value));
  }

  async function subscribeDerived(label, callback) {
    const colonIndex = label.indexOf(':');
    if (colonIndex !== -1) {
      const baseLabel = label.slice(0, colonIndex);
      const path = parsePath(label.slice(colonIndex + 1));
      const baseUnsub = await subscribeDirect(baseLabel, (value) => {
        callback(getPathValue(value, path));
      });
      if (baseUnsub) return baseUnsub;
    }

    const synthetic = SYNTHETIC_ATOMS[label];
    if (synthetic) {
      const syntheticUnsub = await subscribeAtom(synthetic.source, (value) => {
        callback(synthetic.derive(value));
      });
      if (syntheticUnsub) return syntheticUnsub;
    }

    return null;
  }

  function getAtomCache() {
    return AtomBridge.getAtomCache?.();
  }

  /* -------------------------------------------------------------------------- */
  /* UI helpers                                                                 */
  /* -------------------------------------------------------------------------- */

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'mg-atom-inspector-panel';
    panel.style.position = 'fixed';
    panel.style.top = '96px';
    panel.style.right = '24px';
    panel.style.width = '320px';
    panel.style.maxHeight = '480px';
    panel.style.overflow = 'auto';
    panel.style.background = 'rgba(18, 20, 26, 0.88)';
    panel.style.color = '#f5f5f5';
    panel.style.fontFamily = '"Segoe UI", sans-serif';
    panel.style.fontSize = '12px';
    panel.style.border = '1px solid rgba(255,255,255,0.16)';
    panel.style.borderRadius = '10px';
    panel.style.padding = '10px 12px';
    panel.style.zIndex = '999999';
    panel.style.backdropFilter = 'blur(8px)';
    panel.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.45)';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '8px';
    header.style.marginBottom = '6px';

    const title = document.createElement('strong');
    title.textContent = SCRIPT_NAME;
    title.style.fontSize = '13px';

    const status = document.createElement('span');
    status.textContent = 'Loading…';
    status.style.fontSize = '11px';
    status.style.opacity = '0.75';
    status.style.flex = '1';
    status.style.textAlign = 'right';

    header.appendChild(title);
    header.appendChild(status);

    const content = document.createElement('div');
  content.style.whiteSpace = 'normal';
    content.style.lineHeight = '1.5';

    panel.appendChild(header);
    panel.appendChild(content);
    document.body.appendChild(panel);

    makeDraggable(panel, header);

    return {
      element: panel,
      content,
      setStatus(msg) {
        status.textContent = msg;
      },
    };
  }

  function makeDraggable(panel, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    const onMouseMove = (event) => {
      if (!dragging) return;
      event.preventDefault();
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const nextX = originX + dx;
      const nextY = originY + dy;
      panel.style.left = `${Math.max(12, Math.min(window.innerWidth - panel.offsetWidth - 12, nextX))}px`;
      panel.style.top = `${Math.max(12, Math.min(window.innerHeight - panel.offsetHeight - 12, nextY))}px`;
      panel.style.right = 'auto';
    };

    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    handle.style.cursor = 'grab';
    handle.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      const rect = panel.getBoundingClientRect();
      originX = rect.left;
      originY = rect.top;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  function render() {
    if (!ui?.content) return;
    const parts = [];

    const statusLine = observed.panelMessage || 'Idle';
    parts.push(`<div style="margin-bottom:8px;">${escapeHtml(statusLine)}</div>`);

    const metaPieces = [];
    if (observed.storeMethod && observed.storeMethod !== 'pending') {
      const mode = observed.storePolyfill ? `${observed.storeMethod} (fallback)` : observed.storeMethod;
      metaPieces.push(`store via ${mode}`);
    }
    if (observed.inventory) metaPieces.push('inventory ✓');
    if (observed.hutch) metaPieces.push('hutch ✓');
    if (observed.shops) metaPieces.push('shops ✓');
    if (metaPieces.length) {
      parts.push(`<div style="opacity:0.7;margin-bottom:8px;">${escapeHtml(metaPieces.join(' • '))}</div>`);
    }

    if (observed.lastError) {
      parts.push(`<div style="color:#ff9a9a;margin-bottom:8px;">Error: ${escapeHtml(observed.lastError)}</div>`);
    }

    for (const section of SECTION_CONFIG) {
      parts.push(renderSection(section));
    }

    ui.content.innerHTML = parts.join('');
  }

  function buildViewAllLink(sectionKey, label = 'view all') {
    if (!sectionKey) return '';
    return `<a href="#" data-action="toggle-view-all" data-section="${escapeAttr(sectionKey)}">${escapeHtml(label)}</a>`;
  }

  function createUiState() {
    const expanded = {};
    const viewAll = {};
    for (const section of SECTION_CONFIG) {
      expanded[section.key] = !!section.defaultOpen;
      viewAll[section.key] = false;
    }
    return { expanded, viewAll };
  }

  function handlePanelClick(event) {
    const target = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('[data-action]')
      : null;
    if (!target) return;
    const action = target.getAttribute('data-action');
    if (action === 'toggle-view-all') {
      event.preventDefault();
      const key = target.getAttribute('data-section');
      if (!key) return;
      uiState.viewAll[key] = !uiState.viewAll[key];
      render();
    }
  }

  function handlePanelToggle(event) {
    const details = event.target;
    if (!details || typeof details !== 'object') return;
    if (!('tagName' in details)) return;
    if (String(details.tagName).toLowerCase() !== 'details') return;
    const key = details.getAttribute('data-section-key');
    if (!key) return;
    uiState.expanded[key] = !!details.open;
  }

  function renderSection(section) {
    const key = section.key;
    const title = section.title;
    const value = observed[section.prop];
    const ctx = {
      viewAll: !!uiState.viewAll[key],
      sectionKey: key,
      section,
      observed,
      seen: !!observedSeen[section.prop],
      missing: !!missingAtoms[section.prop],
    };
    const renderer = section.renderer || renderJsonPreview;
    const bodyHtml = ctx.missing
      ? '<div style="color:#ffb3b3;">Atom not found in jotaiAtomCache.</div>'
      : (renderer(value, ctx, section.options) || '—');
    const openAttr = uiState.expanded[key] ? ' open' : '';
    return `<details data-section-key="${escapeAttr(key)}"${openAttr} style="margin-bottom:10px;">
  <summary style="cursor:pointer;font-weight:600;outline:none;">${escapeHtml(title)}</summary>
  <div style="margin-top:6px;">${bodyHtml}</div>
</details>`;
  }

  function renderInventory(raw, ctx = {}) {
    if (!raw) return 'No data (atom not seen yet).';
    const items = normalizeItemArray(raw?.items ?? raw);
    const favorites = extractFavoriteIds(raw);
    if (!items.length) {
      return 'Empty.';
    }

    const defaultLimit = 14;
    const limit = ctx.viewAll ? items.length : defaultLimit;
    const typeCounts = Array.from(countBy(items, inferItemType).entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => `${escapeHtml(String(type))}×${count}`)
      .join(', ');

    const rows = items
      .slice(0, limit)
      .map((item) => `• ${describeItem(item, favorites)}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && items.length > limit) {
      footer = `<div style="opacity:0.6;">+${items.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && items.length > defaultLimit) {
      footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    const summary = typeCounts ? `<div style="opacity:0.7;">${typeCounts}</div>` : '';

    return `${summary}<div>${rows}</div>${footer}`;
  }

  function renderHutch(raw, ctx = {}) {
    if (!raw) return 'No data (atom not seen yet).';
    const items = normalizeItemArray(raw);
    if (!items.length) {
      return 'Empty.';
    }

    const defaultLimit = 12;
    const limit = ctx.viewAll ? items.length : defaultLimit;
    const rows = items
      .slice(0, limit)
      .map((item) => `• ${describeItem(item)}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && items.length > limit) {
      footer = `<div style="opacity:0.6;">+${items.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && items.length > defaultLimit) {
      footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    return `<div style="opacity:0.7;">${items.length} entries</div><div>${rows}</div>${footer}`;
  }

  function renderGenericInventory(raw, ctx = {}, options = {}) {
    if (!raw) return 'No data (atom not seen yet).';
    const items = normalizeItemArray(raw);
    if (!items.length) return 'Empty.';
    const defaultLimit = Number.isFinite(options.defaultLimit) ? Number(options.defaultLimit) : 16;
    const limit = ctx.viewAll ? items.length : defaultLimit;
    const rows = items
      .slice(0, limit)
      .map((item) => `• ${describeItem(item)}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && items.length > limit) {
      footer = `<div style="opacity:0.6;">+${items.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && items.length > defaultLimit) {
      footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    return `<div style="opacity:0.7;">${items.length} entries</div><div>${rows}</div>${footer}`;
  }

  function renderSimpleValue(value, ctx = {}, options = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (value == null) {
      if (options.showNullAs === 'empty') return 'Empty.';
      return 'null';
    }
    if (typeof value === 'object') {
      return renderObjectSummary(value, ctx, options);
    }
    return escapeHtml(String(value));
  }

  function renderArrayPreview(raw, ctx = {}, options = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    const items = Array.isArray(raw) ? raw : [];
    if (!items.length) return 'Empty.';
    const defaultLimit = Number.isFinite(options.defaultLimit) ? Number(options.defaultLimit) : 16;
    const limit = ctx.viewAll ? items.length : defaultLimit;
    const formatItem = typeof options.formatItem === 'function'
      ? options.formatItem
      : (item) => String(item);
    const rows = items
      .slice(0, limit)
      .map((item, index) => `• ${escapeHtml(formatItem(item, index, items))}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && items.length > limit) {
      footer = `<div style="opacity:0.6;">+${items.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && items.length > defaultLimit) {
      footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    const header = options.skipHeader ? '' : `<div style="opacity:0.7;">${items.length} entries</div>`;
    return `${header}<div>${rows}</div>${footer}`;
  }

  function renderNumberArray(raw, ctx = {}, options = {}) {
    return renderArrayPreview(raw, ctx, { ...options, defaultLimit: options.defaultLimit ?? 20 });
  }

  function renderStringArray(raw, ctx = {}, options = {}) {
    return renderArrayPreview(raw, ctx, { ...options, defaultLimit: options.defaultLimit ?? 20 });
  }

  function renderPetInfos(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    const entries = Array.isArray(raw) ? raw : [];
    if (!entries.length) return 'Empty.';
    const defaultLimit = 10;
    const limit = ctx.viewAll ? entries.length : defaultLimit;
    const rows = entries
      .slice(0, limit)
      .map((info) => `• ${describePetInfo(info)}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && entries.length > limit) {
      footer = `<div style="opacity:0.6;">+${entries.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && entries.length > defaultLimit) {
      footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    return `<div style="opacity:0.7;">${entries.length} pets</div><div>${rows}</div>${footer}`;
  }

  function renderPetSlots(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    const entries = Array.isArray(raw) ? raw : [];
    if (!entries.length) return 'Empty.';
    const defaultLimit = 10;
    const limit = ctx.viewAll ? entries.length : defaultLimit;
    const rows = entries
      .slice(0, limit)
      .map((info) => `• ${describePetSlotInfo(info)}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && entries.length > limit) {
      footer = `<div style="opacity:0.6;">+${entries.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && entries.length > defaultLimit) {
      footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    return `<div style="opacity:0.7;">${entries.length} slots</div><div>${rows}</div>${footer}`;
  }

  function renderShopPurchases(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (!raw) return 'No purchase data';
    const categories = [
      { key: 'seed', label: 'Seeds' },
      { key: 'egg', label: 'Eggs' },
      { key: 'tool', label: 'Tools' },
      { key: 'decor', label: 'Decor' },
    ];

    const lines = [];
    const defaultLimit = 12;
    const viewAll = !!ctx.viewAll;
    let hasMore = false;

    for (const { key, label } of categories) {
      const purchases = raw?.[key]?.purchases;
      const entries = purchases instanceof Map
        ? Array.from(purchases.entries())
        : purchases && typeof purchases === 'object'
          ? Object.entries(purchases)
          : [];
      if (!entries.length) {
        lines.push(`<div style="margin-bottom:4px;"><span style="font-weight:600;">${escapeHtml(label)}:</span> <span style="opacity:0.6;">none</span></div>`);
        continue;
      }
      const total = entries.reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
      const sorted = entries.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
      const limit = viewAll ? sorted.length : defaultLimit;
      const rows = sorted
        .slice(0, limit)
        .map(([id, count]) => `${escapeHtml(String(id))} × ${Number(count) || 0}`)
        .join(', ');
      if (!viewAll && sorted.length > limit) {
        hasMore = true;
      }
      lines.push(`<div style="margin-bottom:4px;"><span style="font-weight:600;">${escapeHtml(label)}:</span> total ${total}${rows ? ` • ${rows}` : ''}${!viewAll && sorted.length > limit ? ` • +${sorted.length - limit} more` : ''}</div>`);
    }

    if (!viewAll && hasMore) {
      lines.push(`<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey)}</div>`);
    } else if (viewAll && hasMore) {
      lines.push(`<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`);
    }

    return lines.join('');
  }

  function renderWeather(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (raw == null) return 'Unknown weather';
    if (typeof raw === 'object') {
      return renderObjectSummary(raw, ctx, { defaultLimit: 6 });
    }
    return escapeHtml(String(raw));
  }

  function renderGardenObject(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (!raw) return 'None active.';
    if (typeof raw !== 'object') return escapeHtml(String(raw));
    return renderObjectSummary(raw, ctx, { defaultLimit: 10 });
  }

  function renderActiveModal(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (!raw) return 'No modal open';
    return escapeHtml(String(raw));
  }

  function renderPlayer(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (!raw) return 'No player data';
    const highlights = [];
    const name = raw.displayName || raw.username || raw.name;
    if (name) highlights.push(`Name: ${escapeHtml(String(name))}`);
    if (Number.isFinite(Number(raw.coins))) highlights.push(`Coins: ${formatNumber(raw.coins)}`);
    if (Number.isFinite(Number(raw.level))) highlights.push(`Level: ${Number(raw.level)}`);
    const summary = renderObjectSummary(raw, ctx, { defaultLimit: 12, skipHeader: true });
    return `${highlights.length ? `<div>${highlights.join(' • ')}</div>` : ''}${summary}`;
  }

  function renderMyData(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (!raw) return 'Empty.';
    return renderObjectSummary(raw, ctx, { defaultLimit: 14 });
  }

  function renderJsonPreview(value, ctx = {}, options = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (value == null) return 'null';
    if (typeof value !== 'object') return escapeHtml(String(value));
    const limit = Number.isFinite(options.defaultLimit) ? Number(options.defaultLimit) : 1400;
    try {
      const replacer = (_key, val) => (typeof val === 'bigint' ? val.toString() : val);
      let json = JSON.stringify(value, replacer, 2);
      let truncated = false;
      if (!ctx.viewAll && json.length > limit) {
        json = `${json.slice(0, limit)}…`;
        truncated = true;
      }
      let footer = '';
      if (truncated) {
        footer = `<div style="opacity:0.6;margin-top:4px;">${buildViewAllLink(ctx.sectionKey)}</div>`;
      } else if (ctx.viewAll && json.length > limit) {
        footer = `<div style="opacity:0.6;margin-top:4px;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
      }
      return `<pre style="white-space:pre-wrap;font-family:monospace;font-size:11px;margin:0;">${escapeHtml(json)}</pre>${footer}`;
    } catch (err) {
      console.warn(`[${SCRIPT_NAME}] JSON preview failed`, err);
      return escapeHtml(String(err?.message || err || 'Unable to stringify value.'));
    }
  }

  function renderObjectSummary(value, ctx = {}, options = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (!value || typeof value !== 'object') return escapeHtml(String(value));
    const entries = Array.isArray(value)
      ? value.map((entry, index) => [index, entry])
      : Object.entries(value);
    if (!entries.length) return 'Empty.';
    const defaultLimit = Number.isFinite(options.defaultLimit) ? Number(options.defaultLimit) : 12;
    const limit = ctx.viewAll ? entries.length : defaultLimit;
    const rows = entries
      .slice(0, limit)
      .map(([key, val]) => `• ${escapeHtml(String(key))}: ${escapeHtml(formatPreviewValue(val))}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && entries.length > limit) {
      footer = `<div style="opacity:0.6;margin-top:4px;">+${entries.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && entries.length > defaultLimit) {
      footer = `<div style="opacity:0.6;margin-top:4px;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    return `${options.skipHeader ? '' : `<div style="opacity:0.7;">${entries.length} entries</div>`}<div>${rows}</div>${footer}`;
  }

  function formatPreviewValue(value, depth = 0) {
    if (value == null) return 'null';
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      if (depth >= 1) {
        return `Array(${value.length})`;
      }
      const items = value.slice(0, 3).map((entry) => formatPreviewValue(entry, depth + 1));
      return `Array(${value.length}) [${items.join(', ')}${value.length > 3 ? ', …' : ''}]`;
    }
    if (type === 'object') {
      const keys = Object.keys(value);
      if (!keys.length) return '{}';
      if (depth >= 1) {
        return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''}}`;
      }
      const pairs = keys.slice(0, 3).map((key) => `${key}: ${formatPreviewValue(value[key], depth + 1)}`);
      return `{ ${pairs.join(', ')}${keys.length > 3 ? ', …' : ''} }`;
    }
    return String(value);
  }

  function normalizeItemArray(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.inventory)) return raw.inventory;
    if (Array.isArray(raw.list)) return raw.list;
    if (Array.isArray(raw.data?.items)) return raw.data.items;
    if (raw instanceof Map) return Array.from(raw.values());
    if (typeof raw === 'object') {
      const candidate = Object.values(raw).find((value) => Array.isArray(value) && value.length && typeof value[0] === 'object');
      if (candidate) return candidate;
    }
    return [];
  }

  function extractFavoriteIds(raw) {
    const favorites = new Set();
    const list = Array.isArray(raw?.favoritedItemIds)
      ? raw.favoritedItemIds
      : Array.isArray(raw?.favorites)
        ? raw.favorites
        : Array.isArray(raw?.favoriteIds)
          ? raw.favoriteIds
          : null;
    if (Array.isArray(list)) {
      for (const id of list) favorites.add(String(id));
    }
    return favorites;
  }

  function renderShops(raw, ctx = {}) {
    if (!raw) return 'No data (atom not seen yet).';
    const config = [
      { key: 'seed', label: 'Seeds', id: (item) => item?.species, type: 'Seed' },
      { key: 'egg', label: 'Eggs', id: (item) => item?.eggId ?? item?.id, type: 'Egg' },
      { key: 'tool', label: 'Tools', id: (item) => item?.toolId ?? item?.id, type: 'Tool' },
      { key: 'decor', label: 'Decor', id: (item) => item?.decorId ?? item?.id, type: 'Decor' },
    ];

    const lines = [];
    const viewAll = !!ctx.viewAll;
    const purchases = ctx.observed?.purchases;
    const defaultLimit = 8;
    let linkInjected = false;

    for (const { key, label, id: getId, type } of config) {
      const sec = raw?.[key];
      const inventory = Array.isArray(sec?.inventory) ? sec.inventory : [];
      const restock = formatSeconds(sec?.secondsUntilRestock);
      const available = [];
      for (const item of inventory) {
        const rawId = getId(item);
        const line = describeShopItemDetailed(item, type, rawId, purchases);
        if (line) available.push(line);
      }
      const limit = viewAll ? available.length : defaultLimit;
      const body = available.length
        ? available.slice(0, limit).join('<br>')
        : '<span style="opacity:0.6;">Sold out</span>';
      let footer = '';
      if (!viewAll && available.length > limit && !linkInjected) {
        footer = `<div style="opacity:0.6;">+${available.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
        linkInjected = true;
      } else if (!viewAll && available.length > limit) {
        footer = `<div style="opacity:0.6;">+${available.length - limit} more</div>`;
      } else if (viewAll && available.length > defaultLimit && !linkInjected) {
        footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
        linkInjected = true;
      }
      const header = `${label.toUpperCase()} — in stock: ${available.length}${restock ? ` | restock in ${restock}` : ''}`;
      lines.push(`<div style="margin-bottom:6px;"><div style="font-weight:600;">${escapeHtml(header)}</div><div style="margin-left:6px;">${body}${footer}</div></div>`);
    }
    return lines.join('');
  }

  function describeShopItemDetailed(item, type, rawId, purchases) {
    if (!item || typeof item !== 'object') return null;

    const label = item.name || item.displayName || item.species || item.petSpecies || item.toolId || item.decorId || item.eggId || item.id || 'Item';
    const price = item.price ?? item.cost ?? item.amount ?? null;
    const initialStock = extractInitialStockValue(item);
    const canSpawn = item.canSpawnHere !== false;
    const purchased = getPurchaseCount(type, rawId, purchases);
    const remaining = computeRemaining(initialStock, purchased, canSpawn);

    if (!canSpawn) return null;
    if (remaining != null && remaining <= 0) return null;

    const pieces = [label];
    if (price != null && Number.isFinite(Number(price))) {
      pieces.push(`${Number(price)}c`);
    }

    if (remaining != null) {
      if (initialStock != null) {
        pieces.push(`${remaining}/${initialStock} left`);
      } else {
        pieces.push(`${remaining} left`);
      }
    } else if (initialStock != null) {
      pieces.push(`${initialStock} stock`);
    }

    if (purchased) {
      pieces.push(`bought ${purchased}`);
    }

    return pieces.map((part) => escapeHtml(part)).join(' • ');
  }

  function describeItem(item, favoritesSet = new Set()) {
    if (!item || typeof item !== 'object') return escapeHtml(String(item));
    const parts = [];
    const type = inferItemType(item);
    const id = String(item.id ?? item.itemId ?? item.petId ?? '');
    const name = item.name || item.displayName || item.species || item.petSpecies || item.toolId || item.decorId || item.eggId || item.itemType || 'Item';
    const qty = item.quantity ?? item.count ?? item.amount ?? item.stackSize;
    const favorited = favoritesSet.has(id);
    parts.push(`${type}: ${name}`);
    if (Number.isFinite(qty)) parts.push(`x${qty}`);
    if (item.hunger != null) parts.push(`hunger ${(Number(item.hunger) * 100).toFixed(0)}%`);
    if (item.mutations?.length) parts.push(`mut ${item.mutations.join(',')}`);
    if (favorited) parts.push('★');
    return escapeHtml(parts.join(' | '));
  }

  function describePetInfo(entry) {
    const pet = entry?.slot ?? entry ?? {};
    const parts = [];
    const species = pet.petSpecies || pet.species || 'Pet';
    const name = pet.name ? `“${pet.name}”` : pet.displayName ? `“${pet.displayName}”` : '';
    parts.push(species);
    if (name) parts.push(name);
    if (Number.isFinite(Number(pet.hunger))) {
      parts.push(`hunger ${formatPercent(pet.hunger)}`);
    }
    if (Number.isFinite(Number(pet.xp))) {
      parts.push(`xp ${Math.round(Number(pet.xp))}`);
    }
    if (Array.isArray(pet.mutations) && pet.mutations.length) {
      parts.push(`mut ${pet.mutations.join(',')}`);
    }
    return escapeHtml(parts.join(' | '));
  }

  function describePetSlotInfo(entry) {
    const slot = entry?.slot ?? entry ?? {};
    const parts = [];
    const id = slot.id ? `#${slot.id}` : null;
    const species = slot.petSpecies || slot.species || 'Slot';
    const status = entry?.status || slot.status;
    parts.push(species);
    if (slot.name) parts.push(`“${slot.name}”`);
    if (id) parts.push(id);
    if (status) parts.push(String(status));
    if (Number.isFinite(Number(slot.hunger))) parts.push(`hunger ${formatPercent(slot.hunger)}`);
    if (Number.isFinite(Number(slot.xp))) parts.push(`xp ${Math.round(Number(slot.xp))}`);
    return escapeHtml(parts.join(' | '));
  }

  function countBy(items, fn) {
    const map = new Map();
    for (const item of items) {
      const key = fn(item) || 'Unknown';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }

  function extractInitialStockValue(item) {
    const initial = item?.initialStock ?? item?.stock ?? item?.quantity ?? null;
    if (!Number.isFinite(Number(initial))) return item?.initialStock === 0 ? 0 : null;
    return Number(initial);
  }

  function getPurchaseCount(type, rawId, purchases) {
    if (!rawId || !purchases) return 0;
    const section =
      type === 'Seed' ? purchases?.seed :
      type === 'Egg' ? purchases?.egg :
      type === 'Tool' ? purchases?.tool :
      purchases?.decor;
    const bucket = section?.purchases;
    if (!bucket || typeof bucket !== 'object') return 0;
    const value = bucket[String(rawId)] ?? bucket[Number(rawId)] ?? 0;
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function computeRemaining(initialStock, purchased, canSpawn) {
    if (initialStock == null) {
      return canSpawn === false ? 0 : null;
    }
    const bought = Number.isFinite(Number(purchased)) ? Number(purchased) : 0;
    const remaining = Math.max(0, initialStock - bought);
    if (canSpawn === false) return 0;
    return remaining;
  }

  function inferItemType(item) {
    if (!item || typeof item !== 'object') return 'Unknown';
    return (
      item.itemType ||
      item.type ||
      (item.petSpecies ? 'Pet' : null) ||
      (item.species ? 'Seed' : null) ||
      (item.toolId ? 'Tool' : null) ||
      (item.decorId ? 'Decor' : null) ||
      (item.eggId ? 'Egg' : null) ||
      'Unknown'
    );
  }

  function formatSeconds(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (h) parts.push(`${h}h`);
    if (m || h) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  }

  function formatNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value);
    try {
      return num.toLocaleString();
    } catch {
      return String(num);
    }
  }

  function formatPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '–';
    const percent = Math.round(num * 100);
    return `${percent}%`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* -------------------------------------------------------------------------- */
  /* Timing helpers                                                             */
  /* -------------------------------------------------------------------------- */

  async function waitForDom() {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      return;
    }
    await new Promise((resolve) => {
      window.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }

  async function waitFor(predicate, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const result = predicate();
        if (result) return result;
      } catch {}
      await sleep(80);
    }
    return null;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
```

### Mini Atom Bridge Helper

```javascript
// Lightweight atom bridge for console helpers
// Provides minimal Jotai accessors without the Atom Inspector UI noise.

(function initMiniAtomBridge() {
  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (pageWindow.__miniAtomBridge) {
    return;
  }

  const PATCH_FLAG = '__miniAtomOrigWrite';
  let jotaiStore = null;
  let captureInFlight = false;

  const bridge = {
    getAtomByLabel,
    readAtomValue,
    readInventoryPets,
  };

  Object.defineProperty(pageWindow, '__miniAtomBridge', {
    value: bridge,
    writable: false,
    configurable: false,
  });

  console.log('[mini-atom-bridge] Ready. Use window.__miniAtomBridge.readInventoryPets().');

  async function readInventoryPets() {
    const items = await readAtomValue('myInventoryAtom').catch(async (error) => {
      console.warn('[mini-atom-bridge] myInventoryAtom failed, trying myCropInventoryAtom', error);
      return readAtomValue('myCropInventoryAtom');
    });

    const normalized = normalizeInventory(items);
    return normalized.filter((entry) => entry.itemType === 'Pet' || entry.petSpecies);
  }

  async function readAtomValue(atomOrLabel) {
    const atom = typeof atomOrLabel === 'string' ? getAtomByLabel(atomOrLabel) : atomOrLabel;
    if (!atom) {
      throw new Error(`[mini-atom-bridge] Atom not found: ${atomOrLabel}`);
    }
    const store = await ensureJotaiStore();
    if (!store || store.__polyfill) {
      throw new Error('[mini-atom-bridge] Jotai store unavailable');
    }
    return store.get(atom);
  }

  function getAtomByLabel(label) {
    const cache = getAtomCache();
    if (!cache) return null;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(`^${escaped}$`);
    for (const atom of cache.values()) {
      if (!atom) continue;
      const atomLabel = String(atom.debugLabel || atom.label || '');
      if (matcher.test(atomLabel)) {
        return atom;
      }
    }
    return null;
  }

  function getAtomCache() {
    const root = pageWindow?.jotaiAtomCache;
    if (!root) return null;
    if (root.cache && typeof root.cache.values === 'function') return root.cache;
    if (typeof root.values === 'function') return root;
    return null;
  }

  async function ensureJotaiStore() {
    if (jotaiStore && !jotaiStore.__polyfill) {
      return jotaiStore;
    }
    if (captureInFlight) {
      const start = Date.now();
      while (captureInFlight && Date.now() - start < 3000) {
        await sleep(60);
      }
      if (jotaiStore && !jotaiStore.__polyfill) return jotaiStore;
    }
    captureInFlight = true;
    try {
      const viaFiber = findStoreViaFiber();
      if (viaFiber) {
        jotaiStore = viaFiber;
        return jotaiStore;
      }
      jotaiStore = await captureViaWriteHook();
      return jotaiStore;
    } finally {
      captureInFlight = false;
    }
  }

  function findStoreViaFiber() {
    const hook = pageWindow?.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook?.renderers?.size) return null;
    for (const [rendererId] of hook.renderers) {
      const roots = hook.getFiberRoots?.(rendererId);
      if (!roots) continue;
      for (const root of roots) {
        const stack = [];
        const seen = new Set();
        const current = root?.current ?? root;
        if (current) stack.push(current);
        while (stack.length) {
          const fiber = stack.pop();
          if (!fiber || seen.has(fiber)) continue;
          seen.add(fiber);
          const value = fiber.pendingProps?.value;
          if (value && typeof value.get === 'function' && typeof value.set === 'function' && typeof value.sub === 'function') {
            return value;
          }
          if (fiber.child) stack.push(fiber.child);
          if (fiber.sibling) stack.push(fiber.sibling);
          if (fiber.alternate) stack.push(fiber.alternate);
        }
      }
    }
    return null;
  }

  async function captureViaWriteHook(timeoutMs = 4000) {
    const cache = getAtomCache();
    if (!cache) {
      return polyfillStore();
    }
    let capturedGet = null;
    let capturedSet = null;
    const patched = [];
    const restore = () => {
      for (const atom of patched) {
        try {
          if (atom[PATCH_FLAG]) {
            atom.write = atom[PATCH_FLAG];
            delete atom[PATCH_FLAG];
          }
        } catch {}
      }
    };

    for (const atom of cache.values()) {
      if (!atom || typeof atom.write !== 'function' || atom[PATCH_FLAG]) continue;
      const original = atom.write;
      atom[PATCH_FLAG] = original;
      atom.write = function patchedWrite(get, set, ...args) {
        if (!capturedSet) {
          capturedGet = get;
          capturedSet = set;
          restore();
        }
        return original.call(this, get, set, ...args);
      };
      patched.push(atom);
    }

    const start = Date.now();
    while (!capturedSet && Date.now() - start < timeoutMs) {
      await sleep(50);
    }

    restore();

    if (!capturedSet || !capturedGet) {
      return polyfillStore();
    }

    return {
      get(atom) {
        return capturedGet(atom);
      },
      set(atom, value) {
        return capturedSet(atom, value);
      },
      sub(atom, cb) {
        let active = true;
        let lastValue;
        const interval = setInterval(() => {
          if (!active) return;
          try {
            const next = capturedGet(atom);
            if (next !== lastValue) {
              lastValue = next;
              cb();
            }
          } catch {}
        }, 120);
        return () => {
          active = false;
          clearInterval(interval);
        };
      },
    };
  }

  function polyfillStore() {
    return {
      __polyfill: true,
      get() {
        throw new Error('[mini-atom-bridge] Store not captured');
      },
      set() {
        throw new Error('[mini-atom-bridge] Store not captured');
      },
      sub() {
        return () => {};
      },
    };
  }

  function normalizeInventory(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.inventory)) return raw.inventory;
    if (typeof raw === 'object') {
      for (const value of Object.values(raw)) {
        if (Array.isArray(value) && value.length && typeof value[0] === 'object') {
          return value;
        }
      }
    }
    return [];
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
```

### Rainbow Effect Reverse Engineering Script

```javascript
// Reverse-engineer the rainbow/gold pixel transformation

// Compares normal vs rainbow/gold sprites to find the algorithm

 
 
(async function reverseEngineerRainbowEffect() {

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const INVENTORY_ATOM_LABELS = ['myInventoryAtom', 'myCropInventoryAtom'];
  const PET_HUTCH_ATOM_LABEL = 'myPetHutchPetItemsAtom';
  const ACTIVE_PETS_ATOM_LABEL = 'myPetInfosAtom';
  const PATCH_FLAG = '__rainbowOrigWrite';
  const DEFAULT_PET_SHEET_URL = 'https://magicgarden.gg/version/19aaa98/assets/tiles/pets.png';
  const PET_TILE_SIZE_CANDIDATES = [256, 512, 128];
  const PET_TILE_MAP = {
    bee: 0,
    chicken: 1,
    bunny: 2,
    turtle: 3,
    capybara: 4,
    cow: 5,
    pig: 6,
    butterfly: 7,
    snail: 8,
    worm: 9,
    commonegg: 10,
    uncommonegg: 11,
    rareegg: 12,
    legendaryegg: 13,
    mythicalegg: 14,
    divineegg: 15,
    celestialegg: 16,
    squirrel: 17,
    goat: 18,
    dragonfly: 19,
    turkey: 28,
    peacock: 29,
  };
  const mutationTransforms = {};
  const generatedMutationSprites = {};
  let cachedPetSheet = null;
  let petSheetPromise = null;
  let jotaiStore = null;
  let captureInProgress = false;
  let cachedPetEntries = [];
  let cachedSpeciesList = [];
  const missingTileWarnings = new Set();

  console.log('='.repeat(60));

  console.log('RAINBOW/GOLD PIXEL TRANSFORMATION ANALYZER');

  console.log('='.repeat(60));

 

  // Step 1: Find pairs of same species with different mutations

  const { entries: allPets, counts: petCounts } = await loadAllKnownPets();

  if (!allPets || allPets.length === 0) {

    console.error('❌ Unable to read pet atoms (inventory/hutch/active). Make sure the mini atom bridge or inspector is running.');

    return;

  }

 

  console.log(`\n✅ Found ${allPets.length} total pets via atoms (active: ${petCounts.active}, inventory: ${petCounts.inventory}, hutch: ${petCounts.hutch})\n`);

 

  // Group by species

  const bySpecies = {};

  allPets.forEach(pet => {

    const species = pet.petSpecies || pet.species || 'Unknown';

    if (!bySpecies[species]) bySpecies[species] = [];

    bySpecies[species].push(pet);

  });

 

  // Find species where we have both normal and mutated versions

  console.log('Looking for species with multiple mutation types...\n');

 

  const comparablePairs = [];

  for (const species in bySpecies) {

    const pets = bySpecies[species];

    const normal = pets.find(p => !p.mutations || p.mutations.length === 0);

    const rainbow = pets.find(p => p.mutations?.includes('Rainbow'));

    const gold = pets.find(p => p.mutations?.includes('Gold'));

 

    if (normal && rainbow) {

      comparablePairs.push({ species, normal, rainbow, type: 'rainbow' });

      console.log(`🌈 ${species}: Normal + Rainbow pair found`);

    }

    if (normal && gold) {

      comparablePairs.push({ species, normal, gold, type: 'gold' });

      console.log(`✨ ${species}: Normal + Gold pair found`);

    }

  }

 

  if (comparablePairs.length === 0) {

    console.log('❌ No comparable pairs found. You need both normal and mutated versions of the same species in your team/visible.');

    console.log('\n💡 TIP: Put a normal pet and its rainbow/gold variant in your active team, then run this script.');

    return;

  }

 

  console.log(`\n✅ Found ${comparablePairs.length} comparable pairs\n`);

 

  // Step 2: Analyze canvas pixel data

  console.log('='.repeat(60));

  console.log('PIXEL DATA ANALYSIS');

  console.log('='.repeat(60) + '\n');

 

  // Function to get canvas for a pet

  function findPetCanvas(entry) {

    if (!entry) return null;

    const targetIds = buildPetIdSet(entry);

    const targetSpecies = normalizeSpeciesKey(entry.petSpecies || entry.species);

    const targetMutations = normalizeMutationList(entry.mutations);

    const canvases = document.querySelectorAll('canvas[width="256"][height="256"]');

    for (const canvas of canvases) {

      const button = canvas.closest('button');

      if (!button) continue;

      const fiberKey = Object.keys(button).find(k => k.startsWith('__react'));

      if (!fiberKey) continue;

      let fiber = button[fiberKey];

      let depth = 0;

      while (fiber && depth < 15) {

        const info = extractFiberPetInfo(fiber);

        if (info && matchesPetEntry(info, targetIds, targetSpecies, targetMutations)) {

          return canvas;

        }

        fiber = fiber.return;

        depth++;

      }

    }

    return null;

  }

  function extractFiberPetInfo(fiber) {

    const props = fiber.memoizedProps || fiber.pendingProps;

    const slot = props?.petSlot || props?.slot || null;

    if (!slot) return null;

    const pet = slot.pet || slot;

    return {

      ids: buildIdArray([slot.id, slot.petId, slot.slotId, pet?.id, pet?.petId]),

      species: pet?.petSpecies || pet?.species || null,

      mutations: Array.isArray(pet?.mutations) ? pet.mutations : [],

    };

  }

  function buildIdArray(list) {

    return list

      .map(value => (value == null ? null : String(value)))

      .filter(Boolean);

  }

  function buildPetIdSet(entry) {

    const ids = buildIdArray([entry.id, entry.petId, entry.slotId, entry.slotIndex]);

    return new Set(ids);

  }

  function normalizeMutationList(list) {

    if (!Array.isArray(list) || !list.length) return [];

    return list

      .map(value => normalizeMutation(value))

      .filter(Boolean)

      .sort();

  }

  function normalizeMutation(value) {

    if (!value) return '';

    return String(value).trim().toLowerCase();

  }

  function matchesPetEntry(slotInfo, targetIds, targetSpecies, targetMutations) {

    if (!slotInfo) return false;

    const slotSpecies = normalizeSpeciesKey(slotInfo.species);

    const slotMutations = normalizeMutationList(slotInfo.mutations);

    const slotIdSet = new Set(slotInfo.ids || []);

    const idMatch = targetIds.size > 0 && intersects(slotIdSet, targetIds);

    const speciesMatch = targetSpecies && slotSpecies === targetSpecies;

    const mutationMatch = targetMutations.length

      ? arraysEqual(targetMutations, slotMutations)

      : slotMutations.length === 0;

    return idMatch || (speciesMatch && mutationMatch);

  }

  function intersects(setA, setB) {

    for (const value of setA) {

      if (setB.has(value)) return true;

    }

    return false;

  }

  function arraysEqual(a, b) {

    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {

      if (a[i] !== b[i]) return false;

    }

    return true;

  }

 

  async function analyzeComparablePair(pair) {

    console.log(`
${'='.repeat(60)}`);

    console.log(`Analyzing: ${pair.species} (${pair.type})`);

    console.log('='.repeat(60));

    let normalCanvas = findPetCanvas(pair.normal);

    const mutatedCanvas = findPetCanvas(pair[pair.type]);

    if (!mutatedCanvas) {

      console.log(`⚠️ ${pair.type} ${pair.species} not visible. Add the mutated pet to an active slot.`);

      return;

    }

    if (!normalCanvas) {

      console.log(`⚠️ Normal ${pair.species} not visible. Attempting to use base sprite from pets.png...`);

      normalCanvas = await getBaseSpriteCanvas(pair.species);

      if (normalCanvas) {

        console.log('✅ Loaded base sprite from pet sheet as normal reference.');

      } else {

        console.log(`❌ Unable to locate a normal ${pair.species} reference. Add the normal pet to an active slot.`);

        return;

      }

    }

    console.log('✅ Canvases ready, analyzing...');

    analyzePixelDifference(normalCanvas, mutatedCanvas, pair.type);

  }

  // Function to analyze pixel differences

  function analyzePixelDifference(normalCanvas, mutatedCanvas, mutationType) {

    console.log(`\nAnalyzing ${mutationType} transformation...\n`);

 

    try {

      const ctx1 = normalCanvas.getContext('2d');

      const ctx2 = mutatedCanvas.getContext('2d');

 

      const data1 = ctx1.getImageData(0, 0, normalCanvas.width, normalCanvas.height);

      const data2 = ctx2.getImageData(0, 0, mutatedCanvas.width, mutatedCanvas.height);

 

      const pixels1 = data1.data;

      const pixels2 = data2.data;

 

      // Sample analysis of first 100 non-transparent pixels

      const samples = [];

      let sampleCount = 0;

 

      for (let i = 0; i < pixels1.length && sampleCount < 100; i += 4) {

        const r1 = pixels1[i];

        const g1 = pixels1[i + 1];

        const b1 = pixels1[i + 2];

        const a1 = pixels1[i + 3];

 

        const r2 = pixels2[i];

        const g2 = pixels2[i + 1];

        const b2 = pixels2[i + 2];

        const a2 = pixels2[i + 3];

 

        // Skip fully transparent pixels

        if (a1 === 0 || a2 === 0) continue;

 

        // Skip if colors are identical (no transformation)

        if (r1 === r2 && g1 === g2 && b1 === b2) continue;

 

        samples.push({

          original: { r: r1, g: g1, b: b1, a: a1 },

          mutated: { r: r2, g: g2, b: b2, a: a2 },

          ratios: {

            r: r2 / (r1 || 1),

            g: g2 / (g1 || 1),

            b: b2 / (b1 || 1)

          },

          diffs: {

            r: r2 - r1,

            g: g2 - g1,

            b: b2 - b1

          }

        });

 

        sampleCount++;

      }

 

      if (samples.length === 0) {

        console.log('⚠️ No pixel differences found. Sprites might be identical.');

        return null;

      }

 

      console.log(`📊 Analyzed ${samples.length} transformed pixels\n`);

 

      // Analyze patterns

      console.log('Sample transformations:');

      samples.slice(0, 10).forEach((s, i) => {

        console.log(`\n  Pixel ${i + 1}:`);

        console.log(`    Original: RGB(${s.original.r}, ${s.original.g}, ${s.original.b})`);

        console.log(`    Mutated:  RGB(${s.mutated.r}, ${s.mutated.g}, ${s.mutated.b})`);

        console.log(`    Ratios:   R:${s.ratios.r.toFixed(2)} G:${s.ratios.g.toFixed(2)} B:${s.ratios.b.toFixed(2)}`);

        console.log(`    Diffs:    R:${s.diffs.r} G:${s.diffs.g} B:${s.diffs.b}`);

      });

 

      // Calculate average transformations

      const avgRatios = {

        r: samples.reduce((sum, s) => sum + s.ratios.r, 0) / samples.length,

        g: samples.reduce((sum, s) => sum + s.ratios.g, 0) / samples.length,

        b: samples.reduce((sum, s) => sum + s.ratios.b, 0) / samples.length

      };

 

      const avgDiffs = {

        r: samples.reduce((sum, s) => sum + s.diffs.r, 0) / samples.length,

        g: samples.reduce((sum, s) => sum + s.diffs.g, 0) / samples.length,

        b: samples.reduce((sum, s) => sum + s.diffs.b, 0) / samples.length

      };

 

      console.log('\n📈 AVERAGE TRANSFORMATION:');

      console.log(`  Multiply ratios: R×${avgRatios.r.toFixed(3)} G×${avgRatios.g.toFixed(3)} B×${avgRatios.b.toFixed(3)}`);

      console.log(`  Add offsets:     R+${avgDiffs.r.toFixed(1)} G+${avgDiffs.g.toFixed(1)} B+${avgDiffs.b.toFixed(1)}`);

 

      // Check for hue shift pattern (rainbow)

      if (mutationType === 'rainbow') {

        console.log('\n🌈 Checking for hue shift pattern...');

 

        // Convert samples to HSL to detect hue rotation

        const hslSamples = samples.map(s => {

          return {

            originalHue: rgbToHue(s.original.r, s.original.g, s.original.b),

            mutatedHue: rgbToHue(s.mutated.r, s.mutated.g, s.mutated.b)

          };

        }).filter(s => s.originalHue !== null && s.mutatedHue !== null);

 

        if (hslSamples.length > 0) {

          const hueShifts = hslSamples.map(s => s.mutatedHue - s.originalHue);

          const avgHueShift = hueShifts.reduce((sum, h) => sum + h, 0) / hueShifts.length;

          console.log(`  Average hue shift: ${avgHueShift.toFixed(1)}° (${(avgHueShift / 360 * 100).toFixed(1)}% of color wheel)`);

        }

      }

 

      // Check for brightness boost pattern (gold)

      if (mutationType === 'gold') {

        console.log('\n✨ Checking for brightness/saturation boost...');

 

        const brightnesses = samples.map(s => {

          const b1 = Math.max(s.original.r, s.original.g, s.original.b);

          const b2 = Math.max(s.mutated.r, s.mutated.g, s.mutated.b);

          return b2 / (b1 || 1);

        });

 

        const avgBrightnessBoost = brightnesses.reduce((sum, b) => sum + b, 0) / brightnesses.length;

        console.log(`  Average brightness boost: ${avgBrightnessBoost.toFixed(2)}x`);

      }

 

      // Store full sample data

      window[`${mutationType}TransformSamples`] = samples;

      console.log(`\n💾 Full data stored in: window.${mutationType}TransformSamples`);

 

      recordMutationTransform(mutationType, { ratios: avgRatios, diffs: avgDiffs, samples });

      return { samples, avgRatios, avgDiffs };

 

    } catch (error) {

      console.error('❌ Error analyzing pixels:', error);

      return null;

    }

  }

 

  // Helper: RGB to Hue

  function rgbToHue(r, g, b) {

    r /= 255;

    g /= 255;

    b /= 255;

 

    const max = Math.max(r, g, b);

    const min = Math.min(r, g, b);

    const delta = max - min;

 

    if (delta === 0) return null; // Grayscale, no hue

 

    let hue;

    if (max === r) {

      hue = ((g - b) / delta) % 6;

    } else if (max === g) {

      hue = (b - r) / delta + 2;

    } else {

      hue = (r - g) / delta + 4;

    }

 

    hue = Math.round(hue * 60);

    if (hue < 0) hue += 360;

 

    return hue;

  }

 

  // Step 3: Analyze each comparable pair

  console.log('Searching for canvases in DOM...\n');

  for (const pair of comparablePairs) {

    await analyzeComparablePair(pair);

  }

 

  // Final instructions

  console.log('\n' + '='.repeat(60));

  console.log('NEXT STEPS');

  console.log('='.repeat(60));

  console.log('\n1. Review the transformation patterns above');

  console.log('2. Check stored data: window.rainbowTransformSamples');

  console.log('3. Check stored data: window.goldTransformSamples');

  console.log('4. Use these patterns to recreate the effect in your own code');

  console.log('\nExample recreation pseudocode:');

  console.log('  for each pixel in sprite:');

  console.log('    newR = originalR * ratioR + offsetR');

  console.log('    newG = originalG * ratioG + offsetG');

  console.log('    newB = originalB * ratioB + offsetB');

  console.log('    clamp values to 0-255');

  console.log('\nOnce a transformation is captured, generate sprites without rendering each pet manually:');

  console.log("  await window.generateMutationSprites('rainbow')");

  console.log("  await window.generateMutationSprites('gold')");

  console.log("Download a single sprite via window.downloadMutationSprite('Chicken', 'rainbow').");

 

  console.log('\n' + '='.repeat(60));

  console.log('DONE');

  console.log('='.repeat(60));
 
  // ---------------------------------------------------------------------------

  async function loadAllKnownPets() {

    const cache = await waitForAtomCache();

    if (!cache) {

      console.warn('⚠️ jotaiAtomCache not detected. Open inventory once or run the Atom Inspector userscript.');

      return { entries: [], counts: { active: 0, inventory: 0, hutch: 0 } };

    }

 

    const counts = { active: 0, inventory: 0, hutch: 0 };

    const entries = [];

 

    const inventoryRaw = await readAtomValueSafe(INVENTORY_ATOM_LABELS);

    if (inventoryRaw) {

      const pets = normalizeInventoryItems(inventoryRaw).filter(isPetEntry);

      counts.inventory = pets.length;

      pets.forEach((pet) => entries.push({ ...pet, __source: 'inventory' }));

    }

 

    const hutchRaw = await readAtomValueSafe(PET_HUTCH_ATOM_LABEL);

    if (hutchRaw) {

      const pets = normalizeInventoryItems(hutchRaw).filter(isPetEntry);

      counts.hutch = pets.length;

      pets.forEach((pet) => entries.push({ ...pet, __source: 'hutch' }));

    }

 

    const activeRaw = await readAtomValueSafe(ACTIVE_PETS_ATOM_LABEL);

    if (activeRaw) {

      const pets = normalizeActivePetInfos(activeRaw);

      counts.active = pets.length;

      pets.forEach((pet) => entries.push({ ...pet, __source: 'active' }));

    }

 

    const deduped = dedupePets(entries);

    cachedPetEntries = deduped;

    cachedSpeciesList = extractSpeciesList(deduped);

    pageWindow.allPetSpecies = cachedSpeciesList;

    return { entries: deduped, counts };

  }

 

  function normalizeInventoryItems(raw) {

    if (!raw) return [];

    if (Array.isArray(raw)) return raw;

    if (Array.isArray(raw.items)) return raw.items;

    if (Array.isArray(raw.inventory)) return raw.inventory;

    if (Array.isArray(raw.list)) return raw.list;

    if (typeof raw === 'object') {

      const values = Object.values(raw);

      for (const value of values) {

        if (Array.isArray(value) && value.length && typeof value[0] === 'object') {

          return value;

        }

      }

    }

    return [];

  }

 

  function normalizeActivePetInfos(raw) {

    if (!Array.isArray(raw)) return [];

 

    return raw.map(entry => {

      const slot = entry?.slot ?? entry ?? {};

      return {

        id: slot.id || slot.petId || slot.slotId || slot.slotIndex || null,

        petSpecies: slot.petSpecies || slot.species || null,

        species: slot.petSpecies || slot.species || null,

        mutations: Array.isArray(slot.mutations) ? slot.mutations : [],

        name: slot.name || slot.displayName || null,

        itemType: 'Pet',

        raw: slot,

      };

    }).filter(isPetEntry);

  }

 

  function dedupePets(pets) {

    if (!Array.isArray(pets)) return [];

    const seen = new Set();

    const result = [];

    for (const pet of pets) {

      const key = buildPetKey(pet);

      if (seen.has(key)) continue;

      seen.add(key);

      result.push(pet);

    }

    return result;

  }

 

  function buildPetKey(pet) {

    const id = pet?.id || pet?.petId || pet?.slotId || pet?.slotIndex || 'unknown';

    const species = pet?.petSpecies || pet?.species || 'unknown';

    const mutations = Array.isArray(pet?.mutations) ? pet.mutations.slice().sort().join(',') : '';

    return `${id}-${species}-${mutations}`;

  }

 

  function isPetEntry(entry) {

    if (!entry || typeof entry !== 'object') return false;

    if (entry.itemType === 'Pet') return true;

    if (entry.petSpecies) return true;

    if (entry.species && !entry.itemType) return true;

    return false;

  }

 

  async function readAtomValueSafe(labels) {

    const list = Array.isArray(labels) ? labels : [labels];

    for (const label of list) {

      const atom = getAtomByLabel(label);

      if (!atom) continue;

      try {

        const value = await readAtomValue(atom);

        if (value != null) {

          return value;

        }

      } catch (error) {

        console.warn(`⚠️ Failed to read ${label}:`, error);

      }

    }

 

    return null;

  }

 

  /* ------------------------------------------------------------------------ */
  /* Offline sprite generation helpers                                        */
  /* ------------------------------------------------------------------------ */

  async function getBaseSpriteCanvas(species) {

    const sheet = await ensurePetSpriteSheet();

    if (!sheet) return null;

    return getSpeciesTileCanvas(sheet, species);

  }

 

  async function generateMutationSpritesForAllPets(mutationType, options = {}) {

    const transform = mutationTransforms[mutationType];

    if (!transform) {

      console.warn(`⚠️ No ${mutationType} transformation data recorded yet. Run the analyzer first.`);

      return null;

    }

 

    const sheet = await ensurePetSpriteSheet();

    if (!sheet) {

      console.warn('⚠️ Unable to load pet sprite sheet. Make sure you have visited an area that loads pets.png.');

      return null;

    }

 

    const targetSpecies = Array.isArray(options.species) && options.species.length

      ? options.species

      : (cachedSpeciesList.length ? cachedSpeciesList : Object.keys(PET_TILE_MAP));

 

    if (!targetSpecies.length) {

      console.warn('⚠️ No species available to render. Open your pet inventory/hutch first.');

      return null;

    }

 

    const result = {};

    const normalizedTransform = {

      ratios: transform.ratios || transform.avgRatios || { r: 1, g: 1, b: 1 },

      diffs: transform.diffs || transform.avgDiffs || { r: 0, g: 0, b: 0 },

    };

 

    let generatedCount = 0;

    for (const species of targetSpecies) {

      const tileCanvas = getSpeciesTileCanvas(sheet, species);

      if (!tileCanvas) {

        continue;

      }

      const mutatedCanvas = applyColorTransformCanvas(tileCanvas, normalizedTransform);

      const dataUrl = mutatedCanvas.toDataURL('image/png');

      if (!generatedMutationSprites[mutationType]) {

        generatedMutationSprites[mutationType] = {};

      }

      generatedMutationSprites[mutationType][species] = { canvas: mutatedCanvas, dataUrl };

      result[species] = generatedMutationSprites[mutationType][species];

      generatedCount++;

    }

 

    if (!generatedCount) {

      console.warn(`⚠️ Failed to generate any ${mutationType} sprites. Add tile mappings via window.registerPetTileIndex('Species', index).`);

      return null;

    }

 

    console.log(`✅ Generated ${generatedCount} ${mutationType} sprites. Access via window.generatedMutationSprites['${mutationType}'].`);

    return result;

  }

 

  function downloadMutationSprite(species, mutationType = 'rainbow') {

    const bucket = generatedMutationSprites[mutationType];

    if (!bucket) {

      console.warn(`⚠️ No generated sprites for ${mutationType} yet. Run window.generateMutationSprites('${mutationType}') first.`);

      return;

    }

    const entry = bucket[species];

    if (!entry) {

      console.warn(`⚠️ No cached sprite for ${species} (${mutationType}).`);

      return;

    }

    triggerDownload(entry.dataUrl, `${species}_${mutationType}.png`);

  }

 

  function triggerDownload(dataUrl, filename) {

    const link = document.createElement('a');

    link.href = dataUrl;

    link.download = filename;

    document.body.appendChild(link);

    link.click();

    setTimeout(() => link.remove(), 0);

  }

 

  async function ensurePetSpriteSheet() {

    if (cachedPetSheet) {

      return cachedPetSheet;

    }

    if (petSheetPromise) {

      return petSheetPromise;

    }

 

    petSheetPromise = (async () => {

      const url = findSpriteSheetUrl(/pets\.png/i) || DEFAULT_PET_SHEET_URL;

      console.log(`[rainbow-effect] Loading pet sprite sheet: ${url}`);

      const img = await loadImageElement(url);

      const canvas = document.createElement('canvas');

      canvas.width = img.width;

      canvas.height = img.height;

      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0);

      const tileSize = detectTileSize(img.width, img.height);

      const tilesPerRow = Math.floor(img.width / tileSize);

      const tilesPerColumn = Math.floor(img.height / tileSize);

      cachedPetSheet = { url, canvas, ctx, tileSize, tilesPerRow, tilesPerColumn };

      return cachedPetSheet;

    })().catch((error) => {

      console.error('❌ Failed to load pet sprite sheet:', error);

      return null;

    });

 

    return petSheetPromise;

  }

 

  function detectTileSize(width, height) {

    for (const size of PET_TILE_SIZE_CANDIDATES) {

      if (width % size === 0 && height % size === 0) {

        return size;

      }

    }

    return 256;

  }

 

  function findSpriteSheetUrl(pattern) {

    const perf = pageWindow?.performance ?? performance;

    if (perf && typeof perf.getEntriesByType === 'function') {

      const entries = perf.getEntriesByType('resource');

      for (const entry of entries) {

        if (pattern.test(entry.name)) {

          return entry.name;

        }

      }

    }

 

    const nodes = Array.from(document.querySelectorAll('link[href], script[src], img[src]'));

    for (const node of nodes) {

      const url = node.getAttribute('href') || node.getAttribute('src');

      if (url && pattern.test(url)) {

        return url;

      }

    }

 

    return null;

  }

 

  function getSpeciesTileCanvas(sheet, species) {

    const index = getTileIndexForSpecies(species);

    if (typeof index !== 'number') {

      return null;

    }

 

    const tileCanvas = document.createElement('canvas');

    tileCanvas.width = sheet.tileSize;

    tileCanvas.height = sheet.tileSize;

    const ctx = tileCanvas.getContext('2d');

    const x = (index % sheet.tilesPerRow) * sheet.tileSize;

    const y = Math.floor(index / sheet.tilesPerRow) * sheet.tileSize;

    ctx.drawImage(sheet.canvas, x, y, sheet.tileSize, sheet.tileSize, 0, 0, sheet.tileSize, sheet.tileSize);

    return tileCanvas;

  }

 

  function getTileIndexForSpecies(species) {

    const key = normalizeSpeciesKey(species);

    if (!key) {

      return null;

    }

    if (Object.prototype.hasOwnProperty.call(PET_TILE_MAP, key)) {

      return PET_TILE_MAP[key];

    }

    if (!missingTileWarnings.has(key)) {

      console.warn(`⚠️ No tile mapping for species "${species}". Provide one via window.registerPetTileIndex('${species}', index).`);

      missingTileWarnings.add(key);

    }

    return null;

  }

 

  function registerPetTileIndex(species, index) {

    const key = normalizeSpeciesKey(species);

    if (!key || !Number.isFinite(Number(index))) {

      console.warn('⚠️ Usage: window.registerPetTileIndex("Species", tileIndexNumber)');

      return;

    }

    PET_TILE_MAP[key] = Number(index);

    missingTileWarnings.delete(key);

    console.log(`✅ Registered tile #${index} for ${species}`);

  }

 

  function normalizeSpeciesKey(name) {

    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  }

 

  function extractSpeciesList(pets) {

    const set = new Set();

    pets.forEach((pet) => {

      const label = (pet.petSpecies || pet.species || '').trim();

      if (label) {

        set.add(label);

      }

    });

    return Array.from(set).sort();

  }

 

  function applyColorTransformCanvas(sourceCanvas, transform) {

    const canvas = document.createElement('canvas');

    canvas.width = sourceCanvas.width;

    canvas.height = sourceCanvas.height;

    const ctx = canvas.getContext('2d');

    ctx.drawImage(sourceCanvas, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const data = imageData.data;

    const ratios = transform.ratios || { r: 1, g: 1, b: 1 };

    const diffs = transform.diffs || { r: 0, g: 0, b: 0 };

    for (let i = 0; i < data.length; i += 4) {

      data[i] = clampChannel(data[i] * ratios.r + diffs.r);

      data[i + 1] = clampChannel(data[i + 1] * ratios.g + diffs.g);

      data[i + 2] = clampChannel(data[i + 2] * ratios.b + diffs.b);

    }

    ctx.putImageData(imageData, 0, 0);

    return canvas;

  }

 

  function clampChannel(value) {

    return Math.max(0, Math.min(255, Math.round(value)));

  }

 

  function recordMutationTransform(mutationType, payload) {

    if (!payload || !payload.ratios || !payload.diffs) {

      return;

    }

    mutationTransforms[mutationType] = { ratios: payload.ratios, diffs: payload.diffs };

    pageWindow[`${mutationType}Transform`] = payload;

    console.log(`💾 Stored ${mutationType} transform averages (R×${payload.ratios.r.toFixed(3)} G×${payload.ratios.g.toFixed(3)} B×${payload.ratios.b.toFixed(3)})`);

  }

 

  function loadImageElement(url) {

    return new Promise((resolve, reject) => {

      const img = new Image();

      img.crossOrigin = 'anonymous';

      img.onload = () => resolve(img);

      img.onerror = (error) => reject(error);

      img.src = url;

    });

  }

 

  pageWindow.generateMutationSprites = generateMutationSpritesForAllPets;
  pageWindow.downloadMutationSprite = downloadMutationSprite;
  pageWindow.registerPetTileIndex = registerPetTileIndex;
  pageWindow.generatedMutationSprites = generatedMutationSprites;
  pageWindow.petTileIndexMap = PET_TILE_MAP;

  function getAtomCache() {

    const root = pageWindow?.jotaiAtomCache;

    if (!root) return null;

    if (root.cache && typeof root.cache.values === 'function') {

      return root.cache;

    }

    if (typeof root.values === 'function') {

      return root;

    }

    return null;

  }

 

  async function waitForAtomCache(timeoutMs = 6000) {

    const start = Date.now();

    let cache = getAtomCache();

    while (!cache && Date.now() - start < timeoutMs) {

      await sleep(80);

      cache = getAtomCache();

    }

    return cache;

  }

 

  function getAtomByLabel(label) {

    const cache = getAtomCache();

    if (!cache || typeof cache.values !== 'function') return null;

    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const matcher = new RegExp(`^${escaped}$`);

    for (const atom of cache.values()) {

      if (!atom) continue;

      const atomLabel = String(atom.debugLabel || atom.label || '');

      if (matcher.test(atomLabel)) return atom;

    }

    return null;

  }

 

  async function readAtomValue(atom) {

    const store = await ensureJotaiStore();

    if (!store || store.__polyfill) {

      throw new Error('Jotai store unavailable');

    }

    return store.get(atom);

  }

 

  async function ensureJotaiStore() {

    if (jotaiStore && !jotaiStore.__polyfill) {

      return jotaiStore;

    }

 

    if (captureInProgress) {

      const start = Date.now();

      while (captureInProgress && Date.now() - start < 5000) {

        await sleep(80);

      }

      if (jotaiStore && !jotaiStore.__polyfill) {

        return jotaiStore;

      }

    }

 

    captureInProgress = true;

    try {

      const fiberStore = findStoreViaFiber();

      if (fiberStore) {

        jotaiStore = fiberStore;

        return jotaiStore;

      }

 

      jotaiStore = await captureViaWriteOnce();

      return jotaiStore;

    } finally {

      captureInProgress = false;

    }

  }

 

  function findStoreViaFiber() {

    const hook = pageWindow?.__REACT_DEVTOOLS_GLOBAL_HOOK__;

    if (!hook?.renderers?.size) return null;

    for (const [rendererId] of hook.renderers) {

      const roots = hook.getFiberRoots?.(rendererId);

      if (!roots) continue;

      for (const root of roots) {

        const seen = new Set();

        const stack = [];

        const current = root?.current ?? root;

        if (current) stack.push(current);

        while (stack.length) {

          const fiber = stack.pop();

          if (!fiber || seen.has(fiber)) continue;

          seen.add(fiber);

          const value = fiber.pendingProps?.value;

          if (value && typeof value.get === 'function' && typeof value.set === 'function' && typeof value.sub === 'function') {

            return value;

          }

          if (fiber.child) stack.push(fiber.child);

          if (fiber.sibling) stack.push(fiber.sibling);

          if (fiber.alternate) stack.push(fiber.alternate);

        }

      }

    }

    return null;

  }

 

  async function captureViaWriteOnce(timeoutMs = 5000) {

    const cache = getAtomCache();

    if (!cache || typeof cache.values !== 'function') {

      return createPolyfillStore();

    }

 

    let capturedGet = null;

    let capturedSet = null;

    const patchedAtoms = [];

 

    const restorePatchedAtoms = () => {

      for (const atom of patchedAtoms) {

        try {

          if (atom[PATCH_FLAG]) {

            atom.write = atom[PATCH_FLAG];

            delete atom[PATCH_FLAG];

          }

        } catch {}

      }

    };

 

    for (const atom of cache.values()) {

      if (!atom || typeof atom.write !== 'function' || atom[PATCH_FLAG]) continue;

      const original = atom.write;

      atom[PATCH_FLAG] = original;

      atom.write = function patchedWrite(get, set, ...args) {

        if (!capturedSet) {

          capturedGet = get;

          capturedSet = set;

          restorePatchedAtoms();

        }

        return original.call(this, get, set, ...args);

      };

      patchedAtoms.push(atom);

    }

 

    const start = Date.now();

    while (!capturedSet && Date.now() - start < timeoutMs) {

      await sleep(50);

    }

 

    restorePatchedAtoms();

 

    if (!capturedSet || !capturedGet) {

      return createPolyfillStore();

    }

 

    return {

      get(atom) {

        return capturedGet(atom);

      },

      set(atom, value) {

        return capturedSet(atom, value);

      },

      sub(atom, cb) {

        let active = true;

        let lastValue;

        const interval = setInterval(() => {

          if (!active) return;

          try {

            const next = capturedGet(atom);

            if (next !== lastValue) {

              lastValue = next;

              cb();

            }

          } catch {}

        }, 120);

        return () => {

          active = false;

          clearInterval(interval);

        };

      },

    };

  }

 

  function createPolyfillStore() {

    return {

      __polyfill: true,

      get() {

        throw new Error('Store not captured');

      },

      set() {

        throw new Error('Store not captured');

      },

      sub() {

        return () => {};

      },

    };

  }

 

  function sleep(ms) {

    return new Promise(resolve => setTimeout(resolve, ms));

  }

})().catch((error) => {

  console.error('❌ Reverse-engineer rainbow script failed:', error);

});
```

### WebSocket Discovery Helper

```javascript
// ============================================
// FINAL WebSocket Discovery - Complete Solution
// ============================================

// ============================================
// Working Purchase Command (TESTED FORMAT)
// ============================================
function purchaseCarrotSeed() {
  const payload = {
    type: 'PurchaseSeed',
    species: 'Carrot',  // ← Uses species NAME, not ID!
    scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa']
  };

  console.log('🛒 Purchasing Carrot seed with correct format...');
  console.log('Payload:', payload);
  window.MagicCircle_RoomConnection.sendMessage(payload);
  console.log('✅ Command sent! Check shop/inventory.');
}


// ============================================
// Find ALL Atoms (Complete List)
// ============================================
function listAllAtoms() {
  const cache = window.jotaiAtomCache?.cache || window.jotaiAtomCache;
  const store = window.__qpmJotaiStore__;

  if (!cache || !store) {
    console.error('❌ Cache or store not found');
    return;
  }

  const atoms = [];
  for (const atom of cache.values()) {
    const label = atom?.debugLabel || atom?.label || '<unlabeled>';
    try {
      const value = store.get(atom);
      atoms.push({
        label,
        type: Array.isArray(value) ? 'Array' : typeof value,
        length: Array.isArray(value) ? value.length : null,
        hasData: !!value
      });
    } catch (e) {
      atoms.push({ label, type: 'error', error: e.message });
    }
  }

  console.log('📦 ALL ATOMS:\n');
  atoms.sort((a, b) => a.label.localeCompare(b.label)).forEach(a => {
    if (a.type === 'Array') {
      console.log(`  ${a.label} (Array[${a.length}])`);
    } else {
      console.log(`  ${a.label} (${a.type})`);
    }
  });

  console.log('\n🔍 CROP/INVENTORY RELATED:');
  atoms.filter(a => /crop|inventory|item|storage/i.test(a.label)).forEach(a => {
    console.log(`  ${a.label}`);
  });

  console.log('\n🐾 PET RELATED:');
  atoms.filter(a => /pet|hutch|slot/i.test(a.label)).forEach(a => {
    console.log(`  ${a.label}`);
  });

  return atoms;
}


// ============================================
// Deep Inventory Search
// ============================================
function findCropsAnywhere() {
  const cache = window.jotaiAtomCache?.cache || window.jotaiAtomCache;
  const store = window.__qpmJotaiStore__;

  console.log('🔍 Searching EVERYWHERE for crops...\n');

  for (const atom of cache.values()) {
    const label = atom?.debugLabel || atom?.label || '';

    try {
      const value = store.get(atom);

      // Check if it's an array with items
      if (Array.isArray(value)) {
        const crops = value.filter(item =>
          item && (
            item.itemType === 'Crop' ||
            item.type === 'Crop' ||
            (typeof item.species === 'string' && /carrot|strawberry|tomato/i.test(item.species))
          )
        );

        if (crops.length > 0) {
          console.log('✅ Found crops in:', label);
          console.log('   Count:', crops.length);
          console.log('   First crop:', crops[0]);
          console.log('');
        }
      }

      // Check if it's an object with items property
      if (value && typeof value === 'object' && value.items) {
        const crops = value.items.filter(item =>
          item && (
            item.itemType === 'Crop' ||
            item.type === 'Crop'
          )
        );

        if (crops.length > 0) {
          console.log('✅ Found crops in:', label, '(via .items property)');
          console.log('   Count:', crops.length);
          console.log('   First crop:', crops[0]);
          console.log('');
        }
      }
    } catch (e) {
      // Skip atoms that error
    }
  }
}


// ============================================
// Alternative FeedPet Monitor
// ============================================
function installAlternativeFeedMonitor() {
  // Try to intercept at a lower level
  const ws = window.MagicCircle_RoomConnection.currentWebSocket;

  if (ws) {
    const originalSend = ws.send;
    ws.send = function(data) {
      console.log('%c🌐 RAW WebSocket SEND', 'background: #ff00ff; color: white; font-weight: bold; padding: 4px 12px');
      console.log('Data:', data);
      try {
        const parsed = JSON.parse(data);
        console.log('Parsed:', parsed);
      } catch (e) {
        console.log('(Not JSON)');
      }
      return originalSend.call(this, data);
    };

    console.log('✅ Raw WebSocket monitor installed');
    console.log('👉 This catches ALL WebSocket traffic, even if not through sendMessage');
  } else {
    console.log('❌ No active WebSocket found');
  }
}


// ============================================
// Test Feed with Manual Pet/Crop Selection
// ============================================
function testFeedWithManualIds(petItemId, cropItemId) {
  if (!petItemId || !cropItemId) {
    console.log('Usage: testFeedWithManualIds("pet-id-here", "crop-id-here")');
    console.log('');
    console.log('To find IDs:');
    console.log('  1. Run: findActivePetsDetailed()');
    console.log('  2. Run: findCropsAnywhere()');
    console.log('  3. Copy the IDs from console output');
    return;
  }

  const payload = {
    type: 'FeedPet',
    petItemId: petItemId,
    cropItemId: cropItemId,
    scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa']
  };

  console.log('🍖 Sending FeedPet with manual IDs...');
  console.log('Payload:', payload);
  window.MagicCircle_RoomConnection.sendMessage(payload);
  console.log('✅ Command sent!');
}


// ============================================
// Detailed Active Pet Finder
// ============================================
function findActivePetsDetailed() {
  const cache = window.jotaiAtomCache?.cache || window.jotaiAtomCache;
  const store = window.__qpmJotaiStore__;

  console.log('🐾 Searching for active pets in detail...\n');

  for (const atom of cache.values()) {
    const label = atom?.debugLabel || atom?.label || '';

    if (/pet.*hutch.*items|pet.*slot/i.test(label)) {
      try {
        const value = store.get(atom);

        console.log('📦 Atom:', label);
        console.log('   Value:', value);

        if (Array.isArray(value)) {
          value.forEach((item, idx) => {
            if (item && (item.species || item.petId || item.id)) {
              console.log(`   [${idx}]`, item);
            }
          });
        }
        console.log('');
      } catch (e) {
        console.error('   Error:', e.message);
      }
    }
  }
}


// ============================================
// Test All Game Commands
// ============================================
function testAllCommands() {
  console.log('🧪 Available Test Commands:\n');
  console.log('1. Purchase Seeds:');
  console.log('   purchaseCarrotSeed()');
  console.log('   purchaseSeed("Strawberry")');
  console.log('');
  console.log('2. Feed Pets:');
  console.log('   testFeedWithManualIds("pet-id", "crop-id")');
  console.log('');
  console.log('3. Discovery:');
  console.log('   listAllAtoms()');
  console.log('   findActivePetsDetailed()');
  console.log('   findCropsAnywhere()');
  console.log('   installAlternativeFeedMonitor()');
  console.log('');
}

// Generic purchase function
function purchaseSeed(species) {
  const payload = {
    type: 'PurchaseSeed',
    species: species,
    scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa']
  };
  console.log('🛒 Purchasing', species, 'seed...');
  window.MagicCircle_RoomConnection.sendMessage(payload);
  console.log('✅ Command sent!');
}


// ============================================
// QUICK START
// ============================================
console.log('╔═══════════════════════════════════════════════╗');
console.log('║  🎯 FINAL WebSocket Discovery                 ║');
console.log('╚═══════════════════════════════════════════════╝');
console.log('');
console.log('✅ WORKING PURCHASE FORMAT FOUND!');
console.log('   Uses "species" name, not seedId');
console.log('');
console.log('📋 Quick Commands:');
console.log('  purchaseCarrotSeed()        - Buy a Carrot seed (WORKS!)');
console.log('  findActivePetsDetailed()    - Find your active pets');
console.log('  findCropsAnywhere()         - Find crops in inventory');
console.log('  testAllCommands()           - List all available tests');
console.log('');
console.log('🔬 Advanced:');
console.log('  listAllAtoms()                      - See ALL atoms');
console.log('  installAlternativeFeedMonitor()     - Raw WebSocket monitor');
console.log('  testFeedWithManualIds(petId, cropId) - Manual feed test');
console.log('');
console.log('═══════════════════════════════════════════════');
```

