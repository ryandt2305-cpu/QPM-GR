// src/ui/shopRestockWindow.ts
// Shop Restock Tracker UI

import {
  initializeRestockTracker,
  addRestockEvents,
  getAllRestockEvents,
  calculateItemStats,
  getSummaryStats,
  clearAllRestocks,
  onRestockUpdate,
  predictNextRestock,
  getTopLikelyItems,
  predictItemNextAppearance,
  predictItemDual,
  getActivePrediction,
  getPredictionHistory,
  getDetailedPredictionStats,
  type PredictionRecord,
  type DetailedPredictionStats,
  type DualPrediction,
} from '../features/shopRestockTracker';
import {
  startLiveShopTracking,
  stopLiveShopTracking,
  isLiveTrackingActive,
  enableLiveTracking,
  disableLiveTracking,
  isLiveTrackingEnabled,
} from '../features/shopRestockLiveTracker';
import { parseDiscordHtmlFile } from '../features/shopRestockParser';
import { log } from '../utils/logger';

export interface ShopRestockWindowState {
  root: HTMLElement;
  contentContainer: HTMLElement;
  countdownInterval: number | null;
  resizeListener: (() => void) | null;
}

/**
 * Format number with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format date
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Create Shop Restock Tracker window
 */
export function createShopRestockWindow(): ShopRestockWindowState {
  const root = document.createElement('div');
  root.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    width: 900px;
    max-height: 80vh;
    overflow-y: auto;
    background: var(--qpm-background, rgba(0, 0, 0, 0.92));
    border: 2px solid var(--qpm-border, #555);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    z-index: 10003;
    font-family: Arial, sans-serif;
    display: none;
  `;

  // Title bar
  const titleBar = document.createElement('div');
  titleBar.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--qpm-surface-1, #1a1a1a);
    border-bottom: 2px solid var(--qpm-border, #555);
    cursor: move;
  `;

  const title = document.createElement('h3');
  title.textContent = '🏪 Shop Restock Tracker';
  title.style.cssText = `
    margin: 0;
    color: var(--qpm-text, #fff);
    font-size: 16px;
    font-weight: 600;
  `;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    background: transparent;
    border: none;
    color: var(--qpm-text, #fff);
    font-size: 20px;
    cursor: pointer;
    padding: 0 8px;
    line-height: 1;
  `;
  closeBtn.onclick = () => {
    root.style.display = 'none';
  };

  titleBar.appendChild(title);
  titleBar.appendChild(closeBtn);
  root.appendChild(titleBar);

  // Content container
  const contentContainer = document.createElement('div');
  contentContainer.style.cssText = `
    padding: 16px;
    color: var(--qpm-text, #fff);
  `;
  root.appendChild(contentContainer);

  // Make draggable
  makeDraggable(root, titleBar);

  // Add to DOM
  document.body.appendChild(root);

  // Create state object
  const state: ShopRestockWindowState = {
    root,
    contentContainer,
    countdownInterval: null,
    resizeListener: null,
  };

  // Add resize listener to keep window visible when viewport changes
  const resizeListener = () => {
    if (root.style.display !== 'none') {
      clampWindowPosition(root);
    }
  };
  window.addEventListener('resize', resizeListener);
  state.resizeListener = resizeListener;

  // Initialize
  initializeRestockTracker();

  // Start live tracking automatically (only if enabled)
  if (isLiveTrackingEnabled()) {
    startLiveShopTracking();
  }

  // Initial render
  renderContent(state);

  // Subscribe to updates
  onRestockUpdate(() => {
    renderContent(state);
  });

  return state;
}

/**
 * Render window content
 */
function renderContent(state: ShopRestockWindowState): void {
  const events = getAllRestockEvents();
  const summary = getSummaryStats();

  // Clear countdown interval if exists
  if (state.countdownInterval !== null) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }

  state.contentContainer.innerHTML = '';

  // Live tracking section (always show)
  const liveTrackingSection = createLiveTrackingSection();
  state.contentContainer.appendChild(liveTrackingSection);

  // Import section
  const importSection = createImportSection(state);
  state.contentContainer.appendChild(importSection);

  // Summary section
  if (events.length > 0) {
    // Prediction section
    const predictionSection = createPredictionSection(state);
    state.contentContainer.appendChild(predictionSection);

    const summarySection = createSummarySection(summary);
    state.contentContainer.appendChild(summarySection);

    // Item statistics
    const statsSection = createItemStatsSection();
    state.contentContainer.appendChild(statsSection);
  } else {
    const emptyState = document.createElement('div');
    emptyState.style.cssText = `
      text-align: center;
      padding: 40px 20px;
      color: var(--qpm-text-muted, #aaa);
      font-style: italic;
    `;
    emptyState.textContent = 'No restock data imported yet. Upload a Discord HTML export to get started!';
    state.contentContainer.appendChild(emptyState);
  }
}

/**
 * Create live tracking section
 */
function createLiveTrackingSection(): HTMLElement {
  const section = document.createElement('div');
  section.style.cssText = `
    margin-bottom: 20px;
    padding: 16px;
    background: rgba(76, 175, 80, 0.1);
    border-radius: 8px;
    border: 2px solid rgba(76, 175, 80, 0.3);
  `;

  const heading = document.createElement('h4');
  heading.textContent = '📡 Live Shop Monitoring';
  heading.style.cssText = `
    margin: 0 0 12px 0;
    color: var(--qpm-accent, #4CAF50);
    font-size: 14px;
  `;
  section.appendChild(heading);

  const status = document.createElement('div');
  const isTracking = isLiveTrackingActive();
  const isEnabled = isLiveTrackingEnabled();
  status.style.cssText = `
    margin-bottom: 12px;
    font-size: 12px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
  `;
  status.innerHTML = isTracking
    ? `<span style="color: #4CAF50;">● Active</span> - Monitoring shop for restocks in real-time`
    : `<span style="color: #aaa;">○ Inactive</span> - Live tracking is not running`;
  section.appendChild(status);

  const description = document.createElement('p');
  description.style.cssText = `
    margin: 0 0 12px 0;
    font-size: 12px;
    color: var(--qpm-text-muted, #aaa);
    line-height: 1.5;
  `;
  description.textContent = 'Automatically detects and records shop restocks while you play.';
  section.appendChild(description);

  // Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = isEnabled ? '🛑 Disable Live Tracking' : '▶️ Enable Live Tracking';
  toggleBtn.style.cssText = `
    padding: 8px 16px;
    background: ${isEnabled ? 'rgba(244, 67, 54, 0.2)' : 'rgba(76, 175, 80, 0.2)'};
    color: ${isEnabled ? '#f44336' : '#4CAF50'};
    border: 1px solid ${isEnabled ? '#f44336' : '#4CAF50'};
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
  `;
  toggleBtn.onclick = () => {
    if (isEnabled) {
      disableLiveTracking();
    } else {
      enableLiveTracking();
    }
    // Re-render to update status
    const parent = section.parentElement;
    if (parent) {
      const newSection = createLiveTrackingSection();
      parent.replaceChild(newSection, section);
    }
  };
  section.appendChild(toggleBtn);

  return section;
}

/**
 * Create prediction section
 */
function createPredictionSection(state: ShopRestockWindowState): HTMLElement {
  const section = document.createElement('div');
  section.style.cssText = `
    margin-bottom: 20px;
    padding: 16px;
    background: rgba(66, 165, 245, 0.1);
    border-radius: 8px;
    border: 2px solid rgba(66, 165, 245, 0.3);
  `;

  const heading = document.createElement('h4');
  heading.textContent = '🔮 Next Rare Restock Estimation';
  heading.style.cssText = `
    margin: 0 0 4px 0;
    color: #42A5F5;
    font-size: 14px;
  `;
  section.appendChild(heading);

  // Add disclaimer
  const disclaimer = document.createElement('p');
  disclaimer.textContent = '(This will never be 100%, only estimates based of patterns and timings)';
  disclaimer.style.cssText = `
    margin: 0 0 12px 0;
    font-size: 10px;
    color: #888;
    font-style: italic;
  `;
  section.appendChild(disclaimer);

  // Global "Show Detailed Stats" toggle button
  const globalToggleBtn = document.createElement('button');
  globalToggleBtn.textContent = '📊 Show Detailed Stats';
  globalToggleBtn.style.cssText = `
    width: 100%;
    padding: 8px;
    background: rgba(66, 165, 245, 0.15);
    border: 1px solid rgba(66, 165, 245, 0.3);
    color: #42A5F5;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 4px;
    margin-bottom: 12px;
    transition: all 0.2s;
  `;

  let isGlobalStatsExpanded = false;
  const allDetailedStatsSections: HTMLElement[] = []; // Track all stats sections
  const countdownEntries: Array<{ target: number; element: HTMLElement }> = [];

  const formatCountdown = (target: number) => {
    const diff = target - Date.now();
    const overdue = diff <= 0;
    const absMs = Math.abs(diff);
    const hours = Math.floor(absMs / (1000 * 60 * 60));
    const minutes = Math.floor((absMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((absMs % (1000 * 60)) / 1000);
    const formatted = `${overdue ? '-' : ''}${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
    return { formatted, overdue };
  };

  const updateCountdowns = () => {
    countdownEntries.forEach(entry => {
      const { formatted, overdue } = formatCountdown(entry.target);
      entry.element.textContent = overdue ? `Overdue ${formatted}` : `ETA ${formatted}`;
      entry.element.style.color = overdue ? '#f44336' : '#42A5F5';
    });
  };

  globalToggleBtn.addEventListener('mouseenter', () => {
    globalToggleBtn.style.background = 'rgba(66, 165, 245, 0.3)';
  });

  globalToggleBtn.addEventListener('mouseleave', () => {
    globalToggleBtn.style.background = isGlobalStatsExpanded ? 'rgba(66, 165, 245, 0.25)' : 'rgba(66, 165, 245, 0.15)';
  });

  section.appendChild(globalToggleBtn);

  // Specific rare items to track
  const rareItems = [
    { name: 'Sunflower', color: '#FFD700' },
    { name: 'Mythical Eggs', color: '#9C27B0' },
    { name: 'Starweaver', color: '#FFD700' },
    { name: 'Moonbinder', color: '#CE93D8' },
    { name: 'Dawnbinder', color: '#FF9800' },
  ];

  const itemsList = document.createElement('div');
  itemsList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  for (const rareItem of rareItems) {
    const dualPrediction = predictItemDual(rareItem.name);
    const history = getPredictionHistory(rareItem.name);

    // Container for item + history
    const itemContainer = document.createElement('div');
    itemContainer.style.cssText = `
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      border-left: 3px solid ${rareItem.color};
      overflow: hidden;
    `;

    // Main row (current prediction) - Always clickable to show history or "no data" message
    const itemRow = document.createElement('div');
    itemRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      cursor: pointer;
      transition: background 0.2s;
    `;

    itemRow.addEventListener('mouseenter', () => {
      itemRow.style.background = 'rgba(255, 255, 255, 0.05)';
    });
    itemRow.addEventListener('mouseleave', () => {
      itemRow.style.background = '';
    });

    const leftSide = document.createElement('div');
    leftSide.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    const itemName = document.createElement('span');
    itemName.textContent = rareItem.name;
    itemName.style.cssText = `
      color: ${rareItem.color};
      font-weight: 600;
      font-size: 12px;
    `;

    // Expand indicator (always show to indicate clickability)
    const expandIndicator = document.createElement('span');
    expandIndicator.textContent = '▼';
    expandIndicator.style.cssText = `
      color: #aaa;
      font-size: 10px;
      transition: transform 0.2s;
    `;

    leftSide.appendChild(itemName);
    leftSide.appendChild(expandIndicator);

    const predictionText = document.createElement('span');
    predictionText.style.cssText = `
      color: var(--qpm-text-muted, #aaa);
      font-size: 11px;
    `;

    const activePrediction = getActivePrediction(rareItem.name);
    const targetPrediction = activePrediction ?? dualPrediction.conservative ?? dualPrediction.optimistic ?? null;
    predictionText.innerHTML = '';

    if (targetPrediction) {
      const countdownLine = document.createElement('div');
      countdownLine.style.cssText = 'font-weight: 700;';
      predictionText.appendChild(countdownLine);

      const exactLine = document.createElement('div');
      exactLine.style.cssText = 'font-size: 10px; color: #aaa; margin-top: 2px;';
      exactLine.textContent = `${activePrediction ? 'Original estimate' : 'Estimate'}: ${new Date(targetPrediction).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`;
      predictionText.appendChild(exactLine);

      if (!activePrediction && dualPrediction.optimistic && dualPrediction.conservative && dualPrediction.optimistic !== dualPrediction.conservative) {
        const rangeLine = document.createElement('div');
        rangeLine.style.cssText = 'font-size: 10px; color: #666; margin-top: 2px;';
        const earliest = Math.min(dualPrediction.optimistic, dualPrediction.conservative);
        const latest = Math.max(dualPrediction.optimistic, dualPrediction.conservative);
        const earliestStr = new Date(earliest).toLocaleDateString([], { month: 'short', day: 'numeric' });
        const latestStr = new Date(latest).toLocaleDateString([], { month: 'short', day: 'numeric' });
        rangeLine.textContent = `Window: ~${earliestStr} - ~${latestStr}`;
        predictionText.appendChild(rangeLine);
      }

      countdownEntries.push({ target: targetPrediction, element: countdownLine });
    } else {
      predictionText.textContent = 'Insufficient data';
    }

    itemRow.appendChild(leftSide);
    itemRow.appendChild(predictionText);
    itemContainer.appendChild(itemRow);

    // Detailed Stats Section (collapsible)
    const detailedStatsSection = document.createElement('div');
    detailedStatsSection.style.cssText = `
      display: none;
      padding: 16px;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(33, 150, 243, 0.1) 100%);
      border-top: 2px solid rgba(66, 165, 245, 0.4);
      font-size: 11px;
      border-radius: 0 0 6px 6px;
    `;

    // Get detailed stats
    const detailedStats = getDetailedPredictionStats(rareItem.name);

    if (detailedStats.sampleSize > 0) {
      // Format helper for durations
      const formatDuration = (ms: number | null): string => {
        if (ms === null) return 'N/A';
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
      };

      // Title for detailed stats
      const detailedTitle = document.createElement('div');
      detailedTitle.style.cssText = `
        color: #42A5F5;
        font-weight: 700;
        margin-bottom: 12px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid rgba(66, 165, 245, 0.3);
        padding-bottom: 6px;
      `;
      detailedTitle.textContent = '📈 Statistical Analysis';
      detailedStatsSection.appendChild(detailedTitle);

      // Create stats grid with better styling
      const statsGrid = document.createElement('div');
      statsGrid.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px 20px;
        margin-bottom: 14px;
        background: rgba(0, 0, 0, 0.2);
        padding: 12px;
        border-radius: 6px;
        border: 1px solid rgba(66, 165, 245, 0.2);
      `;

      // Statistical measures
      const statsData = [
        { label: 'Median Interval', value: formatDuration(detailedStats.median), color: '#42A5F5', icon: '📊' },
        { label: 'Mean Interval', value: formatDuration(detailedStats.mean), color: '#42A5F5', icon: '📈' },
        { label: 'Std Deviation', value: formatDuration(detailedStats.stdDev), color: '#FF9800', icon: '📉' },
        { label: 'Variability (CV)', value: detailedStats.coefficientOfVariation !== null ? detailedStats.coefficientOfVariation.toFixed(2) : 'N/A', color: '#FF9800', icon: '🎲' },
      ];

      for (const stat of statsData) {
        const statRow = document.createElement('div');
        statRow.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 8px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 4px;
          transition: background 0.2s;
        `;
        statRow.addEventListener('mouseenter', () => {
          statRow.style.background = 'rgba(255, 255, 255, 0.08)';
        });
        statRow.addEventListener('mouseleave', () => {
          statRow.style.background = 'rgba(255, 255, 255, 0.03)';
        });
        statRow.innerHTML = `
          <span style="color: #aaa; font-size: 11px;">
            <span style="margin-right: 4px;">${stat.icon}</span>${stat.label}
          </span>
          <span style="color: ${stat.color}; font-weight: 700; font-size: 12px;">${stat.value}</span>
        `;
        statsGrid.appendChild(statRow);
      }

      detailedStatsSection.appendChild(statsGrid);

      // Confidence intervals
      const confidenceSection = document.createElement('div');
      confidenceSection.style.cssText = 'margin-bottom: 14px;';
      const confidenceTitle = document.createElement('div');
      confidenceTitle.style.cssText = `
        color: #4CAF50;
        font-weight: 700;
        margin-bottom: 8px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      `;
      confidenceTitle.textContent = '📐 Confidence Intervals';
      confidenceSection.appendChild(confidenceTitle);

      const confidenceGrid = document.createElement('div');
      confidenceGrid.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
        background: rgba(0, 0, 0, 0.2);
        padding: 12px;
        border-radius: 6px;
        border: 1px solid rgba(76, 175, 80, 0.2);
      `;

      const intervals = [
        { label: '25th Percentile', value: formatDuration(detailedStats.interval25th), icon: '⬇️' },
        { label: '50th (Median)', value: formatDuration(detailedStats.median), icon: '➡️' },
        { label: '75th Percentile', value: formatDuration(detailedStats.interval75th), icon: '⬆️' },
      ];

      for (const interval of intervals) {
        const intervalItem = document.createElement('div');
        intervalItem.style.cssText = `
          text-align: center;
          padding: 8px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 4px;
          transition: all 0.2s;
        `;
        intervalItem.addEventListener('mouseenter', () => {
          intervalItem.style.background = 'rgba(76, 175, 80, 0.15)';
          intervalItem.style.transform = 'scale(1.05)';
        });
        intervalItem.addEventListener('mouseleave', () => {
          intervalItem.style.background = 'rgba(255, 255, 255, 0.03)';
          intervalItem.style.transform = '';
        });
        intervalItem.innerHTML = `
          <div style="color: #888; font-size: 9px; margin-bottom: 4px;">
            <span style="margin-right: 2px;">${interval.icon}</span>${interval.label}
          </div>
          <div style="color: #4CAF50; font-weight: 700; font-size: 13px;">${interval.value}</div>
        `;
        confidenceGrid.appendChild(intervalItem);
      }

      confidenceSection.appendChild(confidenceGrid);
      detailedStatsSection.appendChild(confidenceSection);

      // Probability windows
      const probabilitySection = document.createElement('div');
      probabilitySection.style.cssText = 'margin-bottom: 14px;';
      const probabilityTitle = document.createElement('div');
      probabilityTitle.style.cssText = `
        color: #FFEB3B;
        font-weight: 700;
        margin-bottom: 8px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      `;
      probabilityTitle.textContent = '🎯 Probability of Next Restock';
      probabilitySection.appendChild(probabilityTitle);

      const probabilityGrid = document.createElement('div');
      probabilityGrid.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
        background: rgba(0, 0, 0, 0.2);
        padding: 12px;
        border-radius: 6px;
        border: 1px solid rgba(255, 235, 59, 0.2);
      `;

      // Format probability with proper handling of 0% and 100%
      const formatProbability = (prob: number | null): string => {
        if (prob === null) return 'N/A';
        if (prob === 0) return '<1%';
        if (prob === 100) return '>99%';
        return `${prob}%`;
      };

      const probabilities = [
        { label: 'Next 6h:', value: formatProbability(detailedStats.probabilityNext6h) },
        { label: 'Next 24h:', value: formatProbability(detailedStats.probabilityNext24h) },
        { label: 'Next 7d:', value: formatProbability(detailedStats.probabilityNext7d) },
      ];

      const probabilityIcons = ['⏰', '📅', '📆'];
      for (let i = 0; i < probabilities.length; i++) {
        const prob = probabilities[i]!;
        const probItem = document.createElement('div');
        probItem.style.cssText = `
          text-align: center;
          padding: 8px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 4px;
          transition: all 0.2s;
        `;
        probItem.addEventListener('mouseenter', () => {
          probItem.style.background = 'rgba(255, 235, 59, 0.15)';
          probItem.style.transform = 'scale(1.05)';
        });
        probItem.addEventListener('mouseleave', () => {
          probItem.style.background = 'rgba(255, 255, 255, 0.03)';
          probItem.style.transform = '';
        });
        probItem.innerHTML = `
          <div style="color: #888; font-size: 9px; margin-bottom: 4px;">
            <span style="margin-right: 2px;">${probabilityIcons[i]}</span>${prob.label}
          </div>
          <div style="color: #FFEB3B; font-weight: 700; font-size: 13px;">${prob.value}</div>
        `;
        probabilityGrid.appendChild(probItem);
      }

      probabilitySection.appendChild(probabilityGrid);
      detailedStatsSection.appendChild(probabilitySection);

      // Variability and data quality
      const metaSection = document.createElement('div');
      metaSection.style.cssText = `
        padding: 12px;
        border-top: 2px solid rgba(255, 255, 255, 0.1);
        margin-top: 8px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 6px;
      `;

      const metaTitle = document.createElement('div');
      metaTitle.style.cssText = `
        color: #CE93D8;
        font-weight: 700;
        margin-bottom: 8px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      `;
      metaTitle.textContent = '💡 Data Quality';
      metaSection.appendChild(metaTitle);

      const variabilityBadge = document.createElement('span');
      const badgeColors = {
        'highly_variable': '#f44336',
        'moderate': '#FF9800',
        'consistent': '#4CAF50',
      };
      variabilityBadge.style.cssText = `
        display: inline-block;
        padding: 4px 10px;
        background: ${badgeColors[detailedStats.variability]};
        color: white;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 700;
        margin-right: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      `;
      variabilityBadge.textContent = detailedStats.variability.replace('_', ' ');

      const sampleInfo = document.createElement('span');
      sampleInfo.style.cssText = `
        color: #888;
        font-size: 10px;
        background: rgba(255, 255, 255, 0.05);
        padding: 4px 8px;
        border-radius: 8px;
      `;
      sampleInfo.innerHTML = `📊 ${detailedStats.sampleSize} intervals analyzed`;

      metaSection.appendChild(variabilityBadge);
      metaSection.appendChild(sampleInfo);

      const recommendationText = document.createElement('div');
      recommendationText.style.cssText = `
        color: #aaa;
        font-size: 10px;
        margin-top: 8px;
        font-style: italic;
        padding: 8px;
        background: rgba(255, 255, 255, 0.03);
        border-left: 3px solid #CE93D8;
        border-radius: 0 4px 4px 0;
      `;
      recommendationText.innerHTML = `💬 ${detailedStats.recommendedApproach}`;
      metaSection.appendChild(recommendationText);

      detailedStatsSection.appendChild(metaSection);
    } else {
      const noStatsMsg = document.createElement('div');
      noStatsMsg.style.cssText = 'color: #666; font-style: italic; text-align: center;';
      noStatsMsg.textContent = 'Not enough data for detailed statistics';
      detailedStatsSection.appendChild(noStatsMsg);
    }

    // Add detailed stats section to container and track it for global toggle
    itemContainer.appendChild(detailedStatsSection);
    allDetailedStatsSections.push(detailedStatsSection);

    // History section (always create, show "No history" if empty)
    const historySection = document.createElement('div');
    historySection.style.cssText = `
      display: none;
      padding: 12px;
      background: rgba(0, 0, 0, 0.3);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 10px;
    `;

    if (history.length > 0) {
      for (let i = 0; i < Math.min(3, history.length); i++) {
        const record = history[i]!;
        const predDate = record.predictedTime ? new Date(record.predictedTime) : null;
        const actualDate = record.actualTime ? new Date(record.actualTime) : null;

        const recordRow = document.createElement('div');
        recordRow.style.cssText = `
          margin-bottom: ${i < Math.min(3, history.length) - 1 ? '8px' : '0'};
          padding-bottom: ${i < Math.min(3, history.length) - 1 ? '8px' : '0'};
          border-bottom: ${i < Math.min(3, history.length) - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none'};
        `;

        const estimatedRow = document.createElement('div');
        estimatedRow.style.cssText = 'color: #aaa; margin-bottom: 2px;';
        if (predDate) {
          estimatedRow.innerHTML = `
            <span style="color: #42A5F5;">QPM Estimated:</span> ${predDate.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
          `;
        } else {
          estimatedRow.innerHTML = `
            <span style="color: #666;">QPM Estimated:</span> <span style="font-style: italic;">No prediction yet</span>
          `;
        }

        const actualRow = document.createElement('div');
        if (actualDate) {
          let accuracyText = '';
          if (record.differenceMs !== null && record.differenceMs !== undefined) {
            // Format difference as hh:mm:ss
            const diffMs = Math.abs(record.differenceMs);
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
            const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            const diffText = `(${timeStr} range)`;
            const diffColor = diffMs <= 45 * 60 * 1000
              ? '#4CAF50'  // ≤45 min - Green
              : diffMs <= 120 * 60 * 1000
                ? '#FFEB3B'  // ≤2 hours - Yellow
                : diffMs <= 240 * 60 * 1000
                  ? '#FF9800'  // ≤4 hours - Orange
                  : '#f44336';  // >4 hours - Red

            accuracyText = `<span style="color: ${diffColor}; font-weight: 600;">${diffText}</span>`;
          }

          actualRow.style.cssText = 'color: #aaa;';
          actualRow.innerHTML = `
            <span style="color: #4CAF50;">Actual Restock:</span> ${actualDate.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
            ${accuracyText}
          `;
        } else {
          actualRow.style.cssText = 'color: #666;';
          actualRow.textContent = 'Actual Restock: Pending...';
        }

        recordRow.appendChild(estimatedRow);
        recordRow.appendChild(actualRow);
        historySection.appendChild(recordRow);
      }
    } else {
      // No history yet
      const noHistoryMsg = document.createElement('div');
      noHistoryMsg.style.cssText = 'color: #666; font-style: italic; text-align: center;';
      noHistoryMsg.textContent = 'No prediction history yet. Wait for a restock to occur!';
      historySection.appendChild(noHistoryMsg);
    }

    itemContainer.appendChild(historySection);

    // Toggle expand/collapse
    let isExpanded = false;
    itemRow.addEventListener('click', () => {
      isExpanded = !isExpanded;
      historySection.style.display = isExpanded ? 'block' : 'none';
      expandIndicator.style.transform = isExpanded ? 'rotate(180deg)' : '';
    });

    itemsList.appendChild(itemContainer);
  }

  section.appendChild(itemsList);

  if (countdownEntries.length > 0) {
    updateCountdowns();
    if (state.countdownInterval !== null) {
      clearInterval(state.countdownInterval);
    }
    state.countdownInterval = window.setInterval(updateCountdowns, 1000);
  }

  // Wire up global toggle button to show/hide all detailed stats sections
  globalToggleBtn.addEventListener('click', () => {
    isGlobalStatsExpanded = !isGlobalStatsExpanded;

    // Toggle all detailed stats sections
    for (const statsSection of allDetailedStatsSections) {
      statsSection.style.display = isGlobalStatsExpanded ? 'block' : 'none';
    }

    // Update button appearance
    globalToggleBtn.textContent = isGlobalStatsExpanded ? '📊 Hide Detailed Stats' : '📊 Show Detailed Stats';
    globalToggleBtn.style.background = isGlobalStatsExpanded ? 'rgba(66, 165, 245, 0.25)' : 'rgba(66, 165, 245, 0.15)';
  });

  return section;
}

/**
 * Create import section
 */
function createImportSection(state: ShopRestockWindowState): HTMLElement {
  const section = document.createElement('div');
  section.style.cssText = `
    margin-bottom: 20px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border: 2px dashed rgba(255, 255, 255, 0.2);
  `;

  const heading = document.createElement('h4');
  heading.textContent = '📥 Import Discord Data';
  heading.style.cssText = `
    margin: 0 0 12px 0;
    color: var(--qpm-accent, #4CAF50);
    font-size: 14px;
  `;
  section.appendChild(heading);

  const description = document.createElement('p');
  description.style.cssText = `
    margin: 0 0 12px 0;
    font-size: 12px;
    color: var(--qpm-text-muted, #aaa);
    line-height: 1.5;
  `;
  description.textContent = 'Upload a Discord HTML export from the restock channel to import historical data.';
  section.appendChild(description);

  // File input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.html';
  fileInput.style.display = 'none';

  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = '📁 Choose HTML File';
  uploadBtn.style.cssText = `
    padding: 8px 16px;
    background: var(--qpm-accent, #4CAF50);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    margin-right: 8px;
  `;
  uploadBtn.onclick = () => fileInput.click();

  fileInput.onchange = async (e) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ Parsing...';

    try {
      const events = await parseDiscordHtmlFile(file);
      addRestockEvents(events);

      uploadBtn.textContent = `✅ Imported ${events.length} restocks`;
      setTimeout(() => {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📁 Choose HTML File';
      }, 3000);
    } catch (error) {
      log('❌ Failed to parse Discord HTML:', error);
      uploadBtn.textContent = '❌ Import failed';
      setTimeout(() => {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📁 Choose HTML File';
      }, 3000);
    }
  };

  section.appendChild(fileInput);
  section.appendChild(uploadBtn);

  // Export and Clear buttons
  const events = getAllRestockEvents();
  if (events.length > 0) {
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 8px; margin-top: 12px;';

    // Export HTML button
    const exportBtn = document.createElement('button');
    exportBtn.textContent = '📤 Export HTML';
    exportBtn.style.cssText = `
      padding: 8px 16px;
      background: rgba(66, 165, 245, 0.2);
      color: #42A5F5;
      border: 1px solid #42A5F5;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    `;
    exportBtn.onclick = () => {
      exportRestockDataAsHtml();
    };
    buttonContainer.appendChild(exportBtn);

    // Clear data button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '🗑️ Clear Restock Data';
    clearBtn.style.cssText = `
      padding: 8px 16px;
      background: rgba(244, 67, 54, 0.2);
      color: #f44336;
      border: 1px solid #f44336;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    `;
    clearBtn.onclick = () => {
      if (confirm('⚠️ This will clear all Shop Restock history and prediction data.\n\nYour other QPM settings (auto-feed, XP tracking, etc.) will NOT be affected.\n\nThis cannot be undone. Are you sure?')) {
        clearAllRestocks();
        // Reload the UI to reflect cleared state
        renderContent(state);
        alert('✅ Shop restock history and prediction data has been cleared.');
      }
    };
    buttonContainer.appendChild(clearBtn);

    section.appendChild(buttonContainer);
  }

  return section;
}

/**
 * Create summary section
 */
function createSummarySection(summary: ReturnType<typeof getSummaryStats>): HTMLElement {
  const section = document.createElement('div');
  section.style.cssText = `
    margin-bottom: 20px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
  `;

  const heading = document.createElement('h4');
  heading.textContent = '📊 Summary Statistics';
  heading.style.cssText = `
    margin: 0 0 12px 0;
    color: var(--qpm-accent, #4CAF50);
    font-size: 14px;
  `;
  section.appendChild(heading);

  const grid = document.createElement('div');
  grid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  `;

  const stats = [
    { label: 'Total Restocks', value: formatNumber(summary.totalRestocks), icon: '🔄' },
    { label: 'Unique Items', value: formatNumber(summary.uniqueItems), icon: '📦' },
    { label: 'Avg Interval', value: `${summary.avgRestockInterval.toFixed(1)} min`, icon: '⏱️' },
    { label: 'Total Items', value: formatNumber(summary.totalItems), icon: '📊' },
  ];

  if (summary.dateRange) {
    stats.push(
      { label: 'First Restock', value: formatDate(summary.dateRange.start), icon: '📅' },
      { label: 'Last Restock', value: formatDate(summary.dateRange.end), icon: '📅' }
    );
  }

  for (const stat of stats) {
    const card = document.createElement('div');
    card.style.cssText = `
      padding: 12px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    `;

    const label = document.createElement('div');
    label.textContent = `${stat.icon} ${stat.label}`;
    label.style.cssText = `
      font-size: 11px;
      color: var(--qpm-text-muted, #aaa);
      margin-bottom: 4px;
    `;

    const value = document.createElement('div');
    value.textContent = stat.value;
    value.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      color: var(--qpm-text, #fff);
    `;

    card.appendChild(label);
    card.appendChild(value);
    grid.appendChild(card);
  }

  section.appendChild(grid);
  return section;
}

/**
 * Create item statistics section
 */
function createItemStatsSection(): HTMLElement {
  const section = document.createElement('div');
  section.style.cssText = `
    margin-bottom: 20px;
  `;

  const heading = document.createElement('h4');
  heading.textContent = '🎯 Item Statistics';
  heading.style.cssText = `
    margin: 0 0 12px 0;
    color: var(--qpm-accent, #4CAF50);
    font-size: 14px;
  `;
  section.appendChild(heading);

  const statsMap = calculateItemStats();
  const stats = Array.from(statsMap.values())
    .filter(stat => stat.type !== 'unknown') // Filter out unknown items
    .sort((a, b) => b.totalRestocks - a.totalRestocks);

  // Create table
  const table = document.createElement('table');
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  `;

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.style.cssText = `
    border-bottom: 2px solid var(--qpm-border, #444);
    background: rgba(255, 255, 255, 0.05);
  `;

  const headers = ['Item', 'Type', 'Restocks', 'Avg Qty', 'Rate', 'Rarity', 'Last Seen', 'Next Restock'];
  for (const header of headers) {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.cssText = `
      padding: 10px 12px;
      text-align: left;
      color: var(--qpm-text-muted, #aaa);
      font-weight: 600;
    `;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  for (const stat of stats) {
    const row = document.createElement('tr');
    row.style.cssText = `
      border-bottom: 1px solid var(--qpm-border, #444);
    `;

    // Rarity color
    const rarityColors: Record<string, string> = {
      'common': '#aaa',
      'uncommon': '#4CAF50',
      'rare': '#42A5F5',
      'mythic': '#9C27B0',
      'divine': '#FF9800',
      'celestial': '#FFD700',
    };

    // Format next restock time for this specific item
    let nextRestockValue = 'N/A';
    let nextRestockStyle = 'font-size: 11px; color: #aaa;';
    const itemNextAppearance = predictItemNextAppearance(stat.name);

    if (itemNextAppearance) {
      const nextRestockDate = new Date(itemNextAppearance);
      const timeString = nextRestockDate.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      const dateString = nextRestockDate.toLocaleDateString([], {
        month: 'short',
        day: 'numeric'
      });
      nextRestockValue = `${dateString} ${timeString}`;
      nextRestockStyle = 'font-size: 11px; color: #42A5F5; font-weight: 600;';
    }

    const cells = [
      { value: stat.name, style: 'font-weight: 600;' },
      { value: stat.type, style: 'text-transform: capitalize; color: #aaa;' },
      { value: formatNumber(stat.totalRestocks), style: '' },
      { value: stat.avgQuantity.toFixed(1), style: '' },
      { value: `${stat.appearanceRate.toFixed(1)}%`, style: '' },
      { value: stat.rarity, style: `color: ${rarityColors[stat.rarity]}; text-transform: capitalize; font-weight: 600;` },
      { value: new Date(stat.lastSeen).toLocaleDateString(), style: 'font-size: 11px; color: #aaa;' },
      { value: nextRestockValue, style: nextRestockStyle },
    ];

    for (const cell of cells) {
      const td = document.createElement('td');
      td.textContent = cell.value;
      td.style.cssText = `
        padding: 10px 12px;
        ${cell.style}
      `;
      row.appendChild(td);
    }

    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  section.appendChild(table);
  return section;
}

/**
 * Export restock data as HTML (Discord-compatible format)
 */
function exportRestockDataAsHtml(): void {
  const events = getAllRestockEvents();
  if (events.length === 0) {
    log('⚠️ No restock data to export');
    return;
  }

  // Sort events by timestamp
  const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

  // Generate HTML
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Shop Restock Data Export</title>
  <style>
    body { font-family: Arial, sans-serif; background: #36393f; color: #dcddde; padding: 20px; }
    .chatlog__message-group { margin-bottom: 20px; padding: 10px; background: #2f3136; border-radius: 4px; }
    .chatlog__author { font-weight: 600; color: #7289da; margin-bottom: 8px; }
    .chatlog__message-container { margin: 4px 0; padding: 4px 0; }
    .chatlog__timestamp { font-size: 11px; color: #72767d; margin-right: 8px; }
    .chatlog__short-timestamp { font-size: 11px; color: #72767d; margin-right: 8px; }
    .chatlog__content { color: #dcddde; }
  </style>
</head>
<body>
  <h1>Shop Restock Data Export</h1>
  <p>Total Events: ${events.length} | Exported: ${new Date().toLocaleString()}</p>
  <p style="font-size: 12px; color: #72767d;">Note: All times are shown in your local timezone (${Intl.DateTimeFormat().resolvedOptions().timeZone})</p>

  <div class="chatlog__message-group">
    <div class="chatlog__author">Magic Shopkeeper</div>
${sortedEvents.map(event => {
  const date = new Date(event.timestamp);

  // Use user's locale for date formatting (instead of hardcoded en-GB)
  const dateStr = date.toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).replace(',', '');

  // Use user's locale for time formatting (instead of hardcoded en-US)
  const timeStr = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const itemsText = event.items.map(item => {
    return item.quantity > 0 ? `@${item.name} ${item.quantity}` : `@${item.name}`;
  }).join(' | ');

  return `    <div class="chatlog__message-container">
      <span class="chatlog__timestamp"><a>${dateStr}</a></span>
      <span class="chatlog__short-timestamp">${timeStr}</span>
      <div class="chatlog__content">${itemsText}</div>
    </div>`;
}).join('\n')}
  </div>
</body>
</html>`;

  // Trigger download
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qpm-shop-restock-export-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);

  log(`✅ Exported ${events.length} restock events to HTML`);
}

/**
 * Clamp window position to ensure it stays visible within viewport
 */
function clampWindowPosition(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 8; // Minimum margin from viewport edges

  let top = parseFloat(element.style.top) || rect.top;
  let left = parseFloat(element.style.left) || rect.left;
  let right = parseFloat(element.style.right);

  // If using right positioning, convert to left
  if (!isNaN(right) && element.style.right !== '') {
    left = vw - rect.right;
    element.style.right = '';
  }

  // Clamp position to keep window visible
  const maxLeft = Math.max(margin, vw - rect.width - margin);
  const maxTop = Math.max(margin, vh - rect.height - margin);

  left = Math.min(Math.max(left, margin), maxLeft);
  top = Math.min(Math.max(top, margin), maxTop);

  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
}

/**
 * Make element draggable
 */
function makeDraggable(element: HTMLElement, handle: HTMLElement): void {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e: MouseEvent) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e: MouseEvent) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    element.style.top = element.offsetTop - pos2 + 'px';
    element.style.left = element.offsetLeft - pos1 + 'px';
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
    // Clamp position after dragging to ensure window stays visible
    clampWindowPosition(element);
  }
}

/**
 * Show shop restock window
 */
export function showShopRestockWindow(state: ShopRestockWindowState): void {
  state.root.style.display = 'block';
}

/**
 * Hide shop restock window
 */
export function hideShopRestockWindow(state: ShopRestockWindowState): void {
  state.root.style.display = 'none';
}

/**
 * Destroy shop restock window
 */
export function destroyShopRestockWindow(state: ShopRestockWindowState): void {
  // Clear countdown interval
  if (state.countdownInterval !== null) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }

  // Remove resize listener
  if (state.resizeListener !== null) {
    window.removeEventListener('resize', state.resizeListener);
    state.resizeListener = null;
  }

  // Stop live tracking
  stopLiveShopTracking();

  state.root.remove();
}
