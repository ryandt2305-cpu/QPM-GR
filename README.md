# Quinoa Pet Manager: General Release (QPM-GR)

**QPM-GR** is a TypeScript userscript that enhances **Magic Garden** with analytics, automation helpers, and tracking utilities. The project is currently in **ALPHA** - expect frequent updates and improvements as new features are integrated.

**Current Version:** 2.0.0

### Focus Areas

- **Pet Hub Analytics**: Compare pets, highlight best stats, surface ability math, and integrate with Aries Mod presets
- **Inventory Controls**: Auto-favorite, crop locking, journal completion helpers, and turtle timers
- **Shop & Weather Tooling**: Restock tracking with predictions, mutation reminders, weather data, and XP tracking

---

## Key Features

### 🐾 Pet Hub & Analytics

**Pet Overview**
- View all active pets with rarity, level, and abilities
- Real-time ability uptime tracking (procs per minute/hour)
- Compare pets in actual gameplay conditions
- Integration with Aries Mod preset data when available

**Pet Comparison**
- Side-by-side stat comparison
- Ability effectiveness analysis
- Best slot identification
- Visual highlighting of superior stats

### ⭐ Auto Favourite

Smart auto-favoriting system for pets and produce based on configurable rules:
- Automatically favorite pets by rarity, level, or ability
- Protect valuable crops from accidental selling
- Customizable filtering rules
- Real-time updates as items are acquired

### 🧺 Crop-Type Locking (Bulk Favoriting)

Instantly favorite large groups of crops in your inventory:
- Lock all crops of the same type (e.g., all Carrots or Strawberries)
- Prevent accidental selling or discarding
- Clean up messy inventories quickly
- Saves massive amounts of manual clicking

### 📘 Journal Checker

Complete your Magic Garden journal efficiently:
- Identifies missing seeds/crops for journal completion
- Shows progress for produce (11 crop types) and pets
- Smart Tips: recommends what to plant/hatch next
- Visual progress indicators
- Rainbow variant display when all 11 crop types are collected
- Sprite-based display for crops and pets

### 🌈 Ability Tracker

Comprehensive ability logging and analysis:
- Logs every pet ability trigger in real-time
- Shows total procs, timing between procs, and contribution by pet
- Compare ability effectiveness across different pets
- Identify most profitable pet setups
- Historical ability data for optimization

### 🛒 Shop Restock Tracker

Advanced shop restock tracking with predictive analytics:
- **Live Tracking**: Automatically detects shop restocks in real-time
- **Discord Import**: Import historical restock data from Discord HTML exports
- **Dual Prediction System**:
  - **Time-based Predictions**: Based on average intervals between restocks
  - **Window-based Predictions**: Statistical analysis of restock patterns
- **Item Analytics**: Detailed statistics for each shop item (appearance rate, average quantity, last seen)
- **Smart Alerts**: Countdown timers for upcoming restocks
- **Tracked Items**: Mythical Eggs, Starweaver, Dawnbinder, Moonbinder, Sunflower, and more
- **Data Management**: Export data as HTML or clear restock history

**Dashboard Features**:
- Quick-view cards for key items (Starweaver, Dawnbinder, Moonbinder, Mythical Eggs)
- Last seen timestamps with relative time display
- Clear Restock Data button for easy data management

### 🐢 Turtle Timer

Specialized utility timer for Turtle pets:
- Plant growth calculations
- Egg growth timing
- Food support tracking
- Optimized for Turtle-specific mechanics

### 🧠 XP Tracker

Track your leveling efficiency during farming sessions:
- **Real-time XP tracking**: XP per minute, XP per hour
- **Total XP gained**: Cumulative session tracking
- **Session runtime**: Track how long you've been farming
- **Comparison tool**: Compare different pets, layouts, and farming strategies

### 🔒 Crop Size Indicator

Accurate crop size display for garden management:
- Shows exact crop size percentage (uses floor calculation to match game's internal rounding)
- Visual tooltips on crops
- Helps optimize harvest timing
- Size-based crop sorting

### 🌦️ Weather Hub

Weather-related features and tracking:
- Current weather display
- Weather effect tracking for mutations
- Weather-dependent ability monitoring
- Mutation opportunity alerts

### 🔔 Notifications & Alerts

Smart notification system:
- Mutation opportunities
- Shop restock alerts
- Harvest reminders
- Pet ability milestones
- Customizable notification preferences

---
## Build & Test

```bash
git clone https://github.com/ryandt2305-cpu/QPM-GR.git
cd QPM-GR
npm install

# iterative build during development
npm run dev

# production bundle + userscript wrapper
npm run build:dist
```

- The Tampermonkey-ready bundle is emitted to `dist/QPM.user.js`.
- `scripts/build-userscript.js` wraps the Vite IIFE output with the metadata header.
- `scraped-data/*.json` feeds TypeScript data helpers at runtime—don’t remove those files unless you regenerate them.

---

## Minimal Repo Layout

- `src/` – all runtime TypeScript (core, features, UI, stores, data, utils, types).
- `scripts/` – build pipeline and data maintenance scripts (`build-userscript`, `scrape-game-data`, etc.).
- `scraped-data/` – JSON payloads consumed by the app (pets, crops, abilities reports).
- `dist/` – build artifacts that ship to users.
- `DOCUMENTATION.md` – the single consolidated knowledge base containing every prior guide, plan, and research log.

Everything else has been trimmed so the repository only carries what’s required to build, test, or reason about the userscript.

---

## Need Details?

- Architectural notes, historical feature plans, rare restock heatmaps, testing instructions, Firebase setup, and archived dev utilities now live inside [`DOCUMENTATION.md`](DOCUMENTATION.md).
- Legacy helper snippets such as the atom inspector, WebSocket discovery probe, and rainbow-effect reverse engineering script have been preserved in that file under **“Archived Dev Utilities.”**

