# Pet Data Testing Guide

## Testing the Pet Comparison Hub Data Access

Before building the full Pet Comparison Hub, we need to verify we can access all the detailed statistics needed for comprehensive pet comparisons.

---

## Console Test Commands

After loading the userscript, the following commands are available in the browser console:

### 1. **Test All Active Pets** (`QPM.testPetData()`)

Gets comprehensive statistics for all currently active pets in your garden.

```javascript
QPM.testPetData()
```

**What it shows:**
- ✅ Basic Info (name, species, ID, slot)
- ✅ Strength & Growth (current STR, max STR, progress %, target scale, max scale, maturity time)
- ✅ XP & Leveling (XP, level, XP to next level)
- ✅ Hunger System (%, value, max, depletion rate, feeds/hour, time until starving)
- ✅ Mutations (list, count, gold/rainbow flags)
- ✅ **Detailed Ability Stats** for EACH ability:
  - Tier (I, II, III, IV)
  - Base name (e.g., "Seed Finder" without tier)
  - Category (coins, xp, plantGrowth, etc.)
  - Trigger type (continuous, harvest, sellAllCrops, etc.)
  - **Probability & Proc Rates:**
    - Base probability (%)
    - Effective probability (base × strength/100)
    - Roll period (minutes)
    - **Procs per hour**
    - **Procs per day**
    - **Average time between procs (minutes)**
  - **Effect Values:**
    - Label (e.g., "Scale increase", "Time reduction")
    - Base value (e.g., 6 for "6% × STR")
    - Effective value (base × strength/100)
    - Unit (%, minutes, xp, coins)
    - Suffix (%, m, etc.)
  - **Value Per Time:**
    - Value per hour
    - Value per day
  - Notes (additional info)

---

### 2. **Compare Two Pets** (`QPM.testComparePets(slotA, slotB)`)

Side-by-side comparison of two pets with winner indicators.

```javascript
QPM.testComparePets(0, 1)  // Compare slot 0 vs slot 1
QPM.testComparePets(0, 2)  // Compare slot 0 vs slot 2
```

**What it shows:**
- Basic info comparison
- Strength metrics with 🏆 winner indicators
- XP & level comparison
- Hunger system comparison (feeds/hour, time until starving)
- Mutation comparison
- Ability count comparison
- **Shared Abilities Detailed Comparison:**
  - Tier comparison (which has higher tier?)
  - Effective probability comparison
  - Procs per hour comparison
  - Effective value comparison

**Example Output:**
```
Attribute                  | Pet A           | Pet B           
================================================================================

🐾 BASIC INFO:
   Name                      | Fluffy          | Speedy          
   Species                   | Rabbit          | Rabbit          
   Pet ID                    | abc123          | def456          

📊 STRENGTH:
   Current Strength          | 95              | 88               🏆 A
   Max Strength              | 98              | 100              🏆 B
   Strength Progress         | 97%             | 88%              🏆 A
   Target Scale              | 1.95            | 1.88             🏆 A

🎓 XP & LEVEL:
   XP                        | 12500           | 8000             🏆 A
   Level                     | 12              | 9                🏆 A

🍖 HUNGER:
   Hunger %                  | 85%             | 92%              🏆 B
   Depletion Rate            | 15/h            | 15/h             ⚖️ TIE
   Feeds Per Hour            | 0.50            | 0.50             ⚖️ TIE
   Time Until Starving       | 4.2h            | 4.6h             🏆 B

✨ MUTATIONS:
   Mutation Count            | 1               | 0                🏆 A
   Has Gold                  | Yes             | No              
   Has Rainbow               | No              | No              

⚡ ABILITIES:
   Ability Count             | 2               | 2                ⚖️ TIE

📊 SHARED ABILITIES (2):

   Seed Finder:
        Tier                  | 4               | 3                🏆 A
        Eff. Probability      | 28.50%          | 22.00%           🏆 A
        Procs Per Hour        | 17.10           | 13.20            🏆 A
        Effective Value       | 19.00%          | 14.67%           🏆 A

   Rainbow Granter:
        Tier                  | N/A             | N/A              ⚖️ TIE
        Eff. Probability      | 2.85%           | 2.64%            🏆 A
        Procs Per Hour        | 1.71            | 1.58             🏆 A
        Effective Value       | N/A             | N/A              ⚖️ TIE
        Garden Value/Proc     | 2.45M coins     | 2.45M coins      ⚖️ TIE
        💡 Converts 1 random uncolored crop to Rainbow. 6 eligible fruit slots across 4 plants (50% friend bonus, weighted by fruit count).

   Crop Eater:
        Tier                  | N/A             | N/A              ⚖️ TIE
        Eff. Probability      | 57.00%          | 52.80%           🏆 A
        Procs Per Hour        | 34.20           | 31.68            🏆 A
        Effective Value       | N/A             | N/A              ⚖️ TIE
```

---

### 3. **List All Ability Definitions** (`QPM.testAbilityDefinitions()`)

Shows all ability definitions in the game data.

```javascript
QPM.testAbilityDefinitions()
```

**What it shows:**
- All ability IDs and names
- Category (coins, xp, plantGrowth, etc.)
- Trigger type
- Base probability
- Roll period
- Effect values
- Notes

---

## What Data is Available?

Based on the test results, here's what we can compare in the Pet Comparison Hub:

### ✅ **Basic Info**
- Pet ID, Name, Species
- Location (active, inventory, hutch)
- Slot index

### ✅ **Strength & Growth**
- Current strength (0-100)
- Max strength potential
- Strength progress (%)
- Current scale
- Max scale
- Maturity time (hours)

### ✅ **XP & Leveling**
- Current XP
- Estimated level
- XP to next level (if calculable)

### ✅ **Hunger Management**
- Current hunger (%)
- Hunger value (raw)
- Max hunger capacity
- **Depletion rate (per hour)**
- **Feeds required per hour**
- **Time until starving (hours)**

### ✅ **Mutations**
- Full list of mutations
- Mutation count
- Gold flag
- Rainbow flag

### ✅ **Detailed Ability Statistics**

For each ability, we can show:

#### Identification
- Ability ID (e.g., "SeedFinderIV")
- Display name (e.g., "Seed Finder IV")
- Tier (1-4)
- Base name (e.g., "Seed Finder")
- Category (coins, xp, plantGrowth, eggGrowth, misc)
- Trigger (continuous, harvest, sellAllCrops, hatchEgg, sellPet)

#### Probability & Proc Rates
- **Base probability** (e.g., 30%)
- **Effective probability** (base × strength/100)
- **Roll period** (how often it checks, in minutes)
- **⭐ Procs per hour** (expected triggers per hour)
- **⭐ Procs per day** (expected triggers per day)
- **⭐ Average time between procs** (minutes)

#### Effect Values
- **Effect label** (e.g., "Scale increase", "Time reduction")
- **Base effect** (e.g., 6 for "6% × STR")
- **Effective value** (base × strength/100)
- **Unit** (%, minutes, xp, coins)
- **Suffix** for display (%, m, etc.)

#### Value Generation
- **Value per hour** (if applicable)
- **Value per day** (if applicable)

#### Garden Value (for abilities affecting garden)
- **⭐ Garden value per proc** (coin value based on current garden state)
- **Garden value detail** (explanation of how value is calculated)
- Applies to abilities like:
  - Rainbow Granter (adds Rainbow mutation to random crop)
  - Gold Granter (adds Gold mutation to random crop)
  - Produce Scale Boost (increases crop size)
  - Crop Mutation Boost (adds weather/lunar mutations)

#### Additional Info
- Notes/description

---

## Example Test Session

```javascript
// 1. Check what pets are active
QPM.debugPets()

// 2. Get detailed stats for all pets
QPM.testPetData()

// Example output:
// ✅ Found 3 active pet(s)
// 
// 🐾 PET: Fluffy (Rabbit)
//    ID: abc123
//    Slot: 0
// 
// 📊 STRENGTH & GROWTH:
//    Current Strength: 95
//    Max Strength: 98
//    Strength Progress: 97%
//    Target Scale: 1.95
//    Max Scale: 2.0
//    Time to Mature: 72h
// 
// 🎓 XP & LEVELING:
//    XP: 12500
//    Level: 12
//    XP to Next Level: N/A
// 
// 🍖 HUNGER SYSTEM:
//    Hunger: 85.0%
//    Hunger Value: 382 / 450
//    Depletion Rate: 15/h
//    Feeds Per Hour: 0.50
//    Time Until Starving: 4.2h
// 
// ✨ MUTATIONS (1):
//    • Gold
//    Gold: ✅
//    Rainbow: ❌
// 
// ⚡ ABILITIES (2):
// 
//    📌 Seed Finder IV (SeedFinderIV)
//       Category: coins | Trigger: continuous
//       Tier: 4 | Base Name: Seed Finder
// 
//       PROBABILITY & PROC RATES:
//       • Base Probability: 30%
//       • Effective Probability: 28.50%
//       • Roll Period: 1m
//       • Procs Per Hour: 17.10
//       • Procs Per Day: 410.40
//       • Avg Time Between Procs: 3.5m
// 
//       EFFECT VALUES:
//       • Label: N/A
//       • Base Value: N/A
//       • Effective Value: N/A
//       • Unit: N/A
// 
//       🌿 GARDEN VALUE:
//       • Value Per Proc: 1.25K coins
//       • Detail: Boosts 4 mature fruits by ~6.50% size (50% friend bonus assumed, weighted by fruit count).
// 
//       VALUE PER TIME:
//       • Value Per Hour: 21.38K coins
//       • Value Per Day: 512.96K coins

// 3. Compare two specific pets
QPM.testComparePets(0, 1)

// 4. List all available abilities
QPM.testAbilityDefinitions()
```

---

## Next Steps

Once testing confirms all data is accessible:

1. ✅ Verify strength calculations are correct
2. ✅ Verify hunger metrics (feeds/hour, time until starving)
3. ✅ Verify ability proc rates (procs/hour, time between procs)
4. ✅ Verify effect values are calculated correctly
5. ⏳ **Build comparison logic** (which pet is better for what?)
6. ⏳ **Build detailed comparison UI** (advanced stats tables)
7. ⏳ **Add inventory/hutch pet detection**
8. ⏳ **Integrate with auto-detection system**

---

## Key Metrics for Comparison

Based on user requirements, the comparison hub should show:

### **Strength Comparison**
- Current STR: Immediate power level
- Max STR: Long-term potential
- Progress: How close to max?

### **Ability Efficiency**
- **Procs Per Hour**: How often does it trigger?
- **Procs Per Day**: Total daily triggers
- **Time Between Procs**: How reliable is it?
- **Effective Probability**: Real chance accounting for strength

### **Hunger Management**
- **Feeds Per Hour**: Maintenance cost
- **Time Until Starving**: How long can you leave it?
- **Depletion Rate**: How fast does hunger drop?

### **Value Generation**
- Value per hour (coins, XP, time saved)
- Value per day
- Effective value (accounting for strength)

### **Growth Potential**
- XP & level tracking
- Time to mature
- Strength progress

---

## Testing Checklist

Before building the full hub, verify:

- [ ] All pet data loads correctly
- [ ] Strength calculations match expected values
- [ ] Ability proc rates are reasonable
- [ ] Hunger metrics make sense
- [ ] **Garden value calculations work (test with Rainbow/Gold Granter, Scale Boost, Mutation Boost)**
- [ ] **Garden value reflects actual crops in garden (place some crops first)**
- [ ] Comparison logic identifies better pets accurately
- [ ] All ability tiers are grouped correctly
- [ ] Effective values account for pet strength
- [ ] Time-based metrics (procs/hour, feeds/hour) are accurate

---

## Feedback

After testing, provide feedback on:
1. Are all needed statistics available?
2. Are calculations accurate?
3. **Do garden value calculations match what you see in the Ability Tracker?**
4. **Are garden values updating when you add/remove crops?**
5. What additional data would be useful?
6. Any performance issues with data access?

---

## Garden Value Testing Tips

**To test garden value calculations:**
1. Plant some crops in your garden (the more mature crops, the better)
2. Place pets with garden-affecting abilities (Rainbow Granter, Gold Granter, Produce Scale Boost, etc.)
3. Run `QPM.testPetData()` to see garden value per proc
4. Compare with existing Ability Tracker values - they should match!
5. Add/remove crops and re-test to see values update

**Abilities with garden value calculations:**
- `RainbowGranter` - Shows avg value of adding Rainbow to a random uncolored crop
- `GoldGranter` - Shows avg value of adding Gold to a random uncolored crop  
- `ProduceScaleBoost` / `ProduceScaleBoostII` - Shows avg value of size increase across mature crops
- `ProduceMutationBoost` / `ProduceMutationBoostII` - Shows avg value of weather/lunar mutations (only during active weather/moon events)
