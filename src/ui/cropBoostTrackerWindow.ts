/**
 * Crop Size Boost Tracker Window
 * Simple, turtle-timer-style tracker for crop size boost progress
 */

import { toggleWindow } from './modalWindow';
import {
  getCurrentAnalysis,
  getConfig,
  setSelectedSpecies,
  manualRefresh,
  onAnalysisChange,
  formatTimeEstimate,
  formatTimeRange,
  getAvailableSpecies,
  type TrackerAnalysis,
  type CropSizeInfo,
} from '../features/cropBoostTracker';
import { log } from '../utils/logger';

// ============================================================================
// Helper Functions
// ============================================================================

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatNumber(num: number): string {
  return num.toFixed(1);
}

// ============================================================================
// Render Function
// ============================================================================

function renderCropBoostSection(root: HTMLElement): void {
  root.innerHTML = '';
  root.style.cssText = `
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  const analysis = getCurrentAnalysis();
  const config = getConfig();

  if (!analysis) {
    const empty = document.createElement('div');
    empty.style.cssText = `
      text-align: center;
      padding: 40px 20px;
      color: rgba(255, 255, 255, 0.5);
      font-size: 14px;
    `;
    empty.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 12px;">🐾</div>
      <div style="font-weight: 500; margin-bottom: 8px;">No Crop Size Boost pets active</div>
      <div style="font-size: 12px;">Add pets with "Crop Size Boost I" or "Crop Size Boost II" abilities</div>
    `;
    root.appendChild(empty);
    return;
  }

  // Summary Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px;
    background: linear-gradient(135deg, rgba(76, 175, 80, 0.2), rgba(76, 175, 80, 0.05));
    border: 1px solid rgba(76, 175, 80, 0.3);
    border-radius: 8px;
  `;

  const petSummary = document.createElement('div');
  petSummary.style.cssText = 'font-size: 14px; font-weight: 600; color: #4CAF50; margin-bottom: 8px;';
  petSummary.textContent = `🐾 ${analysis.totalBoostPets} Active Boost Pet${analysis.totalBoostPets !== 1 ? 's' : ''}`;
  header.appendChild(petSummary);

  const petsList = document.createElement('div');
  petsList.style.cssText = 'display: flex; flex-direction: column; gap: 6px; font-size: 12px;';
  analysis.boostPets.forEach(pet => {
    const petRow = document.createElement('div');
    petRow.style.cssText = 'color: rgba(255, 255, 255, 0.8);';
    petRow.innerHTML = `
      • <strong>${pet.displayName}</strong>: ${pet.abilityName}
      <span style="color: #4CAF50; font-weight: 600;">(+${formatNumber(pet.effectiveBoostPercent)}% per proc)</span>
    `;
    petsList.appendChild(petRow);
  });
  header.appendChild(petsList);

  root.appendChild(header);

  // Overall Stats Card
  const statsCard = document.createElement('div');
  statsCard.style.cssText = `
    padding: 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
  `;

  const statsTitle = document.createElement('div');
  statsTitle.style.cssText = 'font-size: 13px; font-weight: 600; color: rgba(255, 255, 255, 0.7); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;';
  statsTitle.textContent = '📊 Overall Progress';
  statsCard.appendChild(statsTitle);

  const statsGrid = document.createElement('div');
  statsGrid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
  `;

  const stats = [
    { label: 'Total Crops', value: analysis.crops.length, color: '#fff' },
    { label: 'At Max Size', value: analysis.totalCropsAtMax, color: '#4CAF50' },
    { label: 'Need Boosts', value: analysis.totalCropsNeedingBoost, color: '#FF9800' },
    { label: 'Progress', value: `${analysis.crops.length > 0 ? Math.round((analysis.totalCropsAtMax / analysis.crops.length) * 100) : 0}%`, color: '#64B5F6' },
  ];

  stats.forEach(({ label, value, color }) => {
    const statDiv = document.createElement('div');
    statDiv.innerHTML = `
      <div style="font-size: 11px; color: rgba(255, 255, 255, 0.6); margin-bottom: 4px;">${label}</div>
      <div style="font-size: 20px; font-weight: 600; color: ${color};">${value}</div>
    `;
    statsGrid.appendChild(statDiv);
  });

  statsCard.appendChild(statsGrid);
  root.appendChild(statsCard);

  // All Crops Estimate Card
  if (analysis.totalCropsNeedingBoost > 0) {
    const allCropsCard = document.createElement('div');
    allCropsCard.style.cssText = `
      padding: 16px;
      background: linear-gradient(135deg, rgba(255, 193, 7, 0.15), rgba(255, 193, 7, 0.05));
      border: 2px solid rgba(255, 193, 7, 0.4);
      border-radius: 8px;
    `;

    const allCropsTitle = document.createElement('div');
    allCropsTitle.style.cssText = 'font-size: 14px; font-weight: 600; color: #FFC107; margin-bottom: 12px;';
    allCropsTitle.textContent = '🎯 Time Until All Crops Max Size';
    allCropsCard.appendChild(allCropsTitle);

    const boostsRow = document.createElement('div');
    boostsRow.style.cssText = 'font-size: 13px; color: rgba(255, 255, 255, 0.9); margin-bottom: 8px;';
    boostsRow.innerHTML = `<strong>Boosts Needed:</strong> ${analysis.overallEstimate.boostsNeeded}`;
    allCropsCard.appendChild(boostsRow);

    const timeRow = document.createElement('div');
    timeRow.style.cssText = 'font-size: 16px; font-weight: 600; color: #FFC107;';
    const timeRangeStr = formatTimeRange(analysis.overallEstimate.timeEstimateMin, analysis.overallEstimate.timeEstimateMax);
    timeRow.innerHTML = `⏰ ${timeRangeStr}`;
    allCropsCard.appendChild(timeRow);

    const note = document.createElement('div');
    note.style.cssText = 'font-size: 11px; color: rgba(255, 255, 255, 0.5); margin-top: 8px; font-style: italic;';
    note.textContent = '* Time range accounts for multiple pets proc-ing independently';
    allCropsCard.appendChild(note);

    root.appendChild(allCropsCard);
  }

  // Species Selection Dropdown
  const selectionCard = document.createElement('div');
  selectionCard.style.cssText = `
    padding: 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
  `;

  const selectionTitle = document.createElement('div');
  selectionTitle.style.cssText = 'font-size: 13px; font-weight: 600; color: rgba(255, 255, 255, 0.7); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;';
  selectionTitle.textContent = '🌱 View Specific Crop';
  selectionCard.appendChild(selectionTitle);

  const selectRow = document.createElement('div');
  selectRow.style.cssText = 'display: flex; gap: 12px; align-items: center;';

  const speciesSelect = document.createElement('select');
  speciesSelect.style.cssText = `
    flex: 1;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
  `;

  // Add "All Crops" option
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'All Crops';
  speciesSelect.appendChild(allOption);

  // Add species options
  const availableSpecies = getAvailableSpecies();
  availableSpecies.forEach(species => {
    const option = document.createElement('option');
    option.value = species;
    option.textContent = capitalize(species);
    speciesSelect.appendChild(option);
  });

  speciesSelect.value = config.selectedSpecies ?? '';
  speciesSelect.addEventListener('change', () => {
    const selected = speciesSelect.value || null;
    setSelectedSpecies(selected);
  });

  selectRow.appendChild(speciesSelect);

  const refreshBtn = document.createElement('button');
  refreshBtn.style.cssText = `
    padding: 8px 16px;
    background: rgba(76, 175, 80, 0.2);
    border: 1px solid #4CAF50;
    border-radius: 4px;
    color: #4CAF50;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `;
  refreshBtn.textContent = '🔄 Refresh';
  refreshBtn.addEventListener('click', () => {
    manualRefresh();
    refreshBtn.textContent = '✓ Refreshed';
    setTimeout(() => {
      refreshBtn.textContent = '🔄 Refresh';
    }, 1000);
  });
  refreshBtn.addEventListener('mouseenter', () => {
    refreshBtn.style.background = 'rgba(76, 175, 80, 0.3)';
  });
  refreshBtn.addEventListener('mouseleave', () => {
    refreshBtn.style.background = 'rgba(76, 175, 80, 0.2)';
  });

  selectRow.appendChild(refreshBtn);
  selectionCard.appendChild(selectRow);
  root.appendChild(selectionCard);

  // Filtered Crops Table
  const selectedSpecies = config.selectedSpecies;
  const filteredCrops = selectedSpecies
    ? analysis.crops.filter(c => c.species === selectedSpecies)
    : analysis.crops;

  const cropsNeedingBoost = filteredCrops.filter(c => c.sizeRemaining > 0);

  if (cropsNeedingBoost.length > 0) {
    const tableCard = document.createElement('div');
    tableCard.style.cssText = `
      padding: 16px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
    `;

    const tableTitle = document.createElement('div');
    tableTitle.style.cssText = 'font-size: 13px; font-weight: 600; color: rgba(255, 255, 255, 0.7); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;';
    tableTitle.textContent = selectedSpecies
      ? `🌾 ${capitalize(selectedSpecies)} Crops (${cropsNeedingBoost.length})`
      : `🌾 All Crops Needing Boosts (${cropsNeedingBoost.length})`;
    tableCard.appendChild(tableTitle);

    const table = document.createElement('table');
    table.style.cssText = `
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    `;

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th style="text-align: left; padding: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.6); font-weight: 600; text-transform: uppercase; font-size: 11px;">Crop</th>
        <th style="text-align: right; padding: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.6); font-weight: 600; text-transform: uppercase; font-size: 11px;">Size</th>
        <th style="text-align: right; padding: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.6); font-weight: 600; text-transform: uppercase; font-size: 11px;">Boosts</th>
        <th style="text-align: right; padding: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.6); font-weight: 600; text-transform: uppercase; font-size: 11px;">Time Range</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    cropsNeedingBoost.forEach((crop, index) => {
      const key = `${crop.tileKey}-${crop.slotIndex}`;
      const estimate = analysis.cropEstimates.get(key);

      const row = document.createElement('tr');
      row.style.cssText = `
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        transition: background 0.2s;
      `;
      row.addEventListener('mouseenter', () => {
        row.style.background = 'rgba(76, 175, 80, 0.1)';
      });
      row.addEventListener('mouseleave', () => {
        row.style.background = 'transparent';
      });

      const nameCell = document.createElement('td');
      nameCell.style.cssText = 'padding: 12px 10px;';
      const status = crop.isMature ? '🌾' : '🌱';
      const mutations = crop.mutations.length > 0 ? ` <span style="color: #FFD700;">(${crop.mutations.join(', ')})</span>` : '';
      nameCell.innerHTML = `${status} ${capitalize(crop.species)}${mutations}`;
      row.appendChild(nameCell);

      const sizeCell = document.createElement('td');
      sizeCell.style.cssText = 'padding: 12px 10px; text-align: right;';
      const sizePercent = crop.currentSizePercent.toFixed(1);
      sizeCell.innerHTML = `<span style="color: ${crop.currentSizePercent >= 90 ? '#4CAF50' : crop.currentSizePercent >= 70 ? '#FF9800' : '#fff'}; font-weight: 600;">${sizePercent}%</span>`;
      row.appendChild(sizeCell);

      const boostsCell = document.createElement('td');
      boostsCell.style.cssText = 'padding: 12px 10px; text-align: right; font-weight: 600; color: #64B5F6;';
      boostsCell.textContent = estimate ? estimate.boostsNeeded.toString() : 'N/A';
      row.appendChild(boostsCell);

      const timeCell = document.createElement('td');
      timeCell.style.cssText = 'padding: 12px 10px; text-align: right; color: #FFC107; font-weight: 500;';
      if (estimate) {
        const timeRangeStr = formatTimeRange(estimate.timeEstimateMin, estimate.timeEstimateMax);
        timeCell.textContent = timeRangeStr;
      } else {
        timeCell.textContent = 'N/A';
      }
      row.appendChild(timeCell);

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    tableCard.appendChild(table);
    root.appendChild(tableCard);
  } else {
    const allMaxCard = document.createElement('div');
    allMaxCard.style.cssText = `
      padding: 24px;
      text-align: center;
      background: linear-gradient(135deg, rgba(76, 175, 80, 0.2), rgba(76, 175, 80, 0.05));
      border: 2px solid rgba(76, 175, 80, 0.4);
      border-radius: 8px;
      color: #4CAF50;
    `;
    allMaxCard.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 12px;">✨</div>
      <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">All crops ${selectedSpecies ? `(${capitalize(selectedSpecies)}) ` : ''}are at maximum size!</div>
      <div style="font-size: 13px; color: rgba(255, 255, 255, 0.6);">You're doing great! 🎉</div>
    `;
    root.appendChild(allMaxCard);
  }
}

// ============================================================================
// Public API
// ============================================================================

export function openCropBoostTrackerWindow(): void {
  // Subscribe to analysis changes
  onAnalysisChange(() => {
    // Find the window root and re-render
    const windowEl = document.querySelector('[data-qpm-window-id="crop-boost-tracker"]');
    if (windowEl) {
      const root = windowEl.querySelector('[data-qpm-window-content]') as HTMLElement;
      if (root) {
        renderCropBoostSection(root);
      }
    }
  });

  toggleWindow(
    'crop-boost-tracker',
    '🌱 Crop Size Boost Tracker',
    renderCropBoostSection,
    '650px',
    '75vh'
  );
}
