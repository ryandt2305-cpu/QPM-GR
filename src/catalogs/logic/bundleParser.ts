// src/catalogs/logic/bundleParser.ts
// Shared main-bundle parsing helpers (Gemini-style).

import { pageWindow, readSharedGlobal } from '../../core/pageContext';

const MAIN_BUNDLE_PATTERN = /main-[^/]+\.js(\?|$)/;

let bundleCache: string | null = null;
let bundleFetchInFlight: Promise<string | null> | null = null;

function shouldDebug(): boolean {
  try {
    return readSharedGlobal('__QPM_DEBUG_ABILITY_COLORS') === true;
  } catch {
    return false;
  }
}

/**
 * Find main bundle URL from scripts or performance entries.
 */
export function findMainBundleUrl(): string | null {
  try {
    for (const script of pageWindow.document?.scripts || []) {
      const src = script?.src ? String(script.src) : '';
      if (MAIN_BUNDLE_PATTERN.test(src)) return src;
    }
  } catch {
    // Ignore and continue fallback.
  }

  try {
    const entries = pageWindow.performance?.getEntriesByType?.('resource') || [];
    for (const entry of entries) {
      const name = (entry as PerformanceResourceTiming)?.name
        ? String((entry as PerformanceResourceTiming).name)
        : '';
      if (MAIN_BUNDLE_PATTERN.test(name)) return name;
    }
  } catch {
    // Ignore.
  }

  return null;
}

/**
 * Find all indices of a substring in text.
 */
export function findAllIndices(haystack: string, needle: string): number[] {
  const out: number[] = [];
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    out.push(idx);
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return out;
}

/**
 * Extract balanced block from text starting at open brace index.
 * Handles nested braces and string literals.
 */
export function extractBalancedBlock(text: string, openBraceIndex: number): string | null {
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let i = openBraceIndex; i < text.length; i += 1) {
    const ch = text[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }

    if (ch === '"' || ch === '\'' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) return text.slice(openBraceIndex, i + 1);
  }

  return null;
}

/**
 * Extract balanced object literal from text starting near an anchor index.
 * Looks backward for const/let/var assignment and returns the object block.
 */
export function extractBalancedObjectLiteral(text: string, anchorIndex: number): string | null {
  const declStart = Math.max(
    text.lastIndexOf('const ', anchorIndex),
    text.lastIndexOf('let ', anchorIndex),
    text.lastIndexOf('var ', anchorIndex),
  );
  if (declStart < 0) return null;

  const eq = text.indexOf('=', declStart);
  if (eq < 0 || eq > anchorIndex) return null;

  const braceStart = text.indexOf('{', eq);
  if (braceStart < 0 || braceStart > anchorIndex) return null;

  return extractBalancedBlock(text, braceStart);
}

/**
 * Fetch main bundle text (single in-flight + positive cache).
 */
export async function fetchMainBundle(): Promise<string | null> {
  if (bundleCache) return bundleCache;
  if (bundleFetchInFlight) return bundleFetchInFlight;

  bundleFetchInFlight = (async () => {
    const url = findMainBundleUrl();
    if (!url) {
      if (shouldDebug()) console.log('[QPM Catalog] [AbilityColors] main bundle URL not found');
      return null;
    }

    try {
      const fetchFn = typeof pageWindow.fetch === 'function'
        ? pageWindow.fetch.bind(pageWindow)
        : fetch;
      const res = await fetchFn(url, { credentials: 'include' });
      if (!res.ok) {
        if (shouldDebug()) console.log('[QPM Catalog] [AbilityColors] main bundle fetch failed', { status: res.status, url });
        return null;
      }
      const text = await res.text();
      if (!text || text.length < 1000) {
        if (shouldDebug()) console.log('[QPM Catalog] [AbilityColors] main bundle text suspiciously small', { length: text?.length ?? 0, url });
        return null;
      }
      bundleCache = text;
      if (shouldDebug()) console.log('[QPM Catalog] [AbilityColors] main bundle fetched', { url, length: text.length });
      return text;
    } catch {
      if (shouldDebug()) console.log('[QPM Catalog] [AbilityColors] main bundle fetch threw', { url });
      return null;
    } finally {
      bundleFetchInFlight = null;
    }
  })();

  return bundleFetchInFlight;
}
