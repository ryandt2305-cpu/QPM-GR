# Quinoa Pet Manager: General Release (QPM-GR)

**QPM-GR** (Quinoa Pet Manager – General Release) is an information and analytics companion for the browser game **Magic Garden**.  
It plugs into your existing Magic Garden tooling and surfaces detailed pet and garden data so you can make better decisions, optimise profit, and understand what your pets are actually doing over time.

> **Status:** ALPHA – not optimised, very WIP, lots of spaghetti. Expect rough edges and breaking changes.

---

## Key Features

### 🐾 Pet Overview & Analytics

- See all active pets, their levels, rarities, and equipped abilities at a glance.
- Track ability uptime and the *real* value of each pet over a session.
- Estimate procs-per-minute / procs-per-hour based on game events, not just tooltip text.
- Helps you compare pets in “real conditions” instead of guessing from the wiki blurbs.

### 🌈 Ability Proc & XP Tracking

- Collects data on procs over time so you can see:
  - How often an ability actually fires.
  - Rough “expected” procs per hour for each pet.
- Useful for:
  - Deciding which pets to keep on the field.
  - Figuring out which pets make the most money




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
