import { addStyle, getGameHudRoot } from '../utils/dom';
import { log } from '../utils/logger';
import { pageWindow } from '../core/pageContext';
import type { GardenSnapshot } from '../features/gardenBridge';

const OVERLAY_STYLE_ID = 'qpm-garden-overlay-styles';
const OVERLAY_LAYER_ID = 'qpm-garden-overlay';
const CONTAINER_ANCHOR_CLASS = 'qpm-garden-overlay-anchor';

const GARDEN_CONTAINER_SELECTORS = [
  '#App > div.McFlex.css-1k630i1',
  '#App > div.McFlex.css-neeqas',
  '#App > div.McFlex > div.McFlex > div.McFlex',
  '#App [data-tm-garden-root]',
  '#App [data-tm-garden-canvas]',
];

const OVERLAY_DISABLED = true;

const HIGHLIGHT_COLORS = {
  rainbow: { fill: 'rgba(255, 99, 255, 0.35)', stroke: 'rgba(255, 255, 255, 0.85)', glow: 'rgba(255, 180, 255, 0.55)' },
  gold: { fill: 'rgba(255, 215, 0, 0.32)', stroke: 'rgba(255, 235, 145, 0.9)', glow: 'rgba(255, 220, 60, 0.6)' },
  frozen: { fill: 'rgba(135, 217, 255, 0.35)', stroke: 'rgba(211, 244, 255, 0.9)', glow: 'rgba(120, 199, 255, 0.55)' },
  chilled: { fill: 'rgba(160, 200, 255, 0.32)', stroke: 'rgba(220, 235, 255, 0.8)', glow: 'rgba(150, 200, 255, 0.5)' },
  wet: { fill: 'rgba(110, 205, 255, 0.3)', stroke: 'rgba(195, 240, 255, 0.85)', glow: 'rgba(90, 195, 255, 0.45)' },
  dawn: { fill: 'rgba(255, 165, 95, 0.3)', stroke: 'rgba(255, 215, 170, 0.85)', glow: 'rgba(255, 175, 110, 0.55)' },
  amber: { fill: 'rgba(255, 175, 35, 0.32)', stroke: 'rgba(255, 225, 160, 0.85)', glow: 'rgba(255, 180, 60, 0.55)' },
  default: { fill: 'rgba(0, 210, 255, 0.25)', stroke: 'rgba(255, 255, 255, 0.75)', glow: 'rgba(0, 210, 255, 0.45)' },
} as const satisfies Record<string, { fill: string; stroke: string; glow: string }>;

type HighlightPalette = (typeof HIGHLIGHT_COLORS)[keyof typeof HIGHLIGHT_COLORS];

interface HighlightDescriptor {
  tileId: string;
  slotIndex: number;
  species: string;
  mutations: string[];
}

interface LayoutMetrics {
  cols: number;
  rows: number;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  scaleX: number;
  scaleY: number;
}

interface CanvasMetrics {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

type MaybeNumber = number | null;

function cloneHighlightDescriptors(source: HighlightDescriptor[]): HighlightDescriptor[] {
  return source.map((entry) => ({
    tileId: entry.tileId,
    slotIndex: entry.slotIndex,
    species: entry.species,
    mutations: [...entry.mutations],
  }));
}

let overlayLayer: HTMLDivElement | null = null;
const overlayMarkers = new Map<string, HTMLDivElement>();
let overlayContainer: HTMLElement | null = null;
let gardenCanvas: HTMLCanvasElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let lastSignature = '';
let lastDevicePixelRatio = typeof pageWindow.devicePixelRatio === 'number' ? pageWindow.devicePixelRatio : 1;
let lastLayout: LayoutMetrics | null = null;
let unavailableLogged = false;
let canvasUnavailableLogged = false;
let lastCanvasMetrics: CanvasMetrics | null = null;
let observedCanvas: HTMLCanvasElement | null = null;
let canvasMutationObserver: MutationObserver | null = null;
let canvasMonitorTimer: number | null = null;
let lastCanvasRect: DOMRect | null = null;
let pendingRenderHandle: number | null = null;
let pendingForceLayout = false;
let lastHighlights: HighlightDescriptor[] = [];
let lastSnapshotForOverlay: GardenSnapshot | null = null;

const targetDocument = ((pageWindow as typeof window).document ?? document) as Document;

function ensureStyles(): void {
  if (targetDocument.getElementById(OVERLAY_STYLE_ID)) return;
  addStyle(`
    .${CONTAINER_ANCHOR_CLASS} {
      position: relative !important;
    }

    #${OVERLAY_LAYER_ID} {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 12;
      mix-blend-mode: screen;
      transition: opacity 120ms ease;
      opacity: 0;
    }

    #${OVERLAY_LAYER_ID}.is-visible {
      opacity: 1;
    }

    #${OVERLAY_LAYER_ID} .qpm-garden-marker {
      position: absolute;
      border-radius: 10px;
      border: 2px solid rgba(255, 255, 255, 0.85);
      box-shadow: 0 0 18px rgba(0, 210, 255, 0.45);
      background: rgba(0, 210, 255, 0.15);
      pointer-events: none;
      transform: translateZ(0);
    }

    #${OVERLAY_LAYER_ID} .qpm-garden-marker::after {
      content: '';
      position: absolute;
      inset: 12%;
      border-radius: inherit;
      border: 2px solid currentColor;
      opacity: 0.75;
      box-shadow: 0 0 8px currentColor;
    }
  `).id = OVERLAY_STYLE_ID;
}

function findGardenContainer(): HTMLElement | null {
  const canvasSelector = 'canvas.QuinoaCanvas, canvas.GroundCanvas, canvas.WeatherCanvas, canvas.WeatherScrimCanvas';
  const primaryCanvas = targetDocument.querySelector<HTMLCanvasElement>(canvasSelector);
  if (primaryCanvas && primaryCanvas.parentElement instanceof HTMLElement) {
    return primaryCanvas.parentElement;
  }

  for (const selector of GARDEN_CONTAINER_SELECTORS) {
    const node = targetDocument.querySelector<HTMLElement>(selector);
    if (node) return node;
  }

  const hudRoot = getGameHudRoot();
  if (hudRoot) {
    const canvases = Array.from(hudRoot.querySelectorAll('canvas')) as HTMLCanvasElement[];
    const largeCanvas = canvases
      .map((canvas) => ({ canvas, rect: canvas.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 300 && rect.height >= 200)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))
      .map(({ canvas }) => canvas)[0];

    if (largeCanvas?.parentElement instanceof HTMLElement) {
      return largeCanvas.parentElement;
    }
  }
  return null;
}

function ensureCanvasObservers(): void {
  if (!gardenCanvas) return;

  if (!canvasMutationObserver) {
    canvasMutationObserver = new MutationObserver(() => {
      requestOverlayRender(true);
    });
  }
  canvasMutationObserver.disconnect();
  canvasMutationObserver.observe(gardenCanvas, { attributes: true, attributeFilter: ['style', 'class'] });

  if (canvasMonitorTimer == null) {
    const handle = pageWindow.setInterval(() => {
      if (!gardenCanvas) {
        if (canvasMonitorTimer != null) {
          pageWindow.clearInterval(canvasMonitorTimer);
          canvasMonitorTimer = null;
        }
        return;
      }

      const rect = gardenCanvas.getBoundingClientRect();
      if (!lastCanvasRect) {
        lastCanvasRect = rect;
        return;
      }

      const deltaLeft = Math.abs(rect.left - lastCanvasRect.left);
      const deltaTop = Math.abs(rect.top - lastCanvasRect.top);
      const deltaWidth = Math.abs(rect.width - lastCanvasRect.width);
      const deltaHeight = Math.abs(rect.height - lastCanvasRect.height);
      if (deltaLeft > 0.5 || deltaTop > 0.5 || deltaWidth > 0.5 || deltaHeight > 0.5) {
        lastCanvasRect = rect;
        requestOverlayRender(true);
      }
    }, 120);
    canvasMonitorTimer = handle as unknown as number;
  } else if (gardenCanvas) {
    lastCanvasRect = gardenCanvas.getBoundingClientRect();
  }
}

function requestOverlayRender(forceLayout = false): void {
  if (!overlayLayer) return;

  pendingForceLayout = pendingForceLayout || forceLayout;
  if (pendingRenderHandle != null) {
    return;
  }

  pendingRenderHandle = pageWindow.requestAnimationFrame(() => {
    const shouldForceLayout = pendingForceLayout;
    pendingForceLayout = false;
    pendingRenderHandle = null;

    if (!overlayLayer) {
      return;
    }

    if (shouldForceLayout) {
      lastLayout = null;
    }
    scheduleCanvasResize(shouldForceLayout);

    if (lastHighlights.length === 0) {
      clearGardenHighlightOverlay();
      return;
    }

    const layout = resolveLayout(lastSnapshotForOverlay);
    if (!layout) {
      return;
    }

    drawHighlights(lastHighlights, layout);
  });
}

function teardownOverlay(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  canvasMutationObserver?.disconnect();
  canvasMutationObserver = null;
  if (canvasMonitorTimer != null) {
    pageWindow.clearInterval(canvasMonitorTimer);
    canvasMonitorTimer = null;
  }
  lastCanvasRect = null;
  if (pendingRenderHandle != null) {
    pageWindow.cancelAnimationFrame(pendingRenderHandle);
    pendingRenderHandle = null;
  }
  pendingForceLayout = false;

  overlayMarkers.clear();
  overlayLayer?.remove();
  overlayLayer = null;
  if (overlayContainer) {
    overlayContainer.classList.remove(CONTAINER_ANCHOR_CLASS);
  }
  overlayContainer = null;
  gardenCanvas = null;
  observedCanvas = null;
  lastLayout = null;
  lastSignature = '';
  lastCanvasMetrics = null;
  lastHighlights = [];
  lastSnapshotForOverlay = null;
}

function ensureOverlay(): boolean {
  if (OVERLAY_DISABLED) {
    return false;
  }

  ensureStyles();

  const container = findGardenContainer();
  if (!container) {
    if (!unavailableLogged) {
      unavailableLogged = true;
      log('⚠️ Garden overlay container not found');
    }
    return false;
  }
  unavailableLogged = false;

  if (overlayContainer && container !== overlayContainer) {
    teardownOverlay();
  }

  overlayContainer = container;

  const computed = pageWindow.getComputedStyle(container);
  if (computed.position === 'static') {
    container.classList.add(CONTAINER_ANCHOR_CLASS);
  }

  const canvas = findGardenCanvas(container);
  if (!canvas) {
    if (!canvasUnavailableLogged) {
      canvasUnavailableLogged = true;
      log('⚠️ Garden render canvas not found');
    }
    return false;
  }
  canvasUnavailableLogged = false;

  if (gardenCanvas && canvas !== gardenCanvas && resizeObserver) {
    resizeObserver.unobserve(gardenCanvas);
  }
  gardenCanvas = canvas;

  if (!overlayLayer) {
    overlayLayer = targetDocument.createElement('div');
    overlayLayer.id = OVERLAY_LAYER_ID;
    overlayLayer.className = '';
    container.appendChild(overlayLayer);

    resizeObserver = new ResizeObserver(() => {
      lastLayout = null;
      scheduleCanvasResize(true);
      requestOverlayRender(true);
    });
    resizeObserver.observe(container);
  }

  if (resizeObserver && gardenCanvas && observedCanvas !== gardenCanvas) {
    if (observedCanvas) {
      resizeObserver.unobserve(observedCanvas);
    }
    resizeObserver.observe(gardenCanvas);
    observedCanvas = gardenCanvas;
  }

  ensureCanvasObservers();

  scheduleCanvasResize(true);

  return !!overlayLayer;
}

function scheduleCanvasResize(force = false): void {
  if (!overlayLayer || !overlayContainer) return;

  const metrics = measureCanvasMetrics();
  if (!metrics) return;

  const dpr = typeof pageWindow.devicePixelRatio === 'number' ? pageWindow.devicePixelRatio : 1;

  const sizeChanged =
    !lastCanvasMetrics ||
    Math.abs(metrics.width - lastCanvasMetrics.width) > 0.5 ||
    Math.abs(metrics.height - lastCanvasMetrics.height) > 0.5 ||
    Math.abs(metrics.offsetX - lastCanvasMetrics.offsetX) > 0.5 ||
    Math.abs(metrics.offsetY - lastCanvasMetrics.offsetY) > 0.5 ||
    Math.abs(metrics.scaleX - lastCanvasMetrics.scaleX) > 0.01 ||
    Math.abs(metrics.scaleY - lastCanvasMetrics.scaleY) > 0.01 ||
    dpr !== lastDevicePixelRatio;

  if (!force && !sizeChanged) {
    return;
  }

  overlayLayer.style.left = `${metrics.offsetX}px`;
  overlayLayer.style.top = `${metrics.offsetY}px`;
  overlayLayer.style.width = `${metrics.width}px`;
  overlayLayer.style.height = `${metrics.height}px`;

  if (gardenCanvas) {
    const gardenComputed = pageWindow.getComputedStyle(gardenCanvas);
    const transform = gardenComputed.transform;
    overlayLayer.style.transform = transform && transform !== 'none' ? transform : '';
    overlayLayer.style.transformOrigin = gardenComputed.transformOrigin || '0 0';
  }

  lastDevicePixelRatio = dpr;
  lastCanvasMetrics = metrics;
  if (sizeChanged) {
    lastLayout = null;
  }
  if (gardenCanvas) {
    lastCanvasRect = gardenCanvas.getBoundingClientRect();
  }
}

function findGardenCanvas(container: HTMLElement): HTMLCanvasElement | null {
  const canvases = Array.from(container.querySelectorAll('canvas')) as HTMLCanvasElement[];
  if (canvases.length === 0) return null;

  let best: HTMLCanvasElement | null = null;
  let bestArea = 0;
  for (const canvas of canvases) {
    const rect = canvas.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      best = canvas;
      bestArea = area;
    }
  }

  return best ?? canvases[0] ?? null;
}

function measureCanvasMetrics(): CanvasMetrics | null {
  if (!overlayContainer || !gardenCanvas) return null;

  const containerRect = overlayContainer.getBoundingClientRect();
  const canvasRect = gardenCanvas.getBoundingClientRect();
  if (canvasRect.width <= 0 || canvasRect.height <= 0) {
    return null;
  }

  const scale = extractScaleFromTransform(pageWindow.getComputedStyle(gardenCanvas).transform);
  return {
    width: canvasRect.width,
    height: canvasRect.height,
    offsetX: canvasRect.left - containerRect.left,
    offsetY: canvasRect.top - containerRect.top,
    scaleX: scale.scaleX,
    scaleY: scale.scaleY,
  };
}

function extractScaleFromTransform(transform: string | null | undefined): { scaleX: number; scaleY: number } {
  if (!transform || transform === 'none') {
    return { scaleX: 1, scaleY: 1 };
  }

  const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
  if (matrixMatch && matrixMatch[1]) {
    const parts = matrixMatch[1].split(',').map((value) => Number(value.trim()));
    if (parts.length >= 4) {
      return { scaleX: parts[0] || 1, scaleY: parts[3] || 1 };
    }
  }

  const matrix3dMatch = transform.match(/matrix3d\(([^)]+)\)/);
  if (matrix3dMatch && matrix3dMatch[1]) {
    const parts = matrix3dMatch[1].split(',').map((value) => Number(value.trim()));
    if (parts.length >= 16) {
      return { scaleX: parts[0] || 1, scaleY: parts[5] || 1 };
    }
  }

  return { scaleX: 1, scaleY: 1 };
}

function parseTileIndex(tileId: string): MaybeNumber {
  if (!tileId) return null;
  const direct = Number(tileId);
  if (Number.isFinite(direct)) return direct;
  const match = tileId.match(/(\d+)/g);
  if (!match || match.length === 0) return null;
  const fallback = Number(match[match.length - 1]);
  return Number.isFinite(fallback) ? fallback : null;
}

function detectColumns(indices: number[]): MaybeNumber {
  if (!indices.length) return null;
  const counts = new Map<number, number>();
  let streak = 1;
  for (let i = 1; i < indices.length; i += 1) {
    const previous = indices[i - 1];
    const current = indices[i];
    if (previous == null || current == null) {
      streak = 1;
      continue;
    }
    const expected = previous + 1;
    if (current === expected) {
      streak += 1;
    } else {
      counts.set(streak, (counts.get(streak) ?? 0) + 1);
      streak = 1;
    }
  }
  counts.set(streak, (counts.get(streak) ?? 0) + 1);

  let bestStreak: number | null = null;
  let bestCount = 0;
  for (const [value, count] of counts.entries()) {
    if (value <= 1) continue;
    if (count > bestCount) {
      bestCount = count;
      bestStreak = value;
    }
  }
  if (bestStreak) return bestStreak;

  const approx = Math.round(Math.sqrt(indices.length));
  return approx > 0 ? approx : null;
}

function resolveLayout(snapshot: GardenSnapshot | null): LayoutMetrics | null {
  if (!overlayContainer) return null;

  scheduleCanvasResize();

  const metrics = lastCanvasMetrics ?? measureCanvasMetrics();
  if (!metrics) return null;
  const { width, height } = metrics;
  if (width <= 0 || height <= 0) return null;

  if (
    lastLayout &&
    Math.abs(lastLayout.width - width) <= 0.5 &&
    Math.abs(lastLayout.height - height) <= 0.5 &&
    Math.abs(lastLayout.scaleX - metrics.scaleX) <= 0.01 &&
    Math.abs(lastLayout.scaleY - metrics.scaleY) <= 0.01
  ) {
    return lastLayout;
  }

  const gardenInfo = ((pageWindow as unknown) as Record<string, unknown>).gardenInfo as Record<string, unknown> | undefined;
  const metaCols = Number(
    gardenInfo?.garden && typeof (gardenInfo.garden as Record<string, unknown>).cols === 'number'
      ? (gardenInfo.garden as { cols: number }).cols
      : gardenInfo?.map && typeof (gardenInfo.map as Record<string, unknown>).cols === 'number'
        ? (gardenInfo.map as { cols: number }).cols
        : NaN,
  );
  const metaRows = Number(
    gardenInfo?.garden && typeof (gardenInfo.garden as Record<string, unknown>).rows === 'number'
      ? (gardenInfo.garden as { rows: number }).rows
      : gardenInfo?.map && typeof (gardenInfo.map as Record<string, unknown>).rows === 'number'
        ? (gardenInfo.map as { rows: number }).rows
        : NaN,
  );

  let cols = Number.isFinite(metaCols) && metaCols > 0 ? metaCols : null;
  let rows = Number.isFinite(metaRows) && metaRows > 0 ? metaRows : null;

  const tileObjects = snapshot?.tileObjects;
  if ((!cols || !rows) && tileObjects && typeof tileObjects === 'object') {
    const keys = Object.keys(tileObjects);
    const indices = keys
      .map(parseTileIndex)
      .filter((value): value is number => value != null && Number.isFinite(value))
      .sort((a, b) => a - b);

    if (!cols) {
      cols = detectColumns(indices);
    }
    if (!rows && cols) {
      const maxIndex = indices.length ? indices[indices.length - 1] : null;
      if (maxIndex != null) {
        rows = Math.ceil((maxIndex + 1) / cols);
      }
      if (!rows) {
        const estimated = Math.round((height / Math.max(width, 1)) * cols);
        rows = Math.max(1, estimated || cols);
      }
    }
  }

  if (!cols || !rows || cols <= 0 || rows <= 0) {
    return null;
  }

  const tileWidth = width / cols;
  const tileHeight = height / rows;

  lastLayout = {
    cols,
    rows,
    width,
    height,
    tileWidth,
    tileHeight,
    scaleX: metrics.scaleX,
    scaleY: metrics.scaleY,
  };
  return lastLayout;
}

function baseColorForHighlight(descriptor: HighlightDescriptor): HighlightPalette {
  const { mutations } = descriptor;
  if (!mutations || mutations.length === 0) return HIGHLIGHT_COLORS.default;

  const normalized = mutations.map((mutation) => mutation.trim().toLowerCase());

  if (normalized.some((m) => m.includes('rainbow'))) return HIGHLIGHT_COLORS.rainbow;
  if (normalized.some((m) => m.includes('gold'))) return HIGHLIGHT_COLORS.gold;
  if (normalized.some((m) => m.includes('frozen'))) return HIGHLIGHT_COLORS.frozen;
  if (normalized.some((m) => m.includes('chilled'))) return HIGHLIGHT_COLORS.chilled;
  if (normalized.some((m) => m.includes('wet'))) return HIGHLIGHT_COLORS.wet;
  if (normalized.some((m) => m.includes('dawn'))) return HIGHLIGHT_COLORS.dawn;
  if (normalized.some((m) => m.includes('amber'))) return HIGHLIGHT_COLORS.amber;
  return HIGHLIGHT_COLORS.default;
}

function drawHighlights(highlights: HighlightDescriptor[], layout: LayoutMetrics): void {
  if (!overlayLayer) return;

  const activeKeys = new Set<string>();
  const minDimension = Math.min(layout.tileWidth, layout.tileHeight);
  const baseBorder = Math.max(2, Math.round(minDimension * 0.08));
  const glowSize = Math.round(minDimension * 0.65);

  for (const highlight of highlights) {
    const tileIndex = parseTileIndex(highlight.tileId);
    if (tileIndex == null) continue;

    const col = tileIndex % layout.cols;
    const row = Math.floor(tileIndex / layout.cols);
    if (row >= layout.rows) continue;

    const margin = Math.max(2, minDimension * 0.12);
    const x = col * layout.tileWidth + margin;
    const y = row * layout.tileHeight + margin;
    const width = Math.max(2, layout.tileWidth - margin * 2);
    const height = Math.max(2, layout.tileHeight - margin * 2);

  const key = `${highlight.tileId}:${highlight.slotIndex}`;
    activeKeys.add(key);

    const palette = baseColorForHighlight(highlight);

    let marker = overlayMarkers.get(key);
    if (!marker) {
      marker = targetDocument.createElement('div');
      marker.className = 'qpm-garden-marker';
      marker.dataset.tileId = highlight.tileId;
      marker.dataset.slotIndex = String(highlight.slotIndex);
      overlayMarkers.set(key, marker);
      overlayLayer.appendChild(marker);
    }

    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
    marker.style.width = `${width}px`;
    marker.style.height = `${height}px`;
    const border = Math.max(1, Math.min(baseBorder, Math.floor(Math.min(width, height) / 3)));
    marker.style.borderWidth = `${border}px`;
    marker.style.backgroundColor = palette.fill;
    marker.style.borderColor = palette.stroke;
    marker.style.color = palette.stroke;
    marker.style.boxShadow = `0 0 ${glowSize}px ${palette.glow}`;
    const radius = Math.max(6, Math.round(Math.min(width, height) * 0.22));
    marker.style.borderRadius = `${radius}px`;
    marker.style.opacity = '1';
  }

  for (const [key, marker] of overlayMarkers.entries()) {
    if (!activeKeys.has(key)) {
      marker.remove();
      overlayMarkers.delete(key);
    }
  }

  overlayLayer.classList.toggle('is-visible', overlayMarkers.size > 0);
}

export function updateGardenHighlightOverlay(
  highlights: HighlightDescriptor[],
  snapshot: GardenSnapshot | null,
): boolean {
  try {
    if (OVERLAY_DISABLED) {
      const signature = highlights
        .map((entry) => `${entry.tileId}:${entry.slotIndex}:${entry.species}:${entry.mutations.join(',')}`)
        .join('|');
      if (signature !== lastSignature) {
        lastSignature = signature;
        lastHighlights = cloneHighlightDescriptors(highlights);
        lastSnapshotForOverlay = snapshot;
        if (highlights.length === 0) {
          clearGardenHighlightOverlay();
        }
      }
      return true;
    }

    if (!ensureOverlay() || !overlayLayer) {
      return false;
    }

    scheduleCanvasResize();

    const signature = highlights
      .map((entry) => `${entry.tileId}:${entry.slotIndex}:${entry.species}:${entry.mutations.join(',')}`)
      .join('|');
    if (signature === lastSignature && overlayLayer.classList.contains('is-visible') && lastLayout) {
      lastHighlights = cloneHighlightDescriptors(highlights);
      lastSnapshotForOverlay = snapshot;
      return true;
    }
    lastSignature = signature;

    if (highlights.length === 0) {
      lastHighlights = [];
      lastSnapshotForOverlay = snapshot;
      clearGardenHighlightOverlay();
      return true;
    }

    const layout = resolveLayout(snapshot);
    if (!layout) {
      if (!unavailableLogged) {
        unavailableLogged = true;
        log('⚠️ Unable to compute garden layout for overlay rendering');
      }
      return false;
    }

    unavailableLogged = false;
    lastHighlights = cloneHighlightDescriptors(highlights);
    lastSnapshotForOverlay = snapshot;
    drawHighlights(highlights, layout);
    return true;
  } catch (error) {
    log('⚠️ Garden highlight overlay update failed', error);
    return false;
  }
}

export function clearGardenHighlightOverlay(): void {
  lastSignature = '';
  lastHighlights = [];
  lastSnapshotForOverlay = null;
  if (OVERLAY_DISABLED) {
    overlayMarkers.clear();
    return;
  }
  for (const marker of overlayMarkers.values()) {
    marker.remove();
  }
  overlayMarkers.clear();
  overlayLayer?.classList.remove('is-visible');
}

export function disposeGardenHighlightOverlay(): void {
  if (OVERLAY_DISABLED) {
    lastSignature = '';
    lastHighlights = [];
    lastSnapshotForOverlay = null;
    overlayMarkers.clear();
    return;
  }
  teardownOverlay();
}
