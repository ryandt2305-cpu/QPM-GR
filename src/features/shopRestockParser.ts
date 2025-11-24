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
 * Parse a timestamp string to Unix timestamp
 * Format: "22/11/2025 8:00 pm" or "8:05 pm"
 */
function parseTimestamp(timestampStr: string, baseDate?: Date): number {
  try {
    // Full timestamp: "22/11/2025 8:00 pm"
    if (timestampStr.includes('/')) {
      const parts = timestampStr.split(' ');
      if (parts.length < 3) return Date.now();

      const datePart = parts[0]!;
      const timePart = parts[1]!;
      const period = parts[2]!;

      const dateParts = datePart.split('/').map(Number);
      const timeParts = timePart.split(':').map(Number);

      if (dateParts.length !== 3 || timeParts.length !== 2) return Date.now();

      const day = dateParts[0]!;
      const month = dateParts[1]!;
      const year = dateParts[2]!;
      const hours = timeParts[0]!;
      const minutes = timeParts[1]!;

      let hour24 = hours;
      if (period === 'pm' && hours !== 12) {
        hour24 += 12;
      } else if (period === 'am' && hours === 12) {
        hour24 = 0;
      }

      const date = new Date(year, month - 1, day, hour24, minutes, 0, 0);
      return date.getTime();
    }

    // Short timestamp: "8:05 pm" - use base date
    if (baseDate) {
      const parts = timestampStr.split(' ');
      if (parts.length < 2) return Date.now();

      const timePart = parts[0]!;
      const period = parts[1]!;

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

      const date = new Date(baseDate);
      date.setHours(hour24, minutes, 0, 0);
      return date.getTime();
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
