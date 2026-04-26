// src/ui/playerCompareFloatingCard.ts
// Detached, draggable floating card comparing economy stats with another player.

import { storage } from '../utils/storage';
import { formatCoinsAbbreviated } from '../features/valueCalculator';
import {
  getRoomPlayersSnapshot,
  onRoomPlayersChange,
  type RoomPlayerEconomy,
  type RoomPlayersSnapshot,
} from '../features/roomPlayerEconomy';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'qpm.playerCompareCard.v1';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const STYLES = `
.qpm-pcmp-card {
  position: fixed;
  background: rgba(18,20,26,0.96);
  border: 1px solid rgba(143,130,255,0.45);
  border-radius: 9px;
  width: 260px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.55);
  z-index: 999990;
  font-family: inherit;
  user-select: none;
  overflow: hidden;
}
.qpm-pcmp-card__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  cursor: grab;
  background: rgba(143,130,255,0.08);
  border-bottom: 1px solid rgba(143,130,255,0.18);
}
.qpm-pcmp-card__header:active { cursor: grabbing; }
.qpm-pcmp-card__label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  color: #e0e0e0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qpm-pcmp-card__close {
  width: 18px;
  height: 18px;
  background: none;
  border: none;
  color: rgba(224,224,224,0.45);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
  transition: color 0.12s, background 0.12s;
}
.qpm-pcmp-card__close:hover { color: #e0e0e0; background: rgba(255,255,255,0.1); }
.qpm-pcmp-card__body {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.qpm-pcmp-card__row {
  display: grid;
  grid-template-columns: 52px 1fr 1fr 1fr;
  gap: 4px;
  align-items: center;
  font-size: 11px;
  line-height: 1.3;
}
.qpm-pcmp-card__row--header {
  font-weight: 700;
  color: rgba(224,224,224,0.55);
  font-size: 10px;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(143,130,255,0.12);
  margin-bottom: 2px;
}
.qpm-pcmp-card__metric {
  color: rgba(224,224,224,0.5);
  font-weight: 600;
}
.qpm-pcmp-card__val {
  text-align: right;
  color: #ffd600;
  font-weight: 700;
}
.qpm-pcmp-card__delta {
  text-align: right;
  font-weight: 700;
  font-size: 10px;
}
.qpm-pcmp-card__gone {
  color: rgba(224,224,224,0.35);
  font-size: 11px;
  padding: 8px 0;
  text-align: center;
}
`;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface PersistedState {
  targetPlayerId: string | null;
  x: number;
  y: number;
}

function loadPersistedState(): PersistedState {
  const stored = storage.get<PersistedState>(STORAGE_KEY, { targetPlayerId: null, x: -1, y: -1 });
  if (!stored || typeof stored !== 'object') return { targetPlayerId: null, x: -1, y: -1 };
  return {
    targetPlayerId: typeof stored.targetPlayerId === 'string' ? stored.targetPlayerId : null,
    x: Number.isFinite(stored.x) ? stored.x : -1,
    y: Number.isFinite(stored.y) ? stored.y : -1,
  };
}

function persistState(targetPlayerId: string | null, x: number, y: number): void {
  storage.set(STORAGE_KEY, { targetPlayerId, x, y } satisfies PersistedState);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let cardEl: HTMLElement | null = null;
let currentTargetId: string | null = null;
let destroyed = false;
let stylesInjected = false;
const cleanups: Array<() => void> = [];

// ---------------------------------------------------------------------------
// Position helpers
// ---------------------------------------------------------------------------

function clampPosition(x: number, y: number): { x: number; y: number } {
  const maxX = Math.max(0, window.innerWidth - 280);
  const maxY = Math.max(0, window.innerHeight - 100);
  return {
    x: Math.max(0, Math.min(maxX, Math.round(x))),
    y: Math.max(0, Math.min(maxY, Math.round(y))),
  };
}

function getDefaultPosition(): { x: number; y: number } {
  return clampPosition(window.innerWidth - 300, Math.max(16, window.innerHeight - 200));
}

function applyPosition(el: HTMLElement, x: number, y: number): void {
  const clamped = clampPosition(x, y);
  el.style.left = `${clamped.x}px`;
  el.style.top = `${clamped.y}px`;
  el.style.right = '';
  el.style.bottom = '';
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function ensureStyles(): void {
  if (stylesInjected) return;
  const el = document.createElement('style');
  el.id = 'qpm-pcmp-card-styles';
  el.textContent = STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

function formatDelta(myVal: number, theirVal: number): { text: string; color: string } {
  const diff = myVal - theirVal;
  if (Math.abs(diff) < 1) return { text: '—', color: 'rgba(224,224,224,0.35)' };
  const sign = diff > 0 ? '+' : '';
  const color = diff > 0 ? '#4caf50' : '#ef5350';
  return { text: `${sign}${formatCoinsAbbreviated(Math.round(diff))}`, color };
}

function buildComparisonRow(metric: string, myVal: number, theirVal: number, formatFn: (n: number) => string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'qpm-pcmp-card__row';

  const metricEl = document.createElement('span');
  metricEl.className = 'qpm-pcmp-card__metric';
  metricEl.textContent = metric;
  row.appendChild(metricEl);

  const myEl = document.createElement('span');
  myEl.className = 'qpm-pcmp-card__val';
  myEl.textContent = formatFn(myVal);
  row.appendChild(myEl);

  const theirEl = document.createElement('span');
  theirEl.className = 'qpm-pcmp-card__val';
  theirEl.style.color = '#e0e0e0';
  theirEl.textContent = formatFn(theirVal);
  row.appendChild(theirEl);

  const delta = formatDelta(myVal, theirVal);
  const deltaEl = document.createElement('span');
  deltaEl.className = 'qpm-pcmp-card__delta';
  deltaEl.style.color = delta.color;
  deltaEl.textContent = delta.text;
  row.appendChild(deltaEl);

  return row;
}

function updateCardBody(body: HTMLElement, snap: RoomPlayersSnapshot): void {
  body.innerHTML = '';

  if (!currentTargetId) return;

  const target = snap.others.find((p) => p.playerId === currentTargetId);
  const self = snap.self;

  if (!target) {
    const gone = document.createElement('div');
    gone.className = 'qpm-pcmp-card__gone';
    gone.textContent = 'Player left the room.';
    body.appendChild(gone);
    return;
  }

  if (!self) {
    const gone = document.createElement('div');
    gone.className = 'qpm-pcmp-card__gone';
    gone.textContent = 'Your data unavailable.';
    body.appendChild(gone);
    return;
  }

  // Header row
  const headerRow = document.createElement('div');
  headerRow.className = 'qpm-pcmp-card__row qpm-pcmp-card__row--header';
  for (const text of ['', 'You', 'Them', 'Delta']) {
    const el = document.createElement('span');
    el.textContent = text;
    el.style.textAlign = text === '' ? 'left' : 'right';
    headerRow.appendChild(el);
  }
  body.appendChild(headerRow);

  const fmt = formatCoinsAbbreviated;
  const fmtInt = (n: number) => String(Math.round(n));

  body.appendChild(buildComparisonRow('Coins', self.coins, target.coins, fmt));
  body.appendChild(buildComparisonRow('Garden', self.gardenValue, target.gardenValue, fmt));
  body.appendChild(buildComparisonRow('Inv.', self.inventoryValue, target.inventoryValue, fmt));
  body.appendChild(buildComparisonRow('Pets', self.petCount, target.petCount, fmtInt));
}

// ---------------------------------------------------------------------------
// Card lifecycle
// ---------------------------------------------------------------------------

function createCard(targetPlayerId: string): void {
  ensureStyles();
  destroyed = false;

  const persisted = loadPersistedState();
  const initialPos = persisted.x >= 0 && persisted.y >= 0
    ? clampPosition(persisted.x, persisted.y)
    : getDefaultPosition();

  currentTargetId = targetPlayerId;

  const card = document.createElement('div');
  card.className = 'qpm-pcmp-card';
  applyPosition(card, initialPos.x, initialPos.y);

  // Resolve target name
  const snap = getRoomPlayersSnapshot();
  const target = snap.others.find((p) => p.playerId === targetPlayerId);
  const targetName = target?.displayName ?? `Player ${targetPlayerId.slice(0, 6)}`;

  // Header
  const header = document.createElement('div');
  header.className = 'qpm-pcmp-card__header';

  const labelEl = document.createElement('div');
  labelEl.className = 'qpm-pcmp-card__label';
  labelEl.textContent = `vs ${targetName}`;
  header.appendChild(labelEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'qpm-pcmp-card__close';
  closeBtn.textContent = 'x';
  closeBtn.title = 'Close comparison card';
  header.appendChild(closeBtn);

  card.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'qpm-pcmp-card__body';
  card.appendChild(body);

  document.body.appendChild(card);
  cardEl = card;

  // Initial render
  updateCardBody(body, snap);

  // Subscribe to updates
  const unsub = onRoomPlayersChange((newSnap) => {
    if (destroyed) return;
    // Update label if name changed
    const t = newSnap.others.find((p) => p.playerId === currentTargetId);
    labelEl.textContent = t
      ? `vs ${t.displayName}`
      : `vs ${currentTargetId?.slice(0, 6) ?? '?'} (left)`;
    updateCardBody(body, newSnap);
  });
  cleanups.push(unsub);

  // Drag
  let dragStartX = 0;
  let dragStartY = 0;
  let cardStartLeft = 0;
  let cardStartTop = 0;
  let isDragging = false;

  const onMouseDown = (event: MouseEvent): void => {
    if ((event.target as Element).closest('.qpm-pcmp-card__close')) return;
    const rect = card.getBoundingClientRect();
    applyPosition(card, rect.left, rect.top);
    isDragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    cardStartLeft = rect.left;
    cardStartTop = rect.top;
    event.preventDefault();
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (!isDragging) return;
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    applyPosition(card, cardStartLeft + dx, cardStartTop + dy);
  };

  const onMouseUp = (): void => {
    if (!isDragging) return;
    isDragging = false;
    const rect = card.getBoundingClientRect();
    persistState(currentTargetId, rect.left, rect.top);
  };

  header.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  cleanups.push(() => {
    header.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  });

  // Close
  closeBtn.addEventListener('click', () => closePlayerCompareCard());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function togglePlayerCompareCard(targetPlayerId: string): void {
  if (cardEl && currentTargetId === targetPlayerId) {
    closePlayerCompareCard();
    return;
  }
  // Close existing card if targeting a different player
  if (cardEl) closePlayerCompareCard();
  createCard(targetPlayerId);
}

export function closePlayerCompareCard(): void {
  if (!cardEl) return;
  destroyed = true;
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
  cardEl.remove();
  cardEl = null;
  persistState(null, -1, -1);
  currentTargetId = null;
}

export function isPlayerCompareCardOpen(): boolean {
  return !!cardEl;
}

export function getCompareTargetPlayerId(): string | null {
  return currentTargetId;
}

/** Update the floating card target (e.g. when dropdown changes). */
export function setCompareTarget(targetPlayerId: string): void {
  if (!cardEl) return;
  // Re-create with new target, preserving position
  const rect = cardEl.getBoundingClientRect();
  closePlayerCompareCard();
  const pos = clampPosition(rect.left, rect.top);
  currentTargetId = targetPlayerId;
  // Inline create to preserve position
  ensureStyles();
  destroyed = false;
  createCard(targetPlayerId);
  if (cardEl) applyPosition(cardEl, pos.x, pos.y);
}
