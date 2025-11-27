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
  formatCountdown,
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

  // Detail Toggle Button
  const toggleCard = document.createElement('div');
  toggleCard.style.cssText = `
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  `;

  const toggleBtn = document.createElement('button');
  toggleBtn.style.cssText = `
    padding: 6px 12px;
    background: rgba(100, 181, 246, 0.2);
    border: 1px solid #64B5F6;
    border-radius: 4px;
    color: #64B5F6;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `;
  toggleBtn.textContent = showDetailedView ? '📊 Simple View' : '📈 Detailed View';
  toggleBtn.addEventListener('click', () => {
    showDetailedView = !showDetailedView;
    if (windowRoot) {
      renderCropBoostSection(windowRoot);
    }
  });
  toggleBtn.addEventListener('mouseenter', () => {
    toggleBtn.style.background = 'rgba(100, 181, 246, 0.3)';
  });
  toggleBtn.addEventListener('mouseleave', () => {
    toggleBtn.style.background = 'rgba(100, 181, 246, 0.2)';
  });

  toggleCard.appendChild(toggleBtn);
  root.appendChild(toggleCard);

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
    allCropsCard.setAttribute('data-countdown-section', 'overall');

    const allCropsTitle = document.createElement('div');
    allCropsTitle.style.cssText = 'font-size: 14px; font-weight: 600; color: #FFC107; margin-bottom: 12px;';
    allCropsTitle.textContent = '🎯 Time Until All Crops Max Size';
    allCropsCard.appendChild(allCropsTitle);

    const boostsRow = document.createElement('div');
    boostsRow.style.cssText = 'font-size: 13px; color: rgba(255, 255, 255, 0.9); margin-bottom: 8px;';
    boostsRow.innerHTML = `<strong>Boosts Needed:</strong> ${analysis.overallEstimate.boostsNeeded}`;
    allCropsCard.appendChild(boostsRow);

    // Simple view: Just show next boost countdown
    if (!showDetailedView) {
      const nextBoostRow = document.createElement('div');
      nextBoostRow.style.cssText = 'font-size: 16px; font-weight: 600; color: #FFC107;';
      nextBoostRow.setAttribute('data-countdown-display', 'overall-next');

      // Get the soonest next boost from any crop
      let soonestNextBoost = Infinity;
      for (const estimate of analysis.cropEstimates.values()) {
        if (estimate.expectedNextBoostAt < soonestNextBoost) {
          soonestNextBoost = estimate.expectedNextBoostAt;
        }
      }

      const countdown = formatCountdown(soonestNextBoost);
      nextBoostRow.innerHTML = `⏰ Next boost: <span style="color: ${countdown.isOverdue ? '#FF5252' : '#FFC107'}">${countdown.text}</span>`;
      allCropsCard.appendChild(nextBoostRow);
    } else {
      // Detailed view: Show full time range with percentiles
      const timeRow = document.createElement('div');
      timeRow.style.cssText = 'font-size: 16px; font-weight: 600; color: #FFC107; margin-bottom: 8px;';
      const timeRangeStr = formatTimeRange(
        analysis.overallEstimate.timeEstimateP10,
        analysis.overallEstimate.timeEstimateP50,
        analysis.overallEstimate.timeEstimateP90
      );
      timeRow.innerHTML = `⏰ ${timeRangeStr}`;
      allCropsCard.appendChild(timeRow);

      const note = document.createElement('div');
      note.style.cssText = 'font-size: 11px; color: rgba(255, 255, 255, 0.5); margin-top: 4px; font-style: italic;';
      note.textContent = '* Time estimates based on combined proc rates (P10-P90 range, median)';
      allCropsCard.appendChild(note);
    }

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

    // Auto-refresh view immediately when dropdown changes
    if (windowRoot) {
      renderCropBoostSection(windowRoot);
    }
  });

  selectRow.appendChild(speciesSelect);
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
        <th style="text-align: right; padding: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.6); font-weight: 600; text-transform: uppercase; font-size: 11px;">${showDetailedView ? 'Time Estimate' : 'Next Boost'}</th>
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
      boostsCell.style.cssText = 'padding: 12px 10px; text-align: right;';
      if (estimate && showDetailedView) {
        boostsCell.innerHTML = `<span style="color: #64B5F6; font-weight: 600;">${estimate.boostsReceived}/${estimate.boostsNeeded}</span>`;
      } else if (estimate) {
        boostsCell.innerHTML = `<span style="color: #64B5F6; font-weight: 600;">${estimate.boostsNeeded}</span>`;
      } else {
        boostsCell.textContent = 'N/A';
      }
      row.appendChild(boostsCell);

      const timeCell = document.createElement('td');
      timeCell.style.cssText = 'padding: 12px 10px; text-align: right; color: #FFC107; font-weight: 500;';
      timeCell.setAttribute('data-countdown-display', key);

      if (estimate) {
        if (!showDetailedView) {
          // Simple view: Show live countdown to next boost
          const countdown = formatCountdown(estimate.expectedNextBoostAt);
          timeCell.innerHTML = `<span style="color: ${countdown.isOverdue ? '#FF5252' : '#FFC107'}">${countdown.text}</span>`;
        } else {
          // Detailed view: Show full percentile range
          const timeRangeStr = formatTimeRange(estimate.timeEstimateP10, estimate.timeEstimateP50, estimate.timeEstimateP90);
          timeCell.textContent = timeRangeStr;
        }
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

let windowRoot: HTMLElement | null = null;
let callbackRegistered = false;
let renderTimeout: number | null = null;
let countdownInterval: number | null = null;
let showDetailedView = false; // Toggle for simple/detailed view

export function openCropBoostTrackerWindow(): void {
  toggleWindow(
    'crop-boost-tracker',
    '🌱 Crop Size Boost Tracker',
    (root: HTMLElement) => {
      windowRoot = root;

      // Register callback once
      if (!callbackRegistered) {
        onAnalysisChange(() => {
          // Debounce re-renders to prevent flashing
          if (renderTimeout) {
            clearTimeout(renderTimeout);
          }

          renderTimeout = window.setTimeout(() => {
            // Don't re-render if user is interacting with dropdown
            const activeElement = document.activeElement;
            if (activeElement && activeElement.tagName === 'SELECT') {
              // User is using dropdown, skip this render
              return;
            }

            // Re-render if window is open
            if (windowRoot) {
              renderCropBoostSection(windowRoot);
            }
          }, 100); // 100ms debounce
        });
        callbackRegistered = true;
      }

      renderCropBoostSection(root);

      // Set up live countdown updates (only in simple mode)
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }

      countdownInterval = window.setInterval(() => {
        if (!showDetailedView && windowRoot) {
          updateCountdownDisplays();
        }
      }, 1000); // Update every second
    },
    '650px',
    '75vh'
  );
}

/**
 * Update countdown displays without full re-render
 */
function updateCountdownDisplays(): void {
  const analysis = getCurrentAnalysis();
  if (!analysis || !windowRoot) return;

  // Update overall next boost countdown
  const overallDisplay = windowRoot.querySelector('[data-countdown-display="overall-next"]');
  if (overallDisplay) {
    let soonestNextBoost = Infinity;
    for (const estimate of analysis.cropEstimates.values()) {
      if (estimate.expectedNextBoostAt < soonestNextBoost) {
        soonestNextBoost = estimate.expectedNextBoostAt;
      }
    }

    const countdown = formatCountdown(soonestNextBoost);
    overallDisplay.innerHTML = `⏰ Next boost: <span style="color: ${countdown.isOverdue ? '#FF5252' : '#FFC107'}">${countdown.text}</span>`;
  }

  // Update per-crop countdown displays
  for (const [key, estimate] of analysis.cropEstimates) {
    const display = windowRoot.querySelector(`[data-countdown-display="${key}"]`);
    if (display) {
      const countdown = formatCountdown(estimate.expectedNextBoostAt);
      display.innerHTML = `<span style="color: ${countdown.isOverdue ? '#FF5252' : '#FFC107'}">${countdown.text}</span>`;
    }
  }
}
