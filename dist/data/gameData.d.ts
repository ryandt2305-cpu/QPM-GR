/**
 * Pet Ability Count Probabilities
 * Determines how many abilities a pet will have based on max ability slots
 */
export declare const PET_ABILITY_PROBABILITIES: {
    /** Pets with 1 ability slot always have 1 ability */
    readonly oneAbilitySlot: {
        readonly 1: 1;
    };
    /** Pets with 2 ability slots */
    readonly twoAbilitySlots: {
        readonly 1: 0.9;
        readonly 2: 0.1;
    };
    /** Pets with 3 ability slots */
    readonly threeAbilitySlots: {
        readonly 1: 0.7;
        readonly 2: 0.29;
        readonly 3: 0.01;
    };
    /** Pets with 4 ability slots */
    readonly fourAbilitySlots: {
        readonly 2: 0.99;
        readonly 3: 0.01;
    };
};
/**
 * Special Pet Hatch Rates (overlays)
 */
export declare const SPECIAL_PET_RATES: {
    readonly rainbow: 0.001;
    readonly golden: 0.01;
};
/**
 * Pet Species Rates by Egg Type
 */
export declare const EGG_PET_RATES: {
    readonly Common: {
        readonly Worm: 0.6;
        readonly Snail: 0.35;
        readonly Bee: 0.05;
    };
    readonly Uncommon: {
        readonly Chicken: 0.65;
        readonly Bunny: 0.25;
        readonly Dragonfly: 0.1;
    };
    readonly Rare: {
        readonly Pig: 0.9;
        readonly Cow: 0.1;
    };
    readonly Legendary: {
        readonly Turtle: 0.3;
        readonly Goat: 0.1;
        readonly Squirrel: 0.6;
    };
    readonly Mythical: {
        readonly Capybara: 0.05;
        readonly Butterfly: 0.75;
        readonly Peacock: 0.2;
    };
};
/**
 * Pet Species Ability Pools
 * Maps pet species to their possible abilities
 */
export declare const PET_ABILITY_POOLS: {
    readonly Worm: readonly ["Seed Finder I", "Produce Eater"];
    readonly Snail: readonly ["Coin Finder I"];
    readonly Bee: readonly ["Produce Size Boost I", "Mutation I"];
    readonly Chicken: readonly ["Egg Growth Boost I", "Pet Refund"];
    readonly Bunny: readonly ["Coin Finder II", "Sell Boost I"];
    readonly Dragonfly: readonly ["Hunger Restore I", "Pet Mutation Boost I"];
    readonly Pig: readonly ["Sell Boost II", "Hatch XP Boost I", "Max Strength I"];
    readonly Cow: readonly ["Seed Finder II", "Hunger Boost I", "Plant Growth I"];
    readonly Turtle: readonly ["Hunger Restore II", "Hunger Boost II", "Egg Growth II", "Plant Growth II"];
    readonly Goat: readonly ["XP Boost", "Hatch XP Boost II", "Max Strength II"];
    readonly Squirrel: readonly ["Pet Mutation Boost II", "Coin Finder III", "Sell Boost III"];
    readonly Capybara: readonly ["Produce Refund", "Double Harvest"];
    readonly Butterfly: readonly ["Crop Size Boost II", "Produce Mutation II", "Seed Finder III"];
    readonly Peacock: readonly ["Sell Boost IV", "XP Boost II", "Pet Refund II"];
};
/**
 * Weather Event Timing and Probabilities
 */
export declare const WEATHER_EVENT_TIMING: {
    /** Regular weather events (Rain/Snow) */
    readonly regular: {
        readonly intervalMin: 20;
        readonly intervalMax: 35;
        readonly durationMinutes: 5;
        readonly chances: {
            readonly rain: 0.75;
            readonly snow: 0.25;
        };
    };
    /** Lunar weather events (Dawn/Harvest Moon) */
    readonly lunar: {
        readonly intervalHours: 4;
        readonly durationMinutes: 10;
        readonly startTimeAEST: "12:00 AM";
        readonly chances: {
            readonly dawn: 0.67;
            readonly harvestMoon: 0.33;
        };
    };
};
/**
 * Calculate next lunar event time from AEST midnight
 * Lunar events occur every 4 hours from 12AM AEST
 */
export declare function getNextLunarEventTime(): Date;
/**
 * Weather Effect Mechanics
 * NOTE: Only fully mature crops get weather bonuses
 */
export declare const WEATHER_EFFECT_NOTES: {
    readonly requirement: "Only fully mature crops get weather bonuses";
    readonly recommendation: "Plan harvest and mutation timing around events for best results";
};
/**
 * Mutation Chances
 */
export declare const MUTATION_CHANCES: {
    /** Base chance for lunar mutations per crop during lunar events */
    readonly lunarBase: 0.01;
    /** Can be boosted by Crop Mutation Boost I & II abilities */
    /** Dawncharged/Ambercharged mutation chance */
    readonly charged: {
        readonly requirement: "Place lit crop next to Moonbinder/Dawnbinder during respective weather";
        readonly chancePerMinute: 0.25;
    };
};
/**
 * Crop Tier Classification (based on shop availability)
 * Higher tier = lower quantity and appearance rate in shop
 */
export type CropTier = 'common' | 'uncommon' | 'rare' | 'mythic' | 'divine' | 'celestial';
/**
 * Get estimated time to complete variant based on difficulty
 */
export declare function getVariantTimeEstimate(difficulty: 'easy' | 'medium' | 'hard' | 'very-hard'): string;
/**
 * Expected eggs needed to get specific abilities
 */
export declare const EXPECTED_EGGS_FOR_ABILITIES: {
    readonly rainbowGranter: 10000;
    readonly goldGranter: 1000;
};
//# sourceMappingURL=gameData.d.ts.map