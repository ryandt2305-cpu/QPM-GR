import {
  ensureJotaiStore,
  getAtomByLabel,
  getCapturedInfo,
  readAtomValue,
  writeAtomValue,
} from '../core/jotaiBridge';
import { log } from '../utils/logger';
import { storage } from '../utils/storage';
import { closeWindow, isWindowOpen, toggleWindow } from '../ui/modalWindow';
import { createShopQuadSurface, type ShopQuadPaneMode, type ShopQuadSurfaceHandle } from './shopQuadSurface';

export type ShopQuadModalId = 'seedShop' | 'toolShop' | 'eggShop' | 'decorShop';
export type ShopQuadSpikeOutcome = 'idle' | 'running' | 'passed' | 'failed' | 'blocked';

export interface ShopQuadRunOptions {
  waitForWritableMs?: number;
  pollMs?: number;
}

export interface ShopQuadInteractiveStartOptions extends ShopQuadRunOptions {
  clickActivationDebounceMs?: number;
  snapshotCaptureDebounceMs?: number;
}

export interface ShopQuadArmOptions {
  timeoutMs?: number;
}

export interface ShopQuadModalSpikeConfig {
  enabled: boolean;
  autoOpenLab: boolean;
  interactiveQuadEnabled: boolean;
  clickActivationDebounceMs: number;
  snapshotCaptureDebounceMs: number;
}

export interface ShopQuadModalProbe {
  modalId: ShopQuadModalId;
  opened: boolean;
  liveDetected: boolean;
  snapshotCaptured: boolean;
  visibleModalCount: number | null;
  notes: string[];
}

export interface ShopQuadModalSpikeStatus {
  outcome: ShopQuadSpikeOutcome;
  startedAt: number | null;
  finishedAt: number | null;
  shippingGate: 'clear' | 'paused' | 'unknown';
  summary: string;
  writableStore: boolean;
  activeModalWritable: boolean;
  activeModalAtomFound: boolean;
  storeSource: string | null;
  manualCaptureArmed: boolean;
  manualCaptureReady: boolean;
  manualCaptureMessage: string | null;
  singleModalGateDetected: boolean;
  probes: ShopQuadModalProbe[];
  passCriteria: {
    allFourVisible: boolean;
    allFourInteractive: boolean;
    noFlickerOrStateThrash: boolean;
    stableAcrossRestockCycle: boolean;
  };
  interactiveQuad: {
    enabled: boolean;
    hostMounted: boolean;
    activePane: ShopQuadModalId | null;
    liveModalDetected: boolean;
    lastActivationAt: number | null;
    paneStates: Record<
      ShopQuadModalId,
      {
        isActive: boolean;
        hasSnapshot: boolean;
        isStale: boolean;
        liveDetected: boolean;
        error: string | null;
        mode: ShopQuadPaneMode;
        lastError: string | null;
        lastSnapshotAt: number | null;
      }
    >;
  };
}

export interface ShopQuadRuntimeDiagnostics {
  captured: ReturnType<typeof getCapturedInfo>;
  writableCandidateKeys: string[];
  activeModalAtomFound: boolean;
  manualCapture: {
    armed: boolean;
    ready: boolean;
    capturedAt: number | null;
    message: string | null;
  };
  interactive: {
    running: boolean;
    hostMounted: boolean;
    activePane: ShopQuadModalId | null;
    liveRootConnected: boolean;
    lastPlacementFailure: string | null;
    lastPlacementMetrics: {
      modalId: ShopQuadModalId | null;
      viewport: { left: number; top: number; width: number; height: number } | null;
      baseSize: { width: number; height: number } | null;
      hostMounted: boolean;
      hasSurfaceRect: boolean;
      usedFallbackRect: boolean;
      rootConnected: boolean;
      timestamp: number | null;
    };
  };
}

interface LabPaneRefs {
  panel: HTMLElement;
  badge: HTMLElement;
  note: HTMLElement;
  viewport: HTMLElement;
}

interface LabRefs {
  summary: HTMLElement;
  outcomeBadge: HTMLElement;
  details: HTMLElement;
  panes: Record<ShopQuadModalId, LabPaneRefs>;
  runButton: HTMLButtonElement;
  interactiveButton: HTMLButtonElement;
  interactiveStopButton: HTMLButtonElement;
}

const STORAGE_KEY = 'qpm.shopQuadModalSpike.v1';
const STATUS_EVENT = 'qpm:shop-quad-spike:status';
const WINDOW_ID = 'shop-quad-modal-spike-lab';
const SNAPSHOT_ATTR = 'data-qpm-shop-quad-snapshot';
const MODAL_SETTLE_MS = 360;
const INTERACTIVE_ACTIVATION_SETTLE_MS = 60;
const MODAL_CAPTURE_TIMEOUT_MS = 3_800;
const MODAL_CAPTURE_POLL_MS = 70;
const MODAL_PRIME_RETRY_COUNT = 3;
const QUAD_MODAL_BASE_WIDTH = 600;
const QUAD_MODAL_BASE_HEIGHT = 760;
const RESTORE_SETTLE_MS = 150;
const INTERACTIVE_SYNC_MS = 220;
const INTERACTIVE_RESIZE_DEBOUNCE_MS = 90;
const DEFAULT_WAIT_FOR_WRITABLE_MS = 15_000;
const DEFAULT_WAIT_POLL_MS = 300;
const DEFAULT_ARM_TIMEOUT_MS = 30_000;
const DEFAULT_CLICK_ACTIVATION_DEBOUNCE_MS = 80;
const DEFAULT_SNAPSHOT_CAPTURE_DEBOUNCE_MS = 160;
const SHOP_MODAL_IDS: readonly ShopQuadModalId[] = ['seedShop', 'toolShop', 'eggShop', 'decorShop'];
const STORE_CANDIDATE_KEYS = [
  '__jotaiStore',
  'jotaiStore',
  '__MG_SHARED_JOTAI__',
  '__MGTOOLS_JOTAI_STORE__',
  '__QPM_SHARED_JOTAI__',
  '__QPM_JOTAI_STORE__',
] as const;

const MODAL_DISPLAY_NAME: Record<ShopQuadModalId, string> = {
  seedShop: 'Seed Shop',
  toolShop: 'Tool Shop',
  eggShop: 'Egg Shop',
  decorShop: 'Decor Shop',
};

const MODAL_TITLE_REGEX: Record<ShopQuadModalId, RegExp> = {
  seedShop: /(?:new\s+seed(?:s)?\s+in|seed\s+shop)/i,
  toolShop: /(?:new\s+tool(?:s)?\s+in|tool\s+shop)/i,
  eggShop: /(?:new\s+egg(?:s)?\s+in|egg\s+shop)/i,
  decorShop: /(?:new\s+decor(?:ation)?(?:s)?\s+in|decor\s+shop)/i,
};

const MODAL_RESTOCK_REGEX: Record<ShopQuadModalId, RegExp> = {
  seedShop: /restock\s+seed/i,
  toolShop: /restock\s+tool/i,
  eggShop: /restock\s+egg/i,
  decorShop: /restock\s+decor(?:ation)?(?:s)?/i,
};

const MODAL_FOOTER_REGEX: Record<ShopQuadModalId, RegExp> = {
  seedShop: /more\s+seeds?\s+and\s+updates?\s+coming\s+soon/i,
  toolShop: /more\s+tools?\s+and\s+updates?\s+coming\s+soon/i,
  eggShop: /more\s+pets?\s+and\s+updates?\s+coming\s+soon/i,
  decorShop: /more\s+decor(?:ation)?(?:s)?\s+and\s+updates?\s+coming\s+soon/i,
};

const ANY_SHOP_TITLE_REGEX = /new\s+(?:seed(?:s)?|tool(?:s)?|egg(?:s)?|decor(?:ation)?(?:s)?)\s+in/i;
const ANY_SHOP_RESTOCK_REGEX = /restock\s+(?:seed(?:s)?|tool(?:s)?|egg(?:s)?|decor(?:ation)?(?:s)?)/i;
const ANY_SHOP_FOOTER_REGEX = /this\s+game\s+is\s+in\s+early\s+access/i;

const DEFAULT_CONFIG: ShopQuadModalSpikeConfig = {
  enabled: false,
  autoOpenLab: false,
  interactiveQuadEnabled: false,
  clickActivationDebounceMs: DEFAULT_CLICK_ACTIVATION_DEBOUNCE_MS,
  snapshotCaptureDebounceMs: DEFAULT_SNAPSHOT_CAPTURE_DEBOUNCE_MS,
};

let initialized = false;
let running = false;
let config: ShopQuadModalSpikeConfig = loadConfig();
let status: ShopQuadModalSpikeStatus = createInitialStatus();
let labRefs: LabRefs | null = null;
const modalSnapshots = new Map<ShopQuadModalId, HTMLElement>();
let manualCapturedSetter: ((atom: unknown, value: unknown) => unknown) | null = null;
let manualCaptureArmed = false;
let manualCaptureReady = false;
let manualCaptureCapturedAt: number | null = null;
let manualCaptureMessage: string | null = null;
let manualCaptureRestore: (() => void) | null = null;
let interactiveQuadRunning = false;
let interactiveActivationInFlight = false;
let interactiveSyncTimer: number | null = null;
let interactiveSnapshotTimer: number | null = null;
let interactiveResizeTimer: number | null = null;
let interactiveSyncInFlight = false;
let interactiveActiveAtom: unknown | null = null;
let interactiveActiveModalId: ShopQuadModalId | null = null;
let interactiveLastActivationAt: number | null = null;
let interactiveLiveModalRoot: HTMLElement | null = null;
let interactiveLiveModalRestore: (() => void) | null = null;
let interactiveLiveModalClickUnsub: (() => void) | null = null;
let interactiveCloseGuardUnsub: (() => void) | null = null;
let interactiveSurface: ShopQuadSurfaceHandle | null = null;
let interactiveOpenGuardUnsub: (() => void) | null = null;
let interactiveLastPlacementFailure: string | null = null;
let interactiveLastPlacementMetrics: {
  modalId: ShopQuadModalId | null;
  viewport: { left: number; top: number; width: number; height: number } | null;
  baseSize: { width: number; height: number } | null;
  hostMounted: boolean;
  hasSurfaceRect: boolean;
  usedFallbackRect: boolean;
  rootConnected: boolean;
  timestamp: number | null;
} = {
  modalId: null,
  viewport: null,
  baseSize: null,
  hostMounted: false,
  hasSurfaceRect: false,
  usedFallbackRect: false,
  rootConnected: false,
  timestamp: null,
};

const LIVE_MODAL_STYLE_KEYS = [
  'position',
  'left',
  'top',
  'zIndex',
  'margin',
  'maxWidth',
  'maxHeight',
  'width',
  'height',
  'transform',
  'transformOrigin',
  'pointerEvents',
  'boxSizing',
  'overflow',
] as const;

type LiveModalStyleKey = (typeof LIVE_MODAL_STYLE_KEYS)[number];

const LIVE_SHELL_STYLE_KEYS = [
  'position',
  'left',
  'top',
  'right',
  'bottom',
  'width',
  'height',
  'zIndex',
  'margin',
  'padding',
  'display',
  'alignItems',
  'justifyContent',
  'pointerEvents',
  'background',
  'backgroundColor',
  'overflow',
] as const;

type LiveShellStyleKey = (typeof LIVE_SHELL_STYLE_KEYS)[number];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitFrames(frameCount = 1): Promise<void> {
  const total = Math.max(1, Math.floor(frameCount));
  return new Promise((resolve) => {
    let remaining = total;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}

function sanitizeConfig(value: Partial<ShopQuadModalSpikeConfig> | null | undefined): ShopQuadModalSpikeConfig {
  const clickActivationDebounceMs = Math.max(
    30,
    Math.floor(value?.clickActivationDebounceMs ?? DEFAULT_CONFIG.clickActivationDebounceMs),
  );
  const snapshotCaptureDebounceMs = Math.max(
    80,
    Math.floor(value?.snapshotCaptureDebounceMs ?? DEFAULT_CONFIG.snapshotCaptureDebounceMs),
  );

  return {
    enabled: value?.enabled === true,
    autoOpenLab: value?.autoOpenLab === true,
    interactiveQuadEnabled: value?.interactiveQuadEnabled === true,
    clickActivationDebounceMs,
    snapshotCaptureDebounceMs,
  };
}

function loadConfig(): ShopQuadModalSpikeConfig {
  const raw = storage.get<Partial<ShopQuadModalSpikeConfig> | null>(STORAGE_KEY, null);
  return sanitizeConfig(raw);
}

function saveConfig(next: ShopQuadModalSpikeConfig): void {
  storage.set(STORAGE_KEY, next);
}

function createProbe(modalId: ShopQuadModalId): ShopQuadModalProbe {
  return {
    modalId,
    opened: false,
    liveDetected: false,
    snapshotCaptured: false,
    visibleModalCount: null,
    notes: [],
  };
}

function createInteractivePaneState(): Record<
  ShopQuadModalId,
  {
    isActive: boolean;
    hasSnapshot: boolean;
    isStale: boolean;
    liveDetected: boolean;
    error: string | null;
    mode: ShopQuadPaneMode;
    lastError: string | null;
    lastSnapshotAt: number | null;
  }
> {
  return {
    seedShop: {
      isActive: false,
      hasSnapshot: false,
      isStale: false,
      liveDetected: false,
      error: null,
      mode: 'snapshot',
      lastError: null,
      lastSnapshotAt: null,
    },
    toolShop: {
      isActive: false,
      hasSnapshot: false,
      isStale: false,
      liveDetected: false,
      error: null,
      mode: 'snapshot',
      lastError: null,
      lastSnapshotAt: null,
    },
    eggShop: {
      isActive: false,
      hasSnapshot: false,
      isStale: false,
      liveDetected: false,
      error: null,
      mode: 'snapshot',
      lastError: null,
      lastSnapshotAt: null,
    },
    decorShop: {
      isActive: false,
      hasSnapshot: false,
      isStale: false,
      liveDetected: false,
      error: null,
      mode: 'snapshot',
      lastError: null,
      lastSnapshotAt: null,
    },
  };
}

function createInitialStatus(): ShopQuadModalSpikeStatus {
  return {
    outcome: 'idle',
    startedAt: null,
    finishedAt: null,
    shippingGate: 'unknown',
    summary: 'Idle. Run the spike from the lab to verify whether native quad-shop rendering is possible.',
    writableStore: false,
    activeModalWritable: false,
    activeModalAtomFound: false,
    storeSource: null,
    manualCaptureArmed: false,
    manualCaptureReady: false,
    manualCaptureMessage: null,
    singleModalGateDetected: false,
    probes: SHOP_MODAL_IDS.map(createProbe),
    passCriteria: {
      allFourVisible: false,
      allFourInteractive: false,
      noFlickerOrStateThrash: false,
      stableAcrossRestockCycle: false,
    },
    interactiveQuad: {
      enabled: false,
      hostMounted: false,
      activePane: null,
      liveModalDetected: false,
      lastActivationAt: null,
      paneStates: createInteractivePaneState(),
    },
  };
}

function cloneStatus(source: ShopQuadModalSpikeStatus): ShopQuadModalSpikeStatus {
  return {
    ...source,
    probes: source.probes.map((probe) => ({
      ...probe,
      notes: probe.notes.slice(),
    })),
    passCriteria: {
      ...source.passCriteria,
    },
    interactiveQuad: {
      ...source.interactiveQuad,
      paneStates: {
        seedShop: { ...source.interactiveQuad.paneStates.seedShop },
        toolShop: { ...source.interactiveQuad.paneStates.toolShop },
        eggShop: { ...source.interactiveQuad.paneStates.eggShop },
        decorShop: { ...source.interactiveQuad.paneStates.decorShop },
      },
    },
  };
}

function emitStatus(): void {
  window.dispatchEvent(
    new CustomEvent(STATUS_EVENT, {
      detail: getShopQuadModalSpikeStatus(),
    }),
  );
}

function setStatus(next: ShopQuadModalSpikeStatus): void {
  applyManualCaptureState(next);
  next.interactiveQuad.hostMounted = interactiveSurface?.isMounted() ?? false;
  status = next;
  paintLab();
  paintInteractiveSurface();
  emitStatus();
}

function getPaneMode(
  pane: ShopQuadModalSpikeStatus['interactiveQuad']['paneStates'][ShopQuadModalId],
): ShopQuadPaneMode {
  if (pane.isActive && pane.liveDetected) {
    return 'live';
  }
  if (pane.error || pane.lastError) {
    return 'error';
  }
  return 'snapshot';
}

function paintInteractiveSurface(): void {
  if (!interactiveSurface) {
    return;
  }

  interactiveSurface.render(
    {
      activePane: status.interactiveQuad.activePane,
      liveModalDetected: status.interactiveQuad.liveModalDetected,
      panes: {
        seedShop: {
          ...status.interactiveQuad.paneStates.seedShop,
          mode: status.interactiveQuad.paneStates.seedShop.mode,
        },
        toolShop: {
          ...status.interactiveQuad.paneStates.toolShop,
          mode: status.interactiveQuad.paneStates.toolShop.mode,
        },
        eggShop: {
          ...status.interactiveQuad.paneStates.eggShop,
          mode: status.interactiveQuad.paneStates.eggShop.mode,
        },
        decorShop: {
          ...status.interactiveQuad.paneStates.decorShop,
          mode: status.interactiveQuad.paneStates.decorShop.mode,
        },
      },
    },
    modalSnapshots,
  );
}

function applyManualCaptureState(target: ShopQuadModalSpikeStatus): void {
  target.manualCaptureArmed = manualCaptureArmed;
  target.manualCaptureReady = manualCaptureReady;
  target.manualCaptureMessage = manualCaptureMessage;
}

function updateStatusManualCaptureState(): void {
  const next = cloneStatus(status);
  applyManualCaptureState(next);
  setStatus(next);
}

function pushProbeNote(probe: ShopQuadModalProbe, text: string): void {
  probe.notes.push(text);
}

function isVisibleElement(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;
  if (rect.right < 0 || rect.bottom < 0) return false;
  if (rect.left > window.innerWidth || rect.top > window.innerHeight) return false;
  return true;
}

function getElementBaseSize(element: HTMLElement): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  const offsetWidth = element.offsetWidth || element.clientWidth;
  const offsetHeight = element.offsetHeight || element.clientHeight;

  // Prefer layout dimensions because boundingClientRect can include transform scaling.
  let width = offsetWidth > 0 ? offsetWidth : rect.width;
  let height = offsetHeight > 0 ? offsetHeight : rect.height;

  if (!Number.isFinite(width) || width <= 0) {
    width = rect.width;
  }
  if (!Number.isFinite(height) || height <= 0) {
    height = rect.height;
  }

  return {
    width: Math.max(0, width),
    height: Math.max(0, height),
  };
}

function getNormalizedQuadModalFrame(): { width: number; height: number } {
  const viewportBoundWidth = Math.max(320, Math.floor(window.innerWidth * 0.48));
  const viewportBoundHeight = Math.max(280, Math.floor(window.innerHeight * 0.48));
  const scale = Math.min(
    viewportBoundWidth / QUAD_MODAL_BASE_WIDTH,
    viewportBoundHeight / QUAD_MODAL_BASE_HEIGHT,
    1,
  );
  return {
    width: Math.max(320, Math.round(QUAD_MODAL_BASE_WIDTH * scale)),
    height: Math.max(280, Math.round(QUAD_MODAL_BASE_HEIGHT * scale)),
  };
}

function findShopModalRoot(modalId: ShopQuadModalId): HTMLElement | null {
  const titleMatcher = MODAL_TITLE_REGEX[modalId];
  const restockMatcher = MODAL_RESTOCK_REGEX[modalId];
  const footerMatcher = MODAL_FOOTER_REGEX[modalId];
  const shopNameMatcher = new RegExp(MODAL_DISPLAY_NAME[modalId].replace(/\s+/g, '\\s+'), 'i');
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div,section,article'));
  let best: { element: HTMLElement; score: number } | null = null;

  const isEligible = (element: HTMLElement): boolean => {
    if (element.hasAttribute(SNAPSHOT_ATTR)) return false;
    if (element.closest(`[${SNAPSHOT_ATTR}]`)) return false;
    if (element.closest(`#qpm-window-${WINDOW_ID}`)) return false;
    if (!isVisibleElement(element)) return false;
    return true;
  };

  const scoreCandidate = (element: HTMLElement): number | null => {
    if (!isEligible(element)) return null;

    const text = element.textContent ?? '';
    const titleMatch = titleMatcher.test(text);
    const restockMatch = restockMatcher.test(text);
    const footerMatch = footerMatcher.test(text);
    const shopNameMatch = shopNameMatcher.test(text);
    if (!titleMatch && !restockMatch && !footerMatch && !shopNameMatch) return null;

    const rect = element.getBoundingClientRect();
    const baseSize = getElementBaseSize(element);
    if (baseSize.width < 180 || baseSize.height < 120) return null;
    if (baseSize.width > 980 || baseSize.height > 1_400) return null;
    if (rect.width >= window.innerWidth * 0.88 && rect.height >= window.innerHeight * 0.7) return null;

    const buttonCount = element.querySelectorAll('button').length;
    const roleButtonCount = element.querySelectorAll('[role=\"button\"]').length;
    const controlCount = buttonCount + roleButtonCount;

    const area = baseSize.width * baseSize.height;
    const widthPenalty = Math.abs(baseSize.width - 620) * 180;
    const heightPenalty = Math.abs(baseSize.height - 760) * 95;
    const oversizePenalty = baseSize.width > 860 ? (baseSize.width - 860) * 480 : 0;
    const bonus =
      titleMatch && restockMatch ? 7_200
      : titleMatch || restockMatch ? 4_200
      : footerMatch ? 2_800
      : shopNameMatch ? 2_300
      : 0;
    const titlePresence = titleMatch ? 900 : footerMatch ? 700 : shopNameMatch ? 450 : 0;
    return area + Math.min(controlCount, 12) * 900 + bonus + titlePresence - widthPenalty - heightPenalty - oversizePenalty;
  };

  // Pass 1: anchor via any visible element carrying restock/title/shop text, then walk up.
  const anchors = Array.from(document.querySelectorAll<HTMLElement>('button,[role=\"button\"],div,span,p'));
  for (const anchor of anchors) {
    if (!isVisibleElement(anchor)) continue;
    const anchorText = anchor.textContent ?? '';
    if (
      !restockMatcher.test(anchorText) &&
      !titleMatcher.test(anchorText) &&
      !footerMatcher.test(anchorText) &&
      !shopNameMatcher.test(anchorText)
    ) {
      continue;
    }

    let current: HTMLElement | null = anchor;
    let depth = 0;
    while (current && current !== document.body && depth < 22) {
      const score = scoreCandidate(current);
      if (score != null && (!best || score > best.score)) {
        best = { element: current, score };
      }
      current = current.parentElement;
      depth += 1;
    }
  }

  if (best?.element) {
    return best.element;
  }

  for (const element of candidates) {
    const score = scoreCandidate(element);
    if (score != null && (!best || score > best.score)) {
      best = { element, score };
    }
  }

  return best?.element ?? null;
}

function classifyShopModalRoot(element: HTMLElement): ShopQuadModalId | null {
  const text = element.textContent ?? '';
  for (const modalId of SHOP_MODAL_IDS) {
    if (
      MODAL_TITLE_REGEX[modalId].test(text) ||
      MODAL_RESTOCK_REGEX[modalId].test(text) ||
      MODAL_FOOTER_REGEX[modalId].test(text)
    ) {
      return modalId;
    }
  }
  return null;
}

function findAnyShopModalRoot(expectedModalId: ShopQuadModalId): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div,section,article'));
  let best: { element: HTMLElement; score: number } | null = null;

  const hasCloseButton = (node: HTMLElement): boolean => {
    const buttons = Array.from(node.querySelectorAll<HTMLButtonElement>('button'));
    for (const button of buttons) {
      const text = (button.textContent ?? '').trim();
      const aria = (button.getAttribute('aria-label') ?? '').trim().toLowerCase();
      if (text === '×' || text === 'x' || text === 'Ã—' || aria.includes('close')) {
        return true;
      }
    }
    return false;
  };

  for (const element of candidates) {
    if (!isVisibleElement(element)) continue;
    if (element.hasAttribute(SNAPSHOT_ATTR) || element.closest(`[${SNAPSHOT_ATTR}]`)) continue;
    if (element.closest(`#qpm-window-${WINDOW_ID}`)) continue;

    const text = element.textContent ?? '';
    if (!ANY_SHOP_TITLE_REGEX.test(text) && !ANY_SHOP_RESTOCK_REGEX.test(text) && !ANY_SHOP_FOOTER_REGEX.test(text)) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    const baseSize = getElementBaseSize(element);
    if (baseSize.width < 220 || baseSize.height < 180) continue;
    if (baseSize.width > 980 || baseSize.height > 1_400) continue;
    if (rect.width >= window.innerWidth * 0.88 && rect.height >= window.innerHeight * 0.7) continue;

    const classified = classifyShopModalRoot(element);
    const expectedBoost = classified === expectedModalId ? 3200 : classified == null ? 1200 : -800;
    const closeBoost = hasCloseButton(element) ? 2200 : 0;
    const area = baseSize.width * baseSize.height;
    const widthPenalty = Math.abs(baseSize.width - 620) * 190;
    const heightPenalty = Math.abs(baseSize.height - 760) * 90;
    const oversizePenalty = baseSize.width > 860 ? (baseSize.width - 860) * 480 : 0;
    const score = area + expectedBoost + closeBoost - widthPenalty - heightPenalty - oversizePenalty;

    if (!best || score > best.score) {
      best = { element, score };
    }
  }

  return best?.element ?? null;
}

function normalizeModalCardRoot(modalId: ShopQuadModalId, root: HTMLElement): HTMLElement {
  const titleMatcher = MODAL_TITLE_REGEX[modalId];
  const restockMatcher = MODAL_RESTOCK_REGEX[modalId];
  const footerMatcher = MODAL_FOOTER_REGEX[modalId];

  const hasCloseButton = (node: HTMLElement): boolean => {
    const buttons = Array.from(node.querySelectorAll<HTMLButtonElement>('button'));
    for (const button of buttons) {
      const text = (button.textContent ?? '').trim().toLowerCase();
      const aria = (button.getAttribute('aria-label') ?? '').trim().toLowerCase();
      if (text === '×' || text === 'x' || aria.includes('close')) {
        return true;
      }
    }
    return false;
  };

  const scoreNode = (node: HTMLElement): number | null => {
    if (!isVisibleElement(node)) return null;
    const text = node.textContent ?? '';
    const titleMatch = titleMatcher.test(text);
    const restockMatch = restockMatcher.test(text);
    const footerMatch = footerMatcher.test(text);
    if (!titleMatch && !restockMatch && !footerMatch) return null;

    const baseSize = getElementBaseSize(node);
    if (baseSize.width < 220 || baseSize.height < 180) return null;
    if (baseSize.width > 980 || baseSize.height > 1_400) return null;

    const closeBonus = hasCloseButton(node) ? 2800 : 0;
    const titleBonus = titleMatch ? 1800 : 0;
    const restockBonus = restockMatch ? 1600 : 0;
    const footerBonus = footerMatch ? 900 : 0;
    const area = baseSize.width * baseSize.height;
    const widthPenalty = Math.abs(baseSize.width - 620) * 200;
    const heightPenalty = Math.abs(baseSize.height - 760) * 95;
    const oversizePenalty = baseSize.width > 860 ? (baseSize.width - 860) * 520 : 0;
    return area + closeBonus + titleBonus + restockBonus + footerBonus - widthPenalty - heightPenalty - oversizePenalty;
  };

  let best: { element: HTMLElement; score: number } | null = null;
  const rootScore = scoreNode(root);
  if (rootScore != null) {
    best = { element: root, score: rootScore };
  }

  const descendants = Array.from(root.querySelectorAll<HTMLElement>('div,section,article'));
  for (const node of descendants) {
    const score = scoreNode(node);
    if (score != null && (!best || score > best.score)) {
      best = { element: node, score };
    }
  }

  return best?.element ?? root;
}

async function waitForShopModalRoot(
  modalId: ShopQuadModalId,
  timeoutMs = MODAL_CAPTURE_TIMEOUT_MS,
  pollMs = MODAL_CAPTURE_POLL_MS,
): Promise<HTMLElement | null> {
  const startedAt = Date.now();
  let root = findShopModalRoot(modalId) ?? findAnyShopModalRoot(modalId);
  while (!root && Date.now() - startedAt < timeoutMs) {
    await wait(pollMs);
    root = findShopModalRoot(modalId) ?? findAnyShopModalRoot(modalId);
  }
  if (!root) {
    return null;
  }
  const normalized = normalizeModalCardRoot(modalId, root);
  const classified = classifyShopModalRoot(normalized);
  if (classified && classified !== modalId) {
    const rescue = findShopModalRoot(modalId);
    if (rescue) {
      return normalizeModalCardRoot(modalId, rescue);
    }
  }
  return normalized;
}

function countVisibleShopModals(): number {
  let count = 0;
  for (const modalId of SHOP_MODAL_IDS) {
    if (findShopModalRoot(modalId)) {
      count += 1;
    }
  }
  return count;
}

function snapshotModal(modalId: ShopQuadModalId, source: HTMLElement): void {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.setAttribute(SNAPSHOT_ATTR, modalId);
  clone.querySelectorAll<HTMLElement>('[id]').forEach((node) => node.removeAttribute('id'));
  for (const key of LIVE_MODAL_STYLE_KEYS) {
    clone.style[key] = '';
  }

  // cloneNode does not copy <canvas> pixels; mirror them so snapshot keeps native sprites/icons.
  const sourceCanvases = source.querySelectorAll<HTMLCanvasElement>('canvas');
  const cloneCanvases = clone.querySelectorAll<HTMLCanvasElement>('canvas');
  for (let i = 0; i < sourceCanvases.length; i += 1) {
    const srcCanvas = sourceCanvases[i];
    const dstCanvas = cloneCanvases[i];
    if (!srcCanvas || !dstCanvas) continue;
    try {
      dstCanvas.width = srcCanvas.width;
      dstCanvas.height = srcCanvas.height;
      const ctx = dstCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(srcCanvas, 0, 0);
      }

      // Some shop icon layers use WebGL canvases. If 2d draw copy is blank, a dataURL image fallback
      // improves snapshot fidelity for inactive panes.
      if (srcCanvas.width > 0 && srcCanvas.height > 0) {
        const webglCtx = srcCanvas.getContext('webgl2') ?? srcCanvas.getContext('webgl');
        if (webglCtx) {
          const dataUrl = srcCanvas.toDataURL('image/png');
          if (dataUrl && dataUrl.startsWith('data:image/')) {
            const image = document.createElement('img');
            image.src = dataUrl;
            image.alt = '';
            image.style.width = `${srcCanvas.width}px`;
            image.style.height = `${srcCanvas.height}px`;
            image.style.display = 'block';
            dstCanvas.replaceWith(image);
          }
        }
      }
    } catch {}
  }

  clone.style.pointerEvents = 'none';
  clone.style.transformOrigin = 'top left';
  clone.style.transform = 'none';
  clone.style.margin = '0';
  clone.style.filter = 'none';

  const frame = getNormalizedQuadModalFrame();
  const baseWidth = frame.width;
  const baseHeight = frame.height;
  clone.style.width = `${baseWidth}px`;
  clone.style.height = `${baseHeight}px`;
  clone.dataset.qpmQuadBaseWidth = `${baseWidth}`;
  clone.dataset.qpmQuadBaseHeight = `${baseHeight}`;
  modalSnapshots.set(modalId, clone);
}

function setInteractivePaneState(
  modalId: ShopQuadModalId,
  patch: Partial<ShopQuadModalSpikeStatus['interactiveQuad']['paneStates'][ShopQuadModalId]>,
): void {
  const next = cloneStatus(status);
  const pane = next.interactiveQuad.paneStates[modalId];
  Object.assign(pane, patch);
  if (typeof patch.error === 'string') {
    pane.lastError = patch.error;
  } else if (patch.error === null) {
    pane.lastError = null;
  }
  pane.mode = getPaneMode(pane);
  setStatus(next);
}

function syncInteractivePaneSnapshotFlags(): void {
  const next = cloneStatus(status);
  for (const modalId of SHOP_MODAL_IDS) {
    const pane = next.interactiveQuad.paneStates[modalId];
    pane.hasSnapshot = modalSnapshots.has(modalId);
    pane.mode = getPaneMode(pane);
  }
  setStatus(next);
}

function markPaneSnapshot(modalId: ShopQuadModalId): void {
  const next = cloneStatus(status);
  const pane = next.interactiveQuad.paneStates[modalId];
  pane.hasSnapshot = modalSnapshots.has(modalId);
  pane.isStale = false;
  pane.lastSnapshotAt = Date.now();
  pane.error = null;
  pane.lastError = null;
  pane.mode = getPaneMode(pane);
  setStatus(next);
}

function getProbe(modalId: ShopQuadModalId, list: ShopQuadModalProbe[]): ShopQuadModalProbe {
  const probe = list.find((entry) => entry.modalId === modalId);
  if (!probe) {
    throw new Error(`Missing probe state for ${modalId}`);
  }
  return probe;
}

type PatchableAtom = {
  write?: (get: unknown, set: (atom: unknown, value: unknown) => unknown, ...args: unknown[]) => unknown;
  __qpmQuadOriginalWrite?: PatchableAtom['write'];
  __qpmQuadWriteArmed?: boolean;
};

function clearManualCapturePatch(): void {
  try {
    manualCaptureRestore?.();
  } catch {}
  manualCaptureRestore = null;
  manualCaptureArmed = false;
}

function setManualCaptureMessage(message: string | null): void {
  manualCaptureMessage = message;
  updateStatusManualCaptureState();
}

function getActiveModalPatchableAtom(): PatchableAtom | null {
  const atom = getAtomByLabel('activeModalAtom');
  if (!atom || typeof atom !== 'object') {
    return null;
  }
  return atom as PatchableAtom;
}

function armManualWritableCaptureInternal(options?: ShopQuadArmOptions): { armed: boolean; message: string } {
  if (manualCaptureReady) {
    const message = 'Manual writable capture already ready.';
    setManualCaptureMessage(message);
    return { armed: true, message };
  }

  const atom = getActiveModalPatchableAtom();
  if (!atom || typeof atom.write !== 'function') {
    const message = 'activeModalAtom is unavailable or not patchable for manual capture.';
    setManualCaptureMessage(message);
    return { armed: false, message };
  }

  if (manualCaptureArmed) {
    const message = 'Manual writable capture is already armed. Open or close any native modal to capture.';
    setManualCaptureMessage(message);
    return { armed: true, message };
  }

  const timeoutMs = Math.max(2_000, Math.floor(options?.timeoutMs ?? DEFAULT_ARM_TIMEOUT_MS));
  const originalWrite = atom.write.bind(atom);
  atom.__qpmQuadOriginalWrite = atom.write;
  atom.__qpmQuadWriteArmed = true;
  manualCaptureArmed = true;
  manualCaptureMessage = `Manual capture armed for ${timeoutMs}ms. Open or close any native modal now.`;
  updateStatusManualCaptureState();

  const restore = (): void => {
    if (!atom.__qpmQuadWriteArmed) {
      return;
    }
    try {
      if (atom.__qpmQuadOriginalWrite) {
        atom.write = atom.__qpmQuadOriginalWrite;
      }
    } catch {}
    delete atom.__qpmQuadOriginalWrite;
    delete atom.__qpmQuadWriteArmed;
  };
  manualCaptureRestore = restore;

  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    if (manualCaptureReady) {
      return;
    }
    timedOut = true;
    clearManualCapturePatch();
    setManualCaptureMessage('Manual capture timed out. Arm again and open/close a native modal within the timeout.');
  }, timeoutMs);

  atom.write = function patchedActiveModalWrite(get, set, ...args) {
    if (!manualCaptureReady) {
      manualCapturedSetter = set;
      manualCaptureReady = true;
      manualCaptureCapturedAt = Date.now();
      clearManualCapturePatch();
      if (!timedOut) {
        window.clearTimeout(timeoutId);
      }
      setManualCaptureMessage('Manual writable capture ready. You can now run the quad probe.');
    }
    return originalWrite(get, set, ...args);
  };

  return { armed: true, message: manualCaptureMessage ?? 'Manual writable capture armed.' };
}

async function tryWriteAtomValue(atom: unknown, value: unknown): Promise<boolean> {
  try {
    await writeAtomValue(atom, value);
    return true;
  } catch {}

  if (manualCapturedSetter) {
    try {
      await manualCapturedSetter(atom, value);
      return true;
    } catch (error) {
      log('[ShopQuadSpike] Manual captured setter failed', error);
    }
  }

  return false;
}

async function canWriteActiveModal(atom: unknown): Promise<boolean> {
  try {
    const current = await readAtomValue<unknown>(atom);
    return await tryWriteAtomValue(atom, current);
  } catch {
    return false;
  }
}

async function setActiveModalValue(atom: unknown, value: string | null): Promise<boolean> {
  const ok = await tryWriteAtomValue(atom, value);
  if (!ok) {
    log('[ShopQuadSpike] Failed to set activeModal', value);
  }
  return ok;
}

async function captureSingleModalSnapshot(atom: unknown, modalId: ShopQuadModalId): Promise<boolean> {
  const opened = await setActiveModalValue(atom, modalId);
  if (!opened) {
    return false;
  }

  await wait(MODAL_SETTLE_MS);
  const root = await waitForShopModalRoot(modalId, MODAL_CAPTURE_TIMEOUT_MS, MODAL_CAPTURE_POLL_MS);
  if (!root) {
    return false;
  }

  await waitFrames(2);
  snapshotModal(modalId, root);
  markPaneSnapshot(modalId);
  paintLab();
  return true;
}

function clearSnapshots(): void {
  modalSnapshots.clear();
  syncInteractivePaneSnapshotFlags();
  paintLab();
}

function mountInteractiveSurface(): void {
  if (interactiveSurface?.isMounted()) {
    paintInteractiveSurface();
    return;
  }

  interactiveSurface?.destroy();
  interactiveSurface = createShopQuadSurface({
    onPaneActivate: (modalId) => {
      void activateInteractivePane(modalId);
    },
    onStop: () => {
      void stopInteractiveShopQuadView();
    },
  });

  const next = cloneStatus(status);
  next.interactiveQuad.hostMounted = true;
  status = next;
  paintLab();
  paintInteractiveSurface();
  emitStatus();
}

function unmountInteractiveSurface(): void {
  interactiveSurface?.destroy();
  interactiveSurface = null;
}

function getLabPane(modalId: ShopQuadModalId): LabPaneRefs | null {
  return labRefs?.panes[modalId] ?? null;
}

function getFallbackPaneRect(modalId: ShopQuadModalId): DOMRect {
  const margin = 8;
  const gap = 10;
  const topInset = 8;
  const usableWidth = Math.max(200, window.innerWidth - margin * 2 - gap);
  const usableHeight = Math.max(200, window.innerHeight - topInset - margin - gap);
  const paneWidth = usableWidth / 2;
  const paneHeight = usableHeight / 2;

  const col = modalId === 'toolShop' || modalId === 'decorShop' ? 1 : 0;
  const row = modalId === 'eggShop' || modalId === 'decorShop' ? 1 : 0;
  const left = margin + col * (paneWidth + gap);
  const top = topInset + row * (paneHeight + gap);
  return new DOMRect(left, top, paneWidth, paneHeight);
}

function getInteractivePaneRect(modalId: ShopQuadModalId): { rect: DOMRect; hasSurfaceRect: boolean; usedFallbackRect: boolean } {
  const rect = interactiveSurface?.getPaneRect(modalId) ?? null;
  const minWidth = Math.max(260, window.innerWidth * 0.2);
  const minHeight = Math.max(180, window.innerHeight * 0.2);
  const surfaceMounted = interactiveSurface?.isMounted() ?? false;
  if (rect && rect.width >= minWidth && rect.height >= minHeight) {
    return { rect, hasSurfaceRect: true, usedFallbackRect: false };
  }
  if (surfaceMounted) {
    return { rect: getFallbackPaneRect(modalId), hasSurfaceRect: false, usedFallbackRect: true };
  }
  const labPane = getLabPane(modalId);
  const labRect = labPane?.viewport.getBoundingClientRect() ?? null;
  if (labRect && labRect.width >= minWidth && labRect.height >= minHeight) {
    return { rect: labRect, hasSurfaceRect: false, usedFallbackRect: false };
  }
  return { rect: getFallbackPaneRect(modalId), hasSurfaceRect: false, usedFallbackRect: true };
}

function clearInteractiveOpenGuard(): void {
  try {
    interactiveOpenGuardUnsub?.();
  } catch {}
  interactiveOpenGuardUnsub = null;
}

function armInteractiveOpenGuard(durationMs = 420): void {
  clearInteractiveOpenGuard();
  const until = Date.now() + durationMs;
  const handler = (event: Event): void => {
    if (Date.now() > until) {
      return;
    }
    const target = event.target as Node | null;
    if (target && interactiveSurface && (document.getElementById('qpm-shop-quad-surface')?.contains(target) ?? false)) {
      return;
    }
    if (interactiveLiveModalRoot && target && interactiveLiveModalRoot.contains(target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if ('stopImmediatePropagation' in event && typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  };

  document.addEventListener('pointerdown', handler, true);
  document.addEventListener('click', handler, true);
  document.addEventListener('mousedown', handler, true);
  interactiveOpenGuardUnsub = () => {
    document.removeEventListener('pointerdown', handler, true);
    document.removeEventListener('click', handler, true);
    document.removeEventListener('mousedown', handler, true);
  };
  window.setTimeout(() => {
    clearInteractiveOpenGuard();
  }, durationMs + 60);
}

function captureInlineStyles<K extends string>(
  element: HTMLElement,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const snapshot: Partial<Record<K, string>> = {};
  for (const key of keys) {
    snapshot[key] = (element.style as unknown as Record<string, string>)[key];
  }
  return snapshot;
}

function restoreInlineStyles<K extends string>(
  element: HTMLElement,
  keys: readonly K[],
  snapshot: Partial<Record<K, string>>,
): void {
  for (const key of keys) {
    (element.style as unknown as Record<string, string>)[key] = snapshot[key] ?? '';
  }
}

function findBackdropContainer(root: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = root.parentElement;
  while (node && node !== document.body) {
    const rect = node.getBoundingClientRect();
    if (rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.7) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function refreshInteractiveLivePlacement(modalId?: ShopQuadModalId): boolean {
  const targetModalId = modalId ?? interactiveActiveModalId;
  if (!interactiveQuadRunning || !targetModalId) {
    interactiveLastPlacementFailure = 'Placement skipped: interactive runtime not active or modalId missing.';
    return false;
  }
  if (!interactiveLiveModalRoot?.isConnected) {
    interactiveLastPlacementFailure = 'Placement failed: live modal root is detached.';
    interactiveLastPlacementMetrics = {
      modalId: targetModalId,
      viewport: null,
      baseSize: null,
      hostMounted: interactiveSurface?.isMounted() ?? false,
      hasSurfaceRect: false,
      usedFallbackRect: false,
      rootConnected: false,
      timestamp: Date.now(),
    };
    return false;
  }
  const paneRect = getInteractivePaneRect(targetModalId);
  const viewportRect = paneRect.rect;
  if (viewportRect.width < 80 || viewportRect.height < 80) {
    interactiveLastPlacementFailure = `Placement failed: pane rect too small (${Math.round(viewportRect.width)}x${Math.round(viewportRect.height)}).`;
    interactiveLastPlacementMetrics = {
      modalId: targetModalId,
      viewport: {
        left: viewportRect.left,
        top: viewportRect.top,
        width: viewportRect.width,
        height: viewportRect.height,
      },
      baseSize: null,
      hostMounted: interactiveSurface?.isMounted() ?? false,
      hasSurfaceRect: paneRect.hasSurfaceRect,
      usedFallbackRect: paneRect.usedFallbackRect,
      rootConnected: interactiveLiveModalRoot.isConnected,
      timestamp: Date.now(),
    };
    return false;
  }

  const root = interactiveLiveModalRoot;
  const measured = getElementBaseSize(root);
  const baseWidth = Number(root.dataset.qpmQuadBaseWidth ?? '0') || measured.width;
  const baseHeight = Number(root.dataset.qpmQuadBaseHeight ?? '0') || measured.height;
  if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight) || baseWidth < 4 || baseHeight < 4) {
    interactiveLastPlacementFailure = `Placement failed: invalid base size (${String(baseWidth)}x${String(baseHeight)}).`;
    interactiveLastPlacementMetrics = {
      modalId: targetModalId,
      viewport: {
        left: viewportRect.left,
        top: viewportRect.top,
        width: viewportRect.width,
        height: viewportRect.height,
      },
      baseSize: { width: Number(baseWidth), height: Number(baseHeight) },
      hostMounted: interactiveSurface?.isMounted() ?? false,
      hasSurfaceRect: paneRect.hasSurfaceRect,
      usedFallbackRect: paneRect.usedFallbackRect,
      rootConnected: root.isConnected,
      timestamp: Date.now(),
    };
    return false;
  }

  const pad = 6;
  const maxW = Math.max(40, viewportRect.width - pad * 2);
  const maxH = Math.max(40, viewportRect.height - pad * 2);
  const scale = Math.min(maxW / baseWidth, maxH / baseHeight, 1);
  const renderedWidth = baseWidth * scale;
  const renderedHeight = baseHeight * scale;
  const left = viewportRect.left + Math.max(pad, (viewportRect.width - renderedWidth) / 2);
  const top = viewportRect.top + Math.max(pad, (viewportRect.height - renderedHeight) / 2);

  root.style.position = 'fixed';
  root.style.left = `${Math.round(left)}px`;
  root.style.top = `${Math.round(top)}px`;
  root.style.zIndex = '2147483402';
  root.style.margin = '0';
  root.style.maxWidth = `${Math.round(baseWidth)}px`;
  root.style.maxHeight = `${Math.round(baseHeight)}px`;
  root.style.width = `${Math.round(baseWidth)}px`;
  root.style.height = `${Math.round(baseHeight)}px`;
  root.style.transformOrigin = 'top left';
  root.style.transform = scale < 0.999 ? `scale(${scale.toFixed(4)})` : 'none';
  root.style.pointerEvents = 'auto';
  root.style.boxSizing = 'border-box';
  root.style.overflow = 'hidden';
  interactiveLastPlacementFailure = null;
  interactiveLastPlacementMetrics = {
    modalId: targetModalId,
    viewport: {
      left: viewportRect.left,
      top: viewportRect.top,
      width: viewportRect.width,
      height: viewportRect.height,
    },
    baseSize: { width: baseWidth, height: baseHeight },
    hostMounted: interactiveSurface?.isMounted() ?? false,
    hasSurfaceRect: paneRect.hasSurfaceRect,
    usedFallbackRect: paneRect.usedFallbackRect,
    rootConnected: root.isConnected,
    timestamp: Date.now(),
  };
  return true;
}

function clearInteractiveLiveModalBinding(): void {
  try {
    interactiveLiveModalClickUnsub?.();
  } catch {}
  interactiveLiveModalClickUnsub = null;
  try {
    interactiveCloseGuardUnsub?.();
  } catch {}
  interactiveCloseGuardUnsub = null;
  clearInteractiveOpenGuard();

  try {
    interactiveLiveModalRestore?.();
  } catch {}
  interactiveLiveModalRestore = null;
  interactiveLiveModalRoot = null;
}

function bindLiveModalActionCapture(modalId: ShopQuadModalId, root: HTMLElement): void {
  try {
    interactiveLiveModalClickUnsub?.();
  } catch {}

  const listener = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    const button = target.closest('button');
    if (!button) {
      return;
    }
    const text = (button.textContent ?? '').trim().toLowerCase();
    if (!text) {
      return;
    }
    if (text.includes('buy') || text.includes('restock')) {
      scheduleInteractiveSnapshot(modalId, `Detected "${text}" click.`);
    }
  };

  root.addEventListener('click', listener, true);
  interactiveLiveModalClickUnsub = () => {
    root.removeEventListener('click', listener, true);
  };
}

function bindActivationCloseGuard(root: HTMLElement): void {
  const guardUntil = Date.now() + 260;
  const guard = (event: Event): void => {
    if (Date.now() > guardUntil) {
      return;
    }
    const target = event.target as Node | null;
    if (target && root.contains(target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if ('stopImmediatePropagation' in event && typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  };

  document.addEventListener('pointerdown', guard, true);
  document.addEventListener('click', guard, true);
  interactiveCloseGuardUnsub = () => {
    document.removeEventListener('pointerdown', guard, true);
    document.removeEventListener('click', guard, true);
  };
}

function applyLiveModalToPane(modalId: ShopQuadModalId, root: HTMLElement): boolean {
  clearInteractiveLiveModalBinding();

  const rootStyleSnapshot = captureInlineStyles(root, LIVE_MODAL_STYLE_KEYS);
  const shell = findBackdropContainer(root);
  const shellStyleSnapshot = shell ? captureInlineStyles(shell, LIVE_SHELL_STYLE_KEYS) : null;

  const frame = getNormalizedQuadModalFrame();
  root.dataset.qpmQuadBaseWidth = `${frame.width}`;
  root.dataset.qpmQuadBaseHeight = `${frame.height}`;

  if (shell) {
    shell.style.position = 'fixed';
    shell.style.left = '0';
    shell.style.top = '0';
    shell.style.right = '0';
    shell.style.bottom = '0';
    shell.style.width = '100vw';
    shell.style.height = '100vh';
    shell.style.zIndex = '2147483401';
    shell.style.margin = '0';
    shell.style.padding = '0';
    shell.style.display = 'block';
    shell.style.alignItems = 'stretch';
    shell.style.justifyContent = 'stretch';
    shell.style.pointerEvents = 'none';
    shell.style.background = 'transparent';
    shell.style.backgroundColor = 'transparent';
    shell.style.overflow = 'visible';
  }

  interactiveLiveModalRoot = root;
  bindActivationCloseGuard(root);
  if (!refreshInteractiveLivePlacement(modalId)) {
    if (shell && shellStyleSnapshot) {
      restoreInlineStyles(shell, LIVE_SHELL_STYLE_KEYS, shellStyleSnapshot);
    }
    restoreInlineStyles(root, LIVE_MODAL_STYLE_KEYS, rootStyleSnapshot);
    delete root.dataset.qpmQuadBaseWidth;
    delete root.dataset.qpmQuadBaseHeight;
    interactiveLiveModalRoot = null;
    return false;
  }

  bindLiveModalActionCapture(modalId, root);

  interactiveLiveModalRestore = () => {
    restoreInlineStyles(root, LIVE_MODAL_STYLE_KEYS, rootStyleSnapshot);
    delete root.dataset.qpmQuadBaseWidth;
    delete root.dataset.qpmQuadBaseHeight;
    if (shell && shellStyleSnapshot) {
      restoreInlineStyles(shell, LIVE_SHELL_STYLE_KEYS, shellStyleSnapshot);
    }
  };
  return true;
}

async function captureSnapshotForModal(modalId: ShopQuadModalId, note: string): Promise<boolean> {
  const source = await waitForShopModalRoot(modalId, MODAL_CAPTURE_TIMEOUT_MS, MODAL_CAPTURE_POLL_MS);
  if (!source) {
    setInteractivePaneState(modalId, {
      isStale: true,
      error: `Snapshot missed: ${note}`,
      liveDetected: false,
    });
    return false;
  }

  await waitFrames(2);
  snapshotModal(modalId, source);
  markPaneSnapshot(modalId);
  setInteractivePaneState(modalId, {
    hasSnapshot: true,
    liveDetected: modalId === interactiveActiveModalId,
    error: null,
  });
  paintLab();
  return true;
}

function scheduleInteractiveSnapshot(modalId: ShopQuadModalId, note: string): void {
  if (!interactiveQuadRunning) {
    return;
  }
  setInteractivePaneState(modalId, { isStale: true });
  if (interactiveSnapshotTimer != null) {
    window.clearTimeout(interactiveSnapshotTimer);
  }
  interactiveSnapshotTimer = window.setTimeout(() => {
    interactiveSnapshotTimer = null;
    void captureSnapshotForModal(modalId, note);
  }, config.snapshotCaptureDebounceMs);
}

function markInteractiveActivePane(
  activePane: ShopQuadModalId | null,
  liveDetected: boolean,
  errorByPane?: Partial<Record<ShopQuadModalId, string | null>>,
): void {
  const current = status.interactiveQuad;
  let changed =
    current.enabled !== interactiveQuadRunning ||
    current.activePane !== activePane ||
    current.liveModalDetected !== liveDetected ||
    current.lastActivationAt !== interactiveLastActivationAt;

  const next = cloneStatus(status);
  next.interactiveQuad.enabled = interactiveQuadRunning;
  next.interactiveQuad.hostMounted = interactiveSurface?.isMounted() ?? false;
  next.interactiveQuad.activePane = activePane;
  next.interactiveQuad.liveModalDetected = liveDetected;
  next.interactiveQuad.lastActivationAt = interactiveLastActivationAt;

  for (const modalId of SHOP_MODAL_IDS) {
    const pane = next.interactiveQuad.paneStates[modalId];
    const prevPane = current.paneStates[modalId];
    pane.isActive = modalId === activePane;
    pane.liveDetected = pane.isActive && liveDetected;
    if (errorByPane && Object.prototype.hasOwnProperty.call(errorByPane, modalId)) {
      pane.error = errorByPane[modalId] ?? null;
      pane.lastError = pane.error;
    } else if (pane.isActive) {
      pane.error = null;
      pane.lastError = null;
    }
    pane.mode = getPaneMode(pane);
    changed =
      changed ||
      prevPane.isActive !== pane.isActive ||
      prevPane.liveDetected !== pane.liveDetected ||
      prevPane.error !== pane.error ||
      prevPane.mode !== pane.mode ||
      prevPane.lastError !== pane.lastError;
  }

  if (!changed) {
    return;
  }

  setStatus(next);
}

async function activateInteractivePane(modalId: ShopQuadModalId): Promise<boolean> {
  if (!interactiveQuadRunning || !interactiveActiveAtom || interactiveActivationInFlight) {
    return false;
  }

  const now = Date.now();
  if (interactiveLastActivationAt && now - interactiveLastActivationAt < config.clickActivationDebounceMs) {
    return false;
  }

  interactiveActivationInFlight = true;
  interactiveLastActivationAt = now;

  try {
    const previousPane = interactiveActiveModalId;
    if (previousPane) {
      await captureSnapshotForModal(previousPane, 'Captured while switching active pane.');
    }

    clearInteractiveLiveModalBinding();
    armInteractiveOpenGuard();
    if (!(await setActiveModalValue(interactiveActiveAtom, modalId))) {
      markInteractiveActivePane(previousPane, false, {
        [modalId]: 'Failed to activate native modal.',
      });
      return false;
    }

    let root: HTMLElement | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await wait(INTERACTIVE_ACTIVATION_SETTLE_MS + attempt * 80);
      root = await waitForShopModalRoot(modalId, 1_200 + attempt * 620, MODAL_CAPTURE_POLL_MS);
      if (root) {
        break;
      }
      if (attempt < 5) {
        await setActiveModalValue(interactiveActiveAtom, modalId);
      }
    }
    if (!root) {
      const anyRoot = findAnyShopModalRoot(modalId);
      const classified = anyRoot ? classifyShopModalRoot(anyRoot) : null;
      const anySize = anyRoot ? getElementBaseSize(anyRoot) : null;
      const sizeText = anySize ? ` (${Math.round(anySize.width)}x${Math.round(anySize.height)})` : '';
      interactiveActiveModalId = null;
      markInteractiveActivePane(null, false, {
        [modalId]: classified
          ? `Native modal root not detected after activation. Visible shop looked like ${classified}${sizeText}.`
          : 'Native modal root not detected after activation.',
      });
      return false;
    }

    interactiveActiveModalId = modalId;
    if (!applyLiveModalToPane(modalId, root)) {
      const reason = interactiveLastPlacementFailure ?? 'unknown placement failure';
      interactiveActiveModalId = null;
      markInteractiveActivePane(null, false, {
        [modalId]: `Failed to apply native in-pane style profile. ${reason}`,
      });
      return false;
    }

    markInteractiveActivePane(modalId, true);

    const next = cloneStatus(status);
    next.summary =
      'Interactive quad is active in fullscreen host. Click a pane once to activate it, then interact natively inside that pane.';
    setStatus(next);

    return true;
  } finally {
    interactiveActivationInFlight = false;
  }
}

function scheduleInteractivePlacementRefresh(): void {
  if (!interactiveQuadRunning) {
    return;
  }
  if (interactiveResizeTimer != null) {
    window.clearTimeout(interactiveResizeTimer);
  }
  interactiveResizeTimer = window.setTimeout(() => {
    interactiveResizeTimer = null;
    refreshInteractiveLivePlacement();
  }, INTERACTIVE_RESIZE_DEBOUNCE_MS);
}

function onInteractiveViewportShift(): void {
  scheduleInteractivePlacementRefresh();
}

function clearInteractiveTimers(): void {
  if (interactiveSyncTimer != null) {
    window.clearInterval(interactiveSyncTimer);
  }
  interactiveSyncTimer = null;
  if (interactiveSnapshotTimer != null) {
    window.clearTimeout(interactiveSnapshotTimer);
  }
  interactiveSnapshotTimer = null;
  if (interactiveResizeTimer != null) {
    window.clearTimeout(interactiveResizeTimer);
  }
  interactiveResizeTimer = null;
}

async function syncInteractiveRuntime(): Promise<void> {
  if (!interactiveQuadRunning || !interactiveActiveAtom || interactiveSyncInFlight || interactiveActivationInFlight) {
    return;
  }
  if (!interactiveSurface?.isMounted()) {
    await stopInteractiveShopQuadViewInternal(
      'Click-quad host was closed unexpectedly. Quad session has been stopped.',
      true,
    );
    return;
  }

  interactiveSyncInFlight = true;
  try {
    const liveModal = await readAtomValue<unknown>(interactiveActiveAtom).catch(() => null);
    const liveModalId = typeof liveModal === 'string' ? liveModal : null;

    if (!interactiveActiveModalId) {
      return;
    }

    if (liveModalId !== interactiveActiveModalId) {
      await stopInteractiveShopQuadViewInternal(
        'Active native modal closed or was externally replaced. Quad session closed as one logical modal.',
        false,
      );
      return;
    }

    if (!interactiveLiveModalRoot?.isConnected) {
      const root = await waitForShopModalRoot(interactiveActiveModalId, 1_600, MODAL_CAPTURE_POLL_MS);
      if (!root) {
        await stopInteractiveShopQuadViewInternal(
          'Live native modal detached unexpectedly. Quad session was closed for consistency.',
          false,
        );
        return;
      }
      if (!applyLiveModalToPane(interactiveActiveModalId, root)) {
        await stopInteractiveShopQuadViewInternal(
          'Unable to re-attach live native modal style. Quad session has been closed safely.',
          false,
        );
        return;
      }
    }

    refreshInteractiveLivePlacement();
    markInteractiveActivePane(interactiveActiveModalId, true);
  } finally {
    interactiveSyncInFlight = false;
  }
}

function attachInteractiveGlobalListeners(): void {
  window.addEventListener('resize', onInteractiveViewportShift);
  window.addEventListener('scroll', onInteractiveViewportShift, true);
}

function detachInteractiveGlobalListeners(): void {
  window.removeEventListener('resize', onInteractiveViewportShift);
  window.removeEventListener('scroll', onInteractiveViewportShift, true);
}

async function primeSnapshotsForInteractive(
  atom: unknown,
  modalIds: readonly ShopQuadModalId[],
): Promise<void> {
  if (modalIds.length === 0) {
    return;
  }

  const previousModal = await readAtomValue<unknown>(atom)
    .then((value) => (typeof value === 'string' ? value : null))
    .catch(() => null);

  for (const modalId of modalIds) {
    const opened = await setActiveModalValue(atom, modalId);
    if (!opened) {
      setInteractivePaneState(modalId, {
        error: 'Failed to open while priming snapshot.',
      });
      continue;
    }
    await wait(MODAL_SETTLE_MS + 40);
    let captured = false;
    for (let attempt = 0; attempt < MODAL_PRIME_RETRY_COUNT; attempt += 1) {
      if (attempt > 0) {
        await wait(220 + attempt * 120);
        await setActiveModalValue(atom, modalId);
        await wait(MODAL_SETTLE_MS + 80 + attempt * 90);
      }
      const label =
        attempt === 0 ? 'Primed at interactive start.' : `Primed at interactive start (retry ${attempt}).`;
      captured = await captureSnapshotForModal(modalId, label);
      if (captured) {
        break;
      }
    }
    if (!captured) {
      setInteractivePaneState(modalId, {
        isStale: true,
        error: 'Snapshot missed during interactive warm-up.',
      });
    }
  }

  if (previousModal) {
    await setActiveModalValue(atom, previousModal);
  } else {
    await setActiveModalValue(atom, null);
  }
  await wait(RESTORE_SETTLE_MS);
}

function createOutcomeLabel(outcome: ShopQuadSpikeOutcome): string {
  switch (outcome) {
    case 'running':
      return 'Running';
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'blocked':
      return 'Blocked';
    case 'idle':
    default:
      return 'Idle';
  }
}

function createOutcomeStyle(outcome: ShopQuadSpikeOutcome): string {
  switch (outcome) {
    case 'passed':
      return 'background:rgba(41,128,90,0.32);border-color:rgba(88,214,141,0.55);color:#d5ffe7;';
    case 'failed':
      return 'background:rgba(176,58,46,0.3);border-color:rgba(236,112,99,0.6);color:#ffd8d2;';
    case 'blocked':
      return 'background:rgba(183,149,11,0.28);border-color:rgba(247,220,111,0.55);color:#fff3c5;';
    case 'running':
      return 'background:rgba(40,116,166,0.28);border-color:rgba(133,193,233,0.6);color:#d8efff;';
    case 'idle':
    default:
      return 'background:rgba(90,96,110,0.24);border-color:rgba(174,182,191,0.42);color:#e6ebf0;';
  }
}

function handlePaneActivationClick(modalId: ShopQuadModalId, event: MouseEvent): void {
  if (!interactiveQuadRunning) {
    return;
  }
  if (interactiveActiveModalId === modalId && status.interactiveQuad.liveModalDetected) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target?.closest('button')) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  void activateInteractivePane(modalId);
}

function createPaneCard(modalId: ShopQuadModalId, parent: HTMLElement): LabPaneRefs {
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-height:220px;border:1px solid rgba(148,163,184,0.28);border-radius:10px;background:rgba(15,23,42,0.45);padding:10px;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';

  const title = document.createElement('div');
  title.textContent = MODAL_DISPLAY_NAME[modalId];
  title.style.cssText = 'font-size:12px;font-weight:700;color:#e2e8f0;letter-spacing:0.3px;';

  const badge = document.createElement('div');
  badge.style.cssText = 'font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid rgba(148,163,184,0.4);color:#cbd5e1;background:rgba(15,23,42,0.66);';
  badge.textContent = 'No snapshot';

  header.append(title, badge);

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';

  const activateButton = document.createElement('button');
  activateButton.type = 'button';
  activateButton.textContent = 'Activate Native';
  activateButton.style.cssText = 'height:30px;padding:0 10px;border-radius:7px;border:1px solid rgba(125,211,252,0.45);background:rgba(14,116,144,0.34);color:#dff6ff;font-size:11px;cursor:pointer;';
  activateButton.addEventListener('click', () => {
    if (interactiveQuadRunning) {
      void activateInteractivePane(modalId);
      return;
    }
    void openSingleModal(modalId);
  });

  const snapshotButton = document.createElement('button');
  snapshotButton.type = 'button';
  snapshotButton.textContent = 'Capture Slot';
  snapshotButton.style.cssText = 'height:30px;padding:0 10px;border-radius:7px;border:1px solid rgba(129,140,248,0.45);background:rgba(49,46,129,0.34);color:#e0e7ff;font-size:11px;cursor:pointer;';
  snapshotButton.addEventListener('click', () => {
    void captureOneSlot(modalId);
  });

  controls.append(activateButton, snapshotButton);

  const note = document.createElement('div');
  note.style.cssText = 'font-size:11px;color:#cbd5e1;line-height:1.4;min-height:16px;';

  const viewport = document.createElement('div');
  viewport.style.cssText = 'position:relative;flex:1;min-height:140px;overflow:auto;border:1px dashed rgba(148,163,184,0.35);border-radius:8px;background:rgba(2,6,23,0.72);padding:8px;cursor:default;';

  panel.addEventListener('click', (event) => {
    handlePaneActivationClick(modalId, event);
  });

  panel.append(header, controls, note, viewport);
  parent.appendChild(panel);

  return {
    panel,
    badge,
    note,
    viewport,
  };
}

function createLabWindow(root: HTMLElement): void {
  root.innerHTML = '';
  root.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:0;width:100%;height:100%;min-height:0;overflow:auto;';
  if (root.parentElement) {
    root.parentElement.style.overflow = 'auto';
    root.parentElement.style.minHeight = '0';
  }

  const intro = document.createElement('div');
  intro.style.cssText = 'font-size:12px;line-height:1.55;color:#d7e2f0;padding:10px;border:1px solid rgba(125,211,252,0.25);border-radius:8px;background:rgba(12,74,110,0.16);';
  intro.textContent =
    'Phase 0/0.5 native quad-shop lab. Probe mode collects feasibility evidence. Interactive mode now launches a fullscreen click-to-activate quad host (one live native pane at a time) while this window remains diagnostics-only.';

  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;';

  const summary = document.createElement('div');
  summary.style.cssText = 'font-size:12px;color:#dbeafe;line-height:1.5;flex:1;';

  const outcomeBadge = document.createElement('div');
  outcomeBadge.style.cssText = 'font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;border:1px solid rgba(148,163,184,0.4);';

  topRow.append(summary, outcomeBadge);

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';

  const runButton = document.createElement('button');
  runButton.type = 'button';
  runButton.textContent = 'Run Native Quad Probe';
  runButton.style.cssText = 'height:34px;padding:0 14px;border-radius:8px;border:1px solid rgba(94,234,212,0.42);background:rgba(13,148,136,0.3);color:#d9fffb;font-size:12px;font-weight:600;cursor:pointer;';
  runButton.addEventListener('click', () => {
    void runShopQuadModalSpike();
  });

  const armButton = document.createElement('button');
  armButton.type = 'button';
  armButton.textContent = 'Arm Write Capture';
  armButton.style.cssText = 'height:34px;padding:0 14px;border-radius:8px;border:1px solid rgba(125,211,252,0.42);background:rgba(3,105,161,0.3);color:#dbeafe;font-size:12px;cursor:pointer;';
  armButton.addEventListener('click', () => {
    armShopQuadModalWritableCapture();
  });

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = 'Clear Snapshots';
  clearButton.style.cssText = 'height:34px;padding:0 14px;border-radius:8px;border:1px solid rgba(148,163,184,0.38);background:rgba(15,23,42,0.62);color:#e2e8f0;font-size:12px;cursor:pointer;';
  clearButton.addEventListener('click', () => {
    clearSnapshots();
  });

  const closeNativeButton = document.createElement('button');
  closeNativeButton.type = 'button';
  closeNativeButton.textContent = 'Close Active Modal';
  closeNativeButton.style.cssText = 'height:34px;padding:0 14px;border-radius:8px;border:1px solid rgba(191,219,254,0.35);background:rgba(30,58,138,0.28);color:#dbeafe;font-size:12px;cursor:pointer;';
  closeNativeButton.addEventListener('click', () => {
    void closeActiveModal();
  });

  const interactiveButton = document.createElement('button');
  interactiveButton.type = 'button';
  interactiveButton.textContent = 'Start Click Quad';
  interactiveButton.style.cssText = 'height:34px;padding:0 14px;border-radius:8px;border:1px solid rgba(52,211,153,0.45);background:rgba(5,150,105,0.3);color:#dcfce7;font-size:12px;font-weight:600;cursor:pointer;';
  interactiveButton.addEventListener('click', () => {
    void startInteractiveShopQuadView();
  });

  const interactiveStopButton = document.createElement('button');
  interactiveStopButton.type = 'button';
  interactiveStopButton.textContent = 'Stop Click Quad';
  interactiveStopButton.style.cssText = 'height:34px;padding:0 14px;border-radius:8px;border:1px solid rgba(251,146,60,0.45);background:rgba(194,65,12,0.28);color:#ffedd5;font-size:12px;cursor:pointer;';
  interactiveStopButton.addEventListener('click', () => {
    void stopInteractiveShopQuadView();
  });

  controls.append(runButton, interactiveButton, interactiveStopButton, armButton, clearButton, closeNativeButton);

  const details = document.createElement('div');
  details.style.cssText = 'font-size:11px;line-height:1.5;color:#cbd5e1;padding:10px;border:1px solid rgba(148,163,184,0.22);border-radius:8px;background:rgba(2,6,23,0.58);white-space:pre-wrap;';

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:10px;';

  const panes = {
    seedShop: createPaneCard('seedShop', grid),
    toolShop: createPaneCard('toolShop', grid),
    eggShop: createPaneCard('eggShop', grid),
    decorShop: createPaneCard('decorShop', grid),
  };

  root.append(intro, topRow, controls, details, grid);

  labRefs = {
    summary,
    outcomeBadge,
    details,
    panes,
    runButton,
    interactiveButton,
    interactiveStopButton,
  };

  paintLab();
}

function paintPane(modalId: ShopQuadModalId, pane: LabPaneRefs): void {
  const probe = status.probes.find((entry) => entry.modalId === modalId);
  const snapshot = modalSnapshots.get(modalId);
  const interactivePane = status.interactiveQuad.paneStates[modalId];
  const isInteractiveActive = status.interactiveQuad.enabled && interactivePane.isActive;
  const isLive =
    interactivePane.mode === 'live' &&
    isInteractiveActive &&
    status.interactiveQuad.liveModalDetected &&
    interactivePane.liveDetected;
  pane.viewport.style.cursor = status.interactiveQuad.enabled && !isInteractiveActive ? 'pointer' : 'default';

  if (isLive) {
    pane.badge.textContent = 'Live native';
    pane.badge.style.cssText = 'font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid rgba(52,211,153,0.7);color:#d1fae5;background:rgba(6,95,70,0.45);';
    pane.viewport.innerHTML =
      '<div style="font-size:11px;color:#86efac;line-height:1.45;">Live native modal is pinned to this pane. Interact directly; click another pane to switch active control.</div>';
    pane.panel.style.borderColor = 'rgba(52,211,153,0.75)';
    pane.panel.style.boxShadow = '0 0 0 1px rgba(16,185,129,0.32) inset';
  } else if (snapshot) {
    pane.badge.textContent = 'Snapshot ready';
    pane.badge.style.cssText = 'font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid rgba(94,234,212,0.55);color:#ccfbf1;background:rgba(13,148,136,0.28);';
    pane.viewport.innerHTML = '';
    pane.viewport.appendChild(snapshot.cloneNode(true));
    pane.panel.style.borderColor = 'rgba(148,163,184,0.28)';
    pane.panel.style.boxShadow = 'none';
  } else {
    pane.badge.textContent = 'No snapshot';
    pane.badge.style.cssText = 'font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid rgba(148,163,184,0.4);color:#cbd5e1;background:rgba(15,23,42,0.66);';
    pane.viewport.innerHTML = '<div style="font-size:11px;color:#94a3b8;line-height:1.45;">Capture this slot to freeze the native modal look for side-by-side inspection. In click-quad mode, click this pane once to activate native interaction.</div>';
    pane.panel.style.borderColor = 'rgba(148,163,184,0.28)';
    pane.panel.style.boxShadow = 'none';
  }

  if (!probe) {
    pane.note.textContent = 'No probe data.';
    return;
  }

  const bits: string[] = [];
  bits.push(probe.liveDetected ? 'Live detected' : 'Live not detected');
  if (probe.visibleModalCount != null) {
    bits.push(`Visible-count sample: ${probe.visibleModalCount}`);
  }
  if (probe.notes.length > 0) {
    bits.push(probe.notes[probe.notes.length - 1] ?? '');
  }
  if (status.interactiveQuad.enabled) {
    if (interactivePane.error || interactivePane.lastError) {
      bits.push(`error: ${interactivePane.error ?? interactivePane.lastError}`);
    } else if (interactivePane.isActive) {
      bits.push('active-pane');
    }
    if (interactivePane.isStale) {
      bits.push('snapshot-stale');
    }
    bits.push(`mode:${interactivePane.mode}`);
  }
  pane.note.textContent = bits.join(' | ');
}

function paintLab(): void {
  if (!labRefs) {
    return;
  }

  labRefs.summary.textContent = status.summary;
  labRefs.outcomeBadge.textContent = createOutcomeLabel(status.outcome);
  labRefs.outcomeBadge.style.cssText = `font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;border:1px solid rgba(148,163,184,0.4);${createOutcomeStyle(status.outcome)}`;
  labRefs.runButton.disabled = running;
  labRefs.runButton.textContent = running ? 'Running...' : 'Run Native Quad Probe';
  labRefs.interactiveButton.disabled = interactiveQuadRunning || running;
  labRefs.interactiveButton.textContent = interactiveQuadRunning ? 'Click Quad Active' : 'Start Click Quad';
  labRefs.interactiveStopButton.disabled = !interactiveQuadRunning;

  const lines: string[] = [];
  lines.push(`Writable store: ${status.writableStore ? 'yes' : 'no'}`);
  lines.push(`Store source: ${status.storeSource ?? 'unknown'}`);
  lines.push(`activeModal atom found: ${status.activeModalAtomFound ? 'yes' : 'no'}`);
  lines.push(`activeModal writable: ${status.activeModalWritable ? 'yes' : 'no'}`);
  lines.push(`Manual capture armed: ${status.manualCaptureArmed ? 'yes' : 'no'}`);
  lines.push(`Manual capture ready: ${status.manualCaptureReady ? 'yes' : 'no'}`);
  if (status.manualCaptureMessage) {
    lines.push(`Manual capture message: ${status.manualCaptureMessage}`);
  }
  lines.push(`Single-modal gate detected: ${status.singleModalGateDetected ? 'yes' : 'no'}`);
  lines.push(`Interactive quad enabled: ${status.interactiveQuad.enabled ? 'yes' : 'no'}`);
  lines.push(`Interactive host mounted: ${status.interactiveQuad.hostMounted ? 'yes' : 'no'}`);
  lines.push(`Interactive active pane: ${status.interactiveQuad.activePane ?? 'none'}`);
  lines.push(`Interactive live modal detected: ${status.interactiveQuad.liveModalDetected ? 'yes' : 'no'}`);
  lines.push(`Shipping gate: ${status.shippingGate}`);
  lines.push(`Pass criteria -> visible: ${status.passCriteria.allFourVisible ? 'yes' : 'no'}, interactive: ${status.passCriteria.allFourInteractive ? 'yes' : 'no'}, no-thrash: ${status.passCriteria.noFlickerOrStateThrash ? 'yes' : 'no'}, stable-restock: ${status.passCriteria.stableAcrossRestockCycle ? 'yes' : 'no'}`);
  labRefs.details.textContent = lines.join('\n');

  for (const modalId of SHOP_MODAL_IDS) {
    paintPane(modalId, labRefs.panes[modalId]);
  }
}

function isStoreLike(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { get?: unknown; set?: unknown; sub?: unknown };
  return (
    typeof candidate.get === 'function' &&
    typeof candidate.set === 'function' &&
    typeof candidate.sub === 'function'
  );
}

function detectWritableCandidateKeys(): string[] {
  const found = new Set<string>();
  const win = window as unknown as {
    AriesMod?: { services?: { jotaiStore?: unknown } };
  } & Record<string, unknown>;

  const ariesStore = win.AriesMod?.services?.jotaiStore;
  if (isStoreLike(ariesStore)) {
    found.add('AriesMod.services.jotaiStore');
  }

  for (const key of STORE_CANDIDATE_KEYS) {
    const candidate = win[key];
    if (isStoreLike(candidate)) {
      found.add(key);
    }
  }

  return Array.from(found.values());
}

async function resolveActiveModalRuntime(): Promise<{
  atom: unknown | null;
  writableStore: boolean;
  activeModalWritable: boolean;
  source: string | null;
}> {
  await ensureJotaiStore();

  const captureInfo = getCapturedInfo();
  const writableStore = Boolean((captureInfo.hasStore && !captureInfo.isReadOnly) || manualCaptureReady);
  const atom = getAtomByLabel('activeModalAtom');
  const source = manualCaptureReady
    ? 'manual-activeModal-capture'
    : (captureInfo.source ?? null);

  if (!atom || !writableStore) {
    return {
      atom,
      writableStore,
      activeModalWritable: false,
      source,
    };
  }

  const activeModalWritable = await canWriteActiveModal(atom);
  return {
    atom,
    writableStore,
    activeModalWritable,
    source,
  };
}

async function waitForWritableActiveModalRuntime(
  waitForWritableMs: number,
  pollMs: number,
): Promise<{
  atom: unknown | null;
  writableStore: boolean;
  activeModalWritable: boolean;
  source: string | null;
}> {
  const startedAt = Date.now();
  let runtime = await resolveActiveModalRuntime();

  while (
    Date.now() - startedAt < waitForWritableMs &&
    (!runtime.atom || !runtime.writableStore || !runtime.activeModalWritable)
  ) {
    await wait(pollMs);
    runtime = await resolveActiveModalRuntime();
  }

  return runtime;
}

async function closeActiveModal(): Promise<boolean> {
  const runtime = await resolveActiveModalRuntime().catch(() => null);
  if (!runtime?.atom || !runtime.activeModalWritable) {
    return false;
  }
  return setActiveModalValue(runtime.atom, null);
}

async function openSingleModal(modalId: ShopQuadModalId): Promise<boolean> {
  const runtime = await resolveActiveModalRuntime().catch(() => null);
  if (!runtime?.atom || !runtime.activeModalWritable) {
    return false;
  }
  return setActiveModalValue(runtime.atom, modalId);
}

async function captureOneSlot(modalId: ShopQuadModalId): Promise<boolean> {
  const runtime = await resolveActiveModalRuntime().catch(() => null);
  if (!runtime?.atom || !runtime.activeModalWritable) {
    return false;
  }
  const ok = await captureSingleModalSnapshot(runtime.atom, modalId);
  if (!ok) {
    return false;
  }
  const next = cloneStatus(status);
  const probe = getProbe(modalId, next.probes);
  probe.liveDetected = true;
  probe.snapshotCaptured = true;
  pushProbeNote(probe, 'Manual slot capture completed.');
  setStatus(next);
  return true;
}

export async function startInteractiveShopQuadView(
  options?: ShopQuadInteractiveStartOptions,
): Promise<ShopQuadModalSpikeStatus> {
  if (interactiveQuadRunning) {
    return getShopQuadModalSpikeStatus();
  }
  if (running) {
    const next = cloneStatus(status);
    next.summary = 'Probe is currently running. Wait for probe completion before starting click-quad mode.';
    setStatus(next);
    return getShopQuadModalSpikeStatus();
  }

  if (typeof options?.clickActivationDebounceMs === 'number' || typeof options?.snapshotCaptureDebounceMs === 'number') {
    config = sanitizeConfig({
      ...config,
      clickActivationDebounceMs: options?.clickActivationDebounceMs ?? config.clickActivationDebounceMs,
      snapshotCaptureDebounceMs: options?.snapshotCaptureDebounceMs ?? config.snapshotCaptureDebounceMs,
    });
    saveConfig(config);
  }

  const waitForWritableMs = Math.max(0, Math.floor(options?.waitForWritableMs ?? DEFAULT_WAIT_FOR_WRITABLE_MS));
  const pollMs = Math.max(100, Math.floor(options?.pollMs ?? DEFAULT_WAIT_POLL_MS));
  const runtime = await waitForWritableActiveModalRuntime(waitForWritableMs, pollMs);

  const next = cloneStatus(status);
  next.writableStore = runtime.writableStore;
  next.activeModalAtomFound = runtime.atom != null;
  next.activeModalWritable = runtime.activeModalWritable;
  next.storeSource = runtime.source;

  if (!runtime.atom || !runtime.writableStore || !runtime.activeModalWritable) {
    next.interactiveQuad.enabled = false;
    next.interactiveQuad.hostMounted = false;
    next.interactiveQuad.activePane = null;
    next.interactiveQuad.liveModalDetected = false;
    next.summary =
      `Click-quad start blocked after waiting ${waitForWritableMs}ms. Writable activeModal access is required. Arm manual capture and retry.`;
    setStatus(next);
    return getShopQuadModalSpikeStatus();
  }

  interactiveActiveAtom = runtime.atom;
  interactiveQuadRunning = true;
  interactiveActivationInFlight = false;
  interactiveActiveModalId = null;
  interactiveLastActivationAt = null;
  clearInteractiveTimers();
  clearInteractiveLiveModalBinding();
  unmountInteractiveSurface();
  mountInteractiveSurface();
  if (isWindowOpen(WINDOW_ID)) {
    closeWindow(WINDOW_ID);
  }
  if (!interactiveSurface?.isMounted()) {
    interactiveQuadRunning = false;
    interactiveActiveAtom = null;
    const blocked = cloneStatus(status);
    blocked.interactiveQuad.enabled = false;
    blocked.interactiveQuad.hostMounted = false;
    blocked.summary = 'Click-quad host failed to mount. Runtime stayed in safe diagnostic mode.';
    setStatus(blocked);
    return getShopQuadModalSpikeStatus();
  }

  next.interactiveQuad.enabled = true;
  next.interactiveQuad.hostMounted = interactiveSurface?.isMounted() ?? false;
  next.interactiveQuad.activePane = null;
  next.interactiveQuad.liveModalDetected = false;
  next.interactiveQuad.lastActivationAt = null;
  const missingSnapshotIds: ShopQuadModalId[] = [];
  for (const modalId of SHOP_MODAL_IDS) {
    const pane = next.interactiveQuad.paneStates[modalId];
    pane.isActive = false;
    pane.liveDetected = false;
    pane.error = null;
    pane.lastError = null;
    pane.hasSnapshot = modalSnapshots.has(modalId);
    pane.mode = getPaneMode(pane);
    if (!pane.hasSnapshot) {
      missingSnapshotIds.push(modalId);
    }
  }
  next.summary = missingSnapshotIds.length > 0
    ? `Starting click-quad mode. Warming ${missingSnapshotIds.length} missing snapshot slot(s), then click a pane once to activate live native interaction.`
    : 'Starting click-quad mode. Snapshots already warm, click a pane once to activate live native interaction.';
  setStatus(next);

  await primeSnapshotsForInteractive(runtime.atom, missingSnapshotIds);
  syncInteractivePaneSnapshotFlags();

  interactiveSyncTimer = window.setInterval(() => {
    void syncInteractiveRuntime();
  }, INTERACTIVE_SYNC_MS);
  attachInteractiveGlobalListeners();

  const done = cloneStatus(status);
  done.interactiveQuad.enabled = true;
  done.interactiveQuad.hostMounted = interactiveSurface?.isMounted() ?? false;
  done.summary = missingSnapshotIds.length > 0
    ? 'Click-quad mode is active in fullscreen host. Snapshot warm-up completed; click a pane once to activate it, then interact with the native modal in that pane.'
    : 'Click-quad mode is active in fullscreen host. Click a pane once to activate it, then interact with the native modal in that pane.';
  setStatus(done);
  return getShopQuadModalSpikeStatus();
}

async function stopInteractiveShopQuadViewInternal(
  summary?: string,
  closeNativeModal = true,
): Promise<void> {
  if (!interactiveQuadRunning) {
    if (interactiveSurface?.isMounted()) {
      unmountInteractiveSurface();
      const idle = cloneStatus(status);
      idle.interactiveQuad.hostMounted = false;
      setStatus(idle);
    }
    return;
  }

  const activePane = interactiveActiveModalId;
  if (activePane && closeNativeModal) {
    await captureSnapshotForModal(activePane, 'Captured while stopping click-quad mode.');
  }

  clearInteractiveTimers();
  detachInteractiveGlobalListeners();
  clearInteractiveLiveModalBinding();

  if (closeNativeModal && interactiveActiveAtom) {
    await setActiveModalValue(interactiveActiveAtom, null);
  }

  interactiveQuadRunning = false;
  interactiveActivationInFlight = false;
  interactiveActiveModalId = null;
  interactiveActiveAtom = null;
  interactiveLastActivationAt = null;
  unmountInteractiveSurface();

  const next = cloneStatus(status);
  next.interactiveQuad.enabled = false;
  next.interactiveQuad.hostMounted = false;
  next.interactiveQuad.activePane = null;
  next.interactiveQuad.liveModalDetected = false;
  next.interactiveQuad.lastActivationAt = null;
  for (const modalId of SHOP_MODAL_IDS) {
    const pane = next.interactiveQuad.paneStates[modalId];
    pane.isActive = false;
    pane.liveDetected = false;
    pane.error = pane.error && pane.error.trim().length > 0 ? pane.error : null;
    pane.hasSnapshot = modalSnapshots.has(modalId);
    pane.mode = getPaneMode(pane);
  }
  next.summary = summary ?? 'Click-quad mode stopped. Probe and manual capture tools remain available.';
  setStatus(next);
}

export async function stopInteractiveShopQuadView(): Promise<void> {
  await stopInteractiveShopQuadViewInternal(
    'Click-quad mode stopped. Probe and manual capture tools remain available.',
    true,
  );
}

export function getInteractiveShopQuadViewStatus(): ShopQuadModalSpikeStatus['interactiveQuad'] {
  return cloneStatus(status).interactiveQuad;
}

export async function runShopQuadModalSpike(
  options?: ShopQuadRunOptions,
): Promise<ShopQuadModalSpikeStatus> {
  if (running) {
    return getShopQuadModalSpikeStatus();
  }
  if (interactiveQuadRunning) {
    await stopInteractiveShopQuadView();
  }

  running = true;

  const next = createInitialStatus();
  next.outcome = 'running';
  next.startedAt = Date.now();
  next.summary = 'Running probe: waiting for writable activeModal access, then opening each native shop modal for evidence capture.';
  setStatus(next);

  let activeModalAtom: unknown | null = null;
  let previousModal: string | null = null;
  const waitForWritableMs = Math.max(0, Math.floor(options?.waitForWritableMs ?? DEFAULT_WAIT_FOR_WRITABLE_MS));
  const pollMs = Math.max(100, Math.floor(options?.pollMs ?? DEFAULT_WAIT_POLL_MS));

  try {
    const runtime = await waitForWritableActiveModalRuntime(waitForWritableMs, pollMs);
    activeModalAtom = runtime.atom;

    const working = cloneStatus(status);
    working.writableStore = runtime.writableStore;
    working.activeModalAtomFound = activeModalAtom != null;
    working.activeModalWritable = runtime.activeModalWritable;
    working.storeSource = runtime.source;

    if (!runtime.writableStore || !activeModalAtom || !runtime.activeModalWritable) {
      const diagnostics = getShopQuadModalRuntimeDiagnostics();
      const keyHint = diagnostics.writableCandidateKeys.length > 0
        ? `Detected candidate stores: ${diagnostics.writableCandidateKeys.join(', ')}.`
        : 'No writable store candidates detected on window globals.';
      const armHint = manualCaptureReady
        ? 'Manual capture is ready, but activeModal writes still failed.'
        : 'Try armShopQuadModalWritableCapture(), then open/close a native shop modal once, then run again.';
      working.outcome = 'blocked';
      working.finishedAt = Date.now();
      working.shippingGate = 'paused';
      working.summary = `Probe blocked after waiting ${waitForWritableMs}ms. Native modal writes require a writable Jotai store and activeModal control. ${keyHint} ${armHint}`;
      setStatus(working);
      running = false;
      return getShopQuadModalSpikeStatus();
    }

    modalSnapshots.clear();

    previousModal = await readAtomValue<unknown>(activeModalAtom)
      .then((value) => (typeof value === 'string' ? value : null))
      .catch(() => null);

    for (const modalId of SHOP_MODAL_IDS) {
      const probe = getProbe(modalId, working.probes);

      const opened = await setActiveModalValue(activeModalAtom, modalId);
      probe.opened = opened;
      if (!opened) {
        pushProbeNote(probe, 'Failed to set activeModal to this shop.');
        continue;
      }

      await wait(MODAL_SETTLE_MS);

      const modalRoot = await waitForShopModalRoot(modalId);
      if (!modalRoot) {
        pushProbeNote(probe, 'Could not locate rendered native modal in DOM.');
      } else {
        probe.liveDetected = true;
        snapshotModal(modalId, modalRoot);
        probe.snapshotCaptured = true;
      }

      const visibleCount = countVisibleShopModals();
      probe.visibleModalCount = visibleCount;
      if (visibleCount <= 1) {
        working.singleModalGateDetected = true;
      }

      if (visibleCount > 1) {
        pushProbeNote(probe, `Observed ${visibleCount} visible shop modal roots.`);
      } else {
        pushProbeNote(probe, 'Observed one-or-fewer visible shop modal roots after switch.');
      }
    }

    if (previousModal !== null) {
      await setActiveModalValue(activeModalAtom, previousModal);
    } else {
      await setActiveModalValue(activeModalAtom, null);
    }
    await wait(RESTORE_SETTLE_MS);

    const maxVisibleCount = working.probes.reduce((max, probe) => {
      const value = probe.visibleModalCount ?? 0;
      return value > max ? value : max;
    }, 0);
    const allVisible = maxVisibleCount >= 4;
    const noThrash = !working.singleModalGateDetected;

    // Current game architecture uses a single activeModal switch (confirmed in preview source).
    // Because only one modal can remain mounted at a time, true independent 4x interactivity fails here.
    const allInteractive = false;
    const stableAcrossRestockCycle = false;

    working.passCriteria = {
      allFourVisible: allVisible,
      allFourInteractive: allInteractive,
      noFlickerOrStateThrash: noThrash,
      stableAcrossRestockCycle,
    };

    const passed =
      working.passCriteria.allFourVisible &&
      working.passCriteria.allFourInteractive &&
      working.passCriteria.noFlickerOrStateThrash &&
      working.passCriteria.stableAcrossRestockCycle;

    working.outcome = passed ? 'passed' : 'failed';
    working.finishedAt = Date.now();
    working.shippingGate = passed ? 'clear' : 'paused';

    if (passed) {
      working.summary = 'Native quad-shop pass criteria met. 4x modal rendering appears viable.';
    } else {
      working.summary =
        `Native quad-shop criteria failed. Highest simultaneous visible native shop modal count observed: ${maxVisibleCount}. The client is single-gated by activeModal, so only one native shop modal remains interactive at a time. Modal shipping is paused for this cycle.`;
    }

    setStatus(working);
    syncInteractivePaneSnapshotFlags();
    return getShopQuadModalSpikeStatus();
  } catch (error) {
    const failed = cloneStatus(status);
    failed.outcome = 'failed';
    failed.finishedAt = Date.now();
    failed.shippingGate = 'paused';
    failed.summary = 'Probe crashed before completion. Modal shipping remains paused.';
    setStatus(failed);
    log('[ShopQuadSpike] Probe crash', error);
    return getShopQuadModalSpikeStatus();
  } finally {
    if (activeModalAtom && previousModal == null) {
      await setActiveModalValue(activeModalAtom, null);
    }
    running = false;
    paintLab();
  }
}

export function initializeShopQuadModalSpike(): void {
  if (initialized) {
    return;
  }

  initialized = true;
  config = loadConfig();
  status = createInitialStatus();
  emitStatus();

  if (config.enabled && config.autoOpenLab) {
    openShopQuadModalSpikeLab();
    if (config.interactiveQuadEnabled) {
      void startInteractiveShopQuadView();
    }
  }
}

export function armShopQuadModalWritableCapture(options?: ShopQuadArmOptions): {
  armed: boolean;
  ready: boolean;
  message: string;
} {
  const result = armManualWritableCaptureInternal(options);
  return {
    armed: result.armed,
    ready: manualCaptureReady,
    message: result.message,
  };
}

export function stopShopQuadModalSpike(): void {
  running = false;
  modalSnapshots.clear();
  clearInteractiveTimers();
  detachInteractiveGlobalListeners();
  clearInteractiveLiveModalBinding();
  clearInteractiveOpenGuard();
  unmountInteractiveSurface();
  interactiveQuadRunning = false;
  interactiveActiveModalId = null;
  interactiveActiveAtom = null;
  clearManualCapturePatch();
  if (isWindowOpen(WINDOW_ID)) {
    closeWindow(WINDOW_ID);
  }
  labRefs = null;
}

export function getShopQuadModalSpikeStatus(): ShopQuadModalSpikeStatus {
  return cloneStatus(status);
}

export function getShopQuadModalRuntimeDiagnostics(): ShopQuadRuntimeDiagnostics {
  return {
    captured: getCapturedInfo(),
    writableCandidateKeys: detectWritableCandidateKeys(),
    activeModalAtomFound: getAtomByLabel('activeModalAtom') != null,
    manualCapture: {
      armed: manualCaptureArmed,
      ready: manualCaptureReady,
      capturedAt: manualCaptureCapturedAt,
      message: manualCaptureMessage,
    },
    interactive: {
      running: interactiveQuadRunning,
      hostMounted: interactiveSurface?.isMounted() ?? false,
      activePane: interactiveActiveModalId,
      liveRootConnected: Boolean(interactiveLiveModalRoot?.isConnected),
      lastPlacementFailure: interactiveLastPlacementFailure,
      lastPlacementMetrics: {
        modalId: interactiveLastPlacementMetrics.modalId,
        viewport: interactiveLastPlacementMetrics.viewport
          ? { ...interactiveLastPlacementMetrics.viewport }
          : null,
        baseSize: interactiveLastPlacementMetrics.baseSize
          ? { ...interactiveLastPlacementMetrics.baseSize }
          : null,
        hostMounted: interactiveLastPlacementMetrics.hostMounted,
        hasSurfaceRect: interactiveLastPlacementMetrics.hasSurfaceRect,
        usedFallbackRect: interactiveLastPlacementMetrics.usedFallbackRect,
        rootConnected: interactiveLastPlacementMetrics.rootConnected,
        timestamp: interactiveLastPlacementMetrics.timestamp,
      },
    },
  };
}

export function getShopQuadModalSpikeConfig(): ShopQuadModalSpikeConfig {
  return { ...config };
}

export function updateShopQuadModalSpikeConfig(
  patch: Partial<ShopQuadModalSpikeConfig>,
): ShopQuadModalSpikeConfig {
  config = sanitizeConfig({
    ...config,
    ...patch,
  });
  saveConfig(config);
  if (!config.interactiveQuadEnabled && interactiveQuadRunning) {
    void stopInteractiveShopQuadView();
  }
  return getShopQuadModalSpikeConfig();
}

export function openShopQuadModalSpikeLab(): boolean {
  if (isWindowOpen(WINDOW_ID)) {
    return true;
  }
  toggleWindow(
    WINDOW_ID,
    'Shop Quad Modal Spike',
    (root) => createLabWindow(root),
    '96vw',
    '94vh',
  );
  if (interactiveQuadRunning) {
    scheduleInteractivePlacementRefresh();
  }
  return isWindowOpen(WINDOW_ID);
}
