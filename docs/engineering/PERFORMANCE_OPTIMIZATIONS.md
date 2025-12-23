# Performance Optimizations - QPM v2.0

## Overview

This document describes the performance optimizations implemented to fix initial startup freeze and improve responsiveness across all browsers and low-spec systems.

## Key Changes

### 1. Cooperative Scheduling (`src/utils/scheduling.ts`)

A new utility module providing non-blocking execution patterns:

- **`yieldToBrowser(timeout?)`** - Yields control back to browser for rendering
- **`YieldController`** - Class for tracking work and yielding when needed
- **`runInChunks(items, processor, chunkSize, delayMs)`** - Process arrays in chunks
- **`runWithBudget(items, processor, budgetMs)`** - Process with time budget
- **`scheduleIdle(fn, timeout)`** - Schedule work during idle time
- **`delay(ms)`** - Non-blocking delay
- **`waitFor(condition, timeout, interval)`** - Wait for condition without blocking
- **`waitForWithBackoff(condition, timeout, initialInterval, maxInterval)`** - Wait with exponential backoff

### 2. Frame-Budgeted Job Queue (`src/utils/jobQueue.ts`)

A job queue that processes work within frame budgets:

```typescript
const queue = new JobQueue({
  enabled: true,
  budgetMs: 8,        // Max 8ms per tick
  capPerTick: 10,     // Max 10 jobs per tick
  allowAsync: true,
});

queue.enqueue({ key: 'unique-id', priority: 1, run: () => { /* work */ } });
```

Key features:
- Priority-based scheduling
- Time budget enforcement
- Job deduplication by key
- Can be ticked from rAF loop

### 3. Sprite System Optimizations (`src/sprite-v2/index.ts`)

#### Parallel Prefetching
- Atlas data (manifest, JSONs, images) prefetched in parallel with PIXI initialization
- Network I/O overlaps with game initialization wait time

#### Cooperative Loading
- Uses `YieldController` to yield between atlas loads
- Small delays between atlases prevent GPU/CPU spikes
- Low-end device friendly with conservative frame budgets

#### Progress Tracking
```typescript
import { onSpriteWarmupProgress, getSpriteWarmupState } from './sprite-v2/index';

// Subscribe to progress updates
const unsubscribe = onSpriteWarmupProgress((state) => {
  console.log(`Loading: ${state.done}/${state.total} (${state.phase})`);
});
```

### 4. Restructured Main Entry (`src/main.ts`)

#### Async IIFE Pattern
```typescript
(async function main() {
  'use strict';
  try {
    await initialize();
  } catch (error) {
    console.error('[QuinoaPetMgr] Initialization failed:', error);
  }
})();
```

#### Phased Initialization
1. **Phase 1**: Start sprite system early (parallel with game detection)
2. **Phase 2**: Wait for game UI
3. **Phase 3**: Initialize core systems (parallel groups)
4. **Phase 4**: Initialize features
5. **Phase 5**: Setup garden inspector and validation
6. **Phase 6**: Create UI
7. **Phase 7**: Background tasks (fire-and-forget)

#### Dynamic Imports
Non-critical modules loaded dynamically:
```typescript
const { initializeStatsStore } = await import('./store/stats');
```

### 5. Lazy Debug API (`src/debug/debugApi.ts`)

Debug API moved to separate module for lazy loading:
- Main thread not blocked by debug code parsing
- Debug functions load on first access
- Creates proxy object for immediate global exposure

### 6. Lazy Window Rendering (`src/ui/lazyWindow.ts`)

Utility for deferring window content rendering:
```typescript
import { registerLazyWindow } from './ui/lazyWindow';

const togglePetHub = registerLazyWindow(
  'pet-hub',
  '🐾 Pet Hub',
  async () => {
    const { renderPetHubWindow } = await import('./ui/petHubWindow');
    return renderPetHubWindow;
  },
  '1600px',
  '92vh'
);

// Called on button click - loading happens on demand
togglePetHub();
```

## Best Practices Going Forward

### 1. Use Cooperative Yielding in Loops
```typescript
const yieldCtl = new YieldController(5, 10);
for (const item of items) {
  processItem(item);
  await yieldCtl.yieldIfNeeded();
}
```

### 2. Prefer Dynamic Imports for Heavy Modules
```typescript
// Instead of:
import { heavyFunction } from './heavyModule';

// Use:
const { heavyFunction } = await import('./heavyModule');
```

### 3. Batch Initializations with Promise.all
```typescript
const [storeA, storeB, storeC] = await Promise.all([
  import('./store/a'),
  import('./store/b'),
  import('./store/c'),
]);
```

### 4. Use Job Queue for Background Work
```typescript
import { getGlobalJobQueue } from './utils/jobQueue';

const queue = getGlobalJobQueue();
queue.enqueue({
  key: 'task-123',
  priority: 1,
  run: () => { /* work */ },
});
```

## Testing Performance

### Before/After Comparison
1. Open browser DevTools → Performance tab
2. Start recording
3. Refresh page
4. Stop recording after mod loads
5. Compare main thread blocking time

### Key Metrics
- **Time to Interactive (TTI)**: Should be <2s after game loads
- **First Input Delay (FID)**: Should be <100ms
- **Total Blocking Time (TBT)**: Should be <300ms during init

### Low-End Device Testing
- Test on Chrome with CPU throttling (4x slowdown)
- Test on Firefox (different JS engine)
- Test on Edge (Chromium-based but different optimizations)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        main.ts (async)                          │
├─────────────────────────────────────────────────────────────────┤
│  Phase 1: Sprite System                                         │
│    ├── prefetchAtlasData() ────┐                               │
│    │                           │ (parallel)                    │
│    └── waitForPixi() ──────────┤                               │
│                                │                               │
│  Phase 2: Game Detection       │                               │
│    └── waitForGame() ──────────┤                               │
│                                │                               │
│  Phase 3: Core Systems         │                               │
│    └── Promise.all([          ←┘                               │
│          stats, petXp, xp,                                     │
│          mutations, autoFav                                    │
│        ])                                                      │
│                                                                 │
│  Phase 4: Features                                              │
│    └── Promise.all([...])                                      │
│                                                                 │
│  Phase 5: Garden Inspector                                      │
│                                                                 │
│  Phase 6: UI                                                    │
│    └── createOriginalUI()                                      │
│                                                                 │
│  Phase 7: Background (fire-and-forget)                         │
│    ├── versionChecker                                          │
│    ├── registerHelpers()                                       │
│    └── showTutorialPopup()                                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    sprite-v2/index.ts                           │
├─────────────────────────────────────────────────────────────────┤
│  prefetchAtlasData():                                          │
│    1. Fetch manifest.json                                       │
│    2. Load all atlas JSONs (parallel)                          │
│    3. Fetch atlas images with yielding                         │
│                                                                 │
│  loadTextures():                                                │
│    for each atlas:                                              │
│      - Load image (use prefetched if available)                │
│      - Build textures                                          │
│      - Yield with YieldController                              │
│      - Delay between atlases (16ms)                            │
│    Build item catalog                                          │
│    Yield after catalog                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Files Modified/Added

### New Files
- `src/utils/scheduling.ts` - Cooperative scheduling utilities
- `src/utils/jobQueue.ts` - Frame-budgeted job queue
- `src/debug/debugApi.ts` - Lazy-loaded debug API
- `src/ui/lazyWindow.ts` - Lazy window rendering utilities
- `docs/engineering/PERFORMANCE_OPTIMIZATIONS.md` - This document

### Modified Files
- `src/main.ts` - Async IIFE, phased initialization, dynamic imports
- `src/sprite-v2/index.ts` - Prefetching, cooperative yielding, progress tracking






