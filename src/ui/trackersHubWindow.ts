// src/ui/trackersHubWindow.ts
// Trackers Hub — compact feature cards with Customize overlay

import { toggleWindow } from './modalWindow';
import { storage } from '../utils/storage';
import { log } from '../utils/logger';

const VISIBLE_TRACKERS_KEY = 'qpm.trackersHub.visibleTrackers';
const STORAGE_VALUE_MIGRATION_KEY = 'qpm.trackers.storageValue.migrated.v1';

const TRACKER_DEFS = [
  {
    key: 'ability',
    label: 'Ability Tracker',
    icon: '📊',
    desc: 'Monitor pet ability procs, mutation grants, and coin/hr earnings in real time',
    windowTitle: '📊 Ability Tracker',
    windowId: 'trackers-detached-ability',
    width: '1000px',
  },
  {
    key: 'turtle',
    label: 'Turtle Timer',
    icon: '🐢',
    desc: 'Track turtle fishing timers and cooldowns across all active turtles',
    windowTitle: '🐢 Turtle Timer',
    windowId: 'trackers-detached-turtle',
    width: '700px',
  },
  {
    key: 'xp',
    label: 'XP Tracker',
    icon: '✨',
    desc: 'Track pet XP progress, level-up estimates, and strength growth over time',
    windowTitle: '✨ XP Tracker',
    windowId: 'trackers-detached-xp',
    width: '900px',
  },
  {
    key: 'crops',
    label: 'Crop Boosts',
    icon: '🌱',
    desc: 'View active crop boost effects, sources, and their remaining durations',
    windowTitle: '🌱 Crop Boosts',
    windowId: 'trackers-detached-crops',
    width: '800px',
  },
  {
    key: 'stats',
    label: 'Garden & Hatch Stats',
    icon: '🌿',
    desc: 'Visual stats for garden mutation progress and hatching history with ability breakdown',
    windowTitle: '🌿 Garden & Hatch Stats',
    windowId: 'trackers-detached-stats',
    width: '920px',
  },
  {
    key: 'storageValue',
    label: 'Value Display',
    icon: '💰',
    desc: 'Storage coin values and crop sell price overlays',
    windowTitle: '💰 Value Display',
    windowId: 'trackers-detached-storageValue',
    width: '420px',
  },
] as const;

type TrackerKey = (typeof TRACKER_DEFS)[number]['key'];
type TrackerDef = (typeof TRACKER_DEFS)[number];

function loadVisibleTrackers(): TrackerKey[] {
  const saved = storage.get<TrackerKey[] | null>(VISIBLE_TRACKERS_KEY, null);

  if (!Array.isArray(saved) || saved.length === 0) {
    return TRACKER_DEFS.map((t) => t.key);
  }

  // One-time migration: add storageValue for existing users
  const migrated = storage.get<boolean>(STORAGE_VALUE_MIGRATION_KEY, false);
  if (!migrated) {
    storage.set(STORAGE_VALUE_MIGRATION_KEY, true);
    if (!saved.includes('storageValue')) {
      const next = [...saved, 'storageValue'] as TrackerKey[];
      storage.set(VISIBLE_TRACKERS_KEY, next);
      return next;
    }
  }

  return saved;
}

/**
 * Reset a floating-window root so it fills its parent container instead of
 * escaping via position:fixed. All tracker windows use position:fixed by default.
 * Also hides the inner title bar and resize handle — the modal window provides the chrome.
 */
function embedWindowRoot(windowRoot: HTMLElement, container: HTMLElement): void {
  // Hide each tracker's own title bar (cursor:move/grab) and resize grip (cursor:se-resize)
  // so the outer modal window's chrome is the only chrome visible.
  const chromeCursors = new Set(['move', 'grab', 'grabbing', 'se-resize']);
  for (const child of Array.from(windowRoot.children) as HTMLElement[]) {
    const inlineCursor = child.style.cursor?.trim().toLowerCase();
    const computedCursor = window.getComputedStyle(child).cursor?.trim().toLowerCase();
    const cursor = inlineCursor || computedCursor;
    if (cursor && chromeCursors.has(cursor)) {
      child.style.display = 'none';
    }
  }
  windowRoot.style.cssText = [
    'position:relative',
    'top:auto',
    'left:auto',
    'width:100%',
    'height:100%',
    'max-width:none',
    'max-height:none',
    'z-index:auto',
    'box-shadow:none',
    'border-radius:0',
    'border:none',
    'display:flex',
    'flex-direction:column',
    'overflow:hidden',
  ].join(';');
  container.appendChild(windowRoot);
}

/** Load tracker content into a window root. */
async function loadTrackerIntoRoot(key: TrackerKey, root: HTMLElement): Promise<void> {
  if (key === 'ability') {
    const { createAbilityTrackerWindow, setGlobalAbilityTrackerState } = await import('./trackerWindow');
    const state = createAbilityTrackerWindow();
    setGlobalAbilityTrackerState(state);
    embedWindowRoot(state.root, root);
  } else if (key === 'turtle') {
    const { createTurtleTimerWindow } = await import('./turtleTimerWindow');
    const state = createTurtleTimerWindow();
    embedWindowRoot(state.root, root);
  } else if (key === 'xp') {
    const { createXpTrackerWindow, setGlobalXpTrackerState } = await import('./xpTrackerWindow');
    const state = createXpTrackerWindow();
    setGlobalXpTrackerState(state);
    embedWindowRoot(state.root, root);
  } else if (key === 'crops') {
    const { renderCropBoostContent } = await import('./cropBoostTrackerWindow');
    root.style.cssText += ';overflow-y:auto;';
    renderCropBoostContent(root);
  } else if (key === 'stats') {
    const { renderStatsHub } = await import('./statsHubWindow');
    renderStatsHub(root);
  } else if (key === 'storageValue') {
    const { renderStorageValueSettings } = await import('./storageValueWindow');
    root.style.cssText += ';overflow-y:auto;';
    renderStorageValueSettings(root);
  }
}

function makeTrackerRender(tracker: TrackerDef): (root: HTMLElement) => void {
  return (root: HTMLElement) => {
    root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;';
    const spinner = document.createElement('div');
    spinner.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'flex:1',
      'color:rgba(224,224,224,0.45)',
      'font-size:13px',
    ].join(';');
    spinner.textContent = '⏳ Loading...';
    root.appendChild(spinner);

    loadTrackerIntoRoot(tracker.key, root)
      .then(() => spinner.remove())
      .catch((err) => {
        log('⚠️ Failed to load tracker', err);
        spinner.textContent = '❌ Failed to load. Reload the page and try again.';
      });
  };
}

function openTrackerWindow(tracker: TrackerDef): void {
  toggleWindow(tracker.windowId, tracker.windowTitle, makeTrackerRender(tracker), tracker.width, '90vh');
}

// ---------------------------------------------------------------------------
// Compact tracker card
// ---------------------------------------------------------------------------

function buildTrackerCard(tracker: TrackerDef): HTMLElement {
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
  iconEl.textContent = tracker.icon;

  const info = document.createElement('div');
  info.style.cssText = 'flex:1;min-width:0;';

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:14px;font-weight:600;color:#e0e0e0;margin-bottom:3px;';
  nameEl.textContent = tracker.label;

  const descEl = document.createElement('div');
  descEl.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);line-height:1.5;';
  descEl.textContent = tracker.desc;

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
    openTrackerWindow(tracker);
  });

  card.append(iconEl, info, openBtn);
  card.addEventListener('click', () => openTrackerWindow(tracker));
  return card;
}

// ---------------------------------------------------------------------------
// Customize overlay
// ---------------------------------------------------------------------------

function buildCustomizeOverlay(
  container: HTMLElement,
  onClose: () => void,
  onSave: (selected: TrackerKey[]) => void,
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
  subtext.textContent = 'Select which tracker cards to show in the Trackers hub.';
  panel.appendChild(subtext);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow-y:auto;padding-right:2px;';
  panel.appendChild(list);

  const current = loadVisibleTrackers();
  const checkboxes = new Map<TrackerKey, HTMLInputElement>();

  for (const tracker of TRACKER_DEFS) {
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
    cb.checked = current.includes(tracker.key);
    cb.style.cssText = 'accent-color:#8f82ff;width:16px;height:16px;cursor:pointer;flex-shrink:0;';

    const iconSpan = document.createElement('span');
    iconSpan.style.cssText = 'font-size:18px;line-height:1;user-select:none;';
    iconSpan.textContent = tracker.icon;

    const labelText = document.createElement('span');
    labelText.style.cssText = 'font-size:13px;color:#e0e0e0;flex:1;';
    labelText.textContent = tracker.label;

    row.append(cb, iconSpan, labelText);
    list.appendChild(row);
    checkboxes.set(tracker.key, cb);
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
    const selected = TRACKER_DEFS
      .map((t) => t.key)
      .filter((k) => checkboxes.get(k)?.checked) as TrackerKey[];
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

  void container;
  return overlay;
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

function renderTrackersHub(root: HTMLElement): void {
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
  headerTitle.textContent = 'Trackers';

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
    const visible = loadVisibleTrackers();
    const visibleTrackers = TRACKER_DEFS.filter((t) => visible.includes(t.key));

    if (!visibleTrackers.length) {
      const empty = document.createElement('div');
      empty.style.cssText =
        'text-align:center;color:rgba(224,224,224,0.35);font-size:13px;padding:40px 20px;line-height:1.6;';
      empty.textContent = 'No cards selected.\nClick ⚙ Customize to add tracker cards.';
      cardsArea.appendChild(empty);
      return;
    }

    for (const tracker of visibleTrackers) {
      cardsArea.appendChild(buildTrackerCard(tracker));
    }
  };

  const closeOverlay = () => {
    overlayEl?.remove();
    overlayEl = null;
  };

  const openOverlay = () => {
    if (overlayEl) { closeOverlay(); return; }
    overlayEl = buildCustomizeOverlay(root, closeOverlay, (selected) => {
      storage.set(VISIBLE_TRACKERS_KEY, selected);
      storage.set(STORAGE_VALUE_MIGRATION_KEY, true);
      closeOverlay();
      renderCards();
    });
    root.appendChild(overlayEl);
  };

  customizeBtn.addEventListener('click', openOverlay);
  renderCards();
}

export function openTrackersHubWindow(): void {
  toggleWindow('trackers-hub', '📈 Trackers', renderTrackersHub, '520px', '90vh');
}

/** Open a specific detached tracker window by key. Used by window persistence. */
export function openDetachedTracker(key: string): void {
  const tracker = TRACKER_DEFS.find((t) => t.key === key);
  if (tracker) openTrackerWindow(tracker);
}

/** All tracker window IDs for persistence registration. */
export function getTrackerWindowDefs(): ReadonlyArray<{ windowId: string; key: string }> {
  return TRACKER_DEFS;
}
