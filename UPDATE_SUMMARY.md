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
