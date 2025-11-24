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
