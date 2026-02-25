// src/ui/xpTrackerWindow.ts - XP Tracker window (redesigned)

import { formatCoins } from '../features/valueCalculator';
import { log } from '../utils/logger';
import { onActivePetInfos, type ActivePetInfo } from '../store/pets';
import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';
import { getPetSpriteDataUrl } from '../sprite-v2/compat';
import {
  calculateXpStats,
  getCombinedXpStats,
  getSpeciesXpPerLevel,
  calculateMaxStrength,
  calculateTimeToLevel,
  onXpTrackerUpdate,
  type XpAbilityStats,
} from '../store/xpTracker';
import { getAbilityDefinition, type AbilityDefinition } from '../data/petAbilities';
import { getAbilityColor } from '../utils/petCardRenderer';
import { getHungerCapOrDefault } from '../data/petHungerCaps';
import { calculateFeedsPerLevel } from '../data/petHungerDepletion';
import { throttle } from '../utils/scheduling';
import { getWeatherSnapshot } from '../store/weatherHub';
import type { DetailedWeather } from '../utils/weatherDetection';
import { getAbilityName } from '../utils/catalogHelpers';
import { storage } from '../utils/storage';

// ============================================================================
// CONSTANTS
// ============================================================================

const LAYOUT_KEY = 'qpm.xpTrackerWindow.layout.v1';
const DEFAULT_WIDTH = 520;
const DEFAULT_HEIGHT = 540;
const WEATHER_ICONS: Record<string, string> = {
  snow: '❄️', rain: '🌧️', dawn: '🌅', amber: '🌕', sunny: '☀️',
};

// ============================================================================
// TYPES
// ============================================================================

export interface XpTrackerWindowState {
  root: HTMLElement;
  scrollContent: HTMLElement;
  summaryStrip: HTMLElement;
  petCardsContainer: HTMLElement;
  nearMaxContainer: HTMLElement;
  latestPets: ActivePetInfo[];
  latestStats: XpAbilityStats[];
  totalTeamXpPerHour: number;
  lastKnownSpecies: Set<string>;
  unsubscribePets: (() => void) | null;
  unsubscribeXpTracker: (() => void) | null;
  resizeListener: (() => void) | null;
  currentWeather: DetailedWeather;
  updateInterval: (() => void) | null; // kept for API compat (unused)
  scaleWrapper: HTMLElement;
  scaleOuter: HTMLElement;
  updateScale: (() => void) | null;
  resizeObserver: ResizeObserver | null;
}

interface PetWithLevel {
  name: string;
  species: string;
  level: number;
  xp: number;
  maxStr: number;
  xpNeeded: number;
  xpPerLevel: number;
  source: 'active' | 'inventory' | 'hutch';
}

interface WindowLayout {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Module-level filter state — no window globals
const nearMaxSources = new Set<'active' | 'inventory' | 'hutch'>(['active', 'inventory', 'hutch']);

// ============================================================================
// ABILITY DETECTION — dynamic, catalog-driven (no hardcoded ID list)
// ============================================================================

function findXpAbilities(pet: ActivePetInfo): AbilityDefinition[] {
  if (!pet.abilities?.length) return [];
  return pet.abilities
    .map(id => getAbilityDefinition(id))
    .filter((def): def is AbilityDefinition =>
      def?.category === 'xp' && def.trigger === 'continuous'
    );
}

// ============================================================================
// UTILITY HELPERS
// ============================================================================

function parseMaxLevelFromName(name: string | null | undefined): number | null {
  if (!name) return null;
  const match = name.match(/\((\d+)\)/);
  return match?.[1] ? parseInt(match[1], 10) : null;
}

/** Format total minutes into a compact human-readable string */
function formatTime(totalMinutes: number): string {
  if (totalMinutes >= 1440) {
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function getMaxStr(pet: ActivePetInfo): number | null {
  if (pet.species && pet.targetScale) return calculateMaxStrength(pet.targetScale, pet.species);
  if (pet.strength != null && pet.strength >= 80 && pet.strength <= 100) return pet.strength;
  return null;
}

// ============================================================================
// LAYOUT PERSISTENCE
// ============================================================================

function loadLayout(): WindowLayout | null {
  try { return storage.get<WindowLayout | null>(LAYOUT_KEY, null); } catch { return null; }
}

function saveLayout(root: HTMLElement): void {
  try {
    storage.set(LAYOUT_KEY, {
      top: parseFloat(root.style.top) || 80,
      left: parseFloat(root.style.left) || (window.innerWidth - DEFAULT_WIDTH - 20),
      width: root.offsetWidth || DEFAULT_WIDTH,
      height: root.offsetHeight || DEFAULT_HEIGHT,
    });
  } catch { /* ignore */ }
}

// ============================================================================
// WINDOW CHROME — drag, resize, clamp
// ============================================================================

function clampToViewport(root: HTMLElement): void {
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = root.offsetWidth;
  const h = root.offsetHeight;
  const top = Math.min(Math.max(parseFloat(root.style.top) || 0, margin), Math.max(margin, vh - h - margin));
  const left = Math.min(Math.max(parseFloat(root.style.left) || 0, margin), Math.max(margin, vw - w - margin));
  root.style.top = `${top}px`;
  root.style.left = `${left}px`;
}

function makeDraggable(root: HTMLElement, handle: HTMLElement, onEnd: () => void): void {
  let sx = 0, sy = 0;
  const onMove = (e: MouseEvent) => {
    root.style.top = `${root.offsetTop + e.clientY - sy}px`;
    root.style.left = `${root.offsetLeft + e.clientX - sx}px`;
    sx = e.clientX;
    sy = e.clientY;
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    clampToViewport(root);
    onEnd();
  };
  handle.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    sx = e.clientX;
    sy = e.clientY;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/** Resize from bottom-right corner handle — adjusts width AND height */
function makeResizable(root: HTMLElement, handle: HTMLElement, onEnd: () => void): void {
  let sx = 0, sy = 0, sw = 0, sh = 0;
  const onMove = (e: MouseEvent) => {
    const maxW = window.innerWidth - parseFloat(root.style.left || '0') - 8;
    const maxH = window.innerHeight - parseFloat(root.style.top || '0') - 8;
    root.style.width = `${Math.max(320, Math.min(sw + e.clientX - sx, maxW))}px`;
    root.style.height = `${Math.max(200, Math.min(sh + e.clientY - sy, maxH))}px`;
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    onEnd();
  };
  handle.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    sx = e.clientX;
    sy = e.clientY;
    sw = root.offsetWidth;
    sh = root.offsetHeight;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/**
 * Scale the scroll content proportionally to the window width using
 * CSS transform: scale() so card backgrounds scale correctly alongside text.
 * scaleOuter acts as a height-tracking wrapper (transform doesn't affect layout).
 */
function updateContentScale(scaleWrapper: HTMLElement, scaleOuter: HTMLElement, defaultWidth: number): void {
  const parent = scaleOuter.parentElement;
  if (!parent) return;
  const w = parent.offsetWidth;
  if (w <= 0) return;
  const scale = Math.max(0.65, Math.min(2.5, w / defaultWidth));
  scaleWrapper.style.transformOrigin = 'top left';
  scaleWrapper.style.transform = `scale(${scale.toFixed(4)})`;
  scaleWrapper.style.width = `${(100 / scale).toFixed(3)}%`;
  scaleOuter.style.height = `${Math.ceil(scaleWrapper.scrollHeight * scale)}px`;
}

/** Grow/shrink the window height so content fits without vertical scrollbars. */
function autoSizeToContent(root: HTMLElement, scrollEl: HTMLElement): void {
  const topPx = parseFloat(root.style.top) || 80;
  const maxH = window.innerHeight - topPx - 16;
  const fixedH = root.offsetHeight - scrollEl.offsetHeight;
  const idealH = Math.min(maxH, fixedH + scrollEl.scrollHeight);
  root.style.height = `${Math.max(200, idealH)}px`;
}

// ============================================================================
// UI PRIMITIVES
// ============================================================================

function makeChip(text: string, color: string): HTMLElement {
  const el = document.createElement('span');
  el.textContent = text;
  el.style.cssText = [
    `color:${color}`,
    'font-size:11px',
    'font-family:monospace',
    'background:rgba(255,255,255,0.05)',
    'padding:2px 8px',
    'border-radius:10px',
    'border:1px solid rgba(255,255,255,0.08)',
    'white-space:nowrap',
  ].join(';');
  return el;
}

function makePillButton(text: string, active: boolean): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = [
    'padding:3px 10px',
    'font-size:11px',
    'border-radius:10px',
    'cursor:pointer',
    `font-weight:${active ? '600' : '400'}`,
    `background:${active ? 'var(--qpm-accent,#4CAF50)' : 'rgba(255,255,255,0.06)'}`,
    `color:${active ? '#fff' : 'var(--qpm-text-muted,#888)'}`,
    `border:1px solid ${active ? 'var(--qpm-accent,#4CAF50)' : 'rgba(255,255,255,0.12)'}`,
    'transition:all 0.15s ease',
  ].join(';');
  return btn;
}

function createCollapsible(titleText: string, startExpanded: boolean): { wrapper: HTMLElement; content: HTMLElement } {
  const wrapper = document.createElement('div');
  wrapper.style.borderTop = '1px solid var(--qpm-border,#2a2a2a)';

  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'padding:8px 14px',
    'cursor:pointer',
    'user-select:none',
    'background:var(--qpm-surface-1,#141414)',
  ].join(';');

  const titleEl = document.createElement('span');
  titleEl.textContent = titleText;
  titleEl.style.cssText = 'color:var(--qpm-text,#fff);font-size:12px;font-weight:600;pointer-events:none;';

  const chevron = document.createElement('span');
  chevron.textContent = startExpanded ? '▼' : '▶';
  chevron.style.cssText = 'color:var(--qpm-text-muted,#555);font-size:9px;pointer-events:none;';

  header.appendChild(titleEl);
  header.appendChild(chevron);

  const content = document.createElement('div');
  content.style.display = startExpanded ? 'block' : 'none';

  header.addEventListener('click', () => {
    const open = content.style.display !== 'none';
    content.style.display = open ? 'none' : 'block';
    chevron.textContent = open ? '▶' : '▼';
  });

  wrapper.appendChild(header);
  wrapper.appendChild(content);
  return { wrapper, content };
}

// ============================================================================
// PET CARD
// ============================================================================

function createPetCard(pet: ActivePetInfo, teamXpPerHour: number): HTMLElement {
  const maxStr = getMaxStr(pet);
  const xpPerLevel = pet.species ? getSpeciesXpPerLevel(pet.species) : null;

  const card = document.createElement('div');
  card.style.cssText = [
    'background:var(--qpm-surface-2,#1a1a1a)',
    'border:1px solid var(--qpm-border,#2a2a2a)',
    'border-radius:6px',
    'padding:10px 12px',
    'display:flex',
    'flex-direction:column',
    'gap:7px',
  ].join(';');

  // ── Header row: [ability badges] [sprite] [name block] [STR badge] ──
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:8px;';

  // Ability badge column (colored squares, one per ability)
  const petAbilities = pet.abilities ?? [];
  if (petAbilities.length > 0) {
    const col = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex-shrink:0;';
    for (const id of petAbilities.slice(0, 4)) {
      const c = getAbilityColor(id);
      const sq = document.createElement('div');
      sq.title = id;
      sq.style.cssText = [
        'width:8px',
        'height:8px',
        'border-radius:2px',
        `background:${c.base}`,
        'border:1px solid rgba(255,255,255,0.2)',
        `box-shadow:0 0 3px ${c.glow}`,
      ].join(';');
      col.appendChild(sq);
    }
    header.appendChild(col);
  }

  // Sprite
  if (pet.species) {
    const img = document.createElement('img');
    img.src = getPetSpriteDataUrl(pet.species) ?? '';
    img.dataset.qpmSprite = `pet:${pet.species}`;
    img.alt = pet.species;
    img.style.cssText = 'width:36px;height:36px;object-fit:contain;image-rendering:pixelated;flex-shrink:0;';
    header.appendChild(img);
  }

  // Name + species
  const nameBlock = document.createElement('div');
  nameBlock.style.cssText = 'flex:1;min-width:0;';

  const nameEl = document.createElement('div');
  nameEl.textContent = pet.name || pet.species || 'Unknown';
  nameEl.style.cssText = 'font-weight:600;color:var(--qpm-text,#fff);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  nameBlock.appendChild(nameEl);

  if (pet.name && pet.species) {
    const sub = document.createElement('div');
    sub.textContent = pet.species;
    sub.style.cssText = 'font-size:10px;color:var(--qpm-text-muted,#555);margin-top:1px;';
    nameBlock.appendChild(sub);
  }
  header.appendChild(nameBlock);

  // STR badge
  if (pet.strength != null) {
    const badge = document.createElement('div');
    badge.style.cssText = 'text-align:right;flex-shrink:0;';

    const strEl = document.createElement('div');
    strEl.textContent = `STR ${pet.strength}`;
    strEl.style.cssText = 'font-weight:700;font-family:monospace;font-size:13px;color:var(--qpm-accent,#4CAF50);';
    badge.appendChild(strEl);

    if (maxStr) {
      const maxEl = document.createElement('div');
      maxEl.textContent = `MAX ${maxStr}`;
      maxEl.style.cssText = 'font-size:10px;color:var(--qpm-text-muted,#666);font-family:monospace;margin-top:1px;';
      badge.appendChild(maxEl);
    }
    header.appendChild(badge);
  }

  card.appendChild(header);

  // ── Progress bar + time chips ──
  if (pet.xp !== null && pet.strength !== null && xpPerLevel && maxStr) {
    if (pet.strength >= maxStr) {
      const maxMsg = document.createElement('div');
      maxMsg.textContent = `🌟 MAX STR ${maxStr} — fully levelled`;
      maxMsg.style.cssText = 'font-size:11px;color:var(--qpm-accent,#4CAF50);font-weight:600;';
      card.appendChild(maxMsg);
    } else {
      const xpToNext = pet.xp % xpPerLevel;
      const pct = Math.min(100, (xpToNext / xpPerLevel) * 100);

      // Progress bar
      const barWrap = document.createElement('div');
      barWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

      const track = document.createElement('div');
      track.style.cssText = 'height:8px;background:rgba(255,255,255,0.07);border-radius:4px;overflow:hidden;';

      const fill = document.createElement('div');
      fill.style.cssText = `width:${pct.toFixed(1)}%;height:100%;background:linear-gradient(90deg,var(--qpm-accent,#4CAF50),#8BC34A);border-radius:4px;`;
      track.appendChild(fill);
      barWrap.appendChild(track);

      const lbl = document.createElement('div');
      lbl.style.cssText = 'display:flex;justify-content:space-between;font-size:10px;color:var(--qpm-text-muted,#666);font-family:monospace;';
      lbl.innerHTML = `<span>${formatCoins(xpToNext)} / ${formatCoins(xpPerLevel)}</span><span>${pct.toFixed(1)}%</span>`;
      barWrap.appendChild(lbl);
      card.appendChild(barWrap);

      // Time chips row
      const chips = document.createElement('div');
      chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';

      if (teamXpPerHour > 0) {
        const timeToNext = calculateTimeToLevel(xpToNext, xpPerLevel, teamXpPerHour);
        if (timeToNext) {
          chips.appendChild(makeChip(`⏱ Next: ${formatTime(timeToNext.totalMinutes)}`, 'var(--qpm-positive,#4CAF50)'));
        }

        const levelsLeft = maxStr - pet.strength;
        const xpToMax = (xpPerLevel - xpToNext) + xpPerLevel * (levelsLeft - 1);
        const minsToMax = (xpToMax / teamXpPerHour) * 60;
        chips.appendChild(makeChip(`🏁 Max: ${formatTime(minsToMax)}`, 'var(--qpm-warning,#FF9800)'));

        if (pet.species) {
          const hungerCap = getHungerCapOrDefault(pet.species);
          const feeds = calculateFeedsPerLevel(pet.species, hungerCap, xpPerLevel, teamXpPerHour);
          if (feeds && feeds > 0) {
            chips.appendChild(makeChip(`🍖 ${feeds} feeds/lvl`, 'rgba(255,255,255,0.4)'));
          }
        }
      } else {
        chips.appendChild(makeChip('No XP rate', 'var(--qpm-text-muted,#555)'));
      }

      if (chips.children.length > 0) card.appendChild(chips);
    }
  } else if (!xpPerLevel && pet.species) {
    const note = document.createElement('div');
    note.textContent = 'XP/level loading from catalog…';
    note.style.cssText = 'font-size:10px;color:var(--qpm-text-muted,#444);font-style:italic;';
    card.appendChild(note);
  }

  return card;
}

// ============================================================================
// SUMMARY STRIP
// ============================================================================

function updateSummaryStrip(
  el: HTMLElement,
  stats: XpAbilityStats[],
  teamXpPerHour: number,
  weather: DetailedWeather,
  petCount: number,
): void {
  el.innerHTML = '';
  const abilityXp = teamXpPerHour - 3600;
  const weatherIcon = WEATHER_ICONS[weather] ?? '';
  const weatherLabel = weather === 'unknown' ? '' : weather;

  const frag = (html: string, color?: string) => {
    const s = document.createElement('span');
    s.innerHTML = html;
    if (color) s.style.color = color;
    return s;
  };

  if (stats.length === 0) {
    el.appendChild(frag(`${petCount} pet${petCount !== 1 ? 's' : ''}`, 'var(--qpm-text-muted,#666)'));
    el.appendChild(frag('·', 'var(--qpm-border,#444)'));
    el.appendChild(frag('3,600 XP/hr', 'var(--qpm-warning,#FF9800)'));
    el.appendChild(frag('(base, no XP abilities)', 'var(--qpm-text-muted,#444)'));
  } else {
    el.appendChild(frag('Base', 'var(--qpm-text-muted,#666)'));
    el.appendChild(frag('3,600', 'var(--qpm-warning,#FF9800)'));
    el.appendChild(frag('+', 'var(--qpm-text-muted,#444)'));
    el.appendChild(frag('Ability', 'var(--qpm-text-muted,#666)'));
    el.appendChild(frag(`+${formatCoins(abilityXp)}`, 'var(--qpm-warning,#FF9800)'));
    el.appendChild(frag('=', 'var(--qpm-text-muted,#444)'));

    const total = frag(formatCoins(teamXpPerHour) + ' XP/hr', 'var(--qpm-accent,#4CAF50)');
    total.style.fontWeight = '700';
    total.style.fontSize = '12px';
    el.appendChild(total);

    el.appendChild(frag(`· ${stats.length} XP ${stats.length === 1 ? 'pet' : 'pets'}`, 'var(--qpm-text-muted,#555)'));
  }

  if (weatherLabel) {
    const wChip = document.createElement('span');
    wChip.textContent = `${weatherIcon} ${weatherLabel}`;
    wChip.style.cssText = 'margin-left:auto;color:var(--qpm-text-muted,#666);font-size:11px;';
    el.appendChild(wChip);
  }
}

// ============================================================================
// MAIN DISPLAY UPDATE
// ============================================================================

function updateXpTrackerDisplay(state: XpTrackerWindowState): void {
  state.currentWeather = getWeatherSnapshot().kind;

  // Build XP stats for pets with XP abilities
  const allStats: XpAbilityStats[] = [];
  for (const pet of state.latestPets) {
    for (const def of findXpAbilities(pet)) {
      allStats.push(calculateXpStats(
        pet,
        def.id,
        getAbilityName(def.id),
        def.baseProbability ?? 0,
        def.effectValuePerProc ?? 0,
        def.requiredWeather ?? null,
        state.currentWeather,
      ));
    }
  }

  state.latestStats = allStats;
  const abilityXp = allStats.length > 0 ? getCombinedXpStats(allStats).totalXpPerHour : 0;
  state.totalTeamXpPerHour = 3600 + abilityXp;

  updateSummaryStrip(state.summaryStrip, allStats, state.totalTeamXpPerHour, state.currentWeather, state.latestPets.length);
  renderPetCards(state);
  void updateNearMaxLevelDisplay(state);
}

function renderPetCards(state: XpTrackerWindowState): void {
  state.petCardsContainer.innerHTML = '';
  if (state.latestPets.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'No active pets detected.';
    empty.style.cssText = 'padding:18px;color:var(--qpm-text-muted,#555);font-style:italic;text-align:center;font-size:12px;';
    state.petCardsContainer.appendChild(empty);
    state.updateScale?.();
    return;
  }
  for (const pet of state.latestPets) {
    state.petCardsContainer.appendChild(createPetCard(pet, state.totalTeamXpPerHour));
  }
  // Sync scaleOuter height after content changes so scrolling reflects visual size.
  state.updateScale?.();
}

// ============================================================================
// NEAR MAX LEVEL — get pets data
// ============================================================================

async function getAllPets(activePets: ActivePetInfo[]): Promise<PetWithLevel[]> {
  const allPets: PetWithLevel[] = [];

  // Active pets
  for (const pet of activePets) {
    if (!pet.species || pet.xp === null || pet.strength === null) continue;
    const xpPerLevel = getSpeciesXpPerLevel(pet.species);
    if (!xpPerLevel) continue;
    const levelsGained = Math.min(30, Math.floor(pet.xp / xpPerLevel));
    const hatchLevel = pet.strength - levelsGained;
    const maxStr = Math.min(hatchLevel + 30, 100);
    if (pet.strength >= maxStr) continue;
    const xpToNext = pet.xp % xpPerLevel;
    const levelsLeft = maxStr - pet.strength;
    const xpNeeded = (xpPerLevel - xpToNext) + xpPerLevel * (levelsLeft - 1);
    allPets.push({ name: pet.name || pet.species, species: pet.species, level: pet.strength, xp: pet.xp, maxStr, xpNeeded, xpPerLevel, source: 'active' });
  }

  // Shared item processor for inventory and hutch
  const processItems = (items: unknown[], source: 'inventory' | 'hutch') => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const i = item as Record<string, unknown>;
      const species = (i.petSpecies ?? i.species) as string | undefined;
      if (source === 'inventory' && i.itemType !== 'Pet') continue;
      if (!species || i.xp == null) continue;
      const xp = i.xp as number;
      const xpPerLevel = getSpeciesXpPerLevel(species);
      if (!xpPerLevel) continue;

      let currentStr: number, maxStr: number;
      if (i.strength != null) {
        currentStr = i.strength as number;
        const levelsGained = Math.min(30, Math.floor(xp / xpPerLevel));
        maxStr = Math.min(currentStr - levelsGained + 30, 100);
      } else {
        const parsedMax = parseMaxLevelFromName(i.name as string);
        if (!parsedMax || parsedMax < 80 || parsedMax > 100) continue;
        maxStr = parsedMax;
        currentStr = (maxStr - 30) + Math.min(30, Math.floor(xp / xpPerLevel));
      }

      if (currentStr >= maxStr) continue;
      const xpToNext = xp % xpPerLevel;
      const levelsLeft = maxStr - currentStr;
      const xpNeeded = (xpPerLevel - xpToNext) + xpPerLevel * (levelsLeft - 1);
      allPets.push({ name: (i.name as string) || species, species, level: currentStr, xp, maxStr, xpNeeded, xpPerLevel, source });
    }
  };

  try {
    const invAtom = getAtomByLabel('myInventoryAtom');
    if (invAtom) {
      const invData = await readAtomValue(invAtom) as { items?: unknown[] } | null;
      processItems(invData?.items ?? [], 'inventory');
    }
  } catch (e) { log('⚠️ Near max: inventory read failed', e); }

  try {
    const hutchAtom = getAtomByLabel('myPetHutchPetItemsAtom');
    if (hutchAtom) {
      const hutchData = await readAtomValue(hutchAtom) as unknown;
      processItems(Array.isArray(hutchData) ? hutchData : [], 'hutch');
    }
  } catch (e) { log('⚠️ Near max: hutch read failed', e); }

  return allPets;
}

// ============================================================================
// NEAR MAX LEVEL — display
// ============================================================================

async function updateNearMaxLevelDisplay(state: XpTrackerWindowState): Promise<void> {
  const container = state.nearMaxContainer;
  try {
    const allPets = (await getAllPets(state.latestPets))
      .sort((a, b) => a.xpNeeded - b.xpNeeded)
      .slice(0, 50);

    container.innerHTML = '';

    // Source filter pills
    const filterRow = document.createElement('div');
    filterRow.style.cssText = 'display:flex;gap:6px;padding:10px 14px 4px;flex-wrap:wrap;align-items:center;';

    const filterLbl = document.createElement('span');
    filterLbl.textContent = 'Show:';
    filterLbl.style.cssText = 'font-size:11px;color:var(--qpm-text-muted,#666);';
    filterRow.appendChild(filterLbl);

    const sourceDefs: Array<{ key: 'active' | 'inventory' | 'hutch'; label: string }> = [
      { key: 'active', label: '🟢 Active' },
      { key: 'inventory', label: '📦 Inventory' },
      { key: 'hutch', label: '🏠 Hutch' },
    ];

    for (const s of sourceDefs) {
      const btn = makePillButton(s.label, nearMaxSources.has(s.key));
      btn.addEventListener('click', () => {
        if (nearMaxSources.has(s.key)) nearMaxSources.delete(s.key);
        else nearMaxSources.add(s.key);
        void updateNearMaxLevelDisplay(state);
      });
      filterRow.appendChild(btn);
    }
    container.appendChild(filterRow);

    const filtered = allPets.filter(p => nearMaxSources.has(p.source)).slice(0, 10);

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = allPets.length === 0
        ? 'No pets near max level.'
        : 'No pets match current filters.';
      empty.style.cssText = 'padding:10px 14px 12px;font-size:12px;color:var(--qpm-text-muted,#555);font-style:italic;';
      container.appendChild(empty);
      return;
    }

    // Column header row — aligned with near-max pet row columns
    const nearMaxColHeader = document.createElement('div');
    nearMaxColHeader.style.cssText = 'display:flex;align-items:center;gap:8px;padding:2px 14px 4px;border-bottom:1px solid rgba(255,255,255,0.06);';
    const nmchSpacer = document.createElement('div');
    nmchSpacer.style.cssText = 'width:20px;flex-shrink:0;';
    const nmchName = document.createElement('span');
    nmchName.textContent = 'Pet';
    nmchName.style.cssText = 'flex:1;font-size:9px;color:var(--qpm-text-muted,#555);';
    const nmchBar = document.createElement('div');
    nmchBar.style.cssText = 'width:56px;flex-shrink:0;'; // progress bar column — no text label
    const nmchLvl = document.createElement('span');
    nmchLvl.textContent = 'Level';
    nmchLvl.style.cssText = 'width:44px;text-align:right;font-size:9px;color:var(--qpm-text-muted,#555);flex-shrink:0;';
    const nmchTime = document.createElement('span');
    nmchTime.textContent = 'To max';
    nmchTime.style.cssText = 'min-width:56px;text-align:right;font-size:9px;color:var(--qpm-text-muted,#555);flex-shrink:0;';
    nearMaxColHeader.append(nmchSpacer, nmchName, nmchBar, nmchLvl, nmchTime);
    container.appendChild(nearMaxColHeader);

    const list = document.createElement('div');
    list.style.cssText = 'padding:4px 14px 12px;display:flex;flex-direction:column;gap:6px;';

    const sourceIcons = { active: '🟢', inventory: '📦', hutch: '🏠' } as const;

    for (const pet of filtered) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;';

      // Sprite
      const img = document.createElement('img');
      img.src = getPetSpriteDataUrl(pet.species) ?? '';
      img.dataset.qpmSprite = `pet:${pet.species}`;
      img.alt = pet.species;
      img.style.cssText = 'width:20px;height:20px;object-fit:contain;image-rendering:pixelated;flex-shrink:0;';

      // Name
      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'flex:1;min-width:0;font-size:12px;color:var(--qpm-text,#ddd);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      nameEl.textContent = `${sourceIcons[pet.source]} ${pet.name}`;

      // Mini progress bar
      const totalXpForRange = pet.xpPerLevel * (pet.maxStr - pet.level);
      const xpDone = totalXpForRange - pet.xpNeeded;
      const pct = Math.max(0, Math.min(100, (xpDone / totalXpForRange) * 100));
      const barWrap = document.createElement('div');
      barWrap.style.cssText = 'width:56px;flex-shrink:0;';
      const track = document.createElement('div');
      track.style.cssText = 'height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;';
      const fill = document.createElement('div');
      fill.style.cssText = `width:${pct.toFixed(0)}%;height:100%;background:var(--qpm-accent,#4CAF50);border-radius:3px;`;
      track.appendChild(fill);
      barWrap.appendChild(track);

      // Level range
      const lvlEl = document.createElement('div');
      lvlEl.textContent = `${pet.level}→${pet.maxStr}`;
      lvlEl.style.cssText = 'font-size:10px;color:var(--qpm-text-muted,#666);font-family:monospace;flex-shrink:0;width:44px;text-align:right;';

      // Time to max
      const xpRate = pet.source === 'active' ? state.totalTeamXpPerHour : 3600;
      const minsToMax = xpRate > 0 ? (pet.xpNeeded / xpRate) * 60 : 0;
      const timeEl = document.createElement('div');
      timeEl.textContent = xpRate > 0 ? formatTime(minsToMax) : '—';
      timeEl.style.cssText = 'font-size:11px;color:var(--qpm-warning,#FF9800);font-family:monospace;flex-shrink:0;min-width:56px;text-align:right;';

      row.append(img, nameEl, barWrap, lvlEl, timeEl);
      list.appendChild(row);
    }

    container.appendChild(list);
  } catch (e) {
    log('⚠️ Near max update failed', e);
    container.innerHTML = '<div style="padding:12px 14px;color:var(--qpm-danger,#f44);font-size:12px;">Failed to load near max pets</div>';
  }
  // Sync scaleOuter height after async content update.
  state.updateScale?.();
}

// ============================================================================
// CREATE WINDOW
// ============================================================================

export function createXpTrackerWindow(): XpTrackerWindowState {
  const layout = loadLayout();
  const initWidth = Math.max(320, Math.min(layout?.width ?? DEFAULT_WIDTH, window.innerWidth - 32));
  const initHeight = Math.max(200, Math.min(layout?.height ?? DEFAULT_HEIGHT, window.innerHeight - 48));
  const initTop = layout?.top ?? 80;
  const initLeft = layout?.left ?? (window.innerWidth - initWidth - 20);

  // ── Root window ──
  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    `top:${initTop}px`,
    `left:${initLeft}px`,
    `width:${initWidth}px`,
    `height:${initHeight}px`,
    'min-width:320px',
    'min-height:200px',
    'max-width:calc(100vw - 16px)',
    'max-height:calc(100vh - 16px)',
    'background:var(--qpm-background,rgba(10,10,10,0.97))',
    'border:1px solid var(--qpm-border,#2a2a2a)',
    'border-radius:8px',
    'box-shadow:0 8px 40px rgba(0,0,0,0.75)',
    'z-index:10002',
    'font-family:Arial,sans-serif',
    'display:none',
    'flex-direction:column',
    'overflow:hidden',
  ].join(';');

  // ── Title bar (drag handle, always visible) ──
  const titleBar = document.createElement('div');
  titleBar.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:10px',
    'padding:9px 12px',
    'background:var(--qpm-surface-1,#141414)',
    'border-bottom:1px solid var(--qpm-border,#2a2a2a)',
    'cursor:move',
    'flex-shrink:0',
    'user-select:none',
  ].join(';');

  const titleText = document.createElement('span');
  titleText.textContent = '✨ XP Tracker';
  titleText.style.cssText = 'color:var(--qpm-text,#fff);font-size:14px;font-weight:700;flex:1;pointer-events:none;';

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&#x2715;';
  closeBtn.title = 'Close';
  closeBtn.style.cssText = [
    'background:transparent',
    'border:none',
    'color:var(--qpm-text-muted,#777)',
    'font-size:15px',
    'cursor:pointer',
    'padding:0 4px',
    'line-height:1',
    'border-radius:4px',
    'flex-shrink:0',
  ].join(';');
  closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#fff'; });
  closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = 'var(--qpm-text-muted,#777)'; });
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); root.style.display = 'none'; });

  titleBar.appendChild(titleText);
  titleBar.appendChild(closeBtn);
  root.appendChild(titleBar);

  // ── Summary strip (XP rate — compact, always visible) ──
  const summaryStrip = document.createElement('div');
  summaryStrip.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:6px',
    'flex-wrap:wrap',
    'padding:6px 14px',
    'background:var(--qpm-surface-1,#111)',
    'border-bottom:1px solid var(--qpm-border,#2a2a2a)',
    'font-size:11px',
    'font-family:monospace',
    'color:var(--qpm-text-muted,#777)',
    'flex-shrink:0',
  ].join(';');
  summaryStrip.textContent = 'Loading…';
  root.appendChild(summaryStrip);

  // ── Scrollable content area ──
  const scrollContent = document.createElement('div');
  scrollContent.style.cssText = [
    'flex:1',
    'overflow-y:auto',
    'overflow-x:hidden',
    'min-height:0',
    'scrollbar-width:thin',
    'scrollbar-color:rgba(255,255,255,0.1) transparent',
  ].join(';');

  // scaleOuter: height-tracking wrapper (transform on scaleWrapper doesn't affect layout)
  const scaleOuter = document.createElement('div');

  // scaleWrapper: scaled via transform so card backgrounds grow/shrink with the window
  const scaleWrapper = document.createElement('div');
  scaleWrapper.style.cssText = 'display:flex;flex-direction:column;';

  // Active pets section
  const activeSec = createCollapsible('🐾 Active Pets', true);
  const petCardsContainer = document.createElement('div');
  petCardsContainer.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:8px 12px 10px;';

  const loadingCard = document.createElement('div');
  loadingCard.textContent = 'Loading…';
  loadingCard.style.cssText = 'padding:12px;color:var(--qpm-text-muted,#555);font-style:italic;font-size:12px;';
  petCardsContainer.appendChild(loadingCard);

  activeSec.content.appendChild(petCardsContainer);
  scaleWrapper.appendChild(activeSec.wrapper);

  // Near Max Level section (collapsed by default)
  const nearMaxSec = createCollapsible('🏆 Near Max Level', false);
  const nearMaxContainer = document.createElement('div');
  nearMaxSec.content.appendChild(nearMaxContainer);
  scaleWrapper.appendChild(nearMaxSec.wrapper);

  scaleOuter.appendChild(scaleWrapper);
  scrollContent.appendChild(scaleOuter);
  root.appendChild(scrollContent);

  // ── Resize handle (corner grip) ──
  const resizeHandle = document.createElement('div');
  resizeHandle.title = 'Drag to resize';
  resizeHandle.style.cssText = [
    'position:absolute',
    'bottom:0',
    'right:0',
    'width:14px',
    'height:14px',
    'cursor:se-resize',
    'z-index:1',
    'background:linear-gradient(135deg,transparent 50%,rgba(255,255,255,0.12) 50%)',
    'border-radius:0 0 7px 0',
  ].join(';');
  root.appendChild(resizeHandle);

  document.body.appendChild(root);

  // ── State ──
  const state: XpTrackerWindowState = {
    root,
    scrollContent,
    summaryStrip,
    petCardsContainer,
    nearMaxContainer,
    latestPets: [],
    latestStats: [],
    totalTeamXpPerHour: 0,
    lastKnownSpecies: new Set(),
    unsubscribePets: null,
    unsubscribeXpTracker: null,
    resizeListener: null,
    currentWeather: 'unknown',
    updateInterval: null, // unused, kept for API compat
    scaleWrapper,
    scaleOuter,
    updateScale: null,
    resizeObserver: null,
  };

  // ── Window behaviours ──
  const onLayoutChange = () => saveLayout(root);

  makeDraggable(root, titleBar, onLayoutChange);
  makeResizable(root, resizeHandle, onLayoutChange);

  const resizeListener = () => {
    if (root.style.display !== 'none') clampToViewport(root);
  };
  window.addEventListener('resize', resizeListener);
  state.resizeListener = resizeListener;

  // Content scaling — live update as the user drags the resize handle
  const doUpdateScale = () => updateContentScale(scaleWrapper, scaleOuter, DEFAULT_WIDTH);
  state.updateScale = doUpdateScale;
  const scaleObserver = new ResizeObserver(doUpdateScale);
  scaleObserver.observe(root);
  state.resizeObserver = scaleObserver;

  // ── Subscriptions ──
  const throttledPetUpdate = throttle((pets: ActivePetInfo[]) => {
    state.latestPets = pets;
    updateXpTrackerDisplay(state);
  }, 500);
  state.unsubscribePets = onActivePetInfos(throttledPetUpdate);

  // Re-render cards when XP config changes (no new full stats calculation needed)
  state.unsubscribeXpTracker = onXpTrackerUpdate(() => {
    renderPetCards(state);
  });

  return state;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function showXpTrackerWindow(state: XpTrackerWindowState): void {
  const firstOpen = !loadLayout();
  state.root.style.display = 'flex';
  clampToViewport(state.root);
  updateXpTrackerDisplay(state); // calls state.updateScale?.() internally
  if (firstOpen) {
    autoSizeToContent(state.root, state.scrollContent);
    saveLayout(state.root);
  }
}

export function hideXpTrackerWindow(state: XpTrackerWindowState): void {
  state.root.style.display = 'none';
}

export function destroyXpTrackerWindow(state: XpTrackerWindowState): void {
  if (state.updateInterval) state.updateInterval();
  state.resizeObserver?.disconnect();
  if (state.resizeListener) window.removeEventListener('resize', state.resizeListener);
  state.unsubscribePets?.();
  state.unsubscribeXpTracker?.();
  state.root.remove();
}

/**
 * No-op — kept for API compatibility with originalPanel.ts.
 * Global window callbacks have been replaced with proper event listeners.
 */
export function setGlobalXpTrackerState(_state: XpTrackerWindowState): void {
  // intentionally empty
}
