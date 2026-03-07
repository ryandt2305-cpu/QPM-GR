// src/ui/trackersHubWindow.ts
// Trackers Hub — tabbed container for Ability Tracker, Turtle Timer, XP Tracker, Crop Boosts

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
  { key: 'ability', label: 'Ability Tracker', icon: '📊' },
  { key: 'turtle', label: 'Turtle Timer', icon: '🐢' },
  { key: 'xp', label: 'XP Tracker', icon: '✨' },
  { key: 'crops', label: 'Crop Boosts', icon: '🌱' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** Reset floating-window positioning so the root fills its parent panel. */
function embedWindowRoot(windowRoot: HTMLElement, container: HTMLElement): void {
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

function renderTrackersHub(root: HTMLElement): void {
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
    panel.appendChild(spinner);

    try {
      if (key === 'ability') {
        const { createAbilityTrackerWindow, setGlobalAbilityTrackerState } = await import('./trackerWindow');
        const state = createAbilityTrackerWindow();
        setGlobalAbilityTrackerState(state);
        spinner.remove();
        embedWindowRoot(state.root, panel);
      } else if (key === 'turtle') {
        const { createTurtleTimerWindow } = await import('./turtleTimerWindow');
        const state = createTurtleTimerWindow();
        spinner.remove();
        embedWindowRoot(state.root, panel);
      } else if (key === 'xp') {
        const { createXpTrackerWindow, setGlobalXpTrackerState } = await import('./xpTrackerWindow');
        const state = createXpTrackerWindow();
        setGlobalXpTrackerState(state);
        spinner.remove();
        embedWindowRoot(state.root, panel);
      } else if (key === 'crops') {
        const { renderCropBoostContent } = await import('./cropBoostTrackerWindow');
        spinner.remove();
        panel.style.cssText = 'display:flex;flex:1;overflow-y:auto;flex-direction:column;min-height:0;';
        renderCropBoostContent(panel);
      }
    } catch (error) {
      log('⚠️ Failed to load trackers hub tab', error);
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
  activateTab('ability');
}

export function openTrackersHubWindow(): void {
  toggleWindow('trackers-hub', '📈 Trackers', renderTrackersHub, '1000px', '90vh');
}
