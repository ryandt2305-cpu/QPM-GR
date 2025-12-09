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
  predictItemNextAppearance,
  getPredictionHistory,
  getWindowPredictions,
  getCurrentMonitoringAlerts,
  formatTimeWindow,
  getItemConfig,
  type PredictionRecord,
  type WindowBasedPrediction,
  type PredictionWindow,
} from '../features/shopRestockTracker';
import {
  startLiveShopTracking,
  stopLiveShopTracking,
  isLiveTrackingActive,
  enableLiveTracking,
  disableLiveTracking,
  isLiveTrackingEnabled,
} from '../features/shopRestockLiveTracker';
import { parseRestockFile } from '../features/shopRestockParser';
import { log } from '../utils/logger';
import { getCropSpriteDataUrl } from '../utils/spriteExtractor';

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

  // Subscribe to updates with debouncing to prevent excessive re-renders
  let debounceTimer: number | null = null;
  onRestockUpdate(() => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      renderContent(state);
    }, 500); // Debounce 500ms to batch rapid updates
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
    // Show loading placeholder for heavy sections
    const loadingPlaceholder = document.createElement('div');
    loadingPlaceholder.style.cssText = `
      text-align: center;
      padding: 40px 20px;
      color: var(--qpm-text-muted, #aaa);
    `;
    loadingPlaceholder.textContent = '⏳ Loading predictions and statistics...';
    state.contentContainer.appendChild(loadingPlaceholder);

    // Defer heavy rendering to next frame to prevent UI blocking
    requestAnimationFrame(() => {
      state.contentContainer.removeChild(loadingPlaceholder);

      // Prediction section (expensive - uses cached data but still creates DOM)
      const predictionSection = createPredictionSection(state);
      state.contentContainer.appendChild(predictionSection);

      const summarySection = createSummarySection(summary);
      state.contentContainer.appendChild(summarySection);

      // Item statistics (expensive - iterates all events)
      const statsSection = createItemStatsSection();
      state.contentContainer.appendChild(statsSection);
    });
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

function buildRestockPayload(events: ReturnType<typeof getAllRestockEvents>) {
  return {
    version: '2025-12-08',
    exportedAt: Date.now(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    events: events.map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      dateString: event.dateString,
      source: event.source,
      items: event.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        type: item.type,
      })),
    })),
  };
}

function serializePayload(payload: unknown): string {
  // Replace < to avoid breaking the script tag when embedded in HTML
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

function formatExportDate(timestamp: number): { full: string; time: string } {
  const date = new Date(timestamp);
  const full = date
    .toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(',', '');

  const time = date.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return { full, time };
}

/**
 * Create prediction section (window-based)
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
  heading.textContent = '🔮 Next Rare Restock Windows';
  heading.style.cssText = `
    margin: 0 0 4px 0;
    color: #42A5F5;
    font-size: 14px;
  `;
  section.appendChild(heading);

  // Add disclaimer
  const disclaimer = document.createElement('p');
  disclaimer.textContent = 'Window-based predictions from pseudo-RNG analysis of 34,861 events';
  disclaimer.style.cssText = `
    margin: 0 0 12px 0;
    font-size: 10px;
    color: #888;
    font-style: italic;
  `;
  section.appendChild(disclaimer);

  // Get all window predictions
  const predictions = getWindowPredictions();

  // Get current monitoring alerts
  const alerts = getCurrentMonitoringAlerts();

  // Show alerts if any
  if (alerts.length > 0) {
    const alertsContainer = document.createElement('div');
    alertsContainer.style.cssText = `
      margin-bottom: 12px;
      padding: 10px;
      background: rgba(255, 152, 0, 0.15);
      border: 2px solid rgba(255, 152, 0, 0.4);
      border-radius: 6px;
    `;

    const alertsTitle = document.createElement('div');
    alertsTitle.textContent = '🚨 Active Alerts';
    alertsTitle.style.cssText = `
      color: #FF9800;
      font-weight: 700;
      font-size: 11px;
      margin-bottom: 8px;
      text-transform: uppercase;
    `;
    alertsContainer.appendChild(alertsTitle);

    for (const alert of alerts) {
      const alertRow = document.createElement('div');
      alertRow.style.cssText = `
        padding: 6px 8px;
        margin-bottom: 4px;
        background: rgba(0, 0, 0, 0.3);
        border-left: 3px solid ${alert.urgency === 'high' ? '#f44336' : alert.urgency === 'medium' ? '#FF9800' : '#4CAF50'};
        border-radius: 3px;
        font-size: 10px;
        color: #fff;
      `;
      alertRow.textContent = alert.message;
      alertsContainer.appendChild(alertRow);
    }

    section.appendChild(alertsContainer);
  }

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
    const prediction = predictions.get(rareItem.name);
    const history = getPredictionHistory(rareItem.name);

    if (!prediction) continue;

    // Container for item + details
    const itemContainer = document.createElement('div');
    itemContainer.style.cssText = `
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      border-left: 3px solid ${rareItem.color};
      overflow: hidden;
    `;

    // Main row (current status)
    const itemRow = document.createElement('div');
    itemRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
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

    // Add crop/seed sprite
    const cropSprite = getCropSpriteDataUrl(rareItem.name);
    if (cropSprite) {
      const spriteImg = document.createElement('img');
      spriteImg.src = cropSprite;
      spriteImg.alt = rareItem.name;
      spriteImg.style.cssText = `
        width: 16px;
        height: 16px;
        image-rendering: pixelated;
        border-radius: 3px;
        border: 1px solid rgba(168, 139, 250, 0.2);
      `;
      leftSide.appendChild(spriteImg);
    }

    const itemName = document.createElement('span');
    itemName.textContent = rareItem.name;
    itemName.style.cssText = `
      color: ${rareItem.color};
      font-weight: 600;
      font-size: 12px;
    `;

    // Expand indicator
    const expandIndicator = document.createElement('span');
    expandIndicator.textContent = '▼';
    expandIndicator.style.cssText = `
      color: #aaa;
      font-size: 10px;
      transition: transform 0.2s;
    `;

    leftSide.appendChild(itemName);
    leftSide.appendChild(expandIndicator);

    // Status and windows display
    const statusContainer = document.createElement('div');
    statusContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      font-size: 10px;
    `;

    // Status badge
    const statusBadge = document.createElement('div');
    statusBadge.style.cssText = `
      padding: 3px 8px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 9px;
      text-transform: uppercase;
    `;

    if (prediction.cooldownActive) {
      statusBadge.textContent = '⏳ Cooldown';
      statusBadge.style.cssText += 'background: rgba(244, 67, 54, 0.3); color: #f44336; border: 1px solid #f44336;';
    } else if (prediction.tooEarly) {
      statusBadge.textContent = '⏰ Too Early';
      statusBadge.style.cssText += 'background: rgba(255, 152, 0, 0.3); color: #FF9800; border: 1px solid #FF9800;';
    } else {
      statusBadge.textContent = '📊 Monitoring';
      statusBadge.style.cssText += 'background: rgba(66, 165, 245, 0.3); color: #42A5F5; border: 1px solid #42A5F5;';
    }

    statusContainer.appendChild(statusBadge);

    // Next window time range (always visible) - combines both prediction methods
    const nextWindowDisplay = document.createElement('div');
    nextWindowDisplay.style.cssText = 'color: #42A5F5; font-size: 10px; font-weight: 600; text-align: right;';

    if (!prediction.cooldownActive && !prediction.tooEarly) {
      // Combine pseudo-RNG window and statistical prediction to show range
      let earliestTime: number | null = null;
      let latestTime: number | null = null;

      const now = Date.now();

      // Get earliest from pseudo-RNG windows (show windows that haven't ended yet)
      if (prediction.nextWindows.length > 0) {
        // Find first window where end time hasn't passed yet
        const activeWindow = prediction.nextWindows.find(w => w.endTime >= now);
        if (activeWindow) {
          earliestTime = activeWindow.startTime;
          latestTime = activeWindow.endTime;
        }
      }

      // Compare with statistical prediction range (show if range hasn't ended)
      if (prediction.statisticalPrediction) {
        const statEarliest = prediction.statisticalPrediction.certaintyRange.earliest;
        const statLatest = prediction.statisticalPrediction.certaintyRange.latest;

        // Include statistical prediction if the end time hasn't passed yet
        if (statLatest >= now) {
          earliestTime = earliestTime ? Math.min(earliestTime, statEarliest) : statEarliest;
          latestTime = latestTime ? Math.max(latestTime, statLatest) : statLatest;
        }
      }

      // Display if the prediction window hasn't completely passed
      if (earliestTime && latestTime && latestTime >= now) {
        const earliestDate = new Date(earliestTime);
        const latestDate = new Date(latestTime);
        const earliestStr = earliestDate.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        const latestStr = latestDate.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        nextWindowDisplay.textContent = `${earliestStr} - ${latestStr}`;
      }
    } else if (prediction.cooldownActive && prediction.hardCooldownRemaining !== null) {
      // Show cooldown countdown
      nextWindowDisplay.style.color = '#f44336';
      nextWindowDisplay.setAttribute('data-countdown-target', String(Date.now() + (prediction.hardCooldownRemaining * 60 * 60 * 1000)));
      nextWindowDisplay.setAttribute('data-countdown-prefix', 'Cooldown: ');
    } else if (prediction.tooEarly && prediction.practicalMinimumRemaining !== null) {
      // Show practical minimum countdown
      nextWindowDisplay.style.color = '#FF9800';
      nextWindowDisplay.setAttribute('data-countdown-target', String(Date.now() + (prediction.practicalMinimumRemaining * 60 * 60 * 1000)));
      nextWindowDisplay.setAttribute('data-countdown-prefix', 'Monitor in: ');
    }

    if (nextWindowDisplay.textContent || nextWindowDisplay.hasAttribute('data-countdown-target')) {
      statusContainer.appendChild(nextWindowDisplay);
    }

    // Time since last seen
    if (prediction.timeSinceLastSeen !== null) {
      const timeSinceText = document.createElement('div');
      timeSinceText.style.cssText = 'color: #aaa; font-size: 9px;';
      const hours = prediction.timeSinceLastSeen.toFixed(1);
      const days = (prediction.timeSinceLastSeen / 24).toFixed(1);
      timeSinceText.textContent = `Last seen: ${days}d ago (${hours}h)`;
      statusContainer.appendChild(timeSinceText);
    }

    itemRow.appendChild(leftSide);
    itemRow.appendChild(statusContainer);
    itemContainer.appendChild(itemRow);

    // Details section (collapsible)
    const detailsSection = document.createElement('div');
    detailsSection.style.cssText = `
      display: none;
      padding: 12px;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(33, 150, 243, 0.1) 100%);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 10px;
    `;

    // Show cooldown/practical minimum if active
    if (prediction.cooldownActive || prediction.tooEarly) {
      const waitSection = document.createElement('div');
      waitSection.style.cssText = `
        padding: 10px;
        background: rgba(255, 152, 0, 0.1);
        border-left: 3px solid #FF9800;
        border-radius: 3px;
        margin-bottom: 10px;
      `;

      if (prediction.cooldownActive && prediction.hardCooldownRemaining !== null) {
        const cooldownText = document.createElement('div');
        cooldownText.style.cssText = 'color: #f44336; font-weight: 600; margin-bottom: 4px;';
        cooldownText.setAttribute('data-countdown-target', String(Date.now() + (prediction.hardCooldownRemaining * 60 * 60 * 1000)));
        cooldownText.setAttribute('data-countdown-prefix', '⏳ Hard cooldown: ');
        waitSection.appendChild(cooldownText);
      }

      if (prediction.tooEarly && prediction.practicalMinimumRemaining !== null) {
        const practicalText = document.createElement('div');
        practicalText.style.cssText = 'color: #FF9800; font-weight: 600; margin-bottom: 4px;';
        practicalText.setAttribute('data-countdown-target', String(Date.now() + (prediction.practicalMinimumRemaining * 60 * 60 * 1000)));
        practicalText.setAttribute('data-countdown-prefix', '⏰ Practical minimum: ');
        waitSection.appendChild(practicalText);

        const explanation = document.createElement('div');
        explanation.style.cssText = 'color: #888; font-size: 9px; margin-top: 4px; font-style: italic;';
        explanation.textContent = 'Based on historical intervals - prevents false alarms';
        waitSection.appendChild(explanation);
      }

      detailsSection.appendChild(waitSection);
    }

    // Show correlation signals
    if (prediction.correlationSignals && prediction.correlationSignals.length > 0) {
      const correlationSection = document.createElement('div');
      correlationSection.style.cssText = `
        padding: 10px;
        background: rgba(206, 147, 216, 0.1);
        border-left: 3px solid #CE93D8;
        border-radius: 3px;
        margin-bottom: 10px;
      `;

      const correlationTitle = document.createElement('div');
      correlationTitle.style.cssText = 'color: #CE93D8; font-weight: 700; margin-bottom: 6px;';
      correlationTitle.textContent = '🔗 Correlation Signals';
      correlationSection.appendChild(correlationTitle);

      for (const signal of prediction.correlationSignals) {
        const signalRow = document.createElement('div');
        signalRow.style.cssText = 'color: #fff; margin-bottom: 4px;';
        const probabilityPercent = (signal.probability * 100).toFixed(0);
        signalRow.innerHTML = `<span style="color: #FFD700;">Sunflower detected</span> → <span style="color: ${rareItem.color};">${rareItem.name} possible</span> <span style="color: #CE93D8;">(${probabilityPercent}%)</span>`;
        correlationSection.appendChild(signalRow);

        const timeAgo = document.createElement('div');
        timeAgo.style.cssText = 'color: #888; font-size: 9px; margin-left: 12px;';
        const hoursAgo = ((Date.now() - signal.detectedAt) / (1000 * 60 * 60)).toFixed(1);
        timeAgo.textContent = `Detected ${hoursAgo}h ago`;
        correlationSection.appendChild(timeAgo);
      }

      detailsSection.appendChild(correlationSection);
    }

    // Show next windows (filter out windows that have completely passed)
    const now = Date.now();
    const activeWindows = prediction.nextWindows.filter(w => w.endTime >= now);

    if (activeWindows.length > 0) {
      const windowsSection = document.createElement('div');
      windowsSection.style.cssText = `
        padding: 10px;
        background: rgba(66, 165, 245, 0.1);
        border-left: 3px solid #42A5F5;
        border-radius: 3px;
        margin-bottom: 10px;
      `;

      const windowsTitle = document.createElement('div');
      windowsTitle.style.cssText = 'color: #42A5F5; font-weight: 700; margin-bottom: 6px;';
      windowsTitle.textContent = '📅 Next Possible Windows';
      windowsSection.appendChild(windowsTitle);

      for (let i = 0; i < Math.min(5, activeWindows.length); i++) {
        const window = activeWindows[i]!
        const windowRow = document.createElement('div');
        windowRow.style.cssText = `
          padding: 6px 8px;
          margin-bottom: 4px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 3px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        `;

        const timeText = document.createElement('span');
        timeText.style.cssText = 'color: #fff;';
        timeText.textContent = formatTimeWindow(window);

        const confidenceBadge = document.createElement('span');
        confidenceBadge.style.cssText = `
          padding: 2px 6px;
          border-radius: 8px;
          font-size: 8px;
          font-weight: 700;
          text-transform: uppercase;
        `;
        if (window.confidence === 'high') {
          confidenceBadge.textContent = 'HIGH';
          confidenceBadge.style.cssText += 'background: #4CAF50; color: white;';
        } else if (window.confidence === 'medium') {
          confidenceBadge.textContent = 'MED';
          confidenceBadge.style.cssText += 'background: #FF9800; color: white;';
        } else {
          confidenceBadge.textContent = 'LOW';
          confidenceBadge.style.cssText += 'background: #666; color: white;';
        }

        windowRow.appendChild(timeText);
        windowRow.appendChild(confidenceBadge);
        windowsSection.appendChild(windowRow);
      }

      detailsSection.appendChild(windowsSection);
    }

    // Show monitoring schedule
    if (prediction.monitoringSchedule) {
      const scheduleSection = document.createElement('div');
      scheduleSection.style.cssText = `
        padding: 10px;
        background: rgba(76, 175, 80, 0.1);
        border-left: 3px solid #4CAF50;
        border-radius: 3px;
        margin-bottom: 10px;
      `;

      const scheduleTitle = document.createElement('div');
      scheduleTitle.style.cssText = 'color: #4CAF50; font-weight: 700; margin-bottom: 6px;';
      scheduleTitle.textContent = '⏰ Monitoring Schedule';
      scheduleSection.appendChild(scheduleTitle);

      const scheduleText = document.createElement('div');
      scheduleText.style.cssText = 'color: #aaa; margin-bottom: 6px;';
      scheduleText.textContent = prediction.monitoringSchedule.message;
      scheduleSection.appendChild(scheduleText);

      const hoursContainer = document.createElement('div');
      hoursContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px;';

      const currentHour = new Date().getHours();

      for (const hour of prediction.monitoringSchedule.optimalHours) {
        const hourBadge = document.createElement('span');
        const isCurrentHour = hour === currentHour;

        hourBadge.style.cssText = `
          padding: 3px 6px;
          background: ${isCurrentHour ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)'};
          border: 1px solid ${isCurrentHour ? '#4CAF50' : '#f44336'};
          border-radius: 4px;
          font-size: 9px;
          font-weight: 600;
          color: ${isCurrentHour ? '#4CAF50' : '#f44336'};
        `;
        const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        const period = hour >= 12 ? 'PM' : 'AM';
        hourBadge.textContent = `${hour12}${period}`;
        hoursContainer.appendChild(hourBadge);
      }

      scheduleSection.appendChild(hoursContainer);
      detailsSection.appendChild(scheduleSection);
    }

    // Past 3 restocks section
    const allEvents = getAllRestockEvents();
    const itemRestocks = allEvents
      .filter(event => event.items.some(item => item.name === rareItem.name))
      .sort((a, b) => b.timestamp - a.timestamp) // Most recent first
      .slice(0, 3);

    if (itemRestocks.length > 0) {
      const historySection = document.createElement('div');
      historySection.style.cssText = `
        padding: 10px;
        background: rgba(0, 0, 0, 0.3);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 3px;
      `;

      const historyTitle = document.createElement('div');
      historyTitle.style.cssText = 'color: #42A5F5; font-weight: 700; margin-bottom: 6px;';
      historyTitle.textContent = '📊 Past 3 Restocks';
      historySection.appendChild(historyTitle);

      for (const event of itemRestocks) {
        const restockDate = new Date(event.timestamp);
        const historyRow = document.createElement('div');
        historyRow.style.cssText = `
          color: #aaa;
          font-size: 9px;
          margin-bottom: 4px;
          padding: 4px 6px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 3px;
        `;
        historyRow.innerHTML = `
          <span style="color: #4CAF50;">✓</span> ${restockDate.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
        `;
        historySection.appendChild(historyRow);
      }

      detailsSection.appendChild(historySection);
    }

    itemContainer.appendChild(detailsSection);

    // Toggle expand/collapse
    let isExpanded = false;
    itemRow.addEventListener('click', () => {
      isExpanded = !isExpanded;
      detailsSection.style.display = isExpanded ? 'block' : 'none';
      expandIndicator.style.transform = isExpanded ? 'rotate(180deg)' : '';
    });

    itemsList.appendChild(itemContainer);
  }

  section.appendChild(itemsList);

  // Setup live countdowns (performance-friendly, update every second)
  const updateCountdowns = () => {
    const now = Date.now();
    const countdownElements = section.querySelectorAll('[data-countdown-target]');

    countdownElements.forEach(el => {
      const element = el as HTMLElement;
      const target = parseInt(element.getAttribute('data-countdown-target') || '0', 10);
      const prefix = element.getAttribute('data-countdown-prefix') || '';

      if (target > 0) {
        const diff = target - now;

        if (diff <= 0) {
          // Countdown finished
          element.textContent = prefix + '00d 00h 00m 00s';
          element.style.color = '#4CAF50';
        } else {
          // Calculate dd:hh:mm:ss
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);

          const formatted = `${days.toString().padStart(2, '0')}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
          element.textContent = prefix + formatted;
        }
      }
    });
  };

  // Initial update
  updateCountdowns();

  // Update every second (only if window is still in DOM)
  if (state.countdownInterval !== null) {
    clearInterval(state.countdownInterval);
  }
  state.countdownInterval = window.setInterval(() => {
    // Check if section is still in DOM before updating
    if (document.contains(section)) {
      updateCountdowns();
    } else {
      // Cleanup if removed from DOM
      if (state.countdownInterval !== null) {
        clearInterval(state.countdownInterval);
        state.countdownInterval = null;
      }
    }
  }, 1000);

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
  description.textContent = 'Upload a Discord HTML export from the restock channel to import historical data. You can also import the smaller JSON export.';
  section.appendChild(description);

  // File input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.html,.json';
  fileInput.style.display = 'none';

  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = '📁 Choose File';
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
      const events = await parseRestockFile(file);
      addRestockEvents(events);

      uploadBtn.textContent = `✅ Imported ${events.length} restocks`;
      setTimeout(() => {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📁 Choose File';
      }, 3000);
    } catch (error) {
      log('❌ Failed to parse Discord HTML:', error);
      uploadBtn.textContent = '❌ Import failed';
      setTimeout(() => {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📁 Choose File';
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

    // Export JSON button (smaller payload for sharing)
    const exportJsonBtn = document.createElement('button');
    exportJsonBtn.textContent = '📦 Export JSON (small)';
    exportJsonBtn.style.cssText = `
      padding: 8px 16px;
      background: rgba(66, 165, 245, 0.08);
      color: #42A5F5;
      border: 1px solid rgba(66, 165, 245, 0.6);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    `;
    exportJsonBtn.onclick = () => {
      exportRestockDataAsJson();
    };
    buttonContainer.appendChild(exportJsonBtn);

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
 * Create item statistics section (virtualized for performance)
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

  // Performance: Only render top 30 items initially
  const INITIAL_ITEMS = 30;
  let currentlyShowing = INITIAL_ITEMS;
  let isExpanded = false;

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

  // Helper function to create a row
  const createRow = (stat: ReturnType<typeof calculateItemStats> extends Map<string, infer T> ? T : never) => {
    const row = document.createElement('tr');
    row.style.cssText = `
      border-bottom: 1px solid var(--qpm-border, #444);
    `;

    // Rarity colors
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

    return row;
  };

  // Render initial items
  for (let i = 0; i < Math.min(INITIAL_ITEMS, stats.length); i++) {
    tbody.appendChild(createRow(stats[i]!));
  }

  table.appendChild(tbody);
  section.appendChild(table);

  // Add "Show More" button if there are more items
  if (stats.length > INITIAL_ITEMS) {
    const showMoreBtn = document.createElement('button');
    showMoreBtn.textContent = `📋 Show All Items (${stats.length - INITIAL_ITEMS} more)`;
    showMoreBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      margin-top: 12px;
      background: rgba(66, 165, 245, 0.15);
      border: 1px solid rgba(66, 165, 245, 0.3);
      color: #42A5F5;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s;
    `;

    showMoreBtn.addEventListener('mouseenter', () => {
      showMoreBtn.style.background = 'rgba(66, 165, 245, 0.25)';
    });

    showMoreBtn.addEventListener('mouseleave', () => {
      showMoreBtn.style.background = isExpanded ? 'rgba(66, 165, 245, 0.2)' : 'rgba(66, 165, 245, 0.15)';
    });

    showMoreBtn.addEventListener('click', () => {
      if (!isExpanded) {
        // Show all remaining items
        showMoreBtn.textContent = '⏳ Loading...';
        showMoreBtn.disabled = true;

        // Defer rendering to prevent UI freeze
        requestAnimationFrame(() => {
          for (let i = currentlyShowing; i < stats.length; i++) {
            tbody.appendChild(createRow(stats[i]!));
          }
          currentlyShowing = stats.length;
          isExpanded = true;

          showMoreBtn.textContent = '📋 Show Less';
          showMoreBtn.disabled = false;
          showMoreBtn.style.background = 'rgba(66, 165, 245, 0.2)';
        });
      } else {
        // Collapse back to initial items
        while (tbody.children.length > INITIAL_ITEMS) {
          tbody.removeChild(tbody.lastChild!);
        }
        currentlyShowing = INITIAL_ITEMS;
        isExpanded = false;
        showMoreBtn.textContent = `📋 Show All Items (${stats.length - INITIAL_ITEMS} more)`;
        showMoreBtn.style.background = 'rgba(66, 165, 245, 0.15)';
      }
    });

    section.appendChild(showMoreBtn);
  }

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

  // Build JSON payload for lossless import
  const payload = buildRestockPayload(sortedEvents);

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
  const { full: dateStr, time: timeStr } = formatExportDate(event.timestamp);

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
  <script id="qpm-restock-data" type="application/json">${serializePayload(payload)}</script>
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

function exportRestockDataAsJson(): void {
  const events = getAllRestockEvents();
  if (events.length === 0) {
    log('⚠️ No restock data to export');
    return;
  }

  const payload = buildRestockPayload([...events].sort((a, b) => a.timestamp - b.timestamp));
  const blob = new Blob([serializePayload(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qpm-shop-restock-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  log(`✅ Exported ${events.length} restock events to JSON`);
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
