// src/features/cropSizeIndicator.ts
// Inject crop size info into game's tooltip/info card when player hovers over crops

import { getGardenSnapshot, onGardenSnapshot } from './gardenBridge';
import { lookupMaxScale } from '../utils/plantScales';
import { log } from '../utils/logger';
import { storage } from '../utils/storage';
import { onAdded, onRemoved, watch } from '../utils/dom';
import { getCropStats, CROP_BASE_STATS, type CropStats } from '../data/cropBaseStats';
import { getGrowSlotIndex, startGrowSlotIndexTracker } from '../store/growSlotIndex';
import { getAtomByLabel, readAtomValue, subscribeAtom } from '../core/jotaiBridge';
import { getJournal, type Journal } from './journalChecker';
import { VARIANT_BADGES } from '../data/variantBadges';
import { getPlantSpecies, areCatalogsReady } from '../catalogs/gameCatalogs';

interface CropSizeConfig {
  enabled: boolean;
  showForGrowing: boolean;
  showForMature: boolean;
  showJournalIndicators: boolean;
}

const DEFAULT_CONFIG: CropSizeConfig = {
  enabled: true,
  showForGrowing: true,
  showForMature: true,
  showJournalIndicators: true,
};

let config: CropSizeConfig = { ...DEFAULT_CONFIG };
let gardenUnsubscribe: (() => void) | null = null;
let domObserverHandle: { disconnect: () => void } | null = null;
let lastSnapshotCache: any = null;
let cachedJournalData: Journal | null = null;

const normalizeSpeciesKey = (value: string): string => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const SPECIES_KEY_ALIASES: Record<string, string[]> = {
  cacaobean: ['cacao', 'cacao bean', 'cacao fruit', 'cocoabean', 'cocoa bean'],
  dragonfruit: ['dragon fruit'],
  favabean: ['fava bean', 'fava-bean', 'fava', 'fava bean pod', 'fava pod'],
  burrostail: ["burro's tail", 'burros tail', 'burro tail'],
  passionfruit: ['passion fruit', 'passion-fruit', 'passionfruit'],
  dawncelestial: ['dawnbinder', 'dawn binder'],
  mooncelestial: ['moonbinder', 'moon binder'],
};

const resolveSpeciesKey = (raw: string): string => {
  const key = normalizeSpeciesKey(raw);
  for (const [canonical, aliases] of Object.entries(SPECIES_KEY_ALIASES)) {
    if (key === canonical) return canonical;
    if (aliases.some((alias) => normalizeSpeciesKey(alias) === key)) return canonical;
  }
  return key;
};

import type { VariantBadge } from '../data/variantBadges';

// ============================================================================
// Journal Logging Check
// ============================================================================

/**
 * Get letter badges for unlogged variants of a crop species.
 * Returns empty array if everything is logged or if the journal is unavailable.
 */
async function getUnloggedVariantBadges(species: string): Promise<VariantBadge[]> {
  try {
    // Fetch journal if not cached
    if (!cachedJournalData) {
      cachedJournalData = await getJournal();
    }

    if (!cachedJournalData || !cachedJournalData.produce) {
      return [];
    }

    // Normalize species name for journal lookup
    const produceByKey = new Map<string, NonNullable<Journal['produce']>[string]>();
    for (const [name, data] of Object.entries(cachedJournalData.produce)) {
      produceByKey.set(resolveSpeciesKey(name), data as any);
    }

    let speciesKey = resolveSpeciesKey(species);
    // Handle celestial plants: moonbinder -> MoonCelestial, dawnbinder -> DawnCelestial
    const celestialMap: Record<string, string> = {
      moonbinder: 'mooncelestial',
      dawnbinder: 'dawncelestial',
    };
    const remap = celestialMap[speciesKey];
    if (remap) {
      speciesKey = resolveSpeciesKey(remap);
    }

    const speciesData = produceByKey.get(speciesKey);
    if (!speciesData) {
      // Species not in journal yet - everything counts as unlogged.
      return VARIANT_BADGES.map(badge => ({ ...badge }));
    }

    const loggedVariants = new Set(
      (speciesData.variantsLogged || []).map((v: any) => {
        const name = typeof v === 'string' ? v : v?.variant;
        return typeof name === 'string' ? name.toLowerCase() : '';
      }).filter(Boolean)
    );

    const unloggedBadges: VariantBadge[] = [];
    for (const badge of VARIANT_BADGES) {
      const isLogged = badge.matches.some(matchName => loggedVariants.has(matchName.toLowerCase()));
      if (!isLogged) {
        unloggedBadges.push({ ...badge });
      }
    }

    return unloggedBadges;
  } catch (error) {
    log('⚠️ Error checking journal for crop variants:', error);
    return [];
  }
}

// ============================================================================
// Configuration
// ============================================================================

export function getCropSizeIndicatorConfig(): CropSizeConfig {
  return { ...config };
}

export function setCropSizeIndicatorConfig(updates: Partial<CropSizeConfig>): void {
  config = { ...config, ...updates };
  storage.set('cropSizeIndicator:config', config);
  
  if (config.enabled) {
    startCropSizeIndicator();
  } else {
    stopCropSizeIndicator();
  }
}

function loadConfig(): void {
  const saved = storage.get<CropSizeConfig>('cropSizeIndicator:config', DEFAULT_CONFIG);
  config = { ...DEFAULT_CONFIG, ...saved };
}

// ============================================================================
// Size Calculation
// ============================================================================

/**
 * Get crop stats from catalog (FUTUREPROOF!)
 * Falls back to hardcoded CROP_BASE_STATS if catalog not ready or species not found
 */
function getCropStatsFromCatalog(species: string): CropStats | null {
  // If catalogs aren't ready, use hardcoded fallback
  if (!areCatalogsReady()) {
    return getCropStats(species);
  }

  // Try to get species from catalog - try multiple name variations
  let plantEntry = getPlantSpecies(species);

  // If exact match fails, try variations (handles "pine tree" -> "PineTree", etc.)
  if (!plantEntry) {
    const variations = [
      normalizeSpeciesKey(species),                                          // "pinetree"
      species.replace(/\s+/g, ''),                                          // "pinetree"
      species.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(''), // "PineTree"
      species.charAt(0).toUpperCase() + species.slice(1).replace(/\s+/g, ''), // "Pinetree"
      species.toLowerCase(),                                                  // "pine tree"
    ];

    for (const variant of variations) {
      plantEntry = getPlantSpecies(variant);
      if (plantEntry?.crop) {
        break;
      }
    }
  }

  if (!plantEntry?.crop) {
    // Species not in catalog, try hardcoded fallback
    return getCropStats(species);
  }

  // Map catalog data to CropStats format (with proper type casting)
  const baseSellPrice = typeof plantEntry.crop.baseSellPrice === 'number' ? plantEntry.crop.baseSellPrice : 0;
  const baseWeight = typeof plantEntry.crop.baseWeight === 'number' ? plantEntry.crop.baseWeight : 1.0;
  const maxScale = typeof plantEntry.crop.maxScale === 'number' ? plantEntry.crop.maxScale : 2.5;
  const secondsToMature = typeof plantEntry.plant?.secondsToMature === 'number' ? plantEntry.plant.secondsToMature : 0;

  const result: CropStats = {
    name: plantEntry.crop.name || species,
    seedPrice: plantEntry.seed?.coinPrice ?? 0,
    baseSellPrice,
    cropGrowTime: secondsToMature,
    regrow: plantEntry.plant?.harvestType === 'Multiple' ? 'Multiple' : 'No',
    baseWeight,
    maxWeight: baseWeight * maxScale,
  };

  // Add optional fields if they exist
  if (typeof plantEntry.seed?.creditPrice === 'number') {
    result.rarity = plantEntry.seed.creditPrice;
  }

  return result;
}

function calculateCropSizeInfo(slot: any): { sizePercent: number; scale: number; weight: number; value: number } | null {
  let species = slot.species;
  if (!species) return null;

  // Map species names (MoonCelestial -> moonbinder, DawnCelestial -> dawnbinder)
  const speciesToCropMap: Record<string, string> = {
    'mooncelestial': 'moonbinder',
    'dawncelestial': 'dawnbinder'
  };
  const speciesNormalized = species.toLowerCase();
  const mappedSpecies = speciesToCropMap[speciesNormalized];
  if (mappedSpecies) {
    species = mappedSpecies;
  }

  // Get crop base stats from catalog (FUTUREPROOF!)
  const cropStats = getCropStatsFromCatalog(species);
  if (!cropStats) return null;

  // Calculate CURRENT scale from weight (weight = baseWeight * scale)
  const weight = slot.weight ?? 0;
  let currentScale: number;
  
  if (weight > 0 && cropStats.baseWeight > 0) {
    // If we have weight, calculate actual current scale from it
    currentScale = weight / cropStats.baseWeight;
  } else {
    // For mature crops, targetScale IS the actual current scale
    // For growing crops, targetScale is what it's growing towards
    // Priority: slot.scale > targetScale > plantScale
    currentScale = slot.scale ?? slot.targetScale ?? slot.plantScale ?? 1.0;
  }
  
  // Get max scale for this crop (from plantScales.ts lookup)
  const maxScale = lookupMaxScale(speciesNormalized) ?? 2.0;
  
  // Size display formula: maps scale range (1.0 to maxScale) to display range (50 to 100)
  // Example: Pumpkin maxScale=3, so scale 1.0->50, scale 2.0->75, scale 3.0->100
  // Formula: size = 50 + ((currentScale - 1) / (maxScale - 1)) * 50
  const ratio = Math.max(0, Math.min(1, (currentScale - 1.0) / (maxScale - 1.0)));
  const sizePercent = 50 + ratio * 50;

  // Calculate value
  const value = cropStats.baseSellPrice * currentScale;

  return { sizePercent, scale: currentScale, weight, value };
}

// ============================================================================
// Tooltip Injection
// ============================================================================

const INJECTED_MARKER = 'data-qpm-crop-size-injected';
const TOOLTIP_STYLE_ID = 'qpm-crop-size-tooltip-style';
const TOOLTIP_ROW_ATTR = 'data-qpm-tooltip-row';
const JOURNAL_BADGE_ATTR = 'data-qpm-journal-badge';
const DEFAULT_SIZE_COLOR = '#B5BCAF';
const SIZE_ROW_CLASS = 'qpm-crop-size';
const ARIES_ICON_MARKER = 'data-qpm-aries-icon';
const ARIES_ROW_ATTR = 'data-aries-value-row';
const ARIES_COIN_ATTR = 'data-aries-coin-value';
const SIZE_VALUE_ATTR = 'data-qpm-size-value';
const BADGE_CONTAINER_ATTR = 'data-qpm-badge-container';
const SIZE_DIVIDER_ATTR = 'data-qpm-size-divider';

type TooltipRowType = 'size' | 'journal';

function ensureTooltipStyles(): void {
  if (document.getElementById(TOOLTIP_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = TOOLTIP_STYLE_ID;
  style.textContent = `
    [${TOOLTIP_ROW_ATTR}] {
      display: block;
      width: 100%;
      pointer-events: none;
    }

    [${TOOLTIP_ROW_ATTR}="size"] {
      margin-top: -2px;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.01em;
      line-height: 16px;
      color: ${DEFAULT_SIZE_COLOR};
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    [${JOURNAL_BADGE_ATTR}] {
      font-weight: 600;
      letter-spacing: 0.04em;
      display: inline-block;
      margin: 0 1px;
      min-width: 10px;
      text-align: center;
    }
  `.trim();

  document.head.appendChild(style);
}

function ensureTooltipRow(container: Element, type: TooltipRowType): HTMLElement {
  ensureTooltipStyles();
  const selector = `:scope > [${TOOLTIP_ROW_ATTR}="${type}"]`;
  let row = container.querySelector(selector) as HTMLElement | null;
  if (!row) {
    row = document.createElement('span');
    row.setAttribute(TOOLTIP_ROW_ATTR, type);
    row.setAttribute('data-qpm-injected', 'true');
    container.appendChild(row);
  }
  return row;
}

function removeTooltipRow(container: Element | null, type: TooltipRowType): void {
  if (!container) return;
  const selector = `:scope > [${TOOLTIP_ROW_ATTR}="${type}"]`;
  const row = container.querySelector(selector);
  row?.remove();
}

function createBadgeElement(badge: VariantBadge): HTMLElement {
  const span = document.createElement('span');
  span.setAttribute(JOURNAL_BADGE_ATTR, 'true');
  span.textContent = badge.label;
  if (badge.gradient) {
    span.style.backgroundImage = badge.gradient;
    span.style.color = 'transparent';
    span.style.backgroundClip = 'text';
    span.style.setProperty('-webkit-background-clip', 'text');
    span.style.setProperty('-webkit-text-fill-color', 'transparent');
  } else if (badge.color) {
    span.style.color = badge.color;
  } else {
    span.style.color = '#FFFFFF';
  }
  // Force badge legibility so it doesn't inherit tooltip/weight colors
  span.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.35)';
  span.style.setProperty('color', span.style.color || '#FFFFFF', 'important');
  span.style.fontWeight = badge.bold ? '800' : '600';
  span.title = badge.matches.join(' / ');
  return span;
}

function getWeightColorFromTooltip(element: Element): string | null {
  const nodes = element.querySelectorAll('span, p, div, strong');
  for (const node of Array.from(nodes)) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }

    if (node.getAttribute('data-qpm-injected') === 'true') {
      continue;
    }

    const text = node.textContent?.trim();
    if (!text || text.length > 24) {
      continue;
    }

    if (!/\bkg\b/i.test(text)) {
      continue;
    }

    try {
      const color = window.getComputedStyle(node).color;
      if (color) {
        return color;
      }
    } catch {
      // Ignore errors from detached nodes
    }
  }

  return null;
}

function normalizeSizeColor(weightColor: string | null): string {
  if (!weightColor) {
    return DEFAULT_SIZE_COLOR;
  }

  const normalized = weightColor.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_SIZE_COLOR;
  }

  if (normalized === '#fff' || normalized === '#ffffff') {
    return DEFAULT_SIZE_COLOR;
  }

  if (normalized.startsWith('rgb')) {
    const rgbMatch = normalized.match(/rgb[a]?\(([^)]+)\)/);
    if (rgbMatch) {
      const components = rgbMatch[1];
      if (!components) {
        return DEFAULT_SIZE_COLOR;
      }
      const parts = components.split(',').map(part => parseFloat(part.trim()));
      const [r, g, b] = parts;
      if (r === 255 && g === 255 && b === 255) {
        return DEFAULT_SIZE_COLOR;
      }
    }
  }

  return weightColor;
}

function ensureSizeIndicator(container: Element, sizeValue: number, badges: VariantBadge[], sizeColor: string): void {
  ensureTooltipStyles();

  const ariesRow = getAriesValueRow(container);
  const sizeRow = ensureTooltipRow(container, 'size');
  sizeRow.classList.add(SIZE_ROW_CLASS);
  sizeRow.style.color = sizeColor;
  sizeRow.style.marginTop = ariesRow ? '2px' : '0px';

  let sizeValueEl = sizeRow.querySelector(`:scope > span[${SIZE_VALUE_ATTR}]`) as HTMLElement | null;
  if (!sizeValueEl) {
    sizeValueEl = document.createElement('span');
    sizeValueEl.setAttribute(SIZE_VALUE_ATTR, 'true');
    sizeRow.appendChild(sizeValueEl);
  }
  sizeValueEl.textContent = `${sizeValue}`;
  sizeValueEl.style.flex = '0 1 auto';
  sizeValueEl.style.textAlign = 'left';

  let badgeContainer = sizeRow.querySelector(`:scope > span[${BADGE_CONTAINER_ATTR}]`) as HTMLElement | null;
  if (!badgeContainer) {
    badgeContainer = document.createElement('span');
    badgeContainer.setAttribute(BADGE_CONTAINER_ATTR, 'true');
    badgeContainer.style.display = 'inline-flex';
    badgeContainer.style.gap = '4px';
    badgeContainer.style.textAlign = 'right';
    sizeRow.appendChild(badgeContainer);
  }

  let divider = sizeRow.querySelector(`:scope > span[${SIZE_DIVIDER_ATTR}]`) as HTMLElement | null;
  if (!divider) {
    divider = document.createElement('span');
    divider.setAttribute(SIZE_DIVIDER_ATTR, 'true');
    divider.textContent = '|';
    divider.style.opacity = '0.6';
    divider.style.margin = '0 6px';
    divider.style.flex = '0 0 auto';
    sizeRow.appendChild(divider);
  }

  sizeRow.append(sizeValueEl, divider, badgeContainer);

  if (badges.length > 0) {
    const nodes = badges.map(badge => createBadgeElement(badge));
    badgeContainer.replaceChildren(...nodes);
    badgeContainer.style.visibility = 'visible';
    divider.style.display = 'inline-block';

    // For long badge strings (many variants), wrap to a second line to avoid tooltip overflow
    const shouldWrap = badges.length > 8;
    sizeRow.style.flexWrap = shouldWrap ? 'wrap' : 'nowrap';
    sizeRow.style.rowGap = shouldWrap ? '2px' : '0';
    badgeContainer.style.flexWrap = shouldWrap ? 'wrap' : 'nowrap';
    badgeContainer.style.maxWidth = shouldWrap ? '220px' : '';
    badgeContainer.style.justifyContent = shouldWrap ? 'center' : '';
    badgeContainer.style.alignItems = 'center';
    badgeContainer.style.width = shouldWrap ? '100%' : 'auto';
    badgeContainer.style.textAlign = shouldWrap ? 'center' : 'right';
  } else {
    badgeContainer.replaceChildren();
    badgeContainer.style.visibility = 'hidden';
    divider.style.display = 'none';
    sizeRow.style.justifyContent = 'center';
    sizeRow.style.flexWrap = 'nowrap';
    sizeRow.style.rowGap = '0';
    badgeContainer.style.flexWrap = 'nowrap';
    badgeContainer.style.maxWidth = '';
    badgeContainer.style.justifyContent = '';
    badgeContainer.style.alignItems = '';
    badgeContainer.style.width = 'auto';
    badgeContainer.style.textAlign = 'right';
  }

  positionIndicatorRow(container, sizeRow, ariesRow);
}

function positionIndicatorRow(container: Element, sizeRow: HTMLElement, ariesRow: HTMLElement | null): void {
  if (ariesRow && ariesRow.parentElement === container) {
    if (sizeRow.previousElementSibling !== ariesRow) {
      ariesRow.insertAdjacentElement('afterend', sizeRow);
    }
  } else if (sizeRow.parentElement !== container) {
    container.appendChild(sizeRow);
  }
}

function getAriesValueRow(container: Element): HTMLElement | null {
  const icon = container.querySelector(`[${ARIES_ICON_MARKER}]`);
  if (icon) {
    const row = icon.parentElement as HTMLElement | null;
    if (row) {
      row.setAttribute(ARIES_ROW_ATTR, 'true');
      ensureAriesRowMargins(row);
      return row;
    }
  }
  const taggedRow = container.querySelector(`[${ARIES_ROW_ATTR}]`) as HTMLElement | null;
  if (taggedRow) {
    ensureAriesRowMargins(taggedRow);
    return taggedRow;
  }
  const coinRow = container.querySelector(`[${ARIES_COIN_ATTR}]`)?.parentElement as HTMLElement | null;
  if (coinRow) {
    coinRow.setAttribute(ARIES_ROW_ATTR, 'true');
    ensureAriesRowMargins(coinRow);
    return coinRow;
  }
  return null;
}

function normalizeAriesValueIcons(container: Element): void {
  const icons = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
  for (const icon of icons) {
    if (!icon || icon.dataset.qpmAriesNormalized === 'true') {
      continue;
    }

    const { width, height, pointerEvents, userSelect } = icon.style;
    if (width !== '18px' || height !== '18px') {
      continue;
    }
    if (pointerEvents !== 'none' || userSelect !== 'none') {
      continue;
    }

    const span = document.createElement('span');
    span.className = icon.className;
    span.setAttribute('aria-hidden', icon.getAttribute('aria-hidden') ?? 'true');
    span.setAttribute(ARIES_ICON_MARKER, 'true');
    span.setAttribute('style', icon.getAttribute('style') ?? '');
    span.style.backgroundSize = 'contain';
    span.style.backgroundRepeat = 'no-repeat';
    span.style.backgroundPosition = 'center';
    span.style.backgroundImage = `url("${icon.src}")`;

    const parent = icon.parentElement as HTMLElement | null;
    icon.dataset.qpmAriesNormalized = 'true';
    icon.replaceWith(span);
    if (parent) {
      parent.setAttribute(ARIES_ROW_ATTR, 'true');
      ensureAriesRowMargins(parent);
      const coinValue = parent.querySelector('span, strong');
      if (coinValue) {
        (coinValue as HTMLElement).setAttribute(ARIES_COIN_ATTR, 'true');
      }
    }

    const sizeRow = container.querySelector(`:scope > [${TOOLTIP_ROW_ATTR}="size"]`) as HTMLElement | null;
    if (sizeRow) {
      positionIndicatorRow(container, sizeRow, parent);
    }
  }
}

function ensureAriesRowMargins(row: HTMLElement): void {
  row.style.marginTop = '2px';
  row.style.marginBottom = '0';
  row.style.paddingTop = '0';
  const value = row.querySelector('span, strong');
  if (value) {
    const valueEl = value as HTMLElement;
    valueEl.style.display = 'inline-flex';
    valueEl.style.alignItems = 'center';
    valueEl.setAttribute(ARIES_COIN_ATTR, 'true');
  }
}

function removeSizeIndicator(container: Element | null): void {
  removeTooltipRow(container, 'size');
  removeTooltipRow(container, 'journal');
}

async function injectCropSizeInfo(element: Element): Promise<void> {
  if (!config.enabled || 
      element.classList.contains('qpm-window') || 
      element.closest('.qpm-window')) {
    return;
  }

  // Find the crop name element - try multiple selectors
  let cropNameElement: Element | null = 
    element.querySelector('p.chakra-text.css-1jc0opy') || // Specific class
    element.querySelector('p.chakra-text') ||              // Any chakra text
    Array.from(element.querySelectorAll('p')).find(p => { // Any p with reasonable text
      const text = p.textContent?.trim();
      return text && text.length > 0 && text.length < 50;
    }) ||
    null;
  
  if (!cropNameElement) {
    removeSizeIndicator(element);
    return;
  }

  const tooltipContent = (cropNameElement.closest('.chakra-stack') as Element | null) 
    ?? (cropNameElement.parentElement as Element | null)
    ?? element;

  const cropName = cropNameElement.textContent?.trim();
  
  if (!cropName) {
    removeSizeIndicator(tooltipContent);
    return;
  }
  
  // Normalize crop name and handle special cases
  let normalizedCropName = cropName.toLowerCase().trim();
  
  // Map fruit/harvest names to their base plant species (as they appear in game data)
  const fruitToPlantMap: Record<string, string> = {
    // Celestial plants - tooltip shows "bulb", species is "celestial", but CROP_BASE_STATS uses "binder"
    'dawnbinder bulb': 'dawnbinder',
    'moonbinder bulb': 'moonbinder',
    'starweaver fruit': 'starweaver',
    'dragon fruit': 'dragonfruit',
    "burro's tail": 'burrostail',
    'burros tail': 'burrostail',
    'fava bean': 'favabean',
    'passionfruit': 'passionfruit',
    'fava bean pod': 'favabean',
    'fava pod': 'favabean',
    'passion fruit': 'passionfruit',
    'cacao bean': 'cacaobean',
    'cacao': 'cacaobean',
    'cocoa bean': 'cacaobean',
    // Multi-harvest fruit names
    'lychee fruit': 'lychee',
    'strawberry': 'strawberry',
    'grape': 'grape',
    'pepper': 'pepper',
    'blueberry': 'blueberry',
    'eggplant': 'eggplant',
    'coffee bean': 'coffee',
    'cherry': 'cherry'
  };
  
  const mappedName = fruitToPlantMap[normalizedCropName];
  if (mappedName) {
    normalizedCropName = mappedName;
  }
  
  // Check if this is actually a known crop name (skip decorations, eggs, etc)
  let isKnownCrop = Object.keys(CROP_BASE_STATS).some(crop => crop.toLowerCase() === normalizedCropName);

  // If not in hardcoded list, check catalog (FUTUREPROOF!)
  if (!isKnownCrop && areCatalogsReady()) {
    // Try multiple variations to match catalog entries (handles "Pine Tree" -> "PineTree", etc.)
    const variations = [
      normalizedCropName,                                                      // "pine tree"
      normalizeSpeciesKey(normalizedCropName),                                // "pinetree"
      normalizedCropName.replace(/\s+/g, ''),                                 // "pinetree"
      normalizedCropName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(''), // "PineTree"
      normalizedCropName.charAt(0).toUpperCase() + normalizedCropName.slice(1).replace(/\s+/g, ''), // "Pinetree"
    ];

    for (const variant of variations) {
      const plantEntry = getPlantSpecies(variant);
      if (plantEntry?.crop) {
        isKnownCrop = true;
        break;
      }
    }
  }

  if (!isKnownCrop) {
    // Not a crop - remove any existing indicator
    removeSizeIndicator(tooltipContent);
    return;
  }
  
  // Get current garden snapshot first
  const snapshot = lastSnapshotCache || getGardenSnapshot();
  if (!snapshot) {
    return;
  }
  
  // Helper to convert tile index to coordinates
  // Standard garden is 20 cols, boardwalk is variable
  const tileIndexToCoords = (tileIndex: number, isBoardwalk: boolean = false): { x: number; y: number } => {
    // Get cols from snapshot if available, otherwise use default
    const cols = (snapshot as any)?.cols || (snapshot as any)?.map?.cols || 20;
    const x = tileIndex % cols;
    const y = Math.floor(tileIndex / cols);
    return { x, y };
  };
  
  // Collect all matching crops (for multi-harvest and same species on different tiles)
  const matchingCrops: Array<{slot: any, tileKey: string, slotIndex: number, coords: {x: number, y: number}, tile: any}> = [];
  
  // Search through all crops to match this crop name
  const searchCrops = (tiles: Record<string, any> | undefined) => {
    if (!tiles) return;

    for (const [tileKey, tile] of Object.entries(tiles)) {
      // Only process plant tiles (not decorations, eggs, etc)
      if (tile.objectType !== 'plant') {
        continue;
      }
      
      if (!tile.slots || !Array.isArray(tile.slots)) continue;

      for (let slotIndex = 0; slotIndex < tile.slots.length; slotIndex++) {
        const slot = tile.slots[slotIndex];
        if (!slot || !slot.species) continue;

        // Remove mutation prefixes from slot species to match base crop name
        let baseSpecies = slot.species;
        const mutationPrefixes = ['Rainbow', 'Gold', 'Golden', 'Frozen', 'Amber', 'Wet', 'Chilled', 'Dawnlit', 'Dawnbound', 'Amberbound'];
        for (const prefix of mutationPrefixes) {
          if (baseSpecies.startsWith(prefix + ' ')) {
            baseSpecies = baseSpecies.substring(prefix.length + 1);
            break;
          }
        }
        
        // Map species names (DawnCelestial -> dawnbinder, etc.)
        const speciesToCropMap: Record<string, string> = {
          'dawncelestial': 'dawnbinder',
          'mooncelestial': 'moonbinder'
        };
        const mappedSpecies = speciesToCropMap[baseSpecies.toLowerCase()];
        if (mappedSpecies) {
          baseSpecies = mappedSpecies;
        }
        
        // Check if this is the matching crop
        // Normalize both sides to handle "PineTree" vs "pine tree" vs "pinetree"
        const normalizedSlotSpecies = normalizeSpeciesKey(baseSpecies);
        const normalizedSearchName = normalizeSpeciesKey(normalizedCropName);

        if (normalizedSlotSpecies === normalizedSearchName) {
          const tileIndex = parseInt(tileKey, 10);
          const coords = tileIndexToCoords(tileIndex);
          matchingCrops.push({slot, tileKey, slotIndex, coords, tile});
        }
      }
    }
  };
  
  // Search both gardens
  searchCrops(snapshot.tileObjects);
  searchCrops(snapshot.boardwalkTileObjects);
  
  if (matchingCrops.length === 0) {
    // Debug: Show what species names are actually in the garden
    const allSpecies = new Set<string>();
    const debugSearch = (tiles: Record<string, any> | undefined) => {
      if (!tiles) return;
      for (const tile of Object.values(tiles)) {
        if (tile.objectType === 'plant' && tile.slots) {
          for (const slot of tile.slots) {
            if (slot?.species) allSpecies.add(slot.species);
          }
        }
      }
    };
    debugSearch(snapshot.tileObjects);
    debugSearch(snapshot.boardwalkTileObjects);
    
    log(`📐 ⚠️ No match for "${normalizedCropName}" (original: "${cropName}")`);
    log(`📐 Available species: ${Array.from(allSpecies).sort().join(', ')}`);
    return; // No matching crops found
  }
  
  // For multi-harvest plants, use the currently selected grow slot index
  const selectedSlotIndex = getGrowSlotIndex();
  
  let bestMatch = matchingCrops[0]!;
  
  // Try to match using the current tile info (tile index)
  if (currentTileInfoCache) {
    // Match by tile index first
    const tilesMatches = matchingCrops.filter(m => m.tileKey === String(currentTileInfoCache!.tileIndex));
    
    if (tilesMatches.length > 0) {
      // If this tile has multiple slots (multi-harvest) and we have a selected slot index, use it
      if (tilesMatches.length > 1 && selectedSlotIndex !== null && selectedSlotIndex !== undefined) {
        const slotMatch = tilesMatches.find(m => m.slotIndex === selectedSlotIndex);
        bestMatch = slotMatch || tilesMatches[0]!;
      } else {
        bestMatch = tilesMatches[0]!;
      }
    }
  }
  
  const {slot, tileKey, slotIndex, tile} = bestMatch;
  
  // Track using crop + tile + slot + scale to detect changes between different tiles
  const scale = slot.scale ?? slot.targetScale ?? 1.0;
  const contentId = `${normalizedCropName}-${tileKey}-${slotIndex}-${scale.toFixed(3)}`;
  const lastProcessed = element.getAttribute(INJECTED_MARKER);
  
  // Skip if we just processed this exact crop
  if (lastProcessed === contentId) {
    return;
  }
  
  // Remove old indicator before processing new one
  if (lastProcessed) {
    removeSizeIndicator(tooltipContent);
  }
  
  // Check if we should show this crop based on maturity
  const endTime = slot.endTime ?? 0;
  const isMature = endTime > 0 && Date.now() >= endTime;
  
  if ((isMature && !config.showForMature) || (!isMature && !config.showForGrowing)) {
    return;
  }
  
  const sizeInfo = calculateCropSizeInfo(slot);
  if (!sizeInfo) return;
  
  // Mark what we processed
  element.setAttribute(INJECTED_MARKER, contentId);

  // Format the size text - floor to show accurate size (game rounds internally)
  const size = Math.floor(sizeInfo.sizePercent);

  // Get journal logging indicator (unlogged variants) when enabled
  const unloggedBadges = config.showJournalIndicators
    ? await getUnloggedVariantBadges(normalizedCropName)
    : [];
  const weightColor = normalizeSizeColor(getWeightColorFromTooltip(element));

  ensureSizeIndicator(tooltipContent, size, unloggedBadges, weightColor);
  normalizeAriesValueIcons(tooltipContent);
}

// ============================================================================
// DOM Observation
// ============================================================================

const TOOLTIP_SELECTOR = '.McFlex.css-fsggty';
const tooltipWatchers = new Map<Element, { disconnect: () => void }>();

function attachTooltipWatcher(tooltip: Element): void {
  if (tooltipWatchers.has(tooltip)) {
    return;
  }

  let rafId: number | null = null;

  const runInjection = () => {
    rafId = null;
    injectCropSizeInfo(tooltip).catch(error => {
      log('⚠️ Error injecting crop size info:', error);
    });
  };

  const scheduleInjection = () => {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(runInjection);
  };

  // Initial run
  runInjection();

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

  log('📐 Crop Size Indicator: Watching for crop tooltips');

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
// Current Tile Tracking
// ============================================================================

let currentTileInfoCache: { objectType: string; species?: string; tileIndex: number; tileType: string } | null = null;
let tileInfoUnsubscribe: (() => void) | null = null;

async function updateCurrentTileInfo(): Promise<void> {
  try {
    // Get the current tile info atom which has tileType and localTileIndex
    const currentGardenTileAtom = getAtomByLabel('myCurrentGardenTileAtom');
    if (!currentGardenTileAtom) {
      return;
    }
    
    const tileInfo = await readAtomValue<any>(currentGardenTileAtom);
    if (!tileInfo) {
      currentTileInfoCache = null;
      return;
    }
    
    // Get the current tile object
    const currentGardenObjectAtom = getAtomByLabel('myOwnCurrentGardenObjectAtom');
    if (!currentGardenObjectAtom) {
      return;
    }
    
    const tileObject = await readAtomValue<any>(currentGardenObjectAtom);
    if (!tileObject) {
      currentTileInfoCache = null;
      return;
    }
    
    currentTileInfoCache = {
      objectType: tileObject.objectType,
      species: tileObject.species,
      tileIndex: tileInfo.localTileIndex,
      tileType: tileInfo.tileType
    };
  } catch (e) {
    // Silently fail
  }
}

function startCurrentTileTracking(): void {
  if (tileInfoUnsubscribe) return;
  
  log('📐 Starting current tile tracking');
  
  const currentGardenTileAtom = getAtomByLabel('myCurrentGardenTileAtom');
  if (!currentGardenTileAtom) {
    log('📐 ⚠️ myCurrentGardenTileAtom not found');
    return;
  }
  
  // Subscribe to changes
  subscribeAtom(currentGardenTileAtom, () => {
    updateCurrentTileInfo();
  }).then((unsub: () => void) => {
    tileInfoUnsubscribe = unsub;
  }).catch((e: any) => {
    log('📐 ⚠️ Error subscribing to tile info:', e);
  });
  
  // Initial update
  updateCurrentTileInfo();
}

function stopCurrentTileTracking(): void {
  if (tileInfoUnsubscribe) {
    tileInfoUnsubscribe();
    tileInfoUnsubscribe = null;
  }
  currentTileInfoCache = null;
}

// ============================================================================
// Lifecycle
// ============================================================================

function startCropSizeIndicator(): void {
  if (gardenUnsubscribe) return; // Already started

  log('📐 Crop Size Indicator: Starting');
  
  // Start tracking the selected grow slot for multi-harvest plants
  startGrowSlotIndexTracker();
  
  // Start tracking current tile
  startCurrentTileTracking();
  
  // Subscribe to garden changes to keep snapshot cache updated
  gardenUnsubscribe = onGardenSnapshot((snapshot) => {
    lastSnapshotCache = snapshot;
  });

  // Initial snapshot
  lastSnapshotCache = getGardenSnapshot();

  // Start watching for tooltips
  startTooltipWatcher();
}

function stopCropSizeIndicator(): void {
  if (gardenUnsubscribe) {
    gardenUnsubscribe();
    gardenUnsubscribe = null;
  }

  stopTooltipWatcher();
  stopCurrentTileTracking();
  
  log('📐 Crop Size Indicator: Stopped');
}

// ============================================================================
// Public API
// ============================================================================

export function initCropSizeIndicator(): void {
  loadConfig();

  if (config.enabled) {
    startCropSizeIndicator();
  }
}

export { startCropSizeIndicator, stopCropSizeIndicator };
