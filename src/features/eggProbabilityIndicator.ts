// src/features/eggProbabilityIndicator.ts
// Display pet spawn probabilities when hovering over eggs

import { getEggType, getEggSpawnWeights, areCatalogsReady, getAbilityDef } from '../catalogs/gameCatalogs';
import { getPetSpriteCanvas } from '../sprite-v2/compat';
import { canvasToDataUrl } from '../utils/canvasHelpers';
import { log } from '../utils/logger';
import { storage } from '../utils/storage';
import { onAdded, onRemoved, watch } from '../utils/dom';
import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';

// ============================================================================
// Configuration
// ============================================================================

interface EggProbabilityConfig {
  enabled: boolean;
}

const DEFAULT_CONFIG: EggProbabilityConfig = {
  enabled: true,
};

let config: EggProbabilityConfig = { ...DEFAULT_CONFIG };

function loadConfig(): void {
  const saved = storage.get<EggProbabilityConfig>('eggProbabilityIndicator:config', DEFAULT_CONFIG);
  config = { ...DEFAULT_CONFIG, ...saved };
}

export function getEggProbabilityConfig(): EggProbabilityConfig {
  return { ...config };
}

export function setEggProbabilityConfig(updates: Partial<EggProbabilityConfig>): void {
  config = { ...config, ...updates };
  storage.set('eggProbabilityIndicator:config', config);

  if (config.enabled) {
    startEggProbabilityIndicator();
  } else {
    stopEggProbabilityIndicator();
  }
}

// ============================================================================
// Mutation Probability Calculation
// ============================================================================

const BASE_RAINBOW_CHANCE = 0.001; // 0.1%
const BASE_GOLD_CHANCE = 0.01;     // 1%
const MAX_TARGET_STRENGTH = 100;   // Maximum pet strength (from game)

/**
 * Get active pets with Pet Mutation Boost abilities
 * Returns the total boost percentage (e.g., 0.07 for 7% boost)
 */
async function getActivePetMutationBoost(): Promise<number> {
  try {
    // Access myPetInfosAtom to get active pets
    const petSlotsAtom = getAtomByLabel('myPetInfosAtom');
    if (!petSlotsAtom) {
      log('?? [Mutation] myPetInfosAtom not found');
      return 0;
    }

    const petSlots = await readAtomValue<any[]>(petSlotsAtom);
    log('?? [Mutation] Pet slots:', petSlots);

    if (!petSlots || petSlots.length === 0) {
      log('?? [Mutation] No pet slots found');
      return 0;
    }

    let totalBoost = 0;

    for (let i = 0; i < petSlots.length; i++) {
      const petData = petSlots[i];
      // Pet data is nested inside a 'slot' property
      const slot = petData?.slot ?? petData;

      log(`[Mutation] Pet slot ${i}:`, {
        species: slot?.petSpecies,
        hunger: slot?.hunger,
        abilities: slot?.abilities,
        raw: petData,
      });

      // Check if pet has hunger > 0 (not starving)
      const hungerValue = slot?.hunger ?? 0;
      if (hungerValue <= 0) {
        log(`[Mutation] Pet ${i} has no hunger (${hungerValue}), skipping`);
        continue;
      }

      // Check if pet has abilities
      if (!slot.abilities || !Array.isArray(slot.abilities)) {
        log(`[Mutation] Pet ${i} has no abilities array, skipping`);
        continue;
      }

      // Check for PetMutationBoost or PetMutationBoostII abilities
      for (const ability of slot.abilities) {
        if (ability !== 'PetMutationBoost' && ability !== 'PetMutationBoostII') {
          continue;
        }

        log(`[Mutation] Found ${ability} on pet ${i}`);

        // Get boost percentage from catalog (futureproof!)
        const abilityDef = getAbilityDef(ability);
        log(`[Mutation] Ability def for ${ability}:`, abilityDef);

        if (!abilityDef?.baseParameters?.mutationChanceIncreasePercentage) {
          log(`[Mutation] No mutationChanceIncreasePercentage in ability def`);
          continue;
        }

        const boostPercentage = Number(abilityDef.baseParameters.mutationChanceIncreasePercentage);
        if (isNaN(boostPercentage) || boostPercentage <= 0) {
          log(`[Mutation] Invalid boost percentage: ${boostPercentage}`);
          continue;
        }

        // Calculate strength scale factor from pet's XP and targetScale
        // We need to calculate strength from XP if not provided
        // For now, use a reasonable estimate based on targetScale (close to max = stronger)
        const targetScale = slot?.targetScale ?? 1.0;
        const xp = slot?.xp ?? 0;

        // Estimate strength: pets closer to maxScale (2.0) are usually stronger
        // This is a simplified calculation - actual strength would need species data
        let strengthScaleFactor: number;

        if (targetScale >= 1.9) {
          // Very high scale pets are usually 80-100% strength
          strengthScaleFactor = 0.9;
        } else if (targetScale >= 1.5) {
          // Medium-high scale pets are usually 60-80% strength
          strengthScaleFactor = 0.75;
        } else {
          // Lower scale pets are usually 40-60% strength
          strengthScaleFactor = 0.5;
        }

        log(`[Mutation] Using estimated strength based on targetScale ${targetScale}: ${strengthScaleFactor}`);

        const contribution = (boostPercentage * strengthScaleFactor) / 100;
        log(`[Mutation] Adding ${contribution} boost (${boostPercentage}% x ${strengthScaleFactor})`);

        // Add this pet's boost contribution
        totalBoost += contribution;
      }
    }

    log(`?? [Mutation] Total boost: ${totalBoost}`);
    return totalBoost;
  } catch (error) {
    log('?��? Error getting pet mutation boost:', error);
    return 0;
  }
}

/**
 * Calculate final mutation probabilities with pet boost
 * Returns probabilities as decimals (e.g., 0.001 = 0.1%)
 */
async function calculateMutationProbabilities(): Promise<MutationProbability> {
  if (!areCatalogsReady()) {
    return {
      rainbow: BASE_RAINBOW_CHANCE,
      gold: BASE_GOLD_CHANCE,
    };
  }

  const totalBoost = await getActivePetMutationBoost();

  // Apply formula: FINAL = BASE ? (1 + totalBoost)
  const rainbow = BASE_RAINBOW_CHANCE * (1 + totalBoost);
  const gold = BASE_GOLD_CHANCE * (1 + totalBoost);

  return { rainbow, gold };
}

// ============================================================================
// Probability Calculation
// ============================================================================

interface PetProbability {
  species: string;
  weight: number;
  percentage: number;
  sprite: string | null;
}

interface MutationProbability {
  rainbow: number;  // e.g., 0.001049 (0.1049%)
  gold: number;     // e.g., 0.01049 (1.049%)
}

/**
 * Calculate spawn probabilities for an egg type
 * Returns sorted array (highest probability first) with sprites
 */
function calculateSpawnProbabilities(eggId: string): PetProbability[] | null {
  if (!areCatalogsReady()) {
    return null;
  }

  const spawnWeights = getEggSpawnWeights(eggId);
  if (!spawnWeights || Object.keys(spawnWeights).length === 0) {
    return null;
  }

  const totalWeight = Object.values(spawnWeights).reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) {
    return null;
  }

  const probabilities = Object.entries(spawnWeights).map(([species, weight]) => {
    let sprite: string | null = null;

    try {
      const canvas = getPetSpriteCanvas(species);
      if (canvas) {
        sprite = canvasToDataUrl(canvas);
      }
    } catch (error) {
      log(`?��? Failed to load sprite for ${species}:`, error);
    }

    return {
      species,
      weight,
      percentage: (weight / totalWeight) * 100,
      sprite,
    };
  });

  // Sort by probability (highest first)
  return probabilities.sort((a, b) => b.percentage - a.percentage);
}

// ============================================================================
// UI Rendering
// ============================================================================

const STYLE_ID = 'qpm-egg-probability-style';
const PROBABILITY_ROW_ATTR = 'data-qpm-egg-probability';
const MUTATION_ROW_ATTR = 'data-qpm-egg-mutation';

function ensureEggProbabilityStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [${PROBABILITY_ROW_ATTR}] {
      display: block;
      width: 100%;
      margin-top: 8px;
      pointer-events: none;
    }

    .qpm-egg-probability-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .qpm-egg-probability-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }

    .qpm-egg-probability-sprite {
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
      transition: transform 0.15s ease;
      object-fit: contain;
    }

    .qpm-egg-probability-sprite:hover {
      transform: scale(1.1);
    }

    .qpm-egg-probability-percentage {
      font-size: 12px;
      font-weight: 700;
      color: #B5BCAF;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
      letter-spacing: 0.03em;
    }

    .qpm-egg-probability-fallback {
      font-size: 20px;
      opacity: 0.5;
    }

    [${MUTATION_ROW_ATTR}] {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      margin-top: 6px;
      pointer-events: none;
    }

    .qpm-egg-mutation-item {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 13px;
      font-weight: 700;
      color: #B5BCAF;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
      letter-spacing: 0.03em;
    }

    .qpm-egg-mutation-square {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      flex-shrink: 0;
    }

    .qpm-egg-mutation-rainbow {
      background: linear-gradient(120deg, #ff8a80, #ffd180, #80d8ff, #b388ff);
    }

    .qpm-egg-mutation-gold {
      background: #FFB300;
    }
  `.trim();

  document.head.appendChild(style);
}

/**
 * Format percentage with full precision (no rounding)
 * e.g., 0.001049 -> "0.1049%"
 */
function formatMutationPercentage(decimal: number): string {
  const percentage = decimal * 100;

  // For very small numbers, show up to 4 decimal places
  if (percentage < 1) {
    return percentage.toFixed(4).replace(/\.?0+$/, '') + '%';
  }

  // For larger numbers, show up to 2 decimal places
  return percentage.toFixed(2).replace(/\.?0+$/, '') + '%';
}

/**
 * Create mutation probability indicator row
 */
function createMutationIndicatorRow(mutations: MutationProbability): HTMLElement {
  const mutationRow = document.createElement('div');
  mutationRow.setAttribute(MUTATION_ROW_ATTR, 'true');
  mutationRow.setAttribute('data-qpm-injected', 'true');

  const rainbowHtml = `
    <div class="qpm-egg-mutation-item">
      <div class="qpm-egg-mutation-square qpm-egg-mutation-rainbow"></div>
      <span>${formatMutationPercentage(mutations.rainbow)}</span>
    </div>
  `;

  const goldHtml = `
    <div class="qpm-egg-mutation-item">
      <div class="qpm-egg-mutation-square qpm-egg-mutation-gold"></div>
      <span>${formatMutationPercentage(mutations.gold)}</span>
    </div>
  `;

  mutationRow.innerHTML = rainbowHtml + goldHtml;

  return mutationRow;
}

async function ensureEggProbabilityIndicator(
  container: Element,
  probabilities: PetProbability[]
): Promise<void> {
  ensureEggProbabilityStyles();

  // Create or get probability container
  let probabilityRow = container.querySelector(`[${PROBABILITY_ROW_ATTR}]`) as HTMLElement;
  if (!probabilityRow) {
    probabilityRow = document.createElement('div');
    probabilityRow.setAttribute(PROBABILITY_ROW_ATTR, 'true');
    probabilityRow.setAttribute('data-qpm-injected', 'true');
    container.appendChild(probabilityRow);
  }

  // Build HTML for each pet
  const items = probabilities.map(({ species, percentage, sprite }) => {
    const spriteHtml = sprite
      ? `<img src="${sprite}"
             alt="${species}"
             class="qpm-egg-probability-sprite"
             style="width: 26px; height: 26px; image-rendering: pixelated; object-fit: contain;"
             title="${species}" />`
      : `<div class="qpm-egg-probability-fallback" title="${species}">?��</div>`;

    return `
      <div class="qpm-egg-probability-item">
        ${spriteHtml}
        <div class="qpm-egg-probability-percentage">${Math.round(percentage)}%</div>
      </div>
    `;
  }).join('');

  probabilityRow.innerHTML = `
    <div class="qpm-egg-probability-container">
      ${items}
    </div>
  `;

  // Calculate and add mutation probabilities
  const mutations = await calculateMutationProbabilities();

  // Remove old mutation row if exists
  const oldMutationRow = container.querySelector(`[${MUTATION_ROW_ATTR}]`);
  if (oldMutationRow) {
    oldMutationRow.remove();
  }

  // Add new mutation row
  const mutationRow = createMutationIndicatorRow(mutations);
  container.appendChild(mutationRow);
}

function removeEggProbabilityIndicator(container: Element | null): void {
  if (!container) return;
  const probabilityRow = container.querySelector(`[${PROBABILITY_ROW_ATTR}]`);
  const mutationRow = container.querySelector(`[${MUTATION_ROW_ATTR}]`);
  probabilityRow?.remove();
  mutationRow?.remove();
}

// ============================================================================
// Tooltip Detection & Injection
// ============================================================================

const INJECTED_MARKER = 'data-qpm-egg-probability-injected';

async function injectEggProbabilityInfo(element: Element): Promise<void> {
  if (!config.enabled ||
      element.classList.contains('qpm-window') ||
      element.closest('.qpm-window')) {
    return;
  }

  // Find egg name element - try multiple selectors
  let eggNameElement: Element | null =
    element.querySelector('p.chakra-text.css-1jc0opy') || // Specific class
    element.querySelector('p.chakra-text') ||              // Any chakra text
    Array.from(element.querySelectorAll('p')).find(p => { // Any p with "Egg"
      const text = p.textContent?.trim() || '';
      return text.includes('Egg') && text.length > 0 && text.length < 50;
    }) ||
    null;

  if (!eggNameElement) {
    removeEggProbabilityIndicator(element);
    return;
  }

  const tooltipContent = (eggNameElement.closest('.chakra-stack') as Element | null)
    ?? (eggNameElement.parentElement as Element | null)
    ?? element;

  const eggName = eggNameElement.textContent?.trim();

  if (!eggName) {
    removeEggProbabilityIndicator(tooltipContent);
    return;
  }

  // Normalize egg name: "Common Egg" -> "CommonEgg"
  const eggId = eggName.replace(/\s+/g, '');

  // Validate it's a known egg type
  if (!areCatalogsReady()) {
    // Catalogs not ready yet, can't verify
    return;
  }

  const eggEntry = getEggType(eggId);
  if (!eggEntry) {
    // Not a valid egg, remove indicator if present
    removeEggProbabilityIndicator(tooltipContent);
    return;
  }

  // Calculate probabilities
  const probabilities = calculateSpawnProbabilities(eggId);
  if (!probabilities || probabilities.length === 0) {
    removeEggProbabilityIndicator(tooltipContent);
    return;
  }

  // Mark what we processed
  const contentId = `egg-probability-${eggId}`;
  const lastProcessed = element.getAttribute(INJECTED_MARKER);

  // Check if indicator actually exists in DOM
  const indicatorExists = tooltipContent.querySelector(`[${PROBABILITY_ROW_ATTR}]`) !== null;

  // Skip if we just processed this exact egg AND the indicator is still in the DOM
  if (lastProcessed === contentId && indicatorExists) {
    return;
  }

  // Remove old indicator before processing new one
  if (lastProcessed && lastProcessed !== contentId) {
    removeEggProbabilityIndicator(tooltipContent);
  }

  element.setAttribute(INJECTED_MARKER, contentId);

  // Inject the probability UI (async for mutation calculation)
  ensureEggProbabilityIndicator(tooltipContent, probabilities).catch(error => {
    log('?��? Error ensuring egg probability indicator:', error);
  });
}

// ============================================================================
// DOM Observation
// ============================================================================

const TOOLTIP_SELECTOR = '.McFlex.css-fsggty';
const tooltipWatchers = new Map<Element, { disconnect: () => void }>();

let domObserverHandle: { disconnect: () => void } | null = null;

function attachTooltipWatcher(tooltip: Element): void {
  if (tooltipWatchers.has(tooltip)) {
    return;
  }

  let rafId: number | null = null;

  const runInjection = () => {
    rafId = null;
    injectEggProbabilityInfo(tooltip).catch(error => {
      log('?��? Error injecting egg probability info:', error);
    });
  };

  const scheduleInjection = () => {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(runInjection);
  };

  // Initial run
  runInjection();

  // Watch for changes
  const observerHandle = watch(tooltip, () => {
    scheduleInjection();
  });

  tooltipWatchers.set(tooltip, {
    disconnect: () => {
      observerHandle.disconnect();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
  });
}

function detachTooltipWatcher(tooltip: Element): void {
  const handle = tooltipWatchers.get(tooltip);
  if (handle) {
    handle.disconnect();
    tooltipWatchers.delete(tooltip);
  }
}

function startTooltipWatcher(): void {
  if (domObserverHandle) return;

  log('?? Egg Probability Indicator: Watching for egg tooltips');

  const addedHandle = onAdded(TOOLTIP_SELECTOR, attachTooltipWatcher);
  const removedHandle = onRemoved(TOOLTIP_SELECTOR, detachTooltipWatcher);

  domObserverHandle = {
    disconnect: () => {
      addedHandle.disconnect();
      removedHandle.disconnect();
      tooltipWatchers.forEach(handle => handle.disconnect());
      tooltipWatchers.clear();
    }
  };
}

function stopTooltipWatcher(): void {
  if (domObserverHandle) {
    domObserverHandle.disconnect();
    domObserverHandle = null;
  }
}

// ============================================================================
// Lifecycle
// ============================================================================

function startEggProbabilityIndicator(): void {
  if (domObserverHandle) return; // Already started

  log('?? Egg Probability Indicator: Starting');
  startTooltipWatcher();
}

function stopEggProbabilityIndicator(): void {
  if (domObserverHandle) {
    domObserverHandle.disconnect();
    domObserverHandle = null;
  }

  log('?? Egg Probability Indicator: Stopped');
}

// ============================================================================
// Public API
// ============================================================================

export function initEggProbabilityIndicator(): void {
  loadConfig();

  if (config.enabled) {
    startEggProbabilityIndicator();
  }
}

export { startEggProbabilityIndicator, stopEggProbabilityIndicator };
