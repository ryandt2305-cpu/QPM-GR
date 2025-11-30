// src/ui/xpTrackerWindow.ts - XP Tracker window with live XP rate calculations

import { formatCoins } from '../features/valueCalculator';
import { log } from '../utils/logger';
import { onActivePetInfos, type ActivePetInfo } from '../store/pets';
import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';
import {
  calculateXpStats,
  getCombinedXpStats,
  setSpeciesXpPerLevel,
  getSpeciesXpPerLevel,
  getAllSpeciesXpConfig,
  calculateMaxStrength,
  calculateTimeToLevel,
  onXpTrackerUpdate,
  type XpAbilityStats,
} from '../store/xpTracker';
import { calculateLiveETA } from './trackerWindow';
import { getAbilityDefinition, type AbilityDefinition } from '../data/petAbilities';
import { getHungerCapOrDefault } from '../data/petHungerCaps';
import { calculateFeedsPerLevel, calculateFeedsForLevels } from '../data/petHungerDepletion';

export interface XpTrackerWindowState {
  root: HTMLElement;
  summaryText: HTMLElement;
  petLevelTbody: HTMLTableSectionElement; // All active pets level progress
  tbody: HTMLTableSectionElement; // XP generation abilities
  combinedTbody: HTMLTableSectionElement;
  nearMaxLevelContainer: HTMLElement; // Near max level pets list
  updateInterval: number | null;
  latestPets: ActivePetInfo[];
  latestStats: XpAbilityStats[];
  totalTeamXpPerHour: number; // Total XP/hour for the whole team
  lastKnownSpecies: Set<string>; // Track species to detect when config table needs updating
  unsubscribePets: (() => void) | null;
  unsubscribeXpTracker: (() => void) | null;
  resizeListener: (() => void) | null;
}

// XP ability IDs we're tracking (continuous only, excludes hatch XP)
const XP_ABILITY_IDS = ['PetXpBoost', 'PetXpBoostII'];

// Max level for all pets
const MAX_LEVEL = 30;

interface PetWithLevel {
  name: string;
  species: string;
  level: number;
  xp: number;
  maxStr: number | null;
  xpNeeded: number;
  xpPerLevel: number;
  source: 'active' | 'inventory' | 'hutch';
}

/**
 * Parse max level from pet name (e.g., "Food (99)" -> 99)
 * Users often put max level in parentheses for easy viewing
 */
function parseMaxLevelFromName(name: string | null | undefined): number | null {
  if (!name) return null;
  const match = name.match(/\((\d+)\)/);
  return match && match[1] ? parseInt(match[1], 10) : null;
}

/**
 * Get all pets from inventory, hutch, and active slots
 */
async function getAllPets(activePets: ActivePetInfo[]): Promise<PetWithLevel[]> {
  const allPets: PetWithLevel[] = [];

  // Add active pets
  for (const pet of activePets) {
    if (!pet.species || pet.xp === null || pet.strength === null) continue;

    const xpPerLevel = getSpeciesXpPerLevel(pet.species);
    if (!xpPerLevel) continue;

    // Calculate actual max level: hatch level + 30, capped at 100
    // Hatch level = current strength - levels gained from XP
    // Note: Pets can only gain 30 levels max, even though XP can accumulate infinitely
    // Max level is always capped at 100 (pets hatch at 50-70, max is 80-100)
    const levelsGainedFromXp = Math.floor(pet.xp / xpPerLevel);
    const actualLevelsGained = Math.min(30, levelsGainedFromXp); // Cap at 30
    const hatchLevel = pet.strength - actualLevelsGained;
    const maxStr = Math.min(hatchLevel + 30, 100); // Cap at 100

    // Skip if already at max strength
    if (pet.strength >= maxStr) continue;

    // Calculate XP needed to reach max strength
    const levelsRemaining = maxStr - pet.strength;
    const xpTowardsNext = pet.xp % xpPerLevel;
    const xpNeededForNextLevel = xpPerLevel - xpTowardsNext;
    const xpNeeded = xpNeededForNextLevel + (xpPerLevel * (levelsRemaining - 1));

    allPets.push({
      name: pet.name || pet.species,
      species: pet.species,
      level: pet.strength,  // Use actual strength, not calculated level
      xp: pet.xp,
      maxStr,
      xpNeeded,
      xpPerLevel,
      source: 'active',
    });
  }

  // Add inventory pets
  try {
    const inventoryAtom = getAtomByLabel('myInventoryAtom');
    if (inventoryAtom) {
      const inventoryData = await readAtomValue(inventoryAtom) as any;

      if (inventoryData && Array.isArray(inventoryData.items)) {
        for (const item of inventoryData.items) {
          // Use petSpecies if available, otherwise species
          const species = item.petSpecies || item.species;
          if (item.itemType !== 'Pet' || !species || item.xp === null || item.xp === undefined) continue;

          const xpPerLevel = getSpeciesXpPerLevel(species);
          if (!xpPerLevel) continue;

          let currentStrength: number;
          let maxStr: number;

          // Try to get current strength from game data first
          if (item.strength !== null && item.strength !== undefined) {
            currentStrength = item.strength;

            // Calculate max level from current strength and XP
            const levelsGainedFromXp = Math.floor(item.xp / xpPerLevel);
            const actualLevelsGained = Math.min(30, levelsGainedFromXp); // Cap at 30
            const hatchLevel = currentStrength - actualLevelsGained;
            maxStr = Math.min(hatchLevel + 30, 100); // Cap at 100
          } else {
            // If no strength data, try to derive from max level in name and XP
            const parsedMaxLevel = parseMaxLevelFromName(item.name);
            if (!parsedMaxLevel || parsedMaxLevel < 80 || parsedMaxLevel > 100) {
              continue; // Skip if no valid max level in name
            }

            maxStr = parsedMaxLevel;

            // Derive hatch level from max level (max = hatch + 30, capped at 100)
            const hatchLevel = maxStr - 30;

            // Calculate current strength from hatch level + XP gained
            const levelsGainedFromXp = Math.floor(item.xp / xpPerLevel);
            const actualLevelsGained = Math.min(30, levelsGainedFromXp);
            currentStrength = hatchLevel + actualLevelsGained;
          }

          // Skip if already at max strength
          if (currentStrength >= maxStr) continue;

          // Calculate XP needed to reach max strength
          const levelsRemaining = maxStr - currentStrength;
          const xpTowardsNext = item.xp % xpPerLevel;
          const xpNeededForNextLevel = xpPerLevel - xpTowardsNext;
          const xpNeeded = xpNeededForNextLevel + (xpPerLevel * (levelsRemaining - 1));

          allPets.push({
            name: item.name || species,
            species: species,
            level: currentStrength,
            xp: item.xp,
            maxStr,
            xpNeeded,
            xpPerLevel,
            source: 'inventory',
          });
        }
      }
    }
  } catch (error) {
    log('⚠️ Failed to read inventory for near max level pets:', error);
  }

  // Add hutch pets
  try {
    const hutchAtom = getAtomByLabel('myPetHutchPetItemsAtom');
    if (hutchAtom) {
      const hutchData = await readAtomValue(hutchAtom) as any;

      if (Array.isArray(hutchData)) {
        for (const item of hutchData) {
          // Use petSpecies if available, otherwise species
          const species = item.petSpecies || item.species;

          if (!species || item.xp === null || item.xp === undefined) continue;

          const xpPerLevel = getSpeciesXpPerLevel(species);
          if (!xpPerLevel) continue;

          let currentStrength: number;
          let maxStr: number;

          // Try to get current strength from game data first
          if (item.strength !== null && item.strength !== undefined) {
            currentStrength = item.strength;

            // Calculate max level from current strength and XP
            const levelsGainedFromXp = Math.floor(item.xp / xpPerLevel);
            const actualLevelsGained = Math.min(30, levelsGainedFromXp); // Cap at 30
            const hatchLevel = currentStrength - actualLevelsGained;
            maxStr = Math.min(hatchLevel + 30, 100); // Cap at 100
          } else {
            // If no strength data, try to derive from max level in name and XP
            const parsedMaxLevel = parseMaxLevelFromName(item.name);
            if (!parsedMaxLevel || parsedMaxLevel < 80 || parsedMaxLevel > 100) {
              continue; // Skip if no valid max level in name
            }

            maxStr = parsedMaxLevel;

            // Derive hatch level from max level (max = hatch + 30, capped at 100)
            const hatchLevel = maxStr - 30;

            // Calculate current strength from hatch level + XP gained
            const levelsGainedFromXp = Math.floor(item.xp / xpPerLevel);
            const actualLevelsGained = Math.min(30, levelsGainedFromXp);
            currentStrength = hatchLevel + actualLevelsGained;
          }

          // Skip if already at max strength
          if (currentStrength >= maxStr) continue;

          // Calculate XP needed to reach max strength
          const levelsRemaining = maxStr - currentStrength;
          const xpTowardsNext = item.xp % xpPerLevel;
          const xpNeededForNextLevel = xpPerLevel - xpTowardsNext;
          const xpNeeded = xpNeededForNextLevel + (xpPerLevel * (levelsRemaining - 1));

          allPets.push({
            name: item.name || species,
            species: species,
            level: currentStrength,
            xp: item.xp,
            maxStr,
            xpNeeded,
            xpPerLevel,
            source: 'hutch',
          });
        }
      }
    }
  } catch (error) {
    log('⚠️ Failed to read hutch for near max level pets:', error);
  }

  return allPets;
}

/**
 * Get pets closest to max level, sorted by proximity
 */
async function getPetsNearMaxLevel(activePets: ActivePetInfo[], teamXpPerHour: number, limit: number = 10): Promise<PetWithLevel[]> {
  const allPets = await getAllPets(activePets);

  // Sort by XP needed (ascending) - closest to max first
  const sorted = allPets
    .sort((a, b) => a.xpNeeded - b.xpNeeded)
    .slice(0, limit);

  return sorted;
}

/**
 * Find XP abilities for a pet
 */
function findXpAbilities(pet: ActivePetInfo): Array<{ ability: AbilityDefinition; rawName: string }> {
  const abilities: Array<{ ability: AbilityDefinition; rawName: string }> = [];

  if (!pet.abilities || pet.abilities.length === 0) {
    return abilities;
  }

  for (const rawName of pet.abilities) {
    if (!rawName) continue;

    // Use the same lookup function as the ability tracker
    const definition = getAbilityDefinition(rawName);
    if (!definition) continue;

    // Only include continuous XP boost abilities (exclude hatch XP)
    if (definition.trigger === 'continuous' && XP_ABILITY_IDS.includes(definition.id)) {
      abilities.push({ ability: definition, rawName });
    }
  }

  return abilities;
}

/**
 * Create XP tracker window
 */
export function createXpTrackerWindow(): XpTrackerWindowState {
  const root = document.createElement('div');
  root.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    width: 850px;
    max-height: 80vh;
    overflow-y: auto;
    background: var(--qpm-background, rgba(0, 0, 0, 0.92));
    border: 2px solid var(--qpm-border, #555);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    z-index: 10002;
    font-family: Arial, sans-serif;
    display: none;
  `;

  // Title bar with close button
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
  title.textContent = '✨ XP Tracker';
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

  // Summary section
  const summary = document.createElement('div');
  summary.style.cssText = `
    padding: 12px 16px;
    background: var(--qpm-surface-1, #1a1a1a);
    border-bottom: 1px solid var(--qpm-border, #444);
  `;

  const summaryText = document.createElement('div');
  summaryText.style.cssText = `
    color: var(--qpm-text, #fff);
    font-size: 13px;
    line-height: 1.6;
  `;
  summaryText.textContent = 'Loading XP data...';

  summary.appendChild(summaryText);
  root.appendChild(summary);

  // Individual Pets Section - ALL active pets with level progress (PRIMARY TABLE)
  const individualSection = createCollapsibleSection(
    '🐾 All Active Pets',
    'individual-pets-section'
  );
  const individualTable = createPetLevelTable();
  const petLevelTbody = individualTable.querySelector('tbody') as HTMLTableSectionElement;
  individualSection.content.appendChild(individualTable);
  root.appendChild(individualSection.root);

  // XP Generation Summary Section - Simplified summary (not a full table)
  const xpGenSection = createCollapsibleSection(
    '✨ XP Generation Summary',
    'xp-gen-section'
  );
  const xpGenSummary = document.createElement('div');
  xpGenSummary.style.cssText = `
    padding: 12px 16px;
    color: var(--qpm-text, #fff);
    font-size: 12px;
    line-height: 1.6;
  `;
  xpGenSection.content.appendChild(xpGenSummary);
  root.appendChild(xpGenSection.root);

  // Near Max Level Section
  const nearMaxSection = createCollapsibleSection(
    '🏆 Near Max Level',
    'near-max-level-section',
    false // Start collapsed
  );
  const nearMaxLevelContainer = document.createElement('div');
  nearMaxLevelContainer.style.cssText = `
    padding: 12px 16px;
    color: var(--qpm-text, #fff);
    font-size: 12px;
    line-height: 1.8;
    font-family: monospace;
  `;
  nearMaxLevelContainer.textContent = 'Loading...';
  nearMaxSection.content.appendChild(nearMaxLevelContainer);
  root.appendChild(nearMaxSection.root);

  // Store reference to summary div (we'll use tbody slot for this)
  const tbody = xpGenSummary as unknown as HTMLTableSectionElement;

  // Combined Totals Section (info now shown in XP Generation Summary)
  const combinedTbody = document.createElement('tbody') as HTMLTableSectionElement;

  document.body.appendChild(root);

  // Make draggable
  makeDraggable(root, titleBar);

  const state: XpTrackerWindowState = {
    root,
    summaryText,
    petLevelTbody,
    tbody,
    combinedTbody,
    nearMaxLevelContainer,
    updateInterval: null,
    latestPets: [],
    latestStats: [],
    totalTeamXpPerHour: 0,
    lastKnownSpecies: new Set(),
    unsubscribePets: null,
    unsubscribeXpTracker: null,
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

  // Subscribe to pet updates
  state.unsubscribePets = onActivePetInfos((pets) => {
    state.latestPets = pets;
    updateXpTrackerDisplay(state);
  });

  // Subscribe to XP tracker updates (for when XP config changes)
  state.unsubscribeXpTracker = onXpTrackerUpdate(() => {
    // Only update level progress, not the entire display (to avoid rebuilding inputs)
    updateLevelProgressDisplays(state);
  });

  // Start live countdown updates (every second)
  state.updateInterval = window.setInterval(() => {
    updateLiveCountdowns(state);
  }, 1000);

  return state;
}

/**
 * Create collapsible section
 */
function createCollapsibleSection(
  titleText: string,
  id: string,
  startExpanded: boolean = true
): { root: HTMLElement; content: HTMLElement; toggle: () => void } {
  const root = document.createElement('div');
  root.style.cssText = `
    border-bottom: 1px solid var(--qpm-border, #444);
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: var(--qpm-surface-2, #222);
    cursor: pointer;
    user-select: none;
  `;

  const headerTitle = document.createElement('div');
  headerTitle.textContent = titleText;
  headerTitle.style.cssText = `
    color: var(--qpm-text, #fff);
    font-size: 13px;
    font-weight: 600;
  `;

  const indicator = document.createElement('span');
  indicator.textContent = startExpanded ? '▼' : '▲';
  indicator.style.cssText = `
    color: var(--qpm-text-muted, #aaa);
    font-size: 10px;
  `;

  header.appendChild(headerTitle);
  header.appendChild(indicator);

  const content = document.createElement('div');
  content.style.cssText = `
    display: ${startExpanded ? 'block' : 'none'};
    padding: 0;
  `;

  const toggle = () => {
    const isVisible = content.style.display === 'block';
    content.style.display = isVisible ? 'none' : 'block';
    indicator.textContent = isVisible ? '▲' : '▼';
  };

  header.onclick = toggle;

  root.appendChild(header);
  root.appendChild(content);

  return { root, content, toggle };
}

/**
 * Create pet level progress table (for ALL active pets)
 */
function createPetLevelTable(): HTMLTableElement {
  const table = document.createElement('table');
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  `;

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr style="background: var(--qpm-surface-2, #222); border-bottom: 2px solid var(--qpm-border, #555);">
      <th style="padding: 10px 12px; text-align: left; color: var(--qpm-text, #fff); font-weight: 600;">Pet</th>
      <th style="padding: 10px 12px; text-align: left; color: var(--qpm-text, #fff); font-weight: 600;">Species</th>
      <th style="padding: 10px 12px; text-align: left; color: var(--qpm-text, #fff); font-weight: 600;">XP Ability</th>
      <th style="padding: 10px 12px; text-align: right; color: var(--qpm-text, #fff); font-weight: 600;">Strength</th>
      <th style="padding: 10px 12px; text-align: right; color: var(--qpm-text, #fff); font-weight: 600;">Current XP</th>
      <th style="padding: 10px 12px; text-align: right; color: var(--qpm-text, #fff); font-weight: 600;">Progress to Next STR</th>
      <th style="padding: 10px 12px; text-align: right; color: var(--qpm-text, #fff); font-weight: 600;">Time to Next STR</th>
      <th style="padding: 10px 12px; text-align: right; color: var(--qpm-text, #fff); font-weight: 600;">Time to Max STR</th>
    </tr>
  `;

  const tbody = document.createElement('tbody');

  table.appendChild(thead);
  table.appendChild(tbody);

  return table;
}

/**
 * Create XP tracking table (for XP boost abilities)
 */
function createXpTable(): HTMLTableElement {
  const table = document.createElement('table');
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  `;

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr style="background: var(--qpm-surface-2, #222); border-bottom: 2px solid var(--qpm-border, #555);">
      <th style="padding: 10px 12px; text-align: left; color: var(--qpm-text, #fff); font-weight: 600;">Pet</th>
      <th style="padding: 10px 12px; text-align: left; color: var(--qpm-text, #fff); font-weight: 600;">Ability</th>
      <th style="padding: 10px 12px; text-align: right; color: var(--qpm-text, #fff); font-weight: 600;">Chance/Sec</th>
      <th style="padding: 10px 12px; text-align: right; color: var(--qpm-text, #fff); font-weight: 600;">XP/Proc</th>
      <th style="padding: 10px 12px; text-align: right; color: var(--qpm-text, #fff); font-weight: 600;">XP/Hour</th>
      <th style="padding: 10px 12px; text-align: right; color: var(--qpm-text, #fff); font-weight: 600;">STR Progress</th>
      <th style="padding: 10px 12px; text-align: right; color: var(--qpm-text, #fff); font-weight: 600;">Next Proc</th>
    </tr>
  `;

  const tbody = document.createElement('tbody');

  table.appendChild(thead);
  table.appendChild(tbody);

  return table;
}

/**
 * Near Max Level filters
 */
let nearMaxFilters = {
  species: new Set<string>(), // Empty = all species shown
  sources: new Set<'active' | 'inventory' | 'hutch'>(['active', 'inventory', 'hutch']), // All sources by default
};

/**
 * Update Near Max Level display
 */
async function updateNearMaxLevelDisplay(state: XpTrackerWindowState): Promise<void> {
  try {
    const nearMaxPets = await getPetsNearMaxLevel(state.latestPets, state.totalTeamXpPerHour, 50); // Get more pets for filtering

    if (nearMaxPets.length === 0) {
      state.nearMaxLevelContainer.innerHTML = `
        <div style="color: var(--qpm-text-muted, #aaa); font-style: italic;">
          No pets near max level (all pets are either at max level or don't have enough data)
        </div>
      `;
      return;
    }

    // Get unique species
    const allSpecies = [...new Set(nearMaxPets.map(p => p.species))].sort();

    // Build filter UI
    let html = '<div style="font-weight: 600; margin-bottom: 8px; color: var(--qpm-accent, #4CAF50);">Pets Closest to Max Level:</div>';

    // Species filter
    html += '<div style="margin-bottom: 12px; padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 4px;">';
    html += '<div style="font-size: 11px; font-weight: 600; margin-bottom: 4px; color: var(--qpm-text-muted, #aaa);">Filter by Species:</div>';
    html += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';

    // Add "All" button
    const allSelected = nearMaxFilters.species.size === 0;
    html += `<button
      onclick="window.qpmNearMaxToggleSpecies('__ALL__')"
      style="
        padding: 4px 8px;
        font-size: 11px;
        background: ${allSelected ? 'var(--qpm-accent, #4CAF50)' : 'rgba(255, 255, 255, 0.1)'};
        color: var(--qpm-text, #fff);
        border: 1px solid ${allSelected ? 'var(--qpm-accent, #4CAF50)' : 'rgba(255, 255, 255, 0.2)'};
        border-radius: 4px;
        cursor: pointer;
        font-weight: ${allSelected ? '600' : '400'};
      ">All</button>`;

    for (const species of allSpecies) {
      const isSelected = nearMaxFilters.species.size === 0 || nearMaxFilters.species.has(species);
      html += `<button
        onclick="window.qpmNearMaxToggleSpecies('${species}')"
        style="
          padding: 4px 8px;
          font-size: 11px;
          background: ${isSelected ? 'var(--qpm-accent, #4CAF50)' : 'rgba(255, 255, 255, 0.1)'};
          color: var(--qpm-text, #fff);
          border: 1px solid ${isSelected ? 'var(--qpm-accent, #4CAF50)' : 'rgba(255, 255, 255, 0.2)'};
          border-radius: 4px;
          cursor: pointer;
          font-weight: ${isSelected ? '600' : '400'};
        ">${species}</button>`;
    }
    html += '</div>';

    // Source filter
    html += '<div style="font-size: 11px; font-weight: 600; margin: 8px 0 4px 0; color: var(--qpm-text-muted, #aaa);">Filter by Location:</div>';
    html += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';

    const sources: Array<{key: 'active' | 'inventory' | 'hutch', label: string, icon: string}> = [
      { key: 'active', label: 'Active', icon: '🟢' },
      { key: 'inventory', label: 'Inventory', icon: '📦' },
      { key: 'hutch', label: 'Hutch', icon: '🏠' },
    ];

    for (const source of sources) {
      const isSelected = nearMaxFilters.sources.has(source.key);
      html += `<button
        onclick="window.qpmNearMaxToggleSource('${source.key}')"
        style="
          padding: 4px 8px;
          font-size: 11px;
          background: ${isSelected ? 'var(--qpm-accent, #4CAF50)' : 'rgba(255, 255, 255, 0.1)'};
          color: var(--qpm-text, #fff);
          border: 1px solid ${isSelected ? 'var(--qpm-accent, #4CAF50)' : 'rgba(255, 255, 255, 0.2)'};
          border-radius: 4px;
          cursor: pointer;
          font-weight: ${isSelected ? '600' : '400'};
        ">${source.icon} ${source.label}</button>`;
    }
    html += '</div>';
    html += '</div>';

    // Apply filters
    const filteredPets = nearMaxPets.filter(pet => {
      // Species filter
      if (nearMaxFilters.species.size > 0 && !nearMaxFilters.species.has(pet.species)) {
        return false;
      }
      // Source filter
      if (!nearMaxFilters.sources.has(pet.source)) {
        return false;
      }
      return true;
    }).slice(0, 10); // Limit to top 10 after filtering

    if (filteredPets.length === 0) {
      html += '<div style="color: var(--qpm-text-muted, #aaa); font-style: italic; margin-top: 8px;">No pets match the current filters</div>';
      state.nearMaxLevelContainer.innerHTML = html;
      return;
    }

    html += `<div style="margin-top: 8px; font-size: 10px; color: var(--qpm-text-muted, #aaa);">Showing ${filteredPets.length} of ${nearMaxPets.length} pets</div>`;

    for (const pet of filteredPets) {
      const sourceIcon = pet.source === 'active' ? '🟢' : pet.source === 'inventory' ? '📦' : '🏠';
      const xpPerHourDisplay = pet.source === 'active' ? state.totalTeamXpPerHour : 3600;

      // Calculate time to max level (using xpNeeded which is already correctly calculated)
      let timeDisplay = '—';
      if (xpPerHourDisplay > 0 && pet.xpNeeded > 0 && pet.maxStr) {
        const timeToMax = calculateTimeToLevel(0, pet.xpNeeded, xpPerHourDisplay);
        if (timeToMax) {
          if (timeToMax.hours >= 24) {
            const days = Math.floor(timeToMax.hours / 24);
            const remainingHours = timeToMax.hours % 24;
            timeDisplay = `${days}d ${remainingHours}h ${timeToMax.minutes}m`;
          } else {
            timeDisplay = `${timeToMax.hours}h ${timeToMax.minutes}m`;
          }
        }
      }

      html += `
        <div style="padding: 4px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
          <span style="color: var(--qpm-text, #fff);">${sourceIcon} ${pet.name} (${pet.species})</span>
          <span style="color: var(--qpm-text-muted, #aaa); margin-left: 8px;">Lv${pet.level} → Lv${pet.maxStr || '?'}</span>
          <span style="color: var(--qpm-warning, #FF9800); margin-left: 8px;">(${timeDisplay})</span>
          <span style="color: var(--qpm-positive, #4CAF50); margin-left: 8px;">(${formatCoins(pet.xp)} XP, needs ${formatCoins(pet.xpNeeded)})</span>
        </div>
      `;
    }

    state.nearMaxLevelContainer.innerHTML = html;
  } catch (error) {
    log('⚠️ Failed to update near max level display:', error);
    state.nearMaxLevelContainer.innerHTML = `
      <div style="color: var(--qpm-danger, #f44336);">
        Failed to load near max level pets
      </div>
    `;
  }
}

/**
 * Update XP tracker display
 */
function updateXpTrackerDisplay(state: XpTrackerWindowState): void {
  // Clear tables and summary
  state.petLevelTbody.innerHTML = '';
  (state.tbody as unknown as HTMLDivElement).innerHTML = '';

  const allStats: XpAbilityStats[] = [];

  // Process pets for XP generation abilities
  for (const pet of state.latestPets) {
    const xpAbilities = findXpAbilities(pet);

    for (const { ability, rawName } of xpAbilities) {
      const stats = calculateXpStats(
        pet,
        ability.id,
        rawName, // Use the raw ability name as it appears in game
        ability.baseProbability ?? 0,
        ability.effectValuePerProc ?? 0
      );

      allStats.push(stats);
    }
  }

  state.latestStats = allStats;

  // Calculate total team XP/hour that each pet receives
  //
  // XP RATE FORMULA (per pet):
  // - Base: 3,600 XP/hr (1 XP/second) - ALWAYS, never changes, regardless of pet count
  // - Ability Bonus: Sum of all XP Boost abilities' XP generation (shared by ALL pets)
  //
  // Example with 3 pets:
  //   Pet 1 has XP Boost I (316 XP/proc, 10 procs/hr) = 3,160 XP/hr from this ability
  //   Pet 2 has XP Boost II (633 XP/proc, 5 procs/hr) = 3,165 XP/hr from this ability
  //   Total ability XP = 3,160 + 3,165 = 6,325 XP/hr
  //
  //   EACH of the 3 pets receives:
  //     3,600 (base) + 6,325 (ability bonus) = 9,925 XP/hr
  //
  // When an XP Boost ability procs, ALL active pets receive the XP from that proc.
  const combined = allStats.length > 0 ? getCombinedXpStats(allStats) : null;
  const abilityXpPerHour = combined ? combined.totalXpPerHour : 0;
  const baseXpPerHour = 3600; // Always 3600 per pet, never changes
  state.totalTeamXpPerHour = baseXpPerHour + abilityXpPerHour;

  // Update XP Generation Summary (text only, not a table)
  if (allStats.length === 0) {
    (state.tbody as unknown as HTMLDivElement).innerHTML = `
      <div style="color: var(--qpm-warning, #FF9800); font-style: italic;">
        ⚠️ No pets with XP Boost abilities detected. Equip pets with XP Boost I or XP Boost II to generate team-wide XP.
      </div>
      <div style="margin-top: 8px; color: var(--qpm-text-muted, #aaa); font-size: 11px;">
        Each active pet still receives 3,600 XP/hour base (1 XP/second).
      </div>
    `;
  } else {
    const xpGenPets = allStats.map(s => `${s.petName} (${s.abilityName}, ${s.actualChancePerMinute.toFixed(2)}%/min)`).join(', ');
    (state.tbody as unknown as HTMLDivElement).innerHTML = `
      <div style="margin-bottom: 12px; padding: 10px; background: var(--qpm-surface-2, #1a1a1a); border-left: 3px solid var(--qpm-accent, #4CAF50); border-radius: 4px;">
        <div style="font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--qpm-accent, #4CAF50);">XP Rate Per Pet (Each Active Pet Receives):</div>
        <div style="margin-left: 8px; font-size: 11px; color: var(--qpm-text, #fff); line-height: 1.6;">
          • Base: <span style="color: var(--qpm-warning, #FF9800); font-weight: 600; font-family: monospace;">3,600 XP/hr</span> <span style="color: var(--qpm-text-muted, #aaa);">(1 XP/second, always)</span><br/>
          • Ability Bonus: <span style="color: var(--qpm-warning, #FF9800); font-weight: 600; font-family: monospace;">+${formatCoins(abilityXpPerHour)} XP/hr</span> <span style="color: var(--qpm-text-muted, #aaa);">(shared by all pets)</span><br/>
          • <strong style="color: var(--qpm-accent, #4CAF50);">Total: ${formatCoins(state.totalTeamXpPerHour)} XP/hr per pet</strong>
        </div>
      </div>
      <div style="margin-bottom: 8px;">
        <strong style="color: var(--qpm-accent, #4CAF50);">Combined Chance:</strong>
        <span style="color: var(--qpm-accent, #4CAF50); font-weight: 600; font-family: monospace;">${combined!.combinedChancePerMinute.toFixed(2)}%/min</span>
        <span style="color: var(--qpm-text-muted, #aaa); font-size: 11px; margin-left: 8px;">(~${combined!.totalProcsPerHour.toFixed(1)} procs/hr)</span>
      </div>
      <div style="margin-bottom: 6px; color: var(--qpm-text-muted, #aaa); font-size: 11px; font-style: italic;">
        Note: Each ability rolls independently every second. When an XP Boost procs, all active pets receive the XP.
      </div>
      <div>
        <strong style="color: var(--qpm-accent, #4CAF50);">XP Boost Pets:</strong>
        <span style="color: var(--qpm-text, #fff);">${xpGenPets}</span>
      </div>
    `;
  }

  // Update main summary
  if (allStats.length === 0) {
    state.summaryText.textContent = '⚠️ No pets with XP Boost abilities detected. Each pet receives 3,600 XP/hr base only.';
  } else {
    state.summaryText.innerHTML = `
      <strong>Each Pet Receives:</strong> ${formatCoins(state.totalTeamXpPerHour)} XP/hr (${formatCoins(baseXpPerHour)} base + ${formatCoins(abilityXpPerHour)} ability bonus) •
      <strong>Active Pets:</strong> ${state.latestPets.length} (${allStats.length} with XP Boost)
    `;
  }

  // Display ALL active pets with level progress
  for (const pet of state.latestPets) {
    createPetLevelRow(state.petLevelTbody, pet, state.totalTeamXpPerHour);
  }

  // Only update config table if species list changed
  const currentSpecies = new Set<string>();
  for (const pet of state.latestPets) {
    if (pet.species) {
      currentSpecies.add(pet.species);
    }
  }

  // Add species from config
  const config = getAllSpeciesXpConfig();
  for (const species of Object.keys(config)) {
    currentSpecies.add(species);
  }

  // Check if species list changed
  state.lastKnownSpecies = currentSpecies;

  // Update Near Max Level display
  updateNearMaxLevelDisplay(state);
}

/**
 * Create individual XP row
 */
function createXpRow(tbody: HTMLTableSectionElement, stats: XpAbilityStats): void {
  const row = tbody.insertRow();
  row.style.cssText = 'border-bottom: 1px solid var(--qpm-border, #444);';

  // Pet Name
  const nameCell = row.insertCell();
  nameCell.textContent = `${stats.petName} (STR ${stats.strength})`;
  nameCell.style.cssText = `
    padding: 10px 12px;
    color: var(--qpm-text, #fff);
    font-weight: 500;
  `;
  nameCell.title = `Pet: ${stats.petName}\nSpecies: ${stats.species}\nStrength: ${stats.strength}`;

  // Ability
  const abilityCell = row.insertCell();
  abilityCell.textContent = stats.abilityName;
  abilityCell.style.cssText = `
    padding: 10px 12px;
    color: var(--qpm-text, #fff);
  `;

  // Chance Per Minute
  const chanceCell = row.insertCell();
  chanceCell.textContent = `${stats.actualChancePerMinute.toFixed(2)}%/min`;
  chanceCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-accent, #4CAF50);
    font-family: monospace;
  `;
  chanceCell.title = `Base: ${(stats.baseChancePerSecond * 60).toFixed(2)}%/min × ${stats.strength}/100 = ${stats.actualChancePerMinute.toFixed(2)}%/min (game checks every second)`;

  // XP Per Proc
  const xpProcCell = row.insertCell();
  xpProcCell.textContent = formatCoins(stats.actualXpPerProc);
  xpProcCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-warning, #FF9800);
    font-family: monospace;
    font-weight: 500;
  `;
  xpProcCell.title = `Base: ${stats.baseXpPerProc} XP × ${stats.strength} = ${stats.actualXpPerProc.toFixed(1)} XP`;

  // XP Per Hour
  const xpHourCell = row.insertCell();
  xpHourCell.textContent = formatCoins(stats.expectedXpPerHour);
  xpHourCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-warning, #FF9800);
    font-family: monospace;
    font-weight: 600;
  `;

  // Strength Progress
  const progressCell = row.insertCell();
  progressCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-text, #fff);
    font-family: monospace;
  `;

  if (stats.strength !== null && stats.currentXp !== null) {
    const xpPerLevel = getSpeciesXpPerLevel(stats.species);
    if (xpPerLevel) {
      // Calculate XP towards next STR level (using modulo)
      const xpTowardsNext = stats.currentXp % xpPerLevel;
      const progress = (xpTowardsNext / xpPerLevel) * 100;
      const timeToLevel = calculateTimeToLevel(xpTowardsNext, xpPerLevel, stats.expectedXpPerHour);
      const nextStr = stats.strength + 1;

      progressCell.innerHTML = `
        <div style="font-size: 11px; margin-bottom: 4px;">STR ${stats.strength} → ${nextStr}: ${formatCoins(xpTowardsNext)}/${formatCoins(xpPerLevel)}</div>
        <div style="width: 100%; height: 6px; background: #333; border-radius: 3px; overflow: hidden;">
          <div style="width: ${Math.min(100, progress).toFixed(1)}%; height: 100%; background: linear-gradient(90deg, #4CAF50, #8BC34A);"></div>
        </div>
        ${timeToLevel ? `<div style="font-size: 10px; color: #aaa; margin-top: 2px;">~${timeToLevel.hours}h ${timeToLevel.minutes}m</div>` : ''}
      `;
    } else {
      progressCell.textContent = `STR ${stats.strength}`;
      progressCell.title = 'Configure XP per level to see progress';
    }
  } else {
    progressCell.textContent = '—';
  }

  // Next Proc ETA
  const etaCell = row.insertCell();
  etaCell.className = 'eta-countdown';
  if (stats.lastProcAt) {
    etaCell.dataset.lastProc = String(stats.lastProcAt);
    etaCell.dataset.effectiveRate = String(stats.expectedProcsPerHour);
    const etaResult = calculateLiveETA(stats.lastProcAt, stats.expectedProcsPerHour > 0 ? 60 / stats.expectedProcsPerHour : null, stats.expectedProcsPerHour);
    etaCell.textContent = etaResult.text;
    etaCell.style.cssText = `
      padding: 10px 12px;
      text-align: right;
      color: ${etaResult.isOverdue ? 'var(--qpm-danger, #f44336)' : 'var(--qpm-positive, #4CAF50)'};
      font-family: monospace;
      font-weight: 500;
    `;
  } else {
    // No proc history - show static estimate
    const avgMinutes = stats.expectedProcsPerHour > 0 ? 60 / stats.expectedProcsPerHour : 0;
    if (avgMinutes > 0) {
      const hours = Math.floor(avgMinutes / 60);
      const mins = Math.round(avgMinutes % 60);
      etaCell.textContent = hours > 0 ? `${hours}h ${mins}m Est.` : `${mins}m Est.`;
    } else {
      etaCell.textContent = '—';
    }
    etaCell.style.cssText = `
      padding: 10px 12px;
      text-align: right;
      color: var(--qpm-text-muted, rgba(255,255,255,0.5));
      font-family: monospace;
      font-weight: 500;
    `;
  }
}

/**
 * Create individual pet level row (for ALL active pets)
 */
function createPetLevelRow(tbody: HTMLTableSectionElement, pet: ActivePetInfo, teamXpPerHour: number): void {
  const row = tbody.insertRow();
  row.style.cssText = 'border-bottom: 1px solid var(--qpm-border, #444);';

  // Pet Name (with MAX STR below in small grey text)
  const nameCell = row.insertCell();
  const maxStr = pet.species && pet.targetScale ? calculateMaxStrength(pet.targetScale, pet.species) : null;
  const petNameDisplay = pet.name || pet.species || 'Unknown';

  if (maxStr) {
    nameCell.innerHTML = `
      <div style="font-weight: 500; color: var(--qpm-text, #fff);">${petNameDisplay}</div>
      <div style="font-size: 10px; color: var(--qpm-text-muted, #888); margin-top: 2px;">MAX STR ${maxStr}</div>
    `;
  } else {
    nameCell.textContent = petNameDisplay;
  }

  nameCell.style.cssText = `
    padding: 10px 12px;
    color: var(--qpm-text, #fff);
  `;
  nameCell.title = `Slot: ${pet.slotIndex}\nPet ID: ${pet.petId || 'N/A'}\nStrength: ${pet.strength ?? 'N/A'}${maxStr ? `\nMAX STR: ${maxStr}` : ''}${pet.targetScale ? `\nTarget Scale: ${pet.targetScale.toFixed(2)}` : ''}`;

  // Species
  const speciesCell = row.insertCell();
  speciesCell.textContent = pet.species || '—';
  speciesCell.style.cssText = `
    padding: 10px 12px;
    color: var(--qpm-text-muted, #aaa);
  `;

  // XP Ability
  const abilityCell = row.insertCell();
  const xpAbilities = findXpAbilities(pet);
  if (xpAbilities.length > 0) {
    const abilityNames = xpAbilities.map(a => a.rawName).join(', ');
    abilityCell.textContent = abilityNames;
    abilityCell.style.cssText = `
      padding: 10px 12px;
      color: var(--qpm-accent, #4CAF50);
      font-size: 11px;
    `;
    abilityCell.title = `This pet generates XP for the team`;
  } else {
    abilityCell.textContent = '—';
    abilityCell.style.cssText = `
      padding: 10px 12px;
      color: var(--qpm-text-muted, #666);
      font-size: 11px;
    `;
  }

  // Strength (this is the actual "level" in Magic Garden)
  const strengthCell = row.insertCell();
  if (pet.strength !== null && pet.strength !== undefined) {
    strengthCell.textContent = String(pet.strength);
    strengthCell.style.cssText = `
      padding: 10px 12px;
      text-align: right;
      color: var(--qpm-accent, #4CAF50);
      font-family: monospace;
      font-weight: 600;
    `;
    strengthCell.title = `Current Strength: ${pet.strength}\n(Strength increases by 1 each time XP threshold is reached)`;
  } else {
    strengthCell.textContent = '⚠️ —';
    strengthCell.style.cssText = `
      padding: 10px 12px;
      text-align: right;
      color: var(--qpm-warning, #FF9800);
      font-family: monospace;
      font-weight: 600;
    `;
    strengthCell.title = 'Strength data not available';
  }

  // Current XP
  const xpCell = row.insertCell();
  xpCell.textContent = pet.xp !== null ? formatCoins(pet.xp) : '—';
  xpCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-warning, #FF9800);
    font-family: monospace;
  `;

  // Level Progress
  const progressCell = row.insertCell();
  progressCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-text, #fff);
    min-width: 200px;
  `;

  if (pet.species && pet.xp !== null && pet.strength !== null) {
    const xpPerLevel = getSpeciesXpPerLevel(pet.species);

    if (xpPerLevel) {
      // Calculate MAX STR: hatch level + 30, capped at 100
      // Note: Pets can only gain 30 levels max, even though XP can accumulate infinitely
      // Max level is always capped at 100 (pets hatch at 50-70, max is 80-100)
      const levelsGained = Math.floor(pet.xp / xpPerLevel);
      const actualLevelsGained = Math.min(30, levelsGained); // Cap at 30
      const hatchLevel = pet.strength - actualLevelsGained;
      const maxStr = Math.min(hatchLevel + 30, 100); // Cap at 100
      const xpTowardsNext = pet.xp % xpPerLevel;
      const progress = (xpTowardsNext / xpPerLevel) * 100;

      // Check if pet is at MAX STR
      if (pet.strength >= maxStr) {
        progressCell.innerHTML = `
          <div style="color: var(--qpm-accent, #4CAF50); font-weight: 600; font-size: 12px;">🌟 MAX STR ${maxStr}</div>
          <div style="font-size: 10px; color: var(--qpm-text-muted, #aaa); margin-top: 2px;">No further STR gains</div>
        `;
        progressCell.title = `Pet is at MAX Strength (${maxStr})\nTotal XP: ${formatCoins(pet.xp)}\nLevels gained from hatch: ${levelsGained}${pet.targetScale ? `\nTarget Scale: ${pet.targetScale.toFixed(2)}` : ''}`;
      } else {
        // Calculate XP towards next STR level (using modulo to get current progress)
        progressCell.innerHTML = `
          <div style="font-size: 11px; margin-bottom: 4px;">${formatCoins(xpTowardsNext)} / ${formatCoins(xpPerLevel)} (${Math.min(100, progress).toFixed(1)}%)</div>
          <div style="width: 100%; height: 8px; background: #333; border-radius: 4px; overflow: hidden;">
            <div style="width: ${Math.min(100, progress).toFixed(1)}%; height: 100%; background: linear-gradient(90deg, #4CAF50, #8BC34A);"></div>
          </div>
        `;
        progressCell.title = `Total XP: ${formatCoins(pet.xp)}\nLevels gained from hatch: ${levelsGained}${maxStr ? `\nMAX STR: ${maxStr}` : ''}${pet.targetScale ? `\nTarget Scale: ${pet.targetScale.toFixed(2)}` : ''}`;
      }
    } else {
      progressCell.innerHTML = `<span style="color: var(--qpm-text-muted, #aaa); font-size: 11px;">Configure XP/level</span>`;
    }
  } else {
    progressCell.textContent = '—';
  }

  // Time to Level
  const timeCell = row.insertCell();
  timeCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-text, #fff);
    font-family: monospace;
    font-weight: 500;
  `;

  if (pet.species && pet.xp !== null && pet.strength !== null) {
    const xpPerLevel = getSpeciesXpPerLevel(pet.species);
    const hungerCap = getHungerCapOrDefault(pet.species);

    if (xpPerLevel) {
      // Calculate MAX STR: hatch level + 30, capped at 100
      // Note: Pets can only gain 30 levels max, even though XP can accumulate infinitely
      // Max level is always capped at 100 (pets hatch at 50-70, max is 80-100)
      const levelsGained = Math.floor(pet.xp / xpPerLevel);
      const actualLevelsGained = Math.min(30, levelsGained); // Cap at 30
      const hatchLevel = pet.strength - actualLevelsGained;
      const maxStr = Math.min(hatchLevel + 30, 100); // Cap at 100

      // Check if pet is at MAX STR
      if (pet.strength >= maxStr) {
        timeCell.innerHTML = `<span style="color: var(--qpm-accent, #4CAF50); font-weight: 600;">—</span>`;
        timeCell.title = 'Pet is at MAX Strength - no further STR gains possible';
      } else if (teamXpPerHour > 0) {
        // Calculate XP towards next level (modulo)
        const xpTowardsNext = pet.xp % xpPerLevel;
        const timeToLevel = calculateTimeToLevel(xpTowardsNext, xpPerLevel, teamXpPerHour);
        
        // Calculate feeds per level
        const feedsPerLevel = calculateFeedsPerLevel(pet.species, hungerCap, xpPerLevel, teamXpPerHour);
        const feedsDisplay = feedsPerLevel && feedsPerLevel > 0 ? `🍖 ${feedsPerLevel}` : '';
        
        if (timeToLevel) {
          timeCell.innerHTML = `
            <div style="color: var(--qpm-positive, #4CAF50);">${timeToLevel.hours}h ${timeToLevel.minutes}m</div>
            <div style="font-size: 10px; color: var(--qpm-text-muted, #aaa); margin-top: 2px;">${formatCoins(teamXpPerHour)} XP/hr</div>
            ${feedsDisplay ? `<div style="font-size: 10px; color: var(--qpm-warning, #FF9800); margin-top: 2px;">${feedsDisplay}</div>` : ''}
          `;
          timeCell.title = `This pet receives ${formatCoins(teamXpPerHour)} XP/hr\n(3,600 base + ability bonus shared by all pets)${feedsDisplay ? `\n~${feedsPerLevel} feeds per level` : ''}`;
        } else if (xpTowardsNext >= xpPerLevel) {
          timeCell.innerHTML = `<span style="color: var(--qpm-accent, #4CAF50); font-weight: 600;">Ready!</span>`;
        } else {
          timeCell.textContent = '—';
        }
      } else if (teamXpPerHour === 0) {
        timeCell.innerHTML = `<span style="color: var(--qpm-text-muted, #aaa); font-size: 11px;">No XP boost</span>`;
      } else {
        timeCell.textContent = '—';
      }
    } else {
      timeCell.innerHTML = `<span style="color: var(--qpm-text-muted, #aaa); font-size: 11px;">—</span>`;
    }
  } else {
    timeCell.textContent = '—';
  }

  // Time to Max STR
  const timeToMaxCell = row.insertCell();
  timeToMaxCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-text, #fff);
    font-family: monospace;
    font-weight: 500;
  `;

  if (pet.species && pet.xp !== null && pet.strength !== null) {
    const xpPerLevel = getSpeciesXpPerLevel(pet.species);

    if (xpPerLevel) {
      // Calculate MAX STR: hatch level + 30, capped at 100
      // Note: Pets can only gain 30 levels max, even though XP can accumulate infinitely
      // Max level is always capped at 100 (pets hatch at 50-70, max is 80-100)
      const levelsGained = Math.floor(pet.xp / xpPerLevel);
      const actualLevelsGained = Math.min(30, levelsGained); // Cap at 30
      const hatchLevel = pet.strength - actualLevelsGained;
      const maxStr = Math.min(hatchLevel + 30, 100); // Cap at 100

      // Check if pet is at MAX STR
      if (pet.strength >= maxStr) {
        timeToMaxCell.innerHTML = `<span style="color: var(--qpm-accent, #4CAF50); font-weight: 600;">—</span>`;
        timeToMaxCell.title = 'Pet is already at MAX Strength';
      } else if (teamXpPerHour > 0) {
        // Calculate total XP needed to reach MAX STR
        const levelsRemaining = maxStr - pet.strength;
        const xpTowardsNext = pet.xp % xpPerLevel;
        const xpNeededForNextLevel = xpPerLevel - xpTowardsNext;
        const totalXpNeeded = xpNeededForNextLevel + (xpPerLevel * (levelsRemaining - 1));

        // Calculate time
        const hoursToMax = totalXpNeeded / teamXpPerHour;
        const days = Math.floor(hoursToMax / 24);
        const hours = Math.floor(hoursToMax % 24);
        const minutes = Math.floor((hoursToMax % 1) * 60);

        let timeText = '';
        if (days > 0) {
          timeText = `${days}d ${hours}h`;
        } else if (hours > 0) {
          timeText = `${hours}h ${minutes}m`;
        } else {
          timeText = `${minutes}m`;
        }

        // Calculate feeds to max
        const hungerCap = getHungerCapOrDefault(pet.species);
        const feedsToMax = hungerCap ? calculateFeedsForLevels(pet.species, hungerCap, xpPerLevel, teamXpPerHour, levelsRemaining) : null;
        const feedsDisplay = feedsToMax && feedsToMax > 0 ? `🍖 ${feedsToMax}` : '';

        timeToMaxCell.innerHTML = `
          <div style="color: var(--qpm-warning, #FF9800); font-weight: 600;">${timeText}</div>
          <div style="font-size: 10px; color: var(--qpm-text-muted, #aaa); margin-top: 2px;">${levelsRemaining} STR left</div>
          ${feedsDisplay ? `<div style="font-size: 10px; color: var(--qpm-warning, #FF9800); margin-top: 2px;">${feedsDisplay}</div>` : ''}
        `;
        timeToMaxCell.title = `${levelsRemaining} STR levels remaining\n${formatCoins(totalXpNeeded)} XP needed\nThis pet receives ${formatCoins(teamXpPerHour)} XP/hr\n(3,600 base + ability bonus)${feedsDisplay ? `\n~${feedsToMax} total feeds to max` : ''}`;
      } else if (teamXpPerHour === 0) {
        timeToMaxCell.innerHTML = `<span style="color: var(--qpm-text-muted, #aaa); font-size: 11px;">No XP boost</span>`;
      } else {
        timeToMaxCell.innerHTML = `<span style="color: var(--qpm-text-muted, #aaa); font-size: 11px;">—</span>`;
        timeToMaxCell.title = 'Max STR unknown';
      }
    } else {
      timeToMaxCell.innerHTML = `<span style="color: var(--qpm-text-muted, #aaa); font-size: 11px;">—</span>`;
    }
  } else {
    timeToMaxCell.textContent = '—';
  }
}

/**
 * Update only the level progress displays without rebuilding tables
 */
function updateLevelProgressDisplays(state: XpTrackerWindowState): void {
  // Re-render the pet level progress rows
  state.petLevelTbody.innerHTML = '';

  for (const pet of state.latestPets) {
    createPetLevelRow(state.petLevelTbody, pet, state.totalTeamXpPerHour);
  }
}

/**
 * Update live countdowns
 */
function updateLiveCountdowns(state: XpTrackerWindowState): void {
  const etaCells = state.root.querySelectorAll<HTMLElement>('.eta-countdown');

  etaCells.forEach((cell) => {
    const lastProc = parseInt(cell.dataset.lastProc ?? '0', 10);
    const effectiveRate = parseFloat(cell.dataset.effectiveRate ?? '0');

    // Skip only if there's no rate data at all
    if (!effectiveRate || effectiveRate <= 0) {
      return;
    }

    const minutesBetween = 60 / effectiveRate;
    const etaResult = calculateLiveETA(lastProc, minutesBetween, effectiveRate);

    cell.textContent = etaResult.text;
    cell.style.color = etaResult.isOverdue
      ? 'var(--qpm-danger, #f44336)'
      : cell.classList.contains('combined')
      ? 'var(--qpm-accent, #4CAF50)'
      : 'var(--qpm-positive, #4CAF50)';
  });
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
 * Make window draggable
 */
function makeDraggable(element: HTMLElement, handle: HTMLElement): void {
  let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0;

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
 * Show XP tracker window
 */
export function showXpTrackerWindow(state: XpTrackerWindowState): void {
  state.root.style.display = 'block';
  updateXpTrackerDisplay(state);
}

/**
 * Hide XP tracker window
 */
export function hideXpTrackerWindow(state: XpTrackerWindowState): void {
  state.root.style.display = 'none';
}

/**
 * Destroy XP tracker window
 */
export function destroyXpTrackerWindow(state: XpTrackerWindowState): void {
  if (state.updateInterval) {
    clearInterval(state.updateInterval);
  }
  if (state.resizeListener) {
    window.removeEventListener('resize', state.resizeListener);
    state.resizeListener = null;
  }
  state.unsubscribePets?.();
  state.unsubscribeXpTracker?.();
  state.root.remove();
}

/**
 * Global XP tracker state for filter callbacks
 */
let globalXpTrackerState: XpTrackerWindowState | null = null;

/**
 * Set global XP tracker state
 */
export function setGlobalXpTrackerState(state: XpTrackerWindowState): void {
  globalXpTrackerState = state;

  // Expose filter toggle functions to window
  (window as any).qpmNearMaxToggleSpecies = (species: string) => {
    if (!globalXpTrackerState) {
      alert('[QPM DEBUG] globalXpTrackerState not set! Window not initialized properly.');
      return;
    }

    alert(`[QPM DEBUG] Filter button clicked!\nSpecies: ${species}\nCurrent filters: ${Array.from(nearMaxFilters.species).join(', ') || 'ALL'}`);

    if (species === '__ALL__') {
      nearMaxFilters.species.clear();
    } else {
      if (nearMaxFilters.species.has(species)) {
        nearMaxFilters.species.delete(species);
      } else {
        // First click on a species when showing all: only show this species
        if (nearMaxFilters.species.size === 0) {
          nearMaxFilters.species.add(species);
        } else {
          // Subsequent clicks: add to selection
          nearMaxFilters.species.add(species);
        }
      }
    }

    updateNearMaxLevelDisplay(globalXpTrackerState);
  };

  (window as any).qpmNearMaxToggleSource = (source: 'active' | 'inventory' | 'hutch') => {
    if (!globalXpTrackerState) {
      alert('[QPM DEBUG] globalXpTrackerState not set! Window not initialized properly.');
      return;
    }

    alert(`[QPM DEBUG] Location filter clicked!\nSource: ${source}\nCurrent filters: ${Array.from(nearMaxFilters.sources).join(', ')}`);

    if (nearMaxFilters.sources.has(source)) {
      nearMaxFilters.sources.delete(source);
    } else {
      nearMaxFilters.sources.add(source);
    }

    updateNearMaxLevelDisplay(globalXpTrackerState);
  };
}
