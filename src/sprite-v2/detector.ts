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

export async function detectGameVersionWithRetry(
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 12000;
  const intervalMs = Math.max(50, options.intervalMs ?? 250);
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      return detectGameVersion();
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, intervalMs);
      });
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Version not found after retry window.');
}

function resolveAssetsOrigin(origin?: string): string {
  const runtimeOrigin = getRuntimeWindow()?.location?.origin;
  const resolved = (origin && origin.trim()) || runtimeOrigin || 'https://magicgarden.gg';
  return resolved.replace(/\/$/, '');
}

/**
 * Builds the base assets URL for the detected version
 * @param origin The origin URL (defaults to current runtime origin)
 * @param version Optional pre-detected game version hash
 * @returns The full base URL for assets (e.g., "https://magicgarden.gg/version/436ff68/assets/")
 */
export function buildAssetsBaseUrl(origin?: string, version?: string): string {
  const resolvedVersion = (version && version.trim()) || detectGameVersion();
  return `${resolveAssetsOrigin(origin)}/version/${resolvedVersion}/assets/`;
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
