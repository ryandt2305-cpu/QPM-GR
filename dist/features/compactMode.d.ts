/**
 * Display mode levels
 */
export type DisplayMode = 'full' | 'compact' | 'minimal' | 'hidden';
/**
 * Event types that can trigger auto-expand
 */
export type AutoExpandEvent = 'hunger' | 'harvest' | 'weather' | 'ability';
/**
 * Compact mode configuration
 */
export interface CompactModeConfig {
    level: DisplayMode;
    keybind: string;
    expandOnHover: boolean;
    autoExpandEvents: AutoExpandEvent[];
    autoCompactAtOpacity: number;
}
/**
 * Initialize compact mode system
 */
export declare function initializeCompactMode(): void;
/**
 * Cycle through display modes
 */
export declare function cycleDisplayMode(): void;
/**
 * Set display mode
 */
export declare function setDisplayMode(mode: DisplayMode): void;
/**
 * Get current display mode
 */
export declare function getDisplayMode(): DisplayMode;
/**
 * Toggle section expanded state (for compact mode)
 */
export declare function toggleSectionExpanded(sectionId: string): void;
/**
 * Check if section is expanded
 */
export declare function isSectionExpanded(sectionId: string): boolean;
/**
 * Expand all sections (for compact mode)
 */
export declare function expandAllSections(): void;
/**
 * Collapse all sections (for compact mode)
 */
export declare function collapseAllSections(): void;
/**
 * Auto-expand on important event
 */
export declare function handleAutoExpandEvent(eventType: AutoExpandEvent): void;
/**
 * Check opacity and auto-compact if below threshold
 */
export declare function checkAutoCompact(opacity: number): void;
/**
 * Set mode change callback
 */
export declare function onModeChange(callback: (mode: DisplayMode) => void): void;
/**
 * Set expanded sections change callback
 */
export declare function onExpandedSectionsChange(callback: (sections: Set<string>) => void): void;
/**
 * Get current configuration
 */
export declare function getConfig(): CompactModeConfig;
/**
 * Update configuration
 */
export declare function updateConfig(updates: Partial<CompactModeConfig>): void;
/**
 * Get expanded sections
 */
export declare function getExpandedSections(): Set<string>;
/**
 * Reset to defaults
 */
export declare function resetToDefaults(): void;
//# sourceMappingURL=compactMode.d.ts.map