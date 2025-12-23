// src/ui/trackerWindow.ts - Detailed ability tracker window with live countdowns

import { formatCoins, formatCoinsAbbreviated } from '../features/valueCalculator';
import { log } from '../utils/logger';
import { findBestMutationOpportunity, formatMutationOpportunity } from '../utils/gardenScanner';
import { getPetSpriteDataUrl } from '../sprite-v2/compat';
import { getAbilityColor } from '../utils/petCardRenderer';
import type { ActivePetInfo } from '../store/pets';
import type { AbilityContribution } from './originalPanel';
import type { AbilityDefinition } from '../data/petAbilities';

export interface AbilityGroup {
  definition: AbilityDefinition;
  entries: AbilityContribution[];
  totalProcsPerHour: number;
  chancePerMinute: number;
  combinedEtaMinutes: number | null;
  effectPerHour: number;
  totalSamples: number;
  lastProcAt: number | null;
  averageEffectPerProc: number | null;
}

export interface TrackerWindowState {
  root: HTMLElement;
  summaryText: HTMLElement;
  tbody: HTMLElement;
  footer: HTMLElement;
  updateInterval: number | null;
  latestAnalysis: any; // AbilityAnalysis type
  latestInfos: ActivePetInfo[];
}

/**
 * Calculate per-second check probability from per-minute percentage
 * Ability checks happen every second (60 times per minute)
 */
function calculatePerSecondProbability(perMinutePercent: number): number {
  // For small probabilities: P(per second) ≈ P(per minute) / 60
  // For larger probabilities use: 1 - (1 - P)^(1/60)
  if (perMinutePercent < 10) {
    return perMinutePercent / 60;
  }
  const pMinute = perMinutePercent / 100;
  const pSecond = 1 - Math.pow(1 - pMinute, 1 / 60);
  return pSecond * 100; // Return as percentage
}

/**
 * Format live countdown ETA for next expected proc
 */
export function calculateLiveETA(
  lastProcAt: number,
  expectedMinutesBetween: number | null,
  effectiveProcsPerHour?: number,
): { text: string; isOverdue: boolean } {
  // Use effective proc rate if provided (for Rainbow/Gold waste calculation)
  const minutesBetween = effectiveProcsPerHour
    ? effectiveProcsPerHour > 0
      ? 60 / effectiveProcsPerHour
      : null
    : expectedMinutesBetween;

  if (!minutesBetween || minutesBetween <= 0) {
    return { text: '—', isOverdue: false };
  }

  const now = Date.now();
  const expectedNextProc = lastProcAt + minutesBetween * 60 * 1000;
  const msRemaining = expectedNextProc - now;

  if (msRemaining < 0) {
    // Overdue - show negative countdown
    const overdue = Math.abs(msRemaining);
    const hours = Math.floor(overdue / 3600000);
    const minutes = Math.floor((overdue % 3600000) / 60000);
    const seconds = Math.floor((overdue % 60000) / 1000);

    if (hours > 0) {
      return { text: `-${hours}h ${minutes}m ${seconds}s`, isOverdue: true };
    } else if (minutes > 0) {
      return { text: `-${minutes}m ${seconds}s`, isOverdue: true };
    } else {
      return { text: `-${seconds}s`, isOverdue: true };
    }
  }

  const hours = Math.floor(msRemaining / 3600000);
  const minutes = Math.floor((msRemaining % 3600000) / 60000);
  const seconds = Math.floor((msRemaining % 60000) / 1000);

  if (hours > 0) {
    return { text: `${hours}h ${minutes}m ${seconds}s`, isOverdue: false };
  } else if (minutes > 0) {
    return { text: `${minutes}m ${seconds}s`, isOverdue: false };
  } else {
    return { text: `${seconds}s`, isOverdue: false };
  }
}

/**
 * Format the per-second check probability display
 */
function formatCheckProbability(perMinutePercent: number): string {
  const perSecond = calculatePerSecondProbability(perMinutePercent);
  if (perSecond < 0.01) {
    return `${perSecond.toFixed(4)}%/s`;
  } else if (perSecond < 1) {
    return `${perSecond.toFixed(3)}%/s`;
  } else {
    return `${perSecond.toFixed(2)}%/s`;
  }
}

/**
 * Create a row for a pet ability in the tracker table
 */
export function createAbilityRow(
  entry: AbilityContribution,
  abilityName: string,
  tbody: HTMLTableSectionElement,
  detailedView: boolean = false,
  savedBaselines?: Map<string, number>,
): HTMLTableRowElement {
  const row = tbody.insertRow();
  row.style.cssText = 'border-bottom: 1px solid var(--qpm-border, #444);';

  // Add data attributes for tracking across re-renders
  row.dataset.petIndex = String(entry.petIndex);
  row.dataset.abilityId = entry.definition.id;

  // Use base proc rate (no waste adjustment)
  const effectiveProcsPerHour = entry.procsPerHour;

  // Pet Name (with sprite, ALL ability badges, and strength)
  const nameCell = row.insertCell();
  const petStrength = entry.pet.strength;
  const strengthText = petStrength != null ? ` (STR ${petStrength})` : '';
  
  // Get pet sprite
  const petSprite = entry.pet.species ? getPetSpriteDataUrl(entry.pet.species) : null;
  
  // Build ALL ability badges (up to 4)
  const petAbilities = entry.pet.abilities || [];
  const abilityBadgesHtml = petAbilities.slice(0, 4).map((abilityName, idx) => {
    const color = getAbilityColor(abilityName);
    return `<div style="width:8px;height:8px;border-radius:2px;background:${color.base};border:1px solid rgba(255,255,255,0.4);box-shadow:0 0 3px ${color.glow};" title="${abilityName}"></div>`;
  }).join('');
  
  // Create sprite container with ability badges column on left (matching user's image style)
  const spriteContainerHtml = petSprite
    ? `<div style="position:relative;display:inline-flex;align-items:center;margin-right:6px;">
        ${abilityBadgesHtml ? `<div style="display:flex;flex-direction:column;gap:2px;margin-right:4px;">${abilityBadgesHtml}</div>` : ''}
        <img data-qpm-sprite="pet:${entry.pet.species}" src="${petSprite}" style="width:20px;height:20px;object-fit:contain;image-rendering:pixelated;" alt="${entry.pet.species}" />
      </div>`
    : '';
  
  nameCell.innerHTML = `<div style="display:flex;align-items:center;">${spriteContainerHtml}<span>${entry.displayName}${strengthText}</span></div>`;
  nameCell.style.cssText = `
    padding: 10px 12px;
    color: var(--qpm-text, #fff);
    font-weight: 500;
    white-space: nowrap;
  `;
  nameCell.title = `Pet: ${entry.displayName}${petStrength != null ? `\nStrength: ${petStrength}` : '\nStrength: Unknown'}`;

  // Ability
  const abilityCell = row.insertCell();
  abilityCell.textContent = abilityName;
  abilityCell.style.cssText = `
    padding: 10px 12px;
    color: var(--qpm-text, #fff);
    white-space: nowrap;
  `;

  // Chance Per Minute - calculate actual percentage based on wiki formula
  const chanceCell = row.insertCell();
  const petStrengthValue = entry.pet.strength ?? 100;
  const baseProb = entry.definition.baseProbability ?? 0;
  const baseProbPerSecond = baseProb / 60; // Convert per-minute to per-second
  const actualChancePerSecond = (baseProbPerSecond * petStrengthValue) / 100;
  const actualChancePerMinute = actualChancePerSecond * 60;
  const chanceText = `${actualChancePerMinute.toFixed(2)}%/min`;

  chanceCell.textContent = chanceText;
  chanceCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-text, #fff);
    font-family: monospace;
    white-space: nowrap;
  `;
  chanceCell.title = `Base Chance: ${baseProb.toFixed(2)}%/min\nWith STR ${petStrengthValue}: ${actualChancePerMinute.toFixed(2)}%/min\nPer Second: ${actualChancePerSecond.toFixed(3)}%/sec (game checks every second)`;

  // Procs Per Hour
  const procsCell = row.insertCell();
  procsCell.textContent = effectiveProcsPerHour.toFixed(2);
  procsCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-text, #fff);
    font-family: monospace;
  `;
  procsCell.title = `${entry.procsPerHour.toFixed(2)} procs/hour`;

  // Coins Per Proc
  const coinsPerProcCell = row.insertCell();
  const coinsPerProc = entry.effectPerProc ?? 0;
  const formatFunc = detailedView ? formatCoins : formatCoinsAbbreviated;
  coinsPerProcCell.textContent = coinsPerProc > 0 ? formatFunc(coinsPerProc) : '—';
  coinsPerProcCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: ${coinsPerProc > 0 ? 'var(--qpm-warning, #ffa500)' : 'var(--qpm-text-muted, #aaa)'};
    font-family: monospace;
    font-weight: 500;
  `;
  if (entry.effectDetail) {
    coinsPerProcCell.title = entry.effectDetail;
  }
  if (!detailedView && coinsPerProc > 0) {
    coinsPerProcCell.title = `Exact: ${formatCoins(coinsPerProc)}`;
  }

  // Coins Per Hour
  const coinsPerHourCell = row.insertCell();
  const coinsPerHour = effectiveProcsPerHour * (coinsPerProc > 0 ? coinsPerProc : 0);
  coinsPerHourCell.textContent = coinsPerHour > 0 ? formatFunc(coinsPerHour) : '—';
  coinsPerHourCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: ${coinsPerHour > 0 ? 'var(--qpm-warning, #ffa500)' : 'var(--qpm-text-muted, #aaa)'};
    font-family: monospace;
    font-weight: 600;
  `;
  if (!detailedView && coinsPerHour > 0) {
    coinsPerHourCell.title = `Exact: ${formatCoins(coinsPerHour)}/hr`;
  }

  // Next Proc ETA (Live Countdown)
  const etaCell = row.insertCell();
  etaCell.className = 'eta-countdown';
  const avgMinutes = effectiveProcsPerHour > 0 ? 60 / effectiveProcsPerHour : 0;

  if (effectiveProcsPerHour > 0) {
    // Show live countdown (using last proc time or saved baseline or current time)
    let baselineTime: number;
    let isEstimate: boolean;

    if (entry.lastProcAt && entry.lastProcAt > 0) {
      // Has actual proc history - use it
      baselineTime = entry.lastProcAt;
      isEstimate = false;
    } else {
      // No proc history - try to use saved baseline from previous render
      const baselineKey = `${entry.petIndex}:${entry.definition.id}`;
      const savedBaseline = savedBaselines?.get(baselineKey);
      baselineTime = savedBaseline || Date.now();
      isEstimate = true;
    }

    etaCell.dataset.lastProc = String(baselineTime);
    etaCell.dataset.effectiveRate = String(effectiveProcsPerHour);
    etaCell.dataset.normalColor = 'var(--qpm-positive, #4CAF50)';
    etaCell.dataset.isEstimate = isEstimate ? 'true' : 'false';
    const etaResult = calculateLiveETA(baselineTime, entry.expectedMinutesBetween, effectiveProcsPerHour);
    etaCell.textContent = etaResult.text;
    etaCell.style.cssText = `
      padding: 10px 12px;
      text-align: right;
      color: ${etaResult.isOverdue ? 'var(--qpm-danger, #ef5350)' : 'var(--qpm-positive, #4CAF50)'};
      font-family: monospace;
      font-weight: 500;
      white-space: nowrap;
    `;
    if (!isEstimate) {
      etaCell.title = `Average ${avgMinutes.toFixed(1)} minutes between procs\nLast proc: ${new Date(entry.lastProcAt!).toLocaleTimeString()}`;
    } else {
      etaCell.title = `Estimated ${avgMinutes.toFixed(1)} minutes between procs\nNo proc history yet`;
    }
  } else {
    // No rate available
    etaCell.textContent = '—';
    etaCell.style.cssText = `
      padding: 10px 12px;
      text-align: right;
      color: var(--qpm-text-muted, #aaa);
      font-family: monospace;
      font-weight: 500;
      white-space: nowrap;
    `;
    etaCell.title = 'No proc rate available';
  }

  // Add detailed view row if enabled
  if (detailedView) {
    const detailRow = tbody.insertRow();
    detailRow.style.cssText = `
      background: var(--qpm-surface-2, #222);
      border-bottom: 1px solid var(--qpm-border, #444);
    `;

    const detailCell = detailRow.insertCell();
    detailCell.colSpan = 7;
    detailCell.style.cssText = `
      padding: 8px 12px;
      font-size: 11px;
      color: var(--qpm-text-muted, #aaa);
      line-height: 1.6;
    `;

    const petStrengthVal = entry.pet.strength ?? 100;
    const baseProbVal = entry.definition.baseProbability ?? 0;
    const strMultiplier = petStrengthVal / 100;
    const modifiedProb = baseProbVal * strMultiplier;

    const detailParts: string[] = [];

    // Chance per minute (wiki format: "X% × STR = Y%")
    if (baseProbVal > 0) {
      detailParts.push(`<strong>Chance Per Minute:</strong> ${baseProbVal.toFixed(2)}% × ${petStrengthVal} = ${modifiedProb.toFixed(2)}%`);
    }

    // Effect calculation (wiki format: "Effect: X × STR = Y")
    if (entry.definition.effectLabel && entry.definition.effectBaseValue != null) {
      const effectResult = entry.definition.effectBaseValue * strMultiplier;
      const suffix = entry.definition.effectSuffix ?? '';
      detailParts.push(`<strong>${entry.definition.effectLabel}:</strong> ${entry.definition.effectBaseValue}${suffix} × ${petStrengthVal} = ${effectResult.toFixed(1)}${suffix}`);
    }

    // Mutation opportunity for Crop Mutation Boost abilities
    if (entry.definition.id === 'ProduceMutationBoost' || entry.definition.id === 'ProduceMutationBoostII') {
      try {
        const opportunity = findBestMutationOpportunity();
        if (opportunity) {
          const opportunityText = formatMutationOpportunity(opportunity, petStrengthVal);
          detailParts.push(`<strong>🌟 Opportunity:</strong> ${opportunityText}`);
        }
      } catch (error) {
        log('⚠️ Failed to calculate mutation opportunity', error);
      }
    }

    // Data source info
    if (entry.procsPerHourSource === 'observed') {
      detailParts.push(`<strong>Data Source:</strong> Observed (${entry.sampleCount} sample${entry.sampleCount !== 1 ? 's' : ''})`);
    } else {
      detailParts.push(`<strong>Data Source:</strong> Estimated from ability definition`);
    }

    // Last proc info
    if (entry.lastProcAt) {
      const lastProcDate = new Date(entry.lastProcAt);
      const timeSince = Date.now() - entry.lastProcAt;
      const minutesSince = Math.floor(timeSince / 60000);
      const hoursSince = Math.floor(minutesSince / 60);
      const timeStr = hoursSince > 0 ? `${hoursSince}h ${minutesSince % 60}m ago` : `${minutesSince}m ago`;
      detailParts.push(`<strong>Last Proc:</strong> ${lastProcDate.toLocaleTimeString()} (${timeStr})`);
    }

    detailCell.innerHTML = detailParts.join(' • ');
  }

  return row;
}

/**
 * Create a total row for an ability group (showing combined stats for multiple pets with same ability)
 */
export function createAbilityGroupTotalRow(
  group: AbilityGroup,
  tbody: HTMLTableSectionElement,
  detailedView: boolean = false,
  savedGroupBaselines?: Map<string, number>,
): HTMLTableRowElement | null {
  // Only create total row if there are 2+ pets with this ability
  if (group.entries.length < 2) {
    // Return the last row if it exists
    const lastIndex = tbody.rows.length - 1;
    return lastIndex >= 0 ? (tbody.rows[lastIndex] ?? null) : null;
  }

  const row = tbody.insertRow();
  row.style.cssText = `
    border-bottom: 2px solid var(--qpm-border, #555);
    background: var(--qpm-surface-2, #222);
    font-weight: 600;
  `;

  // Add data attributes for tracking across re-renders
  row.dataset.isGroupRow = 'true';
  row.dataset.abilityId = group.definition.id;

  // "Total" label
  const nameCell = row.insertCell();
  nameCell.textContent = `📊 Total (${group.entries.length})`;
  nameCell.style.cssText = `
    padding: 10px 12px;
    color: var(--qpm-accent, #4CAF50);
    font-weight: 600;
    white-space: nowrap;
  `;

  // Ability name
  const abilityCell = row.insertCell();
  abilityCell.textContent = group.definition.name;
  abilityCell.style.cssText = `
    padding: 10px 12px;
    color: var(--qpm-accent, #4CAF50);
    white-space: nowrap;
  `;

  // Combined chance per minute
  const chanceCell = row.insertCell();
  chanceCell.textContent = `${group.chancePerMinute.toFixed(2)}%/min`;
  chanceCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-accent, #4CAF50);
    font-family: monospace;
    white-space: nowrap;
    font-weight: 600;
  `;
  chanceCell.title = `Combined chance from ${group.entries.length} pets`;

  // Total procs per hour
  const procsCell = row.insertCell();
  procsCell.textContent = group.totalProcsPerHour.toFixed(2);
  procsCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-accent, #4CAF50);
    font-family: monospace;
    font-weight: 600;
  `;
  procsCell.title = `Combined procs/hour from ${group.entries.length} pets`;

  // Average coins per proc
  const coinsPerProcCell = row.insertCell();
  const avgCoinsPerProc = group.averageEffectPerProc ?? 0;
  const formatFunc = detailedView ? formatCoins : formatCoinsAbbreviated;
  coinsPerProcCell.textContent = avgCoinsPerProc > 0 ? formatFunc(avgCoinsPerProc) : '—';
  coinsPerProcCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: ${avgCoinsPerProc > 0 ? 'var(--qpm-warning, #ffa500)' : 'var(--qpm-text-muted, #aaa)'};
    font-family: monospace;
    font-weight: 600;
  `;
  if (avgCoinsPerProc > 0) {
    coinsPerProcCell.title = detailedView ? 'Average coins per proc' : `Exact: ${formatCoins(avgCoinsPerProc)}`;
  }

  // Total coins per hour
  const coinsPerHourCell = row.insertCell();
  const totalCoinsPerHour = group.effectPerHour;
  coinsPerHourCell.textContent = totalCoinsPerHour > 0 ? formatFunc(totalCoinsPerHour) : '—';
  coinsPerHourCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: ${totalCoinsPerHour > 0 ? 'var(--qpm-warning, #ffa500)' : 'var(--qpm-text-muted, #aaa)'};
    font-family: monospace;
    font-weight: 600;
  `;
  if (totalCoinsPerHour > 0) {
    coinsPerHourCell.title = detailedView ? `Combined coins/hour from ${group.entries.length} pets` : `Exact: ${formatCoins(totalCoinsPerHour)}/hr`;
  }

  // Combined Next ETA
  const etaCell = row.insertCell();
  etaCell.className = 'eta-countdown';
  const avgMinutes = group.totalProcsPerHour > 0 ? 60 / group.totalProcsPerHour : 0;

  if (group.totalProcsPerHour > 0) {
    // Show live countdown (using last proc time or saved baseline or current time)
    let baselineTime: number;
    let isEstimate: boolean;

    if (group.lastProcAt && group.lastProcAt > 0) {
      // Has actual proc history - use it
      baselineTime = group.lastProcAt;
      isEstimate = false;
    } else {
      // No proc history - try to use saved baseline from previous render
      const baselineKey = `group:${group.definition.id}`;
      const savedBaseline = savedGroupBaselines?.get(baselineKey);
      baselineTime = savedBaseline || Date.now();
      isEstimate = true;
    }

    etaCell.dataset.lastProc = String(baselineTime);
    etaCell.dataset.effectiveRate = String(group.totalProcsPerHour);
    etaCell.dataset.normalColor = 'var(--qpm-accent, #4CAF50)';
    etaCell.dataset.isEstimate = isEstimate ? 'true' : 'false';
    const etaResult = calculateLiveETA(baselineTime, group.combinedEtaMinutes, group.totalProcsPerHour);
    etaCell.textContent = etaResult.text;
    etaCell.style.cssText = `
      padding: 10px 12px;
      text-align: right;
      color: ${etaResult.isOverdue ? 'var(--qpm-danger, #ef5350)' : 'var(--qpm-accent, #4CAF50)'};
      font-family: monospace;
      font-weight: 600;
      white-space: nowrap;
    `;
    if (!isEstimate) {
      etaCell.title = `Combined average: ${avgMinutes.toFixed(1)} minutes between procs\nLast proc: ${new Date(group.lastProcAt!).toLocaleTimeString()}`;
    } else {
      etaCell.title = `Estimated ${avgMinutes.toFixed(1)} minutes between procs\nNo proc history yet`;
    }
  } else {
    // No rate available
    etaCell.textContent = '—';
    etaCell.style.cssText = `
      padding: 10px 12px;
      text-align: right;
      color: var(--qpm-text-muted, #aaa);
      font-family: monospace;
      font-weight: 600;
      white-space: nowrap;
    `;
    etaCell.title = 'No proc rate available';
  }

  return row;
}
