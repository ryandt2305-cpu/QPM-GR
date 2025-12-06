export type AriesBridgeAchievement = {
    id: string;
    title: string;
    description: string;
    category: string;
    rarity: string;
    target: number | null;
    current: number;
    completedAt: number | null;
    ineligible: boolean;
};
export type AriesBridgeTeam = {
    id: string;
    name: string;
    slotIds: (string | null)[];
    source: 'localStorage' | 'activePets' | 'unknown';
};
export declare function exposeAriesBridge(): void;
//# sourceMappingURL=ariesBridge.d.ts.map