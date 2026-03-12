// src/ui/petOptimizerWindow.ts
// Pet Optimizer UI - Smart pet management interface

import { isWindowOpen, toggleWindow } from './modalWindow';
import {
  getOptimizerAnalysis,
  getOptimizerConfig,
  setOptimizerConfig,
  protectPet,
  unprotectPet,
  type OptimizerCompareFilter,
  type PetComparison,
  type OptimizerAnalysis,
} from '../features/petOptimizer';
import { COMPARE_GROUP_FILTER_OPTIONS } from '../data/petCompareRules';
import { createTeam, setTeamSlot } from '../store/petTeams';
import { getPetSpriteDataUrlWithMutations, isSpritesReady } from '../sprite-v2/compat';
import { getAbilityColor, normalizeAbilityName } from '../utils/petCardRenderer';
import { formatCoins } from '../features/valueCalculator';
import { getAbilityFamilyKey } from '../features/petCompareEngine';

interface WindowState {
  root: HTMLElement;
  summaryContainer: HTMLElement;
  filtersContainer: HTMLElement;
  resultsContainer: HTMLElement;
  currentAnalysis: OptimizerAnalysis | null;
}

let globalState: WindowState | null = null;
let filtersCleanup: (() => void) | null = null;
const PETS_WINDOW_ID = 'qpm-pets-window';
const PETS_WINDOW_SWITCH_TAB_EVENT = 'qpm:pets-window-switch-tab';

type PetsWindowTabId = 'manager' | 'feeding' | 'pet-optimizer';
interface PetsWindowSwitchDetail {
  tab: PetsWindowTabId;
  teamId?: string | null;
}

function dispatchPetsWindowSwitch(detail: PetsWindowSwitchDetail): void {
  window.dispatchEvent(new CustomEvent(PETS_WINDOW_SWITCH_TAB_EVENT, { detail }));
}

function ensureManagerView(teamId: string): void {
  const detail: PetsWindowSwitchDetail = { tab: 'manager', teamId };
  if (isWindowOpen(PETS_WINDOW_ID)) {
    dispatchPetsWindowSwitch(detail);
    return;
  }

  import('./petsWindow')
    .then(({ togglePetsWindow }) => {
      togglePetsWindow();
      requestAnimationFrame(() => dispatchPetsWindowSwitch(detail));
    })
    .catch((error) => {
      console.error('[Pet Optimizer] Failed to open Pets Manager window:', error);
    });
}

const TIER_VALUE_BY_LABEL: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

interface FamilyPetEntry {
  comparison: PetComparison;
  tierValue: number;
  tierLabel: string | null;
  representativeAbilityName: string;
}

interface FamilyAbilityGroup {
  familyKey: string;
  familyLabel: string;
  highestTierValue: number;
  highestTierLabel: string | null;
  representativeAbilityName: string;
  pets: FamilyPetEntry[];
}

function extractTierLabel(value: string): string | null {
  const match = String(value ?? '').match(/(IV|III|II|I)(?:_NEW)?$/i);
  return match && match[1] ? match[1].toUpperCase() : null;
}

function toTierValue(tierLabel: string | null): number {
  if (!tierLabel) return 0;
  return TIER_VALUE_BY_LABEL[tierLabel] ?? 0;
}

function stripTierSuffix(label: string): string {
  return label.trim().replace(/\s+(IV|III|II|I)$/i, '').replace(/\s+[1-4]$/i, '').trim();
}

function resolveFamilyKey(abilityId: string, fallbackAbility: string): string {
  const rawFamily = getAbilityFamilyKey(abilityId).trim();
  const base = rawFamily || abilityId || fallbackAbility;
  return base.trim().toLowerCase();
}

function resolveFamilyLabel(abilityId: string, fallbackAbility: string): string {
  const fromId = normalizeAbilityName(getAbilityFamilyKey(abilityId) || abilityId);
  const fromName = stripTierSuffix(normalizeAbilityName(fallbackAbility || abilityId));
  return (fromName || fromId || fallbackAbility || abilityId).trim();
}

function getComparisonRankScore(comparison: PetComparison): number {
  return (comparison.score.total || 0) + (comparison.score.granterBonus || 0);
}

function compareFamilyPetEntries(a: FamilyPetEntry, b: FamilyPetEntry): number {
  if (b.tierValue !== a.tierValue) return b.tierValue - a.tierValue;

  const aScore = getComparisonRankScore(a.comparison);
  const bScore = getComparisonRankScore(b.comparison);
  if (bScore !== aScore) return bScore - aScore;

  const aMax = a.comparison.pet.maxStrength || a.comparison.pet.strength || 0;
  const bMax = b.comparison.pet.maxStrength || b.comparison.pet.strength || 0;
  if (bMax !== aMax) return bMax - aMax;

  const strDiff = (b.comparison.pet.strength || 0) - (a.comparison.pet.strength || 0);
  if (strDiff !== 0) return strDiff;
  return a.comparison.pet.id.localeCompare(b.comparison.pet.id);
}

function buildFamilyGroups(comparisons: PetComparison[]): Map<string, FamilyAbilityGroup> {
  const byFamily = new Map<string, FamilyAbilityGroup>();

  for (const comparison of comparisons) {
    const petFamilies = new Map<string, {
      familyKey: string;
      familyLabel: string;
      tierValue: number;
      tierLabel: string | null;
      representativeAbilityName: string;
    }>();

    const maxLen = Math.max(comparison.pet.abilityIds.length, comparison.pet.abilities.length);
    for (let i = 0; i < maxLen; i += 1) {
      const abilityId = comparison.pet.abilityIds[i] ?? comparison.pet.abilities[i] ?? '';
      if (!abilityId) continue;
      const abilityName = comparison.pet.abilities[i] ?? abilityId;
      const familyKey = resolveFamilyKey(abilityId, abilityName);
      if (!familyKey) continue;

      const tierLabel = extractTierLabel(abilityId) ?? extractTierLabel(abilityName);
      const tierValue = toTierValue(tierLabel);
      const familyLabel = resolveFamilyLabel(abilityId, abilityName);
      const existing = petFamilies.get(familyKey);

      if (!existing || tierValue > existing.tierValue) {
        petFamilies.set(familyKey, {
          familyKey,
          familyLabel,
          tierValue,
          tierLabel,
          representativeAbilityName: abilityName,
        });
      }
    }

    for (const entry of petFamilies.values()) {
      const existingGroup = byFamily.get(entry.familyKey);
      if (!existingGroup) {
        byFamily.set(entry.familyKey, {
          familyKey: entry.familyKey,
          familyLabel: entry.familyLabel,
          highestTierValue: entry.tierValue,
          highestTierLabel: entry.tierLabel,
          representativeAbilityName: entry.representativeAbilityName,
          pets: [{
            comparison,
            tierValue: entry.tierValue,
            tierLabel: entry.tierLabel,
            representativeAbilityName: entry.representativeAbilityName,
          }],
        });
        continue;
      }

      existingGroup.pets.push({
        comparison,
        tierValue: entry.tierValue,
        tierLabel: entry.tierLabel,
        representativeAbilityName: entry.representativeAbilityName,
      });
      if (entry.tierValue > existingGroup.highestTierValue) {
        existingGroup.highestTierValue = entry.tierValue;
        existingGroup.highestTierLabel = entry.tierLabel;
        existingGroup.representativeAbilityName = entry.representativeAbilityName;
      }
    }
  }

  for (const group of byFamily.values()) {
    group.pets.sort(compareFamilyPetEntries);
  }

  return byFamily;
}

function sortFamilyGroups(groups: Map<string, FamilyAbilityGroup>): FamilyAbilityGroup[] {
  return [...groups.values()].sort((a, b) => {
    if (b.highestTierValue !== a.highestTierValue) return b.highestTierValue - a.highestTierValue;
    return a.familyLabel.localeCompare(b.familyLabel);
  });
}

function getTopTeamCandidatesForFamily(group: FamilyAbilityGroup): PetComparison[] {
  return group.pets.slice(0, 3).map((entry) => entry.comparison);
}

function createFamilyTeam(familyLabel: string, pets: PetComparison[]): void {
  const topPets = pets.slice(0, 3);
  if (topPets.length === 0) return;

  const teamName = familyLabel.trim() || 'Ability Team';
  const team = createTeam(teamName);

  for (let slotIndex = 0; slotIndex < 3; slotIndex += 1) {
    const petId = topPets[slotIndex]?.pet.id ?? null;
    setTeamSlot(team.id, slotIndex as 0 | 1 | 2, petId);
  }

  ensureManagerView(team.id);
}

function getPetSprite(species: string | null | undefined, hasRainbow: boolean, hasGold: boolean): string {
  if (!isSpritesReady()) return '';
  const name = (species ?? '').trim();
  if (!name) return '';
  const mutations = hasRainbow ? ['Rainbow'] : hasGold ? ['Gold'] : [];
  return getPetSpriteDataUrlWithMutations(name, mutations);
}

/**
 * Open Pet Optimizer window
 */
export function openPetOptimizerWindow(): void {
  toggleWindow(
    'pet-optimizer',
    '🎯 Pet Optimizer',
    renderPetOptimizerWindow,
    '900px',
    '85vh'
  );
}

export function renderPetOptimizerWindow(body: HTMLElement): void {
  filtersCleanup?.();
  filtersCleanup = null;

  // Clear any existing content
  body.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'qpm-pet-optimizer-root';
  root.style.cssText = `
    color: #fff;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  `;

  // Add shimmer animation CSS
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes shimmer {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
  `;
  root.appendChild(styleEl);

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom: 10px;';
  header.innerHTML = `
    <div style="font-size: 17px; font-weight: 700;">
      🎯 Pet Optimizer
    </div>
  `;
  root.appendChild(header);

  // Summary section
  const summaryContainer = document.createElement('div');
  summaryContainer.style.cssText = `
    background: rgba(0, 0, 0, 0.22);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 10px;
    border: 1px solid var(--qpm-border, #444);
  `;
  root.appendChild(summaryContainer);

  // Filters section
  const filtersContainer = document.createElement('div');
  filtersContainer.style.cssText = `
    background: rgba(0, 0, 0, 0.22);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 12px;
    border: 1px solid var(--qpm-border, #444);
  `;
  root.appendChild(filtersContainer);

  // Results section
  const resultsContainer = document.createElement('div');
  resultsContainer.style.cssText = 'min-height: 200px;';
  root.appendChild(resultsContainer);

  // Append root to body
  body.appendChild(root);

  // Initialize state
  globalState = {
    root,
    summaryContainer,
    filtersContainer,
    resultsContainer,
    currentAnalysis: null,
  };

  // Initial render
  renderFilters();
  refreshAnalysis();
}

async function refreshAnalysis(forceRefresh = false): Promise<void> {
  if (!globalState) return;

  // Show initial loading state
  globalState.summaryContainer.innerHTML = '<div style="color: #aaa;">⏳ Loading pets...</div>';
  globalState.resultsContainer.innerHTML = '';

  try {
    // Show progress during analysis
    const progressDiv = document.createElement('div');
    progressDiv.style.cssText = 'color: #aaa; display: flex; align-items: center; gap: 10px;';
    progressDiv.innerHTML = `
      <div>⏳ Analyzing pets...</div>
      <div id="analysis-progress" style="font-weight: bold; color: var(--qpm-accent, #8f82ff);">0%</div>
    `;
    globalState.summaryContainer.innerHTML = '';
    globalState.summaryContainer.appendChild(progressDiv);

    const analysis = await getOptimizerAnalysis(forceRefresh, (percent) => {
      const progressEl = document.getElementById('analysis-progress');
      if (progressEl) {
        progressEl.textContent = `${percent}%`;
      }
    });

    if (!analysis || analysis.totalPets === 0) {
      globalState.summaryContainer.innerHTML = `
        <div style="color: #FF9800; padding: 20px; text-align: center;">
          <div style="font-size: 18px; margin-bottom: 8px;">⚠️ No Pets Found</div>
          <div style="font-size: 13px; color: #aaa;">
            No pets detected in active slots, inventory, or hutch.
            <br>Make sure you have pets and try refreshing.
          </div>
        </div>
      `;
      globalState.resultsContainer.innerHTML = '';
      return;
    }

    globalState.currentAnalysis = analysis;
    renderSummary(analysis);
    renderResults(analysis);
  } catch (error) {
    console.error('[Pet Optimizer] Error:', error);
    globalState.summaryContainer.innerHTML = `
      <div style="color: var(--qpm-danger, #f44336); padding: 20px;">
        <div style="font-size: 18px; margin-bottom: 8px;">❌ Analysis Failed</div>
        <div style="font-size: 13px; color: #aaa;">
          ${error instanceof Error ? error.message : 'Unknown error'}
        </div>
        <div style="font-size: 12px; color: #666; margin-top: 8px;">
          Check browser console for details
        </div>
      </div>
    `;
  }
}

function renderSummary(analysis: OptimizerAnalysis): void {
  if (!globalState) return;

  try {
    const html = `
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
        <span style="padding:3px 8px;border-radius:999px;border:1px solid rgba(66,165,245,0.35);background:rgba(66,165,245,0.12);font-size:11px;color:#8ec8ff;">Total ${analysis.totalPets}</span>
        <span style="padding:3px 8px;border-radius:999px;border:1px solid rgba(76,175,80,0.35);background:rgba(76,175,80,0.12);font-size:11px;color:#8ed89a;">Keep ${analysis.keep.length}</span>
        <span style="padding:3px 8px;border-radius:999px;border:1px solid rgba(255,152,0,0.35);background:rgba(255,152,0,0.12);font-size:11px;color:#ffc173;">Consider ${analysis.consider.length}</span>
        <span style="padding:3px 8px;border-radius:999px;border:1px solid rgba(244,67,54,0.35);background:rgba(244,67,54,0.12);font-size:11px;color:#ff9e95;">Obsolete ${analysis.obsoleteCount}</span>
        <span style="padding:3px 8px;border-radius:999px;border:1px solid rgba(156,39,176,0.35);background:rgba(156,39,176,0.12);font-size:11px;color:#dda4f0;">Upgrade ${analysis.upgradeCount}</span>
        <span style="padding:3px 8px;border-radius:999px;border:1px solid rgba(255,193,7,0.35);background:rgba(255,193,7,0.12);font-size:11px;color:#ffe08a;">Review ${analysis.reviewCount}</span>
        <span style="font-size:11px;color:#888;">${analysis.activePets} active • ${analysis.inventoryPets} inv • ${analysis.hutchPets} hutch</span>
      </div>
    `;

    globalState.summaryContainer.innerHTML = html;
  } catch (error) {
    console.error('[Pet Optimizer] Error rendering summary:', error);
    globalState.summaryContainer.innerHTML = `<div style="color: #f44336;">Error rendering summary: ${error instanceof Error ? error.message : 'Unknown'}</div>`;
  }
}

function renderFilters(): void {
  if (!globalState) return;
  filtersCleanup?.();
  filtersCleanup = null;

  const config = getOptimizerConfig();

  const filtersDiv = document.createElement('div');
  filtersDiv.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;';

  // Compare-group custom dropdown
  const groupWrap = document.createElement('div');
  groupWrap.style.cssText = 'position:relative; min-width:190px;';
  const groupBtn = document.createElement('button');
  groupBtn.type = 'button';
  groupBtn.style.cssText = [
    'height:30px',
    'width:100%',
    'padding:0 10px',
    'border-radius:6px',
    'border:1px solid rgba(143,130,255,0.45)',
    'background:rgba(12,16,24,0.95)',
    'color:#ecefff',
    'font-size:12px',
    'text-align:left',
    'cursor:pointer',
  ].join(';');
  const groupMenu = document.createElement('div');
  groupMenu.style.cssText = [
    'position:absolute',
    'left:0',
    'right:0',
    'top:calc(100% + 4px)',
    'background:rgba(10,14,22,0.98)',
    'border:1px solid rgba(143,130,255,0.45)',
    'border-radius:8px',
    'padding:4px',
    'display:none',
    'z-index:40',
    'box-shadow:0 8px 24px rgba(0,0,0,0.45)',
  ].join(';');
  const groupOptions: Array<{ id: OptimizerCompareFilter; label: string }> = [
    { id: 'all', label: 'All groups' },
    ...COMPARE_GROUP_FILTER_OPTIONS.map((entry) => ({ id: entry.id as OptimizerCompareFilter, label: entry.label })),
  ];
  let open = false;
  const setOpen = (next: boolean): void => {
    open = next;
    groupMenu.style.display = open ? '' : 'none';
    groupBtn.style.borderColor = open ? 'rgba(143,130,255,0.8)' : 'rgba(143,130,255,0.45)';
  };
  const selectedLabel = groupOptions.find((entry) => entry.id === config.selectedStrategy)?.label ?? 'All groups';
  groupBtn.textContent = `${selectedLabel} ▾`;
  groupBtn.addEventListener('click', () => setOpen(!open));
  for (const option of groupOptions) {
    const optionBtn = document.createElement('button');
    optionBtn.type = 'button';
    optionBtn.textContent = option.label;
    optionBtn.style.cssText = [
      'width:100%',
      'padding:6px 8px',
      'border-radius:6px',
      'border:1px solid transparent',
      'background:transparent',
      `color:${option.id === config.selectedStrategy ? '#cfc6ff' : '#e0e0e0'}`,
      'font-size:12px',
      'text-align:left',
      'cursor:pointer',
    ].join(';');
    optionBtn.addEventListener('mouseenter', () => {
      optionBtn.style.background = 'rgba(143,130,255,0.16)';
      optionBtn.style.borderColor = 'rgba(143,130,255,0.35)';
    });
    optionBtn.addEventListener('mouseleave', () => {
      optionBtn.style.background = 'transparent';
      optionBtn.style.borderColor = 'transparent';
    });
    optionBtn.addEventListener('click', () => {
      setOptimizerConfig({ selectedStrategy: option.id });
      groupBtn.textContent = `${option.label} ▾`;
      setOpen(false);
      if (globalState?.currentAnalysis) renderResults(globalState.currentAnalysis);
    });
    groupMenu.appendChild(optionBtn);
  }
  const outsideClick = (event: MouseEvent): void => {
    if (!groupWrap.contains(event.target as Node)) setOpen(false);
  };
  document.addEventListener('mousedown', outsideClick);
  filtersCleanup = () => document.removeEventListener('mousedown', outsideClick);
  groupWrap.append(groupBtn, groupMenu);
  filtersDiv.appendChild(groupWrap);

  const obsoleteCheckbox = document.createElement('input');
  obsoleteCheckbox.type = 'checkbox';
  obsoleteCheckbox.checked = config.showObsoleteOnly;
  obsoleteCheckbox.id = 'obsolete-only-checkbox';
  obsoleteCheckbox.style.cssText = 'cursor: pointer;';
  obsoleteCheckbox.addEventListener('change', () => {
    setOptimizerConfig({ showObsoleteOnly: obsoleteCheckbox.checked });
    if (globalState?.currentAnalysis) renderResults(globalState.currentAnalysis);
  });

  const obsoleteLabel = document.createElement('label');
  obsoleteLabel.htmlFor = 'obsolete-only-checkbox';
  obsoleteLabel.style.cssText = 'font-size:12px; cursor:pointer;';
  obsoleteLabel.textContent = 'Show obsolete only';
  filtersDiv.append(obsoleteCheckbox, obsoleteLabel);

  const top3Checkbox = document.createElement('input');
  top3Checkbox.type = 'checkbox';
  top3Checkbox.checked = config.showTop3Only;
  top3Checkbox.id = 'top3-only-checkbox';
  top3Checkbox.style.cssText = 'cursor: pointer;';
  top3Checkbox.addEventListener('change', () => {
    setOptimizerConfig({ showTop3Only: top3Checkbox.checked });
    if (globalState?.currentAnalysis) renderResults(globalState.currentAnalysis);
  });

  const top3Label = document.createElement('label');
  top3Label.htmlFor = 'top3-only-checkbox';
  top3Label.style.cssText = 'font-size:12px; cursor:pointer;';
  top3Label.textContent = 'Only show top 3';
  filtersDiv.append(top3Checkbox, top3Label);

  // Mutation protection toggle button
  const isProtected = config.mutationProtection !== 'none';
  const mutBtn = document.createElement('button');
  mutBtn.textContent = isProtected ? '🌈 Protect mutations' : '❌ Protect mutations';
  mutBtn.title = isProtected ? 'Rainbow & Gold mutations protected — click to disable' : 'No mutation protection — click to enable';
  mutBtn.style.cssText = [
    'padding:5px 11px',
    'font-size:12px',
    `border:1px solid ${isProtected ? 'rgba(255,152,0,0.5)' : 'rgba(120,120,120,0.4)'}`,
    'border-radius:5px',
    `background:${isProtected ? 'rgba(255,152,0,0.15)' : 'rgba(0,0,0,0.2)'}`,
    `color:${isProtected ? '#FF9800' : '#888'}`,
    'cursor:pointer',
  ].join(';');
  mutBtn.addEventListener('click', () => {
    setOptimizerConfig({ mutationProtection: isProtected ? 'none' : 'both' });
    renderFilters();
    refreshAnalysis(true);
  });
  filtersDiv.appendChild(mutBtn);

  const refreshButton = document.createElement('button');
  refreshButton.textContent = 'Refresh';
  refreshButton.style.cssText = `
    padding: 5px 11px;
    background: rgba(66, 165, 245, 0.15);
    border: 1px solid rgba(66,165,245,0.4);
    border-radius: 5px;
    color: #42A5F5;
    cursor: pointer;
    font-size: 12px;
  `;
  refreshButton.addEventListener('click', () => refreshAnalysis(true));
  filtersDiv.appendChild(refreshButton);

  globalState.filtersContainer.innerHTML = '';
  globalState.filtersContainer.appendChild(filtersDiv);
}

function renderResults(analysis: OptimizerAnalysis): void {
  if (!globalState) return;

  try {
    console.log('[Pet Optimizer] Rendering results...');

    const config = getOptimizerConfig();
    let comparisons = [...analysis.comparisons];

    // Filter by strategy
    if (config.selectedStrategy !== 'all') {
      const strategyPets = analysis.strategyPets.get(config.selectedStrategy);
      comparisons = strategyPets || [];
    }

    // Filter by obsolete only
    if (config.showObsoleteOnly) {
      comparisons = comparisons.filter(c => c.status === 'obsolete');
    }

    // Sort
    comparisons.sort((a, b) => {
      switch (config.sortBy) {
        case 'strength':
          return config.sortDirection === 'desc'
            ? b.pet.strength - a.pet.strength
            : a.pet.strength - b.pet.strength;
        case 'maxStrength': {
          const aMax = a.pet.maxStrength || a.pet.strength;
          const bMax = b.pet.maxStrength || b.pet.strength;
          return config.sortDirection === 'desc' ? bMax - aMax : aMax - bMax;
        }
        case 'score':
          return config.sortDirection === 'desc'
            ? b.score.total - a.score.total
            : a.score.total - b.score.total;
        default:
          return 0;
      }
    });

    // Render
    globalState.resultsContainer.innerHTML = '';

    if (comparisons.length === 0) {
      globalState.resultsContainer.innerHTML = `
        <div style="
          text-align: center;
          padding: 40px;
          color: #aaa;
          font-size: 14px;
        ">
          No pets match the current filters
        </div>
      `;
      return;
    }

    // Group by status
    const byStatus = {
      review: comparisons.filter(c => c.status === 'review'),
      obsolete: comparisons.filter(c => c.status === 'obsolete'),
      upgrade: comparisons.filter(c => c.status === 'upgrade'),
      consider: comparisons.filter(c => c.status === 'consider'),
      keep: comparisons.filter(c => c.status === 'keep'),
    };

    for (const [status, pets] of Object.entries(byStatus)) {
      if (pets.length === 0) continue;
      const section = createStatusSection(status as any, pets, config.showTop3Only);
      globalState.resultsContainer.appendChild(section);
    }

    console.log('[Pet Optimizer] Results rendered');
  } catch (error) {
    console.error('[Pet Optimizer] Error rendering results:', error);
    globalState.resultsContainer.innerHTML = `<div style="color: #f44336;">Error rendering results: ${error instanceof Error ? error.message : 'Unknown'}</div>`;
  }
}


function createStatusSection(
  status: 'review' | 'obsolete' | 'upgrade' | 'consider' | 'keep',
  comparisons: PetComparison[],
  showTop3Only: boolean,
): HTMLElement {
  const statusConfig = {
    review: { icon: '📝', title: 'Review Needed', color: '#FFC107', bgColor: 'rgba(255, 193, 7, 0.1)', desc: 'Contains unknown or unmapped abilities' },
    obsolete: { icon: '❌', title: 'Obsolete Pets', color: '#f44336', bgColor: 'rgba(244, 67, 54, 0.1)', desc: 'Can safely sell these pets' },
    upgrade: { icon: '⬆️', title: 'Upgrade Opportunities', color: '#9C27B0', bgColor: 'rgba(156, 39, 176, 0.1)', desc: 'Higher tier abilities exist' },
    consider: { icon: '💎', title: 'Consider Selling', color: '#FF9800', bgColor: 'rgba(255, 152, 0, 0.1)', desc: 'Has mutations but lower stats' },
    keep: { icon: '✅', title: 'Keep These Pets', color: '#4CAF50', bgColor: 'rgba(76, 175, 80, 0.1)', desc: 'Best in their categories' },
  };

  const config = statusConfig[status];

  const section = document.createElement('div');
  section.style.cssText = `
    margin-bottom: 16px;
    background: ${config.bgColor};
    border-radius: 8px;
    border: 1px solid ${config.color}44;
    overflow: hidden;
  `;

  // Collapsible header
  const header = document.createElement('div');
  header.style.cssText = `
    font-size: 15px;
    font-weight: 600;
    color: ${config.color};
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
    <span style="font-size: 16px; margin-right: 8px;">${config.icon}</span>
    <span>${config.title}</span>
    <span style="
      background: ${config.color}33;
      color: ${config.color};
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      margin-left: 8px;
      font-weight: 700;
    ">${comparisons.length}</span>
    <span style="font-size: 11px; color: #888; font-weight: normal; margin-left: 12px;">${config.desc}</span>
  `;

  const collapseIcon = document.createElement('span');
  collapseIcon.textContent = '▼';
  collapseIcon.style.cssText = 'font-size: 10px; transition: transform 0.3s;';

  header.appendChild(headerLeft);
  header.appendChild(collapseIcon);
  section.appendChild(header);

  // Pets container (collapsible)
  const petsContainer = document.createElement('div');
  petsContainer.style.cssText = 'padding: 12px; display: flex; flex-direction: column; gap: 8px;';

  const familyGroups = sortFamilyGroups(buildFamilyGroups(comparisons));

  for (const family of familyGroups) {
    // Ability-family header
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
    const color = getAbilityColor(family.representativeAbilityName || family.familyLabel);
    abilityHeader.style.borderLeftColor = color.base;

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

    const topCandidates = getTopTeamCandidatesForFamily(family);
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
      abilityHeader.appendChild(createBtn);
    }

    petsContainer.appendChild(abilityHeader);

    // Add pet cards
    const visiblePets = showTop3Only ? family.pets.slice(0, 3) : family.pets;
    for (const entry of visiblePets) {
      const petCard = createPetCard(entry.comparison);
      petsContainer.appendChild(petCard);
    }
  }

  section.appendChild(petsContainer);

  // Collapse toggle
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

function createPetCard(comparison: PetComparison): HTMLElement {
  const { pet, score, status, reason, betterAlternatives, decisionFamilyLabel } = comparison;

  const card = document.createElement('div');
  card.style.cssText = `
    background: linear-gradient(135deg, #1f1f1f, #1a1a1a);
    border-radius: 8px;
    padding: 14px;
    border: 1px solid #333;
    transition: all 0.2s;
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

  const locationIcons: Record<string, string> = {
    active: '🟢',
    inventory: '📦',
    hutch: '🏠',
  };
  const showDecisionFamily = (status === 'obsolete' || status === 'consider') && !!decisionFamilyLabel;
  const betterPetsHeading = decisionFamilyLabel ? `Better ${decisionFamilyLabel} pets` : 'Better pets';

  card.innerHTML = `
    <div style="display: flex; gap: 12px; align-items: start;">
      <!-- Sprite -->
      <div style="flex-shrink: 0;">
        ${sprite ? `
          <div style="position: relative; width: 48px; height: 48px;">
            <img src="${sprite}" alt="${pet.species}" style="
              width: 100%;
              height: 100%;
              object-fit: contain;
              image-rendering: pixelated;
            ">
            ${renderAbilitySquares(pet.abilities, 12, pet.hasRainbow, pet.hasGold, pet.species || undefined)}
          </div>
        ` : ''}
      </div>

      <!-- Info -->
      <div style="flex: 1; min-width: 0;">
        <!-- Name & Location -->
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <div style="font-size: 14px; font-weight: 600; color: #fff;">
            ${pet.name || pet.species}
          </div>
          <div style="font-size: 12px; color: #777;">
            ${locationIcons[pet.location]} ${pet.location}
          </div>
          ${pet.hasRainbow ? '<span style="font-size: 12px;">🌈 Rainbow</span>' : ''}
          ${pet.hasGold ? '<span style="font-size: 12px;">✨ Gold</span>' : ''}
        </div>

        <!-- Species & STR -->
        <div style="font-size: 12px; color: #aaa; margin-bottom: 6px;">
          ${pet.species}${pet.species !== (pet.name || pet.species) ? ` "${pet.name || pet.species}"` : ''}
          • STR ${pet.strength}${pet.maxStrength ? ` / Max ${pet.maxStrength}` : ''}
          ${pet.maxStrength && pet.maxStrength > pet.strength ? ` <span style="color: #4CAF50;">(+${pet.maxStrength - pet.strength} potential)</span>` : ''}
        </div>

        <!-- Abilities -->
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
          ${pet.abilities.map(ability => {
            const normalizedName = normalizeAbilityName(ability);
            const color = getAbilityColor(ability);

            // Apply rainbow or gold gradient to Rainbow Granter/Gold Granter badges
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

        <!-- Reason -->
        <div style="font-size: 12px; color: #ccc; margin-bottom: 8px;">
          ${reason}
        </div>
        ${showDecisionFamily ? `
          <div style="font-size: 11px; color: #7fb3ff; margin-bottom: 8px;">
            Ability family: ${decisionFamilyLabel}
          </div>
        ` : ''}

        <!-- Better alternatives -->
        ${betterAlternatives.length > 0 ? `
          <div style="font-size: 11px; color: #888; margin-top: 8px; padding-top: 8px; border-top: 1px solid #333;">
            ${betterPetsHeading}: ${betterAlternatives.map(p =>
              `${p.name || p.species} (STR ${p.strength}${p.maxStrength ? `/${p.maxStrength}` : ''})`
            ).join(', ')}
          </div>
        ` : ''}
      </div>

      <!-- Score -->
      <div style="flex-shrink: 0; text-align: right;">
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
      </div>
    </div>
  `;

  return card;
}

function renderAbilitySquares(abilities: string[], size: number, hasRainbow: boolean, hasGold: boolean, species?: string): string {
  if (!abilities || abilities.length === 0) return '';

  // Species with wider sprites need more left offset
  const speciesLower = (species || '').toLowerCase();
  const widerSpecies = ['turtle', 'butterfly', 'peacock'];
  const needsExtraOffset = widerSpecies.some(wide => speciesLower.includes(wide));
  const leftOffset = needsExtraOffset ? -16 : -10;

  const squares = abilities.slice(0, 3).map(abilityName => {
    const color = getAbilityColor(abilityName);
    const normalizedName = normalizeAbilityName(abilityName);

    return `
      <div title="${normalizedName}" style="
        width: ${size}px;
        height: ${size}px;
        background: ${color.base};
        border: 1px solid rgba(255,255,255,0.3);
        box-shadow: 0 0 6px ${color.glow};
        border-radius: 2px;
      "></div>
    `;
  }).join('');

  return `
    <div style="
      position: absolute;
      left: ${leftOffset}px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 3px;
      z-index: 2;
    ">${squares}</div>
  `;
}
