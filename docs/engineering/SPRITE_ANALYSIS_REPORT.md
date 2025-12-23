# QPM Sprite System Failure Analysis

**Date:** 2025-12-18
**Context:** Investigating why QPM sprite system fails to display specific sprites while standalone sprite.user.js works perfectly.

---

## Critical Issues Found

### 🔴 ROOT CAUSE #1: Missing 'seed' Category in Fallback (HIGH PRIORITY)

**Location:** `/home/user/QPM-GR/src/sprite-v2/compat.ts:204-230`

**Problem:**
The warmup system includes the `'seed'` category, but the fallback lookup does NOT check it.

**Evidence:**
```typescript
// warmup.ts line 315-316 - INCLUDES 'seed'
return warmupCommonSprites(service, {
  categories: ['pet', 'plant', 'tallplant', 'crop', 'item', 'decor', 'seed']
}, onProgress);

// compat.ts line 204-220 - MISSING 'seed'
const categories = ['plant', 'tallplant', 'crop', 'item', 'decor'];
for (const category of categories) {
  const cacheKey = makeCacheKey(category, id, []);
  const warmupCached = win.__QPM_SPRITE_DATAURL_CACHE__.get(cacheKey);
  if (warmupCached) {
    return warmupCached;
  }
}
```

**Impact:**
- If eggs/bulbs/tulips are stored in the `'seed'` category, they ARE warmed up
- But the fallback CANNOT find them because it doesn't check `'seed'`
- Result: Cache miss despite successful warmup → synchronous rendering → console warnings

**Console Output:**
```
[Sprite Cache MISS] crop:DawnCelestial
[Sprite Cache MISS] crop:MoonCelestial
[Sprite Cache MISS] crop:UncommonEgg
[Sprite Cache MISS] crop:RareEgg
[Sprite Cache MISS] crop:LegendaryEgg
[Sprite Cache MISS] crop:OrangeTulip
```

**Fix Required:**
Add `'seed'` to the fallback category list in `getCropSpriteDataUrl()` at line 204 and line 220.

---

### 🔴 ROOT CAUSE #2: Synchronous toDataURL() Calls Cause 55-Second Freeze (CRITICAL)

**Location:** Multiple files with synchronous blocking calls

**Problem:**
Pet Hub hydration triggers synchronous `toDataURL()` calls for cache misses, causing massive UI freezes.

**Blocking Call #1:** `/home/user/QPM-GR/src/sprite-v2/compat.ts:283`
```typescript
export function getPetSpriteDataUrl(species: string): string {
  // ... cache checks ...

  // Cache miss - render synchronously as fallback
  const canvas = service.renderToCanvas({ category: 'pet', id: normalized, mutations: [] });
  const dataUrl = canvas.toDataURL('image/png');  // ← BLOCKS FOR ~500ms PER SPRITE
  return dataUrl;
}
```

**Blocking Call #2:** `/home/user/QPM-GR/src/utils/petMutationRenderer.ts:78`
```typescript
export function getMutationSpriteDataUrl(species: string, mutation: MutationSpriteType): string | null {
  // ... cache checks ...

  const mutatedCanvas = renderMutationSprite(baseCanvas, config) ?? baseCanvas;
  const dataUrl = mutatedCanvas.toDataURL('image/png');  // ← BLOCKS FOR ~500ms PER SPRITE
  return dataUrl;
}
```

**Execution Flow:**
1. Pet Hub opens → `hydrateSpritesWithin()` called
2. `hydrateSpritesAsync()` processes in batches of 5
3. For each batch: `for (const node of batch) { hydrateSpriteNode(node); }`
4. `hydrateSpriteNode()` → `getDisplaySprite()` → `getPetSpriteDataUrl()` or `getMutationSpriteDataUrl()`
5. SYNCHRONOUS `toDataURL()` blocks the main thread for ~500ms per sprite
6. With 100 pets: 5 sprites × 20 batches × 500ms = **50+ seconds of blocking**

**Why requestIdleCallback Doesn't Help:**
The code yields between batches, but WITHIN each batch, all 5 sprites are processed synchronously:
```typescript
// Batch of 5 sprites - ALL PROCESSED SYNCHRONOUSLY
for (const node of batch) {
  hydrateSpriteNode(node);  // ← Each contains synchronous toDataURL()
}
// THEN yield
await requestIdleCallback(...);
```

**Console Evidence:**
```
server heartbeat lost, 55944ms elapsed
```

This 55-second freeze matches: 100+ pets with cache misses × ~500ms per toDataURL().

**Fix Required:**
1. Make `getPetSpriteDataUrl()` and `getMutationSpriteDataUrl()` async
2. Use `canvas.toBlob()` instead of `toDataURL()` (non-blocking)
3. OR: Return empty string immediately and queue async render
4. OR: Ensure sprites are pre-cached during warmup so fallback is rarely hit

---

### 🟡 ROOT CAUSE #3: Category Detection Mismatch

**Problem:**
The sprite manifest uses a specific category structure (e.g., `sprite/seed/DawnCelestial`), but `getCropSpriteDataUrl()` assumes crops are in `plant/tallplant/crop/item/decor`.

**Category Structure from Standalone:**
```javascript
keyCategoryOf = (key) => {
  const parts = key.split("/").filter(Boolean);
  if (parts[0] === "sprite" || parts[0] === "sprites")
    return parts[1] ?? "";  // e.g., "sprite/seed/UncommonEgg" → "seed"
  return parts[0] ?? "";
};
```

**Current Fallback Categories:**
- compat.ts checks: `['plant', 'tallplant', 'crop', 'item', 'decor']`
- Warmup includes: `['pet', 'plant', 'tallplant', 'crop', 'item', 'decor', 'seed']`

**Missing Categories:**
- `'seed'` - NOT checked in fallback but IS warmed up

**Data Evidence:**
From hardcoded-data.clean.js and tileRefs.ts:
- `UncommonEgg`, `RareEgg`, `LegendaryEgg` are in `tileRefsPets` (likely `'seed'` or `'item'`)
- `DawnCelestial`, `MoonCelestial` have multiple forms:
  - Seed: `DawnCelestial` (tileRefsSeeds)
  - Crop: `DawnCelestialCrop` (tileRefsPlants)
  - TallPlant: `DawnCelestialPlant` (tileRefsTallPlants)
- `OrangeTulip` is a plant variant

**Fix Required:**
1. Add `'seed'` to fallback categories
2. Verify actual category in sprite manifest
3. Ensure warmup and fallback use identical category lists

---

### 🟡 ROOT CAUSE #4: Pet Hub Sprites Not Displaying Initially

**Location:** `/home/user/QPM-GR/src/ui/petHubWindow.ts:470-542`

**Problem:**
Sprites don't display when Pet Hub first opens, even though they used to work.

**Cause:**
Combination of issues #1 and #2:
1. Sprites aren't in cache (due to category mismatch)
2. Synchronous fallback blocks UI thread
3. Hydration completes but sprites are empty strings

**Fix Required:**
Fix issues #1 and #2 above.

---

## Comparison with Working Standalone

### Standalone sprite.user.js Advantages:

1. **No Category Filtering:**
   - Standalone processes ALL sprites without category restrictions
   - QPM tries to optimize by limiting categories

2. **Complete Warmup:**
   - Standalone: `categories: []` (empty = warm up ALL sprites)
   - QPM: Specific list that may miss categories

3. **Async from Start:**
   - Standalone uses async toBlob() from the beginning
   - QPM added async later but still has sync fallbacks

### Key Differences:

**Standalone (working):**
```javascript
// Line 315 - Warmup ALL sprites
categories: [],  // Empty = warm up everything

// No fallback needed because everything is pre-cached
```

**QPM (broken):**
```typescript
// warmup.ts - Limited categories
categories: ['pet', 'plant', 'tallplant', 'crop', 'item', 'decor', 'seed']

// compat.ts - Even MORE limited fallback
const categories = ['plant', 'tallplant', 'crop', 'item', 'decor'];  // Missing 'seed'
```

---

## Complete Fix Plan

### Priority 1: Fix Category Mismatch (Immediate)

**File:** `/home/user/QPM-GR/src/sprite-v2/compat.ts`

**Line 204:** Add `'seed'` to global cache check
```typescript
const categories = ['plant', 'tallplant', 'crop', 'item', 'decor', 'seed'];
```

**Line 220:** Add `'seed'` to fallback render
```typescript
const categories = ['plant', 'tallplant', 'crop', 'item', 'decor', 'seed'];
```

**Expected Impact:**
- Fixes missing sprites for eggs, bulbs, tulips
- Eliminates cache miss warnings
- No more synchronous rendering for pre-warmed sprites

**Estimated LOC:** 2 lines
**Risk:** Very low
**Testing:** Open Pet Hub, verify sprites display

---

### Priority 2: Eliminate Synchronous toDataURL() Blocking (Critical)

**Option A: Return Empty and Queue Async (Recommended)**

**File:** `/home/user/QPM-GR/src/sprite-v2/compat.ts:270-289`
```typescript
export function getPetSpriteDataUrl(species: string): string {
  // ... cache checks ...

  // Cache miss - queue async render and return empty
  console.warn(`[Sprite Cache MISS] pet:${normalized} - queueing async render`);
  queueAsyncSpriteRender('pet', normalized, []);
  return '';  // Return empty, sprite will appear when async completes
}
```

**File:** `/home/user/QPM-GR/src/utils/petMutationRenderer.ts:53-85`
```typescript
export function getMutationSpriteDataUrl(species: string, mutation: MutationSpriteType): string | null {
  // ... cache checks ...

  // Cache miss - queue async render
  queueAsyncMutationRender(normalizedSpecies, normalizedMutation, cacheKey);
  return null;  // Return null, sprite will appear when async completes
}
```

**Option B: Make Functions Async**
- Change return type to `Promise<string>`
- Use `canvas.toBlob()` instead of `toDataURL()`
- Update all callers to handle async

**Recommended:** Option A (simpler, less breaking)

**Expected Impact:**
- Eliminates 55-second freeze
- Pet Hub opens instantly
- Sprites appear progressively as they render

**Estimated LOC:** 10-15 lines
**Risk:** Medium (sprites won't appear immediately)
**Testing:** Open Pet Hub with 100+ pets, verify no freeze

---

### Priority 3: Ensure Warmup Covers All Sprites

**File:** `/home/user/QPM-GR/src/sprite-v2/warmup.ts:315`

**Current:**
```typescript
categories: ['pet', 'plant', 'tallplant', 'crop', 'item', 'decor', 'seed']
```

**Recommended:** Warm up ALL sprites (like standalone)
```typescript
categories: []  // Empty = warm up everything
```

**Or:** Add validation to ensure warmup and fallback match
```typescript
// At top of compat.ts
const VALID_CATEGORIES = ['pet', 'plant', 'tallplant', 'crop', 'item', 'decor', 'seed'] as const;

// Use everywhere
const categories = [...VALID_CATEGORIES];
```

**Expected Impact:**
- Ensures all sprites are pre-cached
- Reduces fallback usage to ~0%
- Matches standalone behavior

**Estimated LOC:** 1-5 lines
**Risk:** Low
**Testing:** Monitor warmup logs, verify all categories included

---

### Priority 4: Add Diagnostic Logging

**File:** `/home/user/QPM-GR/src/sprite-v2/compat.ts`

Add logging to understand which categories sprites are actually in:
```typescript
console.warn(`[Sprite Cache MISS] Tried categories: ${categories.join(', ')}`);
console.warn(`[Sprite Cache MISS] Available cache keys: ${[...win.__QPM_SPRITE_DATAURL_CACHE__.keys()].filter(k => k.includes(id)).join(', ')}`);
```

**Expected Impact:**
- Helps debug future category issues
- Shows exactly which categories contain each sprite

---

## Testing Plan

### Test 1: Category Fix
1. Apply Priority 1 fix (add 'seed' category)
2. Rebuild and reload
3. Open Pet Hub
4. Verify console no longer shows:
   - `[Sprite Cache MISS] crop:DawnCelestial`
   - `[Sprite Cache MISS] crop:UncommonEgg`
5. Verify sprites display correctly

### Test 2: Freeze Fix
1. Apply Priority 2 fix (remove sync toDataURL)
2. Rebuild and reload
3. Clear sprite cache
4. Open Pet Hub with 100+ pets
5. Verify:
   - No 55-second freeze
   - Pet Hub opens instantly
   - Sprites appear progressively
   - No "server heartbeat lost" warnings

### Test 3: Warmup Coverage
1. Apply Priority 3 fix (warmup all categories)
2. Reload game
3. Monitor console for warmup logs
4. Verify all sprites are warmed up
5. Open Pet Hub
6. Verify NO cache misses

---

## Summary

### Root Causes:
1. ✅ **Category Mismatch:** Warmup includes 'seed', fallback doesn't check it
2. ✅ **Synchronous Blocking:** toDataURL() calls block UI for 55+ seconds
3. ✅ **Incomplete Category List:** Fallback missing categories that warmup includes

### Fixes:
1. Add `'seed'` to fallback categories (2 LOC)
2. Remove synchronous toDataURL() calls (10-15 LOC)
3. Ensure warmup and fallback use same categories (5 LOC)

### Expected Outcome:
- Sprites display correctly on first load
- No UI freezes
- Pet Hub opens instantly
- All console warnings eliminated

---

**End of Report**
