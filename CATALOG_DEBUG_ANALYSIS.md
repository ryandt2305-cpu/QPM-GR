# Catalog Integration Deep Analysis

## Problem Statement
1. ❌ `__QPM_DiagnoseCatalogs()` command not available
2. ❌ Crop size indicator not showing for new plants (Pine Tree)
3. ❌ Auto Favorite filter dropdowns empty for plants/pets (but abilities work!)
4. ✅ Ability filter dropdown DOES work (proving catalogs CAN be captured)

---

## Root Cause Analysis

### Issue 1: Diagnostic Function Not Exposed
**File:** `src/main.ts` Line 42 & 1276-1279

**Current State:**
```typescript
// Line 42: Import missing diagnoseCatalogs
import { initCatalogLoader, logCatalogStatus, getCatalogs, areCatalogsReady, waitForCatalogs } from './catalogs/gameCatalogs';

// Lines 1276-1279: Not exposing diagnoseCatalogs
(QPM_DEBUG_API as any).getCatalogs = getCatalogs;
(QPM_DEBUG_API as any).areCatalogsReady = areCatalogsReady;
(QPM_DEBUG_API as any).waitForCatalogs = waitForCatalogs;
(QPM_DEBUG_API as any).logCatalogStatus = logCatalogStatus;
// ❌ diagnoseCatalogs NOT exposed!
```

**Fix:** Import and expose `diagnoseCatalogs`

---

### Issue 2: Timing Problem - Features Init Before Catalogs Ready

**Initialization Order (from main.ts):**
```
1. Line 1181: initCatalogLoader() - Hooks installed
2. Line 1204: await waitForGame() - Wait for game UI
3. Lines 1208-1223: Initialize stores (XP, inventory, etc.)
4. Line 1225: await startGardenBridge()
5. Line 1257: initCropSizeIndicator() ← TOO EARLY!
6. Line 1219: initializeAutoFavorite() ← TOO EARLY!
```

**Problem:** Features initialize ~2-3 seconds after page load, but catalogs take **30-60 seconds** to capture!

**Evidence:**
- ✅ Abilities work → petAbilities catalog IS captured
- ❌ Plants/pets don't work → plantCatalog/petCatalog NOT captured YET when features init

---

### Issue 3: UI Renders Before Catalogs Load

**Auto Favorite Initialization:**
```typescript
// src/features/autoFavorite.ts line 53-64
export function getAvailableFilterOptions() {
  return {
    species: areCatalogsReady() ? getAllPlantSpecies() : [],  // ← Returns [] if not ready!
    abilities: areCatalogsReady() ? getAllAbilities() : [],
    mutations: areCatalogsReady() ? Object.keys(getAllMutations()) : [],
    cropTypes: getAllCropCategories(),
  };
}
```

When UI renders, if `areCatalogsReady() === false`, dropdowns get empty arrays and NEVER update!

---

### Issue 4: Catalog Capture May Be Incomplete

**Detection Logic (catalogLoader.ts lines 155-176):**
```typescript
function looksLikePlantCatalog(obj, keys) {
  const commonPlants = ['Carrot', 'Strawberry', 'Aloe', 'Blueberry', 'Apple', 'Tomato', 'Corn'];
  const matchCount = commonPlants.filter(k => keys.includes(k)).length;

  if (matchCount < 3) return false;  // ← Requires 3 of 7 common plants
  // ...
}
```

**Concern:** What if "Pine" or "PineTree" isn't in the captured catalog object at all?
- Possible game sends Pine Tree data LATER in a separate update
- Catalog object might be mutable and we captured a snapshot before Pine Tree was added

---

## Solution Strategy

### Phase 1: Add Proper Diagnostics ✅
- [x] Import and expose `diagnoseCatalogs` function
- [x] Add catalog status logging on init
- [ ] Add console command to manually check catalogs

### Phase 2: Fix Timing Issues ⚠️
**Option A: Wait for catalogs before initializing features**
```typescript
// In main.ts, before feature init:
await waitForCatalogs(30000);  // Wait up to 30s for catalogs
initCropSizeIndicator();
initializeAutoFavorite();
```

**Option B: Reactive updates when catalogs load**
```typescript
// In auto favorite UI:
onCatalogsReady(() => {
  refreshFilterDropdowns();  // Re-populate dropdowns when ready
});
```

**Option C: Deferred initialization**
```typescript
// Don't init features until catalogs confirmed ready
if (areCatalogsReady()) {
  initFeatures();
} else {
  onCatalogsReady(() => initFeatures());
}
```

### Phase 3: Add Reactive Catalog Updates ⚠️
**Problem:** Even if we wait, catalogues might update AFTER initial capture

**Solution:** Re-scan catalogs periodically or on-demand
```typescript
// Add to catalogLoader.ts:
export function rescanCatalogs() {
  // Manually trigger deep scan of current game state
  const gameWindow = unsafeWindow || window;
  for (const key in gameWindow) {
    deepScan(gameWindow[key], 0);
  }
}
```

### Phase 4: Fallback to Direct Game State Access 🔥
**Nuclear Option:** If catalog capture fails, directly access game state

```typescript
// Instead of relying on passive capture:
function getAllPlantSpeciesDirect() {
  const gameWindow = unsafeWindow || window;
  // Search for catalog directly in game state
  // (requires reverse engineering game's state structure)
}
```

---

## Recommended Fix Order

1. **IMMEDIATE:** Expose diagnostic function
2. **HIGH PRIORITY:** Add `onCatalogsReady` callbacks to auto favorite UI
3. **HIGH PRIORITY:** Wait for catalogs in `initCropSizeIndicator()`
4. **MEDIUM:** Add periodic catalog re-scan (every 60s for first 5 minutes)
5. **LOW:** Add manual rescan command

---

## Testing Plan

### Step 1: Verify Catalog Capture
```javascript
// In console after fix:
QPM.logCatalogStatus()
// Should show: plantCatalog ✅ (XX species), petCatalog ✅ (XX species)

// Check specific species:
window.__QPM_CATALOGS.plantCatalog["PineTree"]
window.__QPM_CATALOGS.plantCatalog["Pine"]
Object.keys(window.__QPM_CATALOGS.plantCatalog)
```

### Step 2: Verify Timing
```javascript
// Check when catalogs become ready:
console.log('Catalogs ready at:', performance.now(), 'ms after page load')
```

### Step 3: Verify UI Updates
- Open Auto Favorite settings immediately after page load → Should show "Loading..." or empty
- Wait 30-60 seconds, check again → Should populate with all species
- OR: Add refresh button to manually reload dropdown options

---

## Next Steps
1. Fix diagnostic exposure
2. Add detailed logging to see WHEN catalogs load vs WHEN features init
3. Implement reactive updates for UI
4. Test with Pine Tree specifically
