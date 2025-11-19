import { ActivePetInfo } from '../store/pets';
import { XpAbilityStats } from '../store/xpTracker';
export interface XpTrackerWindowState {
    root: HTMLElement;
    summaryText: HTMLElement;
    petLevelTbody: HTMLTableSectionElement;
    tbody: HTMLTableSectionElement;
    combinedTbody: HTMLTableSectionElement;
    configTbody: HTMLTableSectionElement;
    updateInterval: number | null;
    latestPets: ActivePetInfo[];
    latestStats: XpAbilityStats[];
    totalTeamXpPerHour: number;
    lastKnownSpecies: Set<string>;
    unsubscribePets: (() => void) | null;
    unsubscribeXpTracker: (() => void) | null;
}
/**
 * Create XP tracker window
 */
export declare function createXpTrackerWindow(): XpTrackerWindowState;
/**
 * Show XP tracker window
 */
export declare function showXpTrackerWindow(state: XpTrackerWindowState): void;
/**
 * Hide XP tracker window
 */
export declare function hideXpTrackerWindow(state: XpTrackerWindowState): void;
/**
 * Destroy XP tracker window
 */
export declare function destroyXpTrackerWindow(state: XpTrackerWindowState): void;
//# sourceMappingURL=xpTrackerWindow.d.ts.map