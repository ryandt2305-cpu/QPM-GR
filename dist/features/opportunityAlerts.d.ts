export interface OpportunityAlertsConfig {
    enabled: boolean;
    rareWeatherAlerts: boolean;
    petsNearLevelUp: boolean;
    lowHungerWarning: boolean;
    mutationOpportunities: boolean;
}
export declare function initializeOpportunityAlerts(): void;
export declare function configureOpportunityAlerts(newConfig: Partial<OpportunityAlertsConfig>): void;
export declare function getOpportunityAlertsConfig(): OpportunityAlertsConfig;
export declare function disposeOpportunityAlerts(): void;
export declare function triggerOpportunityCheck(): void;
//# sourceMappingURL=opportunityAlerts.d.ts.map