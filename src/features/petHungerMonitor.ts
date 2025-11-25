// Pet Hunger Monitor - Real-time hunger tracking with decay rate calculation
// Provides visual hunger bars, countdown timers, and alerts

import { log } from '../utils/logger';
import { notify, type NotificationLevel } from '../core/notifications';
import { onActivePetInfos, startPetInfoStore, type ActivePetInfo } from '../store/pets';
import { storage } from '../utils/storage';

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
  // Additional analytics
  level: number | null;
  xp: number | null;
  strength: number | null;
  abilities: string[];
  mutations: string[];
  position: { x: number | null; y: number | null } | null;
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
export interface HungerMonitorConfig {
  enabled: boolean;
  alertThresholdPct: number; // Alert when hunger drops below this percentage
  criticalThresholdPct: number; // Critical alert threshold (should be lower than alertThresholdPct)
  flashPetSlots: boolean; // Flash border around pet slots
  largeNotifications: boolean; // Show large modal notifications for critical hunger
  snapshotIntervalSec: number; // How often to take snapshots
  minSnapshotsForRate: number; // Minimum snapshots needed to calculate rate
}

const DEFAULT_CONFIG: HungerMonitorConfig = {
  enabled: true,
  alertThresholdPct: 50, // Alert at 50% hunger by default
  criticalThresholdPct: 15, // Critical alert at 15% hunger by default
  flashPetSlots: true,
  largeNotifications: false, // Disabled by default
  snapshotIntervalSec: 30, // Take snapshot every 30 seconds
  minSnapshotsForRate: 3, // Need 3 snapshots minimum
};

const CONFIG_STORAGE_KEY = 'qpm:hungerMonitor:config';

/**
 * Load configuration from storage
 */
function loadConfig(): HungerMonitorConfig {
  return storage.get(CONFIG_STORAGE_KEY, DEFAULT_CONFIG);
}

/**
 * Save configuration to storage
 */
function saveConfig(cfg: HungerMonitorConfig): void {
  storage.set(CONFIG_STORAGE_KEY, cfg);
}

// Private state
let config: HungerMonitorConfig = loadConfig();
let hungerStates: Map<string, PetHungerState> = new Map();
let hungerHistory: Map<string, HungerSnapshot[]> = new Map();
let lastAlertTimes: Map<string, Map<AlertLevel, number>> = new Map();
let stateChangeCallback: ((states: PetHungerState[]) => void) | null = null;
let unsubscribe: (() => void) | null = null;
let snapshotTimer: number | null = null;
let configChangeCallbacks = new Set<(config: HungerMonitorConfig) => void>();

/**
 * Get alert level based on hunger percentage
 */
function getAlertLevel(hungerPct: number): AlertLevel {
  if (hungerPct >= config.alertThresholdPct) return 'safe';
  if (hungerPct >= config.criticalThresholdPct) return 'warning';
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

  // Alert when hunger drops below configured threshold
  if (state.hungerPct < config.alertThresholdPct) {
    const lastAlert = petAlerts.get(state.alertLevel) || 0;
    if (now - lastAlert > 5 * 60 * 1000) { // Don't spam, wait 5 min between alerts
      const emoji = state.alertLevel === 'critical' ? '🔴' : '⚠️';
      const message = state.alertLevel === 'critical'
        ? `${emoji} ${state.name} IS STARVING! (${Math.round(state.hungerPct)}% hunger)`
        : `${emoji} ${state.name} is getting hungry! (${Math.round(state.hungerPct)}% hunger)`;

      const level = state.alertLevel === 'critical' ? 'error' : 'warn';

      // Show large notification for critical hunger if enabled
      if (config.largeNotifications && state.alertLevel === 'critical') {
        showLargeHungerAlert(state);
      } else {
        showToast(message, level, 5000);
      }

      petAlerts.set(state.alertLevel, now);
      lastAlertTimes.set(state.petId, petAlerts);
    }
  }
}

/**
 * Show large modal alert for critical hunger
 */
function showLargeHungerAlert(state: PetHungerState): void {
  // Create a large, attention-grabbing alert overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 999999;
    background: linear-gradient(135deg, rgba(244, 67, 54, 0.98), rgba(211, 47, 47, 0.98));
    color: white;
    padding: 32px 48px;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 4px rgba(255, 255, 255, 0.1);
    text-align: center;
    animation: qpm-pulse-alert 1s ease-in-out infinite;
    max-width: 500px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Add pulse animation if not already defined
  if (!document.querySelector('#qpm-alert-animation')) {
    const style = document.createElement('style');
    style.id = 'qpm-alert-animation';
    style.textContent = `
      @keyframes qpm-pulse-alert {
        0%, 100% { transform: translate(-50%, -50%) scale(1); }
        50% { transform: translate(-50%, -50%) scale(1.05); }
      }
    `;
    document.head.appendChild(style);
  }

  const icon = document.createElement('div');
  icon.textContent = '🔴';
  icon.style.cssText = 'font-size: 64px; margin-bottom: 16px; line-height: 1;';

  const title = document.createElement('div');
  title.textContent = 'CRITICAL HUNGER ALERT!';
  title.style.cssText = 'font-size: 28px; font-weight: 700; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px;';

  const petName = document.createElement('div');
  petName.textContent = state.name || `Pet ${state.petIndex + 1}`;
  petName.style.cssText = 'font-size: 20px; font-weight: 600; margin-bottom: 8px;';

  const hungerInfo = document.createElement('div');
  hungerInfo.textContent = `${Math.round(state.hungerPct)}% Hunger Remaining`;
  hungerInfo.style.cssText = 'font-size: 24px; font-weight: 700; margin-bottom: 8px;';

  const timeInfo = document.createElement('div');
  timeInfo.textContent = state.estimatedTimeToEmpty !== null
    ? `Estimated time to empty: ${formatTimeRemaining(state.estimatedTimeToEmpty)}`
    : 'Feed your pet immediately!';
  timeInfo.style.cssText = 'font-size: 14px; opacity: 0.9; margin-bottom: 24px;';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Acknowledge';
  closeBtn.style.cssText = `
    background: white;
    color: #d32f2f;
    border: none;
    padding: 12px 32px;
    font-size: 16px;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  `;
  closeBtn.onmouseenter = () => {
    closeBtn.style.background = 'rgba(255, 255, 255, 0.9)';
    closeBtn.style.transform = 'scale(1.05)';
  };
  closeBtn.onmouseleave = () => {
    closeBtn.style.background = 'white';
    closeBtn.style.transform = 'scale(1)';
  };
  closeBtn.onclick = () => {
    overlay.remove();
  };

  overlay.append(icon, title, petName, hungerInfo, timeInfo, closeBtn);
  document.body.appendChild(overlay);

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (overlay.parentElement) {
      overlay.remove();
    }
  }, 10000);
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
      // Additional analytics
      level: info.level,
      xp: info.xp,
      strength: info.strength,
      abilities: info.abilities || [],
      mutations: info.mutations || [],
      position: info.position,
    };

    hungerStates.set(petId, state);

    // Check for alerts
    checkAndTriggerAlert(state);

    // Flash pet slot border if enabled and at warning/critical
    if (config.flashPetSlots && (alertLevel === 'warning' || alertLevel === 'critical')) {
      flashPetSlotBorder(info.slotIndex, alertLevel);
    }
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
 * Flash border around pet slot on screen
 */
function flashPetSlotBorder(slotIndex: number, alertLevel: AlertLevel): void {
  try {
    // Find pet card elements (they have data-slot-index or similar attributes)
    const petCards = document.querySelectorAll('[class*="PetCard"], [class*="pet-card"], [class*="petslot"]');

    if (slotIndex < petCards.length) {
      const card = petCards[slotIndex] as HTMLElement;
      const color = getAlertColor(alertLevel);

      // Add flashing animation
      const originalBoxShadow = card.style.boxShadow;
      const originalTransition = card.style.transition;

      card.style.transition = 'box-shadow 0.5s ease-in-out';
      card.style.boxShadow = `0 0 20px 4px ${color}, inset 0 0 20px 2px ${color}44`;

      // Remove flash after animation
      setTimeout(() => {
        card.style.boxShadow = originalBoxShadow;
        setTimeout(() => {
          card.style.transition = originalTransition;
        }, 500);
      }, 1500);
    }
  } catch (error) {
    // Silently fail if DOM manipulation fails
  }
}

/**
 * Initialize hunger monitoring
 */
export async function initializeHungerMonitor(): Promise<void> {
  if (unsubscribe) {
    log('⚠️ Hunger monitor already initialized');
    return;
  }

  log('✅ Initializing hunger monitor');

  // Load config from storage
  config = loadConfig();

  try {
    // Start pet info store to get hunger data
    await startPetInfoStore();
    log('✅ Pet info store started');
  } catch (error) {
    log('❌ Failed to start pet info store:', error);
    // Don't return - still set up the subscription for when it becomes available
  }

  // Subscribe to pet infos
  unsubscribe = onActivePetInfos((infos) => {
    log(`📊 Hunger monitor received ${infos.length} active pets`);
    if (infos.length === 0) {
      log('⚠️ No active pets found. Make sure pets are summoned in the game.');
    } else {
      log('✅ Active pets:', infos.map(p => `${p.name || 'Unknown'} (${p.hungerPct?.toFixed(1) || '?'}%)`).join(', '));
    }
    updateHungerStates(infos);
  });

  // Start periodic snapshot timer
  snapshotTimer = window.setInterval(() => {
    // Timer just triggers periodic checks, actual snapshots controlled by shouldTakeSnapshot
  }, 1000);

  log('✅ Hunger monitor initialized successfully');
}

/**
 * Manually refresh pet detection (useful for debugging)
 */
export async function refreshPetDetection(): Promise<void> {
  log('🔄 Manually refreshing pet detection...');

  // Stop existing subscription
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  try {
    // Restart pet info store
    await startPetInfoStore();

    // Resubscribe
    unsubscribe = onActivePetInfos((infos) => {
      log(`📊 Refresh: Found ${infos.length} active pets`);
      if (infos.length > 0) {
        log('✅ Pets detected:', infos.map(p => `${p.name || 'Unknown'} (${p.hungerPct?.toFixed(1) || '?'}%)`).join(', '));
      }
      updateHungerStates(infos);
      notifyStateChange();
    });

    showToast(`✅ Refreshed: ${getHungerStates().length} pets found`, 'success', 3000);
  } catch (error) {
    log('❌ Refresh failed:', error);
    showToast('❌ Failed to refresh pet detection', 'error', 3000);
  }
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
  saveConfig(config);

  // Notify config change listeners
  for (const callback of configChangeCallbacks) {
    try {
      callback(config);
    } catch (error) {
      log('⚠️ Config change callback error:', error);
    }
  }

  log('⚙️ Hunger monitor config updated:', config);
}

/**
 * Get current configuration
 */
export function getConfig(): HungerMonitorConfig {
  return { ...config };
}

/**
 * Register callback for configuration changes
 */
export function onConfigChange(callback: (config: HungerMonitorConfig) => void): () => void {
  configChangeCallbacks.add(callback);
  // Fire immediately with current config
  try {
    callback(config);
  } catch (error) {
    log('⚠️ Config change immediate callback error:', error);
  }
  return () => {
    configChangeCallbacks.delete(callback);
  };
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
