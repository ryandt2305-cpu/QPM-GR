// src/ui/hubWindow/groups/gardenGroup.ts

import type { HubGroupDef, ExpandableCardConfig, LauncherCardConfig } from '../cards/types';
import { toggleWindow } from '../../modalWindow';
import { log } from '../../../utils/logger';
import { waitForCatalogs } from '../../../catalogs/gameCatalogs';

/** Best-effort catalog wait — never rejects, just logs and continues */
async function awaitCatalogs(): Promise<void> {
  try { await waitForCatalogs(10000); }
  catch { log('[Hub] Catalogs not ready yet, rendering with fallbacks'); }
}

export function getGardenGroup(): HubGroupDef {
  const gardenFiltersCard: ExpandableCardConfig = {
    key: 'garden-filters',
    label: 'Garden Filters',
    description: 'Filter & highlight garden tiles by species, mutations',
    icon: { kind: 'sprite', value: '🔍', spriteKey: 'sprite/plant/RoseRed', spriteMutations: ['Thunderstruck'], fallback: '🔍' },
    labelColor: '#c084fc',
    tier: 'expandable',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Species · Mutations · Rarity';
    },
    renderExpanded: (container) => {
      const spinner = document.createElement('div');
      spinner.style.cssText = 'color:rgba(224,224,224,0.45);font-size:12px;padding:8px;';
      spinner.textContent = '⏳ Loading...';
      container.appendChild(spinner);

      (async () => {
        try {
          await awaitCatalogs();
          const { createGardenFiltersSection } = await import('../../sections/gardenFiltersSection');
          const el = await createGardenFiltersSection();
          spinner.remove();
          container.appendChild(el);
        } catch (err) {
          log('⚠️ Failed to load Garden Filters', err);
          spinner.textContent = '❌ Failed to load';
        }
      })();
    },
    detachWindowId: 'utility-feature-garden-filters',
    onDetach: () => {
      toggleWindow('utility-feature-garden-filters', '🔍 Garden Filters', (root) => {
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;padding:12px;';
        import('../../sections/gardenFiltersSection').then(async ({ createGardenFiltersSection }) => {
          root.appendChild(await createGardenFiltersSection());
        }).catch(e => log('⚠️ Failed to load Garden Filters', e));
      }, '580px', '78vh');
    },
  };

  const remindersCard: ExpandableCardConfig = {
    key: 'reminders',
    label: 'Reminders',
    description: 'Timers and alerts for garden events and harvests',
    icon: { kind: 'sprite', value: '🔔', spriteKey: 'sprite/plant/Mushroom', spriteMutations: ['Dawnlit'], fallback: '🔔' },
    labelColor: '#34d399',
    tier: 'expandable',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Custom alerts · Event timers';
    },
    renderExpanded: (container) => {
      // overflow left to parent hub scroll container
      import('../../originalPanel').then(({ renderRemindersContent }) => {
        renderRemindersContent(container, { startExpanded: true });
      }).catch(e => log('⚠️ Failed to load Reminders', e));
    },
    detachWindowId: 'utility-feature-reminders',
    onDetach: () => {
      toggleWindow('utility-feature-reminders', '🔔 Reminders', (root) => {
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;padding:12px;';
        import('../../originalPanel').then(({ renderRemindersContent }) => {
          renderRemindersContent(root);
        }).catch(e => log('⚠️ Failed to load Reminders', e));
      }, '580px', '78vh');
    },
  };

  const statsCard: LauncherCardConfig = {
    key: 'stats',
    label: 'Garden & Hatch Stats',
    description: 'Visual stats for mutation progress and hatching history',
    icon: { kind: 'sprite', value: '🌿', spriteKey: 'sprite/pet/CommonEgg', fallback: '🌿' },
    tier: 'launcher',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Mutation and hatching analytics';
    },
    onOpen: () => {
      import('../../statsHubWindow').then(({ openStatsHubWindow }) => {
        openStatsHubWindow();
      }).catch(e => log('⚠️ Failed to open Stats Hub', e));
    },
  };

  return {
    id: 'garden',
    label: 'Garden',
    icon: {
      kind: 'sprite', value: '🌱', fallback: '🌱',
      bunched: [
        { spriteKey: 'sprite/plant/RoseRed', offsetX: -8, scale: 0.85 },
        { spriteKey: 'sprite/plant/Sunflower', offsetX: 2, offsetY: -2, scale: 0.85 },
        { spriteKey: 'sprite/plant/Blueberry', offsetX: 8, offsetY: 2, scale: 0.75 },
      ],
    },
    cards: [gardenFiltersCard, remindersCard, statsCard],
  };
}
