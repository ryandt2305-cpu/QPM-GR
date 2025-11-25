// src/utils/versionChecker.ts
// Version checker: Compares current version with latest GitHub release

import { log } from './logger';

const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/ryandt2305-cpu/QPM-GR/main/dist/QPM.user.js';
const CURRENT_VERSION = '1.10.0'; // This should match package.json version
const CHECK_INTERVAL = 3600000; // Check every hour (in milliseconds)

export type VersionStatus = 'up-to-date' | 'outdated' | 'error' | 'checking';

export interface VersionInfo {
  current: string;
  latest: string | null;
  status: VersionStatus;
  updateUrl: string;
}

let cachedVersionInfo: VersionInfo | null = null;
let lastCheckTime = 0;
let onVersionChangeCallback: ((info: VersionInfo) => void) | null = null;

/**
 * Parse version string to comparable array [major, minor, patch]
 */
function parseVersion(version: string): number[] {
  return version.split('.').map(v => parseInt(v, 10) || 0);
}

/**
 * Compare two version strings
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = parseVersion(v1);
  const parts2 = parseVersion(v2);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}

/**
 * Fetch latest version from GitHub raw file
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(GITHUB_RAW_URL, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      log(`⚠️ Failed to fetch latest version: ${response.status}`);
      return null;
    }

    const text = await response.text();

    // Extract version from userscript header: // @version      X.Y.Z
    const versionMatch = text.match(/\/\/\s*@version\s+([\d.]+)/);
    if (versionMatch && versionMatch[1]) {
      return versionMatch[1];
    }

    log('⚠️ Could not parse version from GitHub file');
    return null;
  } catch (error) {
    log('❌ Error fetching latest version:', error);
    return null;
  }
}

/**
 * Check for updates and return version info
 */
export async function checkForUpdates(force = false): Promise<VersionInfo> {
  const now = Date.now();

  // Return cached result if recent (unless forced)
  if (!force && cachedVersionInfo && (now - lastCheckTime) < CHECK_INTERVAL) {
    return cachedVersionInfo;
  }

  // Set status to checking
  const checkingInfo: VersionInfo = {
    current: CURRENT_VERSION,
    latest: null,
    status: 'checking',
    updateUrl: GITHUB_RAW_URL,
  };

  if (onVersionChangeCallback) {
    onVersionChangeCallback(checkingInfo);
  }

  lastCheckTime = now;

  // Fetch latest version
  const latestVersion = await fetchLatestVersion();

  let status: VersionStatus = 'error';
  if (latestVersion) {
    const comparison = compareVersions(CURRENT_VERSION, latestVersion);
    if (comparison < 0) {
      status = 'outdated';
      log(`📦 New version available: ${latestVersion} (current: ${CURRENT_VERSION})`);
    } else {
      status = 'up-to-date';
      log(`✅ QPM is up to date (${CURRENT_VERSION})`);
    }
  }

  cachedVersionInfo = {
    current: CURRENT_VERSION,
    latest: latestVersion,
    status,
    updateUrl: GITHUB_RAW_URL,
  };

  if (onVersionChangeCallback) {
    onVersionChangeCallback(cachedVersionInfo);
  }

  return cachedVersionInfo;
}

/**
 * Get cached version info (or return default)
 */
export function getVersionInfo(): VersionInfo {
  return cachedVersionInfo || {
    current: CURRENT_VERSION,
    latest: null,
    status: 'checking',
    updateUrl: GITHUB_RAW_URL,
  };
}

/**
 * Register callback for version changes
 */
export function onVersionChange(callback: (info: VersionInfo) => void): void {
  onVersionChangeCallback = callback;
}

/**
 * Start periodic version checking
 */
export function startVersionChecker(): void {
  log('🔍 Starting version checker...');

  // Initial check after 5 seconds
  setTimeout(() => {
    checkForUpdates().catch(err => {
      log('❌ Initial version check failed:', err);
    });
  }, 5000);

  // Periodic checks
  setInterval(() => {
    checkForUpdates().catch(err => {
      log('❌ Periodic version check failed:', err);
    });
  }, CHECK_INTERVAL);
}

/**
 * Get current version string
 */
export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}
