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
    'Banana', 'Grape', 'Coconut', 'Lychee', 'Bamboo', 'Dragon Fruit', 'Fava Bean'
  ],
  seeds: [
    // Basic seeds
    'Carrot', 'Strawberry', 'Aloe', 'Delphinium', 'Blueberry', 'Apple',
    'Tulip', 'Tomato', 'Daffodil', 'Corn', 'Watermelon', 'Pumpkin',
    'Echeveria', 'Coconut', 'Banana', 'Lily', 'Camellia', 'Squash',
    "Burro's Tail", 'Mushroom', 'Cactus', 'Bamboo', 'Chrysanthemum',
    'Grape', 'Pepper', 'Lemon', 'Passion Fruit', 'Dragon Fruit',
    'Lychee', 'Sunflower', 'Starweaver', 'Dawnbinder', 'Moonbinder',
    'Fava Bean', 'Cacao Bean'
  ],
};

function normalizeItemName(itemName: string): string {
  // Normalize curly apostrophes and trim whitespace for matching
    return itemName.replace(/[\u2018\u2019]/g, "'").trim();
}

/**
 * Determine item type
 */
function getItemType(itemName: string): 'seed' | 'crop' | 'egg' | 'weather' | 'unknown' {
  const normalized = normalizeItemName(itemName);
  if (ITEM_CATEGORIES.weather.includes(normalized)) return 'weather';
  if (ITEM_CATEGORIES.eggs.some(e => normalized.includes(e))) return 'egg';
  if (ITEM_CATEGORIES.crops.includes(normalized)) return 'crop';
  if (ITEM_CATEGORIES.seeds.includes(normalized)) return 'seed';
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

      // Smart date format detection
      // Discord exports from AEST typically use DD/MM/YYYY (Australian date format)
      // Strategy:
      // 1. If first value > 12, must be DD/MM/YYYY (day can't be month)
      // 2. Otherwise, assume DD/MM/YYYY (Australian standard for AEST timezone)

      const first = dateParts[0]!;
      const second = dateParts[1]!;
      const year = dateParts[2]!;
      let day: number;
      let month: number;

      if (first > 12) {
        // First value > 12, must be day (DD/MM/YYYY)
        day = first;
        month = second;
      } else {
        // Assume DD/MM/YYYY (Australian standard for AEST exports)
        // This is more reliable than trying to guess based on proximity to current date
        day = first;
        month = second;
      }

      // Final validation
      if (day < 1 || day > 31 || month < 1 || month > 12) {
        log('⚠️ Invalid date after parsing:', timestampStr, { day, month, year });
        return Date.now();
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
      const itemName = normalizeItemName(mentionMatch[1]);

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

interface SerializedRestockEvent {
  id?: string;
  timestamp: number;
  dateString?: string;
  items: Array<{ name: string; quantity: number; type?: RestockItem['type'] }>;
  source?: RestockEvent['source'];
}

function normalizeSerializedEvent(event: SerializedRestockEvent): RestockEvent | null {
  if (!event || typeof event.timestamp !== 'number' || !Array.isArray(event.items)) return null;

  const normalizedItems: RestockItem[] = event.items
    .map((item) => ({
      name: normalizeItemName(item.name),
      quantity: Number.isFinite(item.quantity) ? item.quantity : 0,
      type: item.type ?? getItemType(item.name),
    }))
    .filter((item) => shouldTrackItem(item.name));

  if (normalizedItems.length === 0) return null;

  const id = event.id || generateRestockId(event.timestamp, normalizedItems);

  return {
    id,
    timestamp: event.timestamp,
    dateString: event.dateString || new Date(event.timestamp).toISOString(),
    items: normalizedItems,
    source: event.source || 'manual',
  };
}

function parseEmbeddedJson(doc: Document): RestockEvent[] | null {
  const script = doc.getElementById('qpm-restock-data');
  if (!script) return null;

  try {
    const raw = script.textContent || '[]';
    const payload = JSON.parse(raw) as { events?: SerializedRestockEvent[] } | SerializedRestockEvent[];
    const eventsArray = Array.isArray((payload as any)?.events) ? (payload as any).events : Array.isArray(payload) ? payload : [];
    const normalized: RestockEvent[] = [];

    for (const evt of eventsArray) {
      const parsed = normalizeSerializedEvent(evt);
      if (parsed) normalized.push(parsed);
    }

    if (normalized.length > 0) {
      log(`✅ Parsed ${normalized.length} restock events from embedded JSON payload`);
      return normalized;
    }
  } catch (error) {
    log('⚠️ Failed to parse embedded restock JSON payload', error);
  }

  return null;
}

/**
 * Parse Discord HTML export to extract restock events (chunked for performance)
 */
export async function parseDiscordHtml(htmlContent: string): Promise<RestockEvent[]> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // Prefer embedded JSON payloads from QPM exports (lossless and timezone-safe)
  const embedded = parseEmbeddedJson(doc);
  if (embedded) return embedded;

  const events: RestockEvent[] = [];

  // Find all message groups from Magic Shopkeeper
  const messageGroups = Array.from(doc.querySelectorAll('.chatlog__message-group'));

  let currentBaseDate: Date | undefined;

  // Process message groups in chunks to prevent UI freeze
  const CHUNK_SIZE = 50; // Process 50 message groups at a time
  const totalGroups = messageGroups.length;
  let processedGroups = 0;

  log(`📊 Parsing ${totalGroups} message groups from Discord HTML...`);

  // Process in chunks with async/await to yield to UI thread
  for (let chunkStart = 0; chunkStart < totalGroups; chunkStart += CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, totalGroups);
    const chunk = messageGroups.slice(chunkStart, chunkEnd);

    // Process this chunk
    for (const group of chunk) {
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

    processedGroups += chunk.length;

    // Yield to UI thread after each chunk (except last)
    if (chunkEnd < totalGroups) {
      log(`📊 Parsed ${processedGroups}/${totalGroups} message groups (${events.length} events so far)...`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  log(`✅ Parsed ${events.length} restock events from ${totalGroups} message groups`);
  return events;
}

/**
 * Parse Discord HTML from a file
 */
function parseRestockJsonContent(jsonText: string): RestockEvent[] {
  try {
    const payload = JSON.parse(jsonText) as { events?: SerializedRestockEvent[] } | SerializedRestockEvent[];
    const eventsArray = Array.isArray((payload as any)?.events) ? (payload as any).events : Array.isArray(payload) ? payload : [];
    const normalized: RestockEvent[] = [];
    for (const evt of eventsArray) {
      const parsed = normalizeSerializedEvent(evt);
      if (parsed) normalized.push(parsed);
    }
    log(`✅ Parsed ${normalized.length} restock events from JSON payload`);
    return normalized;
  } catch (error) {
    log('⚠️ Failed to parse restock JSON content', error);
    return [];
  }
}

export async function parseRestockFile(file: File): Promise<RestockEvent[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const content = (e.target?.result as string) ?? '';
        const isJson = file.name.toLowerCase().endsWith('.json') || file.type.includes('json') || content.trim().startsWith('{') || content.trim().startsWith('[');

        if (isJson) {
          resolve(parseRestockJsonContent(content));
          return;
        }

        const events = await parseDiscordHtml(content);
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
