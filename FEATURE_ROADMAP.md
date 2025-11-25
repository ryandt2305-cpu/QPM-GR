# QPM Feature Roadmap

**Version:** 1.0.0
**Last Updated:** 2025-11-25
**Status:** Planning Phase

This document tracks planned feature implementations for Quinoa Pet Manager (QPM), including detailed implementation specs, priorities, and progress tracking.

---

## Table of Contents

1. [Priority Overview](#priority-overview)
2. [High Priority Features](#high-priority-features)
3. [Medium Priority Features](#medium-priority-features)
4. [Low Priority Features](#low-priority-features)
5. [Implementation Notes](#implementation-notes)

---

## Priority Overview

### 🔴 HIGH PRIORITY (Implement First - Week 1-2)
1. **Compact/Minimal Mode** - UI/UX improvement for space efficiency
2. **Game Journal Insights** - Smart recommendations for collection completion ✅ Strategy defined
3. **Enhanced Pet Feeding UI** - Real-time hunger tracking with visual indicators

### 🟡 MEDIUM PRIORITY (Implement Second - Week 3-4)
4. **AI-Powered Recommendations** - Rule-based smart suggestions
5. **Pet Performance Metrics + ROI Calculator** - Analyze pet value and efficiency
6. **Premium Theme System** - Customizable visual themes
7. **Coin/Credit Income Tracker** - Economic analytics ✅ UNBLOCKED

### 🟢 LOW PRIORITY (Implement Later - Week 5+)
8. **Predictive Analytics Dashboard** - Forecasting and predictions ✅ UNBLOCKED

**STATUS:** All features are now unblocked and ready for implementation! 🎉

---

## High Priority Features

### 1. Compact/Minimal Mode ⚡

**Status:** 📋 Planning
**Estimated Time:** 1-2 days
**Priority:** 🔴 HIGH

#### Overview
Add multiple panel display modes for space efficiency, with keyboard shortcuts and auto-compact features.

#### Modes

**Full Mode (Current):**
- All sections expanded and visible
- Full controls and details

**Compact Mode:**
- Section headers visible, bodies collapsed
- Click header to expand individual sections
- Save expanded state per section in localStorage

**Minimal Mode:**
- Ultra-thin status bar with icons only
- Hover to see tooltips
- Click to expand to full panel

**Hidden Mode:**
- Panel disappears completely
- Small floating button (🌾) in corner to restore
- Auto-show on important events

#### Technical Implementation

**New Files:**
- `src/features/compactMode.ts` - Mode management and configuration

**Modified Files:**
- `src/ui/originalPanel.ts` - Add mode switching logic and CSS classes

**Configuration:**
```typescript
interface CompactModeConfig {
  level: 'full' | 'compact' | 'minimal' | 'hidden';
  keybind: string; // Default: 'Alt+M'
  expandOnHover: boolean;
  autoExpandEvents: ('hunger' | 'harvest' | 'weather' | 'ability')[];
  autoCompactAtOpacity: number; // 0-100, auto-switch to minimal at threshold
}
```

**CSS Classes:**
```css
.qpm-panel--compact { /* Collapsed sections */ }
.qpm-panel--minimal { /* Status bar only */ }
.qpm-panel--hidden { /* Display none */ }
.qpm-restore-button { /* Floating restore button */ }
```

**Storage Keys:**
- `qpm:compactMode:config`
- `qpm:compactMode:expandedSections` (array of section IDs)

#### Acceptance Criteria
- [ ] Can toggle between all 4 modes
- [ ] Alt+M keybind works
- [ ] Compact mode remembers which sections are expanded
- [ ] Minimal mode shows status icons with tooltips
- [ ] Hidden mode shows restore button
- [ ] Config persists across sessions

---

### 2. Game Journal Insights 📖

**Status:** 📋 Planning
**Estimated Time:** 2-3 days
**Priority:** 🔴 HIGH

#### Overview
Generate smart recommendations for completing journal collection, with prioritized species focus and fastest-path strategies.

#### Features

**1. Recommended Focus Species:**
- Prioritize species with fewest missing variants
- Calculate difficulty (easy/medium/hard) based on requirements
- Show estimated time to complete
- Provide specific strategies per species

**2. Fastest Path to 100%:**
- Greedy algorithm: complete easiest species first
- Step-by-step roadmap
- Total estimated time
- Expected completion percentage gain

**3. Low-Hanging Fruit:**
- Species with 1-2 missing variants
- Easy difficulty rating
- Quick wins for immediate progress

**4. Long-Term Goals:**
- Rare/hard variants (Ambercharged, Dawncharged)
- Requires specific conditions
- Plan for future completion

#### Technical Implementation

**New Files:**
- `src/features/journalRecommendations.ts` - Recommendation engine

**Modified Files:**
- `src/features/journalChecker.ts` - Add recommendation generation
- `src/ui/journalCheckerSection.ts` - Add recommendations UI

**Data Structures:**
```typescript
interface SpeciesRecommendation {
  species: string;
  type: 'produce' | 'pet';
  priority: 'high' | 'medium' | 'low';
  missingVariants: string[];
  completionPct: number;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedTime: string; // "1-2 hours", "1 day", "1 week"
  strategy: string;
  reasons: string[];
}

interface JournalStrategy {
  recommendedFocus: SpeciesRecommendation[];
  fastestPath: {
    steps: string[];
    estimatedTime: string;
    expectedCompletion: number;
  };
  lowHangingFruit: SpeciesRecommendation[];
  longTermGoals: SpeciesRecommendation[];
}
```

#### Strategy Generation Logic

**ANSWERED - Ready to Implement:**

**1. Weather Mutation Timing:**
- Rain/Snow: Can be at most every 5 minutes, but random (could be 20-30+ minutes)
- Lunar events (Amber/Dawn): Every 4 hours from 12AM AEST, last 10 minutes
  - **IMPORTANT:** Need to convert to user's system timezone
- Wet→Frozen or Chilled→Frozen: ~30-45 minutes (rough estimate, RNG-based)
- Weather changes at most every 5 minutes on the hour (but very unlikely)
- **Recommendation approach:** Suggest waiting for weather AND/OR using pet abilities

**2. Lunar Event Reliability:**
- Pretty reliable: Every 4 hours on the hour
- Base chance for Dawnlit/Amberlit: 1% per crop
- Can be boosted by Crop Mutation Boost I & II abilities
- Dawncharged/Ambercharged process:
  - Place lit crop next to Moonbinder/Dawnbinder during respective weather
  - 25% chance per minute to turn charged
- Difficulty is RNG-based
- Getting lit is the longest part; getting charged is easier (25%/min with binder)
- **Note:** User has spreadsheet showing which crops worth waiting for vs harvesting frozen

**3. Color Mutation Strategy:**
- **DO NOT assume** players have Granter pets - must check inventory + hutch
- Players have different amounts and strength pets
- Mark as **"Very Hard"** difficulty
- Rainbow/Gold CAN happen randomly but:
  - Rainbow: Abysmally small chance (0.1% base on pets)
  - Gold: Slightly better but still quite small (1% base on pets)
  - Random procs when multi-harvest harvested or plant first placed
- Getting Rainbow Granter pet can take 2000+ eggs
- Higher tier eggs stock less frequently = longer acquisition time

**4. Time Estimates:**
- **Crops don't grow to max size** - max size comes from Crop Size Boost I & II ability
- "Grow" time = maturing time (until ready to harvest)
- User can provide all crop growth times if needed
- Wet+Chilled→Frozen: No fixed time, RNG-based
- Hatching eggs for specific abilities: Very time consuming
  - User has data for: pet species chance per egg, ability chances, etc.
  - Rainbow Granter: Can take 2000+ eggs
  - Gold Granter: More common but still rare

**5. Difficulty Rating Examples:**

**Easy (~20-30 minutes):**
- Wet Carrot: Low tier seed (high quantity/appearance in shop), rain fairly common
- **Note:** Higher tier seeds = harder due to lower quantity/appearance

**Medium (~30-45 minutes):**
- Frozen Carrot: Requires 2 weather events (Rain + Snow)
- Rainbow Carrot (with Granter): Low tier seed easier, bigger sample size, depends on # and strength of Granter pets
- **Note:** Higher tier seeds take longer

**Hard (Multiple hours to days):**
- Dawncharged Carrot: Low tier seed easier, lunar every 4 hours, 2 different lunar events possible
  - Dawn more common than Amber
  - **Impossible** without right binder pod (Dawnbinder/Moonbinder)

**Very Hard (Days to weeks):**
- Rainbow/Gold without Granter pets: Extremely rare random procs

#### UI Mockup
```
┌──────────────────────────────────────────────┐
│ 📖 Journal Checker                          │
│ Overall: 68% (408/600 collected)            │
├──────────────────────────────────────────────┤
│ 🎯 RECOMMENDED FOCUS                        │
│                                              │
│ 🌾 Carrot (90% complete)       [HIGH]       │
│   Missing: Ambercharged, Dawncharged        │
│   Strategy: Plant before lunar events       │
│   Est. Time: 1-2 days                       │
│   [View Details]                            │
│                                              │
│ [Show 5 More Recommendations]               │
│                                              │
│ 🚀 FASTEST PATH TO 100%                     │
│ Complete these 10 species for +15% progress │
│ Est. Total Time: 1-2 weeks                  │
│ [Show Path Details]                         │
│                                              │
│ 🍒 LOW-HANGING FRUIT (Quick Wins)          │
│ • Strawberry: 1 variant left (Rainbow)     │
│ • Tomato: 2 variants left (Gold, Frozen)   │
│ [Show All]                                  │
└──────────────────────────────────────────────┘
```

#### Acceptance Criteria
- [ ] Recommendations prioritize based on completion %
- [ ] Difficulty rating is accurate
- [ ] Strategies are specific and actionable
- [ ] Time estimates are realistic
- [ ] UI integrates smoothly into journal section
- [ ] Fastest path algorithm works correctly

---

### 3. Enhanced Pet Feeding UI 🍖

**Status:** 📋 Planning
**Estimated Time:** 2-3 days
**Priority:** 🔴 HIGH

#### Overview
Add real-time hunger tracking with visual countdown timers, color-coded alerts, and hover tooltips integrated into the dashboard.

#### Features

**1. Visual Hunger Bars:**
- Color-coded progress bars per pet
- 🟢 Green: 50-100% hunger (safe)
- 🟡 Orange: 15-49% hunger (warning)
- 🔴 Red: 0-14% hunger (critical)

**2. Countdown Timers:**
- "X min until empty" display
- Calculate based on hunger decay rate
- Update every second for accuracy

**3. Hover Tooltips:**
- Last fed timestamp
- Current hunger percentage
- Estimated time to critical
- Hunger decay rate (hunger/min)

**4. Toast Notifications:**
- Alert at 15 minutes remaining
- Alert at 5 minutes remaining
- Critical alert at 0% (starving)

#### Technical Implementation

**New Files:**
- `src/features/petHungerMonitor.ts` - Real-time hunger tracking

**Modified Files:**
- `src/ui/originalPanel.ts` - Add hunger display to dashboard
- `src/store/pets.ts` - Extend to track hunger history

**Data Structures:**
```typescript
interface PetHungerState {
  petIndex: number;
  petId: string;
  name: string;
  species: string;
  hungerPct: number;
  maxHunger: number;
  currentHunger: number;
  estimatedTimeToEmpty: number | null; // minutes
  hungerDecayRate: number | null; // hunger per minute
  lastUpdateTime: number;
  alertLevel: 'safe' | 'warning' | 'critical';
}
```

**Hunger Tracking Method:**
- Subscribe to `myPetSlotInfosAtom` (already used in `src/store/pets.ts`)
- Get hunger data from pet slot infos
- Calculate decay rate from hunger changes over time
- Store historical snapshots to compute rate

**Questions:**
- How does Arie's mod get hunger? (Need to check their source if available)
- Is hunger available in `myPetSlotInfosAtom` directly?
- What's the typical hunger decay rate in the game?

#### UI Integration (Dashboard Section)
```
┌──────────────────────────────────────────────┐
│ 🍖 Pet Hunger Status                        │
├──────────────────────────────────────────────┤
│ 🐢 Speedy    [████████░░] 82%  ~45min      │
│ 🐝 Buzzy     [████░░░░░░] 38%  ~12min ⚠️   │
│ 🐛 Wormy     [██░░░░░░░░] 18%  ~4min  🔴   │
│                                              │
│ [Feed All Hungry] [Feed Critical]           │
└──────────────────────────────────────────────┘
```

#### Acceptance Criteria
- [ ] Hunger bars update in real-time
- [ ] Colors change based on thresholds
- [ ] Countdown timers are accurate
- [ ] Tooltips show detailed info on hover
- [ ] Notifications trigger at correct thresholds
- [ ] Integrates into dashboard section

---

## Medium Priority Features

### 4. AI-Powered Recommendations (Rule-Based) 🤖

**Status:** 📋 Planning
**Estimated Time:** 3-5 days
**Priority:** 🟡 MEDIUM

#### Overview
Smart rule-based recommendation system that analyzes game state and suggests optimal actions.

#### Recommendation Categories

**1. Critical Actions:**
- Feed hungry pets (< 20% hunger)
- Harvest ready high-value crops
- Act before weather event ends

**2. Optimization Suggestions:**
- Plant more crops for Granter efficiency
- Replace underperforming pets
- Adjust pet team for upcoming weather

**3. Opportunity Alerts:**
- Upcoming weather event (within 10 min)
- Rare shop item available
- Mutation opportunity window

**4. Long-Term Strategy:**
- Pet team composition improvements
- Garden layout optimization
- Collection completion goals

#### Technical Implementation

**New Files:**
- `src/features/aiRecommendations.ts` - Rule engine and recommendation generation
- `src/ui/recommendationsPanel.ts` - Recommendations UI (new section or window)

**Rules to Implement (15-20 total):**

1. **Critical Hunger Alert**
   - Trigger: Any pet < 20% hunger
   - Priority: Critical
   - Action: Feed pet immediately

2. **Wasted Granter Procs**
   - Trigger: Rainbow/Gold Granter + >80% colored crops
   - Priority: High
   - Action: Plant more uncolored crops

3. **Weather Event Preparation**
   - Trigger: Weather event starting in < 10 minutes
   - Priority: High
   - Action: Plant now for mutations

4. **Ready to Harvest**
   - Trigger: High-value crops at 100% growth
   - Priority: Medium
   - Action: Harvest before weather ends

5. **Underperforming Pet**
   - Trigger: Pet ROI < 100%
   - Priority: Medium
   - Action: Consider replacing

6. **Ability Proc Overdue**
   - Trigger: Expected proc time exceeded by 2x
   - Priority: Low
   - Action: Check if pet is active

7. **Shop Rare Item Available**
   - Trigger: Rare item in shop inventory
   - Priority: Medium
   - Action: Purchase before restock

8. **Garden Layout Inefficiency**
   - Trigger: Pets not covering all garden tiles
   - Priority: Low
   - Action: Optimize pet placement

9. **Collection Opportunity**
   - Trigger: Can complete species with 1-2 actions
   - Priority: Medium
   - Action: Focus on specific variants

10. **Mutation Chain Ready**
    - Trigger: Wet crops + frost weather active
    - Priority: High
    - Action: Wait for Frozen mutation

**Data Structure:**
```typescript
interface Recommendation {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'pets' | 'crops' | 'shop' | 'mutations' | 'abilities' | 'collection';
  title: string;
  description: string;
  reasoning: string[];
  actions: { label: string; onClick: () => void }[];
  expectedImpact?: string;
  dismissible: boolean;
  timestamp: number;
}
```

#### UI Mockup
```
┌──────────────────────────────────────────────┐
│ 🤖 Smart Recommendations                    │
├──────────────────────────────────────────────┤
│ 🔴 CRITICAL (1)                             │
│ ┌──────────────────────────────────────────┐│
│ │ 🍖 Feed Hungry Pets                      ││
│ │ Wormy is at 18% hunger - feed now!      ││
│ │                                          ││
│ │ Why: Pets stop working at 0% hunger     ││
│ │ Impact: Prevent loss of ~3 procs/hour   ││
│ │                                          ││
│ │ [Feed Wormy] [Feed All] [Dismiss]       ││
│ └──────────────────────────────────────────┘│
│                                              │
│ 🟠 HIGH (2)                                 │
│ ▸ Plant More Crops (Rainbow Granter waste)  │
│ ▸ Weather Event in 8 Minutes               │
│                                              │
│ 🟡 MEDIUM (4)                               │
│ ▸ Replace Low-ROI Pet (Wormy)              │
│ ▸ Harvest Ready Crops (3 high-value)       │
│ ▸ ...                                       │
│                                              │
│ [🔄 Refresh] [⚙️ Configure Rules]          │
└──────────────────────────────────────────────┘
```

#### Configuration
Users can enable/disable specific rule categories in settings.

#### Acceptance Criteria
- [ ] 15-20 rules implemented and working
- [ ] Recommendations update in real-time
- [ ] Priority sorting works correctly
- [ ] Actions are clickable and functional
- [ ] Users can dismiss recommendations
- [ ] Rules can be configured/disabled

---

### 5. Pet Performance Metrics + ROI Calculator 📊

**Status:** 📋 Planning
**Estimated Time:** 2-4 days
**Priority:** 🟡 MEDIUM

#### Overview
Analyze per-pet value generation, feeding costs, and ROI. Provide recommendations for replacing underperforming pets.

#### Features

**1. Per-Pet Metrics:**
- Value generated (total coins from abilities)
- Feeding cost (estimated crop consumption)
- Net profit (value - cost)
- ROI percentage
- Efficiency rating (⭐⭐⭐⭐⭐)

**2. Performance Rankings:**
- Sort by ROI, coins/hour, efficiency
- Compare pets against each other
- Identify top/bottom performers

**3. Replacement Recommendations:**
- Flag pets with ROI < 150%
- Suggest specific improvements
- Show expected impact of replacement

#### Technical Implementation

**New Files:**
- `src/features/petPerformanceAnalytics.ts` - ROI calculator
- `src/ui/petPerformanceWindow.ts` - Performance window UI

**Modified Files:**
- `src/ui/trackerWindow.ts` - Add "View Performance" button in window
- `src/ui/originalPanel.ts` - Add button in Trackers tab to open performance window

**Data Structures:**
```typescript
interface PetPerformance {
  petIndex: number;
  petId: string;
  name: string;
  species: string;
  level: number;
  strength: number;

  // ROI Metrics
  valueGenerated: number; // Total coins from abilities
  feedingCost: number; // Estimated crop cost consumed
  netProfit: number; // valueGenerated - feedingCost
  roi: number; // netProfit / feedingCost (percentage)

  // Efficiency Metrics
  procsPerHour: number;
  coinsPerHour: number;
  coinsPerFeed: number;

  // Performance Rating
  efficiency: 'excellent' | 'good' | 'average' | 'poor';
  recommendation: string;
  replacementReason?: string;

  // Time Tracking
  sessionDuration: number; // Minutes active
  lastProcAt: number | null;
}
```

**ROI Calculation:**
```typescript
// Feeding cost estimation
const avgFeedingInterval = 30; // minutes (typical)
const feedsPerHour = 60 / avgFeedingInterval;
const avgCropCost = 5000; // coins (configurable)
const feedingCostPerHour = feedsPerHour * avgCropCost;

// Value generated (from ability tracker)
const coinsPerHour = /* sum of ability contributions */;

// ROI
const netProfit = coinsPerHour - feedingCostPerHour;
const roi = (netProfit / feedingCostPerHour) * 100;
```

**Integration:**
- Button in ability tracker window: "📊 View Performance Analysis"
- Opens new floating window with performance table
- Links back to ability tracker for details

#### UI Mockup
```
┌──────────────────────────────────────────────┐
│ 📊 Pet Performance & ROI Analysis          │
├──────────────────────────────────────────────┤
│ Sort by: [ROI ▼] [Coins/hr] [Efficiency]  │
├──────────────────────────────────────────────┤
│ Pet         ROI    Profit    Efficiency     │
│ ────────────────────────────────────────────│
│ 🐢 Speedy  +450%  1.2M/hr   ⭐⭐⭐⭐⭐       │
│ 🐝 Buzzy   +280%  800K/hr   ⭐⭐⭐⭐        │
│ 🐛 Wormy   +120%  200K/hr   ⭐⭐⭐ ⚠️      │
│                                              │
│ 💡 RECOMMENDATIONS                          │
│ • Speedy is top performer - excellent!     │
│ • Consider replacing Wormy (low ROI)       │
│ • Expected gain: +600K coins/hr            │
│                                              │
│ [View Ability Details] [Close]              │
└──────────────────────────────────────────────┘
```

#### Acceptance Criteria
- [ ] ROI calculation is accurate
- [ ] Feeding cost estimation is reasonable
- [ ] Performance rankings work
- [ ] Recommendations are helpful
- [ ] Button in tracker tab opens window
- [ ] Window integrates with ability tracker data

---

### 6. Premium Theme System 🎨

**Status:** 📋 Planning
**Estimated Time:** 3-5 days
**Priority:** 🟡 MEDIUM

#### Overview
Customizable visual theme system with preset themes and texture overlays (different from MGTools styles).

#### Features

**1. Preset Themes (15+ unique):**
- Dark themes: Midnight, Carbon, Obsidian
- Light themes: Cloud, Pearl, Cream
- Colorful themes: Ocean, Forest, Sunset, Aurora
- Special themes: Neon, Cyber, Vintage, Pastel

**2. Custom Color Picker:**
- Primary/secondary background
- Text colors
- Accent colors
- Border colors

**3. Texture Overlays (25+ patterns):**
- Subtle patterns (dots, lines, grid)
- Material textures (carbon, metal, wood)
- Geometric patterns (hexagons, triangles)
- Animated effects (shimmer, particles)

**4. Customization Options:**
- Blend mode (multiply, overlay, screen, soft-light)
- Intensity slider (0-100%)
- Scale slider (0.5-2.0x)
- Animation toggle

#### Technical Implementation

**New Files:**
- `src/features/themeEngine.ts` - Theme management core
- `src/ui/themeSelector.ts` - Theme customizer UI
- `src/data/themes.ts` - Preset theme definitions
- `src/data/textures.ts` - Texture overlay catalog

**Modified Files:**
- `src/ui/originalPanel.ts` - Add theme customizer section

**Data Structures:**
```typescript
interface Theme {
  id: string;
  name: string;
  category: 'dark' | 'light' | 'colorful' | 'special';
  colors: {
    bgPrimary: string;
    bgSecondary: string;
    textPrimary: string;
    textMuted: string;
    accent: string;
    positive: string;
    warning: string;
    danger: string;
    border: string;
  };
  gradients?: {
    primary?: string;
    secondary?: string;
  };
}

interface TextureOverlay {
  id: string;
  name: string;
  cssPattern: string; // CSS background pattern
  blendMode: 'multiply' | 'overlay' | 'screen' | 'soft-light';
  intensity: number;
  scale: number;
  animated: boolean;
}
```

**Theme Application:**
- Dynamically update CSS variables on `document.documentElement.style`
- Apply texture as `::before` pseudo-element on `.qpm-panel`
- Persist config in localStorage

#### UI Mockup
```
┌──────────────────────────────────────────────┐
│ 🎨 Theme Customizer                         │
├──────────────────────────────────────────────┤
│ Preset Themes:                              │
│ [Midnight] [Ocean] [Sunset] [Neon] [...]   │
│                                              │
│ Texture Overlay:                            │
│ Pattern: [Carbon Fiber ▼]                   │
│ Intensity: [████████░░] 80%                 │
│ Scale: [███████░░░] 1.2x                    │
│ Blend Mode: [Multiply ▼]                    │
│ Animation: [✓] Enable                       │
│                                              │
│ Custom Colors:                              │
│ Background: [🎨] #1a1a1a                    │
│ Accent: [🎨] #4CAF50                        │
│ ...                                          │
│                                              │
│ [Apply] [Reset to Default] [Export]        │
└──────────────────────────────────────────────┘
```

#### Acceptance Criteria
- [ ] 15+ preset themes available
- [ ] Custom color picker works
- [ ] 25+ texture overlays available
- [ ] Blend modes work correctly
- [ ] Sliders update in real-time
- [ ] Themes persist across sessions
- [ ] Different styles from MGTools

---

## Low Priority Features

### 7. Coin/Credit Income Tracker 💰

**Status:** ✅ UNBLOCKED - Solution identified
**Estimated Time:** 3-4 days
**Priority:** 🟡 MEDIUM (upgraded from LOW)

#### Overview
Track income from crop/pet sales and compare against expenses for profit/loss analysis.

#### Solution Identified

**Income Sources:**
- Players only earn coins from selling produce and pets to shop (no gifts/rewards)

**Detection Methods:**

1. **Monitor Player Coin Balance** (`myPlayerAtom` or onscreen balance)
   - Track balance increases
   - Challenge: Can't distinguish sale vs ability procs
   - Solution: Cross-reference with ability proc events

2. **Monitor Inventory Disappearances** (`myInventoryAtom`)
   - Track produce disappearances = sales
   - Track pet disappearances with caution (might be moving to hutch)
   - Calculate value from `valueCalculator.ts`

3. **WebSocket Message Monitoring** (CONFIRMED)
   - "Sell All" action sends:
     ```javascript
     {
       scopePath: ['Room', 'Quinoa'],
       type: 'SellAllCrops'
     }
     ```
   - Can listen for this message to detect bulk sales
   - Need to determine if individual sales have similar message

**Implementation Plan:**
1. Subscribe to `myPlayerAtom` for balance tracking
2. Subscribe to `myInventoryAtom` for item disappearances
3. Hook into WebSocket messages to listen for `SellAllCrops` events
4. Cross-reference data to calculate accurate income
5. Build income dashboard (see Medium Priority section #4)

---

### 8. Predictive Analytics Dashboard 🔮

**Status:** ✅ UNBLOCKED - Solution confirmed
**Estimated Time:** 5-7 days
**Priority:** 🟢 LOW (implementation complexity)

#### Overview
Forecast earnings, predict mutations, and simulate "what-if" scenarios.

#### Solution Confirmed

**Weather Mutation Tracking:**
- User confirmed: Garden snapshot diffing approach will work
- **Optimization:** Only run snapshot detection during weather events
- No need to run continuously - saves performance

**Implementation Approach:**

1. **Event-Triggered Snapshots:**
   - Start snapshot monitoring when weather event begins
   - Take snapshots every 10 seconds during weather
   - Stop when weather event ends
   - Compare snapshots to detect new mutations

2. **Mutation Detection:**
   - Diff garden snapshots to find new Wet/Chilled/Frozen/Dawnlit/Amberlit crops
   - Record timestamp, mutation type, weather type
   - Build historical dataset for pattern analysis

3. **Performance Optimization:**
   - Only active during weather events (not 24/7)
   - Reduces CPU/memory usage significantly
   - Weather events are: Rain, Snow, Dawn, Amber (trackable via `weatherHub.ts`)

**Data to Track:**
- Mutation counts per weather event
- Success rates (mutations per planted crop)
- Time to mutation (plant → mutated)
- Weather duration impact
- Ability boost effects (Mutation Boost I/II)

**Implementation Plan:**
See detailed spec in previous planning section for full predictive analytics features:
- Earnings forecast
- Mutation predictions
- Rare item forecast
- What-if scenarios

---

## Implementation Notes

### Development Workflow

**For Each Feature:**
1. Create feature branch: `feature/compact-mode`, `feature/journal-insights`, etc.
2. Implement according to spec in this document
3. Test thoroughly in game
4. Update version in `package.json` and `scripts/build-userscript.js`
5. Create commit with conventional commit format
6. Push to feature branch
7. Create PR to main branch
8. Merge and tag release

### Testing Checklist

For each feature, verify:
- [ ] Works in Chrome/Edge
- [ ] No console errors
- [ ] Persists correctly across page reloads
- [ ] Doesn't break existing features
- [ ] UI is responsive
- [ ] Performance is acceptable

### Version Numbering

Following semantic versioning:
- **MAJOR:** Breaking changes (rare)
- **MINOR:** New features
- **PATCH:** Bug fixes

Current version: 1.0.2

### Code Quality Standards

- TypeScript strict mode
- No `any` types unless necessary
- Error handling with try-catch
- Logging with `log()` from `utils/logger.ts`
- Comments explaining "why", not "what"
- Follow existing code patterns

---

## Progress Tracking

### Feature Status Legend
- 📋 Planning
- 🚧 In Progress
- ✅ Completed
- 🚫 Blocked
- ⏸️ Paused

### Current Sprint

**Focus:** High Priority Features (Compact Mode, Journal Insights, Pet Feeding UI)

**Week 1:**
- [ ] Compact/Minimal Mode
- [ ] Game Journal Insights (after strategy questions answered)

**Week 2:**
- [ ] Enhanced Pet Feeding UI

---

## Questions & Decisions

### Journal Strategy Generation (NEEDS ANSWERS)

**Waiting on user input for:**

1. **Weather Mutation Timing:**
   - Wet/Chilled wait time for rain/frost?
   - Frozen mutation chain duration?

2. **Lunar Event Reliability:**
   - Success rate for Dawnlit/Amberlit?
   - Dawncharged/Ambercharged difficulty?

3. **Color Mutation Assumptions:**
   - Should we assume Granter pets available?
   - How to rate difficulty without Granters?

4. **Time Estimates:**
   - Normal growth to max: X hours?
   - Mutation chains: X hours?
   - Pet hatching for abilities: X eggs?

5. **Difficulty Criteria:**
   - Easy = ?
   - Medium = ?
   - Hard = ?

### Theme System (NEEDS DECISIONS)

**Questions:**
- Any specific theme style preferences?
- Color scheme restrictions?
- Animation preferences?

### Income Tracking (NEEDS SOLUTION)

**Blocking question:**
- How can we reliably detect sales?

### Predictive Analytics (NEEDS SOLUTION)

**Blocking question:**
- Best approach for mutation tracking?

---

## Changelog

### 2025-11-25 - Initial Roadmap
- Created feature roadmap document
- Defined 8 features with priorities
- Documented blocking issues
- Added questions for clarification

---

**End of Feature Roadmap**
