import { GardenSnapshot } from '../features/gardenBridge';
interface HighlightDescriptor {
    tileId: string;
    slotIndex: number;
    species: string;
    mutations: string[];
}
export declare function updateGardenHighlightOverlay(highlights: HighlightDescriptor[], snapshot: GardenSnapshot | null): boolean;
export declare function clearGardenHighlightOverlay(): void;
export declare function disposeGardenHighlightOverlay(): void;
export {};
//# sourceMappingURL=gardenHighlightOverlay.d.ts.map