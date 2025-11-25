export type VersionStatus = 'up-to-date' | 'outdated' | 'error' | 'checking';
export interface VersionInfo {
    current: string;
    latest: string | null;
    status: VersionStatus;
    updateUrl: string;
}
/**
 * Check for updates and return version info
 */
export declare function checkForUpdates(force?: boolean): Promise<VersionInfo>;
/**
 * Get cached version info (or return default)
 */
export declare function getVersionInfo(): VersionInfo;
/**
 * Register callback for version changes
 */
export declare function onVersionChange(callback: (info: VersionInfo) => void): void;
/**
 * Start periodic version checking
 */
export declare function startVersionChecker(): void;
/**
 * Get current version string
 */
export declare function getCurrentVersion(): string;
//# sourceMappingURL=versionChecker.d.ts.map