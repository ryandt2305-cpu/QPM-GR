// src/utils/versionChecker.ts
// Version information (simplified - no network checks to avoid Tampermonkey prompts)
// Tampermonkey's built-in update mechanism (@updateURL in header) handles version checking

const CURRENT_VERSION = '1.10.0'; // This should match package.json version
const GITHUB_URL = 'https://github.com/ryandt2305-cpu/QPM-GR';
const UPDATE_URL = 'https://raw.githubusercontent.com/ryandt2305-cpu/QPM-GR/main/dist/QPM.user.js';

export type VersionStatus = 'current' | 'unknown';

export interface VersionInfo {
  current: string;
  latest: string | null;
  status: VersionStatus;
  updateUrl: string;
}

/**
 * Get current version info (no network checks)
 */
export function getVersionInfo(): VersionInfo {
  return {
    current: CURRENT_VERSION,
    latest: null,
    status: 'current',
    updateUrl: UPDATE_URL,
  };
}

/**
 * Register callback for version changes (no-op in simplified version)
 */
export function onVersionChange(_callback: (info: VersionInfo) => void): void {
  // No-op: We don't do network-based version checking anymore
  // Tampermonkey handles updates via @updateURL
}

/**
 * Start version checker (no-op in simplified version)
 */
export function startVersionChecker(): void {
  // No-op: Tampermonkey handles updates via @updateURL in userscript header
  console.log(`[QPM] Version ${CURRENT_VERSION} - Updates handled by Tampermonkey`);
}

/**
 * Get current version string
 */
export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}

/**
 * Check for updates (no-op - returns current version only)
 */
export async function checkForUpdates(_force = false): Promise<VersionInfo> {
  return getVersionInfo();
}
