// src/ui/xpTracker/xpTrackerContent.ts — XP Tracker content (renders inside modalWindow or hub card)

import { formatCoins } from '../../features/valueCalculator';
import { log } from '../../utils/logger';
import { onActivePetInfos, type ActivePetInfo } from '../../store/pets';
import { getPetSpriteDataUrlWithMutations } from '../../sprite-v2/compat';
import {
  calculateXpStats,
  getCombinedXpStats,
  getSpeciesXpPerLevel,
  calculateMaxStrength,
  calculateTimeToLevel,
  onXpTrackerUpdate,
  type XpAbilityStats,
} from '../../store/xpTracker';
import { getAbilityDefinition, type AbilityDefinition } from '../../data/petAbilities';
import { getAbilityColor } from '../../utils/petCardRenderer';
import { getHungerCapOrDefault } from '../../data/petHungerCaps';
import { calculateFeedsPerLevel } from '../../data/petHungerDepletion';
import { throttle } from '../../utils/scheduling';
import { getWeatherSnapshot } from '../../store/weatherHub';
import type { DetailedWeather } from '../../utils/weatherDetection';
import { getAbilityName } from '../../utils/catalogHelpers';
import { onCatalogsReady } from '../../catalogs/gameCatalogs';
import { renderNearMaxSection, type NearMaxState } from './nearMaxSection';

// ============================================================================
// CONSTANTS
// ============================================================================

const WEATHER_ICONS: Record<string, string> = {
  snow: '❄️', rain: '🌧️', dawn: '🌅', amber: '🌕', sunny: '☀️',
};

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

export interface XpTrackerSummaryStats {
  abilityCount: number;
  abilityXpPerHour: number;
  totalTeamXpPerHour: number;
  totalProcsPerHour: number;
  totalProcCount: number;
  currentWeather: DetailedWeather;
}

interface XpTrackerComputedStats extends XpTrackerSummaryStats {
  stats: XpAbilityStats[];
}

function getXpTrackerComputedStats(pets: ActivePetInfo[]): XpTrackerComputedStats {
  const currentWeather = getWeatherSnapshot().kind;
  const stats: XpAbilityStats[] = [];
  for (const pet of pets) {
    for (const def of findXpAbilities(pet)) {
      stats.push(calculateXpStats(
        pet,
        def.id,
        getAbilityName(def.id),
        def.baseProbability ?? 0,
        def.effectValuePerProc ?? 0,
        def.requiredWeather ?? null,
        currentWeather,
      ));
    }
  }

  const combined = stats.length > 0 ? getCombinedXpStats(stats) : null;
  const abilityXpPerHour = combined?.totalXpPerHour ?? 0;
  return {
    stats,
    abilityCount: stats.length,
    abilityXpPerHour,
    totalTeamXpPerHour: 3600 + abilityXpPerHour,
    totalProcsPerHour: combined?.totalProcsPerHour ?? 0,
    totalProcCount: combined?.totalProcCount ?? 0,
    currentWeather,
  };
}

export function getXpTrackerSummaryStats(pets: ActivePetInfo[]): XpTrackerSummaryStats {
  const { stats: _stats, ...summary } = getXpTrackerComputedStats(pets);
  return summary;
}

// ============================================================================
// UTILITY HELPERS
// ============================================================================

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

export function getMaxStr(pet: ActivePetInfo): number | null {
  if (pet.species && pet.targetScale) return calculateMaxStrength(pet.targetScale, pet.species);
  if (pet.strength != null && pet.strength >= 80 && pet.strength <= 100) return pet.strength;
  return null;
}

// ============================================================================
// UI PRIMITIVES
// ============================================================================

export function makeChip(text: string, color: string): HTMLElement {
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

export function makePillButton(text: string, active: boolean): HTMLButtonElement {
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

  // Ability badge column
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
    img.src = getPetSpriteDataUrlWithMutations(pet.species, pet.mutations ?? []) ?? '';
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
// RENDER CONTENT (embeddable — no window chrome)
// ============================================================================

/**
 * Builds XP tracker content inside the given container.
 * Sets up subscriptions for live updates and returns an idempotent cleanup function.
 */
export function renderXpTrackerContent(container: HTMLElement): () => void {
  let cleaned = false;
  const cleanups: Array<() => void> = [];

  // -- Internal state --
  let latestPets: ActivePetInfo[] = [];
  let latestStats: XpAbilityStats[] = [];
  let totalTeamXpPerHour = 0;
  let currentWeather: DetailedWeather = 'unknown';

  // Near-max state (shared with nearMaxSection)
  const nearMaxState: NearMaxState = {
    expandedPetKey: null,
    busyPetKey: null,
    status: null,
    statusTimer: null,
  };

  // -- DOM structure --
  // Summary strip
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
  container.appendChild(summaryStrip);

  // Scrollable content area
  const scrollContent = document.createElement('div');
  scrollContent.style.cssText = [
    'flex:1',
    'overflow-y:auto',
    'overflow-x:hidden',
    'min-height:0',
    'scrollbar-width:thin',
    'scrollbar-color:rgba(255,255,255,0.1) transparent',
  ].join(';');

  const contentWrap = document.createElement('div');
  contentWrap.style.cssText = 'display:flex;flex-direction:column;';

  // Active pets section
  const activeSec = createCollapsible('🐾 Active Pets', true);
  const petCardsContainer = document.createElement('div');
  petCardsContainer.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:8px 12px 10px;';

  const loadingCard = document.createElement('div');
  loadingCard.textContent = 'Loading…';
  loadingCard.style.cssText = 'padding:12px;color:var(--qpm-text-muted,#555);font-style:italic;font-size:12px;';
  petCardsContainer.appendChild(loadingCard);

  activeSec.content.appendChild(petCardsContainer);
  contentWrap.appendChild(activeSec.wrapper);

  // Near Max Level section (collapsed by default)
  const nearMaxSec = createCollapsible('🏆 Near Max Level', false);
  const nearMaxContainer = document.createElement('div');
  nearMaxSec.content.appendChild(nearMaxContainer);
  contentWrap.appendChild(nearMaxSec.wrapper);

  scrollContent.appendChild(contentWrap);
  container.appendChild(scrollContent);

  // -- Render functions --
  const renderPetCards = (): void => {
    petCardsContainer.innerHTML = '';
    if (latestPets.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No active pets detected.';
      empty.style.cssText = 'padding:18px;color:var(--qpm-text-muted,#555);font-style:italic;text-align:center;font-size:12px;';
      petCardsContainer.appendChild(empty);
      return;
    }
    for (const pet of latestPets) {
      petCardsContainer.appendChild(createPetCard(pet, totalTeamXpPerHour));
    }
  };

  const updateDisplay = (): void => {
    const computed = getXpTrackerComputedStats(latestPets);
    currentWeather = computed.currentWeather;
    latestStats = computed.stats;
    totalTeamXpPerHour = computed.totalTeamXpPerHour;

    updateSummaryStrip(summaryStrip, latestStats, totalTeamXpPerHour, currentWeather, latestPets.length);
    renderPetCards();
    renderNearMaxSection(nearMaxContainer, nearMaxState, latestPets, totalTeamXpPerHour);
  };

  // -- Subscriptions --
  const throttledPetUpdate = throttle((pets: ActivePetInfo[]) => {
    latestPets = pets;
    updateDisplay();
  }, 500);
  const unsubPets = onActivePetInfos(throttledPetUpdate);
  cleanups.push(unsubPets);

  const unsubXpTracker = onXpTrackerUpdate(() => { renderPetCards(); });
  cleanups.push(unsubXpTracker);

  const unsubCatalogs = onCatalogsReady(() => {
    renderNearMaxSection(nearMaxContainer, nearMaxState, latestPets, totalTeamXpPerHour);
  });
  cleanups.push(unsubCatalogs);

  // Clean up near-max status timer
  cleanups.push(() => {
    if (nearMaxState.statusTimer != null) {
      window.clearTimeout(nearMaxState.statusTimer);
      nearMaxState.statusTimer = null;
    }
  });

  // -- Idempotent cleanup --
  return () => {
    if (cleaned) return;
    cleaned = true;
    for (const fn of cleanups) fn();
    cleanups.length = 0;
  };
}
