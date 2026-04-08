import {
  getOptimizerConfig,
  protectPet,
  unprotectPet,
  type PetComparison,
} from '../../features/petOptimizer';
import { getAbilityColor, normalizeAbilityName } from '../../utils/petCardRenderer';
import { toOrdinal } from './familyGroups';
import { openBetterPetsCompare, openCompetitorsPetCompare } from './actions';
import { appendSellButton } from './sell';
import { getPetSprite, renderAbilitySquares } from './sprites';
import type { FamilyPetEntry } from './types';

const LOCATION_ICONS: Record<string, string> = {
  active: '🟢',
  inventory: '📦',
  hutch: '🏠',
};

function appendManualKeepButton(
  card: HTMLElement,
  comparison: PetComparison,
  isReturnAction: boolean,
  onAfterKeep: () => void,
): void {
  const button = document.createElement('button');
  const palette = isReturnAction
    ? {
      border: 'rgba(255,193,7,0.55)',
      background: 'rgba(255,193,7,0.16)',
      text: '#ffe08a',
    }
    : {
      border: 'rgba(76,175,80,0.55)',
      background: 'rgba(76,175,80,0.18)',
      text: '#9de6a8',
    };

  button.type = 'button';
  button.textContent = isReturnAction ? 'Return' : 'Keep';
  button.title = isReturnAction
    ? 'Return this pet to optimizer recommendations'
    : 'Keep this pet in the optimizer';
  button.style.cssText = [
    'position:absolute',
    'top:8px',
    'right:40px',
    'height:26px',
    'min-width:54px',
    'padding:0 9px',
    'border-radius:6px',
    `border:1px solid ${palette.border}`,
    `background:${palette.background}`,
    `color:${palette.text}`,
    'font-size:11px',
    'font-weight:700',
    'cursor:pointer',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'line-height:1',
    'opacity:0.82',
    'transition:opacity 0.15s, filter 0.15s',
    'z-index:6',
  ].join(';');

  button.addEventListener('mouseenter', () => {
    button.style.opacity = '1';
    button.style.filter = 'brightness(1.05)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.opacity = '0.82';
    button.style.filter = 'none';
  });
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    button.disabled = true;
    button.style.opacity = '0.6';
    button.style.pointerEvents = 'none';

    try {
      if (isReturnAction) {
        unprotectPet(comparison.pet.id);
      } else {
        protectPet(comparison.pet.id);
      }
      onAfterKeep();
    } catch (error) {
      console.error('[Pet Optimizer] Failed to update manual keep status:', error);
      button.disabled = false;
      button.style.opacity = '1';
      button.style.pointerEvents = 'auto';
    }
  });

  card.appendChild(button);
}

export function createPetCard(
  comparison: PetComparison,
  familyEntry: FamilyPetEntry | undefined,
  familyPeers: PetComparison[] | undefined,
  onAfterSell: () => void,
  onAfterKeep: () => void,
): HTMLElement {
  const { pet, score, status, reason, betterAlternatives, decisionFamilyLabel } = comparison;
  const isManuallyProtected = getOptimizerConfig().protectedPetIds.has(pet.id);
  const canKeepManually = status === 'sell' || status === 'review';
  const canReturnToOptimizer = status === 'keep' && isManuallyProtected;
  const showManualKeepButton = canKeepManually || canReturnToOptimizer;
  const scoreColumnRightMarginPx = showManualKeepButton ? 104 : 30;

  const card = document.createElement('div');
  card.style.cssText = `
    background: linear-gradient(135deg, #1f1f1f, #1a1a1a);
    border-radius: 8px;
    padding: 14px;
    border: 1px solid #333;
    transition: all 0.2s;
    position: relative;
  `;

  card.addEventListener('mouseenter', () => {
    card.style.borderColor = '#555';
    card.style.transform = 'translateX(4px)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.borderColor = '#333';
    card.style.transform = 'translateX(0)';
  });

  const sprite = getPetSprite(pet.species, pet.hasRainbow, pet.hasGold);
  const showDecisionFamily = status === 'sell' && !!decisionFamilyLabel;
  const betterPetsHeading = decisionFamilyLabel ? `Better ${decisionFamilyLabel} pets` : 'Better pets';
  const hasRankContext = !!familyEntry && Number.isFinite(familyEntry.rank) && familyEntry.rank < Number.MAX_SAFE_INTEGER;
  const rankLabel = hasRankContext && familyEntry
    ? `${toOrdinal(familyEntry.rank)} ${familyEntry.familyLabel}`
    : null;
  const rankMetaLabel = hasRankContext && familyEntry?.totalCompetitors
    ? `${familyEntry.totalCompetitors} competitor${familyEntry.totalCompetitors === 1 ? '' : 's'}`
    : null;
  const familyTierLabel = familyEntry?.tierLabel ? `Tier ${familyEntry.tierLabel}` : null;
  const modeLabel = comparison.decisionMode === 'slot_efficiency'
    ? 'Slot Efficiency'
    : comparison.decisionMode === 'specialist'
      ? 'Specialist'
      : null;
  const showModeLabel = status === 'sell' && !!modeLabel;
  const showCompetitorsButton = status === 'keep' && !!rankMetaLabel && !!familyPeers && familyPeers.length > 0;

  card.innerHTML = `
    <div style="display: flex; gap: 12px; align-items: start;">
      <div style="flex-shrink: 0;">
        <div style="
          position: relative;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.03);
        ">
          ${sprite ? `
            <img src="${sprite}" alt="${pet.species}" style="
              width: 100%;
              height: 100%;
              object-fit: contain;
              image-rendering: pixelated;
            ">
          ` : `
            <span style="font-size: 18px; color: #666;">•</span>
          `}
          ${renderAbilitySquares(pet.abilities, 12, pet.hasRainbow, pet.hasGold, pet.species || undefined)}
        </div>
      </div>

      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <div style="font-size: 14px; font-weight: 600; color: #fff;">
            ${pet.name || pet.species}
          </div>
          <div style="font-size: 12px; color: #777;">
            ${LOCATION_ICONS[pet.location]} ${pet.location}
          </div>
          ${pet.hasRainbow ? '<span style="font-size: 12px;">🌈 Rainbow</span>' : ''}
          ${pet.hasGold ? '<span style="font-size: 12px;">✨ Gold</span>' : ''}
        </div>

        <div style="font-size: 12px; color: #aaa; margin-bottom: 6px;">
          ${pet.species}${pet.species !== (pet.name || pet.species) ? ` "${pet.name || pet.species}"` : ''}
          • STR ${pet.strength}${pet.maxStrength ? ` / Max ${pet.maxStrength}` : ''}
          ${pet.maxStrength && pet.maxStrength > pet.strength ? ` <span style="color: #4CAF50;">(+${pet.maxStrength - pet.strength} potential)</span>` : ''}
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
          ${pet.abilities.map((ability) => {
            const normalizedName = normalizeAbilityName(ability);
            const color = getAbilityColor(ability);

            let background: string;
            let textColor: string;
            const abilityLower = ability.toLowerCase().replace(/\s+/g, '');
            const isRainbowGranter = abilityLower.includes('rainbowgranter') || abilityLower.includes('raingranter');
            const isGoldGranter = abilityLower.includes('goldgranter');

            if (isRainbowGranter) {
              background = 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #8a2be2, #ff0080)';
              textColor = '#fff';
            } else if (isGoldGranter) {
              background = 'linear-gradient(135deg, #ffd700, #ffed4e, #ffd700)';
              textColor = '#000';
            } else {
              background = color.base;
              textColor = color.text;
            }

            return `
              <span style="
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 11px;
                background: ${background};
                ${(isRainbowGranter || isGoldGranter) ? 'background-size: 200% 200%; animation: shimmer 3s ease infinite;' : ''}
                color: ${textColor};
                border: 1px solid ${(isRainbowGranter || isGoldGranter) ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)'};
                font-weight: ${(isRainbowGranter || isGoldGranter) ? '600' : '500'};
              ">${normalizedName}</span>
            `;
          }).join('')}
        </div>

        <div style="font-size: 12px; color: #ccc; margin-bottom: 8px;">
          ${reason}
        </div>
        ${showDecisionFamily ? `
          <div style="font-size: 11px; color: #7fb3ff; margin-bottom: 8px;">
            Ability family: ${decisionFamilyLabel}
          </div>
        ` : ''}
        ${showModeLabel ? `
          <div style="font-size: 11px; color: #9a8cff; margin-bottom: 8px;">
            Optimizer mode: ${modeLabel}
          </div>
        ` : ''}

        ${betterAlternatives.length > 0 ? `
          <div style="font-size: 11px; color: #888; margin-top: 8px; padding-top: 8px; border-top: 1px solid #333;">
            <button
              type="button"
              data-better-compare="true"
              style="
                border: 1px solid rgba(127, 179, 255, 0.5);
                background: rgba(127, 179, 255, 0.12);
                color: #9ec4ff;
                border-radius: 6px;
                font-size: 11px;
                padding: 4px 8px;
                cursor: pointer;
                margin-right: 6px;
              "
            >${betterPetsHeading}</button>
            ${betterAlternatives.map((betterPet) =>
              `${betterPet.name || betterPet.species} (STR ${betterPet.strength}${betterPet.maxStrength ? `/${betterPet.maxStrength}` : ''})`,
            ).join(', ')}
          </div>
        ` : ''}
      </div>

      <div style="flex-shrink: 0; text-align: right; margin-right: ${scoreColumnRightMarginPx}px;">
        <div style="font-size: 18px; font-weight: bold; color: #42A5F5;">${Math.round(score.total - score.granterBonus)}</div>
        ${score.granterBonus > 0 ? `
          <div style="
            font-size: 14px;
            font-weight: 600;
            margin-top: 2px;
            ${score.granterType === 'rainbow'
              ? 'background: linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #8a2be2, #ff0080); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;'
              : 'background: linear-gradient(135deg, #ffd700, #ffed4e, #ffd700); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;'
            }
          ">+${Math.round(score.granterBonus)}</div>
        ` : ''}
        <div style="font-size: 10px; color: #666;">SCORE</div>
        ${rankLabel ? `<div style="font-size: 11px; color: #8bbfff; margin-top: 6px;">${rankLabel}</div>` : ''}
        ${showCompetitorsButton ? `
          <button
            type="button"
            data-competitors-compare="true"
            style="
              border: 1px solid rgba(127,179,255,0.45);
              background: rgba(127,179,255,0.1);
              color: #8ab8f5;
              border-radius: 5px;
              font-size: 10px;
              padding: 2px 6px;
              cursor: pointer;
              display: block;
              margin-top: 2px;
              white-space: nowrap;
              width: 100%;
              text-align: center;
              transition: background 0.15s, border-color 0.15s;
            "
          >${rankMetaLabel}</button>
        ` : (rankMetaLabel ? `<div style="font-size: 10px; color: #6f84a8; margin-top: 2px;">${rankMetaLabel}</div>` : '')}
        ${familyTierLabel ? `<div style="font-size: 10px; color: #777; margin-top: 2px;">${familyTierLabel}</div>` : ''}
      </div>
    </div>
  `;

  if (showManualKeepButton) {
    appendManualKeepButton(card, comparison, canReturnToOptimizer, onAfterKeep);
  }

  appendSellButton(card, comparison, onAfterSell, {
    rightOffsetPx: 8,
    topOffsetPx: 8,
    zIndex: 6,
  });

  const compareBtn = card.querySelector<HTMLButtonElement>('button[data-better-compare="true"]');
  if (compareBtn) {
    compareBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      openBetterPetsCompare(comparison);
    });
  }

  const competitorsBtn = card.querySelector<HTMLButtonElement>('button[data-competitors-compare="true"]');
  if (competitorsBtn && familyPeers && familyPeers.length > 0 && familyEntry) {
    competitorsBtn.addEventListener('mouseenter', () => {
      competitorsBtn.style.background = 'rgba(127,179,255,0.2)';
      competitorsBtn.style.borderColor = 'rgba(127,179,255,0.7)';
    });
    competitorsBtn.addEventListener('mouseleave', () => {
      competitorsBtn.style.background = 'rgba(127,179,255,0.1)';
      competitorsBtn.style.borderColor = 'rgba(127,179,255,0.45)';
    });
    competitorsBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      openCompetitorsPetCompare(comparison, familyEntry.familyLabel, familyPeers);
    });
  }

  return card;
}
