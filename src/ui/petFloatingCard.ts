// src/ui/petFloatingCard.ts
// Floating draggable pet card widget.
// Each card shows a pet's sprite, name, hunger bar, and a Feed button.
// Cards survive closing/reopening the Pets window.
// Multiple cards can coexist, managed by a registry keyed by petId (entity UUID).

import { log } from '../utils/logger';
import { getActivePetInfos, onActivePetInfos } from '../store/pets';
import { feedPetInstantly } from '../features/instantFeed';
import { getPetSpriteDataUrlWithMutations, isSpritesReady } from '../sprite-v2/compat';
import type { ActivePetInfo } from '../store/pets';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const STYLES = `
.qpm-float-card {
  position: fixed;
  background: rgba(18,20,26,0.96);
  border: 1px solid rgba(143,130,255,0.45);
  border-radius: 9px;
  width: 180px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.55);
  z-index: 999990;
  font-family: inherit;
  user-select: none;
  overflow: hidden;
}
.qpm-float-card__header {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 8px 5px;
  cursor: grab;
  background: rgba(143,130,255,0.08);
  border-bottom: 1px solid rgba(143,130,255,0.18);
}
.qpm-float-card__header:active { cursor: grabbing; }
.qpm-float-card__sprite-wrap {
  width: 28px; height: 28px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.qpm-float-card__sprite {
  width: 28px; height: 28px;
  image-rendering: pixelated; object-fit: contain;
}
.qpm-float-card__name {
  flex: 1; font-size: 12px; font-weight: 500; color: #e0e0e0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qpm-float-card__close {
  width: 18px; height: 18px;
  background: none; border: none;
  color: rgba(224,224,224,0.45); font-size: 14px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  border-radius: 3px; flex-shrink: 0; padding: 0; line-height: 1;
  transition: color 0.12s, background 0.12s;
}
.qpm-float-card__close:hover { color: #e0e0e0; background: rgba(255,255,255,0.1); }
.qpm-float-card__body {
  padding: 8px 10px 10px;
  display: flex; flex-direction: column; gap: 7px;
}
.qpm-float-card__hunger {
  display: flex; align-items: center; gap: 6px;
}
.qpm-float-card__hunger-pct {
  font-size: 11px; color: rgba(224,224,224,0.55); min-width: 30px; text-align: right;
}
.qpm-float-card__hunger-track {
  flex: 1; height: 5px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;
}
.qpm-float-card__hunger-fill { height: 100%; border-radius: 3px; }
.qpm-float-card__feed-btn {
  width: 100%;
  background: rgba(143,130,255,0.2);
  border: 1px solid rgba(143,130,255,0.45);
  border-radius: 5px; color: #d0c8ff;
  font-size: 12px; font-weight: 500;
  padding: 5px 0; cursor: pointer;
  transition: background 0.15s;
}
.qpm-float-card__feed-btn:hover { background: rgba(143,130,255,0.35); }
.qpm-float-card__feed-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.qpm-float-card__no-pet {
  font-size: 11px; color: rgba(224,224,224,0.35); text-align: center;
  padding: 4px 0;
}
`;

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  const el = document.createElement('style');
  el.id = 'qpm-float-card-styles';
  el.textContent = STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

interface FloatingCardEntry {
  petId: string;           // entity UUID (ActivePetInfo.petId)
  el: HTMLElement;
  destroy: () => void;
}

const registry = new Map<string, FloatingCardEntry>();

// ---------------------------------------------------------------------------
// Single card
// ---------------------------------------------------------------------------

function createFloatingCard(petId: string, initialPet: ActivePetInfo): FloatingCardEntry {
  ensureStyles();

  const cleanups: Array<() => void> = [];
  const card = document.createElement('div');
  card.className = 'qpm-float-card';

  // Default position: bottom-right area, stacked based on count
  const offset = registry.size * 14;
  card.style.right = `${24 + offset}px`;
  card.style.bottom = `${80 + offset}px`;

  // --- Header (drag handle + sprite + name + close) ---
  const header = document.createElement('div');
  header.className = 'qpm-float-card__header';

  const spriteWrap = document.createElement('div');
  spriteWrap.className = 'qpm-float-card__sprite-wrap';
  spriteWrap.textContent = '🐾';
  header.appendChild(spriteWrap);

  const nameEl = document.createElement('div');
  nameEl.className = 'qpm-float-card__name';
  nameEl.textContent = initialPet.name || initialPet.species || 'Pet';
  header.appendChild(nameEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'qpm-float-card__close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close floating card';
  header.appendChild(closeBtn);

  card.appendChild(header);

  // --- Body ---
  const body = document.createElement('div');
  body.className = 'qpm-float-card__body';

  const hungerRow = document.createElement('div');
  hungerRow.className = 'qpm-float-card__hunger';
  const hungerPct = document.createElement('span');
  hungerPct.className = 'qpm-float-card__hunger-pct';
  const hungerTrack = document.createElement('div');
  hungerTrack.className = 'qpm-float-card__hunger-track';
  const hungerFill = document.createElement('div');
  hungerFill.className = 'qpm-float-card__hunger-fill';
  hungerTrack.appendChild(hungerFill);
  hungerRow.appendChild(hungerPct);
  hungerRow.appendChild(hungerTrack);
  body.appendChild(hungerRow);

  const feedBtn = document.createElement('button');
  feedBtn.className = 'qpm-float-card__feed-btn';
  feedBtn.textContent = 'Feed';
  body.appendChild(feedBtn);

  const noPetMsg = document.createElement('div');
  noPetMsg.className = 'qpm-float-card__no-pet';
  noPetMsg.textContent = 'Pet not in active slots';
  noPetMsg.style.display = 'none';
  body.appendChild(noPetMsg);

  card.appendChild(body);

  // --- Render pet data ---
  function renderPetData(pet: ActivePetInfo): void {
    nameEl.textContent = pet.name || pet.species || 'Pet';

    // Sprite
    if (pet.species && isSpritesReady()) {
      const src = getPetSpriteDataUrlWithMutations(pet.species, pet.mutations ?? []);
      if (src) {
        spriteWrap.innerHTML = '';
        const img = document.createElement('img');
        img.className = 'qpm-float-card__sprite';
        img.src = src;
        img.alt = pet.species;
        spriteWrap.appendChild(img);
      }
    }

    // Hunger
    if (pet.hungerPct != null) {
      hungerRow.style.display = '';
      noPetMsg.style.display = 'none';
      feedBtn.style.display = '';
      hungerPct.textContent = `${Math.round(pet.hungerPct)}%`;
      hungerFill.style.width = `${pet.hungerPct}%`;
      hungerFill.style.background = pet.hungerPct < 30 ? '#ff6464' : pet.hungerPct < 60 ? '#ffb464' : '#64ff96';
    } else {
      hungerRow.style.display = 'none';
    }
  }

  function renderMissing(): void {
    hungerRow.style.display = 'none';
    feedBtn.style.display = 'none';
    noPetMsg.style.display = '';
  }

  // Initial render
  renderPetData(initialPet);

  // --- Subscribe to pet updates ---
  const unsub = onActivePetInfos((pets) => {
    const pet = pets.find(p => p.petId === petId);
    if (pet) {
      renderPetData(pet);
    } else {
      renderMissing();
    }
  }, false);
  cleanups.push(unsub);

  // --- Feed button ---
  feedBtn.addEventListener('click', async () => {
    feedBtn.disabled = true;
    feedBtn.textContent = '⏳';
    try {
      const pets = getActivePetInfos();
      const index = pets.findIndex(p => p.petId === petId);
      if (index < 0) {
        log(`[FloatingCard] Pet ${petId} not in active slots`);
        return;
      }
      const result = await feedPetInstantly(index);
      if (result.success) {
        feedBtn.textContent = '✓ Fed!';
        setTimeout(() => { feedBtn.textContent = 'Feed'; }, 1500);
      } else {
        feedBtn.textContent = result.error?.includes('food') ? 'No food' : 'Failed';
        setTimeout(() => { feedBtn.textContent = 'Feed'; }, 2000);
      }
    } finally {
      feedBtn.disabled = false;
    }
  });

  // --- Close button ---
  const destroy = (): void => {
    cleanups.forEach(fn => fn());
    card.remove();
    registry.delete(petId);
  };
  closeBtn.addEventListener('click', destroy);

  // --- Drag support ---
  let dragStartX = 0;
  let dragStartY = 0;
  let cardStartLeft = 0;
  let cardStartTop = 0;
  let isDragging = false;

  function getCardRect(): DOMRect {
    return card.getBoundingClientRect();
  }

  function snapToFixed(): void {
    const rect = getCardRect();
    // Convert from right/bottom to left/top for easier dragging
    card.style.right = '';
    card.style.bottom = '';
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.top}px`;
  }

  const onMouseDown = (e: MouseEvent): void => {
    // Only drag from header, not from close button
    if ((e.target as Element).closest('.qpm-float-card__close')) return;
    snapToFixed();
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    cardStartLeft = parseInt(card.style.left, 10);
    cardStartTop = parseInt(card.style.top, 10);
    e.preventDefault();
  };

  const onMouseMove = (e: MouseEvent): void => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    const newLeft = Math.max(0, Math.min(window.innerWidth - 180, cardStartLeft + dx));
    const newTop = Math.max(0, Math.min(window.innerHeight - 80, cardStartTop + dy));
    card.style.left = `${newLeft}px`;
    card.style.top = `${newTop}px`;
  };

  const onMouseUp = (): void => {
    isDragging = false;
  };

  header.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  cleanups.push(() => {
    header.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  });

  document.body.appendChild(card);

  return { petId, el: card, destroy };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open or focus a floating card for the given pet.
 * petId should be the entity UUID (ActivePetInfo.petId).
 */
export function openFloatingCard(petId: string): void {
  if (registry.has(petId)) {
    // Already open — flash the card briefly to indicate it's there
    const existing = registry.get(petId)!;
    existing.el.style.border = '1px solid rgba(143,130,255,0.9)';
    setTimeout(() => { existing.el.style.border = '1px solid rgba(143,130,255,0.45)'; }, 600);
    return;
  }

  const pets = getActivePetInfos();
  const pet = pets.find(p => p.petId === petId);
  if (!pet) {
    log(`[FloatingCard] Pet ${petId} not found in active slots — cannot open card`);
    return;
  }

  const entry = createFloatingCard(petId, pet);
  registry.set(petId, entry);
  log(`[FloatingCard] Opened card for ${pet.name || pet.species} (${petId})`);
}

/** Close a specific floating card by petId. */
export function closeFloatingCard(petId: string): void {
  registry.get(petId)?.destroy();
}

/** Close all floating cards. */
export function closeAllFloatingCards(): void {
  for (const entry of registry.values()) {
    entry.destroy();
  }
}

/** Returns true if a floating card is currently open for the given petId. */
export function hasFloatingCard(petId: string): boolean {
  return registry.has(petId);
}
