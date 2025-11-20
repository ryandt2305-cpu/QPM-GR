// src/features/autoFavorite.ts
// Automatically favorites rare (gold/rainbow) pets and produce when detected

import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import { pageWindow } from '../core/pageContext';

const STORAGE_KEY = 'qpm.autoFavorite.v1';

export interface AutoFavoriteConfig {
  enabled: boolean;
  species: string[]; // List of species names to auto-favorite
  mutations: string[]; // List of mutations to auto-favorite (Rainbow, Gold, Frozen, etc)
  petAbilities: string[]; // List of pet abilities to auto-favorite (Rainbow Granter, Gold Granter)
}

let config: AutoFavoriteConfig = {
  enabled: false,
  species: [],
  mutations: [],
  petAbilities: [],
};

const listeners = new Set<(config: AutoFavoriteConfig) => void>();
let intervalId: number | null = null;
let seenItemIds = new Set<string>();

function loadConfig(): void {
  try {
    const stored = storage.get<Partial<AutoFavoriteConfig> | null>(STORAGE_KEY, null);
    if (stored && typeof stored === 'object') {
      config = {
        enabled: stored.enabled ?? config.enabled,
        species: stored.species ?? config.species,
        mutations: stored.mutations ?? config.mutations,
        petAbilities: stored.petAbilities ?? config.petAbilities,
      };
    }
  } catch (error) {
    log('⚠️ Failed to load auto-favorite config', error);
  }
}

function saveConfig(): void {
  try {
    storage.set(STORAGE_KEY, config);
    notifyListeners();
  } catch (error) {
    log('⚠️ Failed to save auto-favorite config', error);
  }
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener({ ...config });
    } catch (error) {
      log('⚠️ Auto-favorite listener error', error);
    }
  }
}

function checkAndFavoriteNewItems(inventory: any): void {
  if (!inventory?.items) return;

  // DEFENSIVE: Ensure petAbilities array exists (v2.0.0 fix for upgrade path)
  if (!config.petAbilities) {
    config.petAbilities = [];
  }

  if (!config.species.length && !config.mutations.length && !config.petAbilities.length) {
    return;
  }

  const favoritedIds = new Set(inventory.favoritedItemIds || []);
  const targetSpecies = new Set(config.species);
  const targetMutations = new Set(config.mutations);
  const targetPetAbilities = new Set(config.petAbilities);
  let cropCount = 0;
  let petCount = 0;

  for (const item of inventory.items) {
    if (favoritedIds.has(item.id)) continue; // Already favorited

    // Check if it's a pet
    if (item.itemType === 'Pet') {
      // Check pet mutations for Gold or Rainbow
      const petMutations = item.mutations || [];
      const hasGoldMutation = petMutations.includes('Gold');
      const hasRainbowMutation = petMutations.includes('Rainbow');

      // Also check abilities array for granter abilities
      const petAbilities = item.abilities || [];
      const hasGoldGranterAbility = petAbilities.some((a: any) => {
        const abilityStr = typeof a === 'string' ? a : a?.type || a?.abilityType || '';
        return abilityStr.toLowerCase().includes('gold') && abilityStr.toLowerCase().includes('grant');
      });
      const hasRainbowGranterAbility = petAbilities.some((a: any) => {
        const abilityStr = typeof a === 'string' ? a : a?.type || a?.abilityType || '';
        return abilityStr.toLowerCase().includes('rainbow') && abilityStr.toLowerCase().includes('grant');
      });

      const shouldFavorite =
        (targetPetAbilities.has('Gold Granter') && (hasGoldMutation || hasGoldGranterAbility)) ||
        (targetPetAbilities.has('Rainbow Granter') && (hasRainbowMutation || hasRainbowGranterAbility));

      if (shouldFavorite) {
        if (sendFavoriteMessage(item.id)) {
          log(`🌟 [AUTO-FAVORITE] Auto-favorited pet: ${item.petSpecies || item.species || 'unknown'} (${hasGoldMutation || hasGoldGranterAbility ? 'Gold' : 'Rainbow'})`);
          petCount++;
        }
      }
      continue;
    }

    // Check if item matches species
    const matchesSpecies = targetSpecies.has(item.species);

    // Check if item matches any mutation
    const itemMutations = item.mutations || [];
    const matchesMutation = itemMutations.some((mut: string) => targetMutations.has(mut));

    if (matchesSpecies || matchesMutation) {
      // Send favorite command
      if (sendFavoriteMessage(item.id)) {
        cropCount++;
      }
    }
  }

  if (cropCount > 0) {
    log(`🌟 [AUTO-FAVORITE] Auto-favorited ${cropCount} new crops`);
  }
  if (petCount > 0) {
    log(`🌟 [AUTO-FAVORITE] Auto-favorited ${petCount} new pets`);
  }
}

// Function to favorite ALL items of a species (called when checkbox is checked)
function favoriteSpecies(speciesName: string): void {
  const typedPageWindow = pageWindow as any;

  if (!typedPageWindow?.myData?.inventory?.items) {
    log('🌟 [AUTO-FAVORITE] No myData available yet - waiting for game to load');
    return;
  }

  const items = typedPageWindow.myData.inventory.items;
  const favoritedIds = new Set(typedPageWindow.myData.inventory.favoritedItemIds || []);
  let count = 0;

  for (const item of items) {
    // CRITICAL: Multiple checks to ensure ONLY crops are favorited
    if (item.itemType !== 'Produce') continue;
    if (item.itemType === 'Pet' || item.itemType === 'Egg' || item.itemType === 'Tool') continue;
    if (item.category === 'Pet' || item.category === 'Egg' || item.category === 'Tool') continue;
    if (item.species && (item.species.includes('Pet') || item.species.includes('Egg'))) continue;

    if (item.species === speciesName && !favoritedIds.has(item.id)) {
      if (sendFavoriteMessage(item.id)) {
        count++;
      }
    }
  }

  if (count > 0) {
    log(`✅ [AUTO-FAVORITE] Favorited ${count} ${speciesName} crops`);
  } else {
    log(`ℹ️ [AUTO-FAVORITE] No ${speciesName} crops to favorite (already favorited or none in inventory)`);
  }
}

// DISABLED: Script never unfavorites - only adds favorites
function unfavoriteSpecies(speciesName: string): void {
  log(`🔒 [AUTO-FAVORITE] Checkbox unchecked for ${speciesName} - Auto-favorite disabled, but existing favorites are preserved (script never removes favorites)`);
  // Do nothing - script only adds favorites, never removes them
  // This protects user's manually-favorited items (pets, eggs, crops, etc.)
}

// Function to favorite ALL items with a specific mutation (called when mutation checkbox is checked)
function favoriteMutation(mutationName: string): void {
  const typedPageWindow = pageWindow as any;

  if (!typedPageWindow?.myData?.inventory?.items) {
    log('🌟 [AUTO-FAVORITE] No myData available yet - waiting for game to load');
    return;
  }

  const items = typedPageWindow.myData.inventory.items;
  const favoritedIds = new Set(typedPageWindow.myData.inventory.favoritedItemIds || []);
  let count = 0;

  for (const item of items) {
    // CRITICAL: Multiple checks to ensure ONLY crops are favorited
    if (item.itemType !== 'Produce') continue;
    if (item.itemType === 'Pet' || item.itemType === 'Egg' || item.itemType === 'Tool') continue;
    if (item.category === 'Pet' || item.category === 'Egg' || item.category === 'Tool') continue;
    if (item.species && (item.species.includes('Pet') || item.species.includes('Egg'))) continue;

    const itemMutations = item.mutations || [];
    if (itemMutations.includes(mutationName) && !favoritedIds.has(item.id)) {
      if (sendFavoriteMessage(item.id)) {
        count++;
      }
    }
  }

  if (count > 0) {
    log(`✅ [AUTO-FAVORITE] Favorited ${count} crops with ${mutationName} mutation`);
  } else {
    log(`ℹ️ [AUTO-FAVORITE] No crops with ${mutationName} mutation to favorite (already favorited or none in inventory)`);
  }
}

// DISABLED: Script never unfavorites - only adds favorites
function unfavoriteMutation(mutationName: string): void {
  log(`🔒 [AUTO-FAVORITE] Checkbox unchecked for ${mutationName} mutation - Auto-favorite disabled, but existing favorites are preserved (script never removes favorites)`);
  // Do nothing - script only adds favorites, never removes them
  // This protects user's manually-favorited items (pets, eggs, crops, etc.)
}

// Favorite ALL pets with a specific ability (called when checkbox is checked)
function favoritePetAbility(abilityName: string): void {
  const typedPageWindow = pageWindow as any;

  if (!typedPageWindow?.myData?.inventory?.items) {
    log('🌟 [AUTO-FAVORITE-PET] No myData available yet - waiting for game to load');
    return;
  }

  log(`🔍 [AUTO-FAVORITE-PET] Searching for pets with ${abilityName}...`);

  const items = typedPageWindow.myData.inventory.items;
  const favoritedIds = new Set(typedPageWindow.myData.inventory.favoritedItemIds || []);
  let count = 0;
  let petsChecked = 0;

  // Debug: Log first pet structure to understand data format
  const firstPet = items.find((i: any) => i.itemType === 'Pet');
  if (firstPet) {
    log('🐾 [AUTO-FAVORITE-PET-DEBUG] Sample pet structure:', {
      species: firstPet.petSpecies,
      mutations: firstPet.mutations,
      abilities: firstPet.abilities,
      hasAbilitiesArray: Array.isArray(firstPet.abilities),
      hasMutationsArray: Array.isArray(firstPet.mutations),
    });
  }

  for (const item of items) {
    if (item.itemType !== 'Pet') continue;
    petsChecked++;

    if (favoritedIds.has(item.id)) continue; // Already favorited

    // Check both mutations AND abilities array for granter abilities
    const petMutations = item.mutations || [];
    const hasGoldMutation = petMutations.includes('Gold');
    const hasRainbowMutation = petMutations.includes('Rainbow');

    const petAbilities = item.abilities || [];
    const hasGoldGranterAbility = petAbilities.some((a: any) => {
      const abilityStr = typeof a === 'string' ? a : a?.type || a?.abilityType || '';
      return abilityStr.toLowerCase().includes('gold') && abilityStr.toLowerCase().includes('grant');
    });
    const hasRainbowGranterAbility = petAbilities.some((a: any) => {
      const abilityStr = typeof a === 'string' ? a : a?.type || a?.abilityType || '';
      return abilityStr.toLowerCase().includes('rainbow') && abilityStr.toLowerCase().includes('grant');
    });

    const shouldFavorite =
      (abilityName === 'Gold Granter' && (hasGoldMutation || hasGoldGranterAbility)) ||
      (abilityName === 'Rainbow Granter' && (hasRainbowMutation || hasRainbowGranterAbility));

    if (shouldFavorite) {
      log(`✨ [AUTO-FAVORITE-PET] Found matching pet: ${item.petSpecies || item.species} (${item.id}) - mutations: [${petMutations.join(', ')}], abilities: ${petAbilities.length}`);

      if (sendFavoriteMessage(item.id)) {
        count++;
      }
    }
  }

  log(`✅ [AUTO-FAVORITE-PET] Scanned ${petsChecked} pets, favorited ${count} with ${abilityName}`);
}

// DISABLED: Script never unfavorites - only adds favorites
function unfavoritePetAbility(abilityName: string): void {
  log(`🔒 [AUTO-FAVORITE-PET] Checkbox unchecked for ${abilityName} - Auto-favorite disabled, but existing favorites are preserved (script never removes favorites)`);
  // Do nothing - script only adds favorites, never removes them
}

/**
 * Get the current scope path for WebSocket messages
 * Uses dynamic scope path from game if available
 */
function getScopePath(): string[] {
  try {
    const typedPageWindow = pageWindow as any;
    return typedPageWindow?.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa'];
  } catch {
    return ['Room', 'Quinoa'];
  }
}

// Function to actually send the favorite message via websocket
function sendFavoriteMessage(itemId: string): boolean {
  try {
    const typedPageWindow = pageWindow as any;
    const maybeConnection = typedPageWindow?.MagicCircle_RoomConnection;

    if (maybeConnection && typeof maybeConnection.sendMessage === 'function') {
      maybeConnection.sendMessage({
        scopePath: getScopePath(),
        type: 'ToggleFavoriteItem',
        itemId,
      });
      return true;
    }
    return false;
  } catch (error) {
    log(`⚠️ Failed to favorite item ${itemId}`, error);
    return false;
  }
}

function startAutoFavoritePolling(): void {
  if (intervalId !== null) return;

  intervalId = window.setInterval(() => {
    // Early exit if auto-favorite is disabled or no watched items
    if (!config.enabled) {
      return;
    }

    const watchedSpecies = config.species || [];
    const watchedMutations = config.mutations || [];
    const watchedPetAbilities = config.petAbilities || [];

    // Skip processing if nothing is being watched
    if (watchedSpecies.length === 0 && watchedMutations.length === 0 && watchedPetAbilities.length === 0) {
      return;
    }

    const typedPageWindow = pageWindow as any;
    if (!typedPageWindow?.myData?.inventory?.items) {
      return;
    }

    const inventory = typedPageWindow.myData.inventory;
    const currentItems = inventory.items || [];

    // Get all current item IDs
    const currentItemIds = new Set<string>();
    for (const item of currentItems) {
      if (item?.id) {
        currentItemIds.add(item.id);
      }
    }

    // Find new items (IDs we haven't seen before)
    const newItemIds = new Set<string>();
    for (const id of currentItemIds) {
      if (!seenItemIds.has(id)) {
        newItemIds.add(id);
      }
    }

    // Process new items only
    if (newItemIds.size > 0) {
      // Create a filtered inventory with only new items
      const newItems = currentItems.filter((item: any) => item?.id && newItemIds.has(item.id));
      if (newItems.length > 0) {
        const filteredInventory = {
          ...inventory,
          items: newItems
        };
        checkAndFavoriteNewItems(filteredInventory);
      }
    }

    // Update seen IDs to current state
    seenItemIds = currentItemIds;
  }, 2000); // Every 2 seconds (optimized)

  log('✅ Auto-favorite polling started (2 second interval)');
}

function stopAutoFavoritePolling(): void {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
    log('⏹️ Auto-favorite polling stopped');
  }
}

export function initializeAutoFavorite(): void {
  loadConfig();
  startAutoFavoritePolling();

  // Expose helper functions on pageWindow for UI integration
  const typedPageWindow = pageWindow as any;
  typedPageWindow.qpm_favoriteSpecies = favoriteSpecies;
  typedPageWindow.qpm_unfavoriteSpecies = unfavoriteSpecies;
  typedPageWindow.qpm_favoriteMutation = favoriteMutation;
  typedPageWindow.qpm_unfavoriteMutation = unfavoriteMutation;
  typedPageWindow.qpm_favoritePetAbility = favoritePetAbility;
  typedPageWindow.qpm_unfavoritePetAbility = unfavoritePetAbility;

  log('✅ [AUTO-FAVORITE] System initialized - monitoring inventory changes', config);
}

export function getAutoFavoriteConfig(): AutoFavoriteConfig {
  return { ...config };
}

export function updateAutoFavoriteConfig(updates: Partial<AutoFavoriteConfig>): void {
  config = { ...config, ...updates };
  saveConfig();

  // Restart polling if config changed
  if (config.enabled) {
    startAutoFavoritePolling();
  }
}

export function subscribeToAutoFavoriteConfig(listener: (config: AutoFavoriteConfig) => void): () => void {
  listeners.add(listener);
  listener({ ...config });
  return () => listeners.delete(listener);
}
