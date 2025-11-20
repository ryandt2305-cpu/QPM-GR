export interface HighlightOptions {
    color?: string;
    opacity?: number;
    borderWidth?: number;
    label?: string;
}
export declare function highlightGardenSlot(slotId: string | number, options?: HighlightOptions): void;
export declare function clearGardenHighlights(): void;
export declare function removeGardenHighlight(slotId: string | number): void;
export declare function updateGardenHighlightOverlay(matches?: any, snapshot?: any): void;
export declare function clearGardenHighlightOverlay(): void;
export declare function disposeGardenHighlightOverlay(): void;
//# sourceMappingURL=gardenHighlightOverlay.d.ts.map