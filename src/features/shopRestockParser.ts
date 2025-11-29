// src/features/shopRestockParser.ts
// Parse Discord HTML exports to extract shop restock data

import { RestockEvent, RestockItem } from './shopRestockTracker';
import { log } from '../utils/logger';

/**
 * Item type categorization - comprehensive list of all game items
 */
const ITEM_CATEGORIES = {
  weather: ['Rain', 'Snow', 'Frost'],
  eggs: ['Uncommon Eggs', 'Rare Eggs', 'Mythical Eggs', 'Legendary Eggs'],
  crops: [
    'Carrot', 'Strawberry', 'Aloe', 'Delphinium', 'Blueberry', 'Apple',
    'Tulip', 'Tomato', 'Corn', 'Camellia', 'Squash', 'Mushroom',
    'Banana', 'Grape', 'Coconut', 'Lychee', 'Bamboo'
  ],
  seeds: [
    // Basic seeds
    'Carrot', 'Strawberry', 'Aloe', 'Delphinium', 'Blueberry', 'Apple',
    'Tulip', 'Tomato', 'Daffodil', 'Corn', 'Watermelon', 'Pumpkin',
    'Echeveria', 'Coconut', 'Banana', 'Lily', 'Camellia', 'Squash',
    "Burro's Tail", 'Mushroom', 'Cactus', 'Bamboo', 'Chrysanthemum',
    'Grape', 'Pepper', 'Lemon', 'Passion Fruit', 'Dragon Fruit',
    'Lychee', 'Sunflower', 'Starweaver', 'Dawnbinder', 'Moonbinder'
  ],
};

/**
 * Determine item type
 */
function getItemType(itemName: string): 'seed' | 'crop' | 'egg' | 'weather' | 'unknown' {
  if (ITEM_CATEGORIES.weather.includes(itemName)) return 'weather';
  if (ITEM_CATEGORIES.eggs.some(e => itemName.includes(e))) return 'egg';
  if (ITEM_CATEGORIES.crops.includes(itemName)) return 'crop';
  if (ITEM_CATEGORIES.seeds.includes(itemName)) return 'seed';
  return 'unknown';
}

/**
 * Invalid patterns that indicate this is not a real item
 */
const INVALID_PATTERNS = [
  /!!!/,           // Multiple exclamation marks
  /omg/i,          // Common Discord expressions
  /ping/i,         // Ping mentions
  /spam/i,         // Spam mentions
  /^\d+/,          // Starts with numbers (like "1 Burros Tail")
  /\d+\s+[A-Z]/,   // Number followed by space and capital letter in middle
  /stock!!!/i,     // "in stock!!!" messages
  /vegetables/i,   // Message text
  /named/i,        // Message text
];

/**
 * Check if item name is valid
 */
function isValidItemName(itemName: string): boolean {
  // Reject if matches any invalid pattern
  if (INVALID_PATTERNS.some(pattern => pattern.test(itemName))) {
    return false;
  }

  // Reject if too long (real item names are short)
  if (itemName.length > 50) {
    return false;
  }

  return true;
}

/**
 * Check if item should be tracked (only seeds and eggs)
 */
function shouldTrackItem(itemName: string): boolean {
  if (!isValidItemName(itemName)) {
    return false;
  }

  const type = getItemType(itemName);
  return type === 'seed' || type === 'egg';
}

/**
 * AEST timezone offset in milliseconds
 * AEST = UTC+10 (no DST) = 10 hours * 60 minutes * 60 seconds * 1000 ms
 * Note: Australia uses AEDT (UTC+11) during daylight saving (Oct-Apr)
 * For simplicity, we use UTC+10 as a baseline. For more accuracy, could detect DST.
 */
const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;

/**
 * Parse a timestamp string to Unix timestamp
 * Format: "08/20/2025 1:35 AM" (MM/DD/YYYY H:MM AM/PM) or "1:35 AM"
 *
 * IMPORTANT: Discord exports show timestamps in AEST (Australian Eastern Standard Time).
 * This function interprets the timestamps as AEST and converts to Unix timestamp,
 * which will then display correctly in each user's local timezone.
 */
function parseTimestamp(timestampStr: string, baseDate?: Date): number {
  try {
    // Full timestamp: "21/08/2025 12:00 am" (DD/MM/YYYY format - Australian)
    // or "9/07/2025 12:20 AM" (D/MM/YYYY or DD/MM/YYYY)
    if (timestampStr.includes('/')) {
      const parts = timestampStr.split(' ');
      if (parts.length < 3) return Date.now();

      const datePart = parts[0]!;
      const timePart = parts[1]!;
      const period = parts[2]!.toLowerCase(); // Normalize to lowercase for comparison

      const dateParts = datePart.split('/').map(Number);
      const timeParts = timePart.split(':').map(Number);

      if (dateParts.length !== 3 || timeParts.length !== 2) return Date.now();

      // Detect date format based on values
      // DD/MM/YYYY: First value is day (1-31), second is month (1-12)
      // MM/DD/YYYY: First value is month (1-12), second is day (1-31)
      // We use DD/MM/YYYY (Australian format) since that's what Discord exports use
      // The key insight: if first value > 12, it must be a day (DD/MM/YYYY)
      // If both <= 12, assume DD/MM/YYYY since exports are from Australian users
      let day: number;
      let month: number;
      const year = dateParts[2]!;

      // Use DD/MM/YYYY format (Australian format used by Discord exports)
      // First part is day, second is month
      day = dateParts[0]!;
      month = dateParts[1]!;

      // Sanity check: if "day" > 31 or "month" > 12, dates are likely malformed
      // Try swapping if the format seems wrong
      if (day > 31 || month > 12) {
        // Try MM/DD/YYYY instead
        day = dateParts[1]!;
        month = dateParts[0]!;

        // If still invalid after swap, return current time (data is corrupted)
        if (day > 31 || month > 12 || day < 1 || month < 1) {
          log('⚠️ Invalid date in timestamp:', timestampStr);
          return Date.now();
        }
      }

      const hours = timeParts[0]!;
      const minutes = timeParts[1]!;

      let hour24 = hours;
      if (period === 'pm' && hours !== 12) {
        hour24 += 12;
      } else if (period === 'am' && hours === 12) {
        hour24 = 0;
      }

      // Create UTC date then adjust for AEST offset
      // Discord exports show AEST time, so we parse as UTC and subtract AEST offset
      const utcDate = Date.UTC(year, month - 1, day, hour24, minutes, 0, 0);
      const aestTimestamp = utcDate - AEST_OFFSET_MS;

      return aestTimestamp;
    }

    // Short timestamp: "8:05 pm" - use base date
    if (baseDate) {
      const parts = timestampStr.split(' ');
      if (parts.length < 2) return Date.now();

      const timePart = parts[0]!;
      const period = parts[1]!.toLowerCase(); // Normalize to lowercase

      const timeParts = timePart.split(':').map(Number);
      if (timeParts.length !== 2) return Date.now();

      const hours = timeParts[0]!;
      const minutes = timeParts[1]!;

      let hour24 = hours;
      if (period === 'pm' && hours !== 12) {
        hour24 += 12;
      } else if (period === 'am' && hours === 12) {
        hour24 = 0;
      }

      // Use base date's year/month/day but set new time
      const baseYear = new Date(baseDate).getUTCFullYear();
      const baseMonth = new Date(baseDate).getUTCMonth();
      const baseDay = new Date(baseDate).getUTCDate();

      const utcDate = Date.UTC(baseYear, baseMonth, baseDay, hour24, minutes, 0, 0);
      const aestTimestamp = utcDate - AEST_OFFSET_MS;

      return aestTimestamp;
    }

    return Date.now();
  } catch (error) {
    log('⚠️ Failed to parse timestamp:', timestampStr, error);
    return Date.now();
  }
}

/**
 * Parse item mentions from message content
 * Format: "@ItemName Quantity | @ItemName Quantity"
 */
function parseItems(content: string): RestockItem[] {
  const items: RestockItem[] = [];

  // Split by pipe (|)
  const parts = content.split('|').map(p => p.trim());

  for (const part of parts) {
    // Extract @mentions using regex
    const mentionMatch = part.match(/@([^@]+?)(?:\s+(\d+))?$/);

    if (mentionMatch && mentionMatch[1]) {
      const itemName = mentionMatch[1].trim();

      // Only track seeds and eggs
      if (!shouldTrackItem(itemName)) {
        continue;
      }

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

/**
 * Generate unique ID for restock event
 */
function generateRestockId(timestamp: number, items: RestockItem[]): string {
  const itemsHash = items.map(i => `${i.name}:${i.quantity}`).join(',');
  return `${timestamp}-${btoa(itemsHash).substring(0, 8)}`;
}

/**
 * Parse Discord HTML export to extract restock events
 */
export function parseDiscordHtml(htmlContent: string): RestockEvent[] {
  const events: RestockEvent[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // Find all message groups from Magic Shopkeeper
  const messageGroups = doc.querySelectorAll('.chatlog__message-group');

  let currentBaseDate: Date | undefined;

  for (const group of messageGroups) {
    // Check if this is from Magic Shopkeeper
    const authorElement = group.querySelector('.chatlog__author');
    if (!authorElement || !authorElement.textContent?.includes('Magic Shopkeeper')) {
      continue;
    }

    // Get the base timestamp from the first message
    const firstTimestampEl = group.querySelector('.chatlog__timestamp a');
    if (firstTimestampEl) {
      const fullTimestamp = firstTimestampEl.textContent?.trim() || '';
      const timestamp = parseTimestamp(fullTimestamp);
      currentBaseDate = new Date(timestamp);
    }

    // Process all messages in this group
    const messages = group.querySelectorAll('.chatlog__message-container');

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
      const event: RestockEvent = {
        id: generateRestockId(timestamp, items),
        timestamp,
        dateString: timestampStr,
        items,
        source: 'discord',
      };

      events.push(event);
    }
  }

  log(`📊 Parsed ${events.length} restock events from Discord HTML`);
  return events;
}

/**
 * Parse Discord HTML from a file
 */
export async function parseDiscordHtmlFile(file: File): Promise<RestockEvent[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const htmlContent = e.target?.result as string;
        const events = parseDiscordHtml(htmlContent);
        resolve(events);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}
