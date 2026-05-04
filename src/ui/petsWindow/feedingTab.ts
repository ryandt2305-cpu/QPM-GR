// Feeding tab: global settings bar, per-pet feed cards with diet checkboxes,
// hunger bars, pop-out buttons.

import { normalizeSpeciesKey } from '../../utils/helpers';
import { getActivePetInfos, onActivePetInfos } from '../../store/pets';
import { getPetSpriteDataUrlWithMutations, isSpritesReady, onSpritesReady } from '../../sprite-v2/compat';
import {
  getPetFoodRules,
  setRespectPetFoodRules,
  setAvoidFavoritedFoods,
  getDietOptionsForSpecies,
  PET_FOOD_RULES_CHANGED_EVENT,
} from '../../features/petFoodRules';
import {
  feedAllPetsInstantly,
  enqueueFeed,
  getFeedQueueLength,
  onFeedQueueEvent,
  type FeedQueueEvent,
} from '../../features/instantFeed';
import {
  getFeedPolicy,
  setFeedPolicyOverride,
  clearFeedPolicyOverride,
  PET_FEED_POLICY_CHANGED_EVENT,
} from '../../store/petTeams';
import { openFloatingCardForSlot, hasFloatingCardForSlot } from '../petFloatingCard';
import type { PetItemFeedOverride } from '../../types/petTeams';
import { FLOATING_CARD_STATE_EVENT } from './constants';
import { btn, showToast } from './helpers';

export function buildFeedingTab(root: HTMLElement): () => void {
  const feed = document.createElement('div');
  feed.className = 'qpm-feed';
  root.appendChild(feed);
  let destroyed = false;
  let renderQueued = false;
  const renderCleanups: Array<() => void> = [];

  const queueRender = (): void => {
    if (destroyed || renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (!destroyed) render();
    });
  };

  function render(): void {
    renderCleanups.forEach((fn) => fn());
    renderCleanups.length = 0;
    feed.innerHTML = '';

    const rules = getPetFoodRules();
    const feedPolicy = getFeedPolicy();
    const activePets = getActivePetInfos();

    // --- Global settings bar ---
    const globalsEl = document.createElement('div');
    globalsEl.className = 'qpm-feed__globals';

    const togglesWrap = document.createElement('div');
    togglesWrap.className = 'qpm-feed__globals-toggles';

    const respectRow = document.createElement('label');
    respectRow.className = 'qpm-toggle-row';
    const respectCb = document.createElement('input');
    respectCb.type = 'checkbox'; respectCb.className = 'qpm-toggle';
    respectCb.checked = rules.respectRules;
    respectCb.addEventListener('change', () => {
      setRespectPetFoodRules(respectCb.checked);
      queueRender();
    });
    respectRow.appendChild(respectCb);
    respectRow.append('Respect pet diet rules');
    togglesWrap.appendChild(respectRow);

    const favRow = document.createElement('label');
    favRow.className = 'qpm-toggle-row';
    const favCb = document.createElement('input');
    favCb.type = 'checkbox'; favCb.className = 'qpm-toggle';
    favCb.checked = rules.avoidFavorited;
    favCb.addEventListener('change', () => {
      setAvoidFavoritedFoods(favCb.checked);
      queueRender();
    });
    favRow.appendChild(favCb);
    favRow.append('Avoid feeding favorited items');
    togglesWrap.appendChild(favRow);
    globalsEl.appendChild(togglesWrap);

    const feedAllBtn = btn('\uD83C\uDF56 Feed All', 'primary');
    feedAllBtn.title = 'Feed all active pets from inventory';
    feedAllBtn.addEventListener('click', async () => {
      feedAllBtn.disabled = true;
      feedAllBtn.textContent = '\u23F3 Feeding\u2026';
      try {
        const latestRules = getPetFoodRules();
        const results = await feedAllPetsInstantly(100, latestRules.respectRules);
        const ok = results.filter(r => r.success).length;
        const fail = results.filter(r => !r.success).length;
        if (results.length === 0) showToast('No pets needed feeding', 'info');
        else if (fail === 0) showToast(`Fed ${ok} pet${ok !== 1 ? 's' : ''}`, 'success');
        else showToast(`Fed ${ok}, failed ${fail}`, 'error');
      } finally {
        feedAllBtn.disabled = false;
        feedAllBtn.textContent = '\uD83C\uDF56 Feed All';
      }
    });
    globalsEl.appendChild(feedAllBtn);
    feed.appendChild(globalsEl);

    // --- No active pets ---
    if (activePets.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.style.cssText = 'text-align:center;color:rgba(224,224,224,0.3);font-size:13px;padding:24px 0;';
      emptyEl.textContent = 'No active pets';
      feed.appendChild(emptyEl);
      return;
    }

    // --- Per-pet cards ---
    for (let i = 0; i < activePets.length; i++) {
      const pet = activePets[i]!;
      const petItemId = pet.slotId ?? null;
      const speciesKey = pet.species ? normalizeSpeciesKey(pet.species) : '';
      const speciesOverride = speciesKey ? (rules.overrides[speciesKey] ?? {}) : {};
      const itemOverride = petItemId ? (feedPolicy.petItemOverrides[petItemId] ?? null) : null;
      const effectiveForbidden = Array.isArray(itemOverride?.forbidden)
        ? itemOverride.forbidden
        : (speciesOverride.forbidden ?? []);
      const forbiddenSet = new Set(effectiveForbidden);
      const preferredKey = itemOverride?.preferred ?? speciesOverride.preferred ?? null;

      const card = document.createElement('div');
      card.className = 'qpm-feed__pet-card';

      // Header: sprite + info + feed button
      const header = document.createElement('div');
      header.className = 'qpm-feed__pet-header';

      // Sprite
      const spriteWrap = document.createElement('div');
      spriteWrap.className = 'qpm-feed__pet-sprite-wrap';
      if (pet.species && isSpritesReady()) {
        const src = getPetSpriteDataUrlWithMutations(pet.species, pet.mutations ?? []);
        if (src) {
          const img = document.createElement('img');
          img.className = 'qpm-feed__pet-sprite';
          img.src = src; img.alt = pet.species;
          spriteWrap.appendChild(img);
        } else {
          spriteWrap.textContent = '\uD83D\uDC3E';
        }
      } else {
        spriteWrap.textContent = '\uD83D\uDC3E';
      }
      header.appendChild(spriteWrap);

      // Info
      const info = document.createElement('div');
      info.className = 'qpm-feed__pet-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'qpm-feed__pet-name';
      nameEl.textContent = pet.name || pet.species || 'Pet';
      info.appendChild(nameEl);

      if (pet.hungerPct !== null) {
        const hungerRow = document.createElement('div');
        hungerRow.className = 'qpm-feed__pet-hunger';
        const hungerPct = document.createElement('span');
        hungerPct.className = 'qpm-feed__hunger-pct';
        hungerPct.textContent = `${Math.round(pet.hungerPct)}%`;
        const barWrap = document.createElement('div');
        barWrap.className = 'qpm-feed__hunger-bar-wrap';
        const bar = document.createElement('div');
        bar.className = 'qpm-feed__hunger-bar';
        bar.style.width = `${pet.hungerPct}%`;
        bar.style.background = pet.hungerPct < 30 ? '#ff6464' : pet.hungerPct < 60 ? '#ffb464' : '#64ff96';
        barWrap.appendChild(bar);
        hungerRow.appendChild(hungerPct);
        hungerRow.appendChild(barWrap);
        info.appendChild(hungerRow);
      }

      header.appendChild(info);

      // Feed button
      const feedBtn = btn('Feed', 'primary');
      const petSlotIndex = pet.slotIndex;
      feedBtn.addEventListener('click', () => {
        enqueueFeed(petSlotIndex);
        const pending = getFeedQueueLength(petSlotIndex);
        if (pending > 0) {
          feedBtn.textContent = `Feed (${pending})`;
        }
      });

      const unsubFeedQueue = onFeedQueueEvent((event: FeedQueueEvent) => {
        if (destroyed) return;
        if (event.type === 'drained') {
          feedBtn.textContent = 'Feed';
          return;
        }
        if (event.slotIndex !== petSlotIndex) return;

        if (event.result?.success) {
          showToast(`Fed ${event.result.petName || 'pet'}${event.result.foodSpecies ? ` (${event.result.foodSpecies})` : ''}`, 'success');
        } else if (event.type === 'error') {
          showToast(event.result?.error ?? 'Feed failed', 'error');
        }

        const pending = getFeedQueueLength(petSlotIndex);
        feedBtn.textContent = pending > 0 ? `Feed (${pending})` : 'Feed';
      });
      renderCleanups.push(unsubFeedQueue);
      header.appendChild(feedBtn);

      // Pop-out button — opens a draggable floating card bound to this slot.
      const slotIndex = pet.slotIndex;
      const popoutBtn = document.createElement('button');
      popoutBtn.className = `qpm-feed__popout-btn${hasFloatingCardForSlot(slotIndex) ? ' qpm-feed__popout-btn--active' : ''}`;
      popoutBtn.title = 'Open detached feed card';
      popoutBtn.textContent = '\u2197';
      popoutBtn.addEventListener('click', () => {
        openFloatingCardForSlot(slotIndex);
        popoutBtn.classList.add('qpm-feed__popout-btn--active');
      });
      header.appendChild(popoutBtn);

      card.appendChild(header);

      // Diet checkboxes
      if (pet.species) {
        const dietOptions = getDietOptionsForSpecies(pet.species);
        if (dietOptions.length > 0) {
          const dietTitle = document.createElement('div');
          dietTitle.className = 'qpm-feed__diet-title';
          dietTitle.textContent = `Diet \u2014 ${pet.species}`;
          card.appendChild(dietTitle);

          const dietEl = document.createElement('div');
          dietEl.className = 'qpm-feed__diet';

          for (const option of dietOptions) {
            const lbl = document.createElement('label');
            lbl.className = `qpm-feed__food-label${option.key === preferredKey ? ' qpm-feed__food-label--preferred' : ''}`;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !forbiddenSet.has(option.key);
            cb.addEventListener('change', () => {
              if (!pet.slotId || !pet.species) return;

              const freshRules = getPetFoodRules();
              const freshFeedPolicy = getFeedPolicy();
              const freshKey = normalizeSpeciesKey(pet.species);
              const freshSpeciesOverride = freshKey ? (freshRules.overrides[freshKey] ?? {}) : {};
              const freshItemOverride = freshFeedPolicy.petItemOverrides[pet.slotId] ?? null;

              const currentForbidden = Array.isArray(freshItemOverride?.forbidden)
                ? freshItemOverride.forbidden
                : (freshSpeciesOverride.forbidden ?? []);
              const forbidden = new Set(currentForbidden);
              if (cb.checked) forbidden.delete(option.key);
              else forbidden.add(option.key);
              const nextForbidden = Array.from(forbidden);

              const speciesForbidden = new Set(freshSpeciesOverride.forbidden ?? []);
              const sameAsSpecies = (
                nextForbidden.length === speciesForbidden.size &&
                nextForbidden.every((value) => speciesForbidden.has(value))
              );

              const nextAllowed = Array.isArray(freshItemOverride?.allowed)
                ? [...freshItemOverride.allowed]
                : undefined;
              const nextPreferred = typeof freshItemOverride?.preferred === 'string' && freshItemOverride.preferred.length > 0
                ? freshItemOverride.preferred
                : undefined;

              const nextOverride: Partial<PetItemFeedOverride> = {};
              if (nextAllowed !== undefined) nextOverride.allowed = nextAllowed;
              if (nextPreferred !== undefined) nextOverride.preferred = nextPreferred;
              if (!sameAsSpecies) {
                nextOverride.forbidden = nextForbidden;
              }

              const hasAllowed = Array.isArray(nextOverride.allowed);
              const hasForbidden = Array.isArray(nextOverride.forbidden);
              const hasPreferred = typeof nextOverride.preferred === 'string' && (nextOverride.preferred as string).length > 0;
              if (!hasAllowed && !hasForbidden && !hasPreferred) {
                clearFeedPolicyOverride(pet.slotId);
              } else {
                setFeedPolicyOverride(pet.slotId, nextOverride);
              }
            });

            lbl.appendChild(cb);
            lbl.append(` ${option.label}${option.key === preferredKey ? ' \u2605' : ''}`);
            dietEl.appendChild(lbl);
          }

          card.appendChild(dietEl);
        }
      }

      feed.appendChild(card);
    }
  }

  render();
  const unsubscribePets = onActivePetInfos(() => queueRender(), false);
  const unsubscribeSprites = onSpritesReady(() => queueRender());
  const onFoodRulesChanged = (): void => queueRender();
  const onFeedPolicyChanged = (): void => queueRender();
  const onFloatingCardState = (): void => queueRender();
  window.addEventListener(PET_FOOD_RULES_CHANGED_EVENT, onFoodRulesChanged as EventListener);
  window.addEventListener(PET_FEED_POLICY_CHANGED_EVENT, onFeedPolicyChanged as EventListener);
  window.addEventListener(FLOATING_CARD_STATE_EVENT, onFloatingCardState as EventListener);
  return () => {
    destroyed = true;
    renderCleanups.forEach((fn) => fn());
    renderCleanups.length = 0;
    unsubscribePets();
    unsubscribeSprites();
    window.removeEventListener(PET_FOOD_RULES_CHANGED_EVENT, onFoodRulesChanged as EventListener);
    window.removeEventListener(PET_FEED_POLICY_CHANGED_EVENT, onFeedPolicyChanged as EventListener);
    window.removeEventListener(FLOATING_CARD_STATE_EVENT, onFloatingCardState as EventListener);
  };
}
