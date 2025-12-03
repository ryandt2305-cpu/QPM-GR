# Quinoa Pet Manager: General Release (QPM-GR)

**QPM-GR** is a TypeScript userscript that layers analytics, automation helpers, and tracking utilities on top of **Magic Garden**. The project is still considered **ALPHA** software—expect frequent changes and the occasional rough edge while we continue integrating new features such as the Cross-Pet preset bridge.

---

## Focus Areas

- **Pet Hub analytics**: compare slots, highlight best stats, surface ability math, and (optionally) read Aries Mod presets when present.
- **Inventory controls**: auto-favorite, crop locking, journal completion helpers, and turtle timers that reduce daily micromanagement.
- **Shop + weather tooling**: restock tracking/exporting, mutation reminders, weather hub data, and XP trackers that quantify farming sessions.

All research notes, feature guides, patch notes, and historical analyses now live in a single reference file: [`DOCUMENTATION.md`](DOCUMENTATION.md).

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

