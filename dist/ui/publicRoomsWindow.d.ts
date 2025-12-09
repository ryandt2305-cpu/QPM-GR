export declare const setupGardenInspector: () => {
    QPM_INSPECT_GARDEN: () => Promise<void>;
    QPM_EXPOSE_GARDEN: () => Promise<any>;
    QPM_CURRENT_TILE: () => Promise<{
        tileInfo: any;
        tileObject: any;
    } | null>;
};
export declare function openInspectorDirect(playerId: string, playerName?: string | null): void;
export declare function renderPublicRoomsWindow(root: HTMLElement): void;
//# sourceMappingURL=publicRoomsWindow.d.ts.map