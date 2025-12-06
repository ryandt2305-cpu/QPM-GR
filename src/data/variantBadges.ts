// Shared variant badge and chip styling definitions for tooltips and journal UI

export interface VariantBadge {
  matches: string[];
  label: string;
  color?: string;
  gradient?: string;
  bold?: boolean;
}

// Letter/color palette inspired by the in-game journal status row
export const VARIANT_BADGES: VariantBadge[] = [
  { matches: ['Normal'], label: 'N', color: '#FFFFFF', bold: true },
  { matches: ['Rainbow'], label: 'R', gradient: 'linear-gradient(120deg, #ff8a80, #ffd180, #80d8ff, #b388ff)', bold: true },
  { matches: ['Gold', 'Golden'], label: 'G', color: '#FFB300', bold: true },
  { matches: ['Wet'], label: 'W', color: '#4DBEFA' },
  { matches: ['Chilled'], label: 'C', color: '#96F6FF' },
  { matches: ['Frozen'], label: 'F', color: '#00BCD4' },
  { matches: ['Dawnlit'], label: 'D', color: '#a463ff' },
  { matches: ['Dawncharged', 'Dawnbound'], label: 'D', color: '#7e00fc', bold: true },
  { matches: ['Amberlit', 'Ambershine'], label: 'A', color: '#FFA726' },
  { matches: ['Ambercharged', 'Amberbound'], label: 'A', color: '#FFA726', bold: true },
  { matches: ['Max Weight', 'Max'], label: 'S', color: '#BDBDBD', bold: true },
];

const collectedTextColors: Record<string, string> = {
  normal: '#111111',
  rainbow: '#111111',
  gold: '#ffffff',
  golden: '#ffffff',
  wet: '#04233A',
  chilled: '#05323D',
  frozen: '#ffffff',
  dawnlit: '#ffffff',
  dawncharged: '#ffffff',
  dawnbound: '#ffffff',
  amberlit: '#ffffff',
  ambershine: '#ffffff',
  ambercharged: '#ffffff',
  amberbound: '#ffffff',
  max: '#ffffff',
  'max weight': '#ffffff',
};

function normalizeVariantName(name: string): string {
  return name.trim().toLowerCase();
}

export function findVariantBadge(variant: string): VariantBadge | undefined {
  const target = normalizeVariantName(variant);
  return VARIANT_BADGES.find(badge =>
    badge.matches.some(match => normalizeVariantName(match) === target)
  );
}

export function getVariantChipColors(variant: string, collected: boolean): { bg: string; text: string; weight: 400 | 600 } {
  const badge = findVariantBadge(variant);
  if (!badge) {
    return {
      bg: collected ? '#4CAF50' : '#333',
      text: collected ? '#fff' : '#777',
      weight: collected ? 600 : 400,
    };
  }

  const normalized = normalizeVariantName(variant);
  const textColor = collectedTextColors[normalized] || '#111111';

  if (!collected) {
    return {
      bg: '#333',
      text: '#777',
      weight: 400,
    };
  }

  return {
    bg: badge.gradient || badge.color || '#4CAF50',
    text: badge.gradient ? '#111111' : textColor,
    weight: 600,
  };
}
