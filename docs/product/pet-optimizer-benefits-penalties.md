# Pet Optimizer Benefits and Penalties

Reference list of all current optimizer benefits and penalties.

## 1) Score Benefits (Base Pet Score)

From `scoring.ts` and `constants.ts`.

- Strength and growth
  - `currentStrength`: adds current STR directly.
  - `maxStrength`: adds `maxStrength * 3`.
  - `potential`: adds growth room (`(max - current) * 3`) capped at `100`.

- Ability tier score
  - Tier scores:
    - `I = 25`
    - `II = 50`
    - `III = 75`
    - `IV = 100`
  - Special ability fixed scores:
    - `RainDance = 80`
    - `DoubleHatch = 90`
    - `DoubleHarvest = 85`
    - `RainbowGranter = 95`
    - `GoldGranter = 85` (can be reduced by Gold preference)
    - `SeedFinderIV = 100`
    - `CoinFinderIII = 100`
  - Ability tier subtotal is capped at `300`.

- Ability count bonus
  - 1 ability: `+30`
  - 2 abilities: `+60`
  - 3 abilities: `+100`

- Mutation score
  - Rainbow mutation: `+100(+ another slight granter bonus depending on pet)`
  - Gold mutation: base `+50 (+ another slight granter bonus depending on pet)` (can be reduced by Gold preference)



## 2) Score Reducers and Adjustments

- Gold preference (`dislikeGold`)
  - Factor is `0.5` when enabled.
  - Affects:
    - Gold mutation score
    - Gold granter bonus
    - Gold-related family score adjustments

- Mutation ability filtering in score
  - If pet has Rainbow or Gold mutation, these are excluded from ability scoring:
    - `ProduceEater`
    - `SeedFinderI`

## 3) Family-Score Benefits (Time Families)

From `ranking/snapshot.ts` and `constants.ts`.

- Time families:
  - `plantgrowthboost`
  - `egggrowthboost`
  - `hungerrestore`
  - `hungerboost`

- Rainbow-qualified time uplift
  - Base strength-equivalent uplift by progression stage:
    - early: `3`
    - mid: `6`
    - late: `7`
  - Multiplier starts at `1 + 0.12 * max(0, coverage - 1)`.
  - Additional multiplier bonuses:
    - `+0.18` if has hunger restore and plant-or-egg support
    - `+0.10` if has both plant and egg support
    - `* 1.05` if species is turtle
  - Final uplift is capped by `MAX_TIME_UPLIFT_STR_EQ = 15`.

- Gold-qualified time uplift
  - Base uplift:
    - `1.0` in early stage
    - `0.1` when decayed (mid/late, or high rainbow-granter signal)
  - Synergy multiplier:
    - `1 + 0.08 * max(0, coverage - 1)`
    - capped at `1.2`
  - Then Gold preference factor is applied (can reduce value to half).

- How uplift is applied
  - Convert uplift to score via family score density:
    - `familyScore + upliftStrEquivalent * (familyScore / scoringStrength)`

## 4) Slot Efficiency Benefits

From `ranking/slotEfficiency.ts` and `constants.ts`.

- Base standing benefit
  - `normalizedStanding = 0.65 * rankUtility + 0.35 * scoreRatioToLeader`

- Support-family weighted benefit
  - Top support families from different broad roles.
  - Weights: `0.55`, `0.30`, `0.15`.

- Positive bonus rules
  - Mutation-granter synergy:
    - If anchor is color granter:
      - `+0.04` with one strong support family
      - `+0.08` with two strong support families
    - If anchor is non-color mutation granter:
      - `+0.10` with one strong support family
      - `+0.18` with two strong support families
    - Bonus can be scaled down when only Gold granter is present.

  - Food and growth pairing:
    - `+0.08` for food sustain + growth support
    - `+0.05` for plant + egg growth pairing

  - Turtle utility:
    - `+0.06` turtle multi-time-family utility
    - `+min(0.06, turtleCompositeScore * 0.04)` turtle composite utility

  - Rainbow multi-role utility:
    - `+0.06` for rainbow mutation on multi-role pet

- Bonus cap
  - Total positive Slot Efficiency bonus cap: `+0.30`.

## 5) Slot Efficiency Penalties

From `ranking/slotEfficiency.ts` and `constants.ts`.

- Penalties apply when anchor family is `rainbowgranter` or `goldgranter`.

- Penalty rules
  - `Produce Eater` present in snapshot:
    - `-0.05`
  - `Seed Finder` family present in snapshot:
    - `-0.03`

- Penalty cap
  - Total penalty cap magnitude: `0.06` (max negative is `-0.06`).

## 6) Gold-Related Ranking Reduction Paths

- Gold standing factor in Slot Efficiency
  - Base factor by stage:
    - early: `1.0`
    - mid: `0.4`
    - late: `0.1`
  - If rainbow-granter pet count is high, factor is clamped to at most `0.1`.
  - Then Gold preference factor is applied (`0.5` when enabled).

- Practical effect
  - Gold-only anchor standings can be strongly reduced in mid/late progression, especially with Gold preference enabled.

## 7) Mutation Tie-Break Benefits in Ranking

From `ranking/common.ts`.

- Competition mutation score for tie-breaks:
  - Rainbow: `3`
  - Gold: `1 + goldPreferenceFactor`
    - `2.0` when Gold preference is off
    - `1.5` when Gold preference is on
  - No mutation: `1`

This affects ordering when earlier rank criteria are tied.

## 8) Status-Path Benefits and Penalties (Decision Layer)

From `decision.ts`.

- Strong benefits (can force Keep)
  - Manual protection -> `Keep`
  - Only source of high-value ability -> `Keep`
  - Top 3 in at least one family (active mode) -> `Keep`

- Protective fallback benefits
  - Rainbow protection can convert likely sell into `Keep` or `Review`.
  - Gold protection can convert likely sell into `Review`.

- Rainbow auto-keep signals
  - Any one of:
    - score >= `600`
    - max STR >= `90`
    - top `6` in at least one deciding family
  - If Rainbow-protected and signal exists -> `Keep`.
  - If Rainbow-protected and no signal -> `Review`.

- Penalty-style strict sell paths (when not protected)
  - Rare+ filter fail
  - Minimum ability count fail
  - Minimum max STR fail
  - Minimum target scale fail
  - Low-value-only ability filter fail

## 9) Outclassed-Family Penalty Selection

When pet is not top 3, deciding family is selected by:

1. Most better competitors
2. Worse rank
3. Family label

That deciding family drives:
- sell/review reason text
- better-alternative list

## 10) Current Caps and Limits (Quick List)

- Ability tier score cap: `300`
- Potential score cap: `100`
- Time uplift strength-equivalent cap: `15`
- Slot Efficiency positive bonus cap: `+0.30`
- Slot Efficiency penalty cap: `-0.06`
- Better alternatives shown: max `12`
- Rainbow auto-keep thresholds:
  - score `600`
  - max STR `90`
  - rank threshold `top 6`
