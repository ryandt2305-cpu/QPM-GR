# Achievements Feature Spec (Draft)

_Last updated: 2025-12-06_

## Goals
- Add an Achievements window/tab that tracks player actions and stats across Magic Garden.
- Use existing QPM stores (stats, inventory, pets, petXpTracker, journal data) to avoid duplicate instrumentation.
- Be friend-ready: renderer can accept an external snapshot (future Aries Friends update) for viewing other players’ stats.
- Keep evaluation efficient: debounce event-driven updates, avoid expensive scans.

## Data Model
- `AchievementDefinition`
  - `id`: string (stable key)
  - `title`, `description`, `category`, `rarity` (common/rare/epic/legendary/secret)
  - `visibility`: `public | hidden | secret`
  - `requirements`: predicate config (count thresholds, time-window goals, streak goals, per-species filters, rarity filters)
  - `rewardHint` (text), `icon` (optional), `tags` (array)
- `AchievementProgress`
  - `current`: number | object (shape defined by requirement type)
  - `target`: number | object
  - `completedAt`: timestamp | null
  - `bestStreak`: number (when applicable)
  - `lastUpdated`: timestamp
- `AchievementSnapshot`
  - Aggregated metrics pulled from stores, plus derived maps (per-species/per-ability counters, rolling windows, inventory valuation, coin balance, journal progress).
  - Serialized into `AchievementSnapshotPublic` for Friend view (strip sensitive data, keep completion flags and counts).
- Storage key: `qpm:achievements:v1` (versioned with migration hook).

## Metric Sources (existing)
- `stats` store: feeds, weather swaps/time, shop purchases/spend/failures/history, garden totals (planted/harvested/destroyed/watered), pet hatch counts by rarity, ability procs/value, timestamps.
- `inventory` store: items + favorites (for value/favorites achievements).
- `pets` store: active pet species, abilities, strength, positions (for live checks, ability ownership).
- `petXpTracker`: per-species level/xp tables (level/strength thresholds).
- `journal` (via journalChecker): completion per species/variant (collection achievements).

## Metric Extensions (to add)
- Garden per-species counters: `plantedBySpecies`, `harvestedBySpecies`, `destroyedBySpecies`, `wateredBySpecies`.
- Pets per-species and per-ability hatch counters; track back-to-back ability hatches (sliding window queue).
- Ability rolling windows: timestamp queues per ability for “X procs in Y minutes.”
- Coin balance tracker: lightweight reader to keep current coin balance.
- Inventory valuation: reuse value calculator to sum current inventory; cache/debounce.
- Weather time windows: continue using `stats.weather.timeByKind` and add “no-weather streak” helper.
- Activity/Stats panels: hook the in-game Activity Log and Stats views (when accessible) to ingest event streams and historical counters as secondary truth for achievements.

## Achievement Categories & Examples (starter set)
- **Garden**: plant 100/1k seeds; harvest 500 of species X; destroy 50 weeds; water 200 times; perfect-size harvest streak; harvest in every weather; dawn/dusk harvest; no-harvest day.
- **Pets**: hatch 50/200 pets; hatch 10 gold / 5 rainbow; hatch 3 ability-X pets back-to-back; reach level 30 (any); reach STR ≥ 500 (any); per-species hatch milestones.
- **Abilities**: 100 total procs; 25 procs of ability X; 10 procs in 5 minutes; generate 1k coins/hour estimated from procs; zero-waste window for Rainbow/Gold grantors.
- **Shop & Wealth**: spend 50k coins; buy 20 tools; zero shop failures in a week; hold 100k coin balance; inventory value ≥ 250k; first Mythical Egg purchase.
- **Weather**: 50 swaps; stay in storm 30 minutes total; trigger preset alternate 10 times; one-hour no-weather session.
- **Collection**: fully log species; complete all variants of a family; finish 10 species; all pet variants of species X.
- **Streak/Obscure**: 7-day login streak; midnight harvest; “never waste” ability streak; back-to-back rainbow hatches; grow/harvest during specific weather chains.

## Evaluation Strategy
- Build `computeAchievementSnapshot()` to aggregate metrics from stores + extensions.
- Event hooks trigger evaluation with debounce (e.g., 500–1000 ms): plant/harvest/destroy/water, hatch, ability proc, shop purchase, weather swap, inventory/coin refresh, journal refresh.
- Rolling windows: fixed-size queues keyed by metric (drop timestamps older than window).
- Streaks: per-achievement streak state (last occurrence date + current streak).

## UI/UX (Achievements Window)
- Implement via `modalWindow` system.
- Filters: All, In Progress, Completed, Hidden, plus categories.
- Sort: progress %, recent, rarity.
- Cards: title, description, progress bar/pill, rarity tag, last updated, optional secret blur.
- Summary header: totals completed, rarest unlocked, active streaks, hot in-progress.
- Detail drawer: shows contributing metrics (e.g., “Dawnberries planted: 42/100”).
- Friend mode: renderer accepts `AchievementSnapshotPublic` to display another player read-only.

## Phases
1) Scaffold achievements store + snapshot builder + window shell; wire event listeners to existing stores (debounced).
2) Add per-species/per-ability counters and rolling windows; coin/inventory valuation hook.
3) Populate starter achievement definitions; implement evaluator + persistence.
4) Polish UI (filters/search, progress bars) and add public snapshot import/export for Friends.
5) QA: migrations, performance, missing-atom safety.

## Integration Points for Aries Friends (future)
- Export/import `AchievementSnapshotPublic` (versioned, checksum) for remote display.
- Renderer accepts external snapshot and locks editing.
- Friend payload mapping layer to adapt Aries Friends API fields into snapshot shape when available.

## Open Questions
- Coin balance atom/source: identify the stable atom/key for player balance.
- Garden event taps: confirm hook locations for plant/harvest/destroy/water to increment per-species counters.
- Journal data refresh cadence: whether to pull on demand or subscribe.

## Newly Located Jotai Atoms (2025-12-06 probe)
- `myStatsAtom`: live stats panel data; likely the richest direct feed for totals and per-category counts.
- `newLogsAtom` / `hasNewLogsAtom`: activity log stream; use to backfill/validate event-driven achievements and to detect missed hooks.
- `newCropLogsFromSellingAtom` / `hasNewCropLogsFromSellingAtom`: crop sale log stream; useful for coin and shop achievements.
- `myCoinsCountAtom`: current coin balance; pair with `lastCurrencyTransactionAtom` for delta insight.
- `myShopPurchasesAtom`: shop history backing store (restock/purchase context).
- `myJournalAtom`: journal data (already used via `journalChecker`, but direct atom is now confirmed).

Quick probe helpers (via `jotaiBridge`):

```ts
import { getAtomByLabel, readAtomValue, subscribeAtom } from '../core/jotaiBridge';

const statsAtom = getAtomByLabel('myStatsAtom');
const logsAtom = getAtomByLabel('newLogsAtom');

// One-shot reads
console.log(await readAtomValue(statsAtom));
console.log(await readAtomValue(logsAtom));

// Live subscription
const stop = await subscribeAtom(statsAtom, (next) => {
  console.log('stats update', next);
});

// Later: stop();
```

Next wiring targets:
- Add lightweight readers for `myCoinsCountAtom` and `lastCurrencyTransactionAtom` into the achievements snapshot (wealth achievements, coin streaks).
- Subscribe to `newLogsAtom` for event stream ingestion and reconciliation when local hooks miss an event.
- Compare `myStatsAtom` fields with our `stats` store to map authoritative counters and avoid double counting.

