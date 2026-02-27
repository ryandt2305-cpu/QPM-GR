# Contributing to QPM-GR

Thanks for your interest in contributing. QPM-GR is a TypeScript userscript for Magic Garden — contributions are welcome for bug fixes, new features, and documentation improvements.

---

## Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- **Tampermonkey** or **Violetmonkey** (for testing in-browser)
- A **Magic Garden** account (magiccircle.gg / magicgarden.gg)

---

## Setup

```bash
git clone https://github.com/ryandt2305-cpu/QPM-GR.git
cd QPM-GR
npm install
```

---

## Development workflow

```bash
# Watch mode — rebuilds on every file change
npm run dev

# The output is dist/quinoa-pet-manager.iife.js
# Load it in Tampermonkey for live testing, or use build:dist below

# Production build — outputs dist/QPM.user.js with the full userscript header
npm run build:dist
```

Install `dist/QPM.user.js` into Tampermonkey or Violetmonkey to test. Reload the game page after each rebuild.

---

## Code conventions

QPM-GR uses **TypeScript strict mode** — the compiler will reject `any` types, unsafe index access, and untyped variables. Run a type check before submitting:

```bash
npx tsc --noEmit
```

### Key rules

- **No hardcoded game data** — plants, pets, items, and mutations must come from runtime catalogs (`src/catalogs/`) or Jotai atoms, never from static lookup tables you write by hand.
- **Sprite rendering via sprite-v2** — use `getCropSpriteCanvas` / `getPetSpriteCanvas` / `onSpritesReady` from `src/sprite-v2/compat.ts`. Do not fetch atlas frames manually.
- **Feature files are single-file** — each feature lives in `src/features/<feature>.ts`. No nested folders unless the feature is genuinely complex.
- **UI lives in `src/ui/`** — do not create DOM from feature files.
- **Storage via the wrapper** — use `src/utils/storage.ts` (GM_* with localStorage fallback). Prefix all keys with `qpm.` or `quinoa`.
- **No side effects on import** — init functions must be called explicitly. No listeners or intervals at module scope.
- **Clean up everything** — every `addEventListener`, `setInterval`, and subscription must have a corresponding cleanup path.

See `.claude/rules/` for the full ruleset (gitignored, available locally after cloning for contributors with Claude Code).

---

## Project structure (brief)

```
src/
├── main.ts              # Entry point — initialization sequence
├── catalogs/            # Runtime game data capture (Object.* hook)
├── sprite-v2/           # Sprite rendering (PIXI hook + atlas extraction)
├── core/                # Jotai bridge + page context
├── features/            # Feature modules (single-file, one per feature)
├── store/               # Derived state (inventory, pets, stats, XP, etc.)
├── ui/                  # Windows, panels, and section builders
│   └── sections/        # Individual panel section components
├── utils/               # Shared helpers (storage, DOM, scheduling, etc.)
├── data/                # Static reference tables (abilities, pet metadata)
├── types/               # Shared TypeScript types
├── debug/               # In-browser debug API (QPM_DEBUG_API)
└── integrations/        # Aries Mod bridge
scripts/
└── build-userscript.js  # Wraps Vite output with Tampermonkey metadata header
```

---

## Submitting changes

1. Fork the repo and create a branch: `git checkout -b feature/my-feature`
2. Make your changes. Run `npx tsc --noEmit` to confirm no type errors.
3. Test in-browser with `npm run build:dist` → install `dist/QPM.user.js`.
4. Open a pull request against `master` with a clear description of what changed and why.

---

## Reporting bugs

Open a GitHub Issue. Include:
- What you expected to happen
- What actually happened
- Your browser, userscript manager, and game URL
- Any console errors (F12 → Console)
