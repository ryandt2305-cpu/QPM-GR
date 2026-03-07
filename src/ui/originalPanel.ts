// src/ui/originalPanel.ts - Main panel orchestrator
import { createJournalCheckerSection as createJournalCheckerSectionNew } from './journalCheckerSection';
import { log } from '../utils/logger';
import { storage } from '../utils/storage';
import { getWeatherSnapshot } from '../store/weatherHub';
import { resetStats } from '../store/stats';
import { startVersionChecker, onVersionChange, getCurrentVersion, type VersionInfo, type VersionStatus } from '../utils/versionChecker';
import { yieldToBrowser } from '../utils/scheduling';
import { ensurePanelStyles } from './panelStyles';
import { showToast, formatWeatherLabel } from './panelHelpers';
import { toggleWindow, isWindowOpen } from './modalWindow';
import { UIState, createInitialUIState } from './panelState';
import { createNotificationSection } from './notificationSection';
import { createGuideSection } from './sections/guideSection';
import { createMutationSection } from './sections/mutationValueSection';
import { createStatsHeader } from './sections/statsHeaderSection';

let uiState = createInitialUIState();

const PANEL_POSITION_KEY = 'quinoa-ui-panel-position';
const PANEL_COLLAPSED_KEY = 'quinoa-ui-panel-collapsed';

let _panelResizeCleanup: (() => void) | null = null;

// Configuration shape passed down from main.ts via setCfg()
interface PanelCfg {
  ui?: Record<string, unknown>;
  mutationReminder?: { enabled?: boolean; showNotifications?: boolean; highlightPlants?: boolean };
  turtleTimer?: { enabled?: boolean; [key: string]: unknown };
  harvestReminder?: Record<string, unknown>;
  inventoryLocker?: Record<string, unknown>;
  [key: string]: unknown;
}

let cfg: PanelCfg = {};



function createJournalCheckerSection(): HTMLElement {
  // Use the new visually enhanced journal checker
  return createJournalCheckerSectionNew();
}



export async function createOriginalUI(): Promise<HTMLElement> {
  ensurePanelStyles();
  if (uiState.panel) return uiState.panel;

  const panel = document.createElement('div');
  panel.className = 'qpm-panel';

  const titleBar = document.createElement('div');
  titleBar.className = 'qpm-panel__titlebar';
  titleBar.title = 'Drag to move • Click to collapse';

  const titleText = document.createElement('span');
  titleText.textContent = '🍖 Quinoa Pet Manager';

  // Create version bubble
  const versionBubble = document.createElement('a');
  versionBubble.className = 'qpm-version-bubble';
  versionBubble.dataset.status = 'checking';
  versionBubble.textContent = `v${getCurrentVersion()}`;
  versionBubble.title = 'Checking for updates...';
  versionBubble.style.cursor = 'pointer';
  versionBubble.target = '_blank';
  versionBubble.rel = 'noopener noreferrer';

  const renderVersionInfo = (info: VersionInfo): void => {
    const statusMap: Record<VersionStatus, 'up-to-date' | 'outdated' | 'checking' | 'error'> = {
      current: 'up-to-date',
      outdated: 'outdated',
      checking: 'checking',
      error: 'error',
    };

    versionBubble.dataset.status = statusMap[info.status];

    if (info.status === 'outdated' && info.latest) {
      versionBubble.textContent = `v${info.current} → v${info.latest}`;
      versionBubble.title = `Update available! Current: v${info.current}\nLatest: v${info.latest}\nClick to open the latest userscript.`;
    } else if (info.status === 'error') {
      versionBubble.textContent = `v${info.current}`;
      versionBubble.title = 'Version check failed. Click to open the repo.';
    } else if (info.status === 'checking') {
      versionBubble.textContent = `v${info.current}`;
      versionBubble.title = 'Checking for updates...';
    } else {
      versionBubble.textContent = `v${info.current}`;
      versionBubble.title = `QPM v${info.current}\nUp to date.`;
    }
  };

  const versionClickUrl = 'https://raw.githubusercontent.com/ryandt2305-cpu/QPM-GR/master/dist/QPM.user.js';
  versionBubble.href = versionClickUrl;

  const openVersionLink = (): void => {
    const gmOpen = (globalThis as any).GM_openInTab || (globalThis as any).GM?.openInTab;
    if (typeof gmOpen === 'function') {
      try {
        gmOpen(versionClickUrl, { active: true, insert: true, setParent: true });
        return;
      } catch (error) {
        console.warn('[QPM] GM_openInTab failed, falling back', error);
      }
    }

    const win = window.open(versionClickUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      window.location.href = versionClickUrl;
    }
  };

  versionBubble.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openVersionLink();
  });

  onVersionChange(renderVersionInfo);
  startVersionChecker();

  const collapseButton = document.createElement('button');
  collapseButton.type = 'button';
  collapseButton.dataset.qpmCollapseButton = 'true';
  collapseButton.className = 'qpm-button';
  collapseButton.setAttribute('aria-label', 'Collapse panel');

  const collapseIcon = document.createElement('span');
  collapseIcon.textContent = '▼';
  collapseButton.appendChild(collapseIcon);

  titleBar.append(titleText, versionBubble, collapseButton);

  const content = document.createElement('div');
  content.className = 'qpm-content';

  const nav = document.createElement('div');
  nav.className = 'qpm-nav';

  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'qpm-tabs';

  content.append(nav, tabsContainer);
  panel.append(titleBar, content);

  // Create UI sections
  const statsHeader = createStatsHeader(uiState, cfg, saveCfg, resetAllStats);
  await yieldToBrowser();

  const notificationsSection = createNotificationSection(uiState);
  await yieldToBrowser();

  const tabs = new Map<string, HTMLElement>();
  const tabButtons = new Map<string, HTMLButtonElement>();
  let activeTab: string | null = null;

  const activateTab = (key: string) => {
    if (activeTab === key) return;
    activeTab = key;
    for (const [tabKey, tabContent] of tabs) {
      tabContent.classList.toggle('qpm-tab--active', tabKey === key);
    }
    for (const [tabKey, button] of tabButtons) {
      const isActive = tabKey === key;
      button.classList.toggle('qpm-nav__button--active', isActive);
      
      // Apply color coding with glow - each button has unique color
      if (button.dataset.tabColor) {
        const baseColor = button.dataset.tabColor;
        // Extract RGB values for glow effect
        const rgbMatch = baseColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        const glowColor = rgbMatch ? `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, 0.4)` : baseColor;
        
        // Check if this tab has an associated window that's open
        const windowId = button.dataset.windowId;
        const isWindowActive = windowId && isWindowOpen(windowId);
        
        if (isActive || isWindowActive) {
          button.style.background = baseColor;
          button.style.boxShadow = `0 4px 14px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.1)`;
          button.style.borderColor = baseColor.replace('0.28', '0.6');
        } else {
          // All buttons show their color dimly with subtle glow
          button.style.background = baseColor.replace('0.28', '0.12');
          button.style.boxShadow = `0 2px 8px ${glowColor.replace('0.4', '0.15')}`;
          button.style.borderColor = baseColor.replace('0.28', '0.3');
        }
      }
    }
  };

  const registerTab = (key: string, label: string, icon: string, elements: HTMLElement[]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qpm-nav__button';
    button.innerHTML = `${icon}<span>${label}</span>`;
    // Only activate tab if it has content (not a window-opening tab)
    if (elements.length > 0) {
      button.addEventListener('click', () => activateTab(key));
    }
    
    // Add color coding for visual distinction - each button has unique color with glow
    const tabColors: Record<string, string> = {
      'dashboard':      'rgba(76, 175, 80, 0.28)',   // Green
      'trackers':       'rgba(156, 39, 176, 0.28)',  // Purple
      'shop-restock':   'rgba(0, 188, 212, 0.28)',   // Cyan
      'pet-teams':      'rgba(255, 152, 0, 0.28)',   // Orange
      'public-rooms':   'rgba(233, 30, 99, 0.28)',   // Pink
      'utility':        'rgba(63, 81, 181, 0.28)',   // Indigo
      'journal-checker':'rgba(121, 85, 72, 0.28)',   // Brown
      'guide':          'rgba(96, 125, 139, 0.28)',  // Blue Grey
    };
    
    if (tabColors[key]) {
      const baseColor = tabColors[key];
      button.dataset.tabColor = baseColor;
      // Set initial background with subtle glow
      const rgbMatch = baseColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      const glowColor = rgbMatch ? `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, 0.15)` : baseColor;
      button.style.background = baseColor.replace('0.28', '0.12');
      button.style.boxShadow = `0 2px 8px ${glowColor}`;
      button.style.borderColor = baseColor.replace('0.28', '0.3');
    }
    
    nav.appendChild(button);
    tabButtons.set(key, button);

    const tab = document.createElement('div');
    tab.className = 'qpm-tab';
    for (const el of elements) {
      tab.appendChild(el);
    }
    tabsContainer.appendChild(tab);
    tabs.set(key, tab);
  };

  // Journal Checker section
  const journalCheckerSection = createJournalCheckerSection();

  // Guide section
  const guideSection = createGuideSection();

  // Tabs: 8 buttons — dashboard (inline), trackers hub, shop restock, pet teams, public rooms, utility hub, journal, guide
  registerTab('dashboard', 'Dashboard', '📊', [statsHeader]);
  registerTab('trackers', 'Trackers', '📈', []);
  registerTab('shop-restock', 'Shop Restock', '🏪', []);
  registerTab('pet-teams', 'Pet Teams', '👥', []);
  registerTab('public-rooms', 'Public Rooms', '🌐', []);
  registerTab('utility', 'Utility', '🔧', []);
  registerTab('journal-checker', 'Journal', '📔', [journalCheckerSection]);
  registerTab('guide', 'Guide', '📖', [guideSection]);

  // Wire window-opening buttons
  const trackersButton = tabButtons.get('trackers');
  if (trackersButton) {
    const newBtn = trackersButton.cloneNode(true) as HTMLButtonElement;
    newBtn.dataset.windowId = 'trackers-hub';
    newBtn.addEventListener('click', async () => {
      try {
        const { openTrackersHubWindow } = await import('./trackersHubWindow');
        openTrackersHubWindow();
      } catch (error) {
        log('⚠️ Failed to open Trackers Hub window', error);
      }
    });
    trackersButton.replaceWith(newBtn);
    tabButtons.set('trackers', newBtn);
  }

  const shopRestockButton = tabButtons.get('shop-restock');
  if (shopRestockButton) {
    const newBtn = shopRestockButton.cloneNode(true) as HTMLButtonElement;
    newBtn.dataset.windowId = 'shop-restock';
    newBtn.addEventListener('click', async () => {
      try {
        const { openShopRestockWindow } = await import('./shopRestockWindow');
        openShopRestockWindow();
      } catch (error) {
        log('⚠️ Failed to open Shop Restock window', error);
      }
    });
    shopRestockButton.replaceWith(newBtn);
    tabButtons.set('shop-restock', newBtn);
  }

  const petTeamsButton = tabButtons.get('pet-teams');
  if (petTeamsButton) {
    const newBtn = petTeamsButton.cloneNode(true) as HTMLButtonElement;
    newBtn.dataset.windowId = 'qpm-pets-window';
    newBtn.addEventListener('click', async () => {
      try {
        const { togglePetsWindow } = await import('./petsWindow');
        togglePetsWindow();
      } catch (error) {
        log('⚠️ Failed to toggle Pets window', error);
      }
    });
    petTeamsButton.replaceWith(newBtn);
    tabButtons.set('pet-teams', newBtn);
  }

  const publicRoomsButton = tabButtons.get('public-rooms');
  if (publicRoomsButton) {
    const newBtn = publicRoomsButton.cloneNode(true) as HTMLButtonElement;
    newBtn.dataset.windowId = 'public-rooms';
    newBtn.addEventListener('click', () => {
      const renderFn = (root: HTMLElement) => {
        import('./publicRoomsWindow').then(({ renderPublicRoomsWindow }) => {
          renderPublicRoomsWindow(root);
        }).catch(error => {
          log('⚠️ Failed to load Public Rooms window', error);
        });
      };
      toggleWindow('public-rooms', '🌐 Public Rooms', renderFn, '950px', '85vh');
    });
    publicRoomsButton.replaceWith(newBtn);
    tabButtons.set('public-rooms', newBtn);
  }

  const utilityButton = tabButtons.get('utility');
  if (utilityButton) {
    const newBtn = utilityButton.cloneNode(true) as HTMLButtonElement;
    newBtn.dataset.windowId = 'utility-hub';
    newBtn.addEventListener('click', async () => {
      try {
        const { openUtilityHubWindow } = await import('./utilityHubWindow');
        openUtilityHubWindow();
      } catch (error) {
        log('⚠️ Failed to open Utility Hub window', error);
      }
    });
    utilityButton.replaceWith(newBtn);
    tabButtons.set('utility', newBtn);
  }

  activateTab('dashboard');

  const applyPosition = (left: number, top: number) => {
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  };

  const savedPosition = storage.get<{ left: number; top: number } | null>(PANEL_POSITION_KEY, null);
  if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
    applyPosition(savedPosition.left, savedPosition.top);
  }

  const applyCollapsed = (collapsed: boolean) => {
    tabsContainer.style.display = collapsed ? 'none' : '';
    collapseIcon.textContent = collapsed ? '▲' : '▼';
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
    panel.style.overflowY = collapsed ? 'visible' : 'auto';
    storage.set(PANEL_COLLAPSED_KEY, collapsed);
  };

  collapseButton.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });

  collapseButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const collapsed = tabsContainer.style.display === 'none';
    applyCollapsed(!collapsed);
  });

  applyCollapsed(!!storage.get<boolean>(PANEL_COLLAPSED_KEY, false));

  let isDragging = false;
  let dragMoved = false;
  let pointerId: number | null = null;
  let offsetX = 0;
  let offsetY = 0;
  let suppressClick = false;

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  // Clamp panel position to keep it visible within viewport
  const clampPanelPosition = () => {
    const rect = panel.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const maxLeft = Math.max(8, window.innerWidth - panelWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - panelHeight - 8);

    const newLeft = clamp(rect.left, 8, maxLeft);
    const newTop = clamp(rect.top, 8, maxTop);

    // Only update if position changed
    if (Math.abs(newLeft - rect.left) > 1 || Math.abs(newTop - rect.top) > 1) {
      applyPosition(newLeft, newTop);
      storage.set(PANEL_POSITION_KEY, { left: Math.round(newLeft), top: Math.round(newTop) });
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!isDragging || pointerId !== event.pointerId) return;

    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const maxLeft = Math.max(8, window.innerWidth - panelWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - panelHeight - 8);

    const newLeft = clamp(event.clientX - offsetX, 8, maxLeft);
    const newTop = clamp(event.clientY - offsetY, 8, maxTop);
    const rect = panel.getBoundingClientRect();

    if (!dragMoved && (Math.abs(newLeft - rect.left) > 2 || Math.abs(newTop - rect.top) > 2)) {
      dragMoved = true;
    }

    applyPosition(newLeft, newTop);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!isDragging || pointerId !== event.pointerId) return;

    isDragging = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    if (panel.hasPointerCapture && panel.hasPointerCapture(event.pointerId)) {
      panel.releasePointerCapture(event.pointerId);
    } else {
      try {
        panel.releasePointerCapture(event.pointerId);
      } catch {}
    }
    titleBar.style.touchAction = '';

    if (dragMoved) {
      suppressClick = true;
      const rect = panel.getBoundingClientRect();
      storage.set(PANEL_POSITION_KEY, { left: Math.round(rect.left), top: Math.round(rect.top) });
    }

    pointerId = null;
    dragMoved = false;
  };

  titleBar.addEventListener('pointerdown', (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && target.closest('[data-qpm-collapse-button]')) {
      return;
    }
    if (target && target.closest('.qpm-version-bubble')) {
      return; // let version bubble handle its own click/navigation
    }
    if (!event.isPrimary) return;
    if (event.pointerType === 'mouse') {
      if (event.button !== 0) return;
      if ((event.buttons & 1) !== 1) return;
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    isDragging = true;
    dragMoved = false;
    suppressClick = false;
    pointerId = event.pointerId;

    const rect = panel.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;

    if (panel.setPointerCapture) {
      panel.setPointerCapture(event.pointerId);
    }
    titleBar.style.touchAction = 'none';
    event.preventDefault();
  });

  titleBar.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const collapsed = tabsContainer.style.display === 'none';
    applyCollapsed(!collapsed);
  });

  // Add resize listener to keep panel visible when viewport changes
  window.addEventListener('resize', clampPanelPosition);
  _panelResizeCleanup = () => window.removeEventListener('resize', clampPanelPosition);

  document.body.appendChild(panel);

  uiState.panel = panel;
  uiState.content = content;
  return panel;
}




function refreshHeaderStats(): void {
  if (!uiState.headerWeather) {
    return;
  }

  // Weather segment
  let weatherLabel = 'Unknown';
  const weatherParts: string[] = [];

  try {
    const snapshot = getWeatherSnapshot();
    weatherLabel = formatWeatherLabel(snapshot.kind);
    weatherParts.push(weatherLabel);
  } catch {
    weatherParts.push(weatherLabel);
  }

  if (weatherParts.length === 0) {
    weatherParts.push(weatherLabel);
  }

  uiState.headerWeather.textContent = weatherParts.join(' • ');
}

function resetAllStats(): void {
  resetStats();
  refreshHeaderStats();
  showToast('Stats reset');
}

/**
 * Render function for the reminders modal window
 */
export function renderRemindersContent(root: HTMLElement): void {
  renderRemindersWindow(root);
}

function renderRemindersWindow(root: HTMLElement): void{
  root.style.cssText = 'display: flex; flex-direction: column; gap: 16px; min-width: 600px;';

  const mutationSection = createMutationSection(uiState, cfg, saveCfg);
  mutationSection.style.margin = '0';
  root.appendChild(mutationSection);
}



// Update functions
export function updateUIStatus(text: string): void {
  if (uiState.status) uiState.status.textContent = text;
}

export function updateWeatherUI(text: string): void {
  if (uiState.weatherStatus) uiState.weatherStatus.textContent = `Current: ${text}`;
}

export function updateShopStatus(text: string): void {
  if (uiState.shopStatus) uiState.shopStatus.textContent = text;
}

export function setCfg(newCfg: PanelCfg): void {
  cfg = newCfg;
}

function saveCfg(): void {
  storage.set('quinoa-pet-manager', cfg);
}
