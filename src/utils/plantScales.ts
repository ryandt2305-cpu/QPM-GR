// src/utils/plantScales.ts
// Normalized maximum scale per produce species, derived from Magic Garden data.
// Values mirror the crop maxScale values used by Aries' MGTools dataset.

const PLANT_MAX_SCALE: Record<string, number> = {
  carrot: 3,
  strawberry: 2,
  aloe: 2.5,
  delphinium: 3,
  blueberry: 2,
  apple: 2,
  appletree: 2,
  orangetulip: 3,
  tulip: 3,
  tomato: 2,
  daffodil: 3,
  corn: 2,
  cornkernel: 2,
  watermelon: 3,
  pumpkin: 3,
  echeveria: 2.75,
  echeveriacutting: 2.75,
  coconut: 3,
  coconuttree: 3,
  banana: 1.7,
  lily: 2.75,
  squash: 2.5,
  burrostail: 2.5,
  burrostailcutting: 2.5,
  mushroom: 3.5,
  mushroomspore: 3.5,
  cactus: 1.8,
  bamboo: 2,
  bambooshoot: 2,
  grape: 2,
  pepper: 2,
  lemon: 3,
  lemontree: 3,
  passion: 2,
  passionfruit: 2,
  dragon: 2,
  dragonfruit: 2,
  lychee: 2,
  lycheepit: 2,
  sunflower: 2.5,
  starweaver: 2,
  starweaverpod: 2,
  dawncelestial: 2.5,
  dawnbinderpod: 2.5,
  dawnbinder: 2.5,
  dawnbinderbulb: 2.5,
  mooncelestial: 2,
  moonbinderpod: 2,
  moonbinder: 2,
  moonbinderbulb: 2,
};

export function lookupMaxScale(normalizedKey: string): number | null {
  const value = PLANT_MAX_SCALE[normalizedKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getKnownPlantKeys(): string[] {
  return Object.keys(PLANT_MAX_SCALE);
}
