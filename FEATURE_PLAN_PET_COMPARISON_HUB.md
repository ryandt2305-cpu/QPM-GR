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
