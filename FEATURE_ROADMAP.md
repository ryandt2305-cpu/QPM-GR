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

### 🔴 HIGH PRIORITY (Implement First)
1. **Compact/Minimal Mode** - UI/UX improvement for space efficiency
2. **Game Journal Insights** - Smart recommendations for collection completion
3. **Enhanced Pet Feeding UI** - Real-time hunger tracking with visual indicators

### 🟡 MEDIUM PRIORITY (Implement Second)
4. **AI-Powered Recommendations** - Rule-based smart suggestions
5. **Pet Performance Metrics + ROI Calculator** - Analyze pet value and efficiency
6. **Premium Theme System** - Customizable visual themes

### 🟢 LOW PRIORITY (Implement Later)
7. **Coin/Credit Income Tracker** - Economic analytics (blocked: need sale detection method)
8. **Predictive Analytics Dashboard** - Forecasting and predictions (blocked: weather mutation tracking issues)

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

**QUESTIONS FOR USER:**

1. **Weather Mutation Strategy:**
   - Wet/Chilled: What's the typical wait time for rain/frost weather?
   - Frozen: How long does it take to get Wet → Frozen mutation chain?
   - Should we recommend waiting for weather or using specific abilities?

2. **Lunar Event Strategy:**
   - Dawnlit/Amberlit: How reliably can players catch lunar events?
   - Dawncharged/Ambercharged: What's the success rate for these mutations?
   - Should we factor in difficulty of timing plants to lunar windows?

3. **Color Mutation Strategy:**
   - Rainbow/Gold: Should we assume players have Granter abilities?
   - If no Granter pets, should we mark these as "hard" or "impossible"?

4. **Time Estimates:**
   - Normal growth to max size: How many hours typical?
   - Mutation chains (Wet→Frozen, Dawnlit→Dawncharged): How long?
   - Hatching pets to get specific abilities: Average eggs needed?

5. **Difficulty Rating Criteria:**
   - Easy: Just grow normally? Or just weather required?
   - Medium: Requires abilities + weather?
   - Hard: Requires lunar events + specific timing?

**Please answer these questions so I can create accurate strategy logic!**

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

**Status:** 🚧 BLOCKED - Need sale detection method
**Estimated Time:** 3-4 days
**Priority:** 🟢 LOW

#### Overview
Track income from crop/pet sales and compare against expenses for profit/loss analysis.

#### Blocking Issue
**Problem:** No reliable way to detect when player sells items to shop.

**Potential Solutions:**
1. Monitor `myPlayerAtom` for coin balance increases
   - Challenge: Can't distinguish sale vs other sources

2. Monitor `myInventoryAtom` for item disappearances
   - Challenge: Items can disappear for other reasons (feeding, planting)

3. WebSocket message monitoring
   - Challenge: Unknown if sell message exists/format

4. Shop atom monitoring
   - Challenge: Shop atom tracks shop inventory, not player sales

**Next Steps:**
- Research WebSocket message format for sales
- Test inventory atom monitoring reliability
- Consider implementing partial tracking (ability income only)

#### Implementation Plan (Once Unblocked)
See detailed spec in Medium Priority section #4 from planning document.

---

### 8. Predictive Analytics Dashboard 🔮

**Status:** 🚧 BLOCKED - Weather mutation tracking issues
**Estimated Time:** 5-7 days
**Priority:** 🟢 LOW

#### Overview
Forecast earnings, predict mutations, and simulate "what-if" scenarios.

#### Blocking Issue
**Problem:** Difficulty tracking when weather mutations occur in real-time.

**User Note:** "Previously had issues trying to track weather mutations when they happen"

**Proposed Solution:**
- Track garden snapshots at intervals
- Compare snapshots to detect new mutations
- Record mutation events when detected
- Build historical dataset for predictions

**Challenges:**
- Snapshot frequency vs performance
- Distinguishing mutation source (weather vs ability)
- Handling missed mutations between snapshots

**Next Steps:**
- Implement robust garden snapshot diffing
- Test snapshot interval timing (every 5s? 10s? 30s?)
- Build mutation event detection logic
- Validate detection accuracy

#### Implementation Plan (Once Unblocked)
See detailed spec in Medium Priority section #7 from planning document.

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
