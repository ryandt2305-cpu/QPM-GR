// src/utils/cropMultipliers.ts
// Shared helpers for resolving mutation multipliers and keeping alias handling consistent.

export type MutationCategory = 'color' | 'weather' | 'time';

export interface MutationDefinition {
  readonly name: string;
  readonly category: MutationCategory;
  readonly multiplier: number;
  readonly aliases?: readonly string[];
}

export interface MutationEntry {
  readonly definition: MutationDefinition;
  readonly sourceName: string;
}

export interface MutationMultiplierBreakdown {
  readonly color: MutationEntry | null;
  readonly weather: MutationEntry | null;
  readonly time: MutationEntry | null;
  readonly combo: WeatherTimeCombination | null;
  readonly totalMultiplier: number;
}

export interface WeatherTimeCombination {
  readonly weather: MutationDefinition;
  readonly time: MutationDefinition;
  readonly multiplier: number;
}

const COLOR_MUTATIONS: readonly MutationDefinition[] = [
  { name: 'Gold', category: 'color', multiplier: 25, aliases: ['Golden'] },
  { name: 'Rainbow', category: 'color', multiplier: 50 },
];

const WEATHER_MUTATIONS: readonly MutationDefinition[] = [
  { name: 'Wet', category: 'weather', multiplier: 2, aliases: ['Rainy'] },
  { name: 'Chilled', category: 'weather', multiplier: 2 },
  { name: 'Frozen', category: 'weather', multiplier: 10 },
];

const TIME_MUTATIONS: readonly MutationDefinition[] = [
  { name: 'Dawnlit', category: 'time', multiplier: 2, aliases: ['Dawn-lit'] },
  { name: 'Dawnbound', category: 'time', multiplier: 3, aliases: ['Dawn bound'] },
  { name: 'Dawncharged', category: 'time', multiplier: 3, aliases: ['Dawn charged'] },
  { name: 'Amberlit', category: 'time', multiplier: 5, aliases: ['Amber lit'] },
  { name: 'Ambershine', category: 'time', multiplier: 5, aliases: ['Amber shine'] },
  {
    name: 'Amberbound',
    category: 'time',
    multiplier: 6,
    aliases: ['Amber Radiant', 'Amberradiant', 'Amber-radiant', 'Amber radiant'],
  },
  { name: 'Ambercharged', category: 'time', multiplier: 6, aliases: ['Amber charged'] },
];

const ALL_MUTATIONS: readonly MutationDefinition[] = [...COLOR_MUTATIONS, ...WEATHER_MUTATIONS, ...TIME_MUTATIONS];

const WEATHER_TIME_COMBINATIONS: readonly WeatherTimeCombination[] = [
  makeCombo('Wet', 'Dawnlit', 3),
  makeCombo('Chilled', 'Dawnlit', 3),
  makeCombo('Wet', 'Amberlit', 6),
  makeCombo('Chilled', 'Amberlit', 6),
  makeCombo('Wet', 'Ambershine', 6),
  makeCombo('Chilled', 'Ambershine', 6),
  makeCombo('Frozen', 'Dawnlit', 11),
  makeCombo('Frozen', 'Dawnbound', 12),
  makeCombo('Frozen', 'Dawncharged', 12),
  makeCombo('Frozen', 'Amberlit', 14),
  makeCombo('Frozen', 'Ambershine', 14),
  makeCombo('Frozen', 'Amberbound', 15),
  makeCombo('Frozen', 'Ambercharged', 15),
];

const NORMALIZED_LOOKUP: ReadonlyMap<string, MutationDefinition> = buildLookupTable(ALL_MUTATIONS);

function makeCombo(weatherName: string, timeName: string, multiplier: number): WeatherTimeCombination {
  return {
    weather: findDefinition(WEATHER_MUTATIONS, weatherName),
    time: findDefinition(TIME_MUTATIONS, timeName),
    multiplier,
  };
}

function findDefinition(collection: readonly MutationDefinition[], name: string): MutationDefinition {
  const match = collection.find((item) => item.name === name);
  if (!match) {
    throw new Error(`Missing canonical mutation definition for ${name}`);
  }
  return match;
}

function buildLookupTable(definitions: readonly MutationDefinition[]): ReadonlyMap<string, MutationDefinition> {
  const table = new Map<string, MutationDefinition>();

  for (const definition of definitions) {
    table.set(normalizeKey(definition.name), definition);
    if (definition.aliases) {
      for (const alias of definition.aliases) {
        table.set(normalizeKey(alias), definition);
      }
    }
  }

  return table;
}

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeMutationName(input: string | null | undefined): string | null {
  const definition = resolveMutation(input);
  return definition ? definition.name : null;
}

export function resolveMutation(input: string | null | undefined): MutationDefinition | null {
  if (!input) {
    return null;
  }

  const normalized = normalizeKey(input);
  if (!normalized) {
    return null;
  }

  return NORMALIZED_LOOKUP.get(normalized) ?? null;
}

export function classifyMutations(inputs: readonly string[] | null | undefined): {
  colors: MutationEntry[];
  weathers: MutationEntry[];
  times: MutationEntry[];
  unknown: readonly string[];
} {
  const colors: MutationEntry[] = [];
  const weathers: MutationEntry[] = [];
  const times: MutationEntry[] = [];
  const unknown: string[] = [];

  if (!inputs || inputs.length === 0) {
    return { colors, weathers, times, unknown };
  }

  for (const raw of inputs) {
    const definition = resolveMutation(raw);
    if (!definition) {
      unknown.push(raw);
      continue;
    }

    const entry: MutationEntry = { definition, sourceName: raw };
    if (definition.category === 'color') {
      colors.push(entry);
    } else if (definition.category === 'weather') {
      weathers.push(entry);
    } else {
      times.push(entry);
    }
  }

  return { colors, weathers, times, unknown };
}

export function computeMutationMultiplier(inputs: readonly string[] | null | undefined): MutationMultiplierBreakdown {
  if (!inputs || inputs.length === 0) {
    return {
      color: null,
      weather: null,
      time: null,
      combo: null,
      totalMultiplier: 1,
    };
  }

  const { colors, weathers, times } = classifyMutations(inputs);

  const color = pickHighest(colors);
  const weather = pickHighest(weathers);
  const time = pickHighest(times);
  const combo = weather && time ? pickCombo(weather.definition, time.definition) : null;

  const colorValue = color?.definition.multiplier ?? 1;

  let weatherTimeValue = 1;
  if (combo) {
    weatherTimeValue = combo.multiplier;
  } else if (weather && time) {
    weatherTimeValue = Math.max(weather.definition.multiplier, time.definition.multiplier);
  } else if (weather) {
    weatherTimeValue = weather.definition.multiplier;
  } else if (time) {
    weatherTimeValue = time.definition.multiplier;
  }

  return {
    color,
    weather,
    time,
    combo,
    totalMultiplier: colorValue * weatherTimeValue,
  };
}

function pickHighest(entries: readonly MutationEntry[]): MutationEntry | null {
  if (!entries.length) {
    return null;
  }
  return entries.reduce((best, current) => {
    if (!best) {
      return current;
    }
    return current.definition.multiplier > best.definition.multiplier ? current : best;
  }, null as MutationEntry | null);
}

function pickCombo(weather: MutationDefinition, time: MutationDefinition): WeatherTimeCombination | null {
  for (const combo of WEATHER_TIME_COMBINATIONS) {
    if (combo.weather === weather && combo.time === time) {
      return combo;
    }
  }
  return null;
}

export function getAllMutationDefinitions(): readonly MutationDefinition[] {
  return ALL_MUTATIONS;
}

export function getWeatherTimeCombinations(): readonly WeatherTimeCombination[] {
  return WEATHER_TIME_COMBINATIONS;
}
