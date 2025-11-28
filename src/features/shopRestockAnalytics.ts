// src/features/shopRestockAnalytics.ts
// Statistical analysis of shop restock data to understand patterns

import { getAllRestockEvents, type RestockEvent } from './shopRestockTracker';
import { log } from '../utils/logger';

/**
 * Interval statistics for an item
 */
interface IntervalStats {
  itemName: string;
  appearances: number;
  intervals: number[]; // Time between appearances in milliseconds
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  percentile25: number;
  percentile75: number;
  percentile95: number;
  // Distribution shape
  coefficient_of_variation: number; // stdDev / mean (higher = more random)
  skewness: number; // Symmetry measure
}

/**
 * Comprehensive analytics report
 */
interface AnalyticsReport {
  totalRestocks: number;
  dateRange: { start: number; end: number };
  trackedItems: Map<string, IntervalStats>;
  celestialAnalysis: {
    items: string[];
    perItemStats: Map<string, {
      meanDays: number;
      medianDays: number;
      minDays: number;
      maxDays: number;
      appearances: number;
    }>;
  };
  clusteringAnalysis: {
    description: string;
    multipleRaresWithin24h: number;
    multipleRaresWithin7d: number;
  };
}

/**
 * Calculate percentile from sorted array
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

/**
 * Calculate standard deviation
 */
function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const squareDiffs = arr.map(value => Math.pow(value - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Calculate skewness (measure of distribution asymmetry)
 */
function skewness(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd = stdDev(arr);
  if (sd === 0) return 0;

  const n = arr.length;
  const cubedDiffs = arr.map(value => Math.pow((value - mean) / sd, 3));
  const sum = cubedDiffs.reduce((a, b) => a + b, 0);

  return (n / ((n - 1) * (n - 2))) * sum;
}

/**
 * Analyze intervals between appearances of a specific item
 * Filters out rapid succession restocks (< threshold) to avoid skewing data
 */
function analyzeItemIntervals(itemName: string, events: RestockEvent[], filterRapidRestocks = true): IntervalStats | null {
  // Find all appearances of this item
  const allAppearances = events
    .filter(event => event.items.some(item => item.name === itemName))
    .map(event => event.timestamp)
    .sort((a, b) => a - b);

  if (allAppearances.length < 2) {
    return null; // Need at least 2 appearances to calculate intervals
  }

  // Filter rapid succession restocks (combine consecutive restocks within 30 minutes)
  // This treats "3 restocks in 15 minutes" as ONE restock opportunity
  const rapidRestockThreshold = 30 * 60 * 1000; // 30 minutes
  const filteredAppearances: number[] = [];

  if (filterRapidRestocks) {
    filteredAppearances.push(allAppearances[0]!); // Always include first

    for (let i = 1; i < allAppearances.length; i++) {
      const timeSinceLast = allAppearances[i]! - allAppearances[i - 1]!;

      // Only include if it's been more than threshold since last appearance
      if (timeSinceLast > rapidRestockThreshold) {
        filteredAppearances.push(allAppearances[i]!);
      }
      // Otherwise skip (it's part of the same restock burst)
    }
  } else {
    filteredAppearances.push(...allAppearances);
  }

  const appearances = filteredAppearances;

  if (appearances.length < 2) {
    return null;
  }

  // Calculate intervals between consecutive appearances
  const intervals: number[] = [];
  for (let i = 1; i < appearances.length; i++) {
    intervals.push(appearances[i]! - appearances[i - 1]!);
  }

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const sd = stdDev(intervals);

  return {
    itemName,
    appearances: appearances.length,
    intervals,
    mean,
    median: percentile(intervals, 50),
    stdDev: sd,
    min: Math.min(...intervals),
    max: Math.max(...intervals),
    percentile25: percentile(intervals, 25),
    percentile75: percentile(intervals, 75),
    percentile95: percentile(intervals, 95),
    coefficient_of_variation: sd / mean,
    skewness: skewness(intervals),
  };
}

/**
 * Format milliseconds to human-readable time
 */
function formatDuration(ms: number): string {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Generate comprehensive analytics report
 */
export function generateAnalyticsReport(): AnalyticsReport | null {
  const events = getAllRestockEvents();

  if (events.length === 0) {
    log('⚠️ No restock data available for analysis');
    return null;
  }

  const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const dateRange = {
    start: sortedEvents[0]!.timestamp,
    end: sortedEvents[sortedEvents.length - 1]!.timestamp,
  };

  // Analyze tracked items
  const trackedItemNames = ['Sunflower', 'Mythical Eggs', 'Starweaver', 'Dawnbinder', 'Moonbinder'];
  const trackedItems = new Map<string, IntervalStats>();

  for (const itemName of trackedItemNames) {
    const stats = analyzeItemIntervals(itemName, events);
    if (stats) {
      trackedItems.set(itemName, stats);
    }
  }

  // Celestial analysis - INDIVIDUAL items (not pooled!)
  const celestials = ['Starweaver', 'Dawnbinder', 'Moonbinder'];
  const celestialStats = new Map<string, {
    meanDays: number;
    medianDays: number;
    minDays: number;
    maxDays: number;
    appearances: number;
  }>();

  for (const celestial of celestials) {
    const stats = trackedItems.get(celestial);
    if (stats && stats.intervals.length > 0) {
      celestialStats.set(celestial, {
        meanDays: stats.mean / (1000 * 60 * 60 * 24),
        medianDays: stats.median / (1000 * 60 * 60 * 24),
        minDays: stats.min / (1000 * 60 * 60 * 24),
        maxDays: stats.max / (1000 * 60 * 60 * 24),
        appearances: stats.appearances,
      });
    }
  }

  const celestialAnalysis = {
    items: celestials,
    perItemStats: celestialStats,
  };

  // Clustering analysis - how often do multiple rares appear close together?
  let multipleRaresWithin24h = 0;
  let multipleRaresWithin7d = 0;

  const rareAppearances = events
    .filter(event => event.items.some(item => trackedItemNames.includes(item.name)))
    .map(event => event.timestamp)
    .sort((a, b) => a - b);

  for (let i = 1; i < rareAppearances.length; i++) {
    const diff = rareAppearances[i]! - rareAppearances[i - 1]!;
    if (diff <= 24 * 60 * 60 * 1000) multipleRaresWithin24h++;
    if (diff <= 7 * 24 * 60 * 60 * 1000) multipleRaresWithin7d++;
  }

  return {
    totalRestocks: events.length,
    dateRange,
    trackedItems,
    celestialAnalysis,
    clusteringAnalysis: {
      description: 'How often multiple rare items appear close together',
      multipleRaresWithin24h,
      multipleRaresWithin7d,
    },
  };
}

/**
 * Print detailed analytics report to console
 */
export function printAnalyticsReport(): void {
  const report = generateAnalyticsReport();

  if (!report) {
    log('⚠️ No data available for analysis');
    return;
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         📊 SHOP RESTOCK ANALYTICS REPORT                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`📅 Date Range: ${new Date(report.dateRange.start).toLocaleString()} → ${new Date(report.dateRange.end).toLocaleString()}`);
  console.log(`📦 Total Restocks: ${report.totalRestocks}`);
  console.log(`⏱️  Time Span: ${formatDuration(report.dateRange.end - report.dateRange.start)}\n`);

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         🎯 TRACKED ITEMS ANALYSIS                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  report.trackedItems.forEach((stats, itemName) => {
    console.log(`\n━━━ ${itemName} ━━━`);
    console.log(`  Appearances: ${stats.appearances}`);
    console.log(`  Intervals analyzed: ${stats.intervals.length}\n`);

    console.log(`  📊 Central Tendency:`);
    console.log(`    Mean:   ${formatDuration(stats.mean)}`);
    console.log(`    Median: ${formatDuration(stats.median)}\n`);

    console.log(`  📏 Range:`);
    console.log(`    Min:    ${formatDuration(stats.min)}`);
    console.log(`    Max:    ${formatDuration(stats.max)}\n`);

    console.log(`  📈 Distribution:`);
    console.log(`    25th percentile: ${formatDuration(stats.percentile25)}`);
    console.log(`    75th percentile: ${formatDuration(stats.percentile75)}`);
    console.log(`    95th percentile: ${formatDuration(stats.percentile95)}\n`);

    console.log(`  🎲 Variability:`);
    console.log(`    Std Deviation: ${formatDuration(stats.stdDev)}`);
    console.log(`    Coefficient of Variation: ${stats.coefficient_of_variation.toFixed(2)} ${stats.coefficient_of_variation > 1 ? '(HIGHLY VARIABLE)' : stats.coefficient_of_variation > 0.5 ? '(MODERATE)' : '(LOW)'}`);
    console.log(`    Skewness: ${stats.skewness.toFixed(2)} ${Math.abs(stats.skewness) > 1 ? '(ASYMMETRIC)' : '(FAIRLY SYMMETRIC)'}\n`);

    console.log(`  🔍 Interpretation:`);
    if (stats.coefficient_of_variation > 1) {
      console.log(`    ⚠️  HIGHLY RANDOM - Standard deviation exceeds mean`);
      console.log(`    💡 Best approach: Probability-based prediction with wide confidence intervals`);
    } else if (stats.coefficient_of_variation > 0.5) {
      console.log(`    ⚡ MODERATE VARIABILITY - Some predictability`);
      console.log(`    💡 Best approach: Weighted moving average with confidence ranges`);
    } else {
      console.log(`    ✅ CONSISTENT PATTERN - Fairly predictable`);
      console.log(`    💡 Best approach: Simple moving average works well`);
    }

    if (stats.skewness > 1) {
      console.log(`    📊 LONG TAIL (right-skewed) - Occasional very long intervals`);
    } else if (stats.skewness < -1) {
      console.log(`    📊 LONG TAIL (left-skewed) - Occasional very short intervals`);
    }
  });

  console.log('\n\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         🌟 CELESTIAL ITEMS ANALYSIS (Individual)              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  report.celestialAnalysis.perItemStats.forEach((stats, itemName) => {
    console.log(`\n━━━ ${itemName} ━━━`);
    console.log(`  Appearances: ${stats.appearances}`);
    console.log(`  Mean interval: ${stats.meanDays.toFixed(1)} days`);
    console.log(`  Median interval: ${stats.medianDays.toFixed(1)} days`);
    console.log(`  Range: ${stats.minDays.toFixed(1)} - ${stats.maxDays.toFixed(1)} days\n`);
  });

  console.log('\n💡 Note: Each celestial tracked independently (not pooled)');

  console.log('\n\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         🔗 CLUSTERING ANALYSIS                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Multiple rares within 24 hours: ${report.clusteringAnalysis.multipleRaresWithin24h}`);
  console.log(`Multiple rares within 7 days: ${report.clusteringAnalysis.multipleRaresWithin7d}\n`);

  if (report.clusteringAnalysis.multipleRaresWithin24h > 0) {
    console.log(`⚠️  CLUSTERING DETECTED - Multiple rares sometimes appear close together`);
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         📈 RECOMMENDED PREDICTION METHODS                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  report.trackedItems.forEach((stats, itemName) => {
    console.log(`${itemName}:`);

    if (itemName === 'Starweaver' || itemName === 'Dawnbinder' || itemName === 'Moonbinder') {
      console.log(`  → Survival Analysis (hazard rate increases over time)`);
      console.log(`  → Weibull distribution (models increasing probability)`);
      console.log(`  → Day-based probability curves\n`);
    } else if (stats.coefficient_of_variation > 1) {
      console.log(`  → Monte Carlo simulation (random sampling)`);
      console.log(`  → Probability ranges instead of point estimates`);
      console.log(`  → "X% chance in next Y hours" format\n`);
    } else {
      console.log(`  → Exponential moving average`);
      console.log(`  → Confidence intervals (±1σ, ±2σ)`);
      console.log(`  → Standard time-based prediction\n`);
    }
  });

  console.log('\n✅ Analysis complete! Use this data to improve prediction algorithms.\n');
}

/**
 * Get detailed interval data for export
 */
export function exportIntervalData(itemName: string): { intervals: number[]; timestamps: number[] } | null {
  const events = getAllRestockEvents();
  const appearances = events
    .filter(event => event.items.some(item => item.name === itemName))
    .map(event => event.timestamp)
    .sort((a, b) => a - b);

  if (appearances.length < 2) {
    return null;
  }

  const intervals: number[] = [];
  for (let i = 1; i < appearances.length; i++) {
    intervals.push(appearances[i]! - appearances[i - 1]!);
  }

  return { intervals, timestamps: appearances };
}
