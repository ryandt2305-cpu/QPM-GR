// sprite-v2/detector.ts - Automatic game version detection

/**
 * Detects the current Magic Garden game version from various sources.
 * This makes the sprite system future-proof by adapting to version changes automatically.
 *
 * Detection strategy:
 * 1. Check global variables (gameVersion, MG_gameVersion, __MG_GAME_VERSION__)
 * 2. Scan script tags for version patterns
 * 3. Scan link tags for version patterns
 *
 * @returns The detected version hash (e.g., "436ff68")
 * @throws Error if version cannot be detected
 */
export function detectGameVersion(): string {
  // Try global variables first
  const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
  const gv = win.gameVersion || win.MG_gameVersion || win.__MG_GAME_VERSION__;

  if (gv) {
    if (typeof gv.getVersion === 'function') {
      return gv.getVersion();
    }
    if (typeof gv.get === 'function') {
      return gv.get();
    }
    if (typeof gv === 'string') {
      return gv;
    }
  }

  // Scan DOM for version patterns
  const scriptUrls = Array.from(document.scripts || [])
    .map((s) => s.src)
    .filter(Boolean);

  const linkUrls = Array.from(document.querySelectorAll<HTMLLinkElement>('link[href]') || [])
    .map((l) => l.href);

  const urls = [...scriptUrls, ...linkUrls];

  // Look for pattern: /version/[HASH]/
  for (const u of urls) {
    const m = u.match(/\/version\/([^/]+)\//);
    if (m?.[1]) {
      return m[1];
    }
  }

  throw new Error('Version not found. Could not detect game version from DOM or global variables.');
}

/**
 * Builds the base assets URL for the detected version
 * @param origin The origin URL (default: https://magicgarden.gg)
 * @returns The full base URL for assets (e.g., "https://magicgarden.gg/version/436ff68/assets/")
 */
export function buildAssetsBaseUrl(origin = 'https://magicgarden.gg'): string {
  const version = detectGameVersion();
  return `${origin.replace(/\/$/, '')}/version/${version}/assets/`;
}

/**
 * Detects if we're in a userscript environment
 */
export function isUserscriptEnv(): boolean {
  return typeof GM_xmlhttpRequest !== 'undefined';
}

/**
 * Gets the appropriate window object (handles userscript sandbox)
 */
export function getRuntimeWindow(): Window & typeof globalThis {
  if (typeof unsafeWindow !== 'undefined' && unsafeWindow) {
    return unsafeWindow as Window & typeof globalThis;
  }
  return window;
}
