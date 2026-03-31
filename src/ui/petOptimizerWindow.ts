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
  type CollectedPet,
} from '../features/petOptimizer';
import { COMPARE_GROUP_FILTER_OPTIONS } from '../data/petCompareRules';
import { createTeam, setTeamSlot } from '../store/petTeams';
import { getPetSpriteDataUrlWithMutations, isSpritesReady } from '../sprite-v2/compat';
import { getAbilityColor, normalizeAbilityName } from '../utils/petCardRenderer';
import { formatCoins } from '../features/valueCalculator';
import { getAbilityFamilyKey } from '../features/petCompareEngine';
import { executeSellPipeline } from '../features/petSell';

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

    const headerBtnGroup = document.createElement('div');
    headerBtnGroup.style.cssText = 'display:flex;gap:6px;align-items:center;';

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
      headerBtnGroup.appendChild(createBtn);
    }

    // Family sell button
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
        showFamilySellModal(family.familyLabel, family.pets);
      });
      headerBtnGroup.appendChild(familySellBtn);
    }

    abilityHeader.appendChild(headerBtnGroup);

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
      <div style="flex-shrink: 0; text-align: right; margin-right: 30px;">
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

  // Sell button (top-right corner)
  appendSellButton(card, comparison);

  return card;
}

// ────────────────────────────────────────────
// Shared sell confirmation modal
// ────────────────────────────────────────────
// Matches the showProtectionConfirmModal pattern from sellAllPets.ts.

const SELL_CONFIRM_MODAL_ID = 'qpm-optimizer-sell-confirm';

interface SellModalPetEntry {
  pet: CollectedPet;
  status: string;
  checked: boolean;
  showCheckbox: boolean;
}

/**
 * Show a confirmation modal for selling one or more pets.
 * Returns a promise that resolves to the list of confirmed pets, or null if cancelled.
 */
function showSellConfirmModal(
  titleText: string,
  descText: string,
  petEntries: SellModalPetEntry[],
): Promise<CollectedPet[] | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }

    const existing = document.getElementById(SELL_CONFIRM_MODAL_ID);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = SELL_CONFIRM_MODAL_ID;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.62);';

    const card = document.createElement('div');
    card.style.cssText = 'min-width:340px;max-width:580px;max-height:min(80vh,720px);background:#0f1318;color:#ffffff;border:1px solid rgba(255,255,255,0.16);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.45);padding:18px 20px;display:grid;gap:12px;';

    const title = document.createElement('div');
    title.textContent = titleText;
    title.style.cssText = 'font-size:18px;font-weight:800;';

    const desc = document.createElement('div');
    desc.textContent = descText;
    desc.style.cssText = 'font-size:13px;opacity:0.92;line-height:1.4;';

    // Pet list
    const list = document.createElement('div');
    list.style.cssText = 'display:grid;gap:6px;max-height:400px;overflow-y:auto;padding-right:4px;';

    interface RowEntry { checkbox: HTMLInputElement | null; pet: CollectedPet }
    const rowEntries: RowEntry[] = [];

    for (const entry of petEntries) {
      const { pet, status, checked, showCheckbox } = entry;

      const row = document.createElement('label');
      row.style.cssText = [
        'display:grid',
        showCheckbox ? 'grid-template-columns:24px 42px 1fr auto' : 'grid-template-columns:42px 1fr auto',
        'gap:10px',
        'align-items:center',
        'padding:6px 8px',
        'border:1px solid rgba(255,255,255,0.08)',
        'border-radius:10px',
        'background:rgba(255,255,255,0.03)',
        'cursor:pointer',
      ].join(';');

      let checkbox: HTMLInputElement | null = null;
      if (showCheckbox) {
        checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        checkbox.style.cssText = 'cursor:pointer;width:16px;height:16px;';
        row.appendChild(checkbox);
      }

      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = 'width:42px;height:42px;border-radius:10px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;overflow:hidden;';
      try {
        const spriteUrl = getPetSprite(pet.species, pet.hasRainbow, pet.hasGold);
        if (spriteUrl) {
          const img = document.createElement('img');
          img.src = spriteUrl;
          img.alt = pet.species ?? 'Pet';
          img.style.cssText = 'width:42px;height:42px;image-rendering:pixelated;object-fit:contain;';
          iconWrap.appendChild(img);
        }
      } catch {
        // fallback — leave empty
      }

      const info = document.createElement('div');
      info.style.cssText = 'display:grid;gap:2px;min-width:0;';

      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'font-size:13px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      nameEl.textContent = pet.name || pet.species || 'Pet';

      const meta = document.createElement('div');
      meta.style.cssText = 'font-size:11px;color:#aaa;';
      meta.textContent = `${pet.species ?? '?'} • STR ${pet.strength}${pet.maxStrength ? `/${pet.maxStrength}` : ''} • ${pet.location}`;

      info.append(nameEl, meta);

      // Status badge
      const badgeStyle = getStatusBadgeStyle(status);
      const badge = document.createElement('span');
      badge.textContent = status;
      badge.style.cssText = `font-size:10px;padding:2px 8px;border-radius:999px;${badgeStyle};font-weight:600;text-transform:capitalize;white-space:nowrap;`;

      row.append(iconWrap, info, badge);
      list.appendChild(row);
      rowEntries.push({ checkbox, pet });
    }

    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';

    const hasCheckboxes = petEntries.some((e) => e.showCheckbox);

    const selectInfo = document.createElement('span');
    selectInfo.style.cssText = 'font-size:12px;color:#888;';

    const sellBtn = document.createElement('button');
    sellBtn.type = 'button';
    sellBtn.style.cssText = 'padding:8px 14px;border-radius:10px;border:1px solid rgba(122,162,255,0.7);background:#1a2644;color:#ffffff;cursor:pointer;font-weight:700;font-size:13px;transition:opacity 0.15s;';

    const updateCounts = (): void => {
      if (hasCheckboxes) {
        const count = rowEntries.filter((e) => e.checkbox?.checked).length;
        selectInfo.textContent = `${count} selected`;
        sellBtn.textContent = `Sell Selected (${count})`;
        sellBtn.disabled = count === 0;
        sellBtn.style.opacity = count === 0 ? '0.4' : '1';
      } else {
        sellBtn.textContent = 'Sell';
        selectInfo.textContent = '';
      }
    };
    updateCounts();

    if (hasCheckboxes) {
      list.addEventListener('change', updateCounts);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#ffffff;cursor:pointer;font-size:13px;';

    let settled = false;
    const close = (result: CollectedPet[] | null): void => {
      if (settled) return;
      settled = true;
      try { overlay.remove(); } catch { /* */ }
      document.removeEventListener('keydown', onKeyDown, true);
      resolve(result);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); close(null); }
    };

    cancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });

    sellBtn.addEventListener('click', () => {
      if (hasCheckboxes) {
        const selected = rowEntries
          .filter((e) => e.checkbox?.checked)
          .map((e) => e.pet);
        close(selected.length > 0 ? selected : null);
      } else {
        close(rowEntries.map((e) => e.pet));
      }
    });

    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'display:flex;gap:8px;';
    btnWrap.append(cancelBtn, sellBtn);
    actions.append(selectInfo, btnWrap);

    card.append(title, desc, list, actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown, true);
    sellBtn.focus();
  });
}

function getStatusBadgeStyle(status: string): string {
  const styles: Record<string, string> = {
    keep: 'border:1px solid rgba(76,175,80,0.4);background:rgba(76,175,80,0.15);color:#8ed89a',
    consider: 'border:1px solid rgba(255,152,0,0.4);background:rgba(255,152,0,0.15);color:#ffc173',
    obsolete: 'border:1px solid rgba(244,67,54,0.4);background:rgba(244,67,54,0.15);color:#ff9e95',
    upgrade: 'border:1px solid rgba(156,39,176,0.4);background:rgba(156,39,176,0.15);color:#dda4f0',
    review: 'border:1px solid rgba(255,193,7,0.4);background:rgba(255,193,7,0.15);color:#ffe08a',
  };
  const fallback = 'border:1px solid rgba(255,193,7,0.4);background:rgba(255,193,7,0.15);color:#ffe08a';
  return styles[status] ?? fallback;
}

// ────────────────────────────────────────────
// Per-card sell button
// ────────────────────────────────────────────

function appendSellButton(card: HTMLElement, comparison: PetComparison): void {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = 'Sell this pet';
  btn.textContent = '💰';
  btn.style.cssText = [
    'position:absolute',
    'top:8px',
    'right:8px',
    'width:26px',
    'height:26px',
    'border-radius:6px',
    'border:1px solid rgba(255,255,255,0.12)',
    'background:rgba(0,0,0,0.3)',
    'color:#ccc',
    'font-size:13px',
    'cursor:pointer',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:0',
    'opacity:0.5',
    'transition:opacity 0.15s, background 0.15s',
    'z-index:5',
    'line-height:1',
  ].join(';');

  btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
  btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.5'; });

  btn.addEventListener('click', (event) => {
    event.stopPropagation();

    const pet = comparison.pet;
    showSellConfirmModal(
      'Confirm Sell',
      `Are you sure you want to sell this pet?`,
      [{ pet, status: comparison.status, checked: true, showCheckbox: false }],
    ).then((confirmed) => {
      if (!confirmed || confirmed.length === 0) return;
      executeSellWithFeedback(card, btn, pet);
    });
  });

  card.appendChild(btn);
}

function executeSellWithFeedback(card: HTMLElement, btn: HTMLElement, pet: CollectedPet): void {
  btn.textContent = '⏳';
  btn.title = 'Selling...';
  btn.style.opacity = '1';
  (btn as HTMLButtonElement).style.pointerEvents = 'none';

  executeSellPipeline(pet).then((result) => {
    if (result.ok) {
      card.style.transition = 'opacity 0.4s, max-height 0.4s, margin 0.4s, padding 0.4s';
      card.style.opacity = '0';
      card.style.maxHeight = '0';
      card.style.margin = '0';
      card.style.padding = '0';
      card.style.overflow = 'hidden';
      setTimeout(() => card.remove(), 450);
    } else {
      btn.textContent = '⚠️';
      btn.title = `Failed: ${result.reason ?? 'Unknown'}`;
      btn.style.background = 'rgba(244,67,54,0.3)';
      btn.style.borderColor = 'rgba(244,67,54,0.5)';
      btn.style.opacity = '1';
      (btn as HTMLButtonElement).style.pointerEvents = 'auto';
      setTimeout(() => {
        btn.textContent = '💰';
        btn.title = 'Sell this pet';
        btn.style.background = 'rgba(0,0,0,0.3)';
        btn.style.borderColor = 'rgba(255,255,255,0.12)';
        btn.style.opacity = '0.5';
      }, 4000);
    }
  }).catch(() => {
    btn.textContent = '⚠️';
    btn.style.opacity = '1';
    (btn as HTMLButtonElement).style.pointerEvents = 'auto';
  });
}

// ────────────────────────────────────────────
// Family bulk sell
// ────────────────────────────────────────────

function showFamilySellModal(familyLabel: string, pets: FamilyPetEntry[]): void {
  const petEntries: SellModalPetEntry[] = pets.map((entry) => ({
    pet: entry.comparison.pet,
    status: entry.comparison.status,
    checked: entry.comparison.status === 'obsolete' || entry.comparison.status === 'consider',
    showCheckbox: true,
  }));

  showSellConfirmModal(
    `Sell ${familyLabel} Pets`,
    'Select which pets to sell:',
    petEntries,
  ).then((confirmed) => {
    if (!confirmed || confirmed.length === 0) return;
    executeBulkSell(confirmed);
  });
}

function executeBulkSell(pets: CollectedPet[]): void {
  // Show a progress modal during the sell
  const existing = document.getElementById(SELL_CONFIRM_MODAL_ID);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = SELL_CONFIRM_MODAL_ID;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.62);';

  const card = document.createElement('div');
  card.style.cssText = 'min-width:300px;max-width:420px;background:#0f1318;color:#ffffff;border:1px solid rgba(255,255,255,0.16);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.45);padding:24px;display:grid;gap:16px;text-align:center;';

  const title = document.createElement('div');
  title.textContent = 'Selling pets...';
  title.style.cssText = 'font-size:18px;font-weight:800;';

  const progressText = document.createElement('div');
  progressText.style.cssText = 'font-size:14px;color:#42A5F5;font-weight:600;';
  progressText.textContent = `0 / ${pets.length}`;

  const progressBar = document.createElement('div');
  progressBar.style.cssText = 'height:6px;border-radius:3px;background:rgba(255,255,255,0.1);overflow:hidden;';
  const progressFill = document.createElement('div');
  progressFill.style.cssText = 'height:100%;border-radius:3px;background:#42A5F5;transition:width 0.2s;width:0%;';
  progressBar.appendChild(progressFill);

  card.append(title, progressText, progressBar);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  let soldCount = 0;
  let failCount = 0;

  (async () => {
    for (let i = 0; i < pets.length; i += 1) {
      const pet = pets[i];
      if (!pet) continue;
      progressText.textContent = `${i + 1} / ${pets.length}`;
      progressFill.style.width = `${((i + 1) / pets.length) * 100}%`;

      const result = await executeSellPipeline(pet);
      if (result.ok) {
        soldCount += 1;
      } else {
        failCount += 1;
        console.warn(`[Pet Optimizer] Failed to sell ${pet.name || pet.species}: ${result.reason}`);
      }
    }

    // Done
    progressFill.style.width = '100%';
    if (failCount === 0) {
      title.textContent = 'Done!';
      progressText.textContent = `Sold ${soldCount} pet${soldCount !== 1 ? 's' : ''}`;
      progressText.style.color = '#4CAF50';
      progressFill.style.background = '#4CAF50';
    } else {
      title.textContent = 'Completed';
      progressText.textContent = `Sold ${soldCount}, ${failCount} failed`;
      progressText.style.color = '#FF9800';
      progressFill.style.background = '#FF9800';
    }

    setTimeout(() => {
      overlay.remove();
      refreshAnalysis(true);
    }, 1500);
  })();
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
