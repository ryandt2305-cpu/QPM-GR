// src/ui/hubWindow/groups/itemsGroup.ts

import type { HubGroupDef, ExpandableCardConfig } from '../cards/types';
import { toggleWindow } from '../../modalWindow';
import { log } from '../../../utils/logger';
import { waitForCatalogs } from '../../../catalogs/gameCatalogs';

/** Best-effort catalog wait — never rejects, just logs and continues */
async function awaitCatalogs(): Promise<void> {
  try { await waitForCatalogs(10000); }
  catch { log('[Hub] Catalogs not ready yet, rendering with fallbacks'); }
}

export function getItemsGroup(): HubGroupDef {
  const favoritesCard: ExpandableCardConfig = {
    key: 'favorites',
    label: 'Favorites',
    description: 'Auto-favorite rules and bulk favorite actions',
    icon: { kind: 'sprite', value: '⭐', spriteKey: 'sprite/ui/HeartSticker', fallback: '⭐' },
    labelColor: '#f472b6',
    tier: 'expandable',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Auto-fav + bulk actions';
    },
    renderExpanded: (container) => {
      const spinner = document.createElement('div');
      spinner.style.cssText = 'color:rgba(224,224,224,0.45);font-size:12px;padding:8px;';
      spinner.textContent = '⏳ Loading...';
      container.appendChild(spinner);

      let cleanup: (() => void) | undefined;
      (async () => {
        try {
          await awaitCatalogs();
          const { createFavoritesSection } = await import('../../sections/favoritesSection');
          const result = createFavoritesSection();
          spinner.remove();
          container.appendChild(result.element);
          cleanup = result.cleanup;
        } catch (err) {
          log('⚠️ Failed to load Favorites', err);
          spinner.textContent = '❌ Failed to load';
        }
      })();
      return () => { if (cleanup) cleanup(); };
    },
    detachWindowId: 'hub-favorites',
    onDetach: () => {
      toggleWindow('hub-favorites', '⭐ Favorites', (root) => {
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;padding:12px;';
        import('../../sections/favoritesSection').then(({ createFavoritesSection }) => {
          const { element } = createFavoritesSection();
          root.appendChild(element);
        }).catch(e => log('⚠️ Failed to load Favorites', e));
      }, '580px', '78vh');
    },
  };

  const protectionCard: ExpandableCardConfig = {
    key: 'protection',
    label: 'Protection',
    description: 'Inventory locks, harvest guards, and capacity alerts',
    icon: { kind: 'sprite', value: '🛡️', spriteKey: 'sprite/ui/Locked', fallback: '🛡️' },
    labelColor: '#fb923c',
    tier: 'expandable',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Locks + capacity warnings';
    },
    renderExpanded: (container) => {
      const spinner = document.createElement('div');
      spinner.style.cssText = 'color:rgba(224,224,224,0.45);font-size:12px;padding:8px;';
      spinner.textContent = '⏳ Loading...';
      container.appendChild(spinner);

      let cleanup: (() => void) | undefined;
      (async () => {
        try {
          await awaitCatalogs();
          const { createProtectionSection } = await import('../../sections/protectionSection');
          const result = createProtectionSection();
          spinner.remove();
          container.appendChild(result.element);
          cleanup = result.cleanup;
        } catch (err) {
          log('⚠️ Failed to load Protection', err);
          spinner.textContent = '❌ Failed to load';
        }
      })();
      return () => { if (cleanup) cleanup(); };
    },
    detachWindowId: 'hub-protection',
    onDetach: () => {
      toggleWindow('hub-protection', '🛡️ Protection', (root) => {
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;padding:12px;';
        import('../../sections/protectionSection').then(({ createProtectionSection }) => {
          const { element } = createProtectionSection();
          root.appendChild(element);
        }).catch(e => log('⚠️ Failed to load Protection', e));
      }, '580px', '78vh');
    },
  };

  const calculatorCard: ExpandableCardConfig = {
    key: 'calculator',
    label: 'Calculator',
    description: 'Calculate crop and pet sell values with mutations',
    icon: { kind: 'sprite', value: '🧮', spriteKey: 'sprite/ui/Coin', fallback: '🧮' },
    labelColor: '#fbbf24',
    tier: 'expandable',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Sell prices with bonuses';
    },
    renderExpanded: (container) => {
      const spinner = document.createElement('div');
      spinner.style.cssText = 'color:rgba(224,224,224,0.45);font-size:12px;padding:8px;';
      spinner.textContent = '⏳ Loading...';
      container.appendChild(spinner);

      (async () => {
        try {
          await awaitCatalogs();
          spinner.remove();
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'display:flex;flex-direction:column;min-height:200px;';
          container.appendChild(wrapper);
          const { renderCalculator } = await import('../../cropCalculatorWindow');
          renderCalculator(wrapper);
        } catch (err) {
          log('⚠️ Failed to load Calculator', err);
          spinner.textContent = '❌ Failed to load';
        }
      })();
    },
    detachWindowId: 'crop-calculator',
    onDetach: () => {
      import('../../cropCalculatorWindow').then(({ openCalculatorWindow }) => {
        openCalculatorWindow();
      }).catch(e => log('⚠️ Failed to open Calculator', e));
    },
  };

  return {
    id: 'items',
    label: 'Items',
    icon: {
      kind: 'sprite', value: '🎒', fallback: '🎒',
      bunched: [
        { spriteKey: 'sprite/ui/InventoryBag', offsetX: -7, scale: 0.9 },
        { spriteKey: 'sprite/ui/HeartSticker', offsetX: 7, offsetY: -3, scale: 0.65 },
      ],
    },
    cards: [favoritesCard, protectionCard, calculatorCard],
  };
}
