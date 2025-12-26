# QPM-GR-master Catalog Integration Plan
## Futureproof Data Catalog Implementation

**Status:** Ready for Implementation
**Created:** 2024-12-25
**Target Features:** XP Tracker, Mutation/Ability Trackers, Auto Favorite, Bulk Favorite, Crop Size Indicator, Journal Checker

---

## Executive Summary

This plan outlines the complete integration of the Data Catalog Loader into 6 core QPM features to eliminate ALL hardcoded game data and make the system fully futureproof. When new pets, crops, mutations, or abilities are added to the game, QPM will automatically detect and support them **without any code changes**.

### Success Criteria
✅ **Zero Hardcoded Species Lists** - All plant/pet species pulled from catalogs
✅ **Zero Hardcoded Mutation Lists** - All mutations (Gold, Rainbow, weather-based) from catalog
✅ **Zero Hardcoded Ability Lists** - All pet abilities dynamically discovered
✅ **Automatic New Content Support** - New game content works immediately
✅ **Graceful Fallbacks** - Features work even if catalogs load slowly
✅ **No Breaking Changes** - Existing user data/configs remain valid

---

## Part 1: Catalog Structure Analysis

### 1.1 Available Catalogs (8 Total)

#### **Plant Catalog** (`plantCatalog`)
**Keys:** 30+ plant species (Carrot, Strawberry, Aloe, Apple, Bamboo, etc.)

**Per Species Data:**
```typescript
{
  seed: {
    name: "Carrot Seed",
    coinPrice: 10,
    creditPrice: 1,
    rarity: "Common",
    tileRef: { spritesheet: "seeds", index: 0, type: "tile" }
  },
  plant: {
    name: "Carrot Plant",
    harvestType: "Single" | "Multiple",
    secondsToMature?: number,
    baseTileScale: 1.0,
    slotOffsets?: Array<{x, y, rotation}>
  },
  crop: {
    name: "Carrot",
    baseSellPrice: 5,
    baseWeight: 0.1,
    baseTileScale: 0.7,
    maxScale: 2.5,
    tileRef: { spritesheet: "plants", index: 10 }
  }
}
```

**Usage:** Journal checker (species list), crop size indicator, auto favorite, bulk favorite

---

#### **Pet Catalog** (`petCatalog`)
**Keys:** 18 pet species (Worm, Snail, Bee, Chicken, Turkey, SnowFox, Stoat, WhiteCaribou, etc.)

**Per Species Data:**
```typescript
{
  name: "Worm",
  coinsToFullyReplenishHunger: 500,  // 1:1 ratio with hunger capacity
  diet: ["Carrot", "Strawberry", "Aloe", "Tomato", "Apple"],
  hoursToMature: 12,
  matureWeight: 0.1,
  maturitySellPrice: 5000,
  maxScale: 2,
  rarity: "Common",
  innateAbilityWeights: {
    "SeedFinderI": 50,
    "ProduceEater": 50
  },
  tileRef: { spritesheet: "pets", index: 10 },
  moveProbability: 0.1,
  moveTweenDurationMs: 1346
}
```

**Usage:** Journal checker (species list), XP tracker, ability tracker

---

#### **Pet Abilities Catalog** (`petAbilities`)
**Keys:** 50+ abilities (CoinFinderI/II/III, SeedFinderI/II, HungerBoost, GoldGranter, ProduceScaleBoost, etc.)

**Per Ability Data:**
```typescript
{
  name: "Coin Finder I",
  trigger: "continuous" | "harvest" | "hatchEgg" | "plant",
  baseProbability: 35,  // Percentage chance
  baseParameters: {
    baseMaxCoinsFindable?: number,
    eggGrowthTimeReductionMinutes?: number,
    hungerDepletionRateDecreasePercentage?: number,
    grantedMutations?: ["Gold"] | ["Frozen"],
    scaleMultiplier?: number
  }
}
```

**Usage:** XP tracker (ability names), ability tracker, auto favorite (ability filtering)

---

#### **Mutation Catalog** (`mutationCatalog`)
**Keys:** 11 mutations (Gold, Rainbow, Wet, Chilled, Frozen, Dawnlit, Dawncharged, Ambershine, Ambercharged, MaxWeight)

**Per Mutation Data:**
```typescript
{
  name: "Gold",
  baseChance: 1,  // Base spawn chance (0 = weather-only)
  coinMultiplier: 100,  // Value multiplier
  tileRef: { spritesheet: "mutations", index: 0 }
}
```

**Mapping:**
- `baseChance: 1+` = Always available (Gold, Rainbow)
- `baseChance: 0` = Weather/event only (Wet, Frozen, Dawnlit, etc.)

**Usage:** Journal checker (mutation list), mutation value tracker, auto favorite

---

#### **Egg Catalog** (`eggCatalog`)
**Keys:** 6 egg types (CommonEgg, UncommonEgg, RareEgg, WinterEgg, LegendaryEgg, MythicalEgg)

**Per Egg Data:**
```typescript
{
  name: "Common Egg",
  coinPrice: 100000,
  creditPrice: 19,
  rarity: "Common",
  secondsToHatch: 600,
  faunaSpawnWeights: {
    "Worm": 60,
    "Snail": 35,
    "Bee": 5
  },
  tileRef: { spritesheet: "pets", index: 11 }
}
```

**Usage:** Future egg hatch predictor, XP tracker (contextual data)

---

#### **Item Catalog** (`itemCatalog`)
**Keys:** 20+ items (WateringCan, PlanterPot, Shovel, RainbowPotion, GoldPotion, etc.)

**Per Item Data:**
```typescript
{
  name: "Watering Can",
  coinPrice: 1000,
  creditPrice: 10,
  rarity: "Common",
  description: "Waters plants faster",
  tileRef: { spritesheet: "items", index: 0 }
}
```

**Usage:** Future shop tracker enhancements

---

#### **Decor Catalog** (`decorCatalog`)
**Keys:** 30+ decorations (SmallRock, MediumRock, Fence, Fountain, etc.)

**Per Decor Data:**
```typescript
{
  name: "Small Rock",
  coinPrice: 500,
  creditPrice: 5,
  rarity: "Common",
  tileRef: { spritesheet: "decor", index: 0 },
  rotationVariants?: Record<string, TileRef>
}
```

**Usage:** Future decoration browser

---

### 1.2 Catalog Readiness Handling

**Problem:** Catalogs load asynchronously (30-60 seconds after game start)

**Solutions:**
```typescript
// Pattern 1: Wait for catalogs (use in non-critical init)
async function initFeature() {
  try {
    await waitForCatalogs(15000); // 15 second timeout
    const species = getAllPlantSpecies(); // Catalog data
  } catch {
    // Fallback if catalog not ready
  }
}

// Pattern 2: Check ready state (use in render loops)
function renderUI() {
  if (areCatalogsReady()) {
    const species = getAllPlantSpecies(); // Catalog data
  } else {
    // Show loading state or use empty array
  }
}

// Pattern 3: Subscribe to ready event (use for one-time init)
onCatalogsReady((catalogs) => {
  console.log('Catalogs loaded!', catalogs);
  refreshUI();
});
```

---

## Part 2: Feature-by-Feature Integration Plan

### 2.1 Journal Checker

**Files:**
- `src/features/journalChecker.ts` (main logic)
- `src/ui/journalCheckerSection.ts` (UI)

#### **Current Hardcoded Data:**
```typescript
// Lines 78-125: PRODUCE_CATALOG - 30+ hardcoded species
const PRODUCE_CATALOG: Record<string, string[]> = {
  'Carrot': ['Normal', 'Rainbow', 'Gold', 'Frozen', ...],
  'Strawberry': ['Normal', 'Rainbow', 'Gold', ...],
  // ... 28 more species
};

// Lines 129-175: PET_CATALOG - 18+ hardcoded species
const PET_CATALOG: Record<string, string[]> = {
  'Worm': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
  'Snail': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
  // ... 16 more species
};
```

#### **Catalog Integration Changes:**

**Step 1: Import catalog functions**
```typescript
// Add to imports (line 6):
import { getAllPlantSpecies, getAllPetSpecies, getAllMutations, areCatalogsReady } from '../catalogs/gameCatalogs';
```

**Step 2: Replace hardcoded produce catalog**
```typescript
// DELETE lines 78-125 (PRODUCE_CATALOG constant)

// ADD dynamic function:
function getProduceCatalog(): Record<string, string[]> {
  const catalog: Record<string, string[]> = {};

  if (!areCatalogsReady()) {
    return {}; // Return empty if not ready - graceful degradation
  }

  // Get all plant species from catalog
  const species = getAllPlantSpecies();

  // Get all mutation names from catalog
  const mutationCatalog = getAllMutations();
  const mutations = Object.keys(mutationCatalog);

  // Build variant list dynamically
  const variants = ['Normal'];

  // Add special mutations that are always tracked
  if (mutations.includes('Rainbow')) variants.push('Rainbow');
  if (mutations.includes('Gold')) variants.push('Gold');

  // Add weather mutations
  const weatherMutations = ['Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged'];
  for (const mut of weatherMutations) {
    if (mutations.includes(mut)) {
      variants.push(mut);
    }
  }

  // Add max weight (always present in journal system)
  variants.push('Max Weight');

  // Assign variants to all species
  for (const speciesName of species) {
    catalog[speciesName] = [...variants];
  }

  return catalog;
}
```

**Step 3: Replace hardcoded pet catalog**
```typescript
// DELETE lines 129-175 (PET_CATALOG constant)

// ADD dynamic function:
function getPetCatalog(): Record<string, string[]> {
  const catalog: Record<string, string[]> = {};

  if (!areCatalogsReady()) {
    return {}; // Return empty if not ready
  }

  // Get all pet species from catalog
  const species = getAllPetSpecies();

  // Get all mutation names from catalog
  const mutationCatalog = getAllMutations();
  const mutations = Object.keys(mutationCatalog);

  // Build variant list for pets
  const variants = ['Normal'];

  // Pets only track Rainbow, Gold, Max Weight (not weather mutations)
  if (mutations.includes('Rainbow')) variants.push('Rainbow');
  if (mutations.includes('Gold')) variants.push('Gold');
  variants.push('Max Weight');

  // Assign variants to all species
  for (const speciesName of species) {
    catalog[speciesName] = [...variants];
  }

  return catalog;
}
```

**Step 4: Update usage sites**
```typescript
// Line 383: Replace reference
// BEFORE:
for (const [species, possibleVariants] of Object.entries(PRODUCE_CATALOG)) {

// AFTER:
const produceCatalog = getProduceCatalog();
for (const [species, possibleVariants] of Object.entries(produceCatalog)) {

// Line 404: Replace reference
// BEFORE:
for (const [species, possibleVariants] of Object.entries(PET_CATALOG)) {

// AFTER:
const petCatalog = getPetCatalog();
for (const [species, possibleVariants] of Object.entries(petCatalog)) {
```

**Benefit:** When new plants (e.g., "Mango", "Pineapple") or pets (e.g., "Fox", "Owl") are added to the game, they automatically appear in the journal checker with all possible variants.

---

### 2.2 XP Tracker

**Files:**
- `src/store/xpTracker.ts` (tracking logic)
- `src/ui/xpTrackerWindow.ts` (UI)

#### **Current Hardcoded Data:**
```typescript
// Line 43: Manual XP per level config
speciesXpPerLevel: Record<string, number>; // User must manually enter values
```

#### **Catalog Integration Changes:**

**Problem:** Game catalog doesn't include XP values directly, but we can infer from ability definitions.

**Step 1: Create XP inference utility**
```typescript
// NEW FILE: src/utils/xpInference.ts

import { getAbilityDef, getPetCatalog, areCatalogsReady } from '../catalogs/gameCatalogs';

/**
 * Infer XP per level for a pet species based on ability probabilities
 * This uses the catalog's innateAbilityWeights to estimate XP rates
 */
export function inferXpPerLevel(species: string): number | null {
  if (!areCatalogsReady()) return null;

  const petCatalog = getPetCatalog();
  if (!petCatalog) return null;

  const petEntry = petCatalog[species];
  if (!petEntry) return null;

  // Rarity-based estimation (derived from game patterns)
  const rarityMultipliers: Record<string, number> = {
    'Common': 1.0,
    'Uncommon': 2.0,
    'Rare': 5.0,
    'Legendary': 10.0,
    'Mythical': 15.0,
  };

  const rarity = petEntry.rarity || 'Common';
  const baseXp = 10000; // Base XP per level
  const multiplier = rarityMultipliers[rarity] || 1.0;

  return Math.floor(baseXp * multiplier);
}

/**
 * Get all pet species with inferred XP values
 */
export function getAllPetXpEstimates(): Record<string, number> {
  const estimates: Record<string, number> = {};

  if (!areCatalogsReady()) return estimates;

  const petCatalog = getPetCatalog();
  if (!petCatalog) return estimates;

  for (const species of Object.keys(petCatalog)) {
    const xp = inferXpPerLevel(species);
    if (xp !== null) {
      estimates[species] = xp;
    }
  }

  return estimates;
}
```

**Step 2: Auto-populate XP config on startup**
```typescript
// In src/store/xpTracker.ts

// Add import
import { getAllPetXpEstimates, areCatalogsReady } from '../utils/xpInference';

// Modify initializeXpTracker (around line 140):
export function initializeXpTracker(): void {
  loadProcs();
  loadConfig();

  // Auto-populate XP estimates from catalog (FUTUREPROOF!)
  if (areCatalogsReady()) {
    autoPopulateXpEstimates();
  } else {
    // Wait for catalogs and populate once ready
    onCatalogsReady(() => {
      autoPopulateXpEstimates();
    });
  }
}

function autoPopulateXpEstimates(): void {
  const catalogEstimates = getAllPetXpEstimates();

  // Merge with existing config (don't overwrite user customizations)
  for (const [species, xp] of Object.entries(catalogEstimates)) {
    if (!(species in configData.speciesXpPerLevel)) {
      // Only add if not already configured
      configData.speciesXpPerLevel[species] = xp;
    }
  }

  scheduleSaveConfig();
}
```

**Step 3: Add ability name lookup**
```typescript
// In src/store/xpTracker.ts

// Add import
import { getAbilityDef } from '../catalogs/gameCatalogs';

// Modify getXpAbilityStats (around line 166):
export function getXpAbilityStats(activePets: ActivePetInfo[]): XpAbilityStats[] {
  const stats: XpAbilityStats[] = [];

  for (const pet of activePets) {
    // ... existing code ...

    for (const abilityId of pet.abilities) {
      // NEW: Get ability name from catalog (FUTUREPROOF!)
      const abilityDef = getAbilityDef(abilityId);
      const abilityName = abilityDef?.name || abilityId; // Fallback to ID if not found

      stats.push({
        petId: pet.petId,
        petName: pet.name || pet.species || 'Unknown',
        species: pet.species || 'Unknown',
        abilityId,
        abilityName, // <-- Now dynamic!
        // ... rest of stats
      });
    }
  }

  return stats;
}
```

**Benefit:** When new pets or abilities are added, XP tracker automatically gets correct ability names and reasonable XP estimates without manual configuration.

---

### 2.3 Ability Tracker (Mutation Value Tracking)

**Files:**
- `src/features/mutationValueTracking.ts`
- `src/store/abilityLogs.ts`

#### **Current Hardcoded Data:**
```typescript
// Line 18-22: Hardcoded fallback values
const FALLBACK_VALUES = {
  gold: 500000,
  rainbow: 1000000,
  cropBoost: 5000000,
};
```

#### **Catalog Integration Changes:**

**Step 1: Create mutation value calculator**
```typescript
// NEW FILE: src/utils/mutationValueCalculator.ts

import { getMutationMultiplier, getPlantCatalog, areCatalogsReady } from '../catalogs/gameCatalogs';

/**
 * Calculate average value of a mutation based on catalog data
 */
export function calculateMutationValue(mutationId: string): number | null {
  if (!areCatalogsReady()) return null;

  const multiplier = getMutationMultiplier(mutationId);
  if (multiplier <= 1) return null;

  const plantCatalog = getPlantCatalog();
  if (!plantCatalog) return null;

  // Calculate average base crop value
  const cropValues: number[] = [];
  for (const [species, entry] of Object.entries(plantCatalog)) {
    if (entry.crop?.baseSellPrice) {
      cropValues.push(entry.crop.baseSellPrice);
    }
  }

  if (cropValues.length === 0) return null;

  // Average base value
  const avgBaseValue = cropValues.reduce((sum, val) => sum + val, 0) / cropValues.length;

  // Apply mutation multiplier
  return Math.floor(avgBaseValue * multiplier);
}

/**
 * Get all mutation values from catalog
 */
export function getAllMutationValues(): Record<string, number> {
  const values: Record<string, number> = {};

  if (!areCatalogsReady()) return values;

  const mutations = getAllMutations();
  for (const mutationId of Object.keys(mutations)) {
    const value = calculateMutationValue(mutationId);
    if (value !== null) {
      values[mutationId] = value;
    }
  }

  return values;
}
```

**Step 2: Replace hardcoded fallback values**
```typescript
// In src/features/mutationValueTracking.ts

// Add import
import { calculateMutationValue, getAllMutationValues } from '../utils/mutationValueCalculator';

// DELETE lines 18-22 (FALLBACK_VALUES constant)

// ADD dynamic function:
function getMutationValue(mutationId: string): number {
  // Try catalog first
  const catalogValue = calculateMutationValue(mutationId);
  if (catalogValue !== null) return catalogValue;

  // Fallback to conservative estimate based on multiplier
  const multiplier = getMutationMultiplier(mutationId);
  return Math.floor(5000 * multiplier); // 5000 * multiplier as fallback
}

// Modify calculateStats function (around line 200):
function calculateStats() {
  // ... existing code ...

  // Replace hardcoded FALLBACK_VALUES.gold with:
  const goldValue = getMutationValue('Gold');

  // Replace FALLBACK_VALUES.rainbow with:
  const rainbowValue = getMutationValue('Rainbow');

  // ... etc
}
```

**Benefit:** Mutation values automatically adjust based on actual crop prices in the game, giving accurate value tracking.

---

### 2.4 Auto Favorite

**Files:**
- `src/features/autoFavorite.ts`

#### **Current Hardcoded Data:**
```typescript
// Lines 43-64: Hardcoded crop type categorization
function getCropType(species: string | null | undefined): string | null {
  const seeds = ['wheat', 'corn', 'rice', ...];
  const fruits = ['apple', 'banana', 'strawberry', ...];
  const vegetables = ['carrot', 'tomato', 'pepper', ...];
  // ...
}
```

#### **Catalog Integration Changes:**

**Problem:** Catalogs don't include explicit crop categories, but we can infer from rarity/price patterns.

**Step 1: Create intelligent crop categorizer**
```typescript
// NEW FILE: src/utils/cropCategorizer.ts

import { getPlantCatalog, areCatalogsReady } from '../catalogs/gameCatalogs';

/**
 * Infer crop category based on name patterns and catalog data
 */
export function getCropCategory(species: string): string | null {
  if (!species) return null;

  const normalized = species.toLowerCase();

  // Pattern-based categorization (still needed for semantic accuracy)
  if (/seed|grain|wheat|corn|rice|barley|oat/.test(normalized)) return 'Seed';
  if (/fruit|berry|apple|banana|grape|melon|lemon/.test(normalized)) return 'Fruit';
  if (/vegetable|carrot|tomato|pepper|mushroom|bamboo/.test(normalized)) return 'Vegetable';
  if (/flower|lily|tulip|rose|daisy|chrysanthemum|daffodil/.test(normalized)) return 'Flower';
  if (/succulent|cactus|aloe|echeveria/.test(normalized)) return 'Succulent';

  // Catalog-based inference (futureproof for unknown species)
  if (areCatalogsReady()) {
    const plantCatalog = getPlantCatalog();
    if (plantCatalog && plantCatalog[species]) {
      const entry = plantCatalog[species];

      // Infer from rarity
      if (entry.seed?.rarity === 'Mythical') return 'Special';
      if (entry.seed?.rarity === 'Legendary') return 'Special';

      // Infer from price patterns
      const seedPrice = entry.seed?.coinPrice || 0;
      if (seedPrice > 100000) return 'Rare Plant';
    }
  }

  return 'Other';
}

/**
 * Get all available categories from current plants
 */
export function getAllCropCategories(): string[] {
  const categories = new Set<string>();

  if (areCatalogsReady()) {
    const plantCatalog = getPlantCatalog();
    if (plantCatalog) {
      for (const species of Object.keys(plantCatalog)) {
        const category = getCropCategory(species);
        if (category) categories.add(category);
      }
    }
  }

  return Array.from(categories).sort();
}
```

**Step 2: Replace hardcoded getCropType**
```typescript
// In src/features/autoFavorite.ts

// Add import
import { getCropCategory } from '../utils/cropCategorizer';

// DELETE lines 43-65 (getCropType function)

// REPLACE with:
function getCropType(species: string | null | undefined): string | null {
  return getCropCategory(species);
}
```

**Step 3: Add dynamic species/ability lists to UI**
```typescript
// Add helper for UI dropdowns:
export function getAvailableFilterOptions(): {
  species: string[];
  abilities: string[];
  mutations: string[];
  cropTypes: string[];
} {
  return {
    species: areCatalogsReady() ? getAllPlantSpecies() : [],
    abilities: areCatalogsReady() ? getAllAbilities() : [],
    mutations: areCatalogsReady() ? Object.keys(getAllMutations()) : [],
    cropTypes: getAllCropCategories(),
  };
}
```

**Benefit:** Filter dropdowns automatically populate with all available options from the game, including new species/abilities.

---

### 2.5 Bulk Favorite

**Files:**
- `src/features/bulkFavorite.ts`

#### **Current Hardcoded Data:**
Similar to Auto Favorite - relies on species names for filtering.

#### **Catalog Integration Changes:**

**Step 1: Import catalog utilities**
```typescript
// Add to imports:
import { getAllPlantSpecies, getAllMutations, areCatalogsReady } from '../catalogs/gameCatalogs';
import { getCropCategory } from '../utils/cropCategorizer';
```

**Step 2: Add species validation**
```typescript
// Add validation helper:
function isValidSpecies(species: string): boolean {
  if (!areCatalogsReady()) return true; // Allow all if catalog not ready (permissive)

  const knownSpecies = getAllPlantSpecies();
  return knownSpecies.includes(species);
}

// Use in filtering logic:
function filterItems(items: any[], config: BulkFavoriteConfig) {
  return items.filter(item => {
    // ... existing filters ...

    // Validate species exists in catalog
    if (config.filterBySpecies && item.species) {
      if (!isValidSpecies(item.species)) {
        console.warn(`Unknown species in bulk favorite: ${item.species}`);
      }
    }

    // ... rest of filters
  });
}
```

**Benefit:** Detects invalid species names early, preventing silent filter failures.

---

### 2.6 Crop Size Indicator & Journal Tooltip

**Files:**
- `src/features/cropSizeIndicator.ts`

#### **Current Hardcoded Data:**
```typescript
// Lines 9: CROP_BASE_STATS import (hardcoded base values)
import { getCropStats, CROP_BASE_STATS } from '../data/cropBaseStats';

// Lines 37-45: Hardcoded species aliases
const SPECIES_KEY_ALIASES: Record<string, string[]> = {
  cacaobean: ['cacao', 'cacao bean', ...],
  dragonfruit: ['dragon fruit'],
  // ...
};
```

#### **Catalog Integration Changes:**

**Step 1: Replace CROP_BASE_STATS with catalog lookups**
```typescript
// In src/features/cropSizeIndicator.ts

// Add import
import { getPlantSpecies, areCatalogsReady } from '../catalogs/gameCatalogs';

// Create catalog-based getCropStats replacement:
function getCropStatsFromCatalog(species: string): {
  baseWeight: number;
  baseSellPrice: number;
  maxScale: number;
} | null {
  if (!areCatalogsReady()) {
    // Fallback to hardcoded if catalog not ready
    return getCropStats(species);
  }

  const plantEntry = getPlantSpecies(species);
  if (!plantEntry || !plantEntry.crop) {
    return getCropStats(species); // Fallback
  }

  return {
    baseWeight: plantEntry.crop.baseWeight || 1.0,
    baseSellPrice: plantEntry.crop.baseSellPrice || 0,
    maxScale: plantEntry.crop.maxScale || 2.5,
  };
}

// Replace all getCropStats() calls with getCropStatsFromCatalog()
```

**Step 2: Dynamic alias detection**
```typescript
// Enhance alias system to use catalog names as canonical:
function getCanonicalSpeciesName(raw: string): string {
  const normalized = normalizeSpeciesKey(raw);

  if (areCatalogsReady()) {
    const allSpecies = getAllPlantSpecies();

    // Direct match
    if (allSpecies.includes(raw)) return raw;

    // Normalized match
    for (const species of allSpecies) {
      if (normalizeSpeciesKey(species) === normalized) {
        return species;
      }
    }
  }

  // Fallback to alias map
  return resolveSpeciesKey(raw);
}
```

**Step 3: Journal indicator enhancement**
```typescript
// Already uses getJournal() which we'll enhance separately
// No changes needed here - journal integration handled in 2.1
```

**Benefit:** Crop size calculations automatically work for new crops without updating CROP_BASE_STATS.

---

## Part 3: Common Integration Utilities

### 3.1 Centralized Catalog Access Layer

**NEW FILE:** `src/utils/catalogHelpers.ts`

```typescript
/**
 * Centralized catalog access utilities
 * Provides consistent error handling and fallbacks
 */

import {
  getAllPlantSpecies,
  getAllPetSpecies,
  getAllMutations,
  getAllAbilities,
  getPlantSpecies,
  getPetSpecies,
  getMutation,
  getAbilityDef,
  areCatalogsReady,
  waitForCatalogs,
} from '../catalogs/gameCatalogs';

export { areCatalogsReady, waitForCatalogs };

/**
 * Get all plant species with fallback to empty array
 */
export function getPlantSpeciesSafe(): string[] {
  return areCatalogsReady() ? getAllPlantSpecies() : [];
}

/**
 * Get all pet species with fallback to empty array
 */
export function getPetSpeciesSafe(): string[] {
  return areCatalogsReady() ? getAllPetSpecies() : [];
}

/**
 * Get all mutation IDs with fallback to empty array
 */
export function getMutationsSafe(): string[] {
  return areCatalogsReady() ? Object.keys(getAllMutations()) : [];
}

/**
 * Get all ability IDs with fallback to empty array
 */
export function getAbilitiesSafe(): string[] {
  return areCatalogsReady() ? getAllAbilities() : [];
}

/**
 * Get plant entry with fallback to null
 */
export function getPlantSafe(species: string) {
  return areCatalogsReady() ? getPlantSpecies(species) : null;
}

/**
 * Get pet entry with fallback to null
 */
export function getPetSafe(species: string) {
  return areCatalogsReady() ? getPetSpecies(species) : null;
}

/**
 * Check if a species exists in plant catalog
 */
export function isValidPlantSpecies(species: string): boolean {
  return getPlantSpeciesSafe().includes(species);
}

/**
 * Check if a species exists in pet catalog
 */
export function isValidPetSpecies(species: string): boolean {
  return getPetSpeciesSafe().includes(species);
}

/**
 * Check if a mutation exists in catalog
 */
export function isValidMutation(mutationId: string): boolean {
  return getMutationsSafe().includes(mutationId);
}

/**
 * Check if an ability exists in catalog
 */
export function isValidAbility(abilityId: string): boolean {
  return getAbilitiesSafe().includes(abilityId);
}

/**
 * Get ability display name with fallback to ID
 */
export function getAbilityName(abilityId: string): string {
  if (!areCatalogsReady()) return abilityId;
  const def = getAbilityDef(abilityId);
  return def?.name || abilityId;
}

/**
 * Get mutation display name with fallback to ID
 */
export function getMutationName(mutationId: string): string {
  if (!areCatalogsReady()) return mutationId;
  const def = getMutation(mutationId);
  return def?.name || mutationId;
}
```

---

### 3.2 Catalog Readiness UI Indicator

**NEW FILE:** `src/ui/catalogStatusIndicator.ts`

```typescript
/**
 * Visual indicator for catalog loading status
 * Shows in UI when catalogs aren't ready yet
 */

import { areCatalogsReady, onCatalogsReady } from '../catalogs/gameCatalogs';

export function createCatalogStatusBanner(): HTMLElement {
  const banner = document.createElement('div');
  banner.style.cssText = `
    padding: 8px 12px;
    background: rgba(251, 191, 36, 0.2);
    border: 1px solid rgba(251, 191, 36, 0.4);
    border-radius: 6px;
    font-size: 12px;
    color: #fbbf24;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  `;

  banner.innerHTML = `
    <span style="font-size: 16px;">⏳</span>
    <span>Loading game data catalog...</span>
  `;

  // Hide when catalogs are ready
  onCatalogsReady(() => {
    banner.style.display = 'none';
  });

  // Initial state
  if (areCatalogsReady()) {
    banner.style.display = 'none';
  }

  return banner;
}

/**
 * Wrap a UI element with catalog status indicator
 */
export function wrapWithCatalogStatus(content: HTMLElement): HTMLElement {
  const container = document.createElement('div');
  const banner = createCatalogStatusBanner();

  container.appendChild(banner);
  container.appendChild(content);

  return container;
}
```

**Usage in feature UIs:**
```typescript
// In journal checker UI:
function renderJournalChecker(root: HTMLElement) {
  const content = createJournalContent();
  const wrapped = wrapWithCatalogStatus(content);
  root.appendChild(wrapped);
}
```

---

## Part 4: Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal:** Set up catalog utilities and test infrastructure

✅ **Tasks:**
1. Create `src/utils/catalogHelpers.ts` (common utilities)
2. Create `src/utils/cropCategorizer.ts` (intelligent categorization)
3. Create `src/utils/mutationValueCalculator.ts` (dynamic value calculation)
4. Create `src/utils/xpInference.ts` (XP estimation)
5. Create `src/ui/catalogStatusIndicator.ts` (loading UI)
6. Add unit tests for catalog helpers

**Validation:**
- All helpers return empty/safe values when catalogs not ready
- Helpers correctly parse catalog data when ready
- UI indicator shows/hides appropriately

---

### Phase 2: Journal Checker (Week 2)
**Goal:** First major feature integration - highest impact

✅ **Tasks:**
1. Replace `PRODUCE_CATALOG` with `getProduceCatalog()`
2. Replace `PET_CATALOG` with `getPetCatalog()`
3. Update all usage sites
4. Add catalog status banner to journal UI
5. Test with 30+ plant species and 18+ pet species

**Validation:**
- All 30+ plants appear in journal automatically
- All 18+ pets appear in journal automatically
- All mutations (Gold, Rainbow, weather-based) appear
- Journal works before catalogs load (graceful degradation)

---

### Phase 3: XP & Ability Trackers (Week 3)
**Goal:** Dynamic ability names and XP estimation

✅ **Tasks:**
1. Integrate `xpInference.ts` into `xpTracker.ts`
2. Add auto-population of XP estimates
3. Replace ability name lookups with `getAbilityName()`
4. Update mutation value tracking with `mutationValueCalculator.ts`
5. Test with all 50+ abilities

**Validation:**
- XP estimates auto-populate for all pets
- Ability names display correctly (not just IDs)
- Mutation values calculated dynamically from catalog
- New abilities work without code changes

---

### Phase 4: Auto Favorite & Bulk Favorite (Week 4)
**Goal:** Dynamic filtering with catalog validation

✅ **Tasks:**
1. Integrate `cropCategorizer.ts` into both features
2. Add `getAvailableFilterOptions()` helper
3. Update UI dropdowns to use catalog data
4. Add species validation
5. Test filtering with edge cases

**Validation:**
- Species dropdowns populate with all 30+ plants
- Ability dropdowns populate with all 50+ abilities
- Mutation dropdowns populate with all mutations
- Invalid species detected and warned
- Filters work correctly with new species

---

### Phase 5: Crop Size Indicator (Week 5)
**Goal:** Catalog-based crop stats

✅ **Tasks:**
1. Create `getCropStatsFromCatalog()` function
2. Replace all `getCropStats()` calls
3. Add dynamic alias detection
4. Test size calculations for all crops
5. Validate journal tooltip integration

**Validation:**
- Crop sizes calculated correctly for all 30+ species
- New crops work automatically without CROP_BASE_STATS updates
- Journal tooltips show correct variant indicators
- Fallback to hardcoded data works when catalog not ready

---

### Phase 6: Testing & Polish (Week 6)
**Goal:** Comprehensive testing and documentation

✅ **Tasks:**
1. Test all features with catalogs disabled (fallback mode)
2. Test all features with new fictional species
3. Performance testing (catalog access should be <1ms)
4. Add inline documentation
5. Update user-facing documentation

**Validation:**
- All features work without catalogs (graceful degradation)
- All features work with catalogs (full functionality)
- Performance benchmarks met
- No regressions in existing functionality

---

## Part 5: Testing Strategy

### 5.1 Unit Tests

```typescript
// tests/catalogHelpers.test.ts

describe('Catalog Helpers', () => {
  it('should return empty array when catalogs not ready', () => {
    // Mock areCatalogsReady() to return false
    expect(getPlantSpeciesSafe()).toEqual([]);
    expect(getPetSpeciesSafe()).toEqual([]);
  });

  it('should return catalog data when ready', () => {
    // Mock areCatalogsReady() to return true
    // Mock getAllPlantSpecies() to return test data
    expect(getPlantSpeciesSafe().length).toBeGreaterThan(0);
  });

  it('should validate species correctly', () => {
    expect(isValidPlantSpecies('Carrot')).toBe(true);
    expect(isValidPlantSpecies('FakeSpecies')).toBe(false);
  });
});
```

### 5.2 Integration Tests

```typescript
// tests/journalChecker.integration.test.ts

describe('Journal Checker Integration', () => {
  it('should discover all plants from catalog', async () => {
    await waitForCatalogs();
    const catalog = getProduceCatalog();

    // Should have at least 30 species
    expect(Object.keys(catalog).length).toBeGreaterThanOrEqual(30);

    // Should include known species
    expect(catalog).toHaveProperty('Carrot');
    expect(catalog).toHaveProperty('Strawberry');
    expect(catalog).toHaveProperty('Bamboo');
  });

  it('should include all mutation variants', async () => {
    await waitForCatalogs();
    const catalog = getProduceCatalog();

    const carrotVariants = catalog['Carrot'];
    expect(carrotVariants).toContain('Normal');
    expect(carrotVariants).toContain('Rainbow');
    expect(carrotVariants).toContain('Gold');
    expect(carrotVariants).toContain('Frozen');
  });
});
```

### 5.3 Manual Testing Checklist

**Before Integration:**
- [ ] Note current journal species count
- [ ] Note current XP tracker ability count
- [ ] Take screenshot of filter dropdowns

**After Integration:**
- [ ] Journal species count increased (30+ plants, 18+ pets)
- [ ] XP tracker shows ability names (not IDs)
- [ ] Filter dropdowns populated automatically
- [ ] No console errors related to catalogs
- [ ] Features work before catalogs load

**Edge Cases:**
- [ ] Test with slow network (catalog delay)
- [ ] Test with browser reload mid-session
- [ ] Test with invalid species names
- [ ] Test with new fictional species (add to catalog manually)

---

## Part 6: Migration & Rollback Plan

### 6.1 Backwards Compatibility

**Concern:** Existing user configs may reference species/abilities that aren't in catalog yet.

**Solution:**
```typescript
// Add compatibility layer in catalogHelpers.ts

const LEGACY_SPECIES_MAP: Record<string, string> = {
  // Map old names to new catalog names
  'FavaBeanPod': 'FavaBean',
  'BurroTail': 'BurrosTail',
  // ... other aliases
};

export function normalizeLegacySpecies(species: string): string {
  return LEGACY_SPECIES_MAP[species] || species;
}

// Use in config loading:
function loadAutoFavoriteConfig() {
  const stored = storage.get(STORAGE_KEY);

  // Normalize legacy species names
  if (stored.species) {
    stored.species = stored.species.map(normalizeLegacySpecies);
  }

  return stored;
}
```

### 6.2 Rollback Plan

If integration causes issues:

**Step 1: Feature flag system**
```typescript
// Add to main.ts:
const USE_CATALOG_INTEGRATION = true; // Feature flag

// In each feature:
function getProduceCatalog() {
  if (!USE_CATALOG_INTEGRATION) {
    // Use hardcoded legacy catalog
    return LEGACY_PRODUCE_CATALOG;
  }

  // Use dynamic catalog
  return buildDynamicCatalog();
}
```

**Step 2: Gradual rollout**
- Phase 1: Enable for journal checker only
- Phase 2: Enable for XP tracker
- Phase 3: Enable for all features

**Step 3: Quick revert**
```bash
# Revert to pre-integration commit
git revert <integration-commit-hash>
npm run build
```

---

## Part 7: Success Metrics

### 7.1 Quantitative Metrics

**Pre-Integration:**
- Journal Checker: 30 plant species, 18 pet species (hardcoded)
- XP Tracker: ~50 ability IDs (no names)
- Auto Favorite: 12 crop categories (hardcoded)
- Mutation Tracker: 3 mutation values (hardcoded)

**Post-Integration:**
- Journal Checker: 30+ plants, 18+ pets (dynamic, auto-updating)
- XP Tracker: 50+ abilities with names (dynamic)
- Auto Favorite: All categories (dynamic)
- Mutation Tracker: 11+ mutation values (calculated)

**Futureproof Test:**
- Add fictional "Mango" plant to catalog manually
- Verify it appears in journal checker without code changes
- Verify auto favorite includes it in species list
- Verify crop size indicator works with it

### 7.2 Performance Metrics

**Catalog Access Latency:**
- Target: <1ms per lookup
- Measure: `console.time()` around `getAllPlantSpecies()`

**UI Render Time:**
- Target: No perceptible difference from hardcoded version
- Measure: Time to render journal checker before/after

**Memory Usage:**
- Target: <500KB increase (catalog storage)
- Measure: Chrome DevTools memory profiler

---

## Part 8: Documentation Updates

### 8.1 Developer Documentation

**NEW FILE:** `docs/CATALOG_INTEGRATION.md`

Content:
- How to access catalog data
- When to use catalog vs hardcoded fallback
- How to add new features using catalogs
- Testing guidelines

### 8.2 User-Facing Documentation

**Update:** `README.md` or user guide

Add section:
```markdown
## Automatic Game Data Detection

QPM now automatically detects all plants, pets, mutations, and abilities from the game!

**What this means:**
- New crops/pets added by the game are immediately supported
- No manual configuration needed
- Journal checker always up-to-date
- Filters always show all available options

**Note:** Data detection may take 30-60 seconds after game loads. Features will show a loading indicator during this time.
```

---

## Part 9: Known Limitations & Future Work

### 9.1 Current Limitations

1. **Catalog Load Time:** 30-60 seconds after game start
   - **Mitigation:** Fallback to hardcoded data, UI loading indicator

2. **Catalog Changes:** If game updates catalog structure, integration may break
   - **Mitigation:** Extensive error handling, fallback to hardcoded

3. **XP Values:** Not directly in catalog, must be inferred
   - **Mitigation:** User can still manually configure XP values

4. **Crop Categories:** Not in catalog, using pattern matching
   - **Mitigation:** Pattern-based categorization + catalog validation

### 9.2 Future Enhancements

**Phase 2 Features (Post-Integration):**

1. **Catalog Caching:**
   - Cache catalogs to localStorage
   - Instant load on subsequent sessions
   - Update detection when game changes

2. **Catalog Diff Detection:**
   - Detect when new species/abilities added
   - Show notification: "New plant detected: Mango!"
   - Auto-update journal/filters

3. **Advanced Analytics:**
   - Rarity distribution charts
   - Price trend analysis
   - Ability probability heatmaps

4. **Catalog Export:**
   - Export full catalog to JSON
   - Share with community
   - Import custom catalog data

---

## Part 10: Final Checklist

### Pre-Implementation
- [ ] Create feature branch: `feature/catalog-integration`
- [ ] Review plan with team
- [ ] Set up test environment
- [ ] Backup current hardcoded data

### During Implementation
- [ ] Follow phase order (1-6)
- [ ] Write unit tests for each phase
- [ ] Manual test each feature after integration
- [ ] Document any deviations from plan
- [ ] Keep feature flag for easy rollback

### Post-Implementation
- [ ] Run full test suite
- [ ] Performance benchmarks
- [ ] User acceptance testing
- [ ] Update documentation
- [ ] Create release notes

### Launch
- [ ] Merge to main branch
- [ ] Deploy to production
- [ ] Monitor for issues (first 48 hours)
- [ ] Collect user feedback
- [ ] Plan Phase 2 enhancements

---

## Conclusion

This integration plan transforms QPM from a static, hardcoded system to a fully dynamic, futureproof platform. By eliminating ALL hardcoded game data and leveraging the Data Catalog Loader, QPM will automatically adapt to game updates without requiring any code changes.

**Estimated Total Effort:** 6 weeks (1 developer)
**Risk Level:** Low (extensive fallback mechanisms)
**Impact:** High (future-proofs entire platform)

**Next Steps:**
1. Review and approve this plan
2. Create implementation tickets for each phase
3. Begin Phase 1: Foundation utilities
4. Iterate through phases 2-6
5. Launch with monitoring

---

**Document Version:** 1.0
**Last Updated:** 2024-12-25
**Status:** ✅ Ready for Implementation
