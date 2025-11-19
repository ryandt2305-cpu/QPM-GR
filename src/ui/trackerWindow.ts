// src/ui/trackerWindow.ts - Detailed ability tracker window with live countdowns

import { formatCoins, formatCoinsAbbreviated } from '../features/valueCalculator';
import { buildAbilityValuationContext } from '../features/abilityValuation';
import { log } from '../utils/logger';
import { findBestMutationOpportunity, formatMutationOpportunity } from '../utils/gardenScanner';
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
 * Calculate effective proc rate for Rainbow/Gold Granter abilities
 * These can waste procs on already-colored plants
 */
export function calculateEffectiveProcRate(
  baseProcsPerHour: number,
  abilityId: string,
): { effective: number; wastePercent: number } {
  // Only Rainbow/Gold Granter abilities have waste
  if (abilityId !== 'RainbowGranter' && abilityId !== 'GoldGranter') {
    return { effective: baseProcsPerHour, wastePercent: 0 };
  }

  try {
    const context = buildAbilityValuationContext();
    const totalCrops = context.crops.length;
    const uncoloredCrops = context.uncoloredCrops.length;

    if (totalCrops === 0) {
      return { effective: 0, wastePercent: 100 };
    }

    // Effective rate = base rate * (uncolored / total)
    // Waste = 1 - (uncolored / total)
    const efficiency = uncoloredCrops / totalCrops;
    const wastePercent = (1 - efficiency) * 100;
    const effective = baseProcsPerHour * efficiency;

    return { effective, wastePercent };
  } catch (error) {
    log('⚠️ Failed to calculate effective proc rate', error);
    return { effective: baseProcsPerHour, wastePercent: 0 };
  }
}

/**
 * Format live countdown ETA for next expected proc
 */
export function calculateLiveETA(
  lastProcAt: number | null,
  expectedMinutesBetween: number | null,
  effectiveProcsPerHour?: number,
): { text: string; isOverdue: boolean } {
  // Use effective proc rate if provided (for Rainbow/Gold waste calculation)
  const minutesBetween = effectiveProcsPerHour
    ? effectiveProcsPerHour > 0
      ? 60 / effectiveProcsPerHour
      : null
    : expectedMinutesBetween;

  if (!lastProcAt || !minutesBetween || minutesBetween <= 0) {
    const fallbackMinutes = expectedMinutesBetween;
    if (fallbackMinutes && fallbackMinutes > 0) {
      const hours = Math.floor(fallbackMinutes / 60);
      const mins = Math.round(fallbackMinutes % 60);
      if (hours > 0) {
        return { text: `${hours}h ${mins}m Est.`, isOverdue: false };
      }
      return { text: `${mins}m Est.`, isOverdue: false };
    }
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
): HTMLTableRowElement {
  const row = tbody.insertRow();
  row.style.cssText = 'border-bottom: 1px solid var(--qpm-border);';

  // Calculate effective rates (accounting for waste)
  const { effective: effectiveProcsPerHour, wastePercent } = calculateEffectiveProcRate(
    entry.procsPerHour,
    entry.definition.id,
  );
  const effectiveChancePerMinute = effectiveProcsPerHour / 60;

  // Pet Name (with strength)
  const nameCell = row.insertCell();
  const petStrength = entry.pet.strength;
  const strengthText = petStrength != null ? ` (STR ${petStrength})` : '';
  nameCell.textContent = entry.displayName + strengthText;
  nameCell.style.cssText = `
    padding: 10px 12px;
    color: var(--qpm-text);
    font-weight: 500;
    white-space: nowrap;
  `;
  nameCell.title = `Pet: ${entry.displayName}${petStrength != null ? `\nStrength: ${petStrength}` : '\nStrength: Unknown'}`;

  // Ability
  const abilityCell = row.insertCell();
  abilityCell.textContent = abilityName;
  abilityCell.style.cssText = `
    padding: 10px 12px;
    color: var(--qpm-text);
    white-space: nowrap;
  `;
  if (wastePercent > 0) {
    abilityCell.title = `⚠️ ${wastePercent.toFixed(1)}% proc waste (targeting colored plants)`;
  }

  // Chance Per Second - calculate actual percentage based on wiki formula (game checks every second)
  const chanceCell = row.insertCell();
  const petStrengthValue = entry.pet.strength ?? 100;
  const baseProb = entry.definition.baseProbability ?? 0;
  const baseProbPerSecond = baseProb / 60; // Convert per-minute to per-second
  const actualChancePerSecond = (baseProbPerSecond * petStrengthValue) / 100;
  const actualChancePerMinute = actualChancePerSecond * 60;
  const chanceText = `${actualChancePerMinute.toFixed(2)}%/min`;

  chanceCell.innerHTML = wastePercent > 0
    ? `${chanceText} <span style="color: var(--qpm-warning); font-size: 10px;">(-${wastePercent.toFixed(0)}%)</span>`
    : chanceText;
  chanceCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-text);
    font-family: monospace;
    white-space: nowrap;
  `;
  chanceCell.title = wastePercent > 0
    ? `Base: ${(baseProbPerSecond * 60).toFixed(2)}%/min × ${petStrengthValue}/100 = ${actualChancePerMinute.toFixed(2)}%/min\n${wastePercent.toFixed(1)}% waste from colored plants`
    : `Base: ${(baseProbPerSecond * 60).toFixed(2)}%/min × ${petStrengthValue}/100 = ${actualChancePerMinute.toFixed(2)}%/min (game checks every second)`;

  // Procs Per Hour (effective)
  const procsCell = row.insertCell();
  procsCell.textContent = effectiveProcsPerHour.toFixed(2);
  procsCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-text);
    font-family: monospace;
  `;
  procsCell.title = wastePercent > 0
    ? `Base: ${entry.procsPerHour.toFixed(2)}/hr\nEffective: ${effectiveProcsPerHour.toFixed(2)}/hr after waste`
    : `${entry.procsPerHour.toFixed(2)} procs/hour`;

  // Coins Per Proc
  const coinsPerProcCell = row.insertCell();
  const coinsPerProc = entry.effectPerProc ?? 0;
  const formatFunc = detailedView ? formatCoins : formatCoinsAbbreviated;
  coinsPerProcCell.textContent = coinsPerProc > 0 ? formatFunc(coinsPerProc) : '—';
  coinsPerProcCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: ${coinsPerProc > 0 ? 'var(--qpm-warning)' : 'var(--qpm-text-muted)'};
    font-family: monospace;
    font-weight: 500;
  `;
  if (entry.effectDetail) {
    coinsPerProcCell.title = entry.effectDetail;
  }
  if (!detailedView && coinsPerProc > 0) {
    coinsPerProcCell.title = `Exact: ${formatCoins(coinsPerProc)}`;
  }

  // Coins Per Hour (using effective procs)
  const coinsPerHourCell = row.insertCell();
  const effectiveCoinsPerHour = effectiveProcsPerHour * (coinsPerProc > 0 ? coinsPerProc : 0);
  coinsPerHourCell.textContent = effectiveCoinsPerHour > 0 ? formatFunc(effectiveCoinsPerHour) : '—';
  coinsPerHourCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: ${effectiveCoinsPerHour > 0 ? 'var(--qpm-warning)' : 'var(--qpm-text-muted)'};
    font-family: monospace;
    font-weight: 600;
  `;
  if (wastePercent > 0 && effectiveCoinsPerHour > 0) {
    const baseCoinsPerHour = entry.procsPerHour * (coinsPerProc > 0 ? coinsPerProc : 0);
    coinsPerHourCell.title = `Base: ${formatCoins(baseCoinsPerHour)}/hr\nEffective: ${formatCoins(effectiveCoinsPerHour)}/hr after ${wastePercent.toFixed(0)}% waste`;
  } else if (!detailedView && effectiveCoinsPerHour > 0) {
    coinsPerHourCell.title = `Exact: ${formatCoins(effectiveCoinsPerHour)}/hr`;
  }

  // Next Proc ETA (Live Countdown)
  const etaCell = row.insertCell();
  etaCell.className = 'eta-countdown';
  etaCell.dataset.lastProc = String(entry.lastProcAt ?? 0);
  etaCell.dataset.effectiveRate = String(effectiveProcsPerHour);
  const etaResult = calculateLiveETA(entry.lastProcAt, entry.expectedMinutesBetween, effectiveProcsPerHour);
  etaCell.textContent = etaResult.text;
  etaCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: ${etaResult.isOverdue ? 'var(--qpm-danger)' : 'var(--qpm-positive)'};
    font-family: monospace;
    font-weight: 500;
    white-space: nowrap;
  `;
  const avgMinutes = effectiveProcsPerHour > 0 ? 60 / effectiveProcsPerHour : 0;
  etaCell.title = avgMinutes > 0
    ? `Average ${avgMinutes.toFixed(1)} minutes between procs${entry.lastProcAt ? '\nLast proc: ' + new Date(entry.lastProcAt).toLocaleTimeString() : ''}`
    : 'No proc history yet';

  // Add detailed view row if enabled
  if (detailedView) {
    const detailRow = tbody.insertRow();
    detailRow.style.cssText = `
      background: var(--qpm-surface-2);
      border-bottom: 1px solid var(--qpm-border);
    `;

    const detailCell = detailRow.insertCell();
    detailCell.colSpan = 7;
    detailCell.style.cssText = `
      padding: 8px 12px;
      font-size: 11px;
      color: var(--qpm-text-muted);
      line-height: 1.6;
    `;

    const petStrength = entry.pet.strength ?? 100;
    const baseProb = entry.definition.baseProbability ?? 0;
    const strMultiplier = petStrength / 100;
    const modifiedProb = baseProb * strMultiplier;

    const detailParts: string[] = [];

    // Chance per minute (wiki format: "X% × STR = Y%")
    if (baseProb > 0) {
      detailParts.push(`<strong>Chance Per Minute:</strong> ${baseProb.toFixed(2)}% × ${petStrength} = ${modifiedProb.toFixed(2)}%`);
    }

    // Effect calculation (wiki format: "Effect: X × STR = Y")
    if (entry.definition.effectLabel && entry.definition.effectBaseValue != null) {
      const effectResult = entry.definition.effectBaseValue * strMultiplier;
      const suffix = entry.definition.effectSuffix ?? '';
      detailParts.push(`<strong>${entry.definition.effectLabel}:</strong> ${entry.definition.effectBaseValue}${suffix} × ${petStrength} = ${effectResult.toFixed(1)}${suffix}`);
    }

    // Mutation opportunity for Crop Mutation Boost abilities
    if (entry.definition.id === 'ProduceMutationBoost' || entry.definition.id === 'ProduceMutationBoostII') {
      try {
        const opportunity = findBestMutationOpportunity();
        if (opportunity) {
          const opportunityText = formatMutationOpportunity(opportunity, petStrength);
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

    // Waste info
    if (wastePercent > 0) {
      const context = buildAbilityValuationContext();
      detailParts.push(
        `<strong>Efficiency:</strong> ${(100 - wastePercent).toFixed(1)}% (${context.uncoloredCrops.length}/${context.crops.length} uncolored crops)`
      );
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
): HTMLTableRowElement | null {
  // Only create total row if there are 2+ pets with this ability
  if (group.entries.length < 2) {
    // Return the last row if it exists
    const lastIndex = tbody.rows.length - 1;
    return lastIndex >= 0 ? (tbody.rows[lastIndex] ?? null) : null;
  }

  const row = tbody.insertRow();
  row.style.cssText = `
    border-bottom: 2px solid var(--qpm-border);
    background: var(--qpm-surface-2);
    font-weight: 600;
  `;

  // "Total" label
  const nameCell = row.insertCell();
  nameCell.textContent = `📊 Total (${group.entries.length})`;
  nameCell.style.cssText = `
    padding: 10px 12px;
    color: var(--qpm-accent);
    font-weight: 600;
    white-space: nowrap;
  `;

  // Ability name
  const abilityCell = row.insertCell();
  abilityCell.textContent = group.definition.name;
  abilityCell.style.cssText = `
    padding: 10px 12px;
    color: var(--qpm-accent);
    white-space: nowrap;
  `;

  // Combined chance per minute
  const chanceCell = row.insertCell();
  chanceCell.textContent = `${group.chancePerMinute.toFixed(2)}%`;
  chanceCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: var(--qpm-accent);
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
    color: var(--qpm-accent);
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
    color: ${avgCoinsPerProc > 0 ? 'var(--qpm-warning)' : 'var(--qpm-text-muted)'};
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
    color: ${totalCoinsPerHour > 0 ? 'var(--qpm-warning)' : 'var(--qpm-text-muted)'};
    font-family: monospace;
    font-weight: 600;
  `;
  if (totalCoinsPerHour > 0) {
    coinsPerHourCell.title = detailedView ? `Combined coins/hour from ${group.entries.length} pets` : `Exact: ${formatCoins(totalCoinsPerHour)}/hr`;
  }

  // Combined Next ETA
  const etaCell = row.insertCell();
  etaCell.className = 'eta-countdown';
  etaCell.dataset.lastProc = String(group.lastProcAt ?? 0);
  etaCell.dataset.effectiveRate = String(group.totalProcsPerHour);
  const etaResult = calculateLiveETA(group.lastProcAt, group.combinedEtaMinutes, group.totalProcsPerHour);
  etaCell.textContent = etaResult.text;
  etaCell.style.cssText = `
    padding: 10px 12px;
    text-align: right;
    color: ${etaResult.isOverdue ? 'var(--qpm-danger)' : 'var(--qpm-accent)'};
    font-family: monospace;
    font-weight: 600;
    white-space: nowrap;
  `;
  const avgMinutes = group.totalProcsPerHour > 0 ? 60 / group.totalProcsPerHour : 0;
  etaCell.title = avgMinutes > 0
    ? `Combined average: ${avgMinutes.toFixed(1)} minutes between procs`
    : 'No proc history yet';

  return row;
}
