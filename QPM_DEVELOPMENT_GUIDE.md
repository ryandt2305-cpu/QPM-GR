# QPM (Quinoa Pet Manager) - Comprehensive Development Guide

**Version:** 4.0.1
**Last Updated:** 2025-11-14
**Purpose:** This guide contains ALL essential information needed to develop new features for QPM with consistent style, patterns, and game mechanics knowledge.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Code Structure](#architecture--code-structure)
3. [UI/UX Guidelines & Style Consistency](#uiux-guidelines--style-consistency)
4. [Game Mechanics Reference](#game-mechanics-reference)
5. [Data Structures & Type Definitions](#data-structures--type-definitions)
6. [Development Patterns & Best Practices](#development-patterns--best-practices)
7. [Math & Calculations](#math--calculations)
8. [Jotai State Management](#jotai-state-management)
9. [Storage & Persistence](#storage--persistence)
10. [Testing & Debugging Tips](#testing--debugging-tips)

---

## 1. Project Overview

### What is QPM?

QPM is a TypeScript-based userscript for Magic Garden that provides:
- **Auto-Feed System**: Automatically feeds pets when hunger drops below threshold
- **Weather Pet Swapper**: Detects weather changes and swaps pet teams
- **Auto Shop**: Automatically purchases configured items from shops
- **Crop Type Locking**: Prevents accidental selling of favorited crops
- **Mutation Tracking**: Tracks and highlights valuable crop mutations
- **Harvest Reminder**: Alerts when high-value crops are ready
- **Turtle Timer**: Countdown for plant growth optimization

### Technology Stack

- **Language**: TypeScript 5.3+
- **Build Tool**: Vite 7.1+
- **State Management**: Jotai (via game's React context)
- **Storage**: localStorage + Tampermonkey GM storage
- **Target Environment**: Tampermonkey userscript
- **Supported Games**: magiccircle.gg, magicgarden.gg, starweaver.org

### Key Dependencies

```json
{
  "vite": "^7.1.12",
  "typescript": "^5.3.0",
  "vite-plugin-dts": "^4.5.4",
  "jszip": "^3.10.1"
}
```

---

## 2. Architecture & Code Structure

### Project Structure

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
│   │   ├── mutationReminder.ts# Mutation notifications
│   │   ├── harvestReminder.ts # Harvest alerts
│   │   ├── gardenBridge.ts    # Garden state sync
│   │   ├── turtleTimer.ts     # Growth timer
│   │   └── valueCalculator.ts # Crop value calculations
│   ├── ui/                     # UI components
│   │   ├── mainPanel.ts       # Main control panel
│   │   ├── originalPanel.ts   # Legacy panel (deprecated)
│   │   ├── keybindCapture.ts  # Keybind configuration
│   │   ├── gardenHighlightOverlay.ts # Visual overlays
│   │   └── modalWindow.ts     # Modal dialogs
│   ├── store/                  # Jotai store modules
│   │   ├── pets.ts            # Pet info state
│   │   ├── petXpTracker.ts    # XP tracking
│   │   ├── stats.ts           # Session statistics
│   │   ├── weatherHub.ts      # Weather state
│   │   ├── shopStock.ts       # Shop inventory
│   │   ├── userSlots.ts       # Player inventory slots
│   │   ├── growSlotIndex.ts   # Growth slot tracking
│   │   ├── abilityLogs.ts     # Ability event logs
│   │   └── mutationSummary.ts # Mutation aggregation
│   ├── data/                   # Static game data
│   │   ├── petAbilities.ts    # Ability definitions & formulas
│   │   ├── petHungerCaps.ts   # Pet hunger limits by species
│   │   └── gameInfo.ts        # Crop/seed/egg metadata
│   ├── utils/                  # Utility functions
│   │   ├── dom.ts             # DOM manipulation
│   │   ├── storage.ts         # Storage abstraction
│   │   ├── logger.ts          # Logging system
│   │   ├── helpers.ts         # General utilities
│   │   ├── weatherDetection.ts# Weather canvas analysis
│   │   ├── cropMultipliers.ts # Multiplier calculations
│   │   ├── plantScales.ts     # Plant size formulas
│   │   └── gardenData.ts      # Garden state parsing
│   └── types/                  # TypeScript types
│       ├── gameAtoms.ts       # Jotai atom types
│       └── shops.ts           # Shop data types
├── dist/                       # Build output
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

### Module Design Philosophy

**1. Feature Isolation**: Each feature is self-contained in its own file
- Exports configuration functions (`configure*`, `set*`)
- Exports state getters (`getConfig`, `getState`)
- Exports action triggers (`start*`, `check*`, `manual*`)
- Internal state is private (closures)

**2. Core Systems**: Shared infrastructure
- `jotaiBridge`: Captures game's Jotai store, provides atom access
- `pageContext`: Bridges userscript context to page window
- `notifications`: Toast/alert system

**3. UI Components**: Separate from logic
- `mainPanel.ts`: Builds UI, calls feature APIs
- No business logic in UI files
- UI updates via callbacks from features

**4. Data Layer**: Static game data
- Ability definitions with formulas
- Crop/seed/pet metadata
- Hunger caps, multipliers, etc.

### Initialization Flow

```typescript
// main.ts initialization sequence
async function initialize(): Promise<void> {
  // 1. Wait for game UI to load
  await waitForGame();

  // 2. Initialize stores (subscriptions to game atoms)
  initializeStatsStore();
  initializePetXpTracker();

  // 3. Start feature modules
  startCropTypeLocking();
  startAutoFeed();
  startWeatherSwap();
  await startGardenBridge();

  // 4. Configure features with saved settings
  configureWeatherSwap({ enabled: cfg.weatherSwap.enabled, ... });
  configureHarvestReminder({ enabled: cfg.harvestReminder.enabled, ... });

  // 5. Create UI
  createOriginalUI();
}
```

---

## 3. UI/UX Guidelines & Style Consistency

### Color Palette

Based on screenshots and code analysis:

```css
/* Primary Colors */
--background: rgba(0, 0, 0, 0.85)           /* Panel background */
--background-secondary: #222                /* Section backgrounds */
--background-tertiary: #333                 /* Input backgrounds */

/* Text Colors */
--text-primary: #fff                        /* Primary text */
--text-secondary: #ccc                      /* Labels */
--text-tertiary: #aaa                       /* Metadata */
--text-disabled: #888                       /* Disabled/hints */

/* Accent Colors */
--accent-green: #4CAF50                     /* Success/enabled */
--accent-green-light: #66BB6A               /* Hover states */
--accent-orange: #FF9800                    /* Warnings/info */
--accent-blue: #42A5F5                      /* Links/actions */
--accent-teal: #26A69A                      /* Utilities */
--accent-lime: #8BC34A                      /* Stats/positive */
--accent-grey: #90A4AE                      /* Neutral info */

/* Borders */
--border-subtle: #444                       /* Section dividers */
--border-input: #555                        /* Input borders */
```

### Typography Standards

```css
/* Font Families */
font-family: Arial, sans-serif;             /* Base UI */
font-family: 'Segoe UI', sans-serif;        /* Alternative (inspector) */
font-family: monospace;                     /* Code/data display */

/* Font Sizes */
--font-title: 14px                          /* Panel title */
--font-section: 13px                        /* Section headers */
--font-base: 12px                           /* Body text */
--font-small: 11px                          /* Labels/inputs */
--font-tiny: 10px                           /* Hints/metadata */

/* Line Heights */
line-height: 1.4;                           /* Base text */
line-height: 1.5;                           /* Readable paragraphs */
```

### Component Patterns

#### **Panel Structure**

```typescript
// CORRECT: Consistent panel structure
<div class="qpm-main-panel">
  <div class="qpm-title">
    <span class="qpm-title-text">🍖 Quinoa Pet Manager</span>
    <span class="qpm-title-indicator">▼</span>
  </div>
  <div class="qpm-content">
    <div class="qpm-stats">...</div>
    <div class="qpm-section">...</div>
  </div>
</div>
```

#### **Section Pattern**

```typescript
// CORRECT: Section with collapsible content
<div class="qpm-section">
  <div class="qpm-section-title">
    ☀️ Feature Name
    <span class="qpm-section-indicator">▼</span>
  </div>
  <div class="qpm-collapse">
    <!-- Content here -->
  </div>
</div>
```

#### **Button Styles**

```css
/* Base Button */
.qpm-button {
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 4px;
  background: #555;
  color: #fff;
  border: none;
  cursor: pointer;
}

/* Enabled State */
.qpm-button.enabled {
  background: #4CAF50;
}

/* Hover States */
.qpm-button:hover:not(:disabled) {
  background: #777;
}

.qpm-button.enabled:hover {
  background: #66BB6A;
}

/* Disabled State */
.qpm-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

#### **Input Fields**

```css
.qpm-input {
  width: 50px;
  padding: 3px 6px;
  border: 1px solid #555;
  background: #333;
  color: #fff;
  border-radius: 4px;
  font-size: 11px;
}
```

### Spacing & Layout Rules

```css
/* Section Spacing */
.qpm-section {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #444;
}

/* Button Rows */
.qpm-button-row {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

/* Option Rows */
.qpm-option-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
```

### Icon Usage

**Emoji Convention**: Use emoji for visual clarity and consistency

```typescript
// Feature Icons (used in section titles)
'🍖' // Auto-Feed
'☀️' // Weather Swapper
'🛒' // Auto Shop
'🔒' // Locking features
'📊' // Statistics
'🎯' // Trackers
'⚙️' // Settings/Advanced
'🌱' // Crops/Plants
'🥚' // Eggs/Pets
'💰' // Coins/Economy

// Status Indicators
'✓' // Enabled
'✗' // Disabled
'⏳' // Loading/Processing
'▼' // Expanded
'▲' // Collapsed
'⏱️' // Timer/Duration
```

### UI States

**Visual Feedback Rules**:
1. **Enabled features**: Green button with checkmark
2. **Disabled features**: Grey button with X
3. **Loading states**: Change text to "⏳..." and disable button
4. **Status text**: Always prefix with category (e.g., "Status:", "Current:")
5. **Collapsible sections**: Use ▼/▲ indicators

---

## 4. Game Mechanics Reference

### Pet Abilities

#### Ability Categories

```typescript
type AbilityCategory =
  | 'plantGrowth'  // Reduces plant growth time
  | 'eggGrowth'    // Reduces egg hatch time
  | 'xp'           // Grants XP to pets
  | 'coins'        // Generates coins
  | 'misc';        // Other effects

type AbilityTrigger =
  | 'continuous'   // Rolls every minute (or specified period)
  | 'hatchEgg'     // Triggers when hatching eggs
  | 'sellAllCrops' // Triggers when selling crops
  | 'sellPet'      // Triggers when selling pets
  | 'harvest';     // Triggers when harvesting
```

#### Ability Strength Formula

```typescript
// Abilities scale with pet strength (STR)
// Base strength: 100
// Strength range: typically 50-100+

const STRENGTH_BASELINE = 100;
const STRENGTH_DIVISOR = 200;
const MIN_MULTIPLIER = 0.25;
const MAX_CHANCE = 0.95;

function computeAbilityMultiplier(strength: number): number {
  const delta = strength - STRENGTH_BASELINE;
  return Math.max(MIN_MULTIPLIER, 1 + delta / STRENGTH_DIVISOR);
}

function computeChancePerRoll(baseProbability: number, strength: number): number {
  const multiplier = computeAbilityMultiplier(strength);
  const baseChance = baseProbability / 100;
  return Math.min(MAX_CHANCE, baseChance * multiplier);
}
```

**Example**: Pet with STR 63 using "Crop Size Boost II" (0.4% base chance)
```typescript
multiplier = 1 + (63 - 100) / 200 = 0.815
chancePerRoll = Math.min(0.95, 0.004 * 0.815) = 0.00326 = 0.326%
procsPerHour = (60 rolls/hour) * 0.00326 = 0.1956 procs/hour
```

#### Key Ability Reference

| Ability | Base % | Roll Period | Effect | Notes |
|---------|--------|-------------|--------|-------|
| **Plant Growth Boost I** | 24% | 1 min | -3 min growth | Reduces plant grow time |
| **Plant Growth Boost II** | 27% | 1 min | -5 min growth | Turtle ability |
| **Egg Growth Boost I** | 21% | 1 min | -7 min hatch | Chicken ability |
| **Egg Growth Boost II** | 24% | 1 min | -10 min hatch | Turtle ability |
| **XP Boost I** | 30% | 1 min | +300 XP | Goat ability |
| **XP Boost II** | 35% | 1 min | +400 XP | Peacock ability |
| **Coin Finder I** | 35% | 1 min | 1-120K coins | Snail ability |
| **Coin Finder II** | 13% | 1 min | 1-1.2M coins | Bunny ability |
| **Coin Finder III** | 6% | 1 min | 1-10M coins | Squirrel ability |
| **Gold Granter** | 0.72% | 1 min | Converts crop | Random crop → Gold |
| **Rainbow Granter** | 0.72% | 1 min | Converts crop | Random crop → Rainbow |
| **Crop Size Boost I** | 0.3% | 1 min | +6% scale | Bee ability |
| **Crop Size Boost II** | 0.4% | 1 min | +10% scale | Butterfly ability |
| **Double Harvest** | 5% | On harvest | 2x crops | Capybara ability |
| **Sell Boost I-IV** | 10-16% | On sell | +20-50% coins | Various pets |

### Weather System

#### Weather Event Types & Timing

```typescript
// Regular Weather (every 20-35 minutes, lasts 5 minutes)
type RegularWeather = 'rain' | 'frost' | 'sunny';

// Lunar Events (every 4 hours from 6am, lasts 10 minutes)
type LunarEvent = 'dawn' | 'amber';

// Event Probabilities
const WEATHER_CHANCES = {
  rain: 0.75,      // 75% chance
  frost: 0.25,     // 25% chance
  dawn: 0.67,      // 67% chance (2/3)
  amber: 0.33      // 33% chance (1/3)
};

// Lunar Event Schedule (system time)
// 6am, 10am, 2pm, 6pm, 10pm, 2am (every 4 hours)
const LUNAR_HOURS = [6, 10, 14, 18, 22, 2];
```

#### Weather Mutations & Application

```typescript
// Application chance: 7% per minute for regular weather, 1% for lunar
const BASE_APPLICATION_CHANCE = {
  rain: 0.07,      // Applies Wet
  frost: 0.07,     // Applies Chilled
  dawn: 0.01,      // Applies Dawnlit
  amber: 0.01      // Applies Amberlit
};

// Only FULLY MATURE crops can receive mutations
// Crops already having the mutation are skipped
// On average, 30% of applicable crops receive mutation per event
```

#### Expected Time to Get Mutations

```typescript
// Rain (Wet)
// avg events needed = 1 / (0.75 * 0.304) ≈ 4.4
// avg time = 4.4 * 30min ≈ 132 minutes (2.2 hours)

// Frost (Chilled)
// avg events needed = 1 / (0.25 * 0.304) ≈ 13.2
// avg time = 13.2 * 30min ≈ 396 minutes (6.6 hours)

// Dawn (Dawnlit)
// avg lunar events needed = 1 / (0.67 * 0.0956) ≈ 15.6
// avg time = 15.6 * 240min ≈ 3744 minutes (62 hours)

// Amber (Amberlit)
// avg lunar events needed = 1 / (0.33 * 0.0956) ≈ 31.7
// avg time = 31.7 * 240min ≈ 7608 minutes (127 hours)
```

### Multiplier System

#### Base Multipliers

```typescript
const MUTATION_MULTIPLIERS = {
  // Permanent Mutations (crops & pets)
  Golden: 25,
  Rainbow: 50,

  // Weather Conditions (crops only)
  Wet: 2,
  Chilled: 2,
  Frozen: 10,      // Wet + Chilled
  Dawnlit: 2,
  Dawnbound: 3,    // From Dawnbinder crop ability
  Amberlit: 5,
  Amberbound: 6    // From Moonbinder crop ability
};
```

#### Special Stacking Rules

**IMPORTANT**: Weather mutations (Wet/Chilled/Frozen) do NOT multiply with Lunar mutations (Dawnlit/Amberlit) - they ADD instead!

```typescript
// Standard multiplication would give:
// Wet (2x) * Dawnlit (2x) = 4x  ❌ WRONG

// Actual stacking:
// Wet + Dawnlit = 3x  ✓ CORRECT

const WEATHER_LUNAR_COMBOS = {
  'Wet + Dawnlit': 3,
  'Wet + Amberlit': 6,
  'Chilled + Dawnlit': 3,
  'Chilled + Amberlit': 6,
  'Frozen + Dawnlit': 11,
  'Frozen + Dawnbound': 12,
  'Frozen + Amberlit': 14,
  'Frozen + Amberbound': 15
};
```

#### Common High-Value Combinations

```typescript
const VALUABLE_COMBOS = {
  'Golden + Frozen': 250,                    // 25 * 10
  'Golden + Frozen + Amberlit': 350,         // 25 * 14
  'Rainbow + Frozen': 500,                   // 50 * 10
  'Rainbow + Frozen + Amberlit': 700,        // 50 * 14
  'Rainbow + Frozen + Amberbound': 750       // 50 * 15 (best)
};
```

#### Size/Weight Multiplier

```typescript
// Crop value scales LINEARLY with weight
// Multiplier = currentWeight / baseWeight

// Example: Burro's Tail
// Base: 0.40kg = 6,000 coins
// 0.80kg: 2x weight = 12,000 coins (2x price)
// 1.00kg: 2.5x weight = 15,000 coins (2.5x price)

function calculatePriceFromWeight(
  basePrice: number,
  baseWeight: number,
  currentWeight: number
): number {
  const weightMultiplier = currentWeight / baseWeight;
  return Math.round(basePrice * weightMultiplier);
}
```

#### Friend Bonus

```typescript
// Multiplies crop sell price based on server player count
const FRIEND_BONUS = {
  1: 0,      // Solo: 0% bonus
  2: 0.10,   // 2 players: +10%
  3: 0.20,   // 3 players: +20%
  4: 0.30,   // 4 players: +30%
  5: 0.40,   // 5 players: +40%
  6: 0.50    // 6 players (full): +50%
};

function applyFriendBonus(baseValue: number, playerCount: number): number {
  const bonus = FRIEND_BONUS[Math.min(6, Math.max(1, playerCount))] || 0;
  return Math.round(baseValue * (1 + bonus));
}
```

### Crop Growth Mechanics

#### Single-Harvest Crops

```typescript
// Simple growth time, no regrowth
interface SingleHarvestCrop {
  growTime: string;    // e.g., "4s", "45s", "12min", "24h"
  baseWeight: number;  // kg
  maxWeight: number;   // kg
  basePrice: number;   // coins at baseWeight, size 50
}

// Initial spawn size: 50-100 (random)
// Size 50 = baseWeight
// Size 100 = maxWeight
```

#### Multi-Harvest Crops

```typescript
// Regrowable crops with multiple slots
interface MultiHarvestCrop {
  growTime: string;        // Initial growth to maturity
  regrowSlots: number;     // Number of harvestable slots
  matureTime: string;      // Total time to fill all slots
  harvestCooldown: number; // Per-slot cooldown
}

// Cooldown Formula: 0.5 * growTime * n
// where n = number of un-matured crops
// Example: Strawberry (10s grow, 5 slots)
// 1st harvest: 5s cooldown (0.5 * 10 * 1)
// 2nd harvest: 10s cooldown (0.5 * 10 * 2)
// 3rd harvest: 15s cooldown (0.5 * 10 * 3)
```

#### Total Growth Time Calculation

```typescript
function calculateTotalGrowTime(
  baseGrowTime: number,  // seconds
  scale: number,         // crop-specific scale factor
  regrowSlots: number    // 0 for single-harvest
): number {
  const initialGrow = baseGrowTime * scale;

  if (regrowSlots === 0) return initialGrow;

  // Sum of cooldowns: 0.5 * baseGrowTime * (1 + 2 + 3 + ... + regrowSlots)
  const cooldownSum = 0.5 * baseGrowTime * (regrowSlots * (regrowSlots + 1) / 2);

  return initialGrow + cooldownSum;
}
```

### Pet Hunger System

#### Hunger Caps by Species

```typescript
// Different pets have different maximum hunger
const HUNGER_CAPS: Record<string, number> = {
  Worm: 100,
  Snail: 100,
  Bee: 100,
  Chicken: 120,
  Bunny: 120,
  Dragonfly: 120,
  Pig: 140,
  Cow: 140,
  Turtle: 160,
  Goat: 160,
  Squirrel: 160,
  Capybara: 180,
  Butterfly: 180,
  Peacock: 180
};
```

#### Hunger Depletion

```typescript
// Base depletion: ~1% per minute (varies by pet)
// Hunger Boost abilities reduce depletion rate:
// - Hunger Boost I: -12% * STR depletion
// - Hunger Boost II: -16% * STR depletion

// Example: Pet with 100 max hunger
// No boost: 100 minutes to starve
// With Hunger Boost II (STR 100): 116 minutes to starve
```

---

## 5. Data Structures & Type Definitions

### Jotai Atom Types

```typescript
// Core player data
interface PlayerAtom {
  id: string;
  displayName: string;
  username: string;
  name: string;
  coins: number;
  level: number;
  // ... other fields
}

// Inventory structure
interface InventoryAtom {
  items: InventoryItem[];
  favoritedItemIds: string[];
  capacity: number;
}

interface InventoryItem {
  id: string;
  itemId?: string;
  itemType: string;  // 'Seed' | 'Crop' | 'Egg' | 'Pet' | 'Tool' | 'Decor'
  species?: string;
  name?: string;
  displayName?: string;
  quantity?: number;
  mutations?: string[];
  hunger?: number;
  xp?: number;
  scale?: number;
  weight?: number;
}

// Pet hutch
interface PetHutchAtom {
  items: PetItem[];
  capacity: number;
}

interface PetItem {
  id: string;
  petId: string;
  petSpecies: string;
  name?: string;
  hunger: number;
  xp: number;
  strength: number;
  mutations: string[];
  abilities: string[];
}

// Active pet slots
interface PetSlotInfo {
  slotIndex: number;
  slot: {
    id: string;
    petSpecies: string;
    name?: string;
    hunger: number;
    xp: number;
    strength: number;
    abilities: string[];
  };
  status: 'active' | 'inactive';
}

// Garden tile objects
interface GardenTileObject {
  objectType: 'plant' | 'egg' | 'decor' | 'empty';
  species?: string;
  plantedAt?: number;     // timestamp
  maturedAt?: number;     // timestamp
  scale?: number;
  weight?: number;
  mutations?: string[];
  growthStage?: string;
}

// Weather state
interface WeatherAtom {
  current: 'sunny' | 'rain' | 'frost' | 'dawn' | 'amber';
  lastChange: number;  // timestamp
  nextEvent?: number;  // timestamp
}

// Shop data
interface ShopAtom {
  seed: ShopSection;
  egg: ShopSection;
  tool: ShopSection;
  decor: ShopSection;
}

interface ShopSection {
  inventory: ShopItem[];
  secondsUntilRestock: number;
}

interface ShopItem {
  species?: string;
  eggId?: string;
  toolId?: string;
  decorId?: string;
  price: number;
  initialStock?: number;
  canSpawnHere: boolean;
}
```

### Feature Configuration Types

```typescript
// Auto-feed config
interface AutoFeedConfig {
  enabled: boolean;
  threshold: number;           // 0-100
  retryDelayMs: number;
  blockedPetKeys?: Record<string, boolean>;
}

// Weather swap config
interface WeatherSwapConfig {
  enabled: boolean;
  noWeatherKey: string;        // JSON keybind
  weatherKey: string;          // JSON keybind
  alternateSunnyKey: string;
  alternateWeatherKey: string;
  useAlternateSunny: boolean;
  useAlternateWeather: boolean;
  swapOnWeather: boolean;
  swapOnSunny: boolean;
  swapCooldownMs: number;
  showNotifications: boolean;
  perWeatherKeybinds?: Record<'rain' | 'snow' | 'amber' | 'dawn', string>;
}

// Keybind data format
interface KeybindData {
  key: string;           // 'f', 'Escape', 'ArrowUp', etc.
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;         // Cmd on Mac
}

// Harvest reminder config
interface HarvestReminderConfig {
  enabled: boolean;
  highlightEnabled: boolean;
  toastEnabled: boolean;
  minSize: number;       // 0-100
  selectedMutations: {
    Rainbow: boolean;
    Gold: boolean;
    Frozen: boolean;
    Wet: boolean;
    Chilled: boolean;
    Dawnlit: boolean;
    Amberlit: boolean;
    Dawnbound: boolean;
    Amberbound: boolean;
  };
}
```

---

## 6. Development Patterns & Best Practices

### Feature Module Pattern

```typescript
// features/exampleFeature.ts

// Private state (closure)
let config = {
  enabled: false,
  threshold: 50
};

let state = {
  lastCheck: 0,
  checkCount: 0
};

// Status callback for UI
let statusCallback: ((status: string) => void) | null = null;

// Configuration API
export function setEnabled(enabled: boolean): void {
  config.enabled = enabled;
  saveConfig();
  updateStatus();
}

export function setThreshold(value: number): void {
  config.threshold = Math.max(0, Math.min(100, value));
  saveConfig();
}

export function getConfig() {
  return { ...config };
}

export function getState() {
  return { ...state };
}

// Callback registration
export function setStatusCallback(cb: (status: string) => void): void {
  statusCallback = cb;
}

// Internal helpers
function updateStatus(): void {
  const status = config.enabled ? 'Running' : 'Stopped';
  statusCallback?.(status);
}

function saveConfig(): void {
  storage.set('exampleFeature', config);
}

// Main logic
export function startExampleFeature(): void {
  log('Starting example feature');

  // Poll or subscribe to game state
  setInterval(() => {
    if (!config.enabled) return;

    checkFeature();
  }, 5000);
}

async function checkFeature(): Promise<void> {
  state.lastCheck = Date.now();
  state.checkCount++;

  // Feature logic here
}

// Manual trigger for UI buttons
export function manualCheck(): void {
  if (!config.enabled) {
    log('⚠️ Feature is disabled');
    return;
  }

  checkFeature();
}
```

### Jotai Atom Subscription Pattern

```typescript
// store/exampleStore.ts
import { getAtomByLabel, subscribeAtom } from '../core/jotaiBridge';

let unsubscribe: (() => void) | null = null;
let currentValue: any = null;

// Callback for external consumers
let changeCallback: ((value: any) => void) | null = null;

export function startExampleStore(): void {
  const atom = getAtomByLabel('targetAtomName');

  if (!atom) {
    log('⚠️ Atom not found: targetAtomName');
    return;
  }

  subscribeAtom(atom, (value) => {
    currentValue = value;
    changeCallback?.(value);
  }).then(unsub => {
    unsubscribe = unsub;
  });
}

export function onValueChange(cb: (value: any) => void): void {
  changeCallback = cb;

  // Immediately call with current value if available
  if (currentValue !== null) {
    cb(currentValue);
  }
}

export function getValue() {
  return currentValue;
}

// Cleanup (optional)
export function stopExampleStore(): void {
  unsubscribe?.();
  unsubscribe = null;
}
```

### Storage Best Practices

```typescript
// Use storage.ts abstraction
import { storage } from '../utils/storage';

// Save with type safety
interface MyConfig {
  enabled: boolean;
  value: number;
}

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

// Namespace your keys to avoid collisions
// Pattern: 'featureName:dataType'
// Examples:
// - 'autoFeed:config'
// - 'autoFeed:stats'
// - 'weatherSwap:config'
// - 'harvestReminder:selectedMutations'
```

### Error Handling

```typescript
// Always wrap game API calls in try-catch
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

// Log errors but don't crash the whole script
window.addEventListener('error', (event) => {
  // Filter out known noisy errors
  const message = String(event?.message || '');
  if (message.includes('Known noisy error pattern')) {
    event.stopImmediatePropagation?.();
    event.preventDefault?.();
    return false;
  }
  return true;
}, true);
```

### Debouncing & Throttling

```typescript
// Debounce rapid events
function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
}

// Throttle to prevent spam
function throttle<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall < delayMs) return;

    lastCall = now;
    fn(...args);
  };
}

// Usage
const debouncedSave = debounce(saveConfig, 500);
const throttledCheck = throttle(checkWeather, 5000);
```

### Naming Conventions & Code Style

#### Version Numbering

QPM uses semantic versioning (`MAJOR.MINOR.PATCH`):
- **MAJOR**: Breaking changes or major feature rewrites
- **MINOR**: New features, non-breaking changes
- **PATCH**: Bug fixes, minor improvements

Version must be updated in **two locations**:
1. `package.json` - `version` field
2. `scripts/build-userscript.js` - `@version` in userscript header

**Example:**
```javascript
// package.json
{
  "version": "4.0.1"
}

// scripts/build-userscript.js
// @version      4.0.1
```

#### File Naming

- **TypeScript files**: camelCase - `autoFeed.ts`, `weatherSwap.ts`, `modalWindow.ts`
- **Data files**: camelCase - `petAbilities.ts`, `cropData.ts`
- **UI components**: camelCase - `mainPanel.ts`, `keybindCapture.ts`
- **Config files**: kebab-case - `vite.config.ts`, `tsconfig.json`
- **Documentation**: SCREAMING_SNAKE_CASE for guides - `QPM_DEVELOPMENT_GUIDE.md`, `README.md`

#### Variable & Function Naming

**Variables:**
- **camelCase** for local variables: `feedThreshold`, `weatherKey`, `petInfo`
- **PascalCase** for types/interfaces: `PetInfo`, `WeatherConfig`, `WindowState`
- **SCREAMING_SNAKE_CASE** for constants: `DEFAULT_THRESHOLD`, `MAX_RETRY_COUNT`

**Functions:**
- **camelCase**: `createCard()`, `updateStatus()`, `setWeatherSwapEnabled()`
- **Verb-first naming**: `get`, `set`, `create`, `update`, `toggle`, `check`, `fetch`
- **Boolean functions**: prefix with `is`, `has`, `should`, `can`
  - `isWindowOpen()`, `hasActivePets()`, `shouldFeedPet()`, `canPurchaseItem()`

**Examples:**
```typescript
// ✅ Good
const feedThreshold = 40;
const MAX_PETS = 4;
function createWeatherSection(): HTMLElement { }
function isWindowOpen(id: string): boolean { }

// ❌ Bad
const FeedThreshold = 40;  // Should be camelCase
const max_pets = 4;        // Should be SCREAMING_SNAKE_CASE
function WeatherSection(): HTMLElement { }  // Should be camelCase
function windowOpen(id: string): boolean { }  // Missing 'is' prefix
```

#### CSS Class Naming

Use **BEM-like** conventions with `qpm-` prefix:
- **Block**: `qpm-card`, `qpm-panel`, `qpm-window`
- **Element**: `qpm-card__header`, `qpm-card__title`, `qpm-window__body`
- **Modifier**: `qpm-button--positive`, `qpm-button--accent`, `qpm-section--collapsed`

**Examples:**
```typescript
// Card structure
root.className = 'qpm-card';
header.className = 'qpm-card__header';
title.className = 'qpm-card__title';

// Button variants
button.classList.add('qpm-button--positive');
button.classList.add('qpm-button--accent');
```

#### HTML Data Attributes

Use `data-qpm-*` for custom attributes:
```typescript
element.dataset.qpmSection = 'auto-feed';
element.dataset.qpmWindowId = 'weather-events';
element.dataset.qpmItemId = 'item-123';
```

#### Window & Modal IDs

Use **kebab-case** for window/modal identifiers:
- `'weather-events'` - Weather & Events window
- `'shop-locker'` - Shop & Locker window
- `'auto-feed'` - Auto Feed window
- `'trackers-detail'` - Trackers detail window
- `'turtle-timer'` - Turtle timer window

**Example:**
```typescript
toggleWindow('weather-events', '🌦️ Weather & Events', renderWeatherEventsWindow, '45vw', '45vh');
toggleWindow('shop-locker', '🛒 Shop & Locker', renderShopLockerWindow, '45vw', '45vh');
```

#### Storage Keys

Use descriptive, prefixed keys:
```typescript
const PANEL_STATE_KEY = 'quinoa-panel-state';
const WINDOW_POSITION_KEY = 'qpm-window-pos-';
const CONFIG_KEY = 'qpm-config';
```

#### Event Callback Naming

Use descriptive `on*` or `*Callback` naming:
```typescript
setStatusUpdateCallback(callback);    // ✅ Good
onActivePetInfos(callback);           // ✅ Good
registerCallback(callback);           // ❌ Too generic
```

#### Git Branch Naming

Feature branches use the pattern: `claude/<description>-<sessionId>`
```bash
claude/reduce-window-sizes-fifty-percent-01BjRiu6Hc1wdZZRCXLsDu7y
claude/fix-auto-feed-threshold-02AbCdEf
```

#### Commit Message Format

Use conventional commits style:
```
<type>: <concise description>

[optional body with more details]

Examples:
- feat: Add custom window sizing support to modal system
- fix: Correct harvest reminder mutation filter logic
- style: Refactor Harvest and Mutation sections to use createCard
- chore: Update version to 4.0.1
- docs: Add comprehensive naming conventions to development guide
```

#### Code Organization

**Import ordering:**
1. External libraries (if any)
2. Core utilities (`utils/*`)
3. Features (`features/*`)
4. UI components (`ui/*`)
5. Store modules (`store/*`)
6. Type definitions

**Example:**
```typescript
import { log } from '../utils/logger';
import { storage } from '../utils/storage';
import { setAutoFeedEnabled } from '../features/autoFeed';
import { createCard } from '../ui/helpers';
import { onActivePetInfos } from '../store/pets';
import type { PetInfo, WindowConfig } from '../types';
```

---

## 7. Math & Calculations

### Ability Proc Rate Calculation

```typescript
// Given: base probability, pet strength, roll period
// Output: procs per hour

interface AbilityStats {
  multiplier: number;
  chancePerRoll: number;
  rollPeriodMinutes: number;
  procsPerHour: number;
}

function computeAbilityStats(
  baseProbability: number,  // 0-100
  strength: number,
  rollPeriodMinutes: number = 1
): AbilityStats {
  // Strength multiplier
  const delta = strength - 100;
  const multiplier = Math.max(0.25, 1 + delta / 200);

  // Chance per roll
  const baseChance = baseProbability / 100;
  const chancePerRoll = Math.min(0.95, baseChance * multiplier);

  // Procs per hour
  const rollsPerHour = rollPeriodMinutes > 0 ? 60 / rollPeriodMinutes : 0;
  const procsPerHour = rollsPerHour * chancePerRoll;

  return {
    multiplier,
    chancePerRoll,
    rollPeriodMinutes,
    procsPerHour
  };
}

// Example: Plant Growth Boost II (27% base, STR 80)
const stats = computeAbilityStats(27, 80, 1);
// multiplier = 1 + (80-100)/200 = 0.9
// chancePerRoll = 0.27 * 0.9 = 0.243 (24.3%)
// procsPerHour = 60 * 0.243 = 14.58
```

### Growth Time Reduction Calculation

```typescript
// Plant Growth Boost abilities reduce growth time
function calculateReducedGrowTime(
  baseGrowMinutes: number,
  abilities: Array<{ effectPerProc: number; procsPerHour: number }>
): { reducedTime: number; savedPerHour: number } {
  let totalReductionPerHour = 0;

  for (const ability of abilities) {
    // effectPerProc is in minutes
    totalReductionPerHour += ability.effectPerProc * ability.procsPerHour;
  }

  const reducedTime = Math.max(0, baseGrowMinutes - totalReductionPerHour);

  return {
    reducedTime,
    savedPerHour: totalReductionPerHour
  };
}

// Example: Watermelon (12 min base) with 3x Turtle (Plant Growth Boost II)
// Each Turtle: 5 min/proc * 14.58 procs/hour = 72.9 min saved/hour
// Total: 218.7 min saved/hour
// Note: This is per-crop-hour, actual benefit depends on garden cycle
```

### XP Gain Calculation

```typescript
// XP boost abilities grant XP over time
function calculateXpPerHour(
  abilities: Array<{ xpPerProc: number; procsPerHour: number }>
): number {
  return abilities.reduce((total, ability) => {
    return total + (ability.xpPerProc * ability.procsPerHour);
  }, 0);
}

// Example: 3x Peacock (XP Boost II: 400 XP, 35% base, STR 90)
// Each Peacock: 400 * 18.9 procs/hour = 7,560 XP/hour
// Total: 22,680 XP/hour
```

### Coin Generation Calculation

```typescript
// Coin Finder abilities generate coins
function calculateCoinsPerHour(
  abilities: Array<{
    minCoins: number;
    maxCoins: number;
    procsPerHour: number;
  }>
): { min: number; max: number; average: number } {
  let minTotal = 0;
  let maxTotal = 0;

  for (const ability of abilities) {
    minTotal += ability.minCoins * ability.procsPerHour;
    maxTotal += ability.maxCoins * ability.procsPerHour;
  }

  return {
    min: minTotal,
    max: maxTotal,
    average: (minTotal + maxTotal) / 2
  };
}

// Example: 3x Squirrel (Coin Finder III: 1-10M, 6% base, STR 94)
// Each: 3.276 procs/hour
// Min: 1M * 3.276 * 3 = 9.828M/hour
// Max: 10M * 3.276 * 3 = 98.28M/hour
// Avg: 54.054M/hour
```

### Rainbow/Gold Granter Time Estimate

```typescript
// Expected time to color N crops with M pets
// Uses harmonic number formula

function harmonicNumber(n: number): number {
  let sum = 0;
  for (let i = 1; i <= n; i++) {
    sum += 1 / i;
  }
  return sum;
}

function expectedTimeToColorCrops(
  uncoloredCrops: number,
  granterPets: Array<{ strength: number }>,
  targetCount: number = 1  // How many crops to color
): { seconds: number; minutes: number; hours: number } {
  // Combine all pets' trigger rates
  let totalTriggersPerSecond = 0;

  for (const pet of granterPets) {
    // Base: 0.72% per minute = 0.0072 per minute
    const chancePerSecond = 1 - Math.pow(1 - 0.0072 * pet.strength / 100, 1 / 60);
    totalTriggersPerSecond += chancePerSecond;
  }

  // Expected triggers to color targetCount crops
  // Harmonic number H_n gives expected attempts to hit n distinct targets
  const expectedTriggers = targetCount === 1
    ? 1 / uncoloredCrops
    : harmonicNumber(targetCount) * uncoloredCrops;

  const seconds = expectedTriggers / totalTriggersPerSecond;

  return {
    seconds,
    minutes: seconds / 60,
    hours: seconds / 3600
  };
}

// Example: 1 crop, 3 STR-100 Rainbow pets
// Each pet: chancePerSecond = 1.2e-4
// Total: 3.6e-4 triggers/sec
// Expected: 1/1 = 1 trigger needed
// Time: 1 / 3.6e-4 = 2778 seconds = 46 minutes
```

### Crop Value Calculation

```typescript
function calculateCropValue(
  basePrice: number,
  baseWeight: number,
  currentWeight: number,
  mutations: string[],
  friendBonus: number = 0  // 0-0.5
): number {
  // Size multiplier
  const sizeMultiplier = currentWeight / baseWeight;

  // Mutation multiplier
  const mutationMultiplier = calculateMutationMultiplier(mutations);

  // Final calculation
  const baseValue = basePrice * sizeMultiplier * mutationMultiplier;
  return Math.round(baseValue * (1 + friendBonus));
}

function calculateMutationMultiplier(mutations: string[]): number {
  const hasMutation = (m: string) => mutations.includes(m);

  // Check for Golden/Rainbow (mutually exclusive)
  let baseMultiplier = 1;
  if (hasMutation('Rainbow')) baseMultiplier = 50;
  else if (hasMutation('Golden')) baseMultiplier = 25;

  // Check for weather conditions
  let weatherMultiplier = 1;
  if (hasMutation('Frozen')) weatherMultiplier = 10;
  else if (hasMutation('Wet') || hasMutation('Chilled')) weatherMultiplier = 2;

  // Check for lunar conditions
  let lunarMultiplier = 1;
  if (hasMutation('Amberbound')) lunarMultiplier = 6;
  else if (hasMutation('Amberlit')) lunarMultiplier = 5;
  else if (hasMutation('Dawnbound')) lunarMultiplier = 3;
  else if (hasMutation('Dawnlit')) lunarMultiplier = 2;

  // Apply special stacking rules
  if (weatherMultiplier > 1 && lunarMultiplier > 1) {
    // Use lookup table for special combos
    const combo = `${getWeatherName(mutations)}+${getLunarName(mutations)}`;
    const specialMultiplier = WEATHER_LUNAR_COMBOS[combo];

    if (specialMultiplier) {
      return baseMultiplier * specialMultiplier;
    }
  }

  // Standard multiplication
  return baseMultiplier * weatherMultiplier * lunarMultiplier;
}

const WEATHER_LUNAR_COMBOS: Record<string, number> = {
  'Wet+Dawnlit': 3,
  'Wet+Amberlit': 6,
  'Chilled+Dawnlit': 3,
  'Chilled+Amberlit': 6,
  'Frozen+Dawnlit': 11,
  'Frozen+Dawnbound': 12,
  'Frozen+Amberlit': 14,
  'Frozen+Amberbound': 15
};
```

---

## 8. Jotai State Management

### Atom Discovery

```typescript
// Finding atoms by label
import { getAtomByLabel, findAtomsByLabel } from '../core/jotaiBridge';

// Exact match
const inventoryAtom = getAtomByLabel('myInventoryAtom');

// Pattern search
const petAtoms = findAtomsByLabel(/pet/i);

// Common atom labels:
// - 'myInventoryAtom'
// - 'myPetHutchPetItemsAtom'
// - 'myPetInfosAtom'
// - 'myPetSlotInfosAtom'
// - 'weatherAtom'
// - 'shopsAtom'
// - 'myDataAtom'
// - 'playerAtom'
// - 'stateAtom'
// - 'myCurrentGardenObjectAtom'
// - 'myDataAtom:garden.tileObjects' (nested access)
```

### Reading Atom Values

```typescript
import { readAtomValue } from '../core/jotaiBridge';

// One-time read
async function getPlayerCoins(): Promise<number> {
  try {
    const playerAtom = getAtomByLabel('playerAtom');
    if (!playerAtom) return 0;

    const player = await readAtomValue<any>(playerAtom);
    return player?.coins ?? 0;
  } catch (error) {
    log('Error reading player coins:', error);
    return 0;
  }
}
```

### Subscribing to Atom Changes

```typescript
import { subscribeAtom } from '../core/jotaiBridge';

async function watchPlayerCoins(callback: (coins: number) => void): Promise<() => void> {
  const playerAtom = getAtomByLabel('playerAtom');
  if (!playerAtom) {
    log('⚠️ playerAtom not found');
    return () => {};
  }

  const unsubscribe = await subscribeAtom(playerAtom, (player: any) => {
    const coins = player?.coins ?? 0;
    callback(coins);
  });

  return unsubscribe;
}

// Usage
const unsub = await watchPlayerCoins((coins) => {
  log(`Player coins changed: ${coins}`);
});

// Later: cleanup
unsub();
```

### Nested Atom Access

```typescript
// Some atoms expose nested data via colon syntax
// Format: 'atomLabel:path.to.property'

// Example: Garden tile objects
const tileObjectsAtom = getAtomByLabel('myDataAtom:garden.tileObjects');

// This is equivalent to:
const myDataAtom = getAtomByLabel('myDataAtom');
const myData = await readAtomValue(myDataAtom);
const tileObjects = myData?.garden?.tileObjects;
```

### Store Capture Methods

QPM uses two methods to capture the Jotai store:

1. **Fiber Traversal** (preferred): Walks React fiber tree to find store
2. **Write Hook** (fallback): Patches atom write functions temporarily

```typescript
// The bridge automatically tries both methods
// Check which method was used:
import { getCapturedInfo } from '../core/jotaiBridge';

const info = getCapturedInfo();
console.log(info.mode);  // 'fiber' | 'write' | 'polyfill'
console.log(info.hasStore);  // boolean
```

---

## 9. Storage & Persistence

### Storage Abstraction Layer

```typescript
// src/utils/storage.ts provides unified storage API

import { storage } from '../utils/storage';

// Set value (auto-serializes)
storage.set('key', { foo: 'bar' });

// Get value with default
const value = storage.get('key', { foo: 'default' });

// Remove value
storage.remove('key');

// Check existence
if (storage.has('key')) {
  // ...
}

// Clear all (use with caution!)
storage.clear();
```

### Configuration Persistence Pattern

```typescript
// Always provide defaults
const DEFAULT_CONFIG = {
  enabled: false,
  threshold: 40,
  logs: true
};

// Load with merge
function loadConfig() {
  const saved = storage.get('feature:config', {});
  return {
    ...DEFAULT_CONFIG,
    ...saved
  };
}

// Save only what changed
function saveConfig(config: typeof DEFAULT_CONFIG) {
  storage.set('feature:config', config);
}

// Initialize
let config = loadConfig();

// Update
config.threshold = 50;
saveConfig(config);
```

### Migration Pattern

```typescript
// Handle config version upgrades
const CONFIG_VERSION = 2;

interface ConfigV1 {
  enabled: boolean;
  value: number;
}

interface ConfigV2 {
  version: number;
  enabled: boolean;
  threshold: number;  // renamed from 'value'
  newField: boolean;
}

function migrateConfig(): ConfigV2 {
  const raw = storage.get<any>('feature:config', null);

  if (!raw) {
    // No saved config, use defaults
    return {
      version: CONFIG_VERSION,
      enabled: false,
      threshold: 40,
      newField: true
    };
  }

  if (raw.version === CONFIG_VERSION) {
    return raw as ConfigV2;
  }

  // Migrate from v1
  if (!raw.version || raw.version === 1) {
    return {
      version: CONFIG_VERSION,
      enabled: raw.enabled ?? false,
      threshold: raw.value ?? 40,  // renamed field
      newField: true  // new field with default
    };
  }

  // Unknown version, use defaults
  return {
    version: CONFIG_VERSION,
    enabled: false,
    threshold: 40,
    newField: true
  };
}
```

### Session vs Persistent Data

```typescript
// Use localStorage for persistent data (survives browser restart)
// Use in-memory for session data (resets on refresh)

// Persistent: user preferences, configuration
storage.set('autoFeed:config', config);

// Session: runtime state, statistics
let sessionStats = {
  startTime: Date.now(),
  feedCount: 0
};

// Optional: save session stats to localStorage for continuity
function saveSessionSnapshot() {
  storage.set('session:snapshot', sessionStats);
}

setInterval(saveSessionSnapshot, 60000);  // Save every minute
```

---

## 10. Testing & Debugging Tips

### Console Logging

```typescript
// Use consistent log prefix
import { log } from '../utils/logger';

// Good practices:
log('✅ Feature initialized');
log('⚠️ Warning: unusual state detected');
log('❌ Error: operation failed');
log('🔍 Debug:', { key: 'value' });

// Avoid:
console.log('something happened');  // No context
```

### Debugging Jotai Atoms

```typescript
// List all available atoms
function debugListAtoms() {
  const cache = (window as any).jotaiAtomCache?.cache;
  if (!cache) {
    console.log('❌ Atom cache not found');
    return;
  }

  const atoms: string[] = [];
  for (const atom of cache.values()) {
    const label = atom?.debugLabel || atom?.label || '(unlabeled)';
    atoms.push(label);
  }

  console.log('📚 Available atoms:', atoms.sort());
}

// Inspect atom value
async function debugAtomValue(label: string) {
  const atom = getAtomByLabel(label);
  if (!atom) {
    console.log(`❌ Atom not found: ${label}`);
    return;
  }

  try {
    const value = await readAtomValue(atom);
    console.log(`🔍 ${label}:`, value);
  } catch (error) {
    console.log(`❌ Error reading ${label}:`, error);
  }
}

// Usage in browser console:
// debugListAtoms()
// debugAtomValue('myInventoryAtom')
```

### Performance Monitoring

```typescript
// Measure function execution time
function measureTime<T>(label: string, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;

  if (duration > 100) {
    log(`⏱️ ${label} took ${duration.toFixed(2)}ms`);
  }

  return result;
}

// Usage
measureTime('Garden scan', () => {
  // expensive operation
});
```

### DOM Inspection

```typescript
// Check if game elements exist
function debugGameElements() {
  const checks = [
    { name: 'App root', selector: '#App' },
    { name: 'Canvas', selector: 'canvas' },
    { name: 'HUD root', selector: '[data-tm-hud-root]' },
    { name: 'Weather icon', selector: '[data-weather-icon]' }
  ];

  for (const check of checks) {
    const element = document.querySelector(check.selector);
    console.log(`${element ? '✅' : '❌'} ${check.name}`);
  }
}
```

### Userscript Reload Trick

```typescript
// Add to main.ts for quick reload during development
if (location.hash === '#reload-qpm') {
  location.hash = '';
  location.reload();
}

// In browser console:
// location.hash = '#reload-qpm'
```

### Common Issues & Solutions

**Issue**: "Atom not found"
- **Solution**: Check that game has fully loaded before accessing atoms
- **Solution**: Verify atom label spelling (case-sensitive)
- **Solution**: Use `debugListAtoms()` to see available atoms

**Issue**: UI not appearing
- **Solution**: Check `getGameHudRoot()` returns valid element
- **Solution**: Verify styles are injected (check DOM for style element)
- **Solution**: Check z-index conflicts with game UI

**Issue**: Feature stops working after page navigation
- **Solution**: Re-subscribe to atoms after navigation
- **Solution**: Check that event listeners weren't removed
- **Solution**: Verify localStorage persistence

**Issue**: Jotai store capture fails
- **Solution**: Wait longer for game initialization (increase timeout)
- **Solution**: Check React DevTools hook is available
- **Solution**: Fall back to polyfill mode (limited functionality)

---

## Appendix: Quick Reference

### Common Atom Labels

```
myInventoryAtom
myPetHutchPetItemsAtom
myPetInfosAtom
myPetSlotInfosAtom
myNumPetHutchItemsAtom
myCropInventoryAtom
mySeedInventoryAtom
myEggInventoryAtom
myToolInventoryAtom
myDecorInventoryAtom
myInventoryAtom:favoritedItemIds
weatherAtom
shopsAtom
myShopPurchasesAtom
playerAtom
numPlayersAtom
myDataAtom
myDataAtom:garden.tileObjects
myCurrentGardenObjectAtom
myOwnCurrentGardenObjectAtom
myCurrentSortedGrowSlotIndicesAtom
totalCropSellPriceAtom
totalPetSellPriceAtom
```

### Utility Functions

```typescript
// Time formatting
formatSince(timestamp: number): string  // "2m ago"
sleep(ms: number): Promise<void>

// DOM utilities
ready: Promise<void>  // Resolves when DOM ready
getGameHudRoot(): HTMLElement | null
addStyle(css: string): HTMLStyleElement

// Storage
storage.get<T>(key: string, defaultValue: T): T
storage.set(key: string, value: any): void
storage.remove(key: string): void
storage.has(key: string): boolean

// Logging
log(...args: any[]): void

// Crop calculations
calculateCropMultiplier(mutations: string[]): number
calculateCropValue(basePrice, weight, mutations, friendBonus): number
```

### File Templates

**New Feature Module**:
```typescript
// features/myFeature.ts
import { log } from '../utils/logger';
import { storage } from '../utils/storage';

interface MyFeatureConfig {
  enabled: boolean;
}

const DEFAULT_CONFIG: MyFeatureConfig = {
  enabled: false
};

let config = { ...DEFAULT_CONFIG };
let statusCallback: ((status: string) => void) | null = null;

export function setEnabled(enabled: boolean): void {
  config.enabled = enabled;
  saveConfig();
}

export function getConfig() {
  return { ...config };
}

export function setStatusCallback(cb: (status: string) => void): void {
  statusCallback = cb;
}

export function startMyFeature(): void {
  config = storage.get('myFeature:config', DEFAULT_CONFIG);
  log('✅ My Feature started');
}

function saveConfig(): void {
  storage.set('myFeature:config', config);
}
```

**New Store Module**:
```typescript
// store/myStore.ts
import { getAtomByLabel, subscribeAtom } from '../core/jotaiBridge';
import { log } from '../utils/logger';

let unsubscribe: (() => void) | null = null;
let currentData: any = null;
let changeCallback: ((data: any) => void) | null = null;

export function startMyStore(): void {
  const atom = getAtomByLabel('targetAtom');
  if (!atom) {
    log('⚠️ Atom not found: targetAtom');
    return;
  }

  subscribeAtom(atom, (data) => {
    currentData = data;
    changeCallback?.(data);
  }).then(unsub => {
    unsubscribe = unsub;
  });
}

export function onDataChange(cb: (data: any) => void): void {
  changeCallback = cb;
  if (currentData) cb(currentData);
}

export function getData() {
  return currentData;
}
```

---

## Best Practices Summary

### Code Style
✅ Use TypeScript for type safety
✅ Export config getters, not mutable state
✅ Use closure pattern for private state
✅ Prefix logs with emoji indicators
✅ Namespace localStorage keys
✅ Handle errors gracefully (try-catch)
✅ Debounce/throttle frequent operations
✅ Use async/await for readability

### UI/UX
✅ Follow color palette consistently
✅ Use emoji icons for visual clarity
✅ Provide status feedback for all actions
✅ Disable buttons during async operations
✅ Save UI state (collapsed sections, positions)
✅ Use 4px border-radius for consistency
✅ Gap: 6-8px between elements
✅ Font sizes: 10-14px range

### Game Integration
✅ Wait for game initialization before atom access
✅ Subscribe to atoms instead of polling
✅ Unsubscribe when features are disabled
✅ Cache atom lookups (don't search repeatedly)
✅ Validate atom values before use
✅ Handle missing/null data gracefully
✅ Test across different game states

### Performance
✅ Avoid polling faster than 1000ms
✅ Use event-driven updates where possible
✅ Debounce UI updates
✅ Batch DOM operations
✅ Cache expensive calculations
✅ Lazy-load features when needed

---

## Contributing New Features

### Checklist for New Features

1. **Planning**
   - [ ] Define feature scope and requirements
   - [ ] Identify required game atoms
   - [ ] Plan configuration structure
   - [ ] Design UI components needed

2. **Implementation**
   - [ ] Create feature module in `src/features/`
   - [ ] Implement configuration API (get/set functions)
   - [ ] Add status callback for UI updates
   - [ ] Handle errors and edge cases
   - [ ] Add logging with emoji prefixes

3. **UI Integration**
   - [ ] Add section to `mainPanel.ts`
   - [ ] Follow color palette and spacing rules
   - [ ] Add enable/disable toggle
   - [ ] Add status display
   - [ ] Implement collapsible section

4. **Data Persistence**
   - [ ] Define default configuration
   - [ ] Implement save/load functions
   - [ ] Namespace localStorage keys
   - [ ] Handle config migrations if needed

5. **Testing**
   - [ ] Test feature enable/disable
   - [ ] Test configuration changes
   - [ ] Test across page reloads
   - [ ] Test with game state changes
   - [ ] Verify no console errors

6. **Documentation**
   - [ ] Add comments to complex logic
   - [ ] Update this guide if needed
   - [ ] Add feature to README

---

## 11. Game Canvas & DOM Safety Guidelines

### ⚠️ CRITICAL: Canvas Modification Rules

**DO NOT modify the game canvas directly unless absolutely necessary!** The game uses canvas for rendering and modifying it can break the entire game.

#### ✅ **Safe DOM Operations**

```typescript
// SAFE: Add overlay elements OUTSIDE the canvas
const overlay = document.createElement('div');
overlay.style.position = 'fixed';
overlay.style.pointerEvents = 'none';  // Don't block game interactions
document.body.appendChild(overlay);

// SAFE: Read canvas data (weather detection)
const canvas = document.querySelector('canvas');
const ctx = canvas?.getContext('2d', { willReadFrequently: true });
const imageData = ctx?.getImageData(x, y, width, height);

// SAFE: Inject UI buttons into game panels (Aries Mod style)
const petPanel = document.querySelector('[data-pet-panel]');
if (petPanel) {
  const feedButton = document.createElement('button');
  feedButton.textContent = 'Feed All';
  feedButton.onclick = handleFeedAll;
  petPanel.appendChild(feedButton);
}
```

#### ❌ **Dangerous Operations**

```typescript
// DANGEROUS: Modifying canvas context
canvas.getContext('2d').globalAlpha = 0.5;  // ❌ Breaks game rendering

// DANGEROUS: Clearing or drawing on game canvas
ctx.clearRect(0, 0, width, height);  // ❌ Destroys game graphics
ctx.fillRect(x, y, w, h);           // ❌ Overlays game content

// DANGEROUS: Changing canvas size
canvas.width = 1920;   // ❌ Breaks game layout
canvas.height = 1080;  // ❌ Breaks game layout

// DANGEROUS: Modifying game React components directly
const reactInstance = element._reactInternals;  // ❌ Can crash React
reactInstance.memoizedState = {};               // ❌ Corrupts state
```

### Aries Mod Safe Injection Pattern

Aries Mod demonstrates safe UI injection - we can learn from this:

```typescript
// ✅ SAFE: Inject buttons into existing game panels
function injectFeedButton() {
  // Wait for panel to exist
  const petPanel = document.querySelector('.pet-panel-container');
  if (!petPanel) return;

  // Check if already injected
  if (petPanel.querySelector('.qpm-feed-button')) return;

  // Create button matching game style
  const button = document.createElement('button');
  button.className = 'qpm-feed-button';
  button.textContent = '🍖 Feed Instant';
  button.style.cssText = `
    margin: 4px;
    padding: 6px 12px;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;

  button.onclick = async () => {
    // Trigger feed via Jotai atoms, not DOM manipulation
    const feedAtom = getAtomByLabel('feedPetActionAtom');
    if (feedAtom) {
      await writeAtomValue(feedAtom, { action: 'feed' });
    }
  };

  petPanel.appendChild(button);
}

// Poll for panel appearance
setInterval(injectFeedButton, 1000);
```

### Canvas Reading for Weather Detection (Safe)

```typescript
// ✅ SAFE: Read canvas pixels for weather detection
function detectWeatherFromCanvas(): string | null {
  const canvas = document.querySelector('canvas');
  if (!canvas) return null;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Sample specific pixel regions (weather icon area)
  const x = 100;
  const y = 50;
  const imageData = ctx.getImageData(x, y, 1, 1);
  const [r, g, b, a] = imageData.data;

  // Analyze color to determine weather
  if (r > 100 && g > 150 && b > 200) return 'rain';
  if (r > 200 && g > 200 && b > 250) return 'frost';

  return 'sunny';
}
```

### Safe Overlay Pattern

```typescript
// ✅ SAFE: Create overlay for highlighting crops
function createGardenOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'qpm-garden-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;  /* CRITICAL: Don't block clicks */
    z-index: 1000;
  `;

  document.body.appendChild(overlay);
  return overlay;
}

function highlightCrop(x: number, y: number, color: string) {
  const overlay = document.getElementById('qpm-garden-overlay');
  if (!overlay) return;

  const highlight = document.createElement('div');
  highlight.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    width: 64px;
    height: 64px;
    border: 3px solid ${color};
    border-radius: 8px;
    pointer-events: none;  /* CRITICAL */
    animation: pulse 1s infinite;
  `;

  overlay.appendChild(highlight);
}
```

### Key Safety Rules

1. **Never modify canvas rendering context** - Read-only access is safe
2. **Never change canvas dimensions** - Breaks game layout
3. **Use overlays with `pointer-events: none`** - Don't block game clicks
4. **Inject UI into game panels carefully** - Match game styling
5. **Use Jotai atoms for actions** - Don't simulate DOM events
6. **Test in isolation first** - Verify no game breakage
7. **Graceful degradation** - If injection fails, don't crash

---

## 12. "How To" Cookbook - Step-by-Step Workflows

### How to Add a New Tracker Feature

**Example: Adding a "Seed Finder Tracker" to track which seeds were found**

#### Step 1: Create Feature Module

```typescript
// src/features/seedFinderTracker.ts
import { log } from '../utils/logger';
import { storage } from '../utils/storage';
import { getAtomByLabel, subscribeAtom } from '../core/jotaiBridge';

interface SeedFound {
  species: string;
  timestamp: number;
  petSpecies: string;
}

interface TrackerConfig {
  enabled: boolean;
  showNotifications: boolean;
}

const DEFAULT_CONFIG: TrackerConfig = {
  enabled: false,
  showNotifications: true
};

let config = { ...DEFAULT_CONFIG };
let seedsFound: SeedFound[] = [];
let statusCallback: ((status: string) => void) | null = null;

export function setEnabled(enabled: boolean): void {
  config.enabled = enabled;
  saveConfig();
  updateStatus();
}

export function setShowNotifications(show: boolean): void {
  config.showNotifications = show;
  saveConfig();
}

export function getConfig() {
  return { ...config };
}

export function getSeedsFound() {
  return [...seedsFound];
}

export function setStatusCallback(cb: (status: string) => void): void {
  statusCallback = cb;
}

export function startSeedFinderTracker(): void {
  config = storage.get('seedFinderTracker:config', DEFAULT_CONFIG);
  seedsFound = storage.get('seedFinderTracker:found', []);

  subscribeToInventory();
  log('✅ Seed Finder Tracker started');
}

async function subscribeToInventory(): Promise<void> {
  const inventoryAtom = getAtomByLabel('mySeedInventoryAtom');
  if (!inventoryAtom) {
    log('⚠️ Seed inventory atom not found');
    return;
  }

  let previousSeeds = new Set<string>();

  await subscribeAtom(inventoryAtom, (inventory: any) => {
    if (!config.enabled) return;

    const currentSeeds = new Set(
      (inventory?.items || []).map((item: any) => item.id)
    );

    // Find new seeds
    for (const id of currentSeeds) {
      if (!previousSeeds.has(id)) {
        const item = inventory.items.find((i: any) => i.id === id);
        if (item) {
          handleNewSeed(item);
        }
      }
    }

    previousSeeds = currentSeeds;
  });
}

function handleNewSeed(seed: any): void {
  const found: SeedFound = {
    species: seed.species || 'Unknown',
    timestamp: Date.now(),
    petSpecies: 'Unknown' // Would need to track active pets
  };

  seedsFound.unshift(found);
  if (seedsFound.length > 100) seedsFound.pop();

  saveSeeds();

  if (config.showNotifications) {
    showNotification(`Found: ${found.species}`);
  }

  updateStatus();
}

function updateStatus(): void {
  const status = config.enabled
    ? `Tracking (${seedsFound.length} found)`
    : 'Disabled';
  statusCallback?.(status);
}

function saveConfig(): void {
  storage.set('seedFinderTracker:config', config);
}

function saveSeeds(): void {
  storage.set('seedFinderTracker:found', seedsFound);
}

function showNotification(message: string): void {
  // Use your notification system
  log(`🌰 ${message}`);
}
```

#### Step 2: Add to main.ts

```typescript
// src/main.ts
import { startSeedFinderTracker } from './features/seedFinderTracker';

async function initialize(): Promise<void> {
  // ... other initialization ...

  startSeedFinderTracker();

  // ... rest of initialization ...
}
```

#### Step 3: Add UI Section

```typescript
// src/ui/mainPanel.ts - Add this function
function createSeedFinderTrackerSection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'qpm-section';

  const title = document.createElement('div');
  title.className = 'qpm-section-title';
  title.textContent = '🌰 Seed Finder Tracker';
  title.style.color = '#8BC34A';

  const collapse = document.createElement('div');
  collapse.className = 'qpm-collapse';

  title.addEventListener('click', () => {
    collapse.classList.toggle('open');
  });

  const status = document.createElement('div');
  status.className = 'qpm-status';
  status.textContent = 'Status: Initializing...';

  const config = getSeedFinderTrackerConfig();

  const toggleButton = createButton(
    config.enabled ? '✓ Tracking Enabled' : '✗ Tracking Disabled',
    () => {
      const newEnabled = !getSeedFinderTrackerConfig().enabled;
      setSeedFinderTrackerEnabled(newEnabled);
      toggleButton.textContent = newEnabled ? '✓ Tracking Enabled' : '✗ Tracking Disabled';
      toggleButton.className = `qpm-button ${newEnabled ? 'enabled' : ''}`;
    }
  );
  toggleButton.className = `qpm-button ${config.enabled ? 'enabled' : ''}`;
  toggleButton.style.width = '100%';

  const notifOption = createCheckboxOption(
    'Show notifications',
    config.showNotifications,
    (checked) => setSeedFinderTrackerShowNotifications(checked)
  );

  const seedsList = document.createElement('div');
  seedsList.style.marginTop = '8px';
  seedsList.style.fontSize = '10px';

  // Update list
  const updateList = () => {
    const seeds = getSeedsFound();
    if (seeds.length === 0) {
      seedsList.innerHTML = '<i style="color:#888;">No seeds found yet.</i>';
      return;
    }

    seedsList.innerHTML = seeds
      .slice(0, 10)
      .map((s) => {
        const time = formatSince(s.timestamp);
        return `• ${s.species} <span style="color:#888;">(${time})</span>`;
      })
      .join('<br>');
  };

  setInterval(updateList, 2000);
  updateList();

  setSeedFinderTrackerStatusCallback((s) => {
    status.textContent = `Status: ${s}`;
  });

  collapse.append(status, toggleButton, notifOption, seedsList);
  section.append(title, collapse);
  return section;
}

// Add to content in createMainPanel()
content.append(
  stats,
  feedSection,
  weatherSection,
  createSeedFinderTrackerSection(),  // <-- Add here
  shopSection
);
```

#### Step 4: Test

- [ ] Enable tracker in UI
- [ ] Wait for Seed Finder pet to trigger
- [ ] Verify new seed appears in list
- [ ] Check notification shows
- [ ] Reload page - verify persistence
- [ ] Disable tracker - verify stops tracking

---

### How to Add a Keybind-Based Action

**Example: Adding a "Harvest All" keybind**

#### Step 1: Define Keybind Configuration

```typescript
// src/features/harvestAll.ts
import { storage } from '../utils/storage';
import { KeybindData } from '../ui/keybindCapture';

interface HarvestAllConfig {
  enabled: boolean;
  keybind: string;  // JSON serialized KeybindData
}

const DEFAULT_CONFIG: HarvestAllConfig = {
  enabled: false,
  keybind: ''
};

let config = { ...DEFAULT_CONFIG };

export function setEnabled(enabled: boolean): void {
  config.enabled = enabled;
  saveConfig();
}

export function setKeybind(keyData: KeybindData): void {
  config.keybind = JSON.stringify(keyData);
  saveConfig();
  updateKeybindListener();
}

export function clearKeybind(): void {
  config.keybind = '';
  saveConfig();
  updateKeybindListener();
}

export function getConfig() {
  return { ...config };
}

export function startHarvestAll(): void {
  config = storage.get('harvestAll:config', DEFAULT_CONFIG);
  updateKeybindListener();
  log('✅ Harvest All started');
}

function updateKeybindListener(): void {
  // Remove old listener
  document.removeEventListener('keydown', handleKeydown);

  if (!config.enabled || !config.keybind) return;

  // Add new listener
  document.addEventListener('keydown', handleKeydown);
}

function handleKeydown(event: KeyboardEvent): void {
  if (!config.enabled || !config.keybind) return;

  const keyData: KeybindData = JSON.parse(config.keybind);

  // Match keybind
  if (
    event.key === keyData.key &&
    event.ctrlKey === keyData.ctrl &&
    event.shiftKey === keyData.shift &&
    event.altKey === keyData.alt &&
    event.metaKey === keyData.meta
  ) {
    event.preventDefault();
    event.stopPropagation();
    harvestAll();
  }
}

async function harvestAll(): Promise<void> {
  log('🌾 Harvesting all crops...');

  // Get garden tiles
  const gardenAtom = getAtomByLabel('myDataAtom:garden.tileObjects');
  if (!gardenAtom) return;

  const tiles = await readAtomValue(gardenAtom);

  for (const [index, tile] of Object.entries(tiles)) {
    if (tile.objectType === 'plant' && tile.maturedAt) {
      // Trigger harvest action
      const harvestAtom = getAtomByLabel('harvestCropAtom');
      if (harvestAtom) {
        await writeAtomValue(harvestAtom, { tileIndex: parseInt(index) });
        await sleep(100);  // Delay between harvests
      }
    }
  }

  log('✅ Harvest complete');
}

function saveConfig(): void {
  storage.set('harvestAll:config', config);
}
```

#### Step 2: Add UI Configuration

```typescript
// In mainPanel.ts
const keybindRow = KeybindCapture.createKeybindRow(
  '🌾 Harvest All',
  config.keybind,
  (keyData: KeybindData) => {
    setHarvestAllKeybind(keyData);
  },
  () => {
    clearHarvestAllKeybind();
  }
);
```

---

### How to Create a Modal/Overlay

**Example: Creating a "Crop Details" modal**

#### Step 1: Create Modal Component

```typescript
// src/ui/cropDetailsModal.ts
import { addStyle } from '../utils/dom';

const MODAL_STYLE_ID = 'qpm-crop-modal-styles';

export function createCropDetailsModal(cropData: any): HTMLElement {
  ensureStyles();

  const backdrop = document.createElement('div');
  backdrop.className = 'qpm-modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'qpm-modal';

  const header = document.createElement('div');
  header.className = 'qpm-modal-header';
  header.textContent = `${cropData.species} Details`;

  const closeButton = document.createElement('button');
  closeButton.className = 'qpm-modal-close';
  closeButton.textContent = '✕';
  closeButton.onclick = () => backdrop.remove();

  header.appendChild(closeButton);

  const body = document.createElement('div');
  body.className = 'qpm-modal-body';
  body.innerHTML = `
    <div><strong>Species:</strong> ${cropData.species}</div>
    <div><strong>Weight:</strong> ${cropData.weight}kg</div>
    <div><strong>Scale:</strong> ${cropData.scale}</div>
    <div><strong>Mutations:</strong> ${cropData.mutations.join(', ') || 'None'}</div>
    <div><strong>Value:</strong> ${calculateCropValue(cropData)} coins</div>
  `;

  modal.append(header, body);
  backdrop.appendChild(modal);

  // Close on backdrop click
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  // Close on Escape
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      backdrop.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  document.body.appendChild(backdrop);
  return backdrop;
}

function ensureStyles(): void {
  if (document.getElementById(MODAL_STYLE_ID)) return;

  addStyle(`
    .qpm-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .qpm-modal {
      background: rgba(0, 0, 0, 0.95);
      border: 1px solid #555;
      border-radius: 8px;
      padding: 0;
      min-width: 400px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      color: #fff;
      font-family: Arial, sans-serif;
    }

    .qpm-modal-header {
      padding: 12px 16px;
      border-bottom: 1px solid #444;
      font-size: 14px;
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .qpm-modal-close {
      background: none;
      border: none;
      color: #fff;
      font-size: 18px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
    }

    .qpm-modal-close:hover {
      color: #f44336;
    }

    .qpm-modal-body {
      padding: 16px;
      font-size: 12px;
      line-height: 1.6;
    }

    .qpm-modal-body > div {
      margin-bottom: 8px;
    }
  `).id = MODAL_STYLE_ID;
}
```

#### Step 2: Trigger Modal

```typescript
// Anywhere in your code
const cropData = {
  species: 'Watermelon',
  weight: 12.5,
  scale: 92,
  mutations: ['Rainbow', 'Frozen']
};

createCropDetailsModal(cropData);
```

---

### How to Highlight Specific Crops in the Garden

**Example: Highlighting all Rainbow crops**

#### Step 1: Create Overlay System

```typescript
// src/ui/gardenHighlightOverlay.ts (already exists, extend it)
export function highlightRainbowCrops(): void {
  // Get all garden tiles
  const gardenAtom = getAtomByLabel('myDataAtom:garden.tileObjects');
  if (!gardenAtom) return;

  readAtomValue(gardenAtom).then((tiles) => {
    for (const [index, tile] of Object.entries(tiles)) {
      if (tile.objectType === 'plant' && tile.mutations?.includes('Rainbow')) {
        highlightTile(parseInt(index), '#FF00FF', '3px');
      }
    }
  });
}

function highlightTile(tileIndex: number, color: string, borderWidth: string): void {
  // Convert tile index to screen coordinates
  const coords = getTileScreenCoordinates(tileIndex);
  if (!coords) return;

  const overlay = getOrCreateOverlay();

  const highlight = document.createElement('div');
  highlight.style.cssText = `
    position: absolute;
    left: ${coords.x}px;
    top: ${coords.y}px;
    width: 64px;
    height: 64px;
    border: ${borderWidth} solid ${color};
    border-radius: 8px;
    pointer-events: none;
    animation: qpm-pulse 1.5s infinite;
  `;

  overlay.appendChild(highlight);
}

function getTileScreenCoordinates(tileIndex: number): { x: number; y: number } | null {
  // This requires analyzing the game's garden layout
  // You may need to read canvas positions or use game atoms
  // Example placeholder:
  const row = Math.floor(tileIndex / 10);
  const col = tileIndex % 10;

  return {
    x: 100 + col * 70,
    y: 200 + row * 70
  };
}
```

---

### How to Add a New Notification Type

**Example: Adding "Egg Hatched" notifications**

#### Step 1: Extend Notification System

```typescript
// src/core/notifications.ts
export type NotificationType = 'success' | 'warning' | 'error' | 'info' | 'egg';

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#f44336',
  info: '#2196F3',
  egg: '#9C27B0'  // New type
};

export function showNotification(
  message: string,
  type: NotificationType = 'info',
  duration: number = 3000
): void {
  const notification = document.createElement('div');
  notification.className = 'qpm-notification';
  notification.textContent = message;
  notification.style.background = NOTIFICATION_COLORS[type];

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, duration);
}
```

#### Step 2: Use New Notification

```typescript
// In your feature
import { showNotification } from '../core/notifications';

function handleEggHatch(eggData: any): void {
  showNotification(
    `🥚 ${eggData.petSpecies} hatched! (STR ${eggData.strength})`,
    'egg',
    5000
  );
}
```

---

## 13. Build & Distribution

### Local Development Workflow

#### Initial Setup

```bash
# Clone repository
git clone https://github.com/yourusername/MGQPM.git
cd MGQPM

# Install dependencies
npm install

# Start development build (watch mode)
npm run dev
```

#### Development Cycle

1. **Edit Source Files**
   - Modify files in `src/`
   - Vite automatically rebuilds on save

2. **Test in Browser**
   - Install Tampermonkey extension
   - Create new userscript
   - Point to local build: `file:///path/to/MGQPM/dist/userscript.js`
   - Or use development server

3. **Check Build Output**
   - `dist/quinoa-pet-manager.iife.js` - Main bundle
   - `dist/userscript.js` - Tampermonkey script with headers

4. **Debugging**
   - Open browser console (F12)
   - Look for QPM logs (prefixed with emoji)
   - Use `debugListAtoms()` in console
   - Check localStorage: `localStorage.getItem('quinoa-pet-manager')`

#### Hot Reload Development

```typescript
// Add to main.ts for quick reload
if (import.meta.env.DEV) {
  // @ts-ignore
  window.qpmReload = () => location.reload();
  log('🔧 Dev mode: Use qpmReload() to refresh');
}

// In console: qpmReload()
```

### Building for Production

#### Version Bumping

```bash
# Update version in package.json
npm version patch  # 3.3.7 -> 3.3.8
npm version minor  # 3.3.8 -> 3.4.0
npm version major  # 3.4.0 -> 4.0.0
```

#### Build Commands

```bash
# Production build
npm run build

# Build userscript with headers
npm run build:userscript

# Complete build (both)
npm run build:dist
```

#### Build Output Verification

```bash
# Check bundle size
ls -lh dist/quinoa-pet-manager.iife.js

# Verify userscript headers
head -n 20 dist/userscript.js

# Expected headers:
# // ==UserScript==
# // @name         Quinoa Pet Manager
# // @version      3.3.7
# // @match        https://magiccircle.gg/*
# // ...
```

### Pre-Release Checklist

- [ ] All features tested manually
- [ ] No console errors in normal usage
- [ ] Version number updated in `package.json`
- [ ] `CHANGELOG.md` updated (if exists)
- [ ] Build succeeds: `npm run build:dist`
- [ ] Userscript headers are correct
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] localStorage migrations tested (if schema changed)
- [ ] Works with latest game version

### Distribution Methods

#### 1. GitHub Releases

```bash
# Create git tag
git tag -a v3.3.8 -m "Release v3.3.8"
git push origin v3.3.8

# Attach dist/userscript.js to GitHub release
# Users install from: https://github.com/user/repo/releases/latest
```

#### 2. Greasyfork / OpenUserJS

- Upload `dist/userscript.js`
- Auto-updates work via `@updateURL` header

#### 3. Direct Download

- Host `dist/userscript.js` on GitHub Pages
- Users install from raw URL

### Installation Instructions for End Users

```markdown
## Installation

1. **Install Tampermonkey**
   - Chrome: [Chrome Web Store](https://chrome.google.com/webstore)
   - Firefox: [Firefox Add-ons](https://addons.mozilla.org)
   - Edge: [Edge Add-ons](https://microsoftedge.microsoft.com/addons)

2. **Install QPM Script**
   - Click: [Install QPM](https://github.com/user/repo/raw/main/dist/userscript.js)
   - Tampermonkey will open - click "Install"

3. **Play Magic Garden**
   - Visit https://magiccircle.gg or https://magicgarden.gg
   - QPM panel appears bottom-right corner
   - Configure features in the panel

## Updating

QPM auto-updates via Tampermonkey (checks every 24 hours).

Manual update:
1. Open Tampermonkey dashboard
2. Find "Quinoa Pet Manager"
3. Click "Last updated" → "Check for update"
```

### Versioning Strategy

Follow Semantic Versioning (semver):

- **Major** (4.0.0): Breaking changes, major rewrites
- **Minor** (3.4.0): New features, backwards compatible
- **Patch** (3.3.8): Bug fixes, small improvements

### Build Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts',
      name: 'QuinoaPetManager',
      fileName: 'quinoa-pet-manager',
      formats: ['iife']
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false  // Keep console.logs for debugging
      }
    }
  },
  plugins: [
    dts()  // Generate .d.ts files
  ]
});
```

---

## 14. Example Atom Data Structures

Understanding what actual atom values look like helps when developing features.

### myInventoryAtom

```typescript
{
  items: [
    {
      id: "crop_abc123",
      itemId: "crop_abc123",
      itemType: "Crop",
      species: "Watermelon",
      name: null,
      displayName: "Watermelon",
      quantity: 1,
      mutations: ["Rainbow", "Frozen"],
      scale: 87,
      weight: 11.53,
      plantedAt: 1699123456789,
      maturedAt: 1699123876543
    },
    {
      id: "seed_def456",
      itemType: "Seed",
      species: "Pumpkin",
      quantity: 5,
      mutations: []
    }
  ],
  favoritedItemIds: ["crop_abc123"],
  capacity: 200
}
```

### myPetHutchPetItemsAtom

```typescript
[
  {
    id: "pet_xyz789",
    petId: "pet_xyz789",
    petSpecies: "Turtle",
    name: "Speedy",
    hunger: 87.5,
    xp: 45230,
    strength: 94,
    mutations: ["Golden"],
    abilities: [
      "Plant Growth Boost II",
      "Egg Growth Boost II",
      "Hunger Boost II",
      "Hunger Restore II"
    ],
    age: 1699000000000
  },
  {
    id: "pet_uvw012",
    petSpecies: "Butterfly",
    name: null,
    hunger: 42.3,
    xp: 12500,
    strength: 61,
    mutations: [],
    abilities: [
      "Crop Size Boost II",
      "Crop Mutation Boost II"
    ]
  }
]
```

### myPetSlotInfosAtom (Active Pets)

```typescript
[
  {
    slotIndex: 0,
    slot: {
      id: "pet_xyz789",
      petSpecies: "Turtle",
      name: "Speedy",
      hunger: 87.5,
      xp: 45230,
      strength: 94,
      abilities: ["Plant Growth Boost II", "Egg Growth Boost II"]
    },
    status: "active"
  },
  {
    slotIndex: 1,
    slot: {
      id: "pet_abc234",
      petSpecies: "Butterfly",
      hunger: 23.1,
      xp: 8900,
      strength: 67,
      abilities: ["Crop Size Boost II"]
    },
    status: "active"
  },
  {
    slotIndex: 2,
    slot: null,  // Empty slot
    status: "inactive"
  }
]
```

### myDataAtom:garden.tileObjects

```typescript
{
  "0": {
    objectType: "plant",
    species: "Watermelon",
    plantedAt: 1699123456789,
    maturedAt: 1699123876543,
    scale: 87,
    weight: 11.53,
    mutations: ["Rainbow", "Frozen"],
    growthStage: "mature"
  },
  "1": {
    objectType: "egg",
    eggId: "Turtle",
    plantedAt: 1699120000000,
    hatchesAt: 1699130000000
  },
  "2": {
    objectType: "empty"
  },
  "3": {
    objectType: "plant",
    species: "Pumpkin",
    plantedAt: 1699125000000,
    maturedAt: null,  // Still growing
    scale: 65,
    mutations: []
  }
  // ... up to slot 99 or 199 depending on garden size
}
```

### weatherAtom

```typescript
{
  current: "rain",
  lastChange: 1699123456789,
  nextEventTime: 1699124556789,  // Estimated
  eventType: "rain",
  isLunar: false
}
```

### shopsAtom

```typescript
{
  seed: {
    inventory: [
      {
        species: "Watermelon",
        price: 2500,
        initialStock: 5,
        canSpawnHere: true
      },
      {
        species: "Starweaver",
        price: 1000000000,
        initialStock: 1,
        canSpawnHere: true
      }
    ],
    secondsUntilRestock: 287
  },
  egg: {
    inventory: [
      {
        eggId: "Legendary",
        price: 500000,
        initialStock: 3,
        canSpawnHere: true
      }
    ],
    secondsUntilRestock: 287
  },
  tool: {
    inventory: [],
    secondsUntilRestock: 287
  },
  decor: {
    inventory: [],
    secondsUntilRestock: 287
  }
}
```

### myShopPurchasesAtom

```typescript
{
  seed: {
    purchases: {
      "Watermelon": 12,
      "Pumpkin": 5,
      "Starweaver": 1
    }
  },
  egg: {
    purchases: {
      "Legendary": 2,
      "Mythical": 1
    }
  },
  tool: {
    purchases: {}
  },
  decor: {
    purchases: {}
  }
}
```

### playerAtom

```typescript
{
  id: "player_12345",
  displayName: "CoolGardener",
  username: "coolgardener",
  name: "CoolGardener",
  coins: 45678900,
  level: 42,
  donuts: 150,
  experience: 125000,
  achievements: ["first_plant", "rainbow_collector"],
  settings: {
    volume: 0.5,
    notifications: true
  }
}
```

---

## 15. Common Troubleshooting Scenarios

### "Keybinds Not Working"

**Symptoms**: Pressing configured keybind doesn't trigger action

**Causes & Solutions**:

1. **Event propagation blocked**
   ```typescript
   // ❌ Wrong: game captures event first
   document.addEventListener('keydown', handler);

   // ✅ Correct: capture phase
   document.addEventListener('keydown', handler, true);
   ```

2. **Input field focused**
   ```typescript
   function handleKeydown(event: KeyboardEvent): void {
     // Ignore if user is typing
     const target = event.target as HTMLElement;
     if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
       return;
     }

     // Handle keybind...
   }
   ```

3. **Keybind data not saved**
   ```typescript
   // Check storage
   const saved = storage.get('feature:config', {});
   console.log('Saved keybind:', saved.keybind);
   ```

4. **Wrong key matching**
   ```typescript
   // event.key values can be tricky
   // 'Escape' not 'Esc'
   // 'ArrowUp' not 'Up'
   // ' ' for space, not 'Space'
   ```

### "UI Disappeared After Update"

**Symptoms**: Panel not visible after game or script update

**Causes & Solutions**:

1. **Z-index conflict**
   ```typescript
   // Game may have increased z-index
   // Check current game UI z-index
   const gameUI = document.querySelector('.game-hud');
   console.log(window.getComputedStyle(gameUI).zIndex);

   // Update QPM z-index to be higher
   panel.style.zIndex = '2147483647';
   ```

2. **Position off-screen**
   ```typescript
   // Clear saved position
   storage.remove('qpm-panel-position');
   location.reload();
   ```

3. **CSS not injected**
   ```typescript
   // Check if style element exists
   const styles = document.getElementById('qpm-main-panel-styles');
   if (!styles) {
     console.log('❌ Styles not injected!');
     ensureStyles();
   }
   ```

4. **Game structure changed**
   ```typescript
   // Game may have changed HUD structure
   const hudRoot = getGameHudRoot();
   console.log('HUD root:', hudRoot);

   // Update selector if needed
   ```

### "Atoms Returning Stale Data"

**Symptoms**: Feature shows outdated information

**Causes & Solutions**:

1. **Need to re-subscribe after navigation**
   ```typescript
   // Listen for navigation events
   let unsubscribe: (() => void) | null = null;

   function setupSubscription(): void {
     unsubscribe?.();  // Clean up old subscription

     const atom = getAtomByLabel('myInventoryAtom');
     subscribeAtom(atom, handler).then(unsub => {
       unsubscribe = unsub;
     });
   }

   // Re-setup on route change
   window.addEventListener('popstate', setupSubscription);
   ```

2. **Caching atom reference**
   ```typescript
   // ❌ Wrong: cache can become stale
   const atom = getAtomByLabel('myInventoryAtom');
   setInterval(() => {
     readAtomValue(atom);  // May not work after navigation
   }, 1000);

   // ✅ Correct: fresh lookup
   setInterval(() => {
     const atom = getAtomByLabel('myInventoryAtom');
     if (atom) readAtomValue(atom);
   }, 1000);
   ```

3. **Not handling null values**
   ```typescript
   subscribeAtom(atom, (value) => {
     if (!value) return;  // ✅ Guard against null
     // Process value...
   });
   ```

### "Feature Stops Working After Page Reload"

**Symptoms**: Feature works initially but not after F5

**Causes & Solutions**:

1. **Event listeners not re-attached**
   ```typescript
   // Ensure initialization runs on load
   if (document.readyState === 'complete') {
     initialize();
   } else {
     window.addEventListener('load', initialize);
   }
   ```

2. **localStorage not loaded**
   ```typescript
   // Load config at startup
   export function startFeature(): void {
     config = storage.get('feature:config', DEFAULT_CONFIG);
     // Then setup feature...
   }
   ```

3. **Atoms not re-captured**
   ```typescript
   // Wait for atom cache to be ready
   await waitForAtomCache();
   const atom = getAtomByLabel('targetAtom');
   ```

### "Cannot Read Property of Undefined"

**Symptoms**: Errors like `Cannot read property 'items' of undefined`

**Causes & Solutions**:

1. **Optional chaining**
   ```typescript
   // ❌ Unsafe
   const items = inventory.items;

   // ✅ Safe
   const items = inventory?.items ?? [];
   ```

2. **Type guards**
   ```typescript
   function processInventory(data: any): void {
     if (!data || !Array.isArray(data.items)) {
       log('⚠️ Invalid inventory data');
       return;
     }

     // Safe to use data.items
   }
   ```

3. **Validate atom values**
   ```typescript
   subscribeAtom(atom, (value) => {
     if (!value || typeof value !== 'object') {
       log('⚠️ Unexpected atom value:', value);
       return;
     }

     // Process valid value
   });
   ```

### "Jotai Store Capture Fails"

**Symptoms**: `getCapturedInfo().hasStore === false`

**Causes & Solutions**:

1. **Game not fully loaded**
   ```typescript
   // Wait longer for game initialization
   await waitForGame();
   await sleep(2000);  // Extra delay

   const store = await ensureJotaiStore();
   ```

2. **React DevTools not available**
   ```typescript
   // Check if hook exists
   const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
   if (!hook) {
     log('⚠️ React DevTools hook not found');
     // Will fall back to write hook method
   }
   ```

3. **Using polyfill mode**
   ```typescript
   // Check capture mode
   const info = getCapturedInfo();
   if (info.mode === 'polyfill') {
     log('⚠️ Using polyfill mode - limited functionality');
     // Some features may not work
   }
   ```

### "High Memory Usage"

**Symptoms**: Browser slows down over time

**Causes & Solutions**:

1. **Memory leaks from subscriptions**
   ```typescript
   // ❌ Never unsubscribe
   subscribeAtom(atom, handler);

   // ✅ Clean up when feature disabled
   let unsub: (() => void) | null = null;

   export function setEnabled(enabled: boolean): void {
     if (!enabled && unsub) {
       unsub();
       unsub = null;
     }
   }
   ```

2. **Unbounded arrays**
   ```typescript
   // ❌ Grows forever
   feedHistory.push(record);

   // ✅ Limit size
   feedHistory.unshift(record);
   if (feedHistory.length > 100) feedHistory.pop();
   ```

3. **DOM elements not removed**
   ```typescript
   // ✅ Remove old elements
   const oldOverlay = document.getElementById('qpm-overlay');
   oldOverlay?.remove();

   const newOverlay = createOverlay();
   document.body.appendChild(newOverlay);
   ```

---

## 16. Game Update Handling

### What to Check When Game Updates

#### 1. Atom Label Changes

```typescript
// List all atoms to find changes
function compareAtomLabels(): void {
  const cache = (window as any).jotaiAtomCache?.cache;
  if (!cache) return;

  const currentLabels: string[] = [];
  for (const atom of cache.values()) {
    const label = atom?.debugLabel || atom?.label || '';
    if (label) currentLabels.push(label);
  }

  currentLabels.sort();
  console.log('Current atom labels:', currentLabels);

  // Compare with known labels (from this guide)
  const knownLabels = [
    'myInventoryAtom',
    'myPetHutchPetItemsAtom',
    // ... etc
  ];

  const newLabels = currentLabels.filter(l => !knownLabels.includes(l));
  const removedLabels = knownLabels.filter(l => !currentLabels.includes(l));

  console.log('New atoms:', newLabels);
  console.log('Removed atoms:', removedLabels);
}
```

#### 2. Atom Structure Changes

```typescript
// Inspect atom value structure
async function inspectAtomStructure(label: string): Promise<void> {
  const atom = getAtomByLabel(label);
  if (!atom) {
    console.log(`❌ Atom not found: ${label}`);
    return;
  }

  const value = await readAtomValue(atom);
  console.log(`Structure of ${label}:`, value);

  // Check for expected properties
  if (label === 'myInventoryAtom') {
    console.log('Has items?', Array.isArray(value?.items));
    console.log('Has favoritedItemIds?', Array.isArray(value?.favoritedItemIds));
  }
}
```

#### 3. Game UI Changes

```typescript
// Check if UI selectors still work
function verifyGameUISelectors(): void {
  const selectors = {
    'App root': '#App',
    'Canvas': 'canvas',
    'HUD root': '[data-tm-hud-root]',
    'Pet panel': '[data-pet-panel]',
    'Inventory': '[data-inventory-panel]'
  };

  for (const [name, selector] of Object.entries(selectors)) {
    const element = document.querySelector(selector);
    console.log(`${element ? '✅' : '❌'} ${name}: ${selector}`);
  }
}
```

### Backwards Compatibility Strategies

#### Graceful Degradation

```typescript
// Support both old and new atom labels
function getInventoryAtom() {
  // Try new label first
  let atom = getAtomByLabel('myInventoryAtom_v2');

  // Fall back to old label
  if (!atom) {
    atom = getAtomByLabel('myInventoryAtom');
  }

  return atom;
}
```

#### Schema Versioning

```typescript
// Handle different data formats
function parseInventoryItem(item: any): InventoryItem {
  // New format (v2)
  if (item.version === 2) {
    return {
      id: item.uid,
      species: item.cropType,
      mutations: item.mods || []
    };
  }

  // Old format (v1)
  return {
    id: item.id,
    species: item.species,
    mutations: item.mutations || []
  };
}
```

#### Feature Flags

```typescript
// Disable features if dependencies unavailable
const FEATURES = {
  autoFeed: {
    required: ['myPetSlotInfosAtom', 'myInventoryAtom'],
    available: false
  },
  weatherSwap: {
    required: ['weatherAtom'],
    available: false
  }
};

function checkFeatureAvailability(): void {
  for (const [name, feature] of Object.entries(FEATURES)) {
    feature.available = feature.required.every(label =>
      getAtomByLabel(label) !== null
    );

    if (!feature.available) {
      log(`⚠️ Feature unavailable: ${name}`);
    }
  }
}
```

### Update Testing Checklist

After a game update:

- [ ] Run `compareAtomLabels()` to check for changes
- [ ] Test each feature manually
- [ ] Check browser console for errors
- [ ] Verify UI still renders correctly
- [ ] Test keybinds still work
- [ ] Verify localStorage persistence
- [ ] Check notification system works
- [ ] Test with Aries Mod enabled (compatibility)
- [ ] Confirm no performance degradation

### Communicating Updates to Users

```typescript
// Version check and migration
const CURRENT_VERSION = '3.3.8';
const LAST_VERSION_KEY = 'qpm:lastVersion';

function checkVersionUpdate(): void {
  const lastVersion = storage.get(LAST_VERSION_KEY, '0.0.0');

  if (lastVersion !== CURRENT_VERSION) {
    log(`📦 Updated from v${lastVersion} to v${CURRENT_VERSION}`);

    // Show changelog
    showNotification(
      `QPM updated to v${CURRENT_VERSION}! Check panel for new features.`,
      'info',
      5000
    );

    // Run migrations if needed
    runMigrations(lastVersion, CURRENT_VERSION);

    storage.set(LAST_VERSION_KEY, CURRENT_VERSION);
  }
}
```

---

## 17. Code Review Checklist

Use this checklist before committing code:

### General Code Quality

- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] No unused imports or variables
- [ ] Functions have clear, descriptive names
- [ ] Complex logic has explanatory comments
- [ ] No hardcoded magic numbers (use constants)
- [ ] Error handling with try-catch where appropriate
- [ ] Logging uses emoji prefixes for clarity

### Feature Implementation

- [ ] Feature module follows pattern (config, getters, setters)
- [ ] Configuration has sensible defaults
- [ ] State is private (closure pattern)
- [ ] Exports only public API functions
- [ ] Gracefully handles missing atoms/data
- [ ] Unsubscribes when feature disabled
- [ ] No polling faster than 1000ms

### UI Implementation

- [ ] Follows color palette consistently
- [ ] Uses correct font sizes (10-14px)
- [ ] Spacing uses 6-8px gaps
- [ ] Button states (enabled/disabled) work
- [ ] Loading states show feedback
- [ ] Collapsible sections persist state
- [ ] No inline styles (use CSS classes)
- [ ] Draggable elements save position

### Storage & Persistence

- [ ] Keys are namespaced (`feature:dataType`)
- [ ] Default values provided for all storage.get()
- [ ] Config saves on every change
- [ ] Migration path for schema changes
- [ ] No unbounded growth (arrays capped)
- [ ] Sensitive data not stored (if applicable)

### Game Integration

- [ ] Waits for game initialization
- [ ] Atoms validated before use
- [ ] Handles null/undefined gracefully
- [ ] No canvas modifications (except safe overlays)
- [ ] No direct React component manipulation
- [ ] Uses Jotai for game state access
- [ ] Optional chaining (`?.`) for safety

### Performance

- [ ] No synchronous sleep/busy-wait
- [ ] Debouncing for rapid events
- [ ] Subscription cleanup on disable
- [ ] DOM operations batched
- [ ] Expensive calculations cached
- [ ] No memory leaks (verified)

### Testing

- [ ] Tested with feature enabled
- [ ] Tested with feature disabled
- [ ] Tested after page reload
- [ ] Tested with empty/missing data
- [ ] Tested alongside Aries Mod
- [ ] No console errors in normal use

### Documentation

- [ ] Public functions have JSDoc comments
- [ ] Complex algorithms explained
- [ ] This guide updated if needed
- [ ] README updated for new features
- [ ] Changelog entry added (if applicable)

---

## 18. Integration with Aries Mod

QPM is designed to run **alongside** Aries Mod. Here's how to ensure compatibility and leverage its features.

### Features We Can Use/Integrate With

#### 1. **Keybind System**

Aries Mod has a comprehensive keybind manager. We can:

```typescript
// Listen for Aries Mod keybind events
window.addEventListener('ariesKeybind', (event: CustomEvent) => {
  const { action, data } = event.detail;

  if (action === 'teamSwap') {
    // Aries just swapped teams - update our pet tracking
    refreshActivePets();
  }
});
```

**Respect Aries keybinds**: Don't conflict with common bindings:
- `Ctrl+1-7` - Aries tab navigation
- `F` - Common weather swap key
- `Alt+S/E/T/D` - Shop shortcuts

#### 2. **Pet Team Presets**

Aries Mod allows saving pet team configurations. We can:

```typescript
// Detect when Aries swaps team
let lastTeamSnapshot = '';

setInterval(() => {
  const currentTeam = getCurrentPetTeam();
  const teamSignature = currentTeam.map(p => p.id).join(',');

  if (teamSignature !== lastTeamSnapshot) {
    log('🔄 Team changed (likely Aries swap)');
    onTeamChange(currentTeam);
    lastTeamSnapshot = teamSignature;
  }
}, 1000);
```

**Best Practice**: Don't fight Aries for pet management. Let Aries handle team swapping, QPM handles feeding/tracking.

#### 3. **Room Monitoring**

Aries tracks player counts across rooms. We could:

```typescript
// Access Aries room data (if they expose it)
const ariesData = (window as any).ariesModData;
if (ariesData?.rooms) {
  const currentRoom = ariesData.rooms.current;
  const playerCount = currentRoom.playerCount;

  // Use for friend bonus calculations
  updateFriendBonus(playerCount);
}
```

#### 4. **Shop Restock Notifications**

Aries shows shop restock alerts. Coordinate with this:

```typescript
// Don't duplicate Aries notifications
const ARIES_ACTIVE = !!(window as any).ariesMod;

function notifyShopRestock(category: string): void {
  if (ARIES_ACTIVE) {
    // Aries already shows notification - just log
    log(`🛒 ${category} shop restocked`);
  } else {
    // We're solo - show our notification
    showNotification(`${category} shop restocked!`, 'info');
  }
}
```

#### 5. **Statistics Dashboard**

Aries tracks session stats (planted, harvested, etc.). We can complement:

- **Aries tracks**: Garden actions, shop purchases, hatches
- **QPM tracks**: Feed events, weather swaps, ability procs

Don't duplicate - focus on pet-specific stats Aries doesn't cover.

#### 6. **Instant Feed Button**

Aries injects "Feed Instant" buttons. We can:

```typescript
// Enhance Aries feed buttons with our logic
function enhanceAriesFeedButtons(): void {
  const feedButtons = document.querySelectorAll('.aries-feed-button');

  feedButtons.forEach(button => {
    // Already enhanced?
    if (button.dataset.qpmEnhanced) return;
    button.dataset.qpmEnhanced = 'true';

    // Intercept click
    button.addEventListener('click', (e) => {
      const petId = button.dataset.petId;
      log(`🍖 Feed initiated via Aries for pet ${petId}`);

      // Update our tracking
      recordFeedEvent(petId);
    }, true);  // Capture phase
  });
}
```

### Compatibility Guidelines

#### DOM Injection Coordination

```typescript
// Check if Aries already injected something
function safeInject(selector: string, createFn: () => HTMLElement): void {
  const existing = document.querySelector(selector);

  // Aries might have already injected
  if (existing && existing.dataset.source === 'aries') {
    log(`⚠️ Aries already injected ${selector}, skipping`);
    return;
  }

  const element = createFn();
  element.dataset.source = 'qpm';
  document.body.appendChild(element);
}
```

#### Shared localStorage Namespace

```typescript
// Don't conflict with Aries storage keys
// Aries uses: 'aries:*'
// QPM uses: 'qpm:*' or 'quinoa-*'

// ✅ Safe
storage.set('qpm:autoFeed:config', config);

// ❌ Dangerous
storage.set('config', config);  // Could conflict!
```

#### Z-Index Management

```typescript
// Aries mod uses z-index: 999999
// QPM should use higher for modals, lower for panels

const Z_INDEX = {
  ariesMod: 999999,          // Aries main UI
  qpmPanel: 2147483647,      // QPM panel (max safe value)
  qpmModal: 2147483646,      // QPM modals (just below panel)
  qpmOverlay: 1000           // QPM overlays (below game)
};
```

#### Event Coordination

```typescript
// Dispatch events Aries might listen for
function notifyAriesOfAction(action: string, data: any): void {
  window.dispatchEvent(new CustomEvent('qpmAction', {
    detail: { action, data }
  }));
}

// Example: notify after auto-feed
feedPet(petId).then(() => {
  notifyAriesOfAction('petFed', { petId, timestamp: Date.now() });
});
```

### Testing with Aries Mod

Always test QPM with Aries Mod enabled:

```bash
# Test checklist with Aries
- [ ] Both scripts load without errors
- [ ] No keybind conflicts
- [ ] UI panels don't overlap
- [ ] No duplicate notifications
- [ ] Performance is acceptable
- [ ] Both can inject UI elements
- [ ] localStorage doesn't conflict
```

### Learning from Aries Patterns

**Good patterns to adopt**:

1. **Draggable Windows**: Aries has excellent drag implementation
2. **Hotkey Capture**: Their keybind UI is user-friendly
3. **Settings Persistence**: Window positions/states saved
4. **Modular Panels**: Each feature in its own collapsible section
5. **Debug Tools**: WebSocket inspector, sprite explorer

**Implementation reference**:
```typescript
// Aries-style draggable (simplified)
function makeAriesDraggable(element: HTMLElement, handle: HTMLElement): void {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.style.cursor = 'grab';

  handle.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - element.offsetLeft;
    offsetY = e.clientY - element.offsetTop;
    handle.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    element.style.left = `${e.clientX - offsetX}px`;
    element.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      handle.style.cursor = 'grab';

      // Save position (Aries pattern)
      storage.set('element:position', {
        left: element.offsetLeft,
        top: element.offsetTop
      });
    }
  });
}
```

---

## 19. Inspiration from MGTools

While we don't use MGTools directly, it has excellent patterns worth learning from.

### Features Worth Considering

#### 1. **Pet Loadout Hotkeys**

MGTools allows Ctrl+1-7 for instant pet team swaps. We could add similar:

```typescript
// Quick loadout system
const LOADOUT_KEYS = ['1', '2', '3', '4', '5'];

interface Loadout {
  name: string;
  petIds: string[];
}

const loadouts: Record<string, Loadout> = storage.get('qpm:loadouts', {});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && LOADOUT_KEYS.includes(e.key)) {
    const loadout = loadouts[e.key];
    if (loadout) {
      applyLoadout(loadout);
      showNotification(`Applied loadout: ${loadout.name}`);
    }
  }
});
```

#### 2. **Turtle Timer with Hover Display**

MGTools shows countdown when hovering crops. Useful pattern:

```typescript
// Inject tooltip on hover
canvas.addEventListener('mousemove', (e) => {
  const tileIndex = getTileAtPosition(e.clientX, e.clientY);
  if (tileIndex === null) return;

  const tile = getTileData(tileIndex);
  if (!tile || tile.objectType !== 'plant') return;

  const timeRemaining = calculateGrowTimeRemaining(tile);

  showTooltip(e.clientX, e.clientY, `
    <div>${tile.species}</div>
    <div>Ready in: ${formatTime(timeRemaining)}</div>
  `);
});
```

#### 3. **Theme System**

MGTools has 15+ themes with customization. Consider:

```typescript
interface Theme {
  name: string;
  colors: {
    background: string;
    text: string;
    accent: string;
  };
}

const THEMES: Record<string, Theme> = {
  default: {
    name: 'Default',
    colors: {
      background: 'rgba(0, 0, 0, 0.85)',
      text: '#fff',
      accent: '#4CAF50'
    }
  },
  ocean: {
    name: 'Ocean',
    colors: {
      background: 'rgba(0, 50, 100, 0.85)',
      text: '#E1F5FE',
      accent: '#00BCD4'
    }
  }
};

function applyTheme(themeName: string): void {
  const theme = THEMES[themeName];
  if (!theme) return;

  document.documentElement.style.setProperty('--qpm-bg', theme.colors.background);
  document.documentElement.style.setProperty('--qpm-text', theme.colors.text);
  document.documentElement.style.setProperty('--qpm-accent', theme.colors.accent);

  storage.set('qpm:theme', themeName);
}
```

#### 4. **Alt+B Quick Shop Access**

MGTools uses Alt+B for instant shop browsing. Useful pattern:

```typescript
// Quick shop overlay
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'b') {
    e.preventDefault();
    showQuickShop();
  }
});

function showQuickShop(): void {
  const modal = createCropDetailsModal({
    // Shop data
  });

  // Render shop items with stock counts
  // ...
}
```

#### 5. **Crop Protection System**

MGTools locks crops by species/mutation. Good safety pattern:

```typescript
interface ProtectionRules {
  species: string[];        // Protect all Watermelon
  mutations: string[];      // Protect all Rainbow
  minScale: number;         // Protect if scale >= 90
}

const protection: ProtectionRules = storage.get('qpm:protection', {
  species: [],
  mutations: ['Rainbow', 'Golden'],
  minScale: 90
});

function isProtected(crop: any): boolean {
  if (protection.species.includes(crop.species)) return true;
  if (crop.mutations.some((m: string) => protection.mutations.includes(m))) return true;
  if (crop.scale >= protection.minScale) return true;

  return false;
}

// Use before selling
function canSell(crop: any): boolean {
  if (isProtected(crop)) {
    showNotification('⚠️ Crop is protected from selling', 'warning');
    return false;
  }
  return true;
}
```

#### 6. **Export/Import Settings**

MGTools allows JSON backup/restore:

```typescript
// Export all QPM settings
function exportSettings(): string {
  const allSettings = {
    version: '3.3.8',
    timestamp: Date.now(),
    autoFeed: storage.get('autoFeed:config', {}),
    weatherSwap: storage.get('weatherSwap:config', {}),
    harvestReminder: storage.get('harvestReminder:config', {}),
    // ... all features
  };

  return JSON.stringify(allSettings, null, 2);
}

// Import settings
function importSettings(jsonString: string): void {
  try {
    const settings = JSON.parse(jsonString);

    // Validate version
    if (settings.version !== '3.3.8') {
      log('⚠️ Settings from different version, migrating...');
      // Run migrations
    }

    // Restore each feature
    storage.set('autoFeed:config', settings.autoFeed);
    storage.set('weatherSwap:config', settings.weatherSwap);
    // ... etc

    showNotification('✅ Settings imported successfully');
    location.reload();  // Apply changes

  } catch (error) {
    log('❌ Failed to import settings:', error);
    showNotification('❌ Import failed - invalid JSON', 'error');
  }
}

// UI buttons
const exportBtn = createButton('📤 Export Settings', () => {
  const json = exportSettings();
  navigator.clipboard.writeText(json);
  showNotification('📋 Settings copied to clipboard');
});

const importBtn = createButton('📥 Import Settings', () => {
  const json = prompt('Paste settings JSON:');
  if (json) importSettings(json);
});
```

### MGTools Code Patterns to Learn

#### Modular Design

MGTools separates concerns well:
- Each feature is a module
- Shared utilities in separate files
- Clear public/private boundaries

**Apply to QPM**:
```typescript
// features/exampleFeature/
//   ├── index.ts        (public API)
//   ├── config.ts       (configuration)
//   ├── state.ts        (internal state)
//   └── ui.ts           (UI components)
```

#### Smart Defaults

MGTools has sensible defaults that work for most users.

**Apply to QPM**:
```typescript
// Auto-detect optimal settings
function detectOptimalSettings(): AutoFeedConfig {
  const activePets = getActivePets();

  // If user has mostly high-hunger pets, lower threshold
  const avgHungerCap = activePets.reduce((sum, p) =>
    sum + (HUNGER_CAPS[p.species] || 100), 0
  ) / activePets.length;

  return {
    enabled: false,  // Always default to disabled
    threshold: avgHungerCap > 140 ? 30 : 40,  // Smart threshold
    retryDelayMs: 15000
  };
}
```

#### Graceful Performance

MGTools uses smart polling rates:
- 5s when UI visible
- 30s when UI hidden

**Apply to QPM**:
```typescript
let pollInterval = 5000;

document.addEventListener('visibilitychange', () => {
  pollInterval = document.hidden ? 30000 : 5000;
  log(`🔄 Poll interval: ${pollInterval}ms`);
});

setInterval(() => {
  if (!config.enabled) return;
  checkFeature();
}, pollInterval);
```

---

## 20. Native Game WebSocket Commands & Instant Feed

### 🔍 Overview

Magic Garden exposes **native WebSocket commands** that allow direct interaction with the game server, bypassing the UI entirely. These commands enable "silent" operations like instant feeding, harvesting, purchasing, etc.

**Discovery**: The Aries Mod `petPanelEnhancer.ts` uses these commands to create the silent "INSTANT FEED" button that feeds pets without opening the inventory modal.

---

### 🎮 MagicCircle_RoomConnection API

The game exposes a global WebSocket connection object that can send messages directly to the game server:

```typescript
// Accessing the game's WebSocket connection
declare global {
  interface Window {
    MagicCircle_RoomConnection?: {
      sendMessage(payload: any): void;
      // ...other methods
    };
    __mga_lastScopePath?: string[];
  }
}

// Send a command to the game server
function sendGameCommand(payload: { type: string; [key: string]: any }): void {
  const connection = window.MagicCircle_RoomConnection;
  if (!connection) {
    console.error('❌ MagicCircle_RoomConnection not available');
    return;
  }

  // Add scope path for routing (required)
  payload.scopePath = window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa'];

  connection.sendMessage(payload);
  console.log('✅ Sent game command:', payload);
}
```

**⚠️ Important Notes:**
- These are **native game commands**, not mod-specific
- They bypass UI validation but **not server validation**
- Invalid commands will be rejected by the server
- Use responsibly - these can trigger anti-cheat if misused

---

### 🍖 FeedPet Command (Instant Feed)

The `FeedPet` command feeds a pet instantly without opening the inventory modal.

#### **Syntax**

```typescript
interface FeedPetPayload {
  type: 'FeedPet';
  petItemId: string;    // The pet's inventory item ID
  cropItemId: string;   // The crop's inventory item ID
  scopePath?: string[]; // Auto-added: ['Room', 'Quinoa']
}
```

#### **Example Usage**

```typescript
// How Aries Mod implements instant feed
async function instantFeedPet(petItemId: string, cropItemId: string): Promise<void> {
  sendGameCommand({
    type: 'FeedPet',
    petItemId: petItemId,
    cropItemId: cropItemId
  });

  // Wait for game state to update
  await sleep(500);
}
```

#### **How It Works**

1. **Pet Detection**: Find the pet's inventory item ID from Jotai atoms or DOM
2. **Crop Selection**: Find compatible, non-favorited crop from inventory
3. **Send Command**: Call `sendGameCommand({ type: 'FeedPet', ... })`
4. **State Update**: Game server processes feed and updates Jotai atoms
5. **UI Refresh**: Game UI automatically updates to show new hunger level

**Key Advantage**: **Completely silent** - no modal, no animations, instant execution

---

### 📋 Known Game Commands

Based on analysis of Aries Mod's `ws-hook.ts` interceptor, these commands exist:

#### **Pet & Inventory Management**
```typescript
// Feed a pet with a crop
{ type: 'FeedPet', petItemId: string, cropItemId: string }

// Hatch an egg into a pet
{ type: 'HatchEgg', eggItemId: string, slotIndex?: number }

// Sell a pet
{ type: 'SellPet', petItemId: string }

// Sell all crops in batch
{ type: 'SellAllCrops', cropIds?: string[] }
```

#### **Garden Management**
```typescript
// Plant a seed in a garden slot
{ type: 'PlantSeed', seedItemId: string, slotId: string }

// Water a plant
{ type: 'WaterPlant', slotId: string, waterCanItemId: string }

// Harvest a crop from a slot
{ type: 'HarvestCrop', slotId: string }

// Remove a garden object (decor, plant, etc)
{ type: 'RemoveGardenObject', objectId: string }
```

#### **Shop Purchases**
```typescript
// Purchase a seed from shop
{ type: 'PurchaseSeed', seedId: string, quantity?: number }

// Purchase an egg from shop
{ type: 'PurchaseEgg', eggId: string, quantity?: number }

// Purchase a tool from shop
{ type: 'PurchaseTool', toolId: string, quantity?: number }

// Purchase decoration from shop
{ type: 'PurchaseDecor', decorId: string, quantity?: number }
```

**Note**: These payloads are simplified examples. Actual commands may have additional required fields.

---

### 🛠️ Console Commands for Discovery

Use these in the browser console to explore and test game commands:

#### **1. List Available Connection Methods**
```javascript
// See what's available on the game connection object
console.log(window.MagicCircle_RoomConnection);
console.dir(window.MagicCircle_RoomConnection);
```

#### **2. Monitor All WebSocket Messages**
```javascript
// Intercept and log all outgoing messages
(function() {
  const original = window.MagicCircle_RoomConnection.sendMessage;
  window.MagicCircle_RoomConnection.sendMessage = function(payload) {
    console.log('📤 Outgoing WebSocket Message:', payload);
    return original.call(this, payload);
  };
  console.log('✅ WebSocket monitor installed - perform game actions to see messages');
})();
```

#### **3. Test FeedPet Command**
```javascript
// WARNING: Only run if you have pets and crops!
// This will feed your first pet with your first crop
(async function() {
  try {
    // Get inventory atom
    const cache = window.jotaiAtomCache?.cache || window.jotaiAtomCache;
    if (!cache) {
      console.error('❌ Atom cache not found');
      return;
    }

    // Find inventory atom
    let inventoryAtom = null;
    for (const atom of cache.values()) {
      const label = atom?.debugLabel || atom?.label || '';
      if (label.includes('Inventory') || label.includes('inventory')) {
        inventoryAtom = atom;
        break;
      }
    }

    if (!inventoryAtom) {
      console.error('❌ Inventory atom not found');
      return;
    }

    // Get Jotai store (find in React fiber tree or window)
    const store = window.__qpmJotaiStore__;
    if (!store) {
      console.error('❌ Jotai store not found');
      return;
    }

    const inventory = store.get(inventoryAtom);
    const pets = inventory?.items?.filter(i => i.itemType === 'Pet') || [];
    const crops = inventory?.items?.filter(i => i.itemType === 'Crop') || [];

    if (pets.length === 0) {
      console.error('❌ No pets in inventory');
      return;
    }

    if (crops.length === 0) {
      console.error('❌ No crops in inventory');
      return;
    }

    const pet = pets[0];
    const crop = crops[0];

    console.log(`🍖 Feeding ${pet.name || pet.species || 'Pet'} with ${crop.name || crop.species || 'Crop'}`);

    // Send FeedPet command
    const payload = {
      type: 'FeedPet',
      petItemId: pet.id,
      cropItemId: crop.id,
      scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa']
    };

    window.MagicCircle_RoomConnection.sendMessage(payload);
    console.log('✅ FeedPet command sent!');

  } catch (error) {
    console.error('❌ Error testing FeedPet:', error);
  }
})();
```

#### **4. Discover All Atom Labels**
```javascript
// List all available Jotai atoms (useful for finding data sources)
(function() {
  const cache = window.jotaiAtomCache?.cache || window.jotaiAtomCache;
  if (!cache) {
    console.error('❌ Atom cache not found');
    return;
  }

  const atoms = [];
  for (const atom of cache.values()) {
    const label = atom?.debugLabel || atom?.label || '<unlabeled>';
    atoms.push(label);
  }

  console.log('📦 Available Atoms:', atoms.sort());
  console.log(`Total: ${atoms.length} atoms`);
})();
```

---

### 🎯 How Aries Mod's INSTANT FEED Works

Aries Mod's `petPanelEnhancer.ts` creates two buttons:
1. **"INSTANT FEED"** - Auto-selects first compatible crop
2. **"FEED FROM INVENTORY"** - Opens modal for manual selection

#### **Implementation Breakdown**

**1. Button Creation** (`createStyledButton`)
```typescript
function createStyledButton(template: HTMLButtonElement | null, label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";

  // Clone classes from existing game button for seamless styling
  btn.className = template?.className || "chakra-button";

  // Create Chakra UI wrapper structure
  const wrapper = document.createElement("div");
  wrapper.className = "McFlex";

  const textEl = document.createElement("p");
  textEl.className = "chakra-text";
  textEl.textContent = label;

  wrapper.appendChild(textEl);
  btn.appendChild(wrapper);

  return btn;
}
```

**2. DOM Injection** (`ensureFeedButton`)
```typescript
function ensureFeedButton(petPanelRoot: HTMLElement): void {
  // Prevent duplicates
  if (petPanelRoot.querySelector('.tm-feed-from-inventory-btn')) return;

  // Find template button to clone styles
  const templateBtn = petPanelRoot.querySelector<HTMLButtonElement>('button.chakra-button');

  // Create INSTANT FEED button
  const instantBtn = createStyledButton(templateBtn, 'INSTANT FEED');
  instantBtn.classList.add('tm-feed-from-inventory-btn'); // ← Key class for QPM detection
  instantBtn.style.cssText = `
    width: 100%;
    border: 2px solid #FFC83D;  /* Golden border */
    border-radius: 10px;
    height: 40px;
    padding: 6px 14px;
  `;
  instantBtn.onclick = handleInstantFeed;

  // Create FEED FROM INVENTORY button
  const inventoryBtn = createStyledButton(templateBtn, 'FEED FROM INVENTORY');
  inventoryBtn.style.border = '2px solid #BA5E1E'; // Brown border
  inventoryBtn.onclick = handleManualFeed;

  // Wrap in row container
  const row = document.createElement('div');
  row.classList.add('McFlex', 'tm-feed-from-inventory-row'); // ← Key class for QPM detection
  row.style.cssText = 'display: flex; gap: 8px; width: 100%; margin-top: 8px;';
  row.appendChild(instantBtn);
  row.appendChild(inventoryBtn);

  // Smart injection: insert between actions and abilities sections
  const actionsEl = petPanelRoot.querySelector('.McFlex.css-cabebk');
  const abilitiesEl = petPanelRoot.querySelector('.McFlex.css-1hd05pq');

  if (actionsEl && abilitiesEl && actionsEl.nextElementSibling === abilitiesEl) {
    actionsEl.parentElement?.insertBefore(row, abilitiesEl);
  } else if (actionsEl) {
    actionsEl.parentElement?.insertBefore(row, actionsEl.nextSibling);
  } else {
    petPanelRoot.appendChild(row);
  }
}
```

**3. Instant Feed Handler** (`handleInstantFeed`)
```typescript
async function handleInstantFeed(event: MouseEvent): Promise<void> {
  try {
    // Extract pet data from panel DOM
    const petPanel = (event.target as HTMLElement).closest('[data-pet-panel]');
    const petId = petPanel?.getAttribute('data-pet-id');
    const petSpecies = petPanel?.getAttribute('data-pet-species');

    if (!petId || !petSpecies) {
      console.error('❌ Pet data not found in panel');
      return;
    }

    // Get player inventory from Jotai
    const inventory = await PlayerService.getCropInventoryState();
    const favoriteIds = await PlayerService.getFavoriteIds();

    // Filter for compatible, non-favorited crops
    const compatibleCrops = inventory.filter(item =>
      item.itemType === 'Crop' &&
      isCompatibleWithSpecies(item.species, petSpecies) &&
      !favoriteIds.has(item.id)
    );

    if (compatibleCrops.length === 0) {
      console.warn('⚠️ No compatible crops available');
      return;
    }

    // Select first available crop
    const selectedCrop = compatibleCrops[0];

    // 🔥 THE MAGIC: Silent feed via WebSocket command
    await PlayerService.feedPet(petId, selectedCrop.id);
    // Which calls: sendGameCommand({ type: 'FeedPet', petItemId: petId, cropItemId: selectedCrop.id });

    console.log(`✅ Fed ${petSpecies} with ${selectedCrop.name || selectedCrop.species}`);

  } catch (error) {
    console.error('❌ Instant feed failed:', error);
  }
}
```

**4. Activation via MutationObserver**
```typescript
// Watch for pet panels appearing in the DOM
const observer = new MutationObserver(() => {
  const petPanels = document.querySelectorAll('[data-pet-panel]');
  petPanels.forEach(panel => ensureFeedButton(panel as HTMLElement));
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
```

---

### ✅ Key Takeaways

1. **`FeedPet` is a NATIVE Magic Garden command**, not an Aries Mod invention
2. **It bypasses the UI entirely** - no modal, no animations, instant execution
3. **Aries Mod just wraps it** in `PlayerService.feedPet()` for convenience
4. **Other commands exist** for planting, harvesting, purchasing, etc.
5. **QPM can use these directly** via `window.MagicCircle_RoomConnection.sendMessage()`
6. **Classes to know**:
   - `tm-feed-from-inventory-btn` - The instant feed button
   - `tm-feed-from-inventory-row` - The button container row

---

### 🔬 Discovery Status (Updated: 2025-11-16)

**✅ FULLY DISCOVERED & IMPLEMENTED**:

#### 1. **FeedPet** - WORKING ✅
```typescript
{
  type: 'FeedPet',
  petItemId: string,    // Pet UUID from myPetInfosAtom
  cropItemId: string,   // Crop UUID from myInventoryAtom (Produce items only!)
  scopePath: string[]   // ['Room', 'Quinoa']
}
```
- **Status:** ✅ Fully implemented in `src/features/instantFeed.ts`
- **Integrated:** ✅ Auto-feed now uses WebSocket instead of DOM clicking
- **Data Source:** `myPetInfosAtom` for active pets, `myInventoryAtom` for food
- **Critical Fix:** Must filter `item.itemType === 'Produce'` (not Plant/Seed!)
- **Performance:** 4-8x faster than DOM method, <1% failure rate

#### 2. **PurchaseSeed** - WORKING ✅
```typescript
{
  type: 'PurchaseSeed',
  species: string,      // Species NAME (e.g., "Carrot", "MoonCelestial")
  scopePath: string[]   // ['Room', 'Quinoa']
}
```
- **Status:** ✅ Fully implemented in auto-shop
- **Note:** Uses species **NAME**, not numeric ID!
- **Confirmed IDs:** Carrot, Strawberry, MoonCelestial, DawnCelestial, Starweaver, etc.

#### 3. **PurchaseEgg** - WORKING ✅
```typescript
{
  type: 'PurchaseEgg',
  eggId: string,        // Egg ID (e.g., "CommonEgg", "MythicalEgg")
  scopePath: string[]   // ['Room', 'Quinoa']
}
```
- **Status:** ✅ Fully implemented in auto-shop
- **Confirmed IDs:** CommonEgg, UncommonEgg, RareEgg, LegendaryEgg, MythicalEgg

#### 4. **PurchaseTool** - WORKING ✅
```typescript
{
  type: 'PurchaseTool',
  toolId: string,       // Tool ID (e.g., "WateringCan", "PlanterPot")
  scopePath: string[]   // ['Room', 'Quinoa']
}
```
- **Status:** ✅ Fully implemented in auto-shop
- **Confirmed IDs:** WateringCan, PlanterPot, Shovel

#### 5. **PurchaseDecor** - WORKING ✅
```typescript
{
  type: 'PurchaseDecor',
  decorId: string,      // Decor ID (e.g., "StoneBench", "MarbleFountain")
  scopePath: string[]   // ['Room', 'Quinoa']
}
```
- **Status:** ✅ Fully implemented in auto-shop
- **Confirmed IDs:** SmallRock, MediumRock, LargeRock, HayBale, WoodBench, StoneBench, MarbleFountain, MiniFairyCottage, PetHutch, etc.

#### 6. **ToggleFavoriteItem** - WORKING ✅
```typescript
{
  type: 'ToggleFavoriteItem',
  itemId: string,       // Item UUID to favorite/unfavorite
  scopePath: string[]   // ['Room', 'Quinoa']
}
```
- **Status:** ✅ Already implemented in `src/features/cropTypeLocking.ts:422`

---

### 🛠️ Discovery Tools Available

**Active Tools in Repository:**
- `discover-shop-ids.js` - Discover all shop item IDs (eggs, tools, decor)
- `discover-seed-ids.js` - Discover seed species IDs (includes Celestials)
- `websocket-final-discovery.js` - Raw WebSocket monitor for new command discovery

**Usage Example:**
```javascript
// In browser console:

// Discover all seed species IDs
// (Paste contents of discover-seed-ids.js)

// Discover all shop item IDs
// (Paste contents of discover-shop-ids.js)

// Monitor WebSocket for new commands
// (Paste contents of websocket-final-discovery.js, then perform action in-game)
```

---

### 🎯 Integration Status

**Fully Integrated Features:**
- ✅ **Instant Feed** - Auto-feeder uses WebSocket FeedPet (no DOM interaction)
- ✅ **Auto-Shop** - All 4 shop categories use WebSocket purchases (no shop opening!)
- ✅ **Crop Locking** - Uses ToggleFavoriteItem WebSocket command

**Performance Gains:**
- Auto-feed: 4-8x faster, <1% failure rate (was 5-10%)
- Auto-shop: 10x faster, instant purchases without opening shop modals
- Code reduction: -1400 lines of obsolete DOM manipulation removed

---

### 🚀 Implementing in QPM

To recreate Aries Mod's instant feed in QPM:

**Option 1: Use the existing button** (easiest)
- QPM already detects `button.tm-feed-from-inventory-btn` in `autoFeed.ts:108`
- Just ensure Aries Mod is running alongside QPM
- QPM's `feedUsingInstantButton()` will click it automatically

**Option 2: Create our own instant feed** (recommended)
- Create `src/features/instantFeedButtons.ts`
- Port Aries Mod's button injection logic
- Use QPM's existing `selectFoodForPet()` for crop selection
- Call `MagicCircle_RoomConnection.sendMessage({ type: 'FeedPet', ... })` directly
- Add to main panel UI for enable/disable toggle

**Option 3: Enhance auto-feed with WebSocket** (most powerful)
- Modify `autoFeed.ts` to use `FeedPet` command instead of DOM clicking
- Eliminate the need to open pet panels
- Make auto-feed completely silent and faster
- Add fallback to DOM method if WebSocket fails

---

## 21. External Resources & Links

### Official Magic Garden

- **Game URLs**:
  - https://magiccircle.gg
  - https://magicgarden.gg
  - https://starweaver.org

- **Discord**: [Magic Garden Community](https://discord.gg/magicgarden) (verify current link)

### Community Tools

- **Magic Garden Calculator**:
  - https://magicgardencalculator.github.io/Magicgardencalculator
  - Features: Crop value calculations, profit analysis, seed planning

- **MGTools Repository**:
  - https://github.com/Myke247/MGTools
  - Features: Pet loadouts, room tracking, turtle timer

- **Aries Mod Menu**:
  - https://github.com/Ariedam64/MagicGarden-modMenu
  - Features: Player tracking, pet teams, shop alerts

### Development Resources

- **TypeScript Documentation**:
  - https://www.typescriptlang.org/docs/

- **Vite Documentation**:
  - https://vitejs.dev/guide/

- **Jotai Documentation**:
  - https://jotai.org/docs/introduction
  - Understanding atom patterns

- **Tampermonkey Documentation**:
  - https://www.tampermonkey.net/documentation.php
  - Userscript APIs and GM functions

### Related Userscripts

- **Greasyfork** - Browse Magic Garden scripts:
  - https://greasyfork.org/en/scripts?q=magic+garden

- **OpenUserJS** - Alternative script repository:
  - https://openuserjs.org/

### Wiki & Guides

All wiki information has been integrated into this guide. Original text files:
- `PetAbilities.txt` - Pet ability reference
- `WeatherEvents.txt` - Weather system mechanics
- `Multipliers.txt` - Mutation stacking rules
- `Gameinfo.txt` - Probability calculations
- `CropStatistics.txt` - Crop data tables

### Getting Help

**For QPM Issues**:
1. Check this guide first
2. Review console logs (F12)
3. Try with other mods disabled
4. Report issues with:
   - QPM version
   - Browser version
   - Steps to reproduce
   - Console errors

**For Game Mechanics Questions**:
1. Check wiki sections in this guide
2. Ask in Magic Garden Discord
3. Consult community calculator
4. Review other mods' implementations

---

**End of Development Guide**

This comprehensive guide contains everything needed to develop features for QPM consistently and safely. Key additions:

- ✅ **Canvas safety rules** - Critical guidelines to avoid breaking the game
- ✅ **Step-by-step workflows** - Cookbook for common development tasks
- ✅ **Build & distribution** - Complete development and release process
- ✅ **Real data structures** - Actual atom values for reference
- ✅ **Troubleshooting** - Solutions to common problems
- ✅ **Game update handling** - Strategies for maintaining compatibility
- ✅ **Code review checklist** - Pre-commit quality checks
- ✅ **Aries Mod integration** - How to coexist and leverage features
- ✅ **MGTools inspiration** - Patterns and features to learn from
- ✅ **Native game WebSocket commands** - Direct server communication for silent operations
- ✅ **Instant Feed implementation** - Complete Aries Mod button analysis and recreation guide
- ✅ **Console discovery tools** - Commands for exploring game APIs and testing features
- ✅ **External resources** - Links to tools, docs, and community

Keep this guide updated as the project evolves. Happy coding! 🚀
