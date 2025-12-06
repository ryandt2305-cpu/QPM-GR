// src/utils/versionChecker.ts
// Lightweight live version checker for the userscript header

const CURRENT_VERSION = '2.2.3'; // This should match package.json version
export const GITHUB_URL = 'https://github.com/ryandt2305-cpu/QPM-GR';
export const UPDATE_URL = 'https://github.com/ryandt2305-cpu/QPM-GR/raw/refs/heads/master/dist/QPM.user.js';
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export type VersionStatus = 'current' | 'outdated' | 'checking' | 'error';

export interface VersionInfo {
  current: string;
  latest: string | null;
  status: VersionStatus;
  updateUrl: string;
  checkedAt: number | null;
}

let cached: VersionInfo = {
  current: CURRENT_VERSION,
  latest: null,
  status: 'checking',
  updateUrl: UPDATE_URL,
  checkedAt: null,
};

const listeners = new Set<(info: VersionInfo) => void>();
let started = false;
let timer: number | null = null;

function emit(): void {
  listeners.forEach((cb) => {
    try {
      cb(cached);
    } catch (error) {
      console.error('[QPM] Version listener error', error);
    }
  });
}

function compareSemver(a: string, b: string): number {
  const toNums = (v: string) => v.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const aa = toNums(a);
  const bb = toNums(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    const x = aa[i] ?? 0;
    const y = bb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function fetchRemoteVersion(): Promise<string | null> {
  try {
    const res = await fetch(UPDATE_URL, { cache: 'no-cache' });
    if (!res.ok) return null;
    const text = await res.text();
    const headerMatch = text.match(/@version\s+([0-9]+(?:\.[0-9]+)*)/);
    if (headerMatch?.[1]) return headerMatch[1];
    const constMatch = text.match(/const\s+CURRENT_VERSION\s*=\s*['"]([0-9.]+)['"]/);
    if (constMatch?.[1]) return constMatch[1];
  } catch (error) {
    console.error('[QPM] Version fetch failed', error);
  }
  return null;
}

/**
 * Get current version info (no network checks)
 */
export function getVersionInfo(): VersionInfo {
  return { ...cached };
}

/**
 * Register callback for version changes (no-op in simplified version)
 */
export function onVersionChange(callback: (info: VersionInfo) => void): () => void {
  listeners.add(callback);
  callback(getVersionInfo());
  return () => listeners.delete(callback);
}

export function startVersionChecker(): void {
  if (started) return;
  started = true;
  void checkForUpdates(true);
  timer = window.setInterval(() => void checkForUpdates(false), CHECK_INTERVAL_MS);
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
  cached = { ...cached, status: 'checking' };
  emit();

  const latest = await fetchRemoteVersion();
  const now = Date.now();

  if (!latest) {
    cached = {
      ...cached,
      latest: cached.latest,
      status: 'error',
      checkedAt: now,
    };
    emit();
    return getVersionInfo();
  }

  const cmp = compareSemver(latest, CURRENT_VERSION);
  const status: VersionStatus = cmp > 0 ? 'outdated' : 'current';
  cached = {
    current: CURRENT_VERSION,
    latest,
    status,
    updateUrl: UPDATE_URL,
    checkedAt: now,
  };
  emit();
  return getVersionInfo();
}
