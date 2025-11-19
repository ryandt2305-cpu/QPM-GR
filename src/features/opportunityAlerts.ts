// src/features/opportunityAlerts.ts
// Highlights opportunities for the user to take manual action.

import { getWeatherSnapshot, onWeatherSnapshot, type WeatherSnapshot } from '../store/weatherHub';
import { getActivePetsDebug } from '../store/pets';
import { notify } from '../core/notifications';
import { storage } from '../utils/storage';

const STORAGE_KEY = 'qpm.opportunityAlerts.v1';

// Alert configuration
export interface OpportunityAlertsConfig {
  enabled: boolean;
  rareWeatherAlerts: boolean; // Alert on dawn/amber
  petsNearLevelUp: boolean; // Alert when pets are close to leveling (based on XP %)
  lowHungerWarning: boolean; // Alert when pet hunger is low
  mutationOpportunities: boolean; // Alert during good mutation weather
}

interface AlertHistory {
  lastRareWeatherAlert: number;
  lastLowHungerAlert: Map<string, number>; // petId -> timestamp
  lastLevelUpAlert: Map<string, number>; // petId -> timestamp
}

let config: OpportunityAlertsConfig = {
  enabled: true,
  rareWeatherAlerts: true,
  petsNearLevelUp: true,
  lowHungerWarning: true,
  mutationOpportunities: true,
};

const alertHistory: AlertHistory = {
  lastRareWeatherAlert: 0,
  lastLowHungerAlert: new Map(),
  lastLevelUpAlert: new Map(),
};

let initialized = false;
let weatherUnsubscribe: (() => void) | null = null;
let checkInterval: number | null = null;

const RARE_WEATHER_TYPES = ['dawn', 'amber'];
const RARE_WEATHER_COOLDOWN = 10 * 60 * 1000; // Don't spam alerts - 10 min cooldown
const LOW_HUNGER_THRESHOLD = 20; // Alert when hunger < 20%
const LOW_HUNGER_COOLDOWN = 30 * 60 * 1000; // 30 min between hunger alerts per pet
const NEAR_LEVELUP_THRESHOLD = 90; // Alert when >= 90% to next level
const LEVELUP_COOLDOWN = 60 * 60 * 1000; // 1 hour between level-up alerts per pet

function checkRareWeather(weather: WeatherSnapshot): void {
  if (!config.enabled || !config.rareWeatherAlerts) return;

  const isRareWeather = RARE_WEATHER_TYPES.includes(weather.kind || '');
  if (!isRareWeather) return;

  const now = Date.now();
  const timeSinceLastAlert = now - alertHistory.lastRareWeatherAlert;

  if (timeSinceLastAlert < RARE_WEATHER_COOLDOWN) return;

  alertHistory.lastRareWeatherAlert = now;

  const weatherName = weather.kind === 'dawn' ? 'Dawn' : 'Amber';
  const mutationTips = weather.kind === 'dawn'
    ? 'Great for Dawnlit mutations!'
    : 'Great for Amberlit mutations!';

  notify({
    feature: 'OpportunityAlerts',
    level: 'info',
    message: `🌅 ${weatherName} Weather Detected - ${mutationTips}`,
  });
}

function checkMutationOpportunities(weather: WeatherSnapshot): void {
  if (!config.enabled || !config.mutationOpportunities) return;

  const weatherKind = weather.kind || '';

  // Alert on good mutation weather (rain, frost, dawn, amber)
  const mutationWeathers = ['rain', 'frost', 'dawn', 'amber'];
  if (!mutationWeathers.includes(weatherKind)) return;

  // Only show mutation opportunity alerts, don't spam
  // This is already covered by rare weather alerts for dawn/amber
  // For rain/frost, users typically know these are common
}

function checkPetsNearLevelUp(): void {
  if (!config.enabled || !config.petsNearLevelUp) return;

  const pets = getActivePetsDebug();
  const now = Date.now();

  for (const pet of pets) {
    const petId = pet.petId || pet.slotId || `slot-${pet.slotIndex}`;

    // Skip if we alerted recently for this pet
    const lastAlert = alertHistory.lastLevelUpAlert.get(petId) || 0;
    if (now - lastAlert < LEVELUP_COOLDOWN) continue;

    // Check if pet is near level up
    // This is simplified - real implementation would need current XP and next level XP
    const level = pet.level ?? 0;
    const xp = pet.xp ?? 0;

    // For now, we don't have a reliable way to calculate % to next level
    // without species-specific XP tables. This would need to be enhanced.
    // Placeholder implementation:
    const isNearLevelUp = false; // Would calculate: (currentXp / nextLevelXp) >= 0.9

    if (!isNearLevelUp) continue;

    alertHistory.lastLevelUpAlert.set(petId, now);

    notify({
      feature: 'OpportunityAlerts',
      level: 'info',
      message: `🎯 ${pet.name || pet.species} is close to leveling up!`,
    });
  }
}

function checkLowHunger(): void {
  if (!config.enabled || !config.lowHungerWarning) return;

  const pets = getActivePetsDebug();
  const now = Date.now();

  for (const pet of pets) {
    const petId = pet.petId || pet.slotId || `slot-${pet.slotIndex}`;

    // Skip if we alerted recently for this pet
    const lastAlert = alertHistory.lastLowHungerAlert.get(petId) || 0;
    if (now - lastAlert < LOW_HUNGER_COOLDOWN) continue;

    const hungerPct = pet.hungerPct ?? 100;

    if (hungerPct >= LOW_HUNGER_THRESHOLD) continue;

    alertHistory.lastLowHungerAlert.set(petId, now);

    notify({
      feature: 'OpportunityAlerts',
      level: 'warn',
      message: `🍖 ${pet.name || pet.species} is at ${hungerPct.toFixed(0)}% hunger`,
    });
  }
}

function runPeriodicChecks(): void {
  checkPetsNearLevelUp();
  checkLowHunger();
}

function loadConfig(): void {
  try {
    const stored = storage.get<Partial<OpportunityAlertsConfig> | null>(STORAGE_KEY, null);
    if (stored) {
      config = { ...config, ...stored };
    }
  } catch (error) {
    console.error('[opportunityAlerts] Failed to load config:', error);
  }
}

function saveConfig(): void {
  try {
    storage.set(STORAGE_KEY, config);
  } catch (error) {
    console.error('[opportunityAlerts] Failed to save config:', error);
  }
}

export function initializeOpportunityAlerts(): void {
  if (initialized) return;
  initialized = true;

  loadConfig();

  // Subscribe to weather changes
  weatherUnsubscribe = onWeatherSnapshot((weather) => {
    checkRareWeather(weather);
    checkMutationOpportunities(weather);
  }, false);

  // Periodic checks (every 2 minutes)
  checkInterval = window.setInterval(() => {
    runPeriodicChecks();
  }, 120000) as unknown as number;

  // Initial check
  const currentWeather = getWeatherSnapshot();
  checkRareWeather(currentWeather);
}

export function configureOpportunityAlerts(newConfig: Partial<OpportunityAlertsConfig>): void {
  config = { ...config, ...newConfig };
  saveConfig();
}

export function getOpportunityAlertsConfig(): OpportunityAlertsConfig {
  return { ...config };
}

export function disposeOpportunityAlerts(): void {
  weatherUnsubscribe?.();
  weatherUnsubscribe = null;

  if (checkInterval !== null) {
    window.clearInterval(checkInterval);
    checkInterval = null;
  }

  initialized = false;
}

// Manual trigger for testing
export function triggerOpportunityCheck(): void {
  const weather = getWeatherSnapshot();
  checkRareWeather(weather);
  runPeriodicChecks();
}
