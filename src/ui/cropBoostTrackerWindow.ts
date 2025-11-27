/**
 * Crop Size Boost Tracker Window
 * User-configurable, visually appealing tracker for crop size boost progress
 */

import { toggleWindow } from './modalWindow';
import {
  getCurrentAnalysis,
  getConfig,
  setConfig,
  setEstimateMode,
  manualRefresh,
  onAnalysisChange,
  formatTimeEstimate,
  type TrackerAnalysis,
  type CropSizeInfo,
  type BoostPetInfo,
  type EstimateMode,
} from '../features/cropBoostTracker';
import { log } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

interface WindowState {
  root: HTMLElement | null;
  currentTab: 'summary' | 'crops';
  sortBy: 'size' | 'boosts' | 'eta' | 'species';
  sortOrder: 'asc' | 'desc';
  selectedCrop: string | null; // key: `${tileKey}-${slotIndex}`
  updateInterval: number | null;
}

// ============================================================================
// State
// ============================================================================

const state: WindowState = {
  root: null,
  currentTab: 'summary',
  sortBy: 'size',
  sortOrder: 'asc',
  selectedCrop: null,
  updateInterval: null,
};

// ============================================================================
// Styling
// ============================================================================

const STYLES = {
  container: `
    padding: 0;
    color: var(--qpm-text, #fff);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    max-height: 70vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `,

  header: `
    background: linear-gradient(135deg, #2d5016 0%, #3d6b1f 100%);
    padding: 16px 20px;
    border-bottom: 2px solid #4CAF50;
  `,

  headerTitle: `
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 12px 0;
    display: flex;
    align-items: center;
    gap: 8px;
  `,

  controls: `
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  `,

  label: `
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
  `,

  select: `
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  `,

  button: `
    padding: 6px 14px;
    background: rgba(76, 175, 80, 0.2);
    border: 1px solid #4CAF50;
    border-radius: 4px;
    color: #4CAF50;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `,

  tabContainer: `
    display: flex;
    gap: 4px;
    background: rgba(0, 0, 0, 0.3);
    padding: 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  `,

  tab: `
    flex: 1;
    padding: 10px 16px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `,

  tabActive: `
    background: rgba(76, 175, 80, 0.2);
    color: #4CAF50;
  `,

  content: `
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    background: rgba(0, 0, 0, 0.4);
  `,

  summaryCard: `
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  `,

  summaryTitle: `
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    margin: 0 0 12px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `,

  summaryGrid: `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  `,

  stat: `
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,

  statLabel: `
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  `,

  statValue: `
    font-size: 20px;
    font-weight: 600;
    color: #fff;
  `,

  badge: `
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `,

  table: `
    width: 100%;
    border-collapse: collapse;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 8px;
    overflow: hidden;
  `,

  tableHeader: `
    background: rgba(0, 0, 0, 0.3);
    font-weight: 600;
    text-align: left;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `,

  tableCell: `
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  `,

  tableRow: `
    transition: background 0.2s;
    cursor: pointer;
  `,

  progressBar: `
    width: 100%;
    height: 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    overflow: hidden;
    position: relative;
  `,

  progressFill: `
    height: 100%;
    background: linear-gradient(90deg, #4CAF50 0%, #8BC34A 100%);
    transition: width 0.3s ease;
  `,

  emptyState: `
    text-align: center;
    padding: 40px 20px;
    color: rgba(255, 255, 255, 0.5);
  `,

  emptyIcon: `
    font-size: 48px;
    margin-bottom: 12px;
  `,

  emptyText: `
    font-size: 16px;
    font-weight: 500;
    margin: 0 0 8px 0;
  `,

  emptySubtext: `
    font-size: 13px;
    margin: 0;
  `,
};

// ============================================================================
// Helper Functions
// ============================================================================

function getConfidenceBadgeStyle(confidence: 'high' | 'medium' | 'low'): string {
  const colors = {
    high: { bg: 'rgba(76, 175, 80, 0.2)', text: '#4CAF50', border: '#4CAF50' },
    medium: { bg: 'rgba(255, 152, 0, 0.2)', text: '#FF9800', border: '#FF9800' },
    low: { bg: 'rgba(244, 67, 54, 0.2)', text: '#F44336', border: '#F44336' },
  };

  const color = colors[confidence];
  return `
    ${STYLES.badge}
    background: ${color.bg};
    color: ${color.text};
    border: 1px solid ${color.border};
  `;
}

function getEstimateLabel(mode: EstimateMode): string {
  const labels = {
    conservative: '🛡️ Conservative',
    average: '📊 Average',
    optimistic: '⚡ Optimistic',
  };
  return labels[mode];
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatNumber(num: number): string {
  return num.toFixed(1);
}

// ============================================================================
// Render Functions
// ============================================================================

function renderHeader(): HTMLElement {
  const header = document.createElement('div');
  header.style.cssText = STYLES.header;

  const title = document.createElement('h2');
  title.style.cssText = STYLES.headerTitle;
  title.innerHTML = `🌱 Crop Size Boost Tracker`;
  header.appendChild(title);

  const controls = document.createElement('div');
  controls.style.cssText = STYLES.controls;

  // Estimate mode selector
  const modeGroup = document.createElement('div');
  modeGroup.style.cssText = 'display: flex; align-items: center; gap: 8px;';

  const modeLabel = document.createElement('span');
  modeLabel.style.cssText = STYLES.label;
  modeLabel.textContent = 'Estimate:';
  modeGroup.appendChild(modeLabel);

  const modeSelect = document.createElement('select');
  modeSelect.style.cssText = STYLES.select;
  modeSelect.innerHTML = `
    <option value="conservative">🛡️ Conservative (Safest)</option>
    <option value="average">📊 Average (Balanced)</option>
    <option value="optimistic">⚡ Optimistic (Best Case)</option>
  `;
  modeSelect.value = getConfig().estimateMode;
  modeSelect.addEventListener('change', () => {
    setEstimateMode(modeSelect.value as EstimateMode);
  });
  modeGroup.appendChild(modeSelect);
  controls.appendChild(modeGroup);

  // Refresh button
  const refreshBtn = document.createElement('button');
  refreshBtn.style.cssText = STYLES.button;
  refreshBtn.innerHTML = '🔄 Refresh';
  refreshBtn.addEventListener('click', () => {
    manualRefresh();
    refreshBtn.textContent = '✓ Refreshed';
    setTimeout(() => {
      refreshBtn.innerHTML = '🔄 Refresh';
    }, 1000);
  });
  controls.appendChild(refreshBtn);

  header.appendChild(controls);

  return header;
}

function renderTabs(): HTMLElement {
  const tabContainer = document.createElement('div');
  tabContainer.style.cssText = STYLES.tabContainer;

  const summaryTab = document.createElement('button');
  summaryTab.style.cssText = STYLES.tab + (state.currentTab === 'summary' ? STYLES.tabActive : '');
  summaryTab.innerHTML = '📊 Overall Summary';
  summaryTab.addEventListener('click', () => {
    state.currentTab = 'summary';
    renderContent();
  });
  tabContainer.appendChild(summaryTab);

  const cropsTab = document.createElement('button');
  cropsTab.style.cssText = STYLES.tab + (state.currentTab === 'crops' ? STYLES.tabActive : '');
  cropsTab.innerHTML = '🌾 Crop Details';
  cropsTab.addEventListener('click', () => {
    state.currentTab = 'crops';
    renderContent();
  });
  tabContainer.appendChild(cropsTab);

  return tabContainer;
}

function renderSummaryTab(analysis: TrackerAnalysis): HTMLElement {
  const container = document.createElement('div');

  // Pet Info Card
  const petCard = document.createElement('div');
  petCard.style.cssText = STYLES.summaryCard;

  const petTitle = document.createElement('h3');
  petTitle.style.cssText = STYLES.summaryTitle;
  petTitle.textContent = '🐾 Active Boost Pets';
  petCard.appendChild(petTitle);

  if (analysis.boostPets.length === 0) {
    const noPets = document.createElement('p');
    noPets.style.cssText = 'color: rgba(255, 255, 255, 0.5); margin: 0;';
    noPets.textContent = 'No active Crop Size Boost pets detected';
    petCard.appendChild(noPets);
  } else {
    const petList = document.createElement('div');
    petList.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

    analysis.boostPets.forEach(pet => {
      const petRow = document.createElement('div');
      petRow.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
      `;

      const petInfo = document.createElement('div');
      petInfo.innerHTML = `
        <div style="font-weight: 500;">${pet.displayName} (${capitalize(pet.species)})</div>
        <div style="font-size: 12px; color: rgba(255, 255, 255, 0.6);">
          ${pet.abilityName} • STR: ${pet.strength}
        </div>
      `;
      petRow.appendChild(petInfo);

      const petStats = document.createElement('div');
      petStats.style.cssText = 'text-align: right;';
      petStats.innerHTML = `
        <div style="font-size: 14px; font-weight: 600; color: #4CAF50;">
          +${formatNumber(pet.effectiveBoostPercent)}%
        </div>
        <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5);">
          per proc
        </div>
      `;
      petRow.appendChild(petStats);

      petList.appendChild(petRow);
    });

    petCard.appendChild(petList);
  }

  container.appendChild(petCard);

  // Stats Card
  const statsCard = document.createElement('div');
  statsCard.style.cssText = STYLES.summaryCard;

  const statsTitle = document.createElement('h3');
  statsTitle.style.cssText = STYLES.summaryTitle;
  statsTitle.textContent = '📈 Boost Statistics';
  statsCard.appendChild(statsTitle);

  const statsGrid = document.createElement('div');
  statsGrid.style.cssText = STYLES.summaryGrid;

  const stats = [
    {
      label: 'Average Boost',
      value: `${formatNumber(analysis.averageBoostPercent)}%`,
      icon: '📊',
    },
    {
      label: 'Weakest Boost',
      value: `${formatNumber(analysis.weakestBoostPercent)}%`,
      icon: '🛡️',
    },
    {
      label: 'Strongest Boost',
      value: `${formatNumber(analysis.strongestBoostPercent)}%`,
      icon: '⚡',
    },
    {
      label: 'Avg Time/Proc',
      value: formatTimeEstimate(analysis.averageMinutesPerProc),
      icon: '⏱️',
    },
  ];

  stats.forEach(({ label, value, icon }) => {
    const statDiv = document.createElement('div');
    statDiv.style.cssText = STYLES.stat;
    statDiv.innerHTML = `
      <div style="${STYLES.statLabel}">${icon} ${label}</div>
      <div style="${STYLES.statValue}">${value}</div>
    `;
    statsGrid.appendChild(statDiv);
  });

  statsCard.appendChild(statsGrid);
  container.appendChild(statsCard);

  // Garden Overview Card
  const gardenCard = document.createElement('div');
  gardenCard.style.cssText = STYLES.summaryCard;

  const gardenTitle = document.createElement('h3');
  gardenTitle.style.cssText = STYLES.summaryTitle;
  gardenTitle.textContent = '🌾 Garden Overview';
  gardenCard.appendChild(gardenTitle);

  const gardenGrid = document.createElement('div');
  gardenGrid.style.cssText = STYLES.summaryGrid;

  const gardenStats = [
    {
      label: 'Mature Crops',
      value: analysis.totalMatureCrops.toString(),
      icon: '🌱',
    },
    {
      label: 'At Max Size',
      value: analysis.totalCropsAtMax.toString(),
      icon: '✨',
    },
    {
      label: 'Need Boosts',
      value: analysis.totalCropsNeedingBoost.toString(),
      icon: '📈',
    },
    {
      label: 'Progress',
      value: analysis.totalMatureCrops > 0
        ? `${((analysis.totalCropsAtMax / analysis.totalMatureCrops) * 100).toFixed(0)}%`
        : 'N/A',
      icon: '🎯',
    },
  ];

  gardenStats.forEach(({ label, value, icon }) => {
    const statDiv = document.createElement('div');
    statDiv.style.cssText = STYLES.stat;
    statDiv.innerHTML = `
      <div style="${STYLES.statLabel}">${icon} ${label}</div>
      <div style="${STYLES.statValue}">${value}</div>
    `;
    gardenGrid.appendChild(statDiv);
  });

  gardenCard.appendChild(gardenGrid);
  container.appendChild(gardenCard);

  // Overall Estimate Card
  const estimateCard = document.createElement('div');
  estimateCard.style.cssText = STYLES.summaryCard + 'border: 2px solid #4CAF50;';

  const estimateTitle = document.createElement('h3');
  estimateTitle.style.cssText = STYLES.summaryTitle + 'color: #4CAF50;';
  estimateTitle.textContent = '🎯 Overall Estimate';
  estimateCard.appendChild(estimateTitle);

  const estimateMode = getConfig().estimateMode;
  const modeLabel = document.createElement('div');
  modeLabel.style.cssText = 'margin-bottom: 12px; font-size: 12px; color: rgba(255, 255, 255, 0.6);';
  modeLabel.innerHTML = `Using <strong>${getEstimateLabel(estimateMode)}</strong> mode`;
  estimateCard.appendChild(modeLabel);

  const estimateGrid = document.createElement('div');
  estimateGrid.style.cssText = STYLES.summaryGrid;

  const estimateStats = [
    {
      label: 'Boosts Needed',
      value: analysis.overallEstimate.boostsNeeded.toString(),
      icon: '📊',
    },
    {
      label: 'Time Estimate',
      value: formatTimeEstimate(analysis.overallEstimate.timeEstimate),
      icon: '⏰',
    },
  ];

  estimateStats.forEach(({ label, value, icon }) => {
    const statDiv = document.createElement('div');
    statDiv.style.cssText = STYLES.stat;
    statDiv.innerHTML = `
      <div style="${STYLES.statLabel}">${icon} ${label}</div>
      <div style="${STYLES.statValue}">${value}</div>
    `;
    estimateGrid.appendChild(statDiv);
  });

  estimateCard.appendChild(estimateGrid);

  const confidenceBadge = document.createElement('span');
  confidenceBadge.style.cssText = getConfidenceBadgeStyle(analysis.overallEstimate.confidenceLevel);
  confidenceBadge.textContent = `${analysis.overallEstimate.confidenceLevel} confidence`;
  estimateCard.appendChild(confidenceBadge);

  const disclaimer = document.createElement('div');
  disclaimer.style.cssText = `
    margin-top: 12px;
    padding: 8px;
    background: rgba(255, 152, 0, 0.1);
    border-left: 3px solid #FF9800;
    border-radius: 4px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.7);
  `;
  disclaimer.innerHTML = `
    <strong>⚠️ Note:</strong> Estimates are based on current pet abilities and garden state.
    Actual time may vary based on RNG and game activity.
  `;
  estimateCard.appendChild(disclaimer);

  container.appendChild(estimateCard);

  return container;
}

function renderCropsTab(analysis: TrackerAnalysis): HTMLElement {
  const container = document.createElement('div');

  if (analysis.totalCropsNeedingBoost === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = STYLES.emptyState;
    empty.innerHTML = `
      <div style="${STYLES.emptyIcon}">✨</div>
      <div style="${STYLES.emptyText}">All crops are at maximum size!</div>
      <div style="${STYLES.emptySubtext}">You're doing great! 🎉</div>
    `;
    container.appendChild(empty);
    return container;
  }

  // Sort controls
  const sortControls = document.createElement('div');
  sortControls.style.cssText = `
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    align-items: center;
  `;

  const sortLabel = document.createElement('span');
  sortLabel.style.cssText = STYLES.label;
  sortLabel.textContent = 'Sort by:';
  sortControls.appendChild(sortLabel);

  const sortSelect = document.createElement('select');
  sortSelect.style.cssText = STYLES.select;
  sortSelect.innerHTML = `
    <option value="size">📏 Current Size</option>
    <option value="boosts">📊 Boosts Needed</option>
    <option value="eta">⏰ Time Estimate</option>
    <option value="species">🌱 Species</option>
  `;
  sortSelect.value = state.sortBy;
  sortSelect.addEventListener('change', () => {
    state.sortBy = sortSelect.value as any;
    renderContent();
  });
  sortControls.appendChild(sortSelect);

  const orderBtn = document.createElement('button');
  orderBtn.style.cssText = STYLES.button;
  orderBtn.innerHTML = state.sortOrder === 'asc' ? '⬆️ Ascending' : '⬇️ Descending';
  orderBtn.addEventListener('click', () => {
    state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
    renderContent();
  });
  sortControls.appendChild(orderBtn);

  container.appendChild(sortControls);

  // Table
  const table = document.createElement('table');
  table.style.cssText = STYLES.table;

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th style="${STYLES.tableHeader + STYLES.tableCell}">Species</th>
      <th style="${STYLES.tableHeader + STYLES.tableCell}">Current Size</th>
      <th style="${STYLES.tableHeader + STYLES.tableCell}">Remaining</th>
      <th style="${STYLES.tableHeader + STYLES.tableCell}">Boosts Needed</th>
      <th style="${STYLES.tableHeader + STYLES.tableCell}">Time Est.</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  // Sort crops
  const cropsToShow = analysis.crops.filter(c => c.sizeRemaining > 0);
  cropsToShow.sort((a, b) => {
    let aVal: any, bVal: any;

    const aKey = `${a.tileKey}-${a.slotIndex}`;
    const bKey = `${b.tileKey}-${b.slotIndex}`;
    const aEstimate = analysis.cropEstimates.get(aKey);
    const bEstimate = analysis.cropEstimates.get(bKey);

    switch (state.sortBy) {
      case 'size':
        aVal = a.currentSizePercent;
        bVal = b.currentSizePercent;
        break;
      case 'boosts':
        aVal = aEstimate?.boostsNeeded ?? Infinity;
        bVal = bEstimate?.boostsNeeded ?? Infinity;
        break;
      case 'eta':
        aVal = aEstimate?.timeEstimate ?? Infinity;
        bVal = bEstimate?.timeEstimate ?? Infinity;
        break;
      case 'species':
        aVal = a.species;
        bVal = b.species;
        break;
    }

    if (state.sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  cropsToShow.forEach(crop => {
    const key = `${crop.tileKey}-${crop.slotIndex}`;
    const estimate = analysis.cropEstimates.get(key);

    const row = document.createElement('tr');
    row.style.cssText = STYLES.tableRow;
    row.addEventListener('mouseenter', () => {
      row.style.background = 'rgba(76, 175, 80, 0.1)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent';
    });

    // Species
    const speciesCell = document.createElement('td');
    speciesCell.style.cssText = STYLES.tableCell;
    const mutations = crop.mutations.length > 0 ? ` (${crop.mutations.join(', ')})` : '';
    speciesCell.innerHTML = `
      <div style="font-weight: 500;">${capitalize(crop.species)}</div>
      <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5);">
        ${crop.fruitCount > 1 ? `${crop.fruitCount}x fruit` : 'Single fruit'}${mutations}
      </div>
    `;
    row.appendChild(speciesCell);

    // Current Size
    const sizeCell = document.createElement('td');
    sizeCell.style.cssText = STYLES.tableCell;
    const sizePercent = crop.currentSizePercent.toFixed(1);
    sizeCell.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">${sizePercent}%</div>
      <div style="${STYLES.progressBar}">
        <div style="${STYLES.progressFill}width: ${sizePercent}%;"></div>
      </div>
    `;
    row.appendChild(sizeCell);

    // Remaining
    const remainingCell = document.createElement('td');
    remainingCell.style.cssText = STYLES.tableCell;
    remainingCell.textContent = `${crop.sizeRemaining.toFixed(1)}%`;
    row.appendChild(remainingCell);

    // Boosts Needed
    const boostsCell = document.createElement('td');
    boostsCell.style.cssText = STYLES.tableCell;
    boostsCell.innerHTML = `<strong>${estimate?.boostsNeeded ?? 'N/A'}</strong>`;
    row.appendChild(boostsCell);

    // Time Estimate
    const etaCell = document.createElement('td');
    etaCell.style.cssText = STYLES.tableCell;
    const timeText = estimate ? formatTimeEstimate(estimate.timeEstimate) : 'N/A';
    etaCell.innerHTML = `
      <div style="font-weight: 500;">${timeText}</div>
      ${estimate ? `<div style="font-size: 10px; color: rgba(255, 255, 255, 0.5);">${estimate.confidenceLevel} confidence</div>` : ''}
    `;
    row.appendChild(etaCell);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);

  return container;
}

function renderContent(): void {
  if (!state.root) return;

  const analysis = getCurrentAnalysis();

  // Clear existing content
  const existingContent = state.root.querySelector('[data-content]');
  if (existingContent) {
    existingContent.remove();
  }

  const content = document.createElement('div');
  content.setAttribute('data-content', 'true');
  content.style.cssText = STYLES.content;

  if (!analysis) {
    const empty = document.createElement('div');
    empty.style.cssText = STYLES.emptyState;
    empty.innerHTML = `
      <div style="${STYLES.emptyIcon}">🐾</div>
      <div style="${STYLES.emptyText}">No Crop Size Boost pets active</div>
      <div style="${STYLES.emptySubtext}">Add pets with "Crop Size Boost I" or "Crop Size Boost II" abilities</div>
    `;
    content.appendChild(empty);
  } else {
    if (state.currentTab === 'summary') {
      content.appendChild(renderSummaryTab(analysis));
    } else {
      content.appendChild(renderCropsTab(analysis));
    }
  }

  state.root.appendChild(content);
}

function renderWindow(root: HTMLElement): void {
  root.innerHTML = '';
  state.root = root;

  const container = document.createElement('div');
  container.style.cssText = STYLES.container;

  container.appendChild(renderHeader());
  container.appendChild(renderTabs());

  root.appendChild(container);

  renderContent();

  // Set up live updates
  if (state.updateInterval) {
    clearInterval(state.updateInterval);
  }

  state.updateInterval = window.setInterval(() => {
    renderContent();
  }, 5000); // Update every 5 seconds
}

// ============================================================================
// Public API
// ============================================================================

export function openCropBoostTrackerWindow(): void {
  // Subscribe to analysis changes
  onAnalysisChange(() => {
    renderContent();
  });

  toggleWindow(
    'crop-boost-tracker',
    '🌱 Crop Size Boost Tracker',
    renderWindow,
    '55vw',
    '70vh'
  );
}
