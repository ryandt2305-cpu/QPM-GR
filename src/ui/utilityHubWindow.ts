// src/ui/utilityHubWindow.ts
// Utility Hub — tabbed container for Reminders, Bulk Favorite, Auto-Favorite, Garden Filters

import { toggleWindow } from './modalWindow';
import { log } from '../utils/logger';

const HUB_TAB_STYLE = [
  'padding:7px 16px',
  'font-size:13px',
  'color:rgba(224,224,224,0.55)',
  'cursor:pointer',
  'border-radius:6px 6px 0 0',
  'border:none',
  'border-bottom:2px solid transparent',
  'background:transparent',
  'transition:color 0.15s,border-color 0.15s',
  'user-select:none',
  'white-space:nowrap',
].join(';');

const TABS = [
  { key: 'garden-filters', label: 'Garden Filters', icon: '🔍' },
  { key: 'reminders', label: 'Reminders', icon: '🔔' },
  { key: 'bulk-fav', label: 'Bulk Favorite', icon: '❤️' },
  { key: 'auto-fav', label: 'Auto-Favorite', icon: '⭐' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function makeSpinner(msg = '⏳ Loading...'): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'flex:1',
    'color:rgba(224,224,224,0.45)',
    'font-size:13px',
  ].join(';');
  el.textContent = msg;
  return el;
}

function renderUtilityHub(root: HTMLElement): void {
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;';

  // ── Tab bar ──
  const tabBar = document.createElement('div');
  tabBar.style.cssText = [
    'display:flex',
    'gap:4px',
    'padding:10px 14px 0',
    'border-bottom:1px solid rgba(143,130,255,0.2)',
    'flex-shrink:0',
    'overflow-x:auto',
  ].join(';');

  // ── Body ──
  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;';

  const panels = new Map<TabKey, HTMLElement>();
  const tabButtons = new Map<TabKey, HTMLButtonElement>();
  const loaded = new Set<TabKey>();
  let activeKey: TabKey | null = null;

  const setActiveStyle = (key: TabKey): void => {
    for (const [k, btn] of tabButtons) {
      const isActive = k === key;
      btn.style.color = isActive ? '#8f82ff' : 'rgba(224,224,224,0.55)';
      btn.style.borderBottomColor = isActive ? '#8f82ff' : 'transparent';
    }
    for (const [k, panel] of panels) {
      panel.style.display = k === key ? 'flex' : 'none';
    }
  };

  const activateTab = async (key: TabKey): Promise<void> => {
    if (activeKey === key) return;
    activeKey = key;
    setActiveStyle(key);

    if (loaded.has(key)) return;
    loaded.add(key);

    const panel = panels.get(key)!;
    panel.style.cssText = 'display:flex;flex:1;overflow-y:auto;flex-direction:column;';

    if (key === 'reminders') {
      try {
        const { renderRemindersContent } = await import('./originalPanel');
        renderRemindersContent(panel);
      } catch (error) {
        log('⚠️ Failed to load Reminders tab', error);
        panel.appendChild(makeSpinner('❌ Failed to load Reminders'));
      }
      return;
    }

    const spinner = makeSpinner();
    panel.appendChild(spinner);

    try {
      if (key === 'bulk-fav') {
        const { createBulkFavoriteSection } = await import('./sections/bulkFavoriteSection');
        spinner.remove();
        const el = createBulkFavoriteSection();
        el.style.margin = '0';
        panel.appendChild(el);
      } else if (key === 'auto-fav') {
        const { createAutoFavoriteSection } = await import('./sections/autoFavoriteSection');
        const el = await createAutoFavoriteSection();
        spinner.remove();
        el.style.margin = '0';
        panel.appendChild(el);
      } else if (key === 'garden-filters') {
        const { createGardenFiltersSection } = await import('./sections/gardenFiltersSection');
        const el = await createGardenFiltersSection();
        spinner.remove();
        el.style.margin = '0';
        panel.appendChild(el);
      }
    } catch (error) {
      log('⚠️ Failed to load utility hub tab', error);
      spinner.textContent = '❌ Failed to load. Reload the page and try again.';
    }
  };

  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${tab.icon} ${tab.label}`;
    btn.style.cssText = HUB_TAB_STYLE;
    btn.addEventListener('click', () => activateTab(tab.key));
    tabBar.appendChild(btn);
    tabButtons.set(tab.key, btn);

    const panel = document.createElement('div');
    panel.style.cssText = 'display:none;flex:1;overflow:hidden;flex-direction:column;min-height:0;';
    body.appendChild(panel);
    panels.set(tab.key, panel);
  }

  root.appendChild(tabBar);
  root.appendChild(body);

  // Load first tab immediately
  activateTab('reminders');
}

export function openUtilityHubWindow(): void {
  toggleWindow('utility-hub', '🔧 Utility', renderUtilityHub, '750px', '90vh');
}
