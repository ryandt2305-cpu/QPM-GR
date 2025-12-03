# QPM Documentation Hub

> Consolidated reference for QPM-GR features, guides, and developer documentation.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Key Features](#key-features)
3. [Installation & Setup](#installation--setup)
4. [Feature Guides](#feature-guides)
5. [Developer Documentation](#developer-documentation)
6. [Build & Deploy](#build--deploy)

---

## Project Overview

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

## Installation & Setup

### Prerequisites

- **Node.js** (LTS version recommended)
- **npm**, **pnpm**, or **yarn**
- **Tampermonkey** browser extension (for userscript installation)
- Active **Magic Garden** account

### Installation Steps

1. **Clone the Repository**

```bash
git clone https://github.com/ryandt2305-cpu/QPM-GR.git
cd QPM-GR
```

2. **Install Dependencies**

```bash
npm install
```

3. **Build the Userscript**

```bash
# Development build (with watch mode)
npm run dev

# Production build (optimized)
npm run build:dist
```

The Tampermonkey-ready userscript will be generated at `dist/QPM.user.js`.

4. **Install in Tampermonkey**

- Open Tampermonkey dashboard
- Click "Utilities" → "Import from file"
- Select `dist/QPM.user.js`
- Or drag and drop the file into Tampermonkey

5. **Verify Installation**

- Navigate to Magic Garden
- Look for the QPM panel in the game UI
- Check version number shows "2.0.0"

---

## Feature Guides

### Using Pet Hub

**Opening Pet Hub**:
1. Click the "Pet Hub" tab in the QPM dashboard
2. The Pet Hub window displays all your active pets

**Pet Overview Tab**:
- View all pets with their stats (rarity, level, abilities)
- Real-time proc rate calculations
- Click on a pet to see detailed information

**Compare Tab**:
- Select multiple pets for side-by-side comparison
- Visual highlighting shows which pet has better stats
- Ability effectiveness comparison

**Abilities Tab**:
- Detailed breakdown of all pet abilities
- Historical proc data
- Effectiveness metrics

### Using Shop Restock Tracker

**Importing Discord Data**:
1. Export shop-restocks channel from Discord as HTML
2. Click "Shop Restock" tab in QPM dashboard
3. Click "Upload Discord HTML"
4. Select your exported HTML file
5. QPM will parse and import all restock events

**Viewing Predictions**:
- Dashboard shows quick-view cards for key items
- Full tracker window displays dual predictions (time-based and window-based)
- Countdown timers show time until next predicted restock
- Confidence indicators help you understand prediction reliability

**Managing Data**:
- Use "Export HTML" to save your restock data
- Use "Clear Restock Data" button in dashboard to reset all shop restock history
- Data persists across sessions automatically

### Using Journal Checker

**Checking Progress**:
1. Click "Journal Checker" tab in QPM dashboard
2. View produce and pet completion percentages
3. Check "Smart Tips" section for recommendations

**Smart Tips**:
- Shows missing crops/pets you haven't collected
- Suggests what to plant or hatch next
- Displays actual sprites for each item
- Prioritizes based on journal completion goals

**Rainbow Variant**:
- Automatically displayed when all 11 crop types are completed
- Animated rainbow gradient effect on produce icon

### Using Crop-Type Locking

**Locking Crops**:
1. Open your inventory in Magic Garden
2. Click the crop type you want to lock in QPM panel
3. All crops of that type will be favorited instantly
4. Use "Unlock All" to remove favorites

**Sync Modes**:
- **Manual**: Lock/unlock only when you click
- **Auto**: Automatically keep crops of selected types locked

### Using XP Tracker

**Tracking XP**:
- XP Tracker runs automatically in the background
- View real-time stats in the XP Tracker tab
- Session stats persist until reset

**Comparing Setups**:
1. Note your XP/hour with current setup
2. Change pets, layout, or farming strategy
3. Reset tracker to start new session
4. Compare XP/hour to find optimal setup

---

## Developer Documentation

### Repository Layout

```
QPM-GR/
├── src/                     # TypeScript source code
│   ├── core/               # Core functionality (init, setup, etc.)
│   ├── features/           # Feature modules
│   ├── ui/                 # UI components and windows
│   ├── store/              # State management (pets, weather, stats)
│   ├── utils/              # Utility functions
│   ├── data/               # Data helpers
│   └── types/              # TypeScript type definitions
├── scripts/                # Build and maintenance scripts
│   ├── build-userscript.js # Wraps build with Tampermonkey header
│   ├── scrape-game-data.js # Extracts pet/crop data from game
│   └── parse-discord-html.js # Parses Discord exports
├── scraped-data/           # JSON data files (pets, crops, abilities)
├── dist/                   # Build output
│   ├── quinoa-pet-manager.iife.js  # Vite build output
│   └── QPM.user.js                  # Final userscript
├── package.json            # npm configuration
├── tsconfig.json           # TypeScript configuration
└── vite.config.ts          # Vite bundler configuration
```

### Key Conventions

**State Management**:
- Use `store/` modules for shared state (pets, weather, stats)
- Subscribe to state changes using provided subscription functions
- Always unsubscribe when components are destroyed

**Feature Modules**:
- Each feature has its own file in `src/features/`
- Export initialization functions and public APIs
- Keep internal implementation details private

**UI Components**:
- UI components live in `src/ui/`
- Use consistent styling with QPM color scheme
- Follow existing patterns for modals and windows

**Storage**:
- Use `utils/storage.ts` for persistent data
- Prefix all storage keys with 'qpm.'
- Handle storage errors gracefully

### Development Workflow

**Making Changes**:
1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes in `src/`
3. Test locally with `npm run dev`
4. Build for production: `npm run build:dist`
5. Test the generated userscript in Tampermonkey
6. Commit and push changes

**Testing**:
- Test all features in a real Magic Garden session
- Verify data persistence across page reloads
- Check console for errors or warnings
- Test edge cases (empty states, large datasets, etc.)

**Adding New Features**:
1. Create new file in `src/features/`
2. Export initialization and public API functions
3. Add UI components in `src/ui/` if needed
4. Register feature in `src/core/init.ts`
5. Update types in `src/types/` if needed
6. Document the feature in this file

### Common Tasks

**Updating Version**:
```bash
# Update version in three places:
# 1. package.json
# 2. src/utils/versionChecker.ts (CURRENT_VERSION)
# 3. scripts/build-userscript.js (@version in header)
npm run build:dist
```

**Adding New Data**:
```bash
# Scrape latest pet/crop data from game
npm run scrape-game-data

# Parse Discord exports for shop restock data
npm run parse-discord-html
```

**Debugging**:
- Use `log()` from `utils/logger.ts` for debugging output
- Check browser console for QPM-prefixed logs
- Use `storage.get()` to inspect persistent data
- Verify store state with subscription callbacks

---

## Build & Deploy

### Build Commands

```bash
# Development build with watch mode
npm run dev

# Production build (Vite bundle only)
npm run build

# Production build + userscript wrapper
npm run build:dist

# Build just the userscript wrapper
npm run build:userscript
```

### Build Output

- `dist/quinoa-pet-manager.iife.js` - Vite IIFE bundle (~618 KB)
- `dist/QPM.user.js` - Tampermonkey userscript (~602 KB)
- `dist/*.d.ts` - TypeScript declaration files

### Deployment

**To GitHub**:
```bash
git add .
git commit -m "feat: your feature description"
git push origin your-branch
```

**For Users**:
1. Users install from `dist/QPM.user.js`
2. Tampermonkey handles updates via `@updateURL` directive
3. Version checking is automatic (Tampermonkey native)

### Data Files

**Scraped Data** (`scraped-data/*.json`):
- `pets.json` - Pet database with stats and abilities
- `crops.json` - Crop/seed database with growth times
- `abilities.json` - Ability definitions and effects
- These files are bundled into the userscript at build time

**Do not remove these files** - they're required for the build and runtime.

---

## Support & Contributing

### Getting Help

- Check this documentation first
- Review code comments for implementation details
- Check browser console for error messages
- Verify you're running the latest version (2.0.0)

### Reporting Issues

When reporting issues, include:
- QPM version number
- Browser and Tampermonkey version
- Steps to reproduce
- Console error messages (if any)
- Expected vs. actual behavior

### Contributing

Contributions are welcome! Please:
- Follow existing code style and patterns
- Test your changes thoroughly
- Update documentation as needed
- Write clear commit messages
- Submit pull requests for review

---

## Version History

### Version 2.0.0 (Current)

**Major Features**:
- Complete Pet Hub with comparison and analytics
- Dual-prediction Shop Restock Tracker with live monitoring
- Journal Checker with sprite display and Smart Tips
- Rainbow variant for 11/11 crop completion
- Accurate crop size indicator (floor-based calculation)
- Comprehensive XP tracking
- Auto-favorite system with advanced filtering
- Weather Hub integration
- Turtle Timer utility

**UI Improvements**:
- Color-coded dashboard tabs
- Deep Purple Pet Hub button
- Improved notification system
- Consistent styling across all components
- Sprite-based displays (replacing emoji placeholders)

**Technical**:
- TypeScript codebase with Vite bundler
- Persistent storage with localStorage
- Real-time state management
- Modular feature architecture
- Optimized performance with caching

---

## License & Credits

**QPM-GR** is developed for the Magic Garden community.

**Credits**:
- Original Author: TOKYO.#6464
- Contributors: Community members and testers
- Magic Garden: Developed by the Magic Garden team

---

*Last Updated: 2025-12-03*
*Documentation Version: 2.0.0*
