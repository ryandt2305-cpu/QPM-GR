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
export declare function getVersionInfo(): VersionInfo;
/**
 * Register callback for version changes (no-op in simplified version)
 */
export declare function onVersionChange(_callback: (info: VersionInfo) => void): void;
/**
 * Start version checker (no-op in simplified version)
 */
export declare function startVersionChecker(): void;
/**
 * Get current version string
 */
export declare function getCurrentVersion(): string;
/**
 * Check for updates (no-op - returns current version only)
 */
export declare function checkForUpdates(_force?: boolean): Promise<VersionInfo>;
//# sourceMappingURL=versionChecker.d.ts.map