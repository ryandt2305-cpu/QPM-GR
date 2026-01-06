// src/ui/petOptimizerWindow.ts
// Pet Optimizer UI - Smart pet management interface

import { toggleWindow } from './modalWindow';
import {
  getOptimizerAnalysis,
  getOptimizerConfig,
  setOptimizerConfig,
  protectPet,
  unprotectPet,
  type PetComparison,
  type OptimizerAnalysis,
  type CollectedPet,
} from '../features/petOptimizer';
import { STRATEGY_DEFINITIONS, type StrategyCategory } from '../data/abilityStrategies';
import { getPetSpriteCanvas, getPetSpriteWithMutations } from '../sprite-v2/compat';
import { getMutationSpriteDataUrl } from '../utils/petMutationRenderer';
import { getAbilityColor, normalizeAbilityName } from '../utils/petCardRenderer';
import { formatCoins } from '../features/valueCalculator';
import { canvasToDataUrl } from '../utils/canvasHelpers';

interface WindowState {
  root: HTMLElement;
  summaryContainer: HTMLElement;
  filtersContainer: HTMLElement;
  resultsContainer: HTMLElement;
  currentAnalysis: OptimizerAnalysis | null;
}

let globalState: WindowState | null = null;

function getPetSpriteUrl(species: string | null | undefined, mutations: string[] = []): string | null {
  const name = (species ?? '').trim();
  if (!name) return null;
  const canvas = mutations.length
    ? getPetSpriteWithMutations(name, mutations)
    : getPetSpriteCanvas(name);
  return canvasToDataUrl(canvas) || null;
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

function renderPetOptimizerWindow(body: HTMLElement): void {
  // Clear any existing content
  body.innerHTML = '';

  const root = document.createElement('div');
  root.style.cssText = `
    color: #fff;
    overflow-y: auto;
    max-height: 100%;
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
  header.style.cssText = 'margin-bottom: 20px;';
  header.innerHTML = `
    <div style="font-size: 20px; font-weight: bold; margin-bottom: 8px;">
      🎯 Pet Optimizer
    </div>
    <div style="font-size: 13px; color: var(--qpm-text-muted, #aaa);">
      Smart analysis of your pet collection to identify obsolete pets, upgrade opportunities, and optimization strategies
    </div>
  `;
  root.appendChild(header);

  // Summary section
  const summaryContainer = document.createElement('div');
  summaryContainer.style.cssText = `
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
    border: 1px solid var(--qpm-border, #444);
  `;
  root.appendChild(summaryContainer);

  // Filters section
  const filtersContainer = document.createElement('div');
  filtersContainer.style.cssText = `
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
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
    console.log('[Pet Optimizer] Rendering summary...');

    const html = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
      <div style="
        background: linear-gradient(135deg, rgba(66, 165, 245, 0.2), rgba(66, 165, 245, 0.05));
        border: 1px solid rgba(66, 165, 245, 0.3);
        border-radius: 8px;
        padding: 12px;
        text-align: center;
      ">
        <div style="font-size: 24px; font-weight: bold; color: #42A5F5;">${analysis.totalPets}</div>
        <div style="font-size: 11px; color: #aaa; margin-top: 4px;">Total Pets</div>
        <div style="font-size: 10px; color: #777; margin-top: 4px;">
          ${analysis.activePets} active • ${analysis.inventoryPets} inv • ${analysis.hutchPets} hutch
        </div>
      </div>

      <div style="
        background: linear-gradient(135deg, rgba(76, 175, 80, 0.2), rgba(76, 175, 80, 0.05));
        border: 1px solid rgba(76, 175, 80, 0.3);
        border-radius: 8px;
        padding: 12px;
        text-align: center;
      ">
        <div style="font-size: 24px; font-weight: bold; color: #4CAF50;">${analysis.keep.length}</div>
        <div style="font-size: 11px; color: #aaa; margin-top: 4px;">Keep</div>
        <div style="font-size: 10px; color: #777; margin-top: 4px;">Best pets in each category</div>
      </div>

      <div style="
        background: linear-gradient(135deg, rgba(255, 152, 0, 0.2), rgba(255, 152, 0, 0.05));
        border: 1px solid rgba(255, 152, 0, 0.3);
        border-radius: 8px;
        padding: 12px;
        text-align: center;
      ">
        <div style="font-size: 24px; font-weight: bold; color: #FF9800;">${analysis.consider.length}</div>
        <div style="font-size: 11px; color: #aaa; margin-top: 4px;">Consider</div>
        <div style="font-size: 10px; color: #777; margin-top: 4px;">Has mutations or potential</div>
      </div>

      <div style="
        background: linear-gradient(135deg, rgba(244, 67, 54, 0.2), rgba(244, 67, 54, 0.05));
        border: 1px solid rgba(244, 67, 54, 0.3);
        border-radius: 8px;
        padding: 12px;
        text-align: center;
      ">
        <div style="font-size: 24px; font-weight: bold; color: #f44336;">${analysis.obsoleteCount}</div>
        <div style="font-size: 11px; color: #aaa; margin-top: 4px;">Obsolete</div>
        <div style="font-size: 10px; color: #777; margin-top: 4px;">Can safely sell</div>
      </div>

      <div style="
        background: linear-gradient(135deg, rgba(156, 39, 176, 0.2), rgba(156, 39, 176, 0.05));
        border: 1px solid rgba(156, 39, 176, 0.3);
        border-radius: 8px;
        padding: 12px;
        text-align: center;
      ">
        <div style="font-size: 24px; font-weight: bold; color: #9C27B0;">${analysis.upgradeCount}</div>
        <div style="font-size: 11px; color: #aaa; margin-top: 4px;">Upgrades Available</div>
        <div style="font-size: 10px; color: #777; margin-top: 4px;">Higher tier exists</div>
      </div>
    </div>
  `;

    globalState.summaryContainer.innerHTML = html;
    console.log('[Pet Optimizer] Summary rendered');
  } catch (error) {
    console.error('[Pet Optimizer] Error rendering summary:', error);
    globalState.summaryContainer.innerHTML = `<div style="color: #f44336;">Error rendering summary: ${error instanceof Error ? error.message : 'Unknown'}</div>`;
  }
}

function renderFilters(): void {
  if (!globalState) return;

  const config = getOptimizerConfig();

  const filtersDiv = document.createElement('div');
  filtersDiv.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

  // Strategy filter
  const strategyRow = document.createElement('div');
  strategyRow.innerHTML = `
    <label style="display: block; font-size: 12px; font-weight: 600; color: #aaa; margin-bottom: 8px;">
      Filter by Strategy
    </label>
  `;

  const strategyButtons = document.createElement('div');
  strategyButtons.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';

  // "All" button
  const allButton = createStrategyButton('all', '🎯 All Pets', config.selectedStrategy === 'all');
  allButton.addEventListener('click', () => {
    setOptimizerConfig({ selectedStrategy: 'all' });
    renderFilters();
    if (globalState?.currentAnalysis) renderResults(globalState.currentAnalysis);
  });
  strategyButtons.appendChild(allButton);

  // Strategy buttons
  for (const strategy of STRATEGY_DEFINITIONS) {
    const button = createStrategyButton(
      strategy.id,
      `${strategy.icon} ${strategy.name}`,
      config.selectedStrategy === strategy.id
    );
    button.addEventListener('click', () => {
      setOptimizerConfig({ selectedStrategy: strategy.id });
      renderFilters();
      if (globalState?.currentAnalysis) renderResults(globalState.currentAnalysis);
    });
    strategyButtons.appendChild(button);
  }

  strategyRow.appendChild(strategyButtons);
  filtersDiv.appendChild(strategyRow);

  // View filter
  const viewRow = document.createElement('div');
  viewRow.style.cssText = 'display: flex; gap: 16px; align-items: center;';

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
  obsoleteLabel.style.cssText = 'font-size: 13px; cursor: pointer;';
  obsoleteLabel.textContent = 'Show obsolete pets only';

  // Species grouping checkbox
  const speciesCheckbox = document.createElement('input');
  speciesCheckbox.type = 'checkbox';
  speciesCheckbox.checked = config.groupBySpecies;
  speciesCheckbox.id = 'group-species-checkbox';
  speciesCheckbox.style.cssText = 'cursor: pointer;';
  speciesCheckbox.addEventListener('change', () => {
    setOptimizerConfig({ groupBySpecies: speciesCheckbox.checked });
    if (globalState?.currentAnalysis) renderResults(globalState.currentAnalysis);
  });

  const speciesLabel = document.createElement('label');
  speciesLabel.htmlFor = 'group-species-checkbox';
  speciesLabel.style.cssText = 'font-size: 13px; cursor: pointer;';
  speciesLabel.textContent = 'Group by species';

  const refreshButton = document.createElement('button');
  refreshButton.textContent = '🔄 Refresh Analysis';
  refreshButton.style.cssText = `
    padding: 6px 12px;
    background: rgba(66, 165, 245, 0.2);
    border: 1px solid #42A5F5;
    border-radius: 4px;
    color: #42A5F5;
    cursor: pointer;
    font-size: 12px;
    margin-left: auto;
  `;
  refreshButton.addEventListener('click', () => refreshAnalysis(true));

  viewRow.appendChild(obsoleteCheckbox);
  viewRow.appendChild(obsoleteLabel);
  viewRow.appendChild(speciesCheckbox);
  viewRow.appendChild(speciesLabel);
  viewRow.appendChild(refreshButton);
  filtersDiv.appendChild(viewRow);

  // === STRICTNESS SETTINGS ===
  const strictnessSection = createStrictnessSettings(config);
  filtersDiv.appendChild(strictnessSection);

  globalState.filtersContainer.innerHTML = '';
  globalState.filtersContainer.appendChild(filtersDiv);
}

function createStrictnessSettings(config: ReturnType<typeof getOptimizerConfig>): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = `
    background: rgba(255, 152, 0, 0.1);
    border: 1px solid rgba(255, 152, 0, 0.3);
    border-radius: 8px;
    padding: 16px;
  `;

  // Header with expand/collapse
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
  `;

  const headerLabel = document.createElement('div');
  headerLabel.style.cssText = 'font-size: 13px; font-weight: 600; color: #FF9800;';
  headerLabel.innerHTML = '⚙️ Strictness Settings <span style="color: #aaa; font-weight: normal; font-size: 11px;">(Click to expand)</span>';

  const expandIcon = document.createElement('span');
  expandIcon.textContent = '▼';
  expandIcon.style.cssText = 'font-size: 10px; color: #FF9800; transition: transform 0.2s;';

  header.appendChild(headerLabel);
  header.appendChild(expandIcon);
  container.appendChild(header);

  // Content (initially collapsed)
  const content = document.createElement('div');
  content.style.cssText = 'display: none; margin-top: 16px; display: flex; flex-direction: column; gap: 16px;';

  // Toggle expand/collapse
  let isExpanded = false;
  header.addEventListener('click', () => {
    isExpanded = !isExpanded;
    content.style.display = isExpanded ? 'flex' : 'none';
    expandIcon.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
  });

  // === Mutation Protection ===
  const mutationRow = document.createElement('div');
  mutationRow.innerHTML = `
    <label style="display: block; font-size: 12px; font-weight: 600; color: #ddd; margin-bottom: 8px;">
      Mutation Protection
    </label>
  `;

  const mutationButtons = document.createElement('div');
  mutationButtons.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

  const mutationOptions = [
    { value: 'both', label: '🌈💛 Protect Both', desc: 'Protect Rainbow & Gold' },
    { value: 'rainbow', label: '🌈 Rainbow Only', desc: 'Only protect Rainbow' },
    { value: 'none', label: '❌ None', desc: 'No mutation protection' },
  ];

  for (const option of mutationOptions) {
    const isActive = config.mutationProtection === option.value;
    const btn = document.createElement('button');
    btn.textContent = option.label;
    btn.title = option.desc;
    btn.style.cssText = `
      padding: 6px 12px;
      border-radius: 4px;
      border: 1px solid ${isActive ? '#FF9800' : '#555'};
      background: ${isActive ? 'rgba(255, 152, 0, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
      color: ${isActive ? '#FF9800' : '#aaa'};
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s;
    `;

    btn.addEventListener('click', () => {
      setOptimizerConfig({ mutationProtection: option.value as any });
      renderFilters();
      refreshAnalysis(true);
    });

    mutationButtons.appendChild(btn);
  }

  mutationRow.appendChild(mutationButtons);
  content.appendChild(mutationRow);

  // === Min Max Strength Slider ===
  const strengthRow = document.createElement('div');
  strengthRow.innerHTML = `
    <label style="display: block; font-size: 12px; font-weight: 600; color: #ddd; margin-bottom: 8px;">
      Min Max Strength: <span id="min-max-str-value" style="color: #FF9800;">${config.minMaxStrength > 0 ? config.minMaxStrength : 'Disabled'}</span>
    </label>
  `;

  const strengthSlider = document.createElement('input');
  strengthSlider.type = 'range';
  strengthSlider.min = '0';
  strengthSlider.max = '100';
  strengthSlider.value = config.minMaxStrength.toString();
  strengthSlider.style.cssText = 'width: 100%; cursor: pointer;';

  strengthSlider.addEventListener('input', () => {
    const value = parseInt(strengthSlider.value);
    const valueSpan = document.getElementById('min-max-str-value');
    if (valueSpan) {
      valueSpan.textContent = value > 0 ? value.toString() : 'Disabled';
    }
  });

  strengthSlider.addEventListener('change', () => {
    const value = parseInt(strengthSlider.value);
    setOptimizerConfig({ minMaxStrength: value });
    refreshAnalysis(true);
  });

  strengthRow.appendChild(strengthSlider);
  content.appendChild(strengthRow);

  // === Min Target Scale Slider ===
  const scaleRow = document.createElement('div');
  scaleRow.innerHTML = `
    <label style="display: block; font-size: 12px; font-weight: 600; color: #ddd; margin-bottom: 8px;">
      Min Target Scale: <span id="min-scale-value" style="color: #FF9800;">${config.minTargetScale.toFixed(2)}</span>
    </label>
  `;

  const scaleSlider = document.createElement('input');
  scaleSlider.type = 'range';
  scaleSlider.min = '100';
  scaleSlider.max = '250';
  scaleSlider.value = (config.minTargetScale * 100).toString();
  scaleSlider.style.cssText = 'width: 100%; cursor: pointer;';

  scaleSlider.addEventListener('input', () => {
    const value = parseInt(scaleSlider.value) / 100;
    const valueSpan = document.getElementById('min-scale-value');
    if (valueSpan) {
      valueSpan.textContent = value.toFixed(2);
    }
  });

  scaleSlider.addEventListener('change', () => {
    const value = parseInt(scaleSlider.value) / 100;
    setOptimizerConfig({ minTargetScale: value });
    refreshAnalysis(true);
  });

  scaleRow.appendChild(scaleSlider);
  content.appendChild(scaleRow);

  // === Min Ability Count ===
  const abilityRow = document.createElement('div');
  abilityRow.innerHTML = `
    <label style="display: block; font-size: 12px; font-weight: 600; color: #ddd; margin-bottom: 8px;">
      Minimum Abilities
    </label>
  `;

  const abilityButtons = document.createElement('div');
  abilityButtons.style.cssText = 'display: flex; gap: 8px;';

  for (const count of [1, 2, 3]) {
    const isActive = config.minAbilityCount === count;
    const btn = document.createElement('button');
    btn.textContent = `${count} ${count === 1 ? 'Ability' : 'Abilities'}`;
    btn.style.cssText = `
      padding: 6px 12px;
      border-radius: 4px;
      border: 1px solid ${isActive ? '#FF9800' : '#555'};
      background: ${isActive ? 'rgba(255, 152, 0, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
      color: ${isActive ? '#FF9800' : '#aaa'};
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s;
    `;

    btn.addEventListener('click', () => {
      setOptimizerConfig({ minAbilityCount: count as 1 | 2 | 3 });
      renderFilters();
      refreshAnalysis(true);
    });

    abilityButtons.appendChild(btn);
  }

  abilityRow.appendChild(abilityButtons);
  content.appendChild(abilityRow);

  // === Advanced Checkboxes ===
  const advancedRow = document.createElement('div');
  advancedRow.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

  // Only Rare+ checkbox
  const rarePlusContainer = createCheckbox(
    'only-rare-plus',
    '🌟 Only keep Rare/Legendary/Mythical species',
    config.onlyRarePlus,
    (checked) => {
      setOptimizerConfig({ onlyRarePlus: checked });
      refreshAnalysis(true);
    }
  );
  advancedRow.appendChild(rarePlusContainer);

  // Low-value abilities checkbox
  const lowValueContainer = createCheckbox(
    'mark-low-value',
    '⬇️ Mark pets with only low-value abilities as obsolete',
    config.markLowValueAbilities,
    (checked) => {
      setOptimizerConfig({ markLowValueAbilities: checked });
      refreshAnalysis(true);
    }
  );
  advancedRow.appendChild(lowValueContainer);

  // Prioritize active pets checkbox
  const activePetsContainer = createCheckbox(
    'prioritize-active',
    '⭐ Prioritize currently active pets',
    config.prioritizeActivePets,
    (checked) => {
      setOptimizerConfig({ prioritizeActivePets: checked });
      refreshAnalysis(true);
    }
  );
  advancedRow.appendChild(activePetsContainer);

  content.appendChild(advancedRow);

  // Reset button
  const resetButton = document.createElement('button');
  resetButton.textContent = '🔄 Reset to Defaults';
  resetButton.style.cssText = `
    padding: 8px 16px;
    background: rgba(244, 67, 54, 0.2);
    border: 1px solid #f44336;
    border-radius: 4px;
    color: #f44336;
    cursor: pointer;
    font-size: 12px;
    margin-top: 8px;
  `;

  resetButton.addEventListener('click', () => {
    setOptimizerConfig({
      mutationProtection: 'both',
      minMaxStrength: 0,
      minTargetScale: 1.0,
      minAbilityCount: 1,
      onlyRarePlus: false,
      markLowValueAbilities: false,
      prioritizeActivePets: true,
    });
    renderFilters();
    refreshAnalysis(true);
  });

  content.appendChild(resetButton);
  container.appendChild(content);

  return container;
}

function createCheckbox(
  id: string,
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void
): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = 'display: flex; align-items: center; gap: 8px;';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = id;
  checkbox.checked = checked;
  checkbox.style.cssText = 'cursor: pointer;';
  checkbox.addEventListener('change', () => onChange(checkbox.checked));

  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.style.cssText = 'font-size: 12px; cursor: pointer; color: #ccc;';
  labelEl.textContent = label;

  container.appendChild(checkbox);
  container.appendChild(labelEl);

  return container;
}

function createStrategyButton(id: string, label: string, isActive: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  button.style.cssText = `
    padding: 8px 16px;
    border-radius: 6px;
    border: 2px solid ${isActive ? '#42A5F5' : '#444'};
    background: ${isActive ? 'rgba(66, 165, 245, 0.2)' : 'rgba(0, 0, 0, 0.3)'};
    color: ${isActive ? '#42A5F5' : '#aaa'};
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.2s;
  `;

  button.addEventListener('mouseenter', () => {
    if (!isActive) {
      button.style.background = 'rgba(66, 165, 245, 0.1)';
      button.style.borderColor = '#555';
    }
  });

  button.addEventListener('mouseleave', () => {
    if (!isActive) {
      button.style.background = 'rgba(0, 0, 0, 0.3)';
      button.style.borderColor = '#444';
    }
  });

  return button;
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

  // Add Top 3 per Ability section
  const top3Section = createTop3PerAbilitySection(comparisons);
  if (top3Section) {
    globalState.resultsContainer.appendChild(top3Section);
  }

  // Group by status
  const byStatus = {
    obsolete: comparisons.filter(c => c.status === 'obsolete'),
    upgrade: comparisons.filter(c => c.status === 'upgrade'),
    consider: comparisons.filter(c => c.status === 'consider'),
    keep: comparisons.filter(c => c.status === 'keep'),
  };

  for (const [status, pets] of Object.entries(byStatus)) {
    if (pets.length === 0) continue;

      const section = createStatusSection(status as any, pets);
      globalState.resultsContainer.appendChild(section);
    }

    console.log('[Pet Optimizer] Results rendered');
  } catch (error) {
    console.error('[Pet Optimizer] Error rendering results:', error);
    globalState.resultsContainer.innerHTML = `<div style="color: #f44336;">Error rendering results: ${error instanceof Error ? error.message : 'Unknown'}</div>`;
  }
}

function createTop3PerAbilitySection(comparisons: PetComparison[]): HTMLElement | null {
  if (comparisons.length === 0) return null;

  // Group pets by each ability they have
  const byAbility = new Map<string, CollectedPet[]>();

  for (const comparison of comparisons) {
    for (const ability of comparison.pet.abilities) {
      if (!byAbility.has(ability)) {
        byAbility.set(ability, []);
      }
      // Avoid duplicates
      if (!byAbility.get(ability)!.some(p => p.id === comparison.pet.id)) {
        byAbility.get(ability)!.push(comparison.pet);
      }
    }
  }

  // Sort each ability's pets and take top 3
  const top3ByAbility = new Map<string, CollectedPet[]>();
  for (const [ability, pets] of byAbility.entries()) {
    const sorted = [...pets].sort((a, b) => {
      // Sort by mutation first (rainbow > gold > none)
      const aMutScore = a.hasRainbow ? 3 : a.hasGold ? 2 : 1;
      const bMutScore = b.hasRainbow ? 3 : b.hasGold ? 2 : 1;
      if (bMutScore !== aMutScore) return bMutScore - aMutScore;

      // Then by max STR
      const aMaxStr = a.maxStrength || a.strength;
      const bMaxStr = b.maxStrength || b.strength;
      if (bMaxStr !== aMaxStr) return bMaxStr - aMaxStr;

      // Finally by current STR
      return b.strength - a.strength;
    });

    top3ByAbility.set(ability, sorted.slice(0, 3));
  }

  // Sort abilities by tier (highest first), then alphabetically
  const sortedAbilities = Array.from(top3ByAbility.entries()).sort((a, b) => {
    const aTier = a[0].match(/(I{1,3}|IV)$/)?.[1];
    const bTier = b[0].match(/(I{1,3}|IV)$/)?.[1];

    if (aTier && bTier) {
      const tierOrder: Record<string, number> = { 'IV': 4, 'III': 3, 'II': 2, 'I': 1 };
      const aBase = a[0].replace(/(I{1,3}|IV)$/, '');
      const bBase = b[0].replace(/(I{1,3}|IV)$/, '');

      if (aBase === bBase) {
        // Same base ability, sort by tier (highest first)
        const bValue = tierOrder[bTier];
        const aValue = tierOrder[aTier];
        if (bValue !== undefined && aValue !== undefined) {
          return bValue - aValue;
        }
      }
    }

    // Different abilities, sort alphabetically
    return a[0].localeCompare(b[0]);
  });

  // Create section
  const section = document.createElement('div');
  section.style.cssText = `
    margin-bottom: 20px;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 215, 0, 0.05));
    border-radius: 8px;
    border: 1px solid rgba(255, 215, 0, 0.4);
    overflow: hidden;
  `;

  // State for filtering
  let selectedAbilityFilter = 'all';

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    font-size: 15px;
    font-weight: 600;
    color: #FFD700;
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
  headerLeft.style.cssText = 'display: flex; align-items: center;';
  headerLeft.innerHTML = `
    <span style="font-size: 16px; margin-right: 8px;">🏆</span>
    <span>Top 3 Pets Per Ability</span>
    <span style="
      background: rgba(255, 215, 0, 0.3);
      color: #FFD700;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      margin-left: 8px;
      font-weight: 700;
    ">${sortedAbilities.length} abilities</span>
    <span style="font-size: 11px; color: #888; font-weight: normal; margin-left: 12px;">Best pets for each ability</span>
  `;

  const collapseIcon = document.createElement('span');
  collapseIcon.textContent = '▼';
  collapseIcon.style.cssText = 'font-size: 10px; transition: transform 0.3s; transform: rotate(-90deg);';

  header.appendChild(headerLeft);
  header.appendChild(collapseIcon);
  section.appendChild(header);

  // Filter bar
  const filterBar = document.createElement('div');
  filterBar.style.cssText = `
    padding: 12px 16px;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 215, 0, 0.2);
    display: none;
  `;

  const filterLabel = document.createElement('label');
  filterLabel.style.cssText = 'font-size: 12px; color: #aaa; margin-right: 8px;';
  filterLabel.textContent = 'Filter by Ability:';

  const filterSelect = document.createElement('select');
  filterSelect.style.cssText = `
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid #FFD700;
    border-radius: 4px;
    color: #FFD700;
    font-size: 12px;
    cursor: pointer;
  `;

  // Add "All" option
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'All Abilities';
  filterSelect.appendChild(allOption);

  // Add ability options
  for (const [ability] of sortedAbilities) {
    const option = document.createElement('option');
    option.value = ability;
    option.textContent = ability;
    filterSelect.appendChild(option);
  }

  filterBar.appendChild(filterLabel);
  filterBar.appendChild(filterSelect);
  section.appendChild(filterBar);

  // Content container
  const contentContainer = document.createElement('div');
  contentContainer.style.cssText = 'padding: 12px; display: none;';

  // Function to render filtered abilities
  const renderFilteredAbilities = (filter: string) => {
    contentContainer.innerHTML = '';
    const filteredAbilities = filter === 'all'
      ? sortedAbilities
      : sortedAbilities.filter(([ability]) => ability === filter);

    for (const [ability, pets] of filteredAbilities) {
      // Ability header
      const abilityHeader = document.createElement('div');
      abilityHeader.style.cssText = `
        font-size: 13px;
        font-weight: 600;
        color: #FFD700;
        margin-top: 12px;
        margin-bottom: 8px;
        padding: 6px 10px;
        background: rgba(255, 215, 0, 0.15);
        border-radius: 4px;
        border-left: 3px solid #FFD700;
      `;
      const color = getAbilityColor(ability);
      abilityHeader.style.borderLeftColor = color.base;
      abilityHeader.style.color = color.text;
      abilityHeader.textContent = normalizeAbilityName(ability);
      contentContainer.appendChild(abilityHeader);

      // Pet cards in a compact format
      const petsGrid = document.createElement('div');
      petsGrid.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

      for (const pet of pets) {
        const petCard = createCompactPetCard(pet);
        petsGrid.appendChild(petCard);
      }

      contentContainer.appendChild(petsGrid);
    }
  };

  // Initial render
  renderFilteredAbilities('all');

  // Filter change handler
  filterSelect.addEventListener('change', (e) => {
    selectedAbilityFilter = (e.target as HTMLSelectElement).value;
    renderFilteredAbilities(selectedAbilityFilter);
  });

  section.appendChild(contentContainer);

  // Collapse toggle - default collapsed
  let isCollapsed = true;
  header.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    contentContainer.style.display = isCollapsed ? 'none' : 'block';
    filterBar.style.display = isCollapsed ? 'none' : 'block';
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

function createCompactPetCard(pet: CollectedPet): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = `
    background: linear-gradient(135deg, #1f1f1f, #1a1a1a);
    border-radius: 6px;
    padding: 8px 12px;
    border: 1px solid #333;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 10px;
  `;

  card.addEventListener('mouseenter', () => {
    card.style.borderColor = '#555';
    card.style.transform = 'translateX(4px)';
  });

  card.addEventListener('mouseleave', () => {
    card.style.borderColor = '#333';
    card.style.transform = 'translateX(0)';
  });

  // Get sprite
  let sprite = getPetSpriteUrl(pet.species?.toLowerCase() || '');
  if (pet.hasRainbow) {
    const mutSprite = getMutationSpriteDataUrl(pet.species?.toLowerCase() || '', 'rainbow');
    sprite = mutSprite ?? getPetSpriteUrl(pet.species?.toLowerCase() || '', ['Rainbow']);
  } else if (pet.hasGold) {
    const mutSprite = getMutationSpriteDataUrl(pet.species?.toLowerCase() || '', 'gold');
    sprite = mutSprite ?? getPetSpriteUrl(pet.species?.toLowerCase() || '', ['Gold']);
  }

  const locationIcons: Record<string, string> = {
    active: '🟢',
    inventory: '📦',
    hutch: '🏠',
  };

  card.innerHTML = `
    <div style="flex-shrink: 0; position: relative;">
      ${sprite ? `
        <img src="${sprite}" alt="${pet.species}" style="
          width: 32px;
          height: 32px;
          object-fit: contain;
          image-rendering: pixelated;
        ">
        ${renderAbilitySquares(pet.abilities, 10, pet.hasRainbow, pet.hasGold, pet.species || undefined)}
      ` : ''}
    </div>
    <div style="flex: 1; min-width: 0;">
      <div style="font-size: 12px; font-weight: 600; color: #fff; margin-bottom: 2px;">
        ${pet.name || pet.species}
        ${pet.hasRainbow ? ' 🌈' : pet.hasGold ? ' ✨' : ''}
      </div>
      <div style="font-size: 11px; color: #aaa;">
        ${pet.species} • STR ${pet.strength}${pet.maxStrength ? ` / ${pet.maxStrength}` : ''} • ${locationIcons[pet.location]} ${pet.location}
      </div>
    </div>
  `;

  return card;
}

function createStatusSection(status: 'obsolete' | 'upgrade' | 'consider' | 'keep', comparisons: PetComparison[]): HTMLElement {
  const statusConfig = {
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

  // Check if species grouping is enabled
  const optimizerConfig = getOptimizerConfig();
  const groupBySpecies = optimizerConfig.groupBySpecies;

  if (groupBySpecies) {
    // Group by species for better organization
    const bySpecies = new Map<string, PetComparison[]>();
    for (const comparison of comparisons) {
      const species = comparison.pet.species || 'Unknown';
      if (!bySpecies.has(species)) {
        bySpecies.set(species, []);
      }
      bySpecies.get(species)!.push(comparison);
    }

    // Sort species by count (most pets first)
    const sortedSpecies = Array.from(bySpecies.entries()).sort((a, b) => b[1].length - a[1].length);

    for (const [species, pets] of sortedSpecies) {
      // Species header (only show if multiple species)
      if (sortedSpecies.length > 1) {
        const speciesHeader = document.createElement('div');
        speciesHeader.style.cssText = `
          font-size: 12px;
          font-weight: 600;
          color: #aaa;
          margin-top: 8px;
          margin-bottom: 4px;
          padding-bottom: 4px;
          border-bottom: 1px solid #333;
        `;
        speciesHeader.textContent = `${species} (${pets.length})`;
        petsContainer.appendChild(speciesHeader);
      }

      // Add pet cards
      for (const comparison of pets) {
        const petCard = createPetCard(comparison);
        petsContainer.appendChild(petCard);
      }
    }
  } else {
    // Group by ability (and tier)
    const byAbility = new Map<string, PetComparison[]>();
    const seenPets = new Set<string>(); // Track pets to avoid duplicates

    for (const comparison of comparisons) {
      // Each pet appears in groups for each of its abilities
      for (const ability of comparison.pet.abilities) {
        if (!byAbility.has(ability)) {
          byAbility.set(ability, []);
        }
        const petKey = `${ability}:${comparison.pet.id}`;
        if (!seenPets.has(petKey)) {
          byAbility.get(ability)!.push(comparison);
          seenPets.add(petKey);
        }
      }
    }

    // Sort abilities by tier (highest first), then alphabetically
    const sortedAbilities = Array.from(byAbility.entries()).sort((a, b) => {
      const aTier = a[0].match(/(I{1,3}|IV)$/)?.[1];
      const bTier = b[0].match(/(I{1,3}|IV)$/)?.[1];

      if (aTier && bTier) {
        const tierOrder: Record<string, number> = { 'IV': 4, 'III': 3, 'II': 2, 'I': 1 };
        const aBase = a[0].replace(/(I{1,3}|IV)$/, '');
        const bBase = b[0].replace(/(I{1,3}|IV)$/, '');

        if (aBase === bBase) {
          // Same base ability, sort by tier (highest first)
          const bValue = tierOrder[bTier];
          const aValue = tierOrder[aTier];
          if (bValue !== undefined && aValue !== undefined) {
            return bValue - aValue;
          }
        }
      }

      // Different abilities, sort alphabetically
      return a[0].localeCompare(b[0]);
    });

    for (const [ability, pets] of sortedAbilities) {
      // Ability header
      const abilityHeader = document.createElement('div');
      abilityHeader.style.cssText = `
        font-size: 12px;
        font-weight: 600;
        color: #aaa;
        margin-top: 8px;
        margin-bottom: 4px;
        padding: 6px 10px;
        background: rgba(66, 165, 245, 0.1);
        border-radius: 4px;
        border-left: 3px solid #42A5F5;
      `;
      const color = getAbilityColor(ability);
      abilityHeader.style.borderLeftColor = color.base;
      abilityHeader.textContent = `${normalizeAbilityName(ability)} (${pets.length} pet${pets.length > 1 ? 's' : ''})`;
      petsContainer.appendChild(abilityHeader);

      // Add pet cards
      for (const comparison of pets) {
        const petCard = createPetCard(comparison);
        petsContainer.appendChild(petCard);
      }
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
  const { pet, score, status, reason, betterAlternatives } = comparison;

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

  // Get sprite with mutation support
  let sprite = getPetSpriteUrl(pet.species?.toLowerCase() || '');
  if (pet.hasRainbow) {
    const mutSprite = getMutationSpriteDataUrl(pet.species?.toLowerCase() || '', 'rainbow');
    sprite = mutSprite ?? getPetSpriteUrl(pet.species?.toLowerCase() || '', ['Rainbow']);
  } else if (pet.hasGold) {
    const mutSprite = getMutationSpriteDataUrl(pet.species?.toLowerCase() || '', 'gold');
    sprite = mutSprite ?? getPetSpriteUrl(pet.species?.toLowerCase() || '', ['Gold']);
  }

  const locationIcons: Record<string, string> = {
    active: '🟢',
    inventory: '📦',
    hutch: '🏠',
  };

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

        <!-- Better alternatives -->
        ${betterAlternatives.length > 0 ? `
          <div style="font-size: 11px; color: #888; margin-top: 8px; padding-top: 8px; border-top: 1px solid #333;">
            Better pets: ${betterAlternatives.map(p =>
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
