type FilterStatus = 'all' | 'in-progress' | 'completed';
type CategoryFilter = 'all' | 'garden' | 'pets' | 'abilities' | 'shop' | 'weather' | 'wealth' | 'collection' | 'streaks' | 'obscure';
export interface AchievementsWindowState {
    root: HTMLElement;
    list: HTMLElement;
    oneTimeList: HTMLElement;
    badgesList: HTMLElement;
    achievementsSection: HTMLElement;
    oneTimeSection: HTMLElement;
    badgesSection: HTMLElement;
    tabButtons: Record<'achievements' | 'badges' | 'onetime', HTMLButtonElement>;
    summary: HTMLElement;
    unsubscribe: (() => void) | null;
    filterStatus: FilterStatus;
    filterCategory: CategoryFilter;
    groupPages: Record<string, number>;
    activeTab: 'achievements' | 'badges' | 'onetime';
}
export declare function createAchievementsWindow(): AchievementsWindowState;
export declare function toggleBadgePreview(force?: boolean): boolean;
export declare function showAchievementsWindow(state: AchievementsWindowState): void;
export declare function hideAchievementsWindow(state: AchievementsWindowState): void;
export declare function destroyAchievementsWindow(state: AchievementsWindowState): void;
export {};
//# sourceMappingURL=achievementsWindow.d.ts.map