// src/ui/sections/statsHeaderSection.ts — Dashboard stats header section
import { type UIState } from '../panelState';
import { btn } from '../panelHelpers';
import { log } from '../../utils/logger';
import { storage } from '../../utils/storage';
import { fetchRestockData, getRestockDataSync, getItemProbability, type RestockItem } from '../../utils/restockDataService';
import { getActivePetInfos } from '../../store/pets';
import { onTurtleTimerState } from '../../features/turtleTimer.ts';
import type { TurtleTimerState } from '../../features/turtleTimer.ts';
import { visibleInterval } from '../../utils/timerManager';

// ---------------------------------------------------------------------------
// Changelog (hardcoded — most practical for userscript)
// ---------------------------------------------------------------------------

const CHANGELOG: Array<{ version: string; date: string; notes: string[] }> = [
  { version: '3.0.67', date: '2026-03', notes: [
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

const SHOP_TYPES = [
  { key: 'Starweaver', emoji: '⭐', color: 'rgba(255,215,0,0.12)', accent: '#FFD700' },
  { key: 'Dawnbinder', emoji: '🌅', color: 'rgba(255,152,0,0.12)', accent: '#FF9800' },
  { key: 'Moonbinder', emoji: '🌙', color: 'rgba(156,39,176,0.12)', accent: '#CE93D8' },
  { key: 'Mythical Eggs', emoji: '🥚', color: 'rgba(66,165,245,0.12)', accent: '#42A5F5' },
];

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Soon™';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
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

  // ── Dashboard Modules ──
  const modulesSection = buildModulesSection(uiState);
  container.appendChild(modulesSection);

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
  sectionTitle.textContent = '🏪 Shop Restock';
  section.appendChild(sectionTitle);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;';
  section.appendChild(grid);

  // One card per shop type
  const cardEls: Array<{ el: HTMLElement; nextEl: HTMLElement; topEl: HTMLElement }> = [];

  for (const shop of SHOP_TYPES) {
    const card = document.createElement('div');
    card.style.cssText = [
      `padding:8px 10px`,
      `background:${shop.color}`,
      `border:1px solid ${shop.accent}30`,
      `border-radius:6px`,
      `display:flex`,
      `flex-direction:column`,
      `gap:3px`,
      `min-width:0`,
    ].join(';');

    const shopName = document.createElement('div');
    shopName.style.cssText = `font-size:10px;font-weight:700;color:${shop.accent};text-transform:uppercase;letter-spacing:0.4px;`;
    shopName.textContent = `${shop.emoji} ${shop.key}`;

    const nextEl = document.createElement('div');
    nextEl.style.cssText = 'font-size:12px;font-weight:600;color:#e0e0e0;';
    nextEl.textContent = '—';

    const topEl = document.createElement('div');
    topEl.style.cssText = 'font-size:10px;color:rgba(224,224,224,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    topEl.textContent = 'Loading...';

    card.append(shopName, nextEl, topEl);
    grid.appendChild(card);
    cardEls.push({ el: card, nextEl, topEl });
  }

  // Update card contents with data
  const updateCards = (items: RestockItem[]): void => {
    SHOP_TYPES.forEach((shop, i) => {
      const card = cardEls[i];
      if (!card) return;
      const { nextEl, topEl } = card;
      const shopItems = items.filter(it =>
        (it.shop_type ?? '').toLowerCase() === shop.key.toLowerCase()
      );

      if (!shopItems.length) {
        nextEl.textContent = '—';
        topEl.textContent = 'No data';
        return;
      }

      // Find soonest next restock
      const now = Date.now();
      const withNext = shopItems
        .filter(it => it.estimated_next_timestamp != null)
        .sort((a, b) => (a.estimated_next_timestamp ?? 0) - (b.estimated_next_timestamp ?? 0));

      if (withNext.length) {
        const soonest = withNext[0]!;
        const remaining = (soonest.estimated_next_timestamp ?? 0) - now;
        nextEl.textContent = remaining > 0 ? formatCountdown(remaining) : 'Soon™';
        const prob = getItemProbability(soonest);
        const probText = prob != null ? ` (${prob.toFixed(0)}%)` : '';
        topEl.textContent = `${soonest.item_id ?? '?'}${probText}`;
        nextEl.dataset.ts = String(soonest.estimated_next_timestamp ?? '');
      } else {
        nextEl.textContent = '—';
        // Show highest prob item
        const byProb = [...shopItems].sort((a, b) =>
          (getItemProbability(b) ?? -1) - (getItemProbability(a) ?? -1)
        );
        topEl.textContent = byProb[0]?.item_id ?? '—';
      }
    });
  };

  // Live countdown ticker
  const stopTicker = visibleInterval('dashboard-restock-cards', () => {
    for (const { nextEl } of cardEls) {
      const ts = parseInt(nextEl.dataset.ts ?? '0', 10);
      if (!ts) continue;
      const remaining = ts - Date.now();
      nextEl.textContent = remaining > 0 ? formatCountdown(remaining) : 'Soon™';
    }
  }, 1000);

  // Cleanup on container detach
  const obs = new MutationObserver(() => {
    if (!section.isConnected) { obs.disconnect(); stopTicker(); }
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

  const latest = CHANGELOG[0]!;
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

  const latestEntry = buildChangelogEntry(latest, true);
  body.appendChild(latestEntry);

  for (const entry of CHANGELOG.slice(1)) {
    body.appendChild(buildChangelogEntry(entry, false));
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

  // Toggle panel
  const togglePanel = document.createElement('div');
  togglePanel.style.cssText = [
    'display:none',
    'background:rgba(0,0,0,0.25)',
    'border:1px solid rgba(143,130,255,0.15)',
    'border-radius:6px',
    'padding:8px 10px',
    'margin-bottom:8px',
    'display:flex',
    'flex-wrap:wrap',
    'gap:8px',
  ].join(';');
  togglePanel.style.display = 'none';
  section.appendChild(togglePanel);

  let enabledModules = loadEnabledModules();

  const moduleCards = document.createElement('div');
  moduleCards.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;';
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

  let turtleTimerCleanup: (() => void) | null = null;
  let moduleTickerCleanup: (() => void) | null = null;

  const renderModuleCards = (): void => {
    // Cleanup previous subscriptions
    turtleTimerCleanup?.();
    turtleTimerCleanup = null;
    moduleTickerCleanup?.();
    moduleTickerCleanup = null;
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
        if (modDef.id === 'turtle-timer') turtleTimerCleanup = cleanup;
        else if (modDef.id === 'next-restock') moduleTickerCleanup = cleanup;
      }));
    }
  };

  // Cleanup on section detach
  const obs = new MutationObserver(() => {
    if (!section.isConnected) {
      obs.disconnect();
      turtleTimerCleanup?.();
      moduleTickerCleanup?.();
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
    'gap:4px',
    'min-height:70px',
    'max-height:120px',
    'overflow:hidden',
  ].join(';');

  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:10px;font-weight:600;color:rgba(224,224,224,0.5);text-transform:uppercase;letter-spacing:0.3px;';
  titleEl.textContent = `${mod.icon} ${mod.label}`;
  card.appendChild(titleEl);

  const valueEl = document.createElement('div');
  valueEl.style.cssText = 'font-size:13px;font-weight:600;color:#e0e0e0;';
  card.appendChild(valueEl);

  const subEl = document.createElement('div');
  subEl.style.cssText = 'font-size:10px;color:rgba(224,224,224,0.45);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  card.appendChild(subEl);

  if (mod.id === 'active-pets') {
    const pets = getActivePetInfos();
    const names = pets.slice(0, 3).map(p => p.name || p.species || 'Pet');
    valueEl.textContent = String(pets.length);
    subEl.textContent = names.join(', ') || 'None active';

  } else if (mod.id === 'turtle-timer') {
    const update = (snap: TurtleTimerState): void => {
      if (!snap.enabled) { valueEl.textContent = 'Off'; subEl.textContent = ''; return; }
      const remaining = snap.plant.focusSlot?.remainingMs ?? null;
      if (remaining == null) { valueEl.textContent = '—'; subEl.textContent = 'No plant tracked'; return; }
      valueEl.textContent = formatCountdown(remaining);
      subEl.textContent = snap.plant.focusSlot?.species ?? '';
    };
    const unsub = onTurtleTimerState(update);
    onCleanup(unsub);
    valueEl.textContent = '—';
    subEl.textContent = 'Loading...';

  } else if (mod.id === 'xp-near-max') {
    const pets = getActivePetInfos();
    // "Near max" = strength >= 95 (max is 100)
    const nearMax = pets.filter(p => p.strength != null && p.strength >= 95);
    valueEl.textContent = String(nearMax.length);
    subEl.textContent = nearMax.length === 0
      ? 'None at str ≥95'
      : nearMax.map(p => p.name || p.species || 'Pet').join(', ');

  } else if (mod.id === 'next-restock') {
    const items = getRestockDataSync() ?? [];
    const now = Date.now();
    const withNext = items
      .filter(it => it.estimated_next_timestamp != null && it.estimated_next_timestamp > now)
      .sort((a, b) => (a.estimated_next_timestamp ?? 0) - (b.estimated_next_timestamp ?? 0));

    if (withNext.length) {
      const soonest = withNext[0]!;
      const remaining = (soonest.estimated_next_timestamp ?? 0) - now;
      valueEl.textContent = formatCountdown(remaining);
      valueEl.dataset.ts = String(soonest.estimated_next_timestamp ?? '');
      subEl.textContent = `${soonest.item_id ?? '?'} (${soonest.shop_type ?? '?'})`;
    } else {
      valueEl.textContent = '—';
      subEl.textContent = 'No data';
    }

    // Live countdown
    const stopTicker = visibleInterval(`dashboard-module-next-restock`, () => {
      const ts = parseInt(valueEl.dataset.ts ?? '0', 10);
      if (!ts) return;
      const remaining = ts - Date.now();
      valueEl.textContent = remaining > 0 ? formatCountdown(remaining) : 'Soon™';
    }, 1000);
    onCleanup(stopTicker);
  }

  return card;
}
