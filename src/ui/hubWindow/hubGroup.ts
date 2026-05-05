// src/ui/hubWindow/hubGroup.ts

import type { HubGroupDef, CardConfig } from './cards/types';
import { renderInlineToggle } from './cards/inlineToggle';
import { renderExpandableCard, type ExpandableCardResult } from './cards/expandableCard';
import { renderLauncherCard } from './cards/launcherCard';
import { getExpandedCard, setExpandedCard } from './state';

export interface HubGroupResult {
  element: HTMLElement;
  cleanup: () => void;
}

export function renderHubGroup(group: HubGroupDef): HubGroupResult {
  const cleanups: Array<() => void> = [];
  const expandableCards = new Map<string, ExpandableCardResult>();

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:16px;';

  // Group header
  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:8px',
    'padding-bottom:8px',
  ].join(';');

  const headerLabel = document.createElement('span');
  headerLabel.style.cssText = [
    'font-size:12px',
    'font-weight:600',
    'letter-spacing:1px',
    'color:#8f82ff',
    'text-transform:uppercase',
  ].join(';');
  headerLabel.textContent = group.label;

  const countBadge = document.createElement('span');
  countBadge.style.cssText = 'font-size:10px;color:#776ea8;';
  countBadge.textContent = `${group.cards.length} features`;

  header.append(headerLabel, countBadge);
  container.appendChild(header);

  // Render cards by tier order: inline-toggle, expandable, launcher
  const sortOrder: Record<CardConfig['tier'], number> = {
    'inline-toggle': 0,
    'expandable': 1,
    'launcher': 2,
  };
  const sorted = [...group.cards].sort((a, b) => sortOrder[a.tier] - sortOrder[b.tier]);

  for (const card of sorted) {
    if (card.tier === 'inline-toggle') {
      const result = renderInlineToggle(card);
      container.appendChild(result.element);
      cleanups.push(result.cleanup);
    } else if (card.tier === 'expandable') {
      const cardWithCallbacks: typeof card = {
        ...card,
        onBeforeExpand: () => {
          for (const [otherKey, otherResult] of expandableCards) {
            if (otherKey !== card.key && otherResult.isExpanded()) otherResult.collapse();
          }
          setExpandedCard(group.id, card.key);
        },
        onBeforeCollapse: () => {
          setExpandedCard(group.id, null);
        },
      };
      const result = renderExpandableCard(cardWithCallbacks);
      expandableCards.set(card.key, result);
      container.appendChild(result.element);
      cleanups.push(result.cleanup);
    } else if (card.tier === 'launcher') {
      const result = renderLauncherCard(card);
      container.appendChild(result.element);
      cleanups.push(result.cleanup);
    }
  }

  // Restore persisted expanded state
  const persistedKey = getExpandedCard(group.id);
  if (persistedKey) {
    const cardToExpand = expandableCards.get(persistedKey);
    if (cardToExpand) {
      // Collapse others first (shouldn't be any, but safety)
      for (const [key, result] of expandableCards) {
        if (key !== persistedKey && result.isExpanded()) result.collapse();
      }
      cardToExpand.expand();
    }
  }

  return {
    element: container,
    cleanup: () => {
      cleanups.forEach(fn => fn());
      cleanups.length = 0;
      expandableCards.clear();
    },
  };
}
