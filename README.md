# Quinoa Pet Manager: General Release (QPM-GR)

**QPM-GR** (Quinoa Pet Manager – General Release) is an information and analytics companion for the browser game **Magic Garden**.  
It plugs into your existing Magic Garden tooling and surfaces detailed pet and garden data so you can make better decisions, optimise profit, and understand what your pets are actually doing over time.

> **Status:** ALPHA – not optimised, very WIP, lots of spaghetti. Expect rough edges and breaking changes.

---

## Key Features


### 🐾 Pet Overview & Analytics
- View all pets with their rarity, level, and ability.
- See real ability uptime: procs per minute/hour based on actual behaviour.
- Compare pets in real gameplay conditions

### ⭐ Auto Favourite (Smart Pet/Produce Favouriting)
- Automatically favourites pets or produce based on user configured variables.

### 🧺 Bulk Inventory Crop Favouriting (Crop-Type Locking)
- Instantly favourite large groups of crops in your inventory.
- Useful for:
  - Cleaning up messy inventories
  - Locking all crops of the same type (e.g., all Carrots or all Strawberries)
  - Preventing accidental selling or discarding
- Saves a huge amount of manual clicking.

### 📘 Journal Checker
- Identifies seeds/crops you still need for journal completion.
- Shows missing entries at a glance.
- Helps you plan planting cycles to finish your journal efficiently.

### 🌈 Ability Tracker
- Logs every time a pet ability triggers.
- Shows total procs, timing between procs, and which pets contribute the most.
- Great for comparing ability effectiveness 
- Perfect for finding your most profitable pet setups


### 🛒 Shop Restock Tracker
- Tracks all Magic Garden shop restocks.
- Based off the data, it can predict when the next restock for every item will be
- Find out when rare seeds and eggs might drop

### 🐢 Turtle Timer
- A small utility timer specifically for Turtle pets, calculating plant growth, egg growth, and food support


### 🧠 XP Tracker
- Tracks your XP gained during the session.
Displays:
  XP per minute 
  XP per hour
  Total XP gained
  Session runtime

Helps compare pets, garden layouts, and farming setups for leveling efficiency.
---

## Repository Layout

- `src/`
  - TypeScript source for the main QPM-GR logic and UI.
  - Built with Vite + TypeScript for a fast dev loop and simple bundling.
- `scripts/`
  - Helper / maintenance scripts for working with the project.
- `discover-seed-ids.js`
  - Utility to probe the game and discover internal **seed IDs** for mapping purposes.
- `discover-shop-ids.js`
  - Utility to inspect the **shop** and log internal IDs / structures.
- `websocket-final-discovery.js`
  - Helper for exploring Magic Garden’s WebSocket traffic and structure.
- `PUSH_TO_QPM-GR.sh`
  - Local convenience script to push this project to the `QPM-GR` GitHub repo.
- `package.json`, `tsconfig.json`, `vite.config.ts`
  - Standard TypeScript/Vite project configuration.

---

## Getting Started

### Prerequisites

- **Node.js** (LTS or later recommended)
- **npm** or **pnpm** or **yarn**
- A working Magic Garden setup (browser) plus whatever loader/overlay you use to inject custom scripts (e.g. Tampermonkey, MGModLoader, custom Electron wrapper, etc.).

### 1. Clone the Repository

```bash
git clone https://github.com/ryandt2305-cpu/QPM-GR.git
cd QPM-GR
