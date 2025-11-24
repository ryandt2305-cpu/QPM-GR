export declare const RAINBOW_GOLD_BASE_CHANCE_PER_MINUTE = 0.0072;
export interface RainbowGoldEtaInput {
    strengths: number[];
    uncoloredCropCount: number;
}
export interface RainbowGoldEtaResult {
    triggersPerSecond: number;
    expectedTriggers: number;
    expectedSeconds: number;
}
export declare function harmonicNumber(n: number): number;
export declare function rainbowGoldChancePerSecond(strength: number): number;
export declare function estimateRainbowGoldEta(input: RainbowGoldEtaInput): RainbowGoldEtaResult;
export declare const WEATHER_EVENT_CADENCE: {
    rainSnow: {
        windowMinutes: number;
        eventDurationMinutes: number;
        rainChance: number;
        snowChance: number;
    };
    lunar: {
        windowMinutes: number;
        eventDurationMinutes: number;
        dawnChance: number;
        harvestChance: number;
    };
};
export declare const WEATHER_APPLICATION_CHANCES: {
    wet: number;
    chilled: number;
    dawnlit: number;
};
export declare const WEATHER_LUNAR_MULTIPLIERS: {
    base: {
        Golden: number;
        Rainbow: number;
    };
    weather: {
        Wet: number;
        Chilled: number;
        Frozen: number;
    };
    lunar: {
        Dawnlit: number;
        Dawnbound: number;
        Amberlit: number;
        Amberbound: number;
    };
    combined: {
        'Wet+Dawnlit': number;
        'Wet+Amberlit': number;
        'Frozen+Dawnlit': number;
        'Frozen+Dawnbound': number;
        'Frozen+Amberlit': number;
        'Frozen+Amberbound': number;
    };
};
//# sourceMappingURL=gameInfo.d.ts.map