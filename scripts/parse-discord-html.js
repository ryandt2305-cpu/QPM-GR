// scripts/parse-discord-html.js
// Parse Discord HTML export and generate default restock data

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Import the parser (we'll use dynamic import since it's TypeScript)
async function parseDiscordHtmlFile() {
  console.log('📥 Parsing Discord HTML export...');

  // Path to your Discord HTML file
  const htmlFilePath = process.argv[2];

  if (!htmlFilePath) {
    console.error('❌ Please provide path to Discord HTML file:');
    console.error('   node scripts/parse-discord-html.js <path-to-html-file>');
    process.exit(1);
  }

  if (!fs.existsSync(htmlFilePath)) {
    console.error(`❌ File not found: ${htmlFilePath}`);
    process.exit(1);
  }

  try {
    // Read HTML file
    const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
    console.log(`📄 Loaded HTML file (${Math.round(htmlContent.length / 1024 / 1024)}MB)`);

    // Parse using the same logic as shopRestockParser.ts
    const events = parseDiscordHtml(htmlContent);
    console.log(`✅ Parsed ${events.length} restock events`);

    // Generate TypeScript file content
    const tsContent = `// src/data/defaultRestockData.ts
// Default restock data - pre-parsed from Discord history
// Generated on: ${new Date().toISOString()}
// Source: Discord #shop-restock channel export

import type { RestockEvent } from '../features/shopRestockTracker';

/**
 * Default restock events (imported from Discord #shop-restock channel)
 * This data is automatically loaded on first run to provide historical context.
 *
 * Stats:
 * - Total events: ${events.length}
 * - Date range: ${new Date(events[0]?.timestamp || 0).toLocaleDateString()} - ${new Date(events[events.length - 1]?.timestamp || 0).toLocaleDateString()}
 * - Generated: ${new Date().toLocaleDateString()}
 */
export const DEFAULT_RESTOCK_EVENTS: RestockEvent[] = ${JSON.stringify(events, null, 2)};
`;

    // Write to file
    const outputPath = path.join(__dirname, '..', 'src', 'data', 'defaultRestockData.ts');
    fs.writeFileSync(outputPath, tsContent, 'utf8');

    console.log(`✅ Generated ${outputPath}`);
    console.log(`📊 File size: ${Math.round(tsContent.length / 1024)}KB`);
    console.log('');
    console.log('Summary:');
    console.log(`  - Total events: ${events.length}`);
    if (events.length > 0) {
      console.log(`  - Date range: ${new Date(events[0].timestamp).toLocaleDateString()} - ${new Date(events[events.length - 1].timestamp).toLocaleDateString()}`);

      // Count items
      const itemCounts = {};
      for (const event of events) {
        for (const item of event.items) {
          itemCounts[item.name] = (itemCounts[item.name] || 0) + 1;
        }
      }
      console.log(`  - Unique items: ${Object.keys(itemCounts).length}`);
      console.log('  - Top 5 items:');
      Object.entries(itemCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([name, count]) => {
          console.log(`    - ${name}: ${count} restocks`);
        });
    }

  } catch (error) {
    console.error('❌ Parse failed:', error.message);
    process.exit(1);
  }
}

// Parser logic (using JSDOM for proper HTML parsing, same as browser version)
function parseDiscordHtml(htmlContent) {
  const events = [];

  // Parse HTML using JSDOM (same as browser's DOMParser)
  const dom = new JSDOM(htmlContent);
  const doc = dom.window.document;

  // Find all message groups from Magic Shopkeeper
  const messageGroups = doc.querySelectorAll('.chatlog__message-group');
  let currentBaseDate = null;

  console.log(`🔍 Found ${messageGroups.length} message groups`);

  for (const group of messageGroups) {
    // Check if this is from Magic Shopkeeper
    const authorElement = group.querySelector('.chatlog__author');
    if (!authorElement || !authorElement.textContent?.includes('Magic Shopkeeper')) {
      continue;
    }

    console.log('✅ Found Magic Shopkeeper message group');

    // Get the base timestamp from the first message
    const firstTimestampEl = group.querySelector('.chatlog__timestamp a');
    if (firstTimestampEl) {
      const fullTimestamp = firstTimestampEl.textContent?.trim() || '';
      const timestamp = parseTimestamp(fullTimestamp);
      currentBaseDate = new Date(timestamp);
    }

    // Process all messages in this group
    const messages = group.querySelectorAll('.chatlog__message-container');
    console.log(`  Processing ${messages.length} messages in group`);

    for (const message of messages) {
      // Get timestamp
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
        continue; // Skip if no timestamp
      }

      // Get message content
      const contentEl = message.querySelector('.chatlog__content');
      if (!contentEl) continue;

      const content = contentEl.textContent?.trim() || '';
      if (!content) continue;

      // Parse items
      const items = parseItems(content);
      if (items.length === 0) continue;

      // Create restock event
      const event = {
        id: generateRestockId(timestamp, items),
        timestamp,
        dateString: timestampStr,
        items,
        source: 'discord',
      };

      events.push(event);
    }
  }

  console.log(`📊 Parsed ${events.length} restock events from HTML`);
  return events;
}

function parseTimestamp(timestampStr, baseDate) {
  try {
    // Full timestamp: "22/11/2025 8:00 pm"
    if (timestampStr.includes('/')) {
      const parts = timestampStr.split(' ');
      if (parts.length < 3) return Date.now();

      const [datePart, timePart, period] = parts;
      const [day, month, year] = datePart.split('/').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);

      let hour24 = hours;
      if (period === 'pm' && hours !== 12) hour24 += 12;
      if (period === 'am' && hours === 12) hour24 = 0;

      return new Date(year, month - 1, day, hour24, minutes, 0, 0).getTime();
    }

    // Short timestamp: "8:05 pm"
    if (baseDate) {
      const parts = timestampStr.split(' ');
      if (parts.length < 2) return Date.now();

      const [timePart, period] = parts;
      const [hours, minutes] = timePart.split(':').map(Number);

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

parseDiscordHtmlFile();
