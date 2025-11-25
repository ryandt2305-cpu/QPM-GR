// Pet Hunger Monitor - Real-time hunger tracking with decay rate calculation
// Provides visual hunger bars, countdown timers, and alerts

import { log } from '../utils/logger';
import { notify, type NotificationLevel } from '../core/notifications';
import { onActivePetInfos, type ActivePetInfo } from '../store/pets';

// Helper function to show toast notifications
function showToast(message: string, level: NotificationLevel = 'info', _duration?: number): void {
  notify({ feature: 'petHungerMonitor', message, level });
}

/**
 * Alert level based on hunger percentage
 */
export type AlertLevel = 'safe' | 'warning' | 'critical';

/**
 * Pet hunger state with computed values
 */
export interface PetHungerState {
  petIndex: number;
  petId: string;
  name: string;
  species: string;
  hungerPct: number;
  maxHunger: number;
  currentHunger: number;
  estimatedTimeToEmpty: number | null; // minutes
  hungerDecayRate: number | null; // hunger per minute
  lastUpdateTime: number;
  alertLevel: AlertLevel;
  lastFedTime: number | null; // timestamp when last fed (hunger went from low to high)
}

/**
 * Historical hunger snapshot for decay rate calculation
 */
interface HungerSnapshot {
  timestamp: number;
  hunger: number;
  hungerPct: number;
}

/**
 * Configuration for hunger monitoring
 */
interface HungerMonitorConfig {
  enabled: boolean;
  alertAt15Min: boolean;
  alertAt5Min: boolean;
  alertAtCritical: boolean;
  snapshotIntervalSec: number; // How often to take snapshots
  minSnapshotsForRate: number; // Minimum snapshots needed to calculate rate
}

const DEFAULT_CONFIG: HungerMonitorConfig = {
  enabled: true,
  alertAt15Min: true,
  alertAt5Min: true,
  alertAtCritical: true,
  snapshotIntervalSec: 30, // Take snapshot every 30 seconds
  minSnapshotsForRate: 3, // Need 3 snapshots minimum
};

// Private state
let config: HungerMonitorConfig = { ...DEFAULT_CONFIG };
let hungerStates: Map<string, PetHungerState> = new Map();
let hungerHistory: Map<string, HungerSnapshot[]> = new Map();
let lastAlertTimes: Map<string, Map<AlertLevel, number>> = new Map();
let stateChangeCallback: ((states: PetHungerState[]) => void) | null = null;
let unsubscribe: (() => void) | null = null;
let snapshotTimer: number | null = null;

/**
 * Get alert level based on hunger percentage
 */
function getAlertLevel(hungerPct: number): AlertLevel {
  if (hungerPct >= 50) return 'safe';
  if (hungerPct >= 15) return 'warning';
  return 'critical';
}

/**
 * Get alert color for UI
 */
export function getAlertColor(level: AlertLevel): string {
  switch (level) {
    case 'safe': return '#4CAF50';
    case 'warning': return '#FF9800';
    case 'critical': return '#f44336';
  }
}

/**
 * Get alert emoji for UI
 */
export function getAlertEmoji(level: AlertLevel): string {
  switch (level) {
    case 'safe': return '🟢';
    case 'warning': return '⚠️';
    case 'critical': return '🔴';
  }
}

/**
 * Calculate hunger decay rate from historical snapshots
 */
function calculateDecayRate(petId: string): number | null {
  const history = hungerHistory.get(petId);
  if (!history || history.length < config.minSnapshotsForRate) {
    return null;
  }

  // Use linear regression or simple average of deltas
  const deltas: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]!;
    const curr = history[i]!;
    const timeDiff = (curr.timestamp - prev.timestamp) / 1000 / 60; // minutes
    const hungerDiff = prev.hunger - curr.hunger; // hunger lost (positive = decreasing)

    if (timeDiff > 0 && hungerDiff >= 0) {
      deltas.push(hungerDiff / timeDiff); // hunger per minute
    }
  }

  if (deltas.length === 0) return null;

  // Average decay rate
  const avgRate = deltas.reduce((sum, val) => sum + val, 0) / deltas.length;
  return avgRate > 0 ? avgRate : null;
}

/**
 * Estimate time until hunger reaches 0
 */
function estimateTimeToEmpty(currentHunger: number, decayRate: number | null): number | null {
  if (!decayRate || decayRate <= 0 || currentHunger <= 0) {
    return null;
  }

  const minutesToEmpty = currentHunger / decayRate;
  return minutesToEmpty;
}

/**
 * Detect if pet was just fed (hunger increased significantly)
 */
function detectFeedEvent(petId: string, currentHunger: number): boolean {
  const history = hungerHistory.get(petId);
  if (!history || history.length < 2) return false;

  const prev = history[history.length - 2]!;
  const hungerIncrease = currentHunger - prev.hunger;

  // Fed if hunger increased by more than 5% of max
  return hungerIncrease > 5;
}

/**
 * Add hunger snapshot to history
 */
function addHungerSnapshot(petId: string, hunger: number, hungerPct: number): void {
  const now = Date.now();
  let history = hungerHistory.get(petId);

  if (!history) {
    history = [];
    hungerHistory.set(petId, history);
  }

  // Add snapshot
  history.push({
    timestamp: now,
    hunger,
    hungerPct,
  });

  // Keep only last 10 snapshots (5 minutes at 30-second intervals)
  if (history.length > 10) {
    history.shift();
  }
}

/**
 * Check if should take snapshot based on interval
 */
let lastSnapshotTime = 0;

function shouldTakeSnapshot(): boolean {
  const now = Date.now();
  const intervalMs = config.snapshotIntervalSec * 1000;
  if (now - lastSnapshotTime >= intervalMs) {
    lastSnapshotTime = now;
    return true;
  }
  return false;
}

/**
 * Trigger alert notification if threshold reached
 */
function checkAndTriggerAlert(state: PetHungerState): void {
  if (!config.enabled) return;

  const now = Date.now();
  const petAlerts = lastAlertTimes.get(state.petId) || new Map();

  // Alert at 15 minutes remaining
  if (config.alertAt15Min && state.estimatedTimeToEmpty !== null) {
    if (state.estimatedTimeToEmpty <= 15 && state.estimatedTimeToEmpty > 5) {
      const lastAlert = petAlerts.get('warning') || 0;
      if (now - lastAlert > 5 * 60 * 1000) { // Don't spam, wait 5 min between alerts
        showToast(
          `${state.name} will be hungry in ~${Math.round(state.estimatedTimeToEmpty)} minutes`,
          'warn',
          5000
        );
        petAlerts.set('warning', now);
        lastAlertTimes.set(state.petId, petAlerts);
      }
    }
  }

  // Alert at 5 minutes remaining
  if (config.alertAt5Min && state.estimatedTimeToEmpty !== null) {
    if (state.estimatedTimeToEmpty <= 5 && state.estimatedTimeToEmpty > 0) {
      const lastAlert = petAlerts.get('warning') || 0;
      if (now - lastAlert > 3 * 60 * 1000) { // Don't spam, wait 3 min
        showToast(
          `🔔 ${state.name} needs food soon! (~${Math.round(state.estimatedTimeToEmpty)} min)`,
          'warn',
          6000
        );
        petAlerts.set('warning', now);
        lastAlertTimes.set(state.petId, petAlerts);
      }
    }
  }

  // Alert at critical (< 15% hunger)
  if (config.alertAtCritical && state.alertLevel === 'critical') {
    const lastAlert = petAlerts.get('critical') || 0;
    if (now - lastAlert > 5 * 60 * 1000) { // Don't spam, wait 5 min
      showToast(
        `🔴 ${state.name} is starving! (${Math.round(state.hungerPct)}% hunger)`,
        'error',
        8000
      );
      petAlerts.set('critical', now);
      lastAlertTimes.set(state.petId, petAlerts);
    }
  }
}

/**
 * Update hunger states from active pet infos
 */
function updateHungerStates(infos: ActivePetInfo[]): void {
  const now = Date.now();
  const takeSnapshot = shouldTakeSnapshot();

  for (const info of infos) {
    if (!info.petId || info.hungerPct === null || info.hungerValue === null) {
      continue;
    }

    const petId = info.petId;
    const currentHunger = info.hungerValue;
    const hungerPct = info.hungerPct;
    const maxHunger = info.hungerMax || 100;

    // Add snapshot if needed
    if (takeSnapshot) {
      addHungerSnapshot(petId, currentHunger, hungerPct);
    }

    // Calculate decay rate
    const decayRate = calculateDecayRate(petId);
    const timeToEmpty = estimateTimeToEmpty(currentHunger, decayRate);
    const alertLevel = getAlertLevel(hungerPct);

    // Detect feed event
    const wasFed = detectFeedEvent(petId, currentHunger);
    const existingState = hungerStates.get(petId);
    const lastFedTime = wasFed ? now : (existingState?.lastFedTime || null);

    const state: PetHungerState = {
      petIndex: info.slotIndex,
      petId,
      name: info.name || `Pet ${info.slotIndex + 1}`,
      species: info.species || 'Unknown',
      hungerPct,
      maxHunger,
      currentHunger,
      estimatedTimeToEmpty: timeToEmpty,
      hungerDecayRate: decayRate,
      lastUpdateTime: now,
      alertLevel,
      lastFedTime,
    };

    hungerStates.set(petId, state);

    // Check for alerts
    checkAndTriggerAlert(state);
  }

  // Notify listeners
  notifyStateChange();
}

/**
 * Notify state change listeners
 */
function notifyStateChange(): void {
  if (!stateChangeCallback) return;

  const states = Array.from(hungerStates.values()).sort((a, b) => a.petIndex - b.petIndex);
  try {
    stateChangeCallback(states);
  } catch (error) {
    log('⚠️ Hunger state callback error:', error);
  }
}

/**
 * Initialize hunger monitoring
 */
export function initializeHungerMonitor(): void {
  if (unsubscribe) return;

  log('✅ Initializing hunger monitor');

  // Subscribe to pet infos
  unsubscribe = onActivePetInfos((infos) => {
    updateHungerStates(infos);
  });

  // Start periodic snapshot timer
  snapshotTimer = window.setInterval(() => {
    // Timer just triggers periodic checks, actual snapshots controlled by shouldTakeSnapshot
  }, 1000);
}

/**
 * Stop hunger monitoring
 */
export function stopHungerMonitor(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  if (snapshotTimer) {
    window.clearInterval(snapshotTimer);
    snapshotTimer = null;
  }

  hungerStates.clear();
  hungerHistory.clear();
  lastAlertTimes.clear();
  log('🛑 Hunger monitor stopped');
}

/**
 * Register state change callback
 */
export function onHungerStateChange(callback: (states: PetHungerState[]) => void): void {
  stateChangeCallback = callback;

  // Fire immediately with current states
  const states = Array.from(hungerStates.values()).sort((a, b) => a.petIndex - b.petIndex);
  if (states.length > 0) {
    try {
      callback(states);
    } catch (error) {
      log('⚠️ Hunger state immediate callback error:', error);
    }
  }
}

/**
 * Get current hunger states
 */
export function getHungerStates(): PetHungerState[] {
  return Array.from(hungerStates.values()).sort((a, b) => a.petIndex - b.petIndex);
}

/**
 * Get hunger state for specific pet
 */
export function getHungerState(petId: string): PetHungerState | null {
  return hungerStates.get(petId) || null;
}

/**
 * Update configuration
 */
export function updateConfig(updates: Partial<HungerMonitorConfig>): void {
  config = { ...config, ...updates };
  log('⚙️ Hunger monitor config updated:', config);
}

/**
 * Get current configuration
 */
export function getConfig(): HungerMonitorConfig {
  return { ...config };
}

/**
 * Format time remaining as human-readable string
 */
export function formatTimeRemaining(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) {
    return '—';
  }

  if (minutes < 1) {
    return '< 1 min';
  }

  if (minutes < 60) {
    return `~${Math.round(minutes)} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMin = Math.round(minutes % 60);

  if (remainingMin === 0) {
    return `~${hours}h`;
  }

  return `~${hours}h ${remainingMin}m`;
}

/**
 * Format decay rate for display
 */
export function formatDecayRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate) || rate <= 0) {
    return '—';
  }

  return `${rate.toFixed(2)}/min`;
}

/**
 * Format last fed time
 */
export function formatLastFed(timestamp: number | null): string {
  if (!timestamp) return 'Unknown';

  const now = Date.now();
  const elapsed = now - timestamp;
  const minutes = Math.floor(elapsed / 1000 / 60);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
