import { log } from './logger';
import { getPetSpriteCanvas } from './spriteExtractor';

export type MutationSpriteType = 'rainbow' | 'gold';

interface MutationEffectConfig {
  blendMode: GlobalCompositeOperation;
  colors: string[];
  alpha?: number;
  gradientAngle?: number;
  masked?: boolean;
}

const MUTATION_EFFECTS: Record<MutationSpriteType, MutationEffectConfig> = {
  rainbow: {
    blendMode: 'color',
    colors: ['#FF1744', '#FF9100', '#FFEA00', '#00E676', '#2979FF', '#D500F9'],
    gradientAngle: 130,
    masked: true,
  },
  gold: {
    blendMode: 'source-atop',
    colors: ['rgb(255, 215, 0)'],
    alpha: 0.7,
  },
};

const mutationSpriteCache = new Map<string, string>();
const missingCanvasWarnings = new Set<string>();

export function getMutationSpriteDataUrl(species: string, mutation: MutationSpriteType): string | null {
  const normalizedSpecies = normalizeSpeciesKey(species);
  const normalizedMutation = mutation.toLowerCase() as MutationSpriteType;
  const cacheKey = `${normalizedSpecies}::${normalizedMutation}`;

  const cached = mutationSpriteCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const baseCanvas = getPetSpriteCanvas(normalizedSpecies);
  if (!baseCanvas) {
    warnMissingCanvas(normalizedSpecies);
    return null;
  }

  const config = MUTATION_EFFECTS[normalizedMutation];
  if (!config) {
    return null;
  }

  try {
    const mutatedCanvas = renderMutationSprite(baseCanvas, config) ?? baseCanvas;
    const dataUrl = mutatedCanvas.toDataURL('image/png');
    mutationSpriteCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (error) {
    log('⚠️ Failed to render mutation sprite', error);
    return null;
  }
}

function renderMutationSprite(baseCanvas: HTMLCanvasElement, config: MutationEffectConfig): HTMLCanvasElement | null {
  if (!canUseCanvas()) {
    return null;
  }

  const width = baseCanvas.width;
  const height = baseCanvas.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.drawImage(baseCanvas, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = config.blendMode;
  if (typeof config.alpha === 'number') {
    ctx.globalAlpha = config.alpha;
  }

  if (config.masked) {
    const overlay = buildMaskedOverlay(baseCanvas, config);
    if (overlay) {
      ctx.drawImage(overlay, 0, 0);
    }
  } else {
    applyFill(ctx, config, width, height);
  }

  ctx.restore();
  return canvas;
}

function buildMaskedOverlay(baseCanvas: HTMLCanvasElement, config: MutationEffectConfig): HTMLCanvasElement | null {
  const canvas = createCanvas(baseCanvas.width, baseCanvas.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  applyFill(ctx, config, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(baseCanvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

function applyFill(ctx: CanvasRenderingContext2D, config: MutationEffectConfig, width: number, height: number): void {
  if (!config.colors.length) {
    return;
  }

  if (config.colors.length === 1) {
    ctx.fillStyle = config.colors[0] ?? '#ffffff';
  } else {
    const gradient = createLinearGradient(ctx, config.gradientAngle ?? 0, width, height);
    const divisor = Math.max(1, config.colors.length - 1);
    config.colors.forEach((color, index) => {
      gradient.addColorStop(index / divisor, color);
    });
    ctx.fillStyle = gradient;
  }

  ctx.fillRect(0, 0, width, height);
}

function createLinearGradient(
  ctx: CanvasRenderingContext2D,
  angle: number,
  width: number,
  height: number,
): CanvasGradient {
  const radians = (angle - 90) * (Math.PI / 180);
  const centerX = width / 2;
  const centerY = height / 2;
  const halfDiagonal = Math.sqrt(width * width + height * height) / 2;
  const x1 = centerX - Math.cos(radians) * halfDiagonal;
  const y1 = centerY - Math.sin(radians) * halfDiagonal;
  const x2 = centerX + Math.cos(radians) * halfDiagonal;
  const y2 = centerY + Math.sin(radians) * halfDiagonal;
  return ctx.createLinearGradient(x1, y1, x2, y2);
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canUseCanvas(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function normalizeSpeciesKey(value: string): string {
  return (value ?? '').toLowerCase();
}

function warnMissingCanvas(species: string): void {
  if (missingCanvasWarnings.has(species)) {
    return;
  }
  missingCanvasWarnings.add(species);
  log(`⚠️ Missing base sprite for ${species} while generating mutation variant.`);
}
