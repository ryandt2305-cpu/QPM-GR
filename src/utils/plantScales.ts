// src/utils/plantScales.ts
// Normalized maximum scale per produce species, derived from Magic Garden data.
// Values mirror the crop maxScale values used by Aries' MGTools dataset.

const PLANT_MAX_SCALE: Record<string, number> = {
  // maxScale = maxWeight / baseWeight (from cropBaseStats.ts)
  carrot: 3,              // 0.3 / 0.1 = 3
  strawberry: 2,          // 0.1 / 0.05 = 2
  aloe: 2.5,              // 3.75 / 1.5 = 2.5
  delphinium: 3,          // 0.06 / 0.02 = 3
  blueberry: 2,           // 0.02 / 0.01 = 2
  apple: 2,               // 0.36 / 0.18 = 2
  appletree: 2,
  tulip: 3,               // 0.03 / 0.01 = 3
  orangetulip: 3,
  tomato: 2,              // 0.6 / 0.3 = 2
  daffodil: 3,            // 0.03 / 0.01 = 3
  corn: 2,                // 2.4 / 1.2 = 2
  cornkernel: 2,
  watermelon: 3,          // 13.5 / 4.5 = 3
  pumpkin: 3,             // 18.0 / 6.0 = 3
  echeveria: 2.75,        // 2.2 / 0.8 = 2.75
  echeveriacutting: 2.75,
  coconut: 3,             // 15.0 / 5.0 = 3
  coconuttree: 3,
  banana: 1.7,            // 0.204 / 0.12 = 1.7
  lily: 2.75,             // 0.055 / 0.02 = 2.75
  camellia: 2.5,          // 0.75 / 0.3 = 2.5
  squash: 2.5,            // 0.75 / 0.3 = 2.5
  burrostail: 2.5,        // 1.0 / 0.4 = 2.5
  burrostailcutting: 2.5,
  mushroom: 3.5,          // 87.5 / 25.0 = 3.5
  mushroomspore: 3.5,
  cactus: 1.8,            // 2700 / 1500 = 1.8
  bamboo: 2,              // 2.0 / 1.0 = 2
  bambooshoot: 2,
  chrysanthemum: 2.75,    // 0.0275 / 0.01 = 2.75
  grape: 2,               // 6.0 / 3.0 = 2
  pepper: 2,              // 1.0 / 0.5 = 2
  lemon: 3,               // 1.5 / 0.5 = 3
  lemontree: 3,
  passionfruit: 2,        // 19.0 / 9.5 = 2
  passion: 2,
  dragonfruit: 2.024,     // 17.0 / 8.4 ≈ 2.024
  dragon: 2.024,
  lychee: 2,              // 18.0 / 9.0 = 2
  lycheepit: 2,
  sunflower: 2.5,         // 25.0 / 10.0 = 2.5
  starweaver: 2,          // 20.0 / 10.0 = 2
  starweaverpod: 2,
  starweaverfruit: 2,
  dawnbinder: 2.5,        // 15.0 / 6.0 = 2.5
  dawncelestial: 2.5,
  dawnbinderpod: 2.5,
  dawnbinderbulb: 2.5,
  moonbinder: 2,          // 4.0 / 2.0 = 2
  mooncelestial: 2,
  moonbinderpod: 2,
  moonbinderbulb: 2,
};

export function lookupMaxScale(normalizedKey: string): number | null {
  const value = PLANT_MAX_SCALE[normalizedKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getKnownPlantKeys(): string[] {
  return Object.keys(PLANT_MAX_SCALE);
}
