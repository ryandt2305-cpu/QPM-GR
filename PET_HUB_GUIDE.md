# Pet Comparison Hub - User Guide

## 🎉 Opening the Hub

The Pet Comparison Hub is a visual interface for comparing your active pets with detailed statistics and garden value calculations.

### How to Open:
In the browser console, type:
```javascript
QPM.openPetHub()
```

**Requirements:**
- At least 1 active pet in your garden (2+ recommended for comparison features)

---

## 🖼️ Features

### 📊 **Overview Tab**
- **Visual pet cards** showing each active pet
- **Pet emoji** based on species (🐰 Rabbit, 🐔 Chicken, etc.)
- **Quick stats** at a glance:
  - 💪 Current & Max Strength
  - 🎓 Level & XP
  - 🍖 Hunger % & Feeds/Hour
  - 🌟 Mutations (with Gold/Rainbow badges)
  - ⚡ Ability count

**Hover effects:** Cards pop up with glow when you hover over them!

---

### ⚖️ **Compare Tab**
- **Side-by-side comparison** of two pets
- **Dropdown selectors** to choose which pets to compare
- **Winner indicators** (🏆) showing which pet is better for each stat
- **Comprehensive metrics:**
  - Strength & growth potential
  - XP & leveling progress
  - Hunger efficiency (feeds/hour, time until starving)
  - Mutations & special traits
  - Ability counts

**Perfect for deciding which pet to keep or upgrade!**

---

### ⚡ **Abilities Tab**
- **Detailed ability statistics** for each pet
- **Visual ability cards** with:
  - Tier badges (Tier 1-4)
  - Probability & proc rates (per hour/day)
  - Time between procs
  - Effect values (scaled by pet strength)
  - **🌿 Garden value per proc** (for garden-affecting abilities)
  - **💰 Value per hour/day** (coin generation)
  
**Garden Value Abilities:**
- **Rainbow Granter** - Shows value of adding Rainbow to crops
- **Gold Granter** - Shows value of adding Gold to crops
- **Produce Scale Boost** - Shows value of crop size increases
- **Crop Mutation Boost** - Shows value of weather/lunar mutations

**Hover effects:** Ability cards slide and highlight when you hover!

---

## 🎨 Visual Design

### Color Coding:
- **🔵 Blue** (#00d4ff) - Strength stats
- **🟡 Yellow** (#ffb900) - XP & Level
- **🟢 Green** (#00ff88) - Hunger & efficiency stats
- **🔴 Red** (#e94560) - Primary accents (headers, winners)
- **🟣 Purple** (#533483) - Borders & backgrounds

### Special Effects:
- **Gradient backgrounds** - Modern dark theme with purple/blue gradients
- **Hover animations** - Cards pop up and glow
- **Winner badges** - 🏆 Gold trophy for better stats
- **Mutation badges** - Special styling for Gold (gold color) and Rainbow (rainbow gradient!)
- **Smooth transitions** - Everything animates nicely

---

## 💡 Tips

### Best Use Cases:

1. **Deciding which pet to keep:**
   - Open Compare tab
   - Select two similar pets
   - Check strength potential, ability procs/hour, garden value
   - Winner indicators show you at a glance which is better

2. **Optimizing garden value:**
   - Go to Abilities tab
   - Look for 🌿 Garden Value/Proc
   - See which pets generate the most coins from your current garden
   - Value updates based on your actual crops!

3. **Planning pet upgrades:**
   - Check Max Strength in Overview/Compare
   - See which pets have growth potential
   - Compare ability tier levels (higher = better)

4. **Hunger management:**
   - Check Feeds/Hour in Overview
   - Compare Time Until Starving
   - Identify high-maintenance vs low-maintenance pets

---

## 📋 Console Commands (Alternative)

If you prefer text output in console:

```javascript
// Get detailed stats for all active pets
window.testPetData()

// Compare two specific pets (by slot index)
window.testComparePets(0, 1)

// List all ability definitions in the game
window.testAbilityDefinitions()
```

---

## 🐛 Troubleshooting

**"No active pets found" error:**
- Make sure you have pets placed in your garden
- Pets in inventory/hutch won't show up (only active garden pets)

**Garden value shows "N/A" or 0:**
- Plant some crops in your garden first
- Garden value abilities need crops to calculate against
- Try abilities like Rainbow Granter, Gold Granter, or Produce Scale Boost

**Hub won't open:**
- Check browser console for errors
- Make sure userscript is loaded (look for startup logs)
- Try refreshing the page

**Stats look wrong:**
- Try the console commands (window.testPetData()) to see raw data
- Report any calculation issues with screenshots

---

## 🎯 Future Enhancements

Potential features for future versions:
- Auto-detection of inventory/hutch pets
- Sorting/filtering pets by various metrics
- Favorite/bookmark system
- Export comparison reports
- Pet recommendations based on garden setup
- Historical tracking of pet growth

---

## ❓ Questions?

The Pet Comparison Hub uses the same data as the existing Ability Tracker, but presents it in a much more visual and user-friendly way!

Enjoy comparing your pets! 🐾
