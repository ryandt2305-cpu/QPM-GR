import { getOptimizerConfig, type PetComparison } from '../../features/petOptimizer';
import { createFamilyTeam } from './actions';
import { createPetCard } from './card';
import {
  buildFamilyGroups,
  getTopTeamCandidatesForFamily,
  sortFamilyGroups,
} from './familyGroups';
import { showFamilySellModal } from './sell';
import type { StatusSectionId } from './types';

const STATUS_CONFIG: Record<StatusSectionId, {
  icon: string;
  title: string;
  color: string;
  bgColor: string;
  desc: string;
}> = {
  review: {
    icon: '📝',
    title: 'Review Needed',
    color: '#FFC107',
    bgColor: 'rgba(255, 193, 7, 0.1)',
    desc: 'Contains unknown or unmapped abilities',
  },
  sell: {
    icon: '💰',
    title: 'Sell Pets',
    color: '#f44336',
    bgColor: 'rgba(244, 67, 54, 0.1)',
    desc: 'Outclassed or low-value pets to sell',
  },
  keep: {
    icon: '✅',
    title: 'Keep These Pets',
    color: '#4CAF50',
    bgColor: 'rgba(76, 175, 80, 0.1)',
    desc: 'Best in their categories',
  },
};

export function createStatusSection(
  status: StatusSectionId,
  comparisons: PetComparison[],
  onAfterSell: () => void,
): HTMLElement {
  const sectionConfig = STATUS_CONFIG[status];
  const optimizerConfig = getOptimizerConfig();

  const section = document.createElement('div');
  section.style.cssText = `
    margin-bottom: 16px;
    background: ${sectionConfig.bgColor};
    border-radius: 8px;
    border: 1px solid ${sectionConfig.color}44;
    overflow: hidden;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    font-size: 15px;
    font-weight: 600;
    color: ${sectionConfig.color};
    padding: 12px 16px;
    background: rgba(0, 0, 0, 0.3);
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: background 0.2s;
  `;

  const headerLeft = document.createElement('div');
  headerLeft.innerHTML = `
    <span style="font-size: 16px; margin-right: 8px;">${sectionConfig.icon}</span>
    <span>${sectionConfig.title}</span>
    <span style="
      background: ${sectionConfig.color}33;
      color: ${sectionConfig.color};
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      margin-left: 8px;
      font-weight: 700;
    ">${comparisons.length}</span>
    <span style="font-size: 11px; color: #888; font-weight: normal; margin-left: 12px;">${sectionConfig.desc}</span>
  `;

  const collapseIcon = document.createElement('span');
  collapseIcon.textContent = '▼';
  collapseIcon.style.cssText = 'font-size: 10px; transition: transform 0.3s;';

  header.appendChild(headerLeft);
  header.appendChild(collapseIcon);
  section.appendChild(header);

  const petsContainer = document.createElement('div');
  petsContainer.style.cssText = 'padding: 12px; display: flex; flex-direction: column; gap: 8px;';

  const familyGroups = sortFamilyGroups(buildFamilyGroups(comparisons));
  for (const family of familyGroups) {
    const abilityHeader = document.createElement('div');
    abilityHeader.style.cssText = `
      margin-top: 8px;
      margin-bottom: 4px;
      padding: 6px 10px;
      background: rgba(66, 165, 245, 0.1);
      border-radius: 4px;
      border-left: 3px solid #42A5F5;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    `;

    const headerMeta = document.createElement('div');
    headerMeta.style.cssText = 'display:flex; align-items:center; gap:8px;';

    const headerTitle = document.createElement('span');
    headerTitle.style.cssText = 'font-size: 12px; font-weight: 600; color: #aaa;';
    headerTitle.textContent = `${family.familyLabel} (${family.pets.length} pet${family.pets.length > 1 ? 's' : ''})`;
    headerMeta.appendChild(headerTitle);

    if (family.highestTierLabel) {
      const tierBadge = document.createElement('span');
      tierBadge.style.cssText = [
        'font-size:10px',
        'font-weight:700',
        'padding:2px 6px',
        'border-radius:999px',
        'border:1px solid rgba(66,165,245,0.45)',
        'background:rgba(66,165,245,0.15)',
        'color:#9fd0ff',
      ].join(';');
      tierBadge.textContent = `Best tier: ${family.highestTierLabel}`;
      headerMeta.appendChild(tierBadge);
    }
    abilityHeader.appendChild(headerMeta);

    const headerBtnGroup = document.createElement('div');
    headerBtnGroup.style.cssText = 'display:flex;gap:6px;align-items:center;';

    const topCandidates = getTopTeamCandidatesForFamily(family, comparisons);
    if (topCandidates.length > 0) {
      const createBtn = document.createElement('button');
      createBtn.type = 'button';
      createBtn.textContent = 'Create Team';
      createBtn.style.cssText = [
        'padding:4px 9px',
        'font-size:11px',
        'font-weight:600',
        'border-radius:6px',
        'border:1px solid rgba(143,130,255,0.45)',
        'background:linear-gradient(180deg, rgba(143,130,255,0.24), rgba(143,130,255,0.12))',
        'color:#e7e2ff',
        'cursor:pointer',
        'white-space:nowrap',
        'transition:all 0.15s ease',
      ].join(';');
      createBtn.title = `Create "${family.familyLabel}" team from top ${topCandidates.length} pet${topCandidates.length > 1 ? 's' : ''}`;
      createBtn.addEventListener('mouseenter', () => {
        createBtn.style.borderColor = 'rgba(143,130,255,0.75)';
        createBtn.style.background = 'linear-gradient(180deg, rgba(143,130,255,0.35), rgba(143,130,255,0.20))';
      });
      createBtn.addEventListener('mouseleave', () => {
        createBtn.style.borderColor = 'rgba(143,130,255,0.45)';
        createBtn.style.background = 'linear-gradient(180deg, rgba(143,130,255,0.24), rgba(143,130,255,0.12))';
      });
      createBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        createFamilyTeam(family.familyLabel, topCandidates);
      });
      headerBtnGroup.appendChild(createBtn);
    }

    if (family.pets.length > 0) {
      const familySellBtn = document.createElement('button');
      familySellBtn.type = 'button';
      familySellBtn.textContent = 'Sell';
      familySellBtn.style.cssText = [
        'padding:4px 9px',
        'font-size:11px',
        'font-weight:600',
        'border-radius:6px',
        'border:1px solid rgba(244,67,54,0.45)',
        'background:linear-gradient(180deg, rgba(244,67,54,0.24), rgba(244,67,54,0.12))',
        'color:#ff9e95',
        'cursor:pointer',
        'white-space:nowrap',
        'transition:all 0.15s ease',
      ].join(';');
      familySellBtn.title = `Sell pets in ${family.familyLabel} family`;
      familySellBtn.addEventListener('mouseenter', () => {
        familySellBtn.style.borderColor = 'rgba(244,67,54,0.75)';
        familySellBtn.style.background = 'linear-gradient(180deg, rgba(244,67,54,0.35), rgba(244,67,54,0.20))';
      });
      familySellBtn.addEventListener('mouseleave', () => {
        familySellBtn.style.borderColor = 'rgba(244,67,54,0.45)';
        familySellBtn.style.background = 'linear-gradient(180deg, rgba(244,67,54,0.24), rgba(244,67,54,0.12))';
      });
      familySellBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        showFamilySellModal(family.familyLabel, family.pets, onAfterSell);
      });
      headerBtnGroup.appendChild(familySellBtn);
    }

    abilityHeader.appendChild(headerBtnGroup);
    petsContainer.appendChild(abilityHeader);

    const visiblePets = status === 'keep'
      ? (optimizerConfig.showAllKeeps ? family.pets : family.pets.slice(0, 3))
      : family.pets;

    for (const entry of visiblePets) {
      const petCard = createPetCard(entry.comparison, entry, onAfterSell);
      petsContainer.appendChild(petCard);
    }
  }

  section.appendChild(petsContainer);

  let isCollapsed = false;
  header.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    petsContainer.style.display = isCollapsed ? 'none' : 'flex';
    collapseIcon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
  });
  header.addEventListener('mouseenter', () => {
    header.style.background = 'rgba(0, 0, 0, 0.4)';
  });
  header.addEventListener('mouseleave', () => {
    header.style.background = 'rgba(0, 0, 0, 0.3)';
  });

  return section;
}
