// src/ui/sections/statsHeaderSection.ts — Dashboard stats header section
import { type UIState } from '../panelState';
import { btn } from '../panelHelpers';
import { log } from '../../utils/logger';
import { storage } from '../../utils/storage';
import { getCropSpriteDataUrl } from '../../sprite-v2/compat';
import {
  fetchRestockData,
  getRestockDataSync,
  onRestockDataUpdated,
  type RestockItem,
} from '../../utils/restockDataService';
import { calculateMaxStrength } from '../../store/xpTracker';
import { getActivePetInfos, onActivePetInfos, type ActivePetInfo } from '../../store/pets';
import { onTurtleTimerState, setTurtleTimerEnabled, type TurtleTimerChannel, type GardenSlotEstimate } from '../../features/turtleTimer.ts';
import type { TurtleTimerState } from '../../features/turtleTimer.ts';
import { visibleInterval } from '../../utils/timerManager';

// ---------------------------------------------------------------------------
// Changelog (hardcoded — most practical for userscript)
// ---------------------------------------------------------------------------

const CHANGELOG: Array<{ version: string; date: string; notes: string[] }> = [
{ version: '3.1.21', date: '2026-03', notes: [
    'fixed garden filters (all-tiles-dimmed bug, FourLeafClover matching, crop sprites now visible)',
    'optimised timers and performance (tile node cache, remove GC alloc per frame)',
    'changed Remaining counter in Garden stats to show fruit count instead of crop',
    'added all missing PIXI Plant Views for Garden Filters (Date, Aloe, Cabbage, Beet, Rose, Pear, Gentian, Peach, VioletCort)',
  ]},
{ version: '3.1.20', date: '2026-03', notes: [
    'pet team delete button now shows inline confirmation (fixes silent failure in Discord Activities)',
    'pet team name input no longer loses focus while typing',
    'garden filter now dynamically loads all crops from catalog, new plants appear automatically',
    'four leaf clover sprite alias added',
  ]},
{ version: '3.1.19', date: '2026-03', notes: [
    'fixed pet optimiser crash (Analysis Failed) caused by undefined weather type in catalog lookup',
  ]},
{ version: '3.1.18', date: '2026-03', notes: [
    'added Garden & Hatch Stats to Trackers hub: mutation progress filter + hatch history with ability breakdown',
    'pet hatching tracker now wired up and records species + abilities per hatch',
  ]},
{ version: '3.1.17', date: '2026-03', notes: [
    'hopefully fixed the activity log hydration (stutters for 5-10 seconds and then its smooth)',
    'first 5 people to send a screenshot of this to the QPM channel gets 5k bread lol',
  ]},
{ version: '3.1.16', date: '2026-03', notes: [
    'added anti-afk in utility hub',
    'fixed and sped up pet hutch swapping with pet teams',
  ]},
{ version: '3.1.15', date: '2026-03', notes: [
    'Journal Scroll and window fixes (smaller counter buttons, scroll handling fixed) ***if issues persist, tell me if making the journal window bigger works***',
    'fixed dashboard celestials not updating (was only grabbing from cache once on init)',
  ]},
{ version: '3.1.14', date: '2026-03', notes: [
    'added sprite decoder for MG v114+ compressed sprites..... eeeeeee',
    'if youre reading this hello, i hope you have a good day',
  ]},
{ version: '3.1.13', date: '2026-03', notes: [
    'Pet Teams: hutch-balanced apply now pairs hutch pulls with outgoing active pets (favorited pets preferred) and reports clearer failure reasons',
    'Activity Log: added extended native activity logging and enabled the Utility Hub Activity Log card by default (customize choices persist)',
  ]},
{ version: '3.1.12', date: '2026-03', notes: [
    'fixed Bulk Favorite, added toggle in Utility',
  ]},
{ version: '3.1.11', date: '2026-03', notes: [
    'removed default pets keybind',
  ]},
{ version: '3.1.1', date: '2026-03', notes: [
    'Feeding: detached instant feed buttons now resolve per-pet diets/allowed food totals per active slot',
    'Pet Optimizer: Double Harvest and Crop Refund compare/obsolete logic now ranks per ability family (Top 3 kept per family)',
    'Pet Teams: Sell All keybind location is now in the settings gear cog inside the Pet Teams window',
  ]},
{ version: '3.1.09', date: '2026-03', notes: [
    'fix feed cards',
  ]},
{ version: '3.1.08', date: '2026-03', notes: [
    'slot specific diet quantity',
  ]},
{ version: '3.1.07', date: '2026-03', notes: [
    'Anti-AFK',
  ]},
  { version: '3.1.06', date: '2026-03', notes: [
    'Pets: Shift can now be used as a modifier key for team keybinds',
    'Teams: added polished ability value badges with accurate Hunger Restore team-based calculations',
    'Feeding: feed buttons now show how much selected food remains in inventory',
    'Pet Optimizer: each ability section now includes Create Team from your top 3 pets',
  ]},
  { version: '3.1.05', date: '2026-03', notes: [
    'UI: standardized emoji-safe font fallback across panel and window roots',
    'UI: removed temporary text-repair observer workaround',
    'Fixed icon/symbol placeholders showing as ?? in panel and feature windows',
  ]},
  { version: '3.1.04', date: '2026-03', notes: [
    'Tools Hub: customizable cards, updated tool descriptions, and sprite-based icons',
    'Dashboard: Shop Restock tile now uses the Coin UI sprite; Celestial Restocks hide rate percentages',
    'Journal: fixed Amberlit/Ambershine variant matching for completion tracking',
  ]},
  { version: '3.1.03', date: '2026-03', notes: [
    'Resize handling fixes for feature windows',
    'Minimize/restore handling fixes',
    'Scroll handling fixes for Pets Manager and Pet Optimizer',
  ]},
  { version: '3.1.0', date: '2026-03', notes: [
    'Consolidated tabs into hub windows (Trackers, Utility, Pets)',
    'Shop Restock rewritten with Supabase data',
    'Dashboard: Changelog card, shop restock cards, dashboard modules',
    'Removed Achievements tab',
  ]},
  { version: '3.0.66', date: '2026-03', notes: [
    'Fix XP tracker catalog race condition',
    'Fix garden filter mutations display',
  ]},
  { version: '3.0.65', date: '2026-03', notes: [
    'XP Tracker swap button',
    'Garden filters improvements',
  ]},
  { version: '3.0.64', date: '2026-02', notes: [
    'Sprite mutations + garden filters (amberlit)',
  ]},
];

// ---------------------------------------------------------------------------
// Dashboard modules
// ---------------------------------------------------------------------------

const DASHBOARD_MODULES_KEY = 'qpm.dashboardModules';

type ModuleId = 'xp-near-max' | 'turtle-timer' | 'active-pets' | 'next-restock';

interface DashboardModule {
  id: ModuleId;
  label: string;
  icon: string;
}

const ALL_MODULES: DashboardModule[] = [
  { id: 'xp-near-max', label: 'XP Near Max', icon: '✨' },
  { id: 'turtle-timer', label: 'Turtle Timer', icon: '🐢' },
  { id: 'active-pets', label: 'Active Pets', icon: '🐾' },
  { id: 'next-restock', label: 'Next Restock', icon: '🏪' },
];

function loadEnabledModules(): Set<ModuleId> {
  const saved = storage.get<ModuleId[] | null>(DASHBOARD_MODULES_KEY, null);
  return new Set(saved ?? []);
}

function saveEnabledModules(ids: Set<ModuleId>): void {
  storage.set(DASHBOARD_MODULES_KEY, [...ids]);
}

// ---------------------------------------------------------------------------
// Shop restock card helpers
// ---------------------------------------------------------------------------

// These are specific items tracked in the restock database with special pity logic.
// They are matched by item_id (trying multiple known aliases), not by shop_type.
// Item IDs must stay in sync with CELESTIAL_IDS in shopRestockWindow.ts.
const CELESTIAL_ITEMS = [
  {
    label: 'Starweaver',
    color: 'rgba(255,215,0,0.12)',
    accent: '#FFD700',
    itemIds: ['StarweaverPod', 'Starweaver'],
  },
  {
    label: 'Dawnbinder',
    color: 'rgba(255,152,0,0.12)',
    accent: '#FF9800',
    itemIds: ['DawnbinderPod', 'Dawnbinder', 'DawnCelestial'],
  },
  {
    label: 'Moonbinder',
    color: 'rgba(156,39,176,0.12)',
    accent: '#CE93D8',
    itemIds: ['MoonbinderPod', 'Moonbinder', 'MoonCelestial'],
  },
  {
    label: 'Mythical Egg',
    color: 'rgba(66,165,245,0.12)',
    accent: '#42A5F5',
    itemIds: ['MythicalEgg', 'MythicalEggs'],
  },
] as const;

/** Try to get a sprite data URL for the first matching item ID alias. Returns '' if not found. */
function getCelestialSpriteUrl(itemIds: readonly string[]): string {
  for (const id of itemIds) {
    const url = getCropSpriteDataUrl(id);
    if (url) return url;
  }
  return '';
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Soon™';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

// ETA format matching the restock tracker: ~Xm / ~Xh / ~Xd
function formatETA(ts: number): string {
  if (!ts) return '—';
  const diff = ts - Date.now();
  if (diff <= 0) return '—'; // stale — Supabase will have a new prediction after next refresh
  const min = Math.ceil(diff / 60_000);
  if (min < 60) return `~${min}m`;
  const hr = Math.ceil(diff / 3_600_000);
  if (hr < 24) return `~${hr}h`;
  const day = Math.ceil(diff / 86_400_000);
  return `~${day}d`;
}

// 7-tier color scale matching the restock tracker: green = imminent, red = far
function etaColor(ts: number): string {
  if (!ts) return 'rgba(224,224,224,0.4)';
  const diff = ts - Date.now();
  if (diff <= 0)   return 'rgba(224,224,224,0.3)'; // stale — muted until next refresh
  const h = diff / 3_600_000;
  if (h < 1)        return '#22c55e';
  if (h < 6)        return '#84cc16';
  if (h < 24)       return '#eab308';
  const d = diff / 86_400_000;
  if (d < 7)        return '#f97316';
  if (d < 14)       return '#f87171';
  return '#ef4444';
}

// ---------------------------------------------------------------------------
// createStatsHeader
// ---------------------------------------------------------------------------

export function createStatsHeader(
  uiState: UIState,
  cfg: any,
  saveCfg: () => void,
  resetAllStats: () => void,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'qpm-card';
  container.dataset.qpmSection = 'header';
  container.style.cssText = 'background:linear-gradient(135deg,rgba(143,130,255,0.08),rgba(143,130,255,0.03));border:1px solid rgba(143,130,255,0.15);';

  // ── Header row ──
  const headerRow = document.createElement('div');
  headerRow.className = 'qpm-card__header';

  const headerTitle = document.createElement('div');
  headerTitle.className = 'qpm-card__title';
  headerTitle.textContent = 'Dashboard';
  headerTitle.style.cssText = 'font-size:14px;font-weight:700;letter-spacing:0.3px;';

  const resetButton = btn('♻ Reset Stats', resetAllStats);
  resetButton.classList.add('qpm-button--accent');
  resetButton.style.fontSize = '11px';
  resetButton.title = 'Reset session stats counters';

  headerRow.append(headerTitle, resetButton);
  container.appendChild(headerRow);

  // ── Shop Restock summary ──
  const shopSection = buildShopRestockSection();
  container.appendChild(shopSection);

  // ── Changelog ──
  const changelogCard = buildChangelogCard();
  container.appendChild(changelogCard);

  // Feature modules were removed from Dashboard to keep the surface minimal.

  return container;
}

// ---------------------------------------------------------------------------
// Shop restock summary
// ---------------------------------------------------------------------------

function buildShopRestockSection(): HTMLElement {
  const section = document.createElement('div');
  section.style.cssText = 'margin-top:14px;';

  const sectionTitle = document.createElement('div');
  sectionTitle.style.cssText = 'font-size:11px;font-weight:600;color:#64b5f6;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;';
  sectionTitle.textContent = '✨ Celestial Restocks';
  section.appendChild(sectionTitle);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;';
  section.appendChild(grid);

  // One card per celestial item — looked up by item_id, not shop_type
  const cardEls: Array<{ nextEl: HTMLElement; subEl: HTMLElement; ts: number }> = [];

  for (const item of CELESTIAL_ITEMS) {
    const card = document.createElement('div');
    card.style.cssText = [
      'padding:8px 10px',
      `background:${item.color}`,
      `border:1px solid ${item.accent}40`,
      'border-radius:6px',
      'display:flex',
      'flex-direction:column',
      'gap:3px',
      'min-width:0',
    ].join(';');

    const nameEl = document.createElement('div');
    nameEl.style.cssText = `font-size:10px;font-weight:700;color:${item.accent};letter-spacing:0.3px;display:flex;align-items:center;gap:3px;`;
    const spriteUrl = getCelestialSpriteUrl(item.itemIds);
    if (spriteUrl) {
      const img = document.createElement('img');
      img.src = spriteUrl;
      img.style.cssText = 'height:16px;width:auto;image-rendering:pixelated;flex-shrink:0;';
      nameEl.appendChild(img);
    }
    nameEl.appendChild(document.createTextNode(item.label));

    // ETA row: large colored countdown
    const nextEl = document.createElement('div');
    nextEl.style.cssText = 'font-size:15px;font-weight:700;color:rgba(224,224,224,0.4);font-variant-numeric:tabular-nums;';
    nextEl.textContent = '—';

    // Last seen row
    const subRow = document.createElement('div');
    subRow.style.cssText = 'display:flex;align-items:center;gap:5px;';
    const subEl = document.createElement('span');
    subEl.style.cssText = 'font-size:10px;color:rgba(224,224,224,0.3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    subEl.textContent = 'Loading...';
    subRow.append(subEl);

    card.append(nameEl, nextEl, subRow);
    grid.appendChild(card);
    cardEls.push({ nextEl, subEl, ts: 0 });
  }

  // Find best matching item across aliases.
  // Preference: earliest future ETA, then newest last_seen, then first alias order.
  const findItem = (allItems: RestockItem[], aliases: readonly string[]): RestockItem | null => {
    const aliasOrder = new Map<string, number>();
    aliases.forEach((alias, index) => {
      aliasOrder.set(alias.toLowerCase(), index);
    });

    const candidates = allItems.filter((item) => aliasOrder.has((item.item_id ?? '').toLowerCase()));
    if (!candidates.length) return null;

    const now = Date.now();
    candidates.sort((a, b) => {
      const aTs = a.estimated_next_timestamp ?? 0;
      const bTs = b.estimated_next_timestamp ?? 0;
      const aHasFuture = aTs > now;
      const bHasFuture = bTs > now;

      if (aHasFuture !== bHasFuture) return aHasFuture ? -1 : 1;
      if (aHasFuture && bHasFuture && aTs !== bTs) return aTs - bTs;

      const aLast = a.last_seen ?? 0;
      const bLast = b.last_seen ?? 0;
      if (aLast !== bLast) return bLast - aLast;

      const aOrder = aliasOrder.get((a.item_id ?? '').toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = aliasOrder.get((b.item_id ?? '').toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });

    return candidates[0] ?? null;
  };

  // Update card contents from dataset
  const updateCards = (allItems: RestockItem[]): void => {
    CELESTIAL_ITEMS.forEach((def, i) => {
      const card = cardEls[i];
      if (!card) return;
      const { nextEl, subEl } = card;

      const found = findItem(allItems, def.itemIds);
      if (!found) {
        nextEl.textContent = '—';
        nextEl.style.color = 'rgba(224,224,224,0.4)';
        subEl.textContent = 'No data yet';
        card.ts = 0;
        return;
      }

      const ts = found.estimated_next_timestamp ?? 0;
      card.ts = ts;
      nextEl.textContent = formatETA(ts);
      nextEl.style.color = etaColor(ts);

      const now = Date.now();
      subEl.textContent = found.last_seen
        ? `Last ${Math.round((now - found.last_seen) / 86_400_000)}d ago`
        : '';
    });
  };

  // Live countdown ticker — update ETA text + color every 30s (matches restock window)
  const stopTicker = visibleInterval('dashboard-restock-cards', () => {
    for (const card of cardEls) {
      if (!card.ts) continue;
      card.nextEl.textContent = formatETA(card.ts);
      card.nextEl.style.color = etaColor(card.ts);
    }
  }, 30_000);

  const stopRestockSync = onRestockDataUpdated((detail) => {
    updateCards(detail.items ?? getRestockDataSync() ?? []);
  });

  // Cleanup on container detach
  const obs = new MutationObserver(() => {
    if (!section.isConnected) {
      obs.disconnect();
      stopTicker();
      stopRestockSync();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // Load data
  const cached = getRestockDataSync();
  if (cached) updateCards(cached);

  fetchRestockData(false).then(items => updateCards(items)).catch(err => {
    log('⚠️ [Dashboard] Failed to load restock data', err);
  });

  return section;
}

// ---------------------------------------------------------------------------
// Changelog card
// ---------------------------------------------------------------------------

function buildChangelogCard(): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = [
    'margin-top:14px',
    'padding:10px',
    'background:rgba(255,255,255,0.03)',
    'border:1px solid rgba(143,130,255,0.15)',
    'border-radius:6px',
  ].join(';');

  const headerRow = document.createElement('div');
  headerRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:11px;font-weight:700;color:#8f82ff;';
  title.textContent = '📋 Changelog';

  const visibleEntries = CHANGELOG.slice(0, 3);
  const latest = visibleEntries[0]!;
  const latestBadge = document.createElement('div');
  latestBadge.style.cssText = 'font-size:10px;color:rgba(224,224,224,0.5);';
  latestBadge.textContent = `v${latest.version}`;

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.style.cssText = 'background:none;border:none;color:rgba(224,224,224,0.4);font-size:10px;cursor:pointer;padding:0 2px;';
  toggleBtn.textContent = '▶';

  headerRow.append(title, latestBadge, toggleBtn);
  card.appendChild(headerRow);

  // All changelog content — collapsed by default
  const body = document.createElement('div');
  body.style.display = 'none';

  for (let index = 0; index < visibleEntries.length; index += 1) {
    const entry = visibleEntries[index]!;
    body.appendChild(buildChangelogEntry(entry, index === 0));
  }
  card.appendChild(body);

  let expanded = false;
  const toggle = (): void => {
    expanded = !expanded;
    body.style.display = expanded ? 'block' : 'none';
    toggleBtn.textContent = expanded ? '▼' : '▶';
  };
  headerRow.addEventListener('click', toggle);

  return card;
}

function buildChangelogEntry(entry: { version: string; date: string; notes: string[] }, isLatest: boolean): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `margin-top:8px;padding-top:${isLatest ? '8' : '6'}px;${isLatest ? '' : 'border-top:1px solid rgba(255,255,255,0.06);'}`;

  const versionRow = document.createElement('div');
  versionRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';

  const versionBadge = document.createElement('span');
  versionBadge.style.cssText = `font-size:10px;font-weight:700;color:${isLatest ? '#8f82ff' : '#aaa'};`;
  versionBadge.textContent = `v${entry.version}`;

  const dateBadge = document.createElement('span');
  dateBadge.style.cssText = 'font-size:10px;color:rgba(224,224,224,0.35);';
  dateBadge.textContent = entry.date;

  versionRow.append(versionBadge, dateBadge);
  el.appendChild(versionRow);

  const list = document.createElement('ul');
  list.style.cssText = 'margin:0;padding:0 0 0 14px;';
  for (const note of entry.notes) {
    const li = document.createElement('li');
    li.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.7);margin-bottom:2px;';
    li.textContent = note;
    list.appendChild(li);
  }
  el.appendChild(list);

  return el;
}

// ---------------------------------------------------------------------------
// Dashboard modules
// ---------------------------------------------------------------------------

function buildModulesSection(uiState: UIState): HTMLElement {
  const section = document.createElement('div');
  section.style.cssText = 'margin-top:14px;';

  const headerRow = document.createElement('div');
  headerRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';

  const sectionTitle = document.createElement('div');
  sectionTitle.style.cssText = 'font-size:11px;font-weight:600;color:rgba(224,224,224,0.6);text-transform:uppercase;letter-spacing:0.5px;';
  sectionTitle.textContent = '⚡ Feature Modules';

  const customizeBtn = document.createElement('button');
  customizeBtn.type = 'button';
  customizeBtn.textContent = '⚙ Customize';
  customizeBtn.style.cssText = [
    'font-size:10px',
    'padding:2px 8px',
    'background:rgba(143,130,255,0.1)',
    'border:1px solid rgba(143,130,255,0.25)',
    'border-radius:4px',
    'color:#c8c0ff',
    'cursor:pointer',
  ].join(';');

  headerRow.append(sectionTitle, customizeBtn);
  section.appendChild(headerRow);

  const togglePanel = document.createElement('div');
  togglePanel.style.cssText = [
    'background:rgba(0,0,0,0.25)',
    'border:1px solid rgba(143,130,255,0.15)',
    'border-radius:6px',
    'padding:8px 10px',
    'margin-bottom:8px',
    'flex-wrap:wrap',
    'gap:8px',
  ].join(';');
  togglePanel.style.display = 'none';
  section.appendChild(togglePanel);

  let enabledModules = loadEnabledModules();

  const moduleCards = document.createElement('div');
  moduleCards.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;';
  section.appendChild(moduleCards);

  const renderTogglePanel = (): void => {
    togglePanel.innerHTML = '';
    for (const mod of ALL_MODULES) {
      const chip = document.createElement('label');
      chip.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;color:rgba(224,224,224,0.7);cursor:pointer;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = enabledModules.has(mod.id);
      cb.style.accentColor = '#8f82ff';
      cb.addEventListener('change', () => {
        if (cb.checked) enabledModules.add(mod.id);
        else enabledModules.delete(mod.id);
        saveEnabledModules(enabledModules);
        renderModuleCards();
      });
      chip.append(cb, document.createTextNode(`${mod.icon} ${mod.label}`));
      togglePanel.appendChild(chip);
    }
  };

  let moduleCleanups: Array<() => void> = [];

  const renderModuleCards = (): void => {
    moduleCleanups.forEach(fn => fn());
    moduleCleanups = [];
    moduleCards.innerHTML = '';
    if (enabledModules.size === 0) {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.3);font-style:italic;';
      hint.textContent = 'No modules enabled. Click ⚙ Customize to add some.';
      moduleCards.appendChild(hint);
      return;
    }
    for (const modDef of ALL_MODULES) {
      if (!enabledModules.has(modDef.id)) continue;
      moduleCards.appendChild(buildModuleCard(modDef, uiState, (cleanup) => {
        moduleCleanups.push(cleanup);
      }));
    }
  };

  const obs = new MutationObserver(() => {
    if (!section.isConnected) {
      obs.disconnect();
      moduleCleanups.forEach(fn => fn());
      moduleCleanups = [];
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  customizeBtn.addEventListener('click', () => {
    const showing = togglePanel.style.display !== 'none';
    togglePanel.style.display = showing ? 'none' : 'flex';
    if (!showing) renderTogglePanel();
  });

  renderModuleCards();
  return section;
}

// ─── Compact helpers ──────────────────────────────────────────────────────────

function makeChannelRow(icon: string, label: string): { el: HTMLElement; val: HTMLElement } {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:4px;';
  const labelEl = document.createElement('span');
  labelEl.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.4);white-space:nowrap;';
  labelEl.textContent = `${icon} ${label}`;
  const val = document.createElement('span');
  val.style.cssText = 'font-size:12px;font-weight:600;color:#e0e0e0;';
  val.textContent = '—';
  row.append(labelEl, val);
  return { el: row, val };
}

function makeBar(pct: number, color: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'flex:1;height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;min-width:30px;';
  const fill = document.createElement('div');
  fill.style.cssText = `height:100%;width:${Math.max(0, Math.min(100, pct))}%;background:${color};border-radius:3px;transition:width 0.4s;`;
  wrap.appendChild(fill);
  return wrap;
}

function hungerColor(pct: number): string {
  if (pct >= 75) return '#4caf50';
  if (pct >= 40) return '#ff9800';
  return '#f44336';
}

// ─── Module card dispatcher ───────────────────────────────────────────────────

function buildModuleCard(
  mod: DashboardModule,
  _uiState: UIState,
  onCleanup: (fn: () => void) => void,
): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = [
    'padding:8px 10px',
    'background:rgba(255,255,255,0.04)',
    'border:1px solid rgba(143,130,255,0.12)',
    'border-radius:6px',
    'display:flex',
    'flex-direction:column',
    'gap:5px',
    'overflow:hidden',
  ].join(';');

  const cleanups: Array<() => void> = [];
  const reg = (fn: () => void): void => { cleanups.push(fn); };

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:4px;min-height:18px;';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:10px;font-weight:600;color:rgba(224,224,224,0.5);text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap;';
  titleEl.textContent = `${mod.icon} ${mod.label}`;
  titleRow.appendChild(titleEl);
  card.appendChild(titleRow);

  if (mod.id === 'turtle-timer') buildTurtleTimerModule(card, titleRow, reg);
  else if (mod.id === 'active-pets') buildActivePetsModule(card, titleRow, reg);
  else if (mod.id === 'xp-near-max') buildXpNearMaxModule(card, reg);
  else if (mod.id === 'next-restock') buildNextRestockModule(card, reg);

  onCleanup(() => cleanups.forEach(fn => fn()));
  return card;
}

// ─── Turtle Timer module ──────────────────────────────────────────────────────

function buildTurtleTimerModule(
  card: HTMLElement,
  titleRow: HTMLElement,
  reg: (fn: () => void) => void,
): void {
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.textContent = '...';
  toggleBtn.style.cssText = [
    'font-size:10px', 'padding:1px 8px', 'border-radius:3px', 'cursor:pointer',
    'border:1px solid rgba(143,130,255,0.3)', 'background:rgba(143,130,255,0.08)',
    'color:rgba(224,224,224,0.4)', 'flex-shrink:0',
  ].join(';');
  titleRow.appendChild(toggleBtn);

  const plantRow = makeChannelRow('🌱', 'Plant');
  const eggRow   = makeChannelRow('🥚', 'Egg');
  const footerEl = document.createElement('div');
  footerEl.style.cssText = 'font-size:10px;color:rgba(224,224,224,0.3);';
  card.append(plantRow.el, eggRow.el, footerEl);

  let currentEnabled = false;
  let plantEndTime: number | null = null;
  let plantRate = 1;
  let eggEndTime: number | null = null;
  let eggRate = 1;

  toggleBtn.addEventListener('click', () => setTurtleTimerEnabled(!currentEnabled));

  const tick = (): void => {
    const now = Date.now();
    if (plantEndTime != null) {
      const adj = Math.max(0, plantEndTime - now) / Math.max(0.01, plantRate);
      plantRow.val.textContent = adj > 0 ? formatCountdown(adj) : 'Ready';
    } else { plantRow.val.textContent = '—'; }
    if (eggEndTime != null) {
      const adj = Math.max(0, eggEndTime - now) / Math.max(0.01, eggRate);
      eggRow.val.textContent = adj > 0 ? formatCountdown(adj) : 'Ready';
    } else { eggRow.val.textContent = '—'; }
  };

  reg(onTurtleTimerState((snap) => {
    currentEnabled = snap.enabled;
    toggleBtn.textContent = snap.enabled ? 'ON' : 'OFF';
    toggleBtn.style.color = snap.enabled ? '#4caf50' : 'rgba(224,224,224,0.4)';
    toggleBtn.style.borderColor = snap.enabled ? 'rgba(76,175,80,0.4)' : 'rgba(143,130,255,0.3)';
    if (!snap.enabled) {
      plantEndTime = eggEndTime = null;
      plantRow.val.textContent = eggRow.val.textContent = 'Off';
      footerEl.textContent = 'Disabled'; return;
    }
    const getEnd = (ch: TurtleTimerChannel): number | null =>
      (ch.focusSlot as (GardenSlotEstimate & { remainingMs: number | null; endTime?: number }) | null)?.endTime ?? null;
    plantEndTime = getEnd(snap.plant); plantRate = snap.plant.effectiveRate ?? 1;
    eggEndTime   = getEnd(snap.egg);   eggRate   = snap.egg.effectiveRate ?? 1;
    footerEl.textContent = snap.availableTurtles > 0
      ? `${snap.availableTurtles} turtle${snap.availableTurtles !== 1 ? 's' : ''} active`
      : 'No turtles available';
    tick();
  }));
  reg(visibleInterval('dashboard-turtle-module', tick, 1000));
}

// ─── Active Pets module ───────────────────────────────────────────────────────

function buildActivePetsModule(
  card: HTMLElement,
  titleRow: HTMLElement,
  reg: (fn: () => void) => void,
): void {
  const feedAllBtn = document.createElement('button');
  feedAllBtn.type = 'button';
  feedAllBtn.textContent = '🍖 All';
  feedAllBtn.style.cssText = [
    'font-size:10px', 'padding:1px 6px', 'border-radius:3px', 'cursor:pointer',
    'border:1px solid rgba(143,130,255,0.3)', 'background:rgba(143,130,255,0.08)',
    'color:#c8c0ff', 'flex-shrink:0',
  ].join(';');
  titleRow.appendChild(feedAllBtn);

  feedAllBtn.addEventListener('click', async () => {
    feedAllBtn.disabled = true; feedAllBtn.textContent = '⏳';
    try {
      const { feedAllPetsInstantly } = await import('../../features/instantFeed');
      await feedAllPetsInstantly(100, false);
    } catch (err) { log('⚠️ Feed all failed', err); }
    finally { feedAllBtn.disabled = false; feedAllBtn.textContent = '🍖 All'; }
  });

  const listEl = document.createElement('div');
  listEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  card.appendChild(listEl);

  const render = (pets: ActivePetInfo[]): void => {
    listEl.innerHTML = '';
    if (!pets.length) {
      const e = document.createElement('div');
      e.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.3);font-style:italic;';
      e.textContent = 'No active pets'; listEl.appendChild(e); return;
    }
    for (const pet of pets.slice(0, 3)) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:5px;';
      const nameEl = document.createElement('span');
      nameEl.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.75);min-width:52px;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      nameEl.textContent = pet.name || pet.species || `Pet ${pet.slotIndex + 1}`;
      const pct = pet.hungerPct ?? 0;
      const bar = makeBar(pct, hungerColor(pct));
      const pctEl = document.createElement('span');
      pctEl.style.cssText = `font-size:10px;color:${hungerColor(pct)};min-width:28px;text-align:right;`;
      pctEl.textContent = `${Math.round(pct)}%`;
      const feedBtn = document.createElement('button');
      feedBtn.type = 'button'; feedBtn.textContent = '🍖'; feedBtn.title = 'Feed';
      feedBtn.style.cssText = 'font-size:11px;padding:0 4px;border-radius:3px;cursor:pointer;border:1px solid rgba(143,130,255,0.2);background:rgba(143,130,255,0.06);flex-shrink:0;line-height:1.5;';
      const idx = pet.slotIndex;
      feedBtn.addEventListener('click', async () => {
        feedBtn.disabled = true; feedBtn.textContent = '⏳';
        try {
          const { feedPetInstantly } = await import('../../features/instantFeed');
          await feedPetInstantly(idx, false);
        } catch (err) { log('⚠️ Feed failed', err); }
        finally { feedBtn.disabled = false; feedBtn.textContent = '🍖'; }
      });
      row.append(nameEl, bar, pctEl, feedBtn);
      listEl.appendChild(row);
    }
  };

  reg(onActivePetInfos(render));
}

// ─── XP Near Max module ───────────────────────────────────────────────────────

function buildXpNearMaxModule(
  card: HTMLElement,
  reg: (fn: () => void) => void,
): void {
  const listEl = document.createElement('div');
  listEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  card.appendChild(listEl);

  const render = (pets: ActivePetInfo[]): void => {
    listEl.innerHTML = '';
    // Compute pct-to-max for each pet; sort closest-to-max first
    type PetWithPct = { pet: ActivePetInfo; pct: number; str: number };
    const withPct = pets.reduce<PetWithPct[]>((acc, p) => {
      if (p.strength === null) return acc;
      const maxStr = p.targetScale !== null && p.species !== null
        ? calculateMaxStrength(p.targetScale, p.species)
        : null;
      const pct = maxStr !== null && maxStr > 0
        ? Math.min(100, Math.round((p.strength / maxStr) * 100))
        : null;
      if (pct !== null) acc.push({ pet: p, pct, str: p.strength });
      return acc;
    }, []).sort((a, b) => b.pct - a.pct);

    if (!withPct.length) {
      const e = document.createElement('div');
      e.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.3);font-style:italic;';
      e.textContent = 'No XP data'; listEl.appendChild(e); return;
    }
    for (const { pet, pct, str } of withPct.slice(0, 3)) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:5px;';
      const nameEl = document.createElement('span');
      nameEl.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.75);min-width:52px;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      nameEl.textContent = pet.name || pet.species || `Pet ${pet.slotIndex + 1}`;
      const clr = pct >= 95 ? '#8f82ff' : pct >= 80 ? '#ff9800' : 'rgba(255,255,255,0.5)';
      const bar = makeBar(pct, clr);
      const pctEl = document.createElement('span');
      pctEl.style.cssText = `font-size:10px;color:${clr};min-width:30px;text-align:right;white-space:nowrap;`;
      pctEl.textContent = `${pct}% (${Math.round(str)})`;
      row.append(nameEl, bar, pctEl);
      listEl.appendChild(row);
    }
  };

  reg(onActivePetInfos(render));
}

// ─── Next Restock module ──────────────────────────────────────────────────────

function buildNextRestockModule(
  card: HTMLElement,
  reg: (fn: () => void) => void,
): void {
  const SHOP_ICONS: Record<string, string> = {
    'seed': '🌱', 'egg': '🥚', 'decor': '🏡', 'weather': '🌤',
  };
  const SHOP_LABELS: Record<string, string> = {
    'seed': 'Seeds', 'egg': 'Eggs', 'decor': 'Decor', 'weather': 'Weather',
  };
  const SHOP_ORDER = ['seed', 'egg', 'decor', 'weather'];

  const listEl = document.createElement('div');
  listEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  card.appendChild(listEl);

  const shopSlots = new Map<string, { tsEl: HTMLElement; ts: number }>();

  const buildRows = (items: RestockItem[]): void => {
    listEl.innerHTML = '';
    shopSlots.clear();
    const now = Date.now();
    const byShop = new Map<string, RestockItem>();
    for (const it of items) {
      if (!it.shop_type || !it.estimated_next_timestamp) continue;
      const ex = byShop.get(it.shop_type);
      if (!ex || it.estimated_next_timestamp < (ex.estimated_next_timestamp ?? Infinity)) {
        byShop.set(it.shop_type, it);
      }
    }
    if (!byShop.size) {
      const e = document.createElement('div');
      e.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.3);font-style:italic;';
      e.textContent = 'No data'; listEl.appendChild(e); return;
    }
    for (const shopKey of SHOP_ORDER) {
      const it = byShop.get(shopKey);
      if (!it) continue;
      const ts = it.estimated_next_timestamp ?? 0;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:5px;';
      const iconEl = document.createElement('span');
      iconEl.style.cssText = 'font-size:12px;flex-shrink:0;';
      iconEl.textContent = SHOP_ICONS[shopKey] ?? '🏪';
      const nameEl = document.createElement('span');
      nameEl.style.cssText = 'font-size:10px;color:rgba(224,224,224,0.6);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      nameEl.textContent = (it.item_id ?? shopKey).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const prob = it.current_probability ?? (it as RestockItem & { appearance_rate?: number }).appearance_rate ?? 0;
      const probEl = document.createElement('span');
      probEl.style.cssText = 'font-size:10px;color:rgba(224,224,224,0.4);flex-shrink:0;';
      probEl.textContent = `${Math.round(prob * 100)}%`;
      const tsEl = document.createElement('span');
      tsEl.style.cssText = 'font-size:10px;color:#8f82ff;min-width:44px;text-align:right;flex-shrink:0;';
      tsEl.textContent = ts > now ? formatCountdown(ts - now) : 'Soon™';
      shopSlots.set(shopKey, { tsEl, ts });
      row.append(iconEl, nameEl, probEl, tsEl);
      listEl.appendChild(row);
    }
  };

  buildRows(getRestockDataSync() ?? []);
  void fetchRestockData().then(items => { if (items) buildRows(items); }).catch(() => { /* no-op */ });

  reg(visibleInterval('dashboard-restock-module', () => {
    const now = Date.now();
    for (const { tsEl, ts } of shopSlots.values()) {
      tsEl.textContent = ts > now ? formatCountdown(ts - now) : 'Soon™';
    }
  }, 1000));
}
