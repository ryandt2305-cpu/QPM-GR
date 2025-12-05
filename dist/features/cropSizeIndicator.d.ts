interface CropSizeConfig {
    enabled: boolean;
    showForGrowing: boolean;
    showForMature: boolean;
    showJournalIndicators: boolean;
}
export declare function getCropSizeIndicatorConfig(): CropSizeConfig;
export declare function setCropSizeIndicatorConfig(updates: Partial<CropSizeConfig>): void;
declare function startCropSizeIndicator(): void;
declare function stopCropSizeIndicator(): void;
export declare function initCropSizeIndicator(): void;
export { startCropSizeIndicator, stopCropSizeIndicator };
//# sourceMappingURL=cropSizeIndicator.d.ts.map