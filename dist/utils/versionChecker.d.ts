export declare const GITHUB_URL = "https://github.com/ryandt2305-cpu/QPM-GR";
export declare const UPDATE_URL = "https://raw.githubusercontent.com/ryandt2305-cpu/QPM-GR/main/dist/QPM.user.js";
export type VersionStatus = 'current' | 'outdated' | 'checking' | 'error';
export interface VersionInfo {
    current: string;
    latest: string | null;
    status: VersionStatus;
    updateUrl: string;
    checkedAt: number | null;
}
/**
 * Get current version info (no network checks)
 */
export declare function getVersionInfo(): VersionInfo;
/**
 * Register callback for version changes
 */
export declare function onVersionChange(callback: (info: VersionInfo) => void): () => void;
export declare function startVersionChecker(): void;
/**
 * Get current version string
 */
export declare function getCurrentVersion(): string;
/**
 * Check for updates and update cached status
 */
export declare function checkForUpdates(_force?: boolean): Promise<VersionInfo>;
//# sourceMappingURL=versionChecker.d.ts.map