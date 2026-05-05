// src/ui/hubWindow/groups/trackersGroup.ts

import type { HubGroupDef, ExpandableCardConfig, LauncherCardConfig } from '../cards/types';
import { toggleWindow } from '../../modalWindow';
import { log } from '../../../utils/logger';
import { waitForCatalogs } from '../../../catalogs/gameCatalogs';

/** Best-effort catalog wait — never rejects, just logs and continues */
async function awaitCatalogs(): Promise<void> {
  try { await waitForCatalogs(10000); }
  catch { log('[Hub] Catalogs not ready yet, rendering with fallbacks'); }
}

function makeTrackerExpanded(key: string): (container: HTMLElement) => (() => void) | void {
  return (container: HTMLElement) => {
    container.style.cssText = 'display:flex;flex-direction:column;min-height:360px;overflow:hidden;';
    const spinner = document.createElement('div');
    spinner.style.cssText = 'display:flex;align-items:center;justify-content:center;flex:1;color:rgba(224,224,224,0.45);font-size:12px;';
    spinner.textContent = '⏳ Loading...';
    container.appendChild(spinner);

    let contentCleanup: (() => void) | undefined;

    (async () => {
      try {
        if (key === 'crops') await awaitCatalogs();
        if (key === 'ability') {
          const { createAbilityTrackerWindow, setGlobalAbilityTrackerState } = await import('../../trackerWindow');
          const state = createAbilityTrackerWindow();
          setGlobalAbilityTrackerState(state);
          embedWindowRoot(state.root, container);
        } else if (key === 'turtle') {
          const { createTurtleTimerWindow } = await import('../../turtleTimerWindow');
          const state = createTurtleTimerWindow();
          embedWindowRoot(state.root, container);
        } else if (key === 'xp') {
          const { createXpTrackerWindow, setGlobalXpTrackerState } = await import('../../xpTrackerWindow');
          const state = createXpTrackerWindow();
          setGlobalXpTrackerState(state);
          embedWindowRoot(state.root, container);
        } else if (key === 'crops') {
          const { renderCropBoostContent } = await import('../../cropBoostTrackerWindow');
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'flex:1;min-height:300px;max-height:600px;overflow-y:auto;overflow-x:hidden;';
          container.appendChild(wrapper);
          contentCleanup = renderCropBoostContent(wrapper) ?? undefined;
        }
        spinner.remove();
      } catch (err) {
        log('⚠️ Failed to load tracker', err);
        spinner.textContent = '❌ Failed to load';
      }
    })();

    return () => { contentCleanup?.(); };
  };
}

function embedWindowRoot(windowRoot: HTMLElement, container: HTMLElement): void {
  const chromeCursors = new Set(['move', 'grab', 'grabbing', 'se-resize']);
  for (const child of Array.from(windowRoot.children) as HTMLElement[]) {
    const cursor = child.style.cursor?.trim().toLowerCase() ||
      window.getComputedStyle(child).cursor?.trim().toLowerCase();
    if (cursor && chromeCursors.has(cursor)) {
      child.style.display = 'none';
    }
  }
  windowRoot.style.cssText = [
    'position:relative',
    'top:auto',
    'left:auto',
    'width:100%',
    'height:auto',
    'min-height:340px',
    'min-width:400px',
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
  container.innerHTML = '';
  container.appendChild(windowRoot);
}

function openDetachedTracker(windowId: string, title: string, key: string, width: string): void {
  toggleWindow(windowId, title, (root) => {
    root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;';
    makeTrackerExpanded(key)(root);
  }, width, '90vh');
}

export function getTrackersGroup(): HubGroupDef {
  const abilityCard: ExpandableCardConfig = {
    key: 'ability',
    label: 'Ability Tracker',
    description: 'Monitor pet ability procs, mutation grants, and coin/hr',
    icon: { kind: 'sprite', value: '📊', spriteKey: 'sprite/pet/Peacock', spriteMutations: ['Rainbow'], fallback: '📊' },
    labelColor: '#4ade80',
    tier: 'expandable',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Procs · Coins · Mutations';
    },
    renderExpanded: makeTrackerExpanded('ability'),
    detachWindowId: 'trackers-v2-ability',
    onDetach: () => openDetachedTracker('trackers-v2-ability', '📊 Ability Tracker', 'ability', '1200px'),
  };

  const xpCard: ExpandableCardConfig = {
    key: 'xp',
    label: 'XP Tracker',
    description: 'Track pet XP progress and level-up estimates',
    icon: { kind: 'sprite', value: '✨', spriteKey: 'sprite/ui/StrengthStar', fallback: '✨' },
    labelColor: '#fbbf24',
    tier: 'expandable',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Levels · Strength · ETA';
    },
    renderExpanded: makeTrackerExpanded('xp'),
    detachWindowId: 'trackers-v2-xp',
    onDetach: () => openDetachedTracker('trackers-v2-xp', '✨ XP Tracker', 'xp', '900px'),
  };

  const turtleCard: ExpandableCardConfig = {
    key: 'turtle',
    label: 'Turtle Timer',
    description: 'Track turtle fishing timers and cooldowns',
    icon: {
      kind: 'sprite', value: '🐢', fallback: '🐢',
      bunched: [
        { spriteKey: 'sprite/pet/Turtle', offsetX: -7, scale: 0.9 },
        { spriteKey: 'sprite/pet/Chicken', offsetX: 7, offsetY: 1, scale: 0.75 },
      ],
    },
    labelColor: '#38bdf8',
    tier: 'expandable',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Cast cooldowns · Active turtles';
    },
    renderExpanded: makeTrackerExpanded('turtle'),
    detachWindowId: 'trackers-v2-turtle',
    onDetach: () => openDetachedTracker('trackers-v2-turtle', '🐢 Turtle Timer', 'turtle', '700px'),
  };

  const cropsCard: ExpandableCardConfig = {
    key: 'crops',
    label: 'Crop Boosts',
    description: 'View active crop boost effects and durations',
    icon: { kind: 'sprite', value: '🌱', spriteKey: 'sprite/plant/Sunflower', spriteMutations: ['Gold'], fallback: '🌱' },
    labelColor: '#a78bfa',
    tier: 'expandable',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Growth · Size · Mutations';
    },
    renderExpanded: makeTrackerExpanded('crops'),
    detachWindowId: 'trackers-v2-crops',
    onDetach: () => openDetachedTracker('trackers-v2-crops', '🌱 Crop Boosts', 'crops', '800px'),
  };

  const shopRestockCard: LauncherCardConfig = {
    key: 'shop-restock',
    label: 'Shop Restock',
    description: 'Track shop restock items and schedules',
    icon: {
      kind: 'sprite', value: '🏪', fallback: '🏪',
      bunched: [
        { spriteKey: 'sprite/ui/Coin', offsetX: -8, offsetY: 2, scale: 0.7 },
        { spriteKey: 'sprite/plant/Starweaver', offsetX: -2, offsetY: -3, scale: 0.8 },
        { spriteKey: 'sprite/plant/DawnCelestialCrop', offsetX: 4, offsetY: 1, scale: 0.75 },
        { spriteKey: 'sprite/plant/MoonCelestialCrop', offsetX: 9, offsetY: -2, scale: 0.75 },
      ],
    },
    tier: 'launcher',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Restock items and timing';
    },
    onOpen: () => {
      import('../../shopRestockWindow').then(({ openShopRestockWindow }) => {
        openShopRestockWindow();
      }).catch(e => log('⚠️ Failed to open Shop Restock', e));
    },
  };

  const valueDisplayCard: LauncherCardConfig = {
    key: 'value-display',
    label: 'Value Display',
    description: 'Storage coin values and crop sell price overlays',
    icon: { kind: 'sprite', value: '💰', spriteKey: 'sprite/ui/CoinBag', fallback: '💰' },
    tier: 'launcher',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Overlay sell values on crops and storage';
    },
    onOpen: () => {
      toggleWindow('trackers-v2-storageValue', '💰 Value Display', (root) => {
        root.style.cssText = 'overflow-y:auto;';
        import('../../storageValueWindow').then(({ renderStorageValueSettings }) => {
          renderStorageValueSettings(root);
        }).catch(e => log('⚠️ Failed to load Value Display', e));
      }, '420px', '78vh');
    },
  };

  const activityLogCard: LauncherCardConfig = {
    key: 'activity-log',
    label: 'Activity Log',
    description: 'Persistent activity history with filters and replay',
    icon: { kind: 'sprite', value: '📜', spriteKey: 'sprite/ui/ActivityLog', fallback: '📜' },
    tier: 'launcher',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Game event history with filtering';
    },
    onOpen: () => {
      toggleWindow('utility-feature-activity-log', '📜 Activity Log', (root) => {
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;padding:12px;';
        import('../../sections/activityLogSection').then(({ createActivityLogSection }) => {
          root.appendChild(createActivityLogSection());
        }).catch(e => log('⚠️ Failed to load Activity Log', e));
      }, '580px', '78vh');
    },
  };

  return {
    id: 'trackers',
    label: 'Trackers',
    icon: {
      kind: 'sprite', value: '📊', fallback: '📊',
      bunched: [
        { spriteKey: 'sprite/pet/Peacock', mutations: ['Rainbow'], offsetX: -8, scale: 0.9 },
        { spriteKey: 'sprite/ui/StrengthStar', offsetX: 4, offsetY: -3, scale: 0.7 },
        { spriteKey: 'sprite/ui/Coin', offsetX: 8, offsetY: 3, scale: 0.7 },
      ],
    },
    cards: [abilityCard, xpCard, turtleCard, cropsCard, shopRestockCard, valueDisplayCard, activityLogCard],
  };
}
