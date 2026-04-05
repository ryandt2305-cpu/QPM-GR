

## How Pets Are Ranked

### 1) Family snapshot per pet

For each pet:

1. Build compare profile from abilities and strength.
2. Map each valid pet and ability to an optimizer family (family is group of tiers (e.g Plant Growth Boost I & II)).
3. For each family, keep that pet's best family entry by:
   - highest ability tier first
   - then higher family score
4. Apply family score adjustments:
   - time-family uplift from progression stage + synergy
   - Gold family adjustment based on Gold preference

Pets with review-required abilities are excluded from ranking competition pools.

### 2) Specialist mode ranking
- Best Top 3 Pets Per Ability
Inside each family, pets are sorted by:

1. Higher family tier
2. Higher family score
3. Higher max STR
4. Higher current STR
5. Mutation tie-break (Rainbow highest, then Gold, then none)
6. Stable pet ID tie-break

### 3) Slot Efficiency mode ranking
- Best top 3 pets per-pet-slot for that team/ability
For each pet family anchor:

1. Base standing:
   - `0.65 * rankUtility + 0.35 * scoreRatioToLeader`
2. Add support families:
   - best support from other broad roles
   - weighted by `0.55`, `0.30`, `0.15`
3. Add bonuses and penalties:
   - bonuses capped at `+0.30`
   - penalties capped at `-0.06`
4. Final:
   - `finalScore = base + support + totalBonus`

Slot Efficiency family competition is then sorted by:

1. Higher `finalScore`
2. Higher tier
3. Higher max STR
4. Higher current STR
5. Mutation tie-break
6. Stable pet ID tie-break

### 4) Which family decides "outclassed"

When pet is not top 3:

- The deciding family is the one with the most better competitors.
- Tie-break is worse rank.
- Final tie-break is family name.

That family drives the sell/review explanation and alternatives list.

## How Status Is Decided

Order matters:

1. Manual protection -> `Keep`
2. Only source of high-value ability -> `Keep`
3. Unknown/unmapped ability data -> `Review`
4. Strict filter fail (if not protected) -> `Sell`
5. No ranking data -> `Keep`
6. Top 3 in at least one family in current mode -> `Keep`
7. Otherwise outclassed:
   - Rainbow protection path:
     - `Keep` if any signal is true:
       - score >= `600`
       - max STR >= `90`
       - top `6` in at least one deciding family
     - else `Review`
   - Gold protection path -> `Review`
   - else -> `Sell`

## Notes

- Ranking decides competitiveness.
- Top 3 family rank is the main keep threshold in both modes.
- This tool is not made to 'do the thinking for you', you must still be aware of what pets you are actually selling!
- See "QPM-GR\docs\product\pet-optimizer-benefits-penalties.md" (on github) for full benefits and penalties