// scripts/analyze-rare-restocks.js
// Analyze shop restock patterns for rare items to identify pseudo-RNG mechanics

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Rare items to track
const RARE_ITEMS = ['Starweaver', 'Dawnbinder', 'Moonbinder', 'Sunflower', 'Mythical Eggs'];

// Main analysis function
async function analyzeRareRestocks() {
  console.log('🔍 Analyzing rare item restock patterns...\n');

  // Path to HTML file
  const htmlFilePath = process.argv[2] || '/home/user/QPM-GR/qpm-shop-restock-export-1764389548616.html';

  if (!fs.existsSync(htmlFilePath)) {
    console.error(`❌ File not found: ${htmlFilePath}`);
    process.exit(1);
  }

  try {
    // Read and parse HTML
    const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
    console.log(`📄 Loaded HTML file (${Math.round(htmlContent.length / 1024)}KB)`);

    const events = parseDiscordHtml(htmlContent);
    console.log(`✅ Parsed ${events.length} total restock events\n`);

    // Analyze each rare item
    const report = [];
    report.push('# Shop Restock Pseudo-RNG Analysis Report');
    report.push('');
    report.push(`**Generated:** ${new Date().toISOString()}`);
    report.push(`**Dataset:** ${events.length} restock events`);
    report.push(`**Date Range:** ${new Date(events[0]?.timestamp).toLocaleString()} - ${new Date(events[events.length - 1]?.timestamp).toLocaleString()}`);
    report.push('');
    report.push('---');
    report.push('');

    // Summary statistics table
    report.push('## Summary Statistics');
    report.push('');
    report.push('| Item | Appearances | Min Interval (hrs) | Max Interval (hrs) | Mean (hrs) | Median (hrs) | Std Dev (hrs) | Hard Floor (hrs) |');
    report.push('|------|-------------|-------------------|-------------------|-----------|-------------|--------------|------------------|');

    const allItemStats = {};

    for (const rareName of RARE_ITEMS) {
      const stats = analyzeItem(rareName, events);
      allItemStats[rareName] = stats;

      report.push(`| ${rareName} | ${stats.appearances.length} | ${stats.minInterval.toFixed(2)} | ${stats.maxInterval.toFixed(2)} | ${stats.meanInterval.toFixed(2)} | ${stats.medianInterval.toFixed(2)} | ${stats.stdDevInterval.toFixed(2)} | ${stats.hardFloor.toFixed(2)} |`);
    }

    report.push('');
    report.push('---');
    report.push('');

    // Detailed analysis for each item
    for (const rareName of RARE_ITEMS) {
      const stats = allItemStats[rareName];
      report.push(`## ${rareName} - Detailed Analysis`);
      report.push('');

      // Basic stats
      report.push('### Basic Statistics');
      report.push('');
      report.push(`- **Total Appearances:** ${stats.appearances.length}`);
      report.push(`- **Interval Range:** ${stats.minInterval.toFixed(2)} - ${stats.maxInterval.toFixed(2)} hours`);
      report.push(`- **Mean Interval:** ${stats.meanInterval.toFixed(2)} hours (± ${stats.stdDevInterval.toFixed(2)})`);
      report.push(`- **Median Interval:** ${stats.medianInterval.toFixed(2)} hours`);
      report.push(`- **Hard Floor (Never Violated):** ${stats.hardFloor.toFixed(2)} hours`);
      report.push('');

      // Dry streak analysis
      report.push('### Dry Streak Analysis');
      report.push('');
      report.push(`- **Mean Dry Streak:** ${stats.dryStreaks.mean.toFixed(2)} restocks`);
      report.push(`- **Median Dry Streak:** ${stats.dryStreaks.median} restocks`);
      report.push(`- **Max Dry Streak:** ${stats.dryStreaks.max} restocks`);
      report.push(`- **Min Dry Streak:** ${stats.dryStreaks.min} restocks`);
      report.push('');

      // Pity system detection
      if (stats.dryStreaks.pittySystemDetected) {
        report.push(`⚠️ **PITY SYSTEM DETECTED:** After ${stats.dryStreaks.pittyThreshold} restocks without appearing, likelihood increases significantly.`);
      } else {
        report.push(`✅ **No Pity System Detected:** Dry streaks appear random without threshold effects.`);
      }
      report.push('');

      // Time of day patterns
      report.push('### Time-of-Day Analysis');
      report.push('');
      report.push('**Hourly Distribution:**');
      report.push('');
      report.push('| Hour | Appearances | % of Total |');
      report.push('|------|-------------|------------|');

      const hourlyTotal = Object.values(stats.hourlyDistribution).reduce((a, b) => a + b, 0);
      for (let hour = 0; hour < 24; hour++) {
        const count = stats.hourlyDistribution[hour] || 0;
        const pct = hourlyTotal > 0 ? (count / hourlyTotal * 100).toFixed(1) : '0.0';
        report.push(`| ${hour.toString().padStart(2, '0')}:00 | ${count} | ${pct}% |`);
      }
      report.push('');

      // Hot/cold hours
      const hotHours = Object.entries(stats.hourlyDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([hour, count]) => `${hour}:00 (${count} times)`);

      const coldHours = [];
      for (let hour = 0; hour < 24; hour++) {
        if ((stats.hourlyDistribution[hour] || 0) === 0) {
          coldHours.push(`${hour}:00`);
        }
      }

      report.push(`- **Hot Hours:** ${hotHours.join(', ')}`);
      report.push(`- **Cold Hours (NEVER appears):** ${coldHours.length > 0 ? coldHours.join(', ') : 'None - appears at all hours'}`);
      report.push('');

      // Clustering analysis
      report.push('### Clustering Analysis');
      report.push('');
      report.push(`- **Intervals < 1 hour:** ${stats.clustering.veryShort} (${(stats.clustering.veryShort / stats.intervals.length * 100).toFixed(1)}%)`);
      report.push(`- **Intervals < 3 hours:** ${stats.clustering.short} (${(stats.clustering.short / stats.intervals.length * 100).toFixed(1)}%)`);
      report.push(`- **Intervals < 6 hours:** ${stats.clustering.medium} (${(stats.clustering.medium / stats.intervals.length * 100).toFixed(1)}%)`);
      report.push(`- **Intervals > 24 hours:** ${stats.clustering.long} (${(stats.clustering.long / stats.intervals.length * 100).toFixed(1)}%)`);
      report.push('');

      if (stats.clustering.burstDetected) {
        report.push(`⚠️ **BURST PATTERN DETECTED:** Item shows clustering (${(stats.clustering.short / stats.intervals.length * 100).toFixed(1)}% of intervals < 3hrs)`);
      } else if (stats.clustering.antiClusterDetected) {
        report.push(`⚠️ **ANTI-CLUSTERING DETECTED:** Forced spacing prevents rapid re-appearances.`);
      } else {
        report.push(`✅ **Random Spacing:** No obvious clustering or anti-clustering patterns.`);
      }
      report.push('');

      // Distribution analysis
      report.push('### Distribution Analysis');
      report.push('');
      report.push(`- **Distribution Type:** ${stats.distribution.type}`);
      report.push(`- **Coefficient of Variation:** ${stats.distribution.cv.toFixed(3)}`);
      report.push(`- **Skewness:** ${stats.distribution.skewness.toFixed(3)}`);
      report.push('');
      report.push('**Interpretation:**');
      report.push(stats.distribution.interpretation);
      report.push('');

      report.push('---');
      report.push('');
    }

    // Cross-item patterns
    report.push('## Cross-Item Pattern Analysis');
    report.push('');
    report.push('Analyzing correlations between rare item appearances...');
    report.push('');

    const crossPatterns = analyzeCrossItemPatterns(events, allItemStats);

    report.push('### Co-occurrence Matrix (within 1 hour)');
    report.push('');
    report.push('| Item 1 | Item 2 | Co-occurrences | % of Item 1 | % of Item 2 |');
    report.push('|--------|--------|----------------|-------------|-------------|');

    for (const pattern of crossPatterns.cooccurrences) {
      report.push(`| ${pattern.item1} | ${pattern.item2} | ${pattern.count} | ${pattern.pct1.toFixed(1)}% | ${pattern.pct2.toFixed(1)}% |`);
    }
    report.push('');

    if (crossPatterns.seedingDetected) {
      report.push(`⚠️ **SEEDING DETECTED:** Multiple rare items frequently appear together, suggesting shared RNG seed or time-based triggers.`);
    } else {
      report.push(`✅ **Independent RNG:** Rare items appear independently without cross-correlation.`);
    }
    report.push('');

    report.push('---');
    report.push('');

    // Recommendations
    report.push('## Prediction Strategy Recommendations');
    report.push('');
    report.push('Based on the analysis, here are the recommended prediction approaches:');
    report.push('');

    const recommendations = generateRecommendations(allItemStats, crossPatterns);
    for (const rec of recommendations) {
      report.push(`### ${rec.item}`);
      report.push('');
      report.push(rec.strategy);
      report.push('');
    }

    // Write report
    const reportPath = path.join(__dirname, '..', 'RARE_RESTOCK_ANALYSIS.md');
    fs.writeFileSync(reportPath, report.join('\n'), 'utf8');

    console.log(`\n✅ Analysis complete! Report saved to: ${reportPath}`);
    console.log(`📊 Analyzed ${RARE_ITEMS.length} rare items across ${events.length} restock events\n`);

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Analyze a single item
function analyzeItem(itemName, allEvents) {
  // Find all appearances
  const appearances = [];

  for (const event of allEvents) {
    const item = event.items.find(i => i.name === itemName);
    if (item) {
      appearances.push({
        timestamp: event.timestamp,
        quantity: item.quantity,
        eventIndex: allEvents.indexOf(event),
      });
    }
  }

  if (appearances.length === 0) {
    return {
      appearances: [],
      intervals: [],
      minInterval: 0,
      maxInterval: 0,
      meanInterval: 0,
      medianInterval: 0,
      stdDevInterval: 0,
      hardFloor: 0,
      dryStreaks: { mean: 0, median: 0, max: 0, min: 0, pittySystemDetected: false },
      hourlyDistribution: {},
      clustering: { veryShort: 0, short: 0, medium: 0, long: 0, burstDetected: false, antiClusterDetected: false },
      distribution: { type: 'unknown', cv: 0, skewness: 0, interpretation: 'No data' },
    };
  }

  // Calculate intervals (in hours)
  const intervals = [];
  for (let i = 1; i < appearances.length; i++) {
    const intervalMs = appearances[i].timestamp - appearances[i - 1].timestamp;
    const intervalHrs = intervalMs / (1000 * 60 * 60);
    intervals.push(intervalHrs);
  }

  // Basic statistics
  const minInterval = intervals.length > 0 ? Math.min(...intervals) : 0;
  const maxInterval = intervals.length > 0 ? Math.max(...intervals) : 0;
  const meanInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;

  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const medianInterval = sortedIntervals.length > 0
    ? sortedIntervals.length % 2 === 0
      ? (sortedIntervals[sortedIntervals.length / 2 - 1] + sortedIntervals[sortedIntervals.length / 2]) / 2
      : sortedIntervals[Math.floor(sortedIntervals.length / 2)]
    : 0;

  const variance = intervals.length > 0
    ? intervals.reduce((sum, val) => sum + Math.pow(val - meanInterval, 2), 0) / intervals.length
    : 0;
  const stdDevInterval = Math.sqrt(variance);

  // Hard floor detection (minimum interval that's NEVER violated)
  const hardFloor = minInterval;

  // Dry streak analysis
  const dryStreaks = [];
  for (let i = 0; i < appearances.length; i++) {
    const currentEventIndex = appearances[i].eventIndex;
    const prevEventIndex = i > 0 ? appearances[i - 1].eventIndex : -1;
    const dryStreak = currentEventIndex - prevEventIndex - 1;
    if (dryStreak >= 0) {
      dryStreaks.push(dryStreak);
    }
  }

  const meanDryStreak = dryStreaks.length > 0 ? dryStreaks.reduce((a, b) => a + b, 0) / dryStreaks.length : 0;
  const sortedDryStreaks = [...dryStreaks].sort((a, b) => a - b);
  const medianDryStreak = sortedDryStreaks.length > 0
    ? sortedDryStreaks.length % 2 === 0
      ? Math.floor((sortedDryStreaks[sortedDryStreaks.length / 2 - 1] + sortedDryStreaks[sortedDryStreaks.length / 2]) / 2)
      : sortedDryStreaks[Math.floor(sortedDryStreaks.length / 2)]
    : 0;
  const maxDryStreak = dryStreaks.length > 0 ? Math.max(...dryStreaks) : 0;
  const minDryStreak = dryStreaks.length > 0 ? Math.min(...dryStreaks) : 0;

  // Pity system detection (check if long dry streaks are followed by guaranteed appearance)
  const pittyThreshold = Math.floor(meanDryStreak * 2);
  const longStreaksCount = dryStreaks.filter(s => s > pittyThreshold).length;
  const pittySystemDetected = longStreaksCount > 0 && longStreaksCount < dryStreaks.length * 0.05; // Less than 5% exceed threshold

  // Hourly distribution
  const hourlyDistribution = {};
  for (const appearance of appearances) {
    const hour = new Date(appearance.timestamp).getHours();
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
  }

  // Clustering analysis
  const veryShortIntervals = intervals.filter(i => i < 1).length;
  const shortIntervals = intervals.filter(i => i < 3).length;
  const mediumIntervals = intervals.filter(i => i < 6).length;
  const longIntervals = intervals.filter(i => i > 24).length;

  const burstDetected = shortIntervals / intervals.length > 0.3; // More than 30% within 3 hours
  const antiClusterDetected = minInterval > 1 && veryShortIntervals === 0; // Never within 1 hour

  // Distribution analysis
  const cv = meanInterval > 0 ? stdDevInterval / meanInterval : 0;
  const skewness = calculateSkewness(intervals, meanInterval, stdDevInterval);

  let distributionType = 'Unknown';
  let interpretation = '';

  if (cv < 0.5) {
    distributionType = 'Low Variance (Deterministic-like)';
    interpretation = 'Intervals are very consistent, suggesting a timer-based or cooldown mechanic rather than true randomness.';
  } else if (cv >= 0.5 && cv < 1.5) {
    distributionType = 'Moderate Variance';
    interpretation = 'Intervals show moderate randomness, possibly a % chance check with some cooldown protection.';
  } else {
    distributionType = 'High Variance (Exponential-like)';
    interpretation = 'Intervals are highly variable, suggesting memoryless random checks (like Poisson/exponential distribution).';
  }

  if (Math.abs(skewness) > 1) {
    interpretation += ` Distribution is ${skewness > 0 ? 'right-skewed' : 'left-skewed'} (skewness: ${skewness.toFixed(2)}), indicating occasional ${skewness > 0 ? 'long' : 'short'} outliers.`;
  }

  return {
    appearances,
    intervals,
    minInterval,
    maxInterval,
    meanInterval,
    medianInterval,
    stdDevInterval,
    hardFloor,
    dryStreaks: {
      mean: meanDryStreak,
      median: medianDryStreak,
      max: maxDryStreak,
      min: minDryStreak,
      pittySystemDetected,
      pittyThreshold,
    },
    hourlyDistribution,
    clustering: {
      veryShort: veryShortIntervals,
      short: shortIntervals,
      medium: mediumIntervals,
      long: longIntervals,
      burstDetected,
      antiClusterDetected,
    },
    distribution: {
      type: distributionType,
      cv,
      skewness,
      interpretation,
    },
  };
}

// Calculate skewness
function calculateSkewness(values, mean, stdDev) {
  if (values.length === 0 || stdDev === 0) return 0;

  const n = values.length;
  const sum = values.reduce((acc, val) => acc + Math.pow((val - mean) / stdDev, 3), 0);
  return (n / ((n - 1) * (n - 2))) * sum;
}

// Analyze cross-item patterns
function analyzeCrossItemPatterns(allEvents, allItemStats) {
  const cooccurrences = [];
  let seedingDetected = false;

  // Check co-occurrences within 1 hour window
  for (let i = 0; i < RARE_ITEMS.length; i++) {
    for (let j = i + 1; j < RARE_ITEMS.length; j++) {
      const item1 = RARE_ITEMS[i];
      const item2 = RARE_ITEMS[j];

      const stats1 = allItemStats[item1];
      const stats2 = allItemStats[item2];

      let cooccurCount = 0;

      // For each appearance of item1, check if item2 appears within 1 hour
      for (const app1 of stats1.appearances) {
        for (const app2 of stats2.appearances) {
          const timeDiff = Math.abs(app1.timestamp - app2.timestamp) / (1000 * 60 * 60); // hours
          if (timeDiff <= 1) {
            cooccurCount++;
            break; // Count only once per item1 appearance
          }
        }
      }

      const pct1 = stats1.appearances.length > 0 ? (cooccurCount / stats1.appearances.length) * 100 : 0;
      const pct2 = stats2.appearances.length > 0 ? (cooccurCount / stats2.appearances.length) * 100 : 0;

      cooccurrences.push({
        item1,
        item2,
        count: cooccurCount,
        pct1,
        pct2,
      });

      // Seeding detection: if >20% of either item's appearances co-occur
      if (pct1 > 20 || pct2 > 20) {
        seedingDetected = true;
      }
    }
  }

  return {
    cooccurrences,
    seedingDetected,
  };
}

// Generate recommendations
function generateRecommendations(allItemStats, crossPatterns) {
  const recommendations = [];

  for (const rareName of RARE_ITEMS) {
    const stats = allItemStats[rareName];
    let strategy = '';

    if (stats.appearances.length === 0) {
      strategy = 'No data available for predictions. Item may be extremely rare or not yet in dataset.';
    } else {
      // Cooldown-based
      if (stats.hardFloor > 1) {
        strategy += `**Cooldown Detected:** Item NEVER appears within ${stats.hardFloor.toFixed(2)} hours. After an appearance, wait at least ${Math.ceil(stats.hardFloor)} hours before expecting it again.\n\n`;
      }

      // Pity system
      if (stats.dryStreaks.pittySystemDetected) {
        strategy += `**Pity System:** If item hasn't appeared in ${stats.dryStreaks.pittyThreshold} restocks, likelihood may increase. Current max observed: ${stats.dryStreaks.max} restocks.\n\n`;
      }

      // Time-based
      const coldHours = [];
      for (let hour = 0; hour < 24; hour++) {
        if ((stats.hourlyDistribution[hour] || 0) === 0) {
          coldHours.push(hour);
        }
      }
      if (coldHours.length > 0 && coldHours.length < 12) {
        strategy += `**Time-Based Patterns:** Item NEVER appears during hours: ${coldHours.map(h => h + ':00').join(', ')}. Avoid monitoring during these times.\n\n`;
      }

      // Distribution-based
      if (stats.distribution.cv < 0.5) {
        strategy += `**Regular Timer:** Expect item approximately every ${stats.meanInterval.toFixed(1)} hours (± ${stats.stdDevInterval.toFixed(1)} hrs). Set alerts for ${(stats.meanInterval * 0.8).toFixed(1)}-${(stats.meanInterval * 1.2).toFixed(1)} hour windows.\n\n`;
      } else if (stats.distribution.cv >= 1.5) {
        strategy += `**Random Checks:** Item follows memoryless distribution. Past dry streaks don't predict future appearances. Monitor continuously or use mean interval (${stats.meanInterval.toFixed(1)} hrs) as rough guide.\n\n`;
      } else {
        strategy += `**Hybrid System:** Mix of cooldown + random chance. After cooldown (${stats.hardFloor.toFixed(1)} hrs), expect appearance within ${(stats.meanInterval + stats.stdDevInterval).toFixed(1)} hours on average.\n\n`;
      }

      // Clustering
      if (stats.clustering.burstDetected) {
        strategy += `**Burst Alert:** When item appears, there's a ${(stats.clustering.short / stats.intervals.length * 100).toFixed(0)}% chance it will appear again within 3 hours. Stay alert after first sighting!\n\n`;
      }
    }

    recommendations.push({
      item: rareName,
      strategy: strategy.trim(),
    });
  }

  return recommendations;
}

// Parser functions (same as parse-discord-html.js)
function parseDiscordHtml(htmlContent) {
  const events = [];
  const dom = new JSDOM(htmlContent);
  const doc = dom.window.document;

  const messageGroups = doc.querySelectorAll('.chatlog__message-group');
  let currentBaseDate = null;

  console.log(`🔍 Found ${messageGroups.length} message groups`);

  let parsedCount = 0;

  for (const group of messageGroups) {
    const authorElement = group.querySelector('.chatlog__author');
    if (!authorElement || !authorElement.textContent?.includes('Magic Shopkeeper')) {
      continue;
    }

    const firstTimestampEl = group.querySelector('.chatlog__timestamp a');
    if (firstTimestampEl) {
      const fullTimestamp = firstTimestampEl.textContent?.trim() || '';
      const timestamp = parseTimestamp(fullTimestamp);
      currentBaseDate = new Date(timestamp);
    }

    const messages = group.querySelectorAll('.chatlog__message-container');

    for (const message of messages) {
      let timestampStr = '';
      let timestamp = 0;

      const fullTimestampEl = message.querySelector('.chatlog__timestamp a');
      const shortTimestampEl = message.querySelector('.chatlog__short-timestamp');

      if (fullTimestampEl) {
        timestampStr = fullTimestampEl.textContent?.trim() || '';
        timestamp = parseTimestamp(timestampStr);
        currentBaseDate = new Date(timestamp);
      } else if (shortTimestampEl) {
        timestampStr = shortTimestampEl.textContent?.trim() || '';
        timestamp = parseTimestamp(timestampStr, currentBaseDate);
      } else {
        continue;
      }

      const contentEl = message.querySelector('.chatlog__content');
      if (!contentEl) continue;

      const content = contentEl.textContent?.trim() || '';
      if (!content) continue;

      const items = parseItems(content);
      if (items.length === 0) continue;

      const event = {
        id: generateRestockId(timestamp, items),
        timestamp,
        dateString: timestampStr,
        items,
        source: 'discord',
      };

      events.push(event);
      parsedCount++;

      // Debug first few timestamps
      if (parsedCount <= 5) {
        console.log(`  Event ${parsedCount}: ${timestampStr} -> ${new Date(timestamp).toISOString()}`);
      }
    }
  }

  console.log(`📊 Parsed ${events.length} restock events from HTML`);

  // Sort events by timestamp to ensure chronological order
  events.sort((a, b) => a.timestamp - b.timestamp);
  console.log(`✅ Events sorted chronologically`);
  console.log(`   First event: ${new Date(events[0]?.timestamp).toISOString()}`);
  console.log(`   Last event: ${new Date(events[events.length - 1]?.timestamp).toISOString()}`);

  return events;
}

function parseTimestamp(timestampStr, baseDate) {
  try {
    if (timestampStr.includes('/')) {
      const parts = timestampStr.split(' ');
      if (parts.length < 3) return Date.now();

      const datePart = parts[0];
      const timePart = parts[1];
      const period = parts[2].toLowerCase();

      const dateParts = datePart.split('/').map(Number);
      // Format is MM/DD/YYYY (American format)
      const [month, day, year] = dateParts;

      const timeParts = timePart.split(':').map(Number);
      const [hours, minutes] = timeParts;

      let hour24 = hours;
      if (period === 'pm' && hours !== 12) hour24 += 12;
      if (period === 'am' && hours === 12) hour24 = 0;

      return new Date(year, month - 1, day, hour24, minutes, 0, 0).getTime();
    }

    if (baseDate) {
      const parts = timestampStr.split(' ');
      if (parts.length < 2) return Date.now();

      const timePart = parts[0];
      const period = parts[1].toLowerCase();

      const timeParts = timePart.split(':').map(Number);
      const [hours, minutes] = timeParts;

      let hour24 = hours;
      if (period === 'pm' && hours !== 12) hour24 += 12;
      if (period === 'am' && hours === 12) hour24 = 0;

      const date = new Date(baseDate);
      date.setHours(hour24, minutes, 0, 0);
      return date.getTime();
    }

    return Date.now();
  } catch (error) {
    console.warn('⚠️ Failed to parse timestamp:', timestampStr);
    return Date.now();
  }
}

function parseItems(content) {
  const items = [];
  const parts = content.split('|').map(p => p.trim());

  for (const part of parts) {
    const mentionMatch = part.match(/@([^@]+?)(?:\s+(\d+))?$/);
    if (mentionMatch && mentionMatch[1]) {
      const itemName = mentionMatch[1].trim();
      if (!shouldTrackItem(itemName)) continue;

      const quantity = mentionMatch[2] ? parseInt(mentionMatch[2], 10) : 0;
      items.push({
        name: itemName,
        quantity,
        type: getItemType(itemName),
      });
    }
  }

  return items;
}

function getItemType(itemName) {
  const categories = {
    eggs: ['Uncommon Eggs', 'Rare Eggs', 'Mythical Eggs', 'Legendary Eggs'],
    seeds: ['Carrot', 'Strawberry', 'Aloe', 'Delphinium', 'Blueberry', 'Apple',
            'Tulip', 'Tomato', 'Daffodil', 'Corn', 'Watermelon', 'Pumpkin',
            'Echeveria', 'Coconut', 'Banana', 'Lily', 'Camellia', 'Squash',
            "Burro's Tail", 'Mushroom', 'Cactus', 'Bamboo', 'Chrysanthemum',
            'Grape', 'Pepper', 'Lemon', 'Passion Fruit', 'Dragon Fruit',
            'Lychee', 'Sunflower', 'Starweaver', 'Dawnbinder', 'Moonbinder'],
  };

  if (categories.eggs.some(e => itemName.includes(e))) return 'egg';
  if (categories.seeds.includes(itemName)) return 'seed';
  return 'unknown';
}

function shouldTrackItem(itemName) {
  const type = getItemType(itemName);
  return type === 'seed' || type === 'egg';
}

function generateRestockId(timestamp, items) {
  const itemsHash = items.map(i => `${i.name}:${i.quantity}`).join(',');
  return `${timestamp}-${Buffer.from(itemsHash).toString('base64').substring(0, 8)}`;
}

// Run analysis
analyzeRareRestocks();
