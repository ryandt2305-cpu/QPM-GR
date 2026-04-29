// src/ui/utilityHubWindow.ts
// Utility Hub — compact feature cards with Customize overlay

import { toggleWindow } from './modalWindow';
import { storage } from '../utils/storage';
import { log } from '../utils/logger';

const VISIBLE_CARDS_KEY = 'qpm.utilityHub.visibleCards';
const ACTIVITY_LOG_DEFAULT_MIGRATION_KEY = 'qpm.utilityHub.visibleCards.activityLogDefault.v1';
const AUTO_RECONNECT_DEFAULT_MIGRATION_KEY = 'qpm.utilityHub.visibleCards.autoReconnectDefault.v1';
const CONTROLLER_DEFAULT_MIGRATION_KEY = 'qpm.utilityHub.visibleCards.controllerDefault.v1';
const LOCKER_DEFAULT_MIGRATION_KEY = 'qpm.utilityHub.visibleCards.lockerDefault.v1';
const INV_CAPACITY_DEFAULT_MIGRATION_KEY = 'qpm.utilityHub.visibleCards.invCapacityDefault.v1';
const CALC_DEFAULT_MIGRATION_KEY = 'qpm.utilityHub.visibleCards.cropCalcDefault.v1';

const FEATURE_DEFS = [
  {
    key: 'garden-filters',
    label: 'Garden Filters',
    icon: '🔍',
    desc: 'Filter & highlight garden tiles by species, mutations, and attributes',
    windowTitle: '🔍 Garden Filters',
  },
  {
    key: 'auto-fav',
    label: 'Auto-Favorite',
    icon: '⭐',
    desc: 'Automatically favorite inventory items matching your saved rules',
    windowTitle: '⭐ Auto-Favorite',
  },
  {
    key: 'bulk-fav',
    label: 'Bulk Favorite',
    icon: '❤️',
    desc: 'Lock or unlock all matching items in your inventory at once',
    windowTitle: '❤️ Bulk Favorite',
  },
  {
    key: 'activity-log',
    label: 'Activity Log',
    icon: '📜',
    desc: 'Native activity history with persistent storage and safe replay',
    windowTitle: '📜 Activity Log',
  },
  {
    key: 'auto-reconnect',
    label: 'Auto Reconnect',
    icon: '↻',
    desc: 'Reconnect automatically after a disconnect',
    windowTitle: 'Auto Reconnect',
  },
  {
    key: 'reminders',
    label: 'Reminders',
    icon: '🔔',
    desc: 'Timers and alerts for garden events, harvests, and shop restocks',
    windowTitle: '🔔 Reminders',
  },
  {
    key: 'controller',
    label: 'Controller',
    icon: '🎮',
    desc: 'Gamepad support: analog cursor, D-pad snap, rebindable buttons, pet slot cycling',
    windowTitle: '🎮 Controller Settings',
  },
  {
    key: 'locker',
    label: 'Locker',
    icon: '🛡️',
    desc: 'Block game actions: inventory reserve, egg locks, harvest & pickup locks',
    windowTitle: '🛡️ Locker',
  },
  {
    key: 'inv-capacity',
    label: 'Inventory Capacity',
    icon: '🎒',
    desc: 'Visual warning when inventory approaches or reaches full capacity',
    windowTitle: '🎒 Inventory Capacity',
  },
  {
    key: 'calculator',
    label: 'Calculator',
    icon: '🧮',
    desc: 'Calculate crop and pet sell values with mutations, strength, and friend bonuses',
    windowTitle: '🧮 Calculator',
  },
] as const;

type FeatureKey = (typeof FEATURE_DEFS)[number]['key'];
type FeatureDef = (typeof FEATURE_DEFS)[number];

function loadVisibleCards(): FeatureKey[] {
  // Read as string[] to handle old keys that may no longer be valid FeatureKey values
  const saved = storage.get<string[] | null>(VISIBLE_CARDS_KEY, null);
  const defaultVisible = FEATURE_DEFS.map((f) => f.key) as FeatureKey[];
  const validKeys = new Set<FeatureKey>(defaultVisible);

  if (!Array.isArray(saved) || saved.length === 0) {
    return defaultVisible;
  }

  // Migrate renamed keys (crop-calculator → calculator)
  const renamed = saved.map((k) => (k === 'crop-calculator' ? 'calculator' : k));
  if (saved.some((k, i) => k !== renamed[i])) {
    storage.set(VISIBLE_CARDS_KEY, renamed);
  }

  let selected = renamed.filter((key): key is FeatureKey => validKeys.has(key as FeatureKey));
  if (selected.length === 0) {
    return defaultVisible;
  }

  const migrated = storage.get<boolean>(ACTIVITY_LOG_DEFAULT_MIGRATION_KEY, false);
  if (!migrated && !selected.includes('activity-log')) {
    const next: FeatureKey[] = [...selected, 'activity-log'];
    storage.set(VISIBLE_CARDS_KEY, next);
    storage.set(ACTIVITY_LOG_DEFAULT_MIGRATION_KEY, true);
    return next;
  }

  if (!migrated) {
    storage.set(ACTIVITY_LOG_DEFAULT_MIGRATION_KEY, true);
  }

  const autoReconnectMigrated = storage.get<boolean>(AUTO_RECONNECT_DEFAULT_MIGRATION_KEY, false);
  if (!autoReconnectMigrated && !selected.includes('auto-reconnect')) {
    const next: FeatureKey[] = [...selected, 'auto-reconnect'];
    storage.set(VISIBLE_CARDS_KEY, next);
    storage.set(AUTO_RECONNECT_DEFAULT_MIGRATION_KEY, true);
    selected = next;
  }

  if (!autoReconnectMigrated) {
    storage.set(AUTO_RECONNECT_DEFAULT_MIGRATION_KEY, true);
  }

  const controllerMigrated = storage.get<boolean>(CONTROLLER_DEFAULT_MIGRATION_KEY, false);
  if (!controllerMigrated && !selected.includes('controller')) {
    const next: FeatureKey[] = [...selected, 'controller'];
    storage.set(VISIBLE_CARDS_KEY, next);
    storage.set(CONTROLLER_DEFAULT_MIGRATION_KEY, true);
    selected = next;
  }

  if (!controllerMigrated) {
    storage.set(CONTROLLER_DEFAULT_MIGRATION_KEY, true);
  }

  const lockerMigrated = storage.get<boolean>(LOCKER_DEFAULT_MIGRATION_KEY, false);
  if (!lockerMigrated && !selected.includes('locker')) {
    const next: FeatureKey[] = [...selected, 'locker'];
    storage.set(VISIBLE_CARDS_KEY, next);
    storage.set(LOCKER_DEFAULT_MIGRATION_KEY, true);
    selected = next;
  }

  if (!lockerMigrated) {
    storage.set(LOCKER_DEFAULT_MIGRATION_KEY, true);
  }

  const invCapacityMigrated = storage.get<boolean>(INV_CAPACITY_DEFAULT_MIGRATION_KEY, false);
  if (!invCapacityMigrated && !selected.includes('inv-capacity')) {
    const next: FeatureKey[] = [...selected, 'inv-capacity'];
    storage.set(VISIBLE_CARDS_KEY, next);
    storage.set(INV_CAPACITY_DEFAULT_MIGRATION_KEY, true);
    selected = next;
  }

  if (!invCapacityMigrated) {
    storage.set(INV_CAPACITY_DEFAULT_MIGRATION_KEY, true);
  }

  const calcMigrated = storage.get<boolean>(CALC_DEFAULT_MIGRATION_KEY, false);
  if (!calcMigrated && !selected.includes('calculator')) {
    const next: FeatureKey[] = [...selected, 'calculator'];
    storage.set(VISIBLE_CARDS_KEY, next);
    storage.set(CALC_DEFAULT_MIGRATION_KEY, true);
    selected = next;
  }

  if (!calcMigrated) {
    storage.set(CALC_DEFAULT_MIGRATION_KEY, true);
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Feature card opener — lazily loads each feature into a dedicated window
// ---------------------------------------------------------------------------

async function openFeatureWindow(feat: FeatureDef): Promise<void> {
  const windowId = `utility-feature-${feat.key}`;
  toggleWindow(windowId, feat.windowTitle, (windowRoot) => {
    windowRoot.style.cssText =
      'display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;padding:12px;';
    (async () => {
      try {
        if (feat.key === 'reminders') {
          const { renderRemindersContent } = await import('./originalPanel');
          renderRemindersContent(windowRoot);
        } else if (feat.key === 'bulk-fav') {
          const { createBulkFavoriteSection } = await import('./sections/bulkFavoriteSection');
          windowRoot.appendChild(createBulkFavoriteSection());
        } else if (feat.key === 'activity-log') {
          const { createActivityLogSection } = await import('./sections/activityLogSection');
          windowRoot.appendChild(createActivityLogSection());
        } else if (feat.key === 'auto-fav') {
          const { createAutoFavoriteSection } = await import('./sections/autoFavoriteSection');
          windowRoot.appendChild(await createAutoFavoriteSection());
        } else if (feat.key === 'garden-filters') {
          const { createGardenFiltersSection } = await import('./sections/gardenFiltersSection');
          windowRoot.appendChild(await createGardenFiltersSection());
        } else if (feat.key === 'auto-reconnect') {
          const { createAutoReconnectSection } = await import('./sections/autoReconnectSection');
          windowRoot.appendChild(createAutoReconnectSection());
        } else if (feat.key === 'controller') {
          const { createControllerSection } = await import('./sections/controllerSection');
          // poller/cursor are null when opened from hub (feature may not be running)
          windowRoot.appendChild(createControllerSection(null, null));
        } else if (feat.key === 'locker') {
          const { createLockerSection } = await import('./sections/lockerSection');
          windowRoot.appendChild(createLockerSection());
        } else if (feat.key === 'inv-capacity') {
          const { createInventoryCapacitySection } = await import('./sections/inventoryCapacitySection');
          windowRoot.appendChild(createInventoryCapacitySection());
        } else if (feat.key === 'calculator') {
          const { renderCalculator } = await import('./cropCalculatorWindow');
          renderCalculator(windowRoot);
        }
      } catch (err) {
        log('⚠️ Failed to load feature window', err);
        windowRoot.textContent = '❌ Failed to load. Reload the page and try again.';
      }
    })();
  }, '580px', '78vh');
}

// ---------------------------------------------------------------------------
// Compact feature card
// ---------------------------------------------------------------------------

function buildFeatureCard(feat: FeatureDef): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = [
    'border:1px solid rgba(143,130,255,0.18)',
    'background:rgba(255,255,255,0.03)',
    'border-radius:10px',
    'padding:14px 16px',
    'display:flex',
    'align-items:center',
    'gap:14px',
    'transition:border-color 0.15s,background 0.15s',
  ].join(';');
  card.addEventListener('mouseenter', () => {
    card.style.background = 'rgba(143,130,255,0.06)';
    card.style.borderColor = 'rgba(143,130,255,0.35)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.background = 'rgba(255,255,255,0.03)';
    card.style.borderColor = 'rgba(143,130,255,0.18)';
  });

  const iconEl = document.createElement('div');
  iconEl.style.cssText = 'font-size:28px;line-height:1;flex-shrink:0;user-select:none;';
  iconEl.textContent = feat.icon;

  const info = document.createElement('div');
  info.style.cssText = 'flex:1;min-width:0;';

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:14px;font-weight:600;color:#e0e0e0;margin-bottom:3px;';
  nameEl.textContent = feat.label;

  const descEl = document.createElement('div');
  descEl.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);line-height:1.5;';
  descEl.textContent = feat.desc;

  info.append(nameEl, descEl);

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.textContent = 'Open →';
  openBtn.style.cssText = [
    'padding:6px 12px',
    'font-size:12px',
    'border:1px solid rgba(143,130,255,0.3)',
    'border-radius:6px',
    'background:rgba(143,130,255,0.12)',
    'color:#c8c0ff',
    'cursor:pointer',
    'white-space:nowrap',
    'flex-shrink:0',
    'transition:background 0.15s,border-color 0.15s',
  ].join(';');
  openBtn.addEventListener('mouseenter', () => {
    openBtn.style.background = 'rgba(143,130,255,0.24)';
    openBtn.style.borderColor = 'rgba(143,130,255,0.55)';
  });
  openBtn.addEventListener('mouseleave', () => {
    openBtn.style.background = 'rgba(143,130,255,0.12)';
    openBtn.style.borderColor = 'rgba(143,130,255,0.3)';
  });
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openFeatureWindow(feat).catch((err) => log('⚠️ Failed to open feature', err));
  });

  card.append(iconEl, info, openBtn);
  card.addEventListener('click', () => {
    openFeatureWindow(feat).catch((err) => log('⚠️ Failed to open feature', err));
  });
  return card;
}

// ---------------------------------------------------------------------------
// Customize overlay
// ---------------------------------------------------------------------------

function buildCustomizeOverlay(
  container: HTMLElement,
  onClose: () => void,
  onSave: (selected: FeatureKey[]) => void,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:absolute',
    'inset:0',
    'z-index:20',
    'pointer-events:none',
  ].join(';');

  // Keep the bottom-right corner clear so the window resize handle stays usable.
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:absolute',
    'inset:0 18px 18px 0',
    'background:rgba(10,12,18,0.97)',
    'display:flex',
    'flex-direction:column',
    'padding:20px',
    'gap:10px',
    'min-height:0',
    'box-sizing:border-box',
    'pointer-events:auto',
  ].join(';');
  overlay.appendChild(panel);

  const title = document.createElement('div');
  title.style.cssText = 'font-size:15px;font-weight:700;color:#e0e0e0;';
  title.textContent = '⚙ Customize Cards';
  panel.appendChild(title);

  const subtext = document.createElement('div');
  subtext.style.cssText = 'font-size:12px;color:rgba(224,224,224,0.45);margin-bottom:4px;';
  subtext.textContent = 'Select which feature cards to show in the Utility hub.';
  panel.appendChild(subtext);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow-y:auto;padding-right:2px;';
  panel.appendChild(list);

  const current = loadVisibleCards();
  const checkboxes = new Map<FeatureKey, HTMLInputElement>();

  for (const feat of FEATURE_DEFS) {
    const row = document.createElement('label');
    row.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:10px',
      'padding:10px 12px',
      'border-radius:8px',
      'border:1px solid rgba(143,130,255,0.14)',
      'background:rgba(255,255,255,0.03)',
      'cursor:pointer',
      'transition:background 0.12s',
    ].join(';');
    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(143,130,255,0.07)'; });
    row.addEventListener('mouseleave', () => { row.style.background = 'rgba(255,255,255,0.03)'; });

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = current.includes(feat.key);
    cb.style.cssText = 'accent-color:#8f82ff;width:16px;height:16px;cursor:pointer;flex-shrink:0;';

    const iconSpan = document.createElement('span');
    iconSpan.style.cssText = 'font-size:18px;line-height:1;user-select:none;';
    iconSpan.textContent = feat.icon;

    const labelText = document.createElement('span');
    labelText.style.cssText = 'font-size:13px;color:#e0e0e0;flex:1;';
    labelText.textContent = feat.label;

    row.append(cb, iconSpan, labelText);
    list.appendChild(row);
    checkboxes.set(feat.key, cb);
  }

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;padding-top:8px;flex-shrink:0;';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = [
    'flex:1', 'padding:9px', 'border-radius:7px', 'cursor:pointer',
    'background:rgba(255,255,255,0.05)', 'border:1px solid rgba(255,255,255,0.1)',
    'color:rgba(224,224,224,0.65)', 'font-size:13px',
  ].join(';');
  let onKey: ((e: KeyboardEvent) => void) | null = null;
  const closeWithCleanup = () => {
    if (onKey) document.removeEventListener('keydown', onKey);
    onClose();
  };
  cancelBtn.addEventListener('click', closeWithCleanup);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = [
    'flex:1', 'padding:9px', 'border-radius:7px', 'cursor:pointer',
    'background:rgba(143,130,255,0.2)', 'border:1px solid rgba(143,130,255,0.4)',
    'color:#c8c0ff', 'font-size:13px', 'font-weight:600',
  ].join(';');
  saveBtn.addEventListener('click', () => {
    const selected = FEATURE_DEFS
      .map((f) => f.key)
      .filter((k) => checkboxes.get(k)?.checked) as FeatureKey[];
    if (onKey) document.removeEventListener('keydown', onKey);
    onSave(selected);
  });

  btnRow.append(cancelBtn, saveBtn);
  panel.appendChild(btnRow);

  // Close on Escape
  onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeWithCleanup();
  };
  document.addEventListener('keydown', onKey);

  void container; // container used by caller to append this overlay
  return overlay;
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

function renderUtilityHub(root: HTMLElement): void {
  root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;position:relative;';

  // ── Header ──
  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'padding:12px 14px 10px',
    'border-bottom:1px solid rgba(143,130,255,0.2)',
    'flex-shrink:0',
    'gap:8px',
  ].join(';');

  const headerTitle = document.createElement('span');
  headerTitle.style.cssText = 'font-size:13px;font-weight:600;color:rgba(224,224,224,0.8);flex:1;';
  headerTitle.textContent = 'Utility';

  const customizeBtn = document.createElement('button');
  customizeBtn.type = 'button';
  customizeBtn.textContent = '⚙ Customize';
  customizeBtn.style.cssText = [
    'padding:5px 11px',
    'font-size:11px',
    'border:1px solid rgba(143,130,255,0.28)',
    'border-radius:5px',
    'background:rgba(143,130,255,0.1)',
    'color:rgba(200,192,255,0.85)',
    'cursor:pointer',
    'transition:background 0.15s',
  ].join(';');
  customizeBtn.addEventListener('mouseenter', () => { customizeBtn.style.background = 'rgba(143,130,255,0.2)'; });
  customizeBtn.addEventListener('mouseleave', () => { customizeBtn.style.background = 'rgba(143,130,255,0.1)'; });

  header.append(headerTitle, customizeBtn);
  root.appendChild(header);

  // ── Cards area ──
  const cardsArea = document.createElement('div');
  cardsArea.style.cssText = [
    'flex:1',
    'overflow-y:auto',
    'padding:14px',
    'display:flex',
    'flex-direction:column',
    'gap:10px',
  ].join(';');
  root.appendChild(cardsArea);

  // ── Render cards ──
  let overlayEl: HTMLElement | null = null;

  const renderCards = () => {
    cardsArea.innerHTML = '';
    const visible = loadVisibleCards();
    const visibleFeatures = FEATURE_DEFS.filter((f) => visible.includes(f.key));

    if (!visibleFeatures.length) {
      const empty = document.createElement('div');
      empty.style.cssText =
        'text-align:center;color:rgba(224,224,224,0.35);font-size:13px;padding:40px 20px;line-height:1.6;';
      empty.textContent = 'No cards selected.\nClick ⚙ Customize to add feature cards.';
      cardsArea.appendChild(empty);
      return;
    }

    for (const feat of visibleFeatures) {
      cardsArea.appendChild(buildFeatureCard(feat));
    }
  };

  const closeOverlay = () => {
    overlayEl?.remove();
    overlayEl = null;
  };

  const openOverlay = () => {
    if (overlayEl) { closeOverlay(); return; }
    overlayEl = buildCustomizeOverlay(root, closeOverlay, (selected) => {
      storage.set(VISIBLE_CARDS_KEY, selected);
      storage.set(ACTIVITY_LOG_DEFAULT_MIGRATION_KEY, true);
      storage.set(AUTO_RECONNECT_DEFAULT_MIGRATION_KEY, true);
      storage.set(CONTROLLER_DEFAULT_MIGRATION_KEY, true);
      storage.set(LOCKER_DEFAULT_MIGRATION_KEY, true);
      storage.set(INV_CAPACITY_DEFAULT_MIGRATION_KEY, true);
      storage.set(CALC_DEFAULT_MIGRATION_KEY, true);
      closeOverlay();
      renderCards();
    });
    root.appendChild(overlayEl);
  };

  customizeBtn.addEventListener('click', openOverlay);
  renderCards();
}

export function openUtilityHubWindow(): void {
  toggleWindow('utility-hub', '🔧 Utility', renderUtilityHub, '520px', '90vh');
}

/** Open a specific detached feature window by key. Used by window persistence. */
export function openDetachedFeature(key: string): void {
  const feat = FEATURE_DEFS.find((f) => f.key === key);
  if (feat) void openFeatureWindow(feat);
}

/** All feature window IDs for persistence registration. */
export function getFeatureWindowDefs(): ReadonlyArray<{ key: string }> {
  return FEATURE_DEFS;
}
