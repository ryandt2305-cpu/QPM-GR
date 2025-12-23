# Cache Key Mismatch Root Cause Analysis

## Critical Issue
Sprite warmup caches 187 sprites successfully, but EVERY sprite lookup results in cache miss. This means cache keys don't match between warmup storage and lookup.

## Evidence from Console
```
[Sprite Warmup] tallplant: 11 sprites (samples: Bamboo, Cactus, DawnCelestialPlant, DawnCelestialPlantActive, DawnCelestialPlatform)
[Sprite Cache MISS] crop:DawnCelestial
```

## Root Cause

### 1. Warmup Cache Key Format (`warmup.ts:233`)
```typescript
const cacheKey = `${task.category}:${task.id}:`;
```

Where `task.id` comes from:
```typescript
const id = extractSpriteId(key); // Extracts last part of "sprite/tallplant/DawnCelestialPlant"
// id = "DawnCelestialPlant" (from manifest)
```

**Warmup stores:**
- `tallplant:DawnCelestialPlant:`
- `plant:DawnCelestialCrop:`
- `seed:DawnCelestial:`
- `tallplant:MoonCelestialPlant:`
- `plant:MoonCelestialCrop:`
- `seed:MoonCelestial:`
- `plant:Tulip:`
- `pet:MythicalEgg:`

### 2. Lookup Cache Key Format (`compat.ts:52`)
```typescript
function makeCacheKey(category: string, id: string, mutations: string[] = []): string {
  const mutStr = mutations.length > 0 ? mutations.sort().join(',') : '';
  return `${category}:${id}:${mutStr}`;
}
```

Where `id` comes from:
```typescript
const id = normalizeSpeciesName(speciesOrTile);
// Line 151: if (lower === 'dawncelestial') return 'DawnCelestial';
// id = "DawnCelestial" (WITHOUT "Plant" or "Crop" suffix!)
```

**Lookup tries:**
- `plant:DawnCelestial:` ❌ (warmup has `plant:DawnCelestialCrop:`)
- `tallplant:DawnCelestial:` ❌ (warmup has `tallplant:DawnCelestialPlant:`)
- `crop:DawnCelestial:` ❌ (doesn't exist)
- `seed:DawnCelestial:` ✓ (FINDS SEED, not the plant!)

## Sprite ID Mismatches

### DawnCelestial / Dawnbinder
**Manifest IDs:**
- Seed: `sprite/seed/DawnCelestial` (tileRefsSeeds.DawnCelestial = 7)
- Crop: `sprite/plant/DawnCelestialCrop` (tileRefsPlants.DawnCelestialCrop = 51)
- Tall Plant: `sprite/tallplant/DawnCelestialPlant` (tileRefsTallPlants.DawnCelestialPlant = 4)

**Lookup attempts:**
- Input: `"DawnCelestial"` or `"Dawnbinder"`
- Normalized: `"DawnCelestial"`
- Cache keys tried: `plant:DawnCelestial:`, `tallplant:DawnCelestial:`, etc.
- **Result:** Only finds `seed:DawnCelestial:` (wrong sprite for grown plants!)

### MoonCelestial / Moonbinder
**Manifest IDs:**
- Seed: `sprite/seed/MoonCelestial` (tileRefsSeeds.MoonCelestial = 8)
- Crop: `sprite/plant/MoonCelestialCrop` (tileRefsPlants.MoonCelestialCrop = 52)
- Tall Plant: `sprite/tallplant/MoonCelestialPlant` (tileRefsTallPlants.MoonCelestialPlant = 10)

**Same issue as DawnCelestial**

### Tulip Color Variants
**Manifest IDs:**
- Seed: `sprite/seed/Tulip` (tileRefsSeeds.Tulip = 2)
- Plant: `sprite/plant/Tulip` (tileRefsPlants.Tulip = 12)
- **No color variants in manifest!** (OrangeTulip, RedTulip, etc. don't exist as separate sprites)

**Lookup attempts:**
- Input: `"OrangeTulip"`, `"RedTulip"`, etc.
- Normalized: `"OrangeTulip"`, `"RedTulip"` (keeps color prefix)
- Cache keys tried: `plant:OrangeTulip:`, `seed:OrangeTulip:`, etc.
- **Result:** NEVER finds `plant:Tulip:` (cache miss!)

### MythicalEgg
**Manifest IDs:**
- Pet: `sprite/pet/MythicalEgg` (tileRefsPets.MythicalEgg = 15)

**Lookup attempts:**
- Input: `"MythicalEgg"`
- Normalized: `"MythicalEgg"`
- Cache keys tried: `plant:MythicalEgg:`, `pet:MythicalEgg:`, etc.
- **Result:** Eventually finds `pet:MythicalEgg:` ✓ (works, but only after trying wrong categories first)

## API Layer Issue

The `findItem()` function in `api.ts` also can't find sprites due to normalization:

```typescript
// api.ts:33
function findItem(state: SpriteState, category: SpriteCategory, id: string): SpriteItem | null {
  const normId = normalizeKey(id); // "dawncelestial"

  for (const it of state.items) {
    const base = normalizeKey(baseNameOf(it.key)); // "dawncelestialplant"
    if (base === normId) return it; // "dawncelestialplant" !== "dawncelestial" ❌
  }

  return null;
}
```

## Simulation Results

### Warmup Cache Contents:
```
seed:DawnCelestial:
plant:DawnCelestialCrop:
tallplant:DawnCelestialPlant:
seed:MoonCelestial:
plant:MoonCelestialCrop:
tallplant:MoonCelestialPlant:
seed:Tulip:
plant:Tulip:
pet:MythicalEgg:
```

### Lookup Behavior:

**Looking up "DawnCelestial":**
```
Normalized: "DawnCelestial"
Trying: plant:DawnCelestial: ❌
Trying: tallplant:DawnCelestial: ❌
Trying: crop:DawnCelestial: ❌
Trying: item:DawnCelestial: ❌
Trying: decor:DawnCelestial: ❌
Trying: seed:DawnCelestial: ✓ FOUND
Result: Returns SEED sprite (wrong for displaying grown plants!)
```

**Looking up "OrangeTulip":**
```
Normalized: "OrangeTulip"
Trying: plant:OrangeTulip: ❌
Trying: tallplant:OrangeTulip: ❌
Trying: crop:OrangeTulip: ❌
Trying: item:OrangeTulip: ❌
Trying: decor:OrangeTulip: ❌
Trying: seed:OrangeTulip: ❌
Trying: pet:OrangeTulip: ❌
Result: CACHE MISS → falls back to synchronous render (SLOW!)
```

## The Fix

### Location: `/home/user/QPM-GR/src/sprite-v2/compat.ts`

Add a function to generate cache key variations that match the manifest IDs:

```typescript
/**
 * Generate cache key variations to match manifest sprite IDs
 * This bridges the gap between display names and manifest structure
 */
function getCacheKeyVariations(category: string, id: string): string[] {
  const variations = [id]; // Try original first

  // Celestial crops: manifest has "Crop" suffix for plant, "Plant" suffix for tallplant
  if (id === 'DawnCelestial' || id === 'MoonCelestial') {
    if (category === 'plant') {
      variations.push(id + 'Crop'); // DawnCelestial → DawnCelestialCrop
    }
    if (category === 'tallplant') {
      variations.push(id + 'Plant'); // DawnCelestial → DawnCelestialPlant
    }
  }

  // Color variants: try base name without color prefix
  // OrangeTulip → Tulip, RedTulip → Tulip, etc.
  const colorMatch = id.match(/^(Orange|Red|Yellow|Pink|Purple|White)(.+)$/);
  if (colorMatch) {
    variations.push(colorMatch[2]); // Extract base name
  }

  return variations;
}
```

Update `getCropSpriteDataUrl()` to try variations (around line 218):

```typescript
// Check global warmup cache (populated during background warmup)
const win = (window as any);
if (win.__QPM_SPRITE_DATAURL_CACHE__) {
  for (const category of CROP_CATEGORIES) {
    const variations = getCacheKeyVariations(category, id); // NEW
    for (const variant of variations) { // NEW
      const cacheKey = makeCacheKey(category, variant, []); // Use variant
      const warmupCached = win.__QPM_SPRITE_DATAURL_CACHE__.get(cacheKey);
      if (warmupCached) {
        addToDataUrlCache(cacheKey, warmupCached);
        return warmupCached;
      }
    }
  }
}
```

Update similar logic in `getCropSpriteDataUrlWithMutations()` (around line 420).

## Expected Results After Fix

**Looking up "DawnCelestial":**
```
Normalized: "DawnCelestial"
Variations for plant: ["DawnCelestial", "DawnCelestialCrop"]
Trying: plant:DawnCelestial: ❌
Trying: plant:DawnCelestialCrop: ✓ FOUND
Result: Returns correct crop sprite from cache!
```

**Looking up "OrangeTulip":**
```
Normalized: "OrangeTulip"
Variations for plant: ["OrangeTulip", "Tulip"]
Trying: plant:OrangeTulip: ❌
Trying: plant:Tulip: ✓ FOUND
Result: Returns base tulip sprite from cache!
```

## Summary

### Cache Key Format Discrepancy:
- **Warmup uses:** Manifest IDs (e.g., `DawnCelestialPlant`, `DawnCelestialCrop`, `Tulip`)
- **Lookup uses:** Normalized display names (e.g., `DawnCelestial`, `OrangeTulip`)

### Specific Mismatches:
1. `DawnCelestial` → `DawnCelestialCrop` (plant), `DawnCelestialPlant` (tallplant)
2. `MoonCelestial` → `MoonCelestialCrop` (plant), `MoonCelestialPlant` (tallplant)
3. `OrangeTulip` → `Tulip` (all color variants)
4. `RedTulip` → `Tulip`
5. `YellowTulip` → `Tulip`
6. `PinkTulip` → `Tulip`
7. `PurpleTulip` → `Tulip`

### Fix Required:
Add cache key variation logic in `compat.ts` to try manifest ID variations when looking up sprites in the warmup cache. This allows lookup using display names to find sprites cached with manifest IDs.
