// src/features/shopRestockPredictions.ts
// Window-based shop restock predictions using discovered pseudo-RNG patterns

import { log } from '../utils/logger';
import type { RestockEvent } from './shopRestockTracker';

/**
 * Item-specific restock configuration based on analysis of 34,861 events
 * See: RARE_RESTOCK_ANALYSIS.md for full details
 */
interface ItemRestockConfig {
  // Hard cooldown (never violated in historical data)
  hardCooldownHours: number;

  // Practical minimum before showing predictions (mean interval from data)
  practicalMinimumHours: number;

  // Hours of day when item CAN appear (null = all hours allowed)
  allowedHours: number[] | null;

  // Items that correlate with this item's appearance
  correlationItems?: {
    itemName: string;
    windowHours: number; // Within X hours
    probability: number; // 0-1 probability
  }[];

  // Burst behavior (can re-appear quickly)
  burstBehavior?: {
    windowHours: number;
    probability: number; // 0-1 probability
  };
}

/**
 * Restock configurations for tracked rare items
 * Based on empirical analysis of pseudo-RNG patterns
 */
const ITEM_CONFIGS: Record<string, ItemRestockConfig> = {
  'Starweaver': {
    hardCooldownHours: 9.08,
    practicalMinimumHours: 190, // 1.5x mean (126h) = ~8 days (conservative, data-backed)
    allowedHours: [0, 1, 2, 4, 11, 12, 13, 14], // Only 8 hours/day
    correlationItems: [
      { itemName: 'Sunflower', windowHours: 1, probability: 0.235 }
    ]
  },

  'Dawnbinder': {
    hardCooldownHours: 24,
    practicalMinimumHours: 220, // 1.5x mean (147h) = ~9 days (conservative, data-backed)
    allowedHours: [7, 12, 18, 21, 22], // Only 5 hours/day (MOST RESTRICTED)
  },

  'Moonbinder': {
    hardCooldownHours: 24,
    practicalMinimumHours: 200, // 1.5x mean (132h) = ~8 days (conservative, data-backed)
    allowedHours: [0, 6, 7, 8, 16], // Only 5 hours/day
    correlationItems: [
      { itemName: 'Sunflower', windowHours: 1, probability: 0.80 } // STRONG correlation
    ]
  },

  'Sunflower': {
    hardCooldownHours: 0, // No hard cooldown
    practicalMinimumHours: 3, // Show predictions after 3 hours
    allowedHours: null, // Can appear any hour
    burstBehavior: {
      windowHours: 3,
      probability: 0.411 // 41.1% chance to re-appear within 3 hours
    }
  },

  'Mythical Eggs': {
    hardCooldownHours: 0.25, // 15 minute soft cooldown
    practicalMinimumHours: 18, // ~18 hour mean interval
    allowedHours: null, // Can appear any hour
    correlationItems: [
      { itemName: 'Sunflower', windowHours: 1, probability: 0.409 }
    ]
  }
};

/**
 * Time window for prediction
 */
export interface PredictionWindow {
  startTime: number; // Unix timestamp ms
  endTime: number; // Unix timestamp ms
  hour: number; // Hour of day (0-23)
  confidence: 'high' | 'medium' | 'low';
  reason: string; // Why this window?
}

/**
 * Prediction result with time windows
 */
export interface WindowBasedPrediction {
  itemName: string;

  // Next possible windows
  nextWindows: PredictionWindow[];

  // Status
  tooEarly: boolean; // Not enough time has passed
  cooldownActive: boolean; // Still in hard cooldown

  // Metadata
  lastSeenTime: number | null;
  timeSinceLastSeen: number | null; // Hours
  hardCooldownRemaining: number | null; // Hours
  practicalMinimumRemaining: number | null; // Hours

  // Correlation signals
  correlationSignals?: {
    itemName: string;
    detectedAt: number; // Timestamp
    probability: number;
    message: string;
  }[] | undefined;

  // Monitoring recommendation
  monitoringSchedule?: {
    message: string;
    optimalHours: number[]; // Hours of day to monitor
  } | undefined;
}

/**
 * Get next valid time windows for an item
 */
function getNextTimeWindows(
  itemName: string,
  lastSeenTime: number,
  currentTime: number,
  recentEvents: RestockEvent[]
): PredictionWindow[] {
  const config = ITEM_CONFIGS[itemName];
  if (!config) return [];

  const windows: PredictionWindow[] = [];
  const timeSinceLastHours = (currentTime - lastSeenTime) / (1000 * 60 * 60);

  // Don't show windows if we're still in practical minimum
  if (timeSinceLastHours < config.practicalMinimumHours) {
    return [];
  }

  // If no time restrictions, show next 24 hours
  if (!config.allowedHours) {
    const windowStart = currentTime;
    const windowEnd = currentTime + (24 * 60 * 60 * 1000);

    windows.push({
      startTime: windowStart,
      endTime: windowEnd,
      hour: new Date(windowStart).getHours(),
      confidence: 'medium',
      reason: 'No time restrictions - can appear any hour'
    });

    return windows;
  }

  // Get next valid hours based on allowed windows
  const currentDate = new Date(currentTime);
  const currentHour = currentDate.getHours();

  // Find next 5 valid windows
  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    for (const allowedHour of config.allowedHours) {
      // Skip hours that have already passed today
      if (dayOffset === 0 && allowedHour <= currentHour) continue;

      const windowDate = new Date(currentDate);
      windowDate.setDate(windowDate.getDate() + dayOffset);
      windowDate.setHours(allowedHour, 0, 0, 0);

      const windowStart = windowDate.getTime();
      const windowEnd = windowStart + (60 * 60 * 1000); // 1 hour window

      // Determine confidence based on hour popularity (from analysis)
      let confidence: 'high' | 'medium' | 'low' = 'medium';

      // High confidence windows (from heatmap analysis)
      if (itemName === 'Starweaver' && [0, 1, 2, 12].includes(allowedHour)) {
        confidence = 'high';
      } else if (itemName === 'Dawnbinder' && [7, 12].includes(allowedHour)) {
        confidence = 'high';
      } else if (itemName === 'Moonbinder' && [6, 7, 8].includes(allowedHour)) {
        confidence = 'high';
      }

      windows.push({
        startTime: windowStart,
        endTime: windowEnd,
        hour: allowedHour,
        confidence,
        reason: `${allowedHour}:00 is an allowed window (${confidence} confidence)`
      });

      if (windows.length >= 5) break;
    }
    if (windows.length >= 5) break;
  }

  return windows;
}

/**
 * Check for correlation signals in recent events
 */
function checkCorrelationSignals(
  itemName: string,
  recentEvents: RestockEvent[],
  currentTime: number
): Array<{ itemName: string; detectedAt: number; probability: number; message: string }> {
  const config = ITEM_CONFIGS[itemName];
  if (!config?.correlationItems) return [];

  const signals: Array<{ itemName: string; detectedAt: number; probability: number; message: string }> = [];

  for (const correlation of config.correlationItems) {
    // Check if correlated item appeared recently
    const correlatedAppearances = recentEvents
      .filter(event => event.items.some(item => item.name === correlation.itemName))
      .sort((a, b) => b.timestamp - a.timestamp);

    if (correlatedAppearances.length > 0) {
      const latestAppearance = correlatedAppearances[0]!;
      const hoursSinceAppearance = (currentTime - latestAppearance.timestamp) / (1000 * 60 * 60);

      if (hoursSinceAppearance <= correlation.windowHours) {
        signals.push({
          itemName: correlation.itemName,
          detectedAt: latestAppearance.timestamp,
          probability: correlation.probability,
          message: `${correlation.itemName} detected ${hoursSinceAppearance.toFixed(1)}h ago (${(correlation.probability * 100).toFixed(0)}% correlation)`
        });
      }
    }
  }

  return signals;
}

/**
 * Get window-based prediction for an item
 */
export function predictItemWindows(
  itemName: string,
  lastSeenTime: number | null,
  recentEvents: RestockEvent[]
): WindowBasedPrediction {
  const config = ITEM_CONFIGS[itemName];

  if (!config) {
    return {
      itemName,
      nextWindows: [],
      tooEarly: true,
      cooldownActive: false,
      lastSeenTime: null,
      timeSinceLastSeen: null,
      hardCooldownRemaining: null,
      practicalMinimumRemaining: null
    };
  }

  if (!lastSeenTime) {
    return {
      itemName,
      nextWindows: [],
      tooEarly: true,
      cooldownActive: false,
      lastSeenTime: null,
      timeSinceLastSeen: null,
      hardCooldownRemaining: null,
      practicalMinimumRemaining: null,
      monitoringSchedule: {
        message: 'No historical data - monitor optimal hours',
        optimalHours: config.allowedHours || Array.from({ length: 24 }, (_, i) => i)
      }
    };
  }

  const currentTime = Date.now();
  const timeSinceLastHours = (currentTime - lastSeenTime) / (1000 * 60 * 60);

  // Check hard cooldown
  const cooldownActive = timeSinceLastHours < config.hardCooldownHours;
  const hardCooldownRemaining = cooldownActive
    ? config.hardCooldownHours - timeSinceLastHours
    : 0;

  // Check practical minimum
  const tooEarly = timeSinceLastHours < config.practicalMinimumHours;
  const practicalMinimumRemaining = tooEarly
    ? config.practicalMinimumHours - timeSinceLastHours
    : 0;

  // Get correlation signals (only if not in cooldown or too early)
  const correlationSignals = (!cooldownActive && !tooEarly)
    ? checkCorrelationSignals(itemName, recentEvents, currentTime)
    : [];

  // Get next windows
  const nextWindows = getNextTimeWindows(itemName, lastSeenTime, currentTime, recentEvents);

  // Generate monitoring schedule
  const monitoringSchedule = config.allowedHours ? {
    message: `Optimal monitoring hours (all times local)`,
    optimalHours: config.allowedHours
  } : undefined;

  return {
    itemName,
    nextWindows,
    tooEarly,
    cooldownActive,
    lastSeenTime,
    timeSinceLastSeen: timeSinceLastHours,
    hardCooldownRemaining,
    practicalMinimumRemaining,
    correlationSignals: correlationSignals.length > 0 ? correlationSignals : undefined,
    monitoringSchedule
  };
}

/**
 * Get monitoring alert status for current time
 * Returns items that should trigger monitoring alerts
 */
export function getMonitoringAlerts(
  predictions: Map<string, WindowBasedPrediction>
): Array<{ itemName: string; message: string; urgency: 'high' | 'medium' | 'low' }> {
  const alerts: Array<{ itemName: string; message: string; urgency: 'high' | 'medium' | 'low' }> = [];
  const currentTime = Date.now();
  const currentHour = new Date(currentTime).getHours();

  for (const [itemName, prediction] of predictions.entries()) {
    // Skip if too early or in cooldown
    if (prediction.tooEarly || prediction.cooldownActive) continue;

    // Check if we're currently in a valid window
    const currentWindow = prediction.nextWindows.find(w =>
      currentTime >= w.startTime && currentTime <= w.endTime
    );

    if (currentWindow) {
      alerts.push({
        itemName,
        message: `ACTIVE WINDOW: ${itemName} possible now (${currentWindow.confidence} confidence)`,
        urgency: currentWindow.confidence === 'high' ? 'high' : 'medium'
      });
    }

    // Check if window is starting soon (within 30 minutes)
    const upcomingWindow = prediction.nextWindows.find(w => {
      const minutesUntil = (w.startTime - currentTime) / (1000 * 60);
      return minutesUntil > 0 && minutesUntil <= 30;
    });

    if (upcomingWindow) {
      const minutesUntil = Math.round((upcomingWindow.startTime - currentTime) / (1000 * 60));
      alerts.push({
        itemName,
        message: `UPCOMING: ${itemName} window in ${minutesUntil} minutes (${upcomingWindow.confidence} confidence)`,
        urgency: 'medium'
      });
    }

    // Check correlation signals
    if (prediction.correlationSignals) {
      for (const signal of prediction.correlationSignals) {
        if (signal.probability >= 0.5) {
          alerts.push({
            itemName,
            message: `CORRELATION: ${signal.message}`,
            urgency: signal.probability >= 0.8 ? 'high' : 'medium'
          });
        }
      }
    }
  }

  return alerts.sort((a, b) => {
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });
}

/**
 * Format time window for display
 */
export function formatTimeWindow(window: PredictionWindow): string {
  const startDate = new Date(window.startTime);
  const endDate = new Date(window.endTime);

  const dateStr = startDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: startDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  });

  const startTimeStr = startDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const endTimeStr = endDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  // If same day, show: "Dec 4, 7:00 AM - 8:00 AM"
  // If different days, show: "Dec 4, 11:00 PM - Dec 5, 12:00 AM"
  if (startDate.toDateString() === endDate.toDateString()) {
    return `${dateStr}, ${startTimeStr} - ${endTimeStr}`;
  } else {
    const endDateStr = endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${dateStr} ${startTimeStr} - ${endDateStr} ${endTimeStr}`;
  }
}

/**
 * Get item configuration (for debugging/display)
 */
export function getItemConfig(itemName: string): ItemRestockConfig | null {
  return ITEM_CONFIGS[itemName] || null;
}
