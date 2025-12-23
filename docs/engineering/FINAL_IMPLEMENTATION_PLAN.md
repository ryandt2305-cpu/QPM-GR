# QPM Final Implementation Plan v3.0.5

## Overview

This document outlines the comprehensive implementation plan for QPM cleanup, optimization, and enhancement. All changes maintain backward compatibility and preserve existing functionality.

---

## Phase 1: Dead Code & Feature Removal (COMPLETE DELETION)

### 1.1 Auto-Feed/Auto-Shop UI Removal

**Action:** Complete deletion (not rename/comment)

**Files to modify:**
- `src/ui/originalPanel.ts`
  - Delete `headerAutoFeed` and `headerShop` from UIState interface
  - Delete `dashboardFeedList` and `dashboardFeedMeta` elements
  - Delete `latestFeedStatusText` variable
  - Delete `AutoShopItemConfig` interface
  - Delete `updateDashboardFeedDisplay()` function
  - Delete `computeShopItemRank()` function
  - Simplify `refreshHeaderStats()` to only handle weather info

### 1.2 Debug API Cleanup

**Files to modify:**
- `src/debug/debugApi.ts`
  - Delete all `feedPet`, `feedPetByIds`, `feedAllPets` functions
  - Delete `isInstantFeedAvailable` function
  - Delete weather swapper references
  - Clean up any orphaned imports

### 1.3 Achievement Cleanup

**Files to modify:**
- `src/store/achievements.ts`
  - Delete `instantFeedsUsed` variable
  - Delete `recordInstantFeedUse()` function
  - Delete all "Pet Chow Line" achievement definitions
  - Remove `instantFeedsUsed` from `AchievementSnapshot`

### 1.4 Feature File Deletion

**Files to DELETE entirely:**
- `src/features/cropTypeLocking.ts` (replaced by `bulkFavorite.ts`)
- Any weather swapper related files (search and identify)

### 1.5 Dead Stats Functions (DELETE, not comment)

**Files to modify:**
- `src/ui/originalPanel.ts`
  - Delete any unused stat calculation functions
  - Delete orphaned helper functions

---

## Phase 2: Performance Optimizations

### 2.1 Jotai Bridge Stability (Priority: HIGH)

**Problem:** QPM and Aries Mod conflict when both running - `[jotai-bridge] jotaiAtomCache.cache introuvable`

**Research Required:**
- Analyze MGTools' method for getting Jotai data (different approach, no conflict)
- Cross-check QPM vs Aries Mod store capture mechanisms

**Files to modify:**
- `src/core/jotaiBridge.ts`
  - Add Aries Mod store detection: check `(pageWindow).AriesMod?.services?.jotaiStore`
  - Implement `waitForAriesModStore()` polling function (up to 3 seconds)
  - Prioritize existing stores over capturing new ones
  - Reduce polling interval from 750ms to 500ms
  - Add robust logging for which capture method was used

**Implementation:**
```typescript
// Priority order for store acquisition:
// 1. Check if Aries Mod exposed its store
// 2. Check for existing shared store on window
// 3. Wait briefly for Aries Mod if detected but store not ready
// 4. Fall back to QPM's own capture mechanisms
```

### 2.2 MutationObserver Consolidation

**Problem:** Multiple MutationObservers watching similar DOM areas

**Files to audit:**
- `src/features/bulkFavorite.ts`
- `src/features/autoFavorite.ts`
- `src/features/harvestReminder.ts`
- `src/ui/originalPanel.ts`

**Action:**
- Consolidate into shared observer where possible
- Ensure all observers use `{ childList: true, subtree: false }` (minimal scope)
- Add cleanup on feature stop

### 2.3 Event Listener Cleanup

**Audit all files for:**
- `addEventListener` without corresponding `removeEventListener`
- `setInterval` without `clearInterval`
- `setTimeout` references that should be cleared

**Files to check:**
- All files in `src/features/`
- All files in `src/ui/`
- `src/store/` files

### 2.4 Sprite System Optimization

**Current state:** Already optimized with:
- Parallel atlas prefetching
- Cooperative yielding during texture loading
- `qpm-sprites-ready` event system
- `data-qpm-sprite` attribute for auto-refresh

**Verify:**
- All UI components subscribe to sprite ready events
- No synchronous blocking on sprite loading

---

## Phase 3: Sprite & Emoji Fixes

### 3.1 Pet Comparison Hub - Replace Pet Emojis with Sprites

**File:** `src/ui/petComparisonHub.ts`

**Current problematic code:**
```typescript
const PET_EMOJI: Record<string, string> = {
  rabbit: '🐰',
  chicken: '🐔',
  cow: '🐄',
  // ... more emojis
};
```

**Replace with:**
```typescript
import { getPetSpriteDataUrl } from '../sprite-v2/compat';

function getPetSpriteOrFallback(species: string | null): string {
  if (!species) return '🐾'; // Fallback for unknown
  const spriteUrl = getPetSpriteDataUrl(species);
  if (spriteUrl) {
    return `<img src="${spriteUrl}" alt="${species}" style="width:32px;height:32px;object-fit:contain;image-rendering:pixelated;" data-qpm-sprite="pet:${species}" />`;
  }
  return '🐾'; // Fallback if sprite not ready
}
```

**Delete:** The entire `PET_EMOJI` constant and `getPetEmoji()` function.

### 3.2 Pet Displays Throughout UI - Add Ability Badges

**Requirement:** Where user's specific pets are shown, display pet sprite WITH ability color badges.

**Files to modify:**
- `src/ui/trackerWindow.ts` - Ability tracker pet rows
- `src/ui/xpTrackerWindow.ts` - XP tracker pet rows
- `src/ui/petHubWindow.ts` - Pet hub cards
- `src/utils/petCardRenderer.ts` - Shared pet rendering

**Implementation pattern:**
```typescript
function renderPetWithAbilities(pet: { species: string; abilities?: any[] }): string {
  const spriteUrl = getPetSpriteDataUrl(pet.species);
  const abilitySquares = pet.abilities?.map(ability => {
    const color = getAbilityColor(ability.id || ability);
    return `<div style="width:6px;height:6px;background:${color};border-radius:1px;"></div>`;
  }).join('') || '';
  
  return `
    <div style="display:flex;align-items:center;gap:4px;">
      ${abilitySquares ? `<div style="display:flex;flex-direction:column;gap:2px;">${abilitySquares}</div>` : ''}
      <img src="${spriteUrl}" alt="${pet.species}" 
           style="width:32px;height:32px;object-fit:contain;image-rendering:pixelated;"
           data-qpm-sprite="pet:${pet.species}" />
    </div>
  `;
}
```

### 3.3 Ability Color Mapping

**File:** Create or update `src/utils/abilityColors.ts`

**Map ability categories to colors:**
```typescript
export const ABILITY_CATEGORY_COLORS: Record<string, string> = {
  'coin': '#FFD700',      // Gold - coin-related abilities
  'growth': '#4CAF50',    // Green - growth boosters
  'mutation': '#9C27B0',  // Purple - mutation boosters
  'hunger': '#FF9800',    // Orange - hunger-related
  'egg': '#42A5F5',       // Blue - egg-related
  'sell': '#E91E63',      // Pink - sell boosters
  'weather': '#00BCD4',   // Cyan - weather abilities
  'misc': '#9E9E9E',      // Gray - miscellaneous
};

export function getAbilityColor(abilityId: string): string {
  // Map ability IDs to categories based on petAbilities.ts
  const categoryMap: Record<string, string> = {
    'CoinFinderI': 'coin',
    'CoinFinderII': 'coin',
    'CoinFinderIII': 'coin',
    'GoldGranter': 'coin',
    'RainbowGranter': 'mutation',
    'ProduceScaleBoost': 'growth',
    'PlantGrowthBoost': 'growth',
    'EggGrowthBoost': 'egg',
    'HungerRestore': 'hunger',
    'SellBoostI': 'sell',
    // ... complete mapping
  };
  
  const category = categoryMap[abilityId] || 'misc';
  return ABILITY_CATEGORY_COLORS[category];
}
```

### 3.4 Emoji Replacements Summary

**REPLACE with sprites:**
| Location | Current | Replace With |
|----------|---------|--------------|
| `petComparisonHub.ts` | `PET_EMOJI` map | `getPetSpriteDataUrl()` |
| Turtle Timer | `🐢` emoji | `sprite/pet/Turtle` (optional) |
| Pet displays | `🐾` fallback | Keep as fallback only |

**KEEP as emojis (no sprite equivalent):**
- `✅`, `❌`, `⚠️`, `ℹ️` - Status indicators
- `📊`, `📈`, `📉` - Chart icons
- `🔔`, `🔒`, `🔓` - UI indicators
- `💰`, `💎`, `🪙` - Currency (decorative)
- `⏱️`, `⏰` - Time indicators
- `🏆`, `⭐`, `🎯` - Achievement/decorative
- `❤️`, `🤍` - Favorite hearts (Bulk Favorite)
- `🍖` - Title decoration
- `📖` - Guide section

### 3.5 Shop Restock Tracker (Verify Working)

**File:** `src/ui/originalPanel.ts`

**Already implemented items:**
- Mythical Eggs → `sprite/pet/MythicalEgg`
- Starweaver → `sprite/plant/Starweaver`
- Dawnbinder → `sprite/plant/DawnCelestial` or `sprite/tallplant/DawnCelestialPlant`
- Moonbinder → `sprite/plant/MoonCelestial` or `sprite/tallplant/MoonCelestialPlant`

**Verify:** All use `data-qpm-sprite` attribute for auto-refresh when sprites load.

### 3.6 Journal Checker Section

**File:** `src/ui/journalCheckerSection.ts`

**Verify:**
- Species sprites render correctly
- `onSpritesReady` subscription triggers re-render
- Fallback displays gracefully if sprite missing

---

## Phase 4: Naming & Consistency Fixes

### 4.1 "Locker" → "Bulk Favorite" Rename

**Files to modify:**
- `src/ui/originalPanel.ts`
  - Rename tab from `'locker'` to `'bulk-favorite'`
  - Update `registerTab('locker', 'Locker', '🔒', ...)` → `registerTab('bulk-favorite', 'Bulk Favorite', '❤️', ...)`
  - Update section title in `createInventoryLockerSection()` → rename function to `createBulkFavoriteSection()`

### 4.2 Consistent Section Naming

**Audit all section names for:**
- Consistency in capitalization
- Matching feature names
- Clear, user-friendly labels

---

## Phase 5: Code Quality & Future-Proofing

### 5.1 TypeScript Strict Mode Compliance

**Check for:**
- Implicit `any` types
- Null/undefined handling
- Proper type exports

### 5.2 Error Handling

**Add try-catch to:**
- All sprite rendering functions
- WebSocket operations
- LocalStorage access
- Jotai atom reads

### 5.3 Logging Consistency

**Standardize log format:**
```typescript
// Good
log('✅ [BulkFavorite] Started');
log('⚠️ [BulkFavorite] No items found');
log('❌ [BulkFavorite] Error:', error);

// Bad - inconsistent
console.log('bulk favorite started');
```

---

## Phase 6: Testing & Verification

### 6.1 Feature Verification Checklist

- [ ] Bulk Favorite buttons appear next to inventory
- [ ] Bulk Favorite correctly toggles all items of species
- [ ] Shop Restock Tracker shows sprites
- [ ] Ability Tracker shows pet sprites with ability badges
- [ ] XP Tracker shows pet sprites
- [ ] Journal shows species sprites
- [ ] Auto-Favorite filters work (mutations, species, crops)
- [ ] Turtle Timer functions correctly
- [ ] Player Inspector works
- [ ] Public Rooms window works
- [ ] Crop Boost Tracker works
- [ ] Achievement tracking works
- [ ] Harvest Reminder overlay works
- [ ] Garden highlight overlay works

### 6.2 Performance Verification

- [ ] No 2-3 second freeze on startup
- [ ] Menus open without lag on Firefox
- [ ] No memory leaks after extended use
- [ ] Works on low-end systems

### 6.3 Compatibility Verification

- [ ] QPM works standalone
- [ ] QPM works alongside Aries Mod
- [ ] No console errors about Jotai conflicts
- [ ] Both mods can access game state

---

## Implementation Order

### Day 1: Dead Code Removal
1. Delete auto-feed/shop UI elements
2. Delete debug API functions
3. Delete achievement definitions
4. Delete feature files

### Day 2: Jotai Bridge Fix
1. Research MGTools approach
2. Implement Aries Mod detection
3. Add store priority logic
4. Test with both mods

### Day 3: Sprite/Emoji Fixes
1. Replace `PET_EMOJI` in petComparisonHub.ts
2. Add ability badges to pet displays
3. Verify Shop Restock sprites
4. Test all sprite rendering

### Day 4: Naming & Cleanup
1. Rename Locker → Bulk Favorite
2. Consolidate MutationObservers
3. Add event listener cleanup
4. Standardize logging

### Day 5: Testing
1. Full feature verification
2. Performance testing
3. Compatibility testing
4. Bug fixes

---

## Success Criteria

1. **Performance:** No startup freeze, responsive UI on Firefox
2. **Functionality:** All existing features work correctly
3. **Compatibility:** No Jotai conflicts with Aries Mod
4. **Code Quality:** No dead code, consistent naming, proper cleanup
5. **Sprites:** Pet sprites with ability badges shown where appropriate
6. **Emojis:** Only used where no sprite equivalent exists

---

## Files Changed Summary

### Modified:
- `src/ui/originalPanel.ts` - UI cleanup, rename sections
- `src/ui/petComparisonHub.ts` - Replace emoji map with sprites
- `src/ui/trackerWindow.ts` - Add pet sprites with badges
- `src/ui/xpTrackerWindow.ts` - Add pet sprites with badges
- `src/ui/petHubWindow.ts` - Verify pet sprites
- `src/utils/petCardRenderer.ts` - Add ability badge rendering
- `src/debug/debugApi.ts` - Remove dead functions
- `src/store/achievements.ts` - Remove dead achievements
- `src/core/jotaiBridge.ts` - Aries Mod compatibility

### Deleted:
- `src/features/cropTypeLocking.ts`
- Any weather swapper files

### Created:
- `src/utils/abilityColors.ts` - Ability color mapping

---

## Notes

- Version remains at `v3.0.5`
- All changes preserve backward compatibility
- User settings/data are not affected
- Build process unchanged





