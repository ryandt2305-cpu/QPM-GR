# Shop Restock Pseudo-RNG Analysis Report

**Generated:** 2025-12-03T04:26:02.318Z
**Dataset:** 34861 restock events
**Date Range:** 8/20/2025, 7:45:00 AM - 11/29/2025, 2:10:00 PM

---

## Summary Statistics

| Item | Appearances | Min Interval (hrs) | Max Interval (hrs) | Mean (hrs) | Median (hrs) | Std Dev (hrs) | Hard Floor (hrs) |
|------|-------------|-------------------|-------------------|-----------|-------------|--------------|------------------|
| Starweaver | 17 | 9.08 | 445.42 | 126.24 | 24.00 | 142.31 | 9.08 |
| Dawnbinder | 7 | 24.00 | 278.00 | 146.93 | 131.83 | 97.72 | 24.00 |
| Moonbinder | 10 | 24.00 | 350.33 | 132.49 | 55.50 | 120.06 | 24.00 |
| Sunflower | 436 | 0.00 | 40.67 | 5.48 | 3.92 | 5.34 | 0.00 |
| Mythical Eggs | 132 | 0.25 | 84.25 | 18.00 | 12.50 | 18.01 | 0.25 |

---

## Starweaver - Detailed Analysis

### Basic Statistics

- **Total Appearances:** 17
- **Interval Range:** 9.08 - 445.42 hours
- **Mean Interval:** 126.24 hours (± 142.31)
- **Median Interval:** 24.00 hours
- **Hard Floor (Never Violated):** 9.08 hours

### Dry Streak Analysis

- **Mean Dry Streak:** 1703.65 restocks
- **Median Dry Streak:** 366 restocks
- **Max Dry Streak:** 6583 restocks
- **Min Dry Streak:** 20 restocks

✅ **No Pity System Detected:** Dry streaks appear random without threshold effects.

### Time-of-Day Analysis

**Hourly Distribution:**

| Hour | Appearances | % of Total |
|------|-------------|------------|
| 00:00 | 4 | 23.5% |
| 01:00 | 2 | 11.8% |
| 02:00 | 1 | 5.9% |
| 03:00 | 0 | 0.0% |
| 04:00 | 4 | 23.5% |
| 05:00 | 0 | 0.0% |
| 06:00 | 0 | 0.0% |
| 07:00 | 0 | 0.0% |
| 08:00 | 0 | 0.0% |
| 09:00 | 0 | 0.0% |
| 10:00 | 0 | 0.0% |
| 11:00 | 3 | 17.6% |
| 12:00 | 1 | 5.9% |
| 13:00 | 1 | 5.9% |
| 14:00 | 1 | 5.9% |
| 15:00 | 0 | 0.0% |
| 16:00 | 0 | 0.0% |
| 17:00 | 0 | 0.0% |
| 18:00 | 0 | 0.0% |
| 19:00 | 0 | 0.0% |
| 20:00 | 0 | 0.0% |
| 21:00 | 0 | 0.0% |
| 22:00 | 0 | 0.0% |
| 23:00 | 0 | 0.0% |

- **Hot Hours:** 0:00 (4 times), 4:00 (4 times), 11:00 (3 times)
- **Cold Hours (NEVER appears):** 3:00, 5:00, 6:00, 7:00, 8:00, 9:00, 10:00, 15:00, 16:00, 17:00, 18:00, 19:00, 20:00, 21:00, 22:00, 23:00

### Clustering Analysis

- **Intervals < 1 hour:** 0 (0.0%)
- **Intervals < 3 hours:** 0 (0.0%)
- **Intervals < 6 hours:** 0 (0.0%)
- **Intervals > 24 hours:** 7 (43.8%)

⚠️ **ANTI-CLUSTERING DETECTED:** Forced spacing prevents rapid re-appearances.

### Distribution Analysis

- **Distribution Type:** Moderate Variance
- **Coefficient of Variation:** 1.127
- **Skewness:** 1.355

**Interpretation:**
Intervals show moderate randomness, possibly a % chance check with some cooldown protection. Distribution is right-skewed (skewness: 1.35), indicating occasional long outliers.

---

## Dawnbinder - Detailed Analysis

### Basic Statistics

- **Total Appearances:** 7
- **Interval Range:** 24.00 - 278.00 hours
- **Mean Interval:** 146.93 hours (± 97.72)
- **Median Interval:** 131.83 hours
- **Hard Floor (Never Violated):** 24.00 hours

### Dry Streak Analysis

- **Mean Dry Streak:** 4210.71 restocks
- **Median Dry Streak:** 2269 restocks
- **Max Dry Streak:** 16455 restocks
- **Min Dry Streak:** 327 restocks

✅ **No Pity System Detected:** Dry streaks appear random without threshold effects.

### Time-of-Day Analysis

**Hourly Distribution:**

| Hour | Appearances | % of Total |
|------|-------------|------------|
| 00:00 | 0 | 0.0% |
| 01:00 | 0 | 0.0% |
| 02:00 | 0 | 0.0% |
| 03:00 | 0 | 0.0% |
| 04:00 | 0 | 0.0% |
| 05:00 | 0 | 0.0% |
| 06:00 | 0 | 0.0% |
| 07:00 | 2 | 28.6% |
| 08:00 | 0 | 0.0% |
| 09:00 | 0 | 0.0% |
| 10:00 | 0 | 0.0% |
| 11:00 | 0 | 0.0% |
| 12:00 | 2 | 28.6% |
| 13:00 | 0 | 0.0% |
| 14:00 | 0 | 0.0% |
| 15:00 | 0 | 0.0% |
| 16:00 | 0 | 0.0% |
| 17:00 | 0 | 0.0% |
| 18:00 | 1 | 14.3% |
| 19:00 | 0 | 0.0% |
| 20:00 | 0 | 0.0% |
| 21:00 | 1 | 14.3% |
| 22:00 | 1 | 14.3% |
| 23:00 | 0 | 0.0% |

- **Hot Hours:** 7:00 (2 times), 12:00 (2 times), 18:00 (1 times)
- **Cold Hours (NEVER appears):** 0:00, 1:00, 2:00, 3:00, 4:00, 5:00, 6:00, 8:00, 9:00, 10:00, 11:00, 13:00, 14:00, 15:00, 16:00, 17:00, 19:00, 20:00, 23:00

### Clustering Analysis

- **Intervals < 1 hour:** 0 (0.0%)
- **Intervals < 3 hours:** 0 (0.0%)
- **Intervals < 6 hours:** 0 (0.0%)
- **Intervals > 24 hours:** 5 (83.3%)

⚠️ **ANTI-CLUSTERING DETECTED:** Forced spacing prevents rapid re-appearances.

### Distribution Analysis

- **Distribution Type:** Moderate Variance
- **Coefficient of Variation:** 0.665
- **Skewness:** 0.370

**Interpretation:**
Intervals show moderate randomness, possibly a % chance check with some cooldown protection.

---

## Moonbinder - Detailed Analysis

### Basic Statistics

- **Total Appearances:** 10
- **Interval Range:** 24.00 - 350.33 hours
- **Mean Interval:** 132.49 hours (± 120.06)
- **Median Interval:** 55.50 hours
- **Hard Floor (Never Violated):** 24.00 hours

### Dry Streak Analysis

- **Mean Dry Streak:** 3313.20 restocks
- **Median Dry Streak:** 1905 restocks
- **Max Dry Streak:** 15343 restocks
- **Min Dry Streak:** 333 restocks

✅ **No Pity System Detected:** Dry streaks appear random without threshold effects.

### Time-of-Day Analysis

**Hourly Distribution:**

| Hour | Appearances | % of Total |
|------|-------------|------------|
| 00:00 | 1 | 10.0% |
| 01:00 | 0 | 0.0% |
| 02:00 | 0 | 0.0% |
| 03:00 | 0 | 0.0% |
| 04:00 | 0 | 0.0% |
| 05:00 | 0 | 0.0% |
| 06:00 | 2 | 20.0% |
| 07:00 | 4 | 40.0% |
| 08:00 | 2 | 20.0% |
| 09:00 | 0 | 0.0% |
| 10:00 | 0 | 0.0% |
| 11:00 | 0 | 0.0% |
| 12:00 | 0 | 0.0% |
| 13:00 | 0 | 0.0% |
| 14:00 | 0 | 0.0% |
| 15:00 | 0 | 0.0% |
| 16:00 | 1 | 10.0% |
| 17:00 | 0 | 0.0% |
| 18:00 | 0 | 0.0% |
| 19:00 | 0 | 0.0% |
| 20:00 | 0 | 0.0% |
| 21:00 | 0 | 0.0% |
| 22:00 | 0 | 0.0% |
| 23:00 | 0 | 0.0% |

- **Hot Hours:** 7:00 (4 times), 6:00 (2 times), 8:00 (2 times)
- **Cold Hours (NEVER appears):** 1:00, 2:00, 3:00, 4:00, 5:00, 9:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 17:00, 18:00, 19:00, 20:00, 21:00, 22:00, 23:00

### Clustering Analysis

- **Intervals < 1 hour:** 0 (0.0%)
- **Intervals < 3 hours:** 0 (0.0%)
- **Intervals < 6 hours:** 0 (0.0%)
- **Intervals > 24 hours:** 5 (55.6%)

⚠️ **ANTI-CLUSTERING DETECTED:** Forced spacing prevents rapid re-appearances.

### Distribution Analysis

- **Distribution Type:** Moderate Variance
- **Coefficient of Variation:** 0.906
- **Skewness:** 0.719

**Interpretation:**
Intervals show moderate randomness, possibly a % chance check with some cooldown protection.

---

## Sunflower - Detailed Analysis

### Basic Statistics

- **Total Appearances:** 436
- **Interval Range:** 0.00 - 40.67 hours
- **Mean Interval:** 5.48 hours (± 5.34)
- **Median Interval:** 3.92 hours
- **Hard Floor (Never Violated):** 0.00 hours

### Dry Streak Analysis

- **Mean Dry Streak:** 78.90 restocks
- **Median Dry Streak:** 57 restocks
- **Max Dry Streak:** 647 restocks
- **Min Dry Streak:** 0 restocks

✅ **No Pity System Detected:** Dry streaks appear random without threshold effects.

### Time-of-Day Analysis

**Hourly Distribution:**

| Hour | Appearances | % of Total |
|------|-------------|------------|
| 00:00 | 13 | 3.0% |
| 01:00 | 33 | 7.6% |
| 02:00 | 29 | 6.7% |
| 03:00 | 25 | 5.7% |
| 04:00 | 25 | 5.7% |
| 05:00 | 22 | 5.0% |
| 06:00 | 26 | 6.0% |
| 07:00 | 25 | 5.7% |
| 08:00 | 10 | 2.3% |
| 09:00 | 13 | 3.0% |
| 10:00 | 25 | 5.7% |
| 11:00 | 20 | 4.6% |
| 12:00 | 13 | 3.0% |
| 13:00 | 12 | 2.8% |
| 14:00 | 16 | 3.7% |
| 15:00 | 14 | 3.2% |
| 16:00 | 12 | 2.8% |
| 17:00 | 13 | 3.0% |
| 18:00 | 11 | 2.5% |
| 19:00 | 16 | 3.7% |
| 20:00 | 21 | 4.8% |
| 21:00 | 20 | 4.6% |
| 22:00 | 12 | 2.8% |
| 23:00 | 10 | 2.3% |

- **Hot Hours:** 1:00 (33 times), 2:00 (29 times), 6:00 (26 times)
- **Cold Hours (NEVER appears):** None - appears at all hours

### Clustering Analysis

- **Intervals < 1 hour:** 70 (16.1%)
- **Intervals < 3 hours:** 179 (41.1%)
- **Intervals < 6 hours:** 290 (66.7%)
- **Intervals > 24 hours:** 3 (0.7%)

⚠️ **BURST PATTERN DETECTED:** Item shows clustering (41.1% of intervals < 3hrs)

### Distribution Analysis

- **Distribution Type:** Moderate Variance
- **Coefficient of Variation:** 0.975
- **Skewness:** 1.950

**Interpretation:**
Intervals show moderate randomness, possibly a % chance check with some cooldown protection. Distribution is right-skewed (skewness: 1.95), indicating occasional long outliers.

---

## Mythical Eggs - Detailed Analysis

### Basic Statistics

- **Total Appearances:** 132
- **Interval Range:** 0.25 - 84.25 hours
- **Mean Interval:** 18.00 hours (± 18.01)
- **Median Interval:** 12.50 hours
- **Hard Floor (Never Violated):** 0.25 hours

### Dry Streak Analysis

- **Mean Dry Streak:** 258.37 restocks
- **Median Dry Streak:** 183 restocks
- **Max Dry Streak:** 1238 restocks
- **Min Dry Streak:** 2 restocks

✅ **No Pity System Detected:** Dry streaks appear random without threshold effects.

### Time-of-Day Analysis

**Hourly Distribution:**

| Hour | Appearances | % of Total |
|------|-------------|------------|
| 00:00 | 4 | 3.0% |
| 01:00 | 3 | 2.3% |
| 02:00 | 6 | 4.5% |
| 03:00 | 8 | 6.1% |
| 04:00 | 8 | 6.1% |
| 05:00 | 12 | 9.1% |
| 06:00 | 6 | 4.5% |
| 07:00 | 6 | 4.5% |
| 08:00 | 10 | 7.6% |
| 09:00 | 5 | 3.8% |
| 10:00 | 10 | 7.6% |
| 11:00 | 3 | 2.3% |
| 12:00 | 5 | 3.8% |
| 13:00 | 2 | 1.5% |
| 14:00 | 6 | 4.5% |
| 15:00 | 6 | 4.5% |
| 16:00 | 4 | 3.0% |
| 17:00 | 5 | 3.8% |
| 18:00 | 5 | 3.8% |
| 19:00 | 5 | 3.8% |
| 20:00 | 4 | 3.0% |
| 21:00 | 2 | 1.5% |
| 22:00 | 3 | 2.3% |
| 23:00 | 4 | 3.0% |

- **Hot Hours:** 5:00 (12 times), 8:00 (10 times), 10:00 (10 times)
- **Cold Hours (NEVER appears):** None - appears at all hours

### Clustering Analysis

- **Intervals < 1 hour:** 2 (1.5%)
- **Intervals < 3 hours:** 15 (11.5%)
- **Intervals < 6 hours:** 38 (29.0%)
- **Intervals > 24 hours:** 28 (21.4%)

✅ **Random Spacing:** No obvious clustering or anti-clustering patterns.

### Distribution Analysis

- **Distribution Type:** Moderate Variance
- **Coefficient of Variation:** 1.001
- **Skewness:** 1.866

**Interpretation:**
Intervals show moderate randomness, possibly a % chance check with some cooldown protection. Distribution is right-skewed (skewness: 1.87), indicating occasional long outliers.

---

## Cross-Item Pattern Analysis

Analyzing correlations between rare item appearances...

### Co-occurrence Matrix (within 1 hour)

| Item 1 | Item 2 | Co-occurrences | % of Item 1 | % of Item 2 |
|--------|--------|----------------|-------------|-------------|
| Starweaver | Dawnbinder | 0 | 0.0% | 0.0% |
| Starweaver | Moonbinder | 0 | 0.0% | 0.0% |
| Starweaver | Sunflower | 4 | 23.5% | 0.9% |
| Starweaver | Mythical Eggs | 2 | 11.8% | 1.5% |
| Dawnbinder | Moonbinder | 0 | 0.0% | 0.0% |
| Dawnbinder | Sunflower | 0 | 0.0% | 0.0% |
| Dawnbinder | Mythical Eggs | 0 | 0.0% | 0.0% |
| Moonbinder | Sunflower | 8 | 80.0% | 1.8% |
| Moonbinder | Mythical Eggs | 1 | 10.0% | 0.8% |
| Sunflower | Mythical Eggs | 54 | 12.4% | 40.9% |

⚠️ **SEEDING DETECTED:** Multiple rare items frequently appear together, suggesting shared RNG seed or time-based triggers.

---

## Prediction Strategy Recommendations

Based on the analysis, here are the recommended prediction approaches:

### Starweaver

**Cooldown Detected:** Item NEVER appears within 9.08 hours. After an appearance, wait at least 10 hours before expecting it again.

**Hybrid System:** Mix of cooldown + random chance. After cooldown (9.1 hrs), expect appearance within 268.6 hours on average.

### Dawnbinder

**Cooldown Detected:** Item NEVER appears within 24.00 hours. After an appearance, wait at least 24 hours before expecting it again.

**Hybrid System:** Mix of cooldown + random chance. After cooldown (24.0 hrs), expect appearance within 244.6 hours on average.

### Moonbinder

**Cooldown Detected:** Item NEVER appears within 24.00 hours. After an appearance, wait at least 24 hours before expecting it again.

**Hybrid System:** Mix of cooldown + random chance. After cooldown (24.0 hrs), expect appearance within 252.5 hours on average.

### Sunflower

**Hybrid System:** Mix of cooldown + random chance. After cooldown (0.0 hrs), expect appearance within 10.8 hours on average.

**Burst Alert:** When item appears, there's a 41% chance it will appear again within 3 hours. Stay alert after first sighting!

### Mythical Eggs

**Hybrid System:** Mix of cooldown + random chance. After cooldown (0.3 hrs), expect appearance within 36.0 hours on average.
