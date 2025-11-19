// src/ui/xpTrackerWindow.ts - XP Tracker window with live XP rate calculations

import { formatCoins } from '../features/valueCalculator';
import { log } from '../utils/logger';
import { onActivePetInfos, type ActivePetInfo } from '../store/pets';
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

export interface XpTrackerWindowState {
  root: HTMLElement;
  summaryText: HTMLElement;
  petLevelTbody: HTMLTableSectionElement; // All active pets level progress
  tbody: HTMLTableSectionElement; // XP generation abilities
  combinedTbody: HTMLTableSectionElement;
  updateInterval: number | null;
  latestPets: ActivePetInfo[];
  latestStats: XpAbilityStats[];
  totalTeamXpPerHour: number; // Total XP/hour for the whole team
  lastKnownSpecies: Set<string>; // Track species to detect when config table needs updating
  unsubscribePets: (() => void) | null;
  unsubscribeXpTracker: (() => void) | null;
}

// XP ability IDs we're tracking (continuous only, excludes hatch XP)
const XP_ABILITY_IDS = ['PetXpBoost', 'PetXpBoostII'];

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
    updateInterval: null,
    latestPets: [],
    latestStats: [],
    totalTeamXpPerHour: 0,
    lastKnownSpecies: new Set(),
    unsubscribePets: null,
    unsubscribeXpTracker: null,
  };

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
 * Update XP tracker display
 */
function updateXpTrackerDisplay(state: XpTrackerWindowState): void {
  // Clear tables and summary
  state.petLevelTbody.innerHTML = '';
  (state.tbody as unknown as HTMLDivElement).innerHTML = '';

  const allStats: XpAbilityStats[] = [];

  // Debug logging
  console.log('🔍 XP Tracker Debug - Active Pets:', state.latestPets.length);
  state.latestPets.forEach((pet, idx) => {
    console.log(`Pet ${idx + 1}: ${pet.name || pet.species}`, {
      species: pet.species,
      abilities: pet.abilities,
      level: pet.level,
      levelRaw: pet.levelRaw,
      xp: pet.xp,
      strength: pet.strength,
      slotIndex: pet.slotIndex,
      petId: pet.petId,
      rawData: pet.raw,
    });
  });

  // Process pets for XP generation abilities
  for (const pet of state.latestPets) {
    const xpAbilities = findXpAbilities(pet);
    console.log(`Found ${xpAbilities.length} XP abilities for ${pet.name || pet.species}:`,
      xpAbilities.map(a => a.ability.name));

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

  // Calculate total team XP/hour
  const combined = allStats.length > 0 ? getCombinedXpStats(allStats) : null;
  state.totalTeamXpPerHour = combined ? combined.totalXpPerHour : 0;

  // Update XP Generation Summary (text only, not a table)
  if (allStats.length === 0) {
    (state.tbody as unknown as HTMLDivElement).innerHTML = `
      <div style="color: var(--qpm-warning, #FF9800); font-style: italic;">
        ⚠️ No pets with XP Boost abilities detected. Equip pets with XP Boost I or XP Boost II to generate team-wide XP.
      </div>
    `;
  } else {
    const xpGenPets = allStats.map(s => `${s.petName} (${s.abilityName}, ${s.actualChancePerMinute.toFixed(2)}%/min)`).join(', ');
    (state.tbody as unknown as HTMLDivElement).innerHTML = `
      <div style="margin-bottom: 8px;">
        <strong style="color: var(--qpm-accent, #4CAF50);">Total XP Generation:</strong>
        <span style="color: var(--qpm-warning, #FF9800); font-weight: 600; font-family: monospace;">${formatCoins(state.totalTeamXpPerHour)} XP/Hour</span>
        <span style="color: var(--qpm-text-muted, #aaa); font-size: 11px; margin-left: 8px;">(~${combined!.totalProcsPerHour.toFixed(1)} procs/hour)</span>
      </div>
      <div style="margin-bottom: 8px;">
        <strong style="color: var(--qpm-accent, #4CAF50);">Combined Chance:</strong>
        <span style="color: var(--qpm-accent, #4CAF50); font-weight: 600; font-family: monospace;">${combined!.combinedChancePerMinute.toFixed(2)}%/min</span>
        <span style="color: var(--qpm-text-muted, #aaa); font-size: 11px; margin-left: 8px;">(~${combined!.totalProcsPerHour.toFixed(1)} procs/hr)</span>
      </div>
      <div style="margin-bottom: 6px; color: var(--qpm-text-muted, #aaa); font-size: 11px; font-style: italic;">
        Note: Combined chance is statistical (≥1 proc/sec). Each ability rolls independently.
      </div>
      <div>
        <strong style="color: var(--qpm-accent, #4CAF50);">XP Boost Pets:</strong>
        <span style="color: var(--qpm-text, #fff);">${xpGenPets}</span>
      </div>
    `;
  }

  // Update main summary
  if (allStats.length === 0) {
    state.summaryText.textContent = '⚠️ No pets with XP Boost abilities detected. Equip pets with XP Boost I or XP Boost II.';
  } else {
    state.summaryText.innerHTML = `
      <strong>Total XP/Hour:</strong> ${formatCoins(state.totalTeamXpPerHour)} XP •
      <strong>Combined Chance:</strong> ${combined!.combinedChancePerMinute.toFixed(2)}%/min •
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
  etaCell.dataset.lastProc = String(stats.lastProcAt ?? 0);
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
      // Calculate MAX STR from targetScale
      const maxStr = calculateMaxStrength(pet.targetScale, pet.species);
      const xpTowardsNext = pet.xp % xpPerLevel;
      const progress = (xpTowardsNext / xpPerLevel) * 100;
      const levelsGained = Math.floor(pet.xp / xpPerLevel);

      // Check if pet is at MAX STR
      if (maxStr && pet.strength >= maxStr) {
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

    if (xpPerLevel) {
      const maxStr = calculateMaxStrength(pet.targetScale, pet.species);

      // Check if pet is at MAX STR
      if (maxStr && pet.strength >= maxStr) {
        timeCell.innerHTML = `<span style="color: var(--qpm-accent, #4CAF50); font-weight: 600;">—</span>`;
        timeCell.title = 'Pet is at MAX Strength - no further STR gains possible';
      } else if (teamXpPerHour > 0) {
        // Calculate XP towards next level (modulo)
        const xpTowardsNext = pet.xp % xpPerLevel;
        const timeToLevel = calculateTimeToLevel(xpTowardsNext, xpPerLevel, teamXpPerHour);
        if (timeToLevel) {
          timeCell.innerHTML = `
            <div style="color: var(--qpm-positive, #4CAF50);">${timeToLevel.hours}h ${timeToLevel.minutes}m</div>
            <div style="font-size: 10px; color: var(--qpm-text-muted, #aaa); margin-top: 2px;">${formatCoins(teamXpPerHour)} XP/hr</div>
          `;
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
    const etaResult = calculateLiveETA(lastProc || null, minutesBetween, effectiveRate);

    cell.textContent = etaResult.text;
    cell.style.color = etaResult.isOverdue
      ? 'var(--qpm-danger, #f44336)'
      : cell.classList.contains('combined')
      ? 'var(--qpm-accent, #4CAF50)'
      : 'var(--qpm-positive, #4CAF50)';
  });
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
  state.unsubscribePets?.();
  state.unsubscribeXpTracker?.();
  state.root.remove();
}
