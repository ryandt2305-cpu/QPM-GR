// src/features/locker/rules.ts
// Pure rule engine for the Locker. No side effects, no store/UI imports.

import type { LockerConfig, GuardResult } from './types';

export interface InventorySnapshot {
  itemCount: number;
  capacity: number;
}

/** Resolved from garden tile data at the guard layer. */
export interface TileContext {
  objectType?: string; // 'plant' | 'egg' | 'decor' | etc
  species?: string;    // plant species from slots[0].species
  eggId?: string;      // egg ID from tile.eggId
  decorId?: string;    // decor type ID (objectType value for decor tiles)
  mutations?: string[]; // active mutations on the plant (from slots[0].mutations)
}

const PASS: GuardResult = { blocked: false };

function inventoryReserveCheck(config: LockerConfig, inventory: InventorySnapshot): GuardResult {
  if (!config.inventoryReserve.enabled) return PASS;
  const freeSlots = inventory.capacity - inventory.itemCount;
  if (freeSlots < config.inventoryReserve.minFreeSlots) {
    return {
      blocked: true,
      reason: `Inventory reserve: ${freeSlots} free slots (min ${config.inventoryReserve.minFreeSlots})`,
      rule: 'inventory_reserve',
    };
  }
  return PASS;
}

function hasAnyLockedMutation(mutations: string[], locks: Record<string, boolean>): string | undefined {
  for (const m of mutations) {
    if (locks[m]) return m;
  }
  return undefined;
}

export function evaluateAction(
  actionType: string,
  _payload: Record<string, unknown>,
  config: LockerConfig,
  inventory: InventorySnapshot,
  tile?: TileContext,
): GuardResult {
  if (!config.enabled) return PASS;

  switch (actionType) {
    case 'HarvestCrop': {
      // Blanket harvest lock
      if (config.harvestLock) {
        return { blocked: true, reason: 'Harvest lock is active', rule: 'harvest_lock' };
      }
      // Per-plant lock: resolve species from tile context
      if (tile?.species && config.plantLocks[tile.species]) {
        return { blocked: true, reason: `Plant locked: ${tile.species}`, rule: 'plant_lock' };
      }
      // Per-mutation lock: check if any active mutation is locked
      if (tile?.mutations && tile.mutations.length > 0) {
        const lockedMut = hasAnyLockedMutation(tile.mutations, config.mutationLocks);
        if (lockedMut) {
          const label = tile.species ? `${tile.species} (${lockedMut})` : lockedMut;
          return { blocked: true, reason: `Mutation locked: ${label}`, rule: 'mutation_lock' };
        }
      }
      // Custom rules: species + ALL mutations must be present (AND logic)
      if (tile?.species && tile?.mutations && config.customRules.length > 0) {
        for (const rule of config.customRules) {
          if (rule.species === tile.species && rule.mutations.every(m => tile.mutations!.includes(m))) {
            const mutLabel = rule.mutations.join(' + ');
            return { blocked: true, reason: `Custom rule: ${rule.species} (${mutLabel})`, rule: 'custom_rule' };
          }
        }
      }
      return inventoryReserveCheck(config, inventory);
    }

    case 'PickupObject': {
      return inventoryReserveCheck(config, inventory);
    }

    case 'PickupDecor': {
      // Blanket decor pickup lock
      if (config.decorPickupLock) {
        return { blocked: true, reason: 'Decor pickup lock is active', rule: 'decor_pickup_lock' };
      }
      // Per-decor lock
      if (tile?.decorId && config.decorLocks[tile.decorId]) {
        return { blocked: true, reason: `Decor locked: ${tile.decorId}`, rule: 'decor_lock' };
      }
      return inventoryReserveCheck(config, inventory);
    }

    case 'HatchEgg': {
      // Blanket hatch lock
      if (config.hatchLock) {
        return { blocked: true, reason: 'Hatch lock is active', rule: 'hatch_lock' };
      }
      // Per-egg lock: resolve eggId from tile context
      if (tile?.eggId && config.eggLocks[tile.eggId]) {
        return { blocked: true, reason: `Egg locked: ${tile.eggId}`, rule: 'egg_lock' };
      }
      return inventoryReserveCheck(config, inventory);
    }

    case 'SellAllCrops': {
      if (config.sellAllCropsLock) {
        return { blocked: true, reason: 'Sell-all-crops lock is active', rule: 'sell_all_crops_lock' };
      }
      // Per-crop sell protection — block if any crop type is locked
      const lockedCrops = Object.keys(config.cropSellLocks).filter(k => config.cropSellLocks[k]);
      if (lockedCrops.length > 0) {
        return { blocked: true, reason: `Protected crops: ${lockedCrops.join(', ')}`, rule: 'crop_sell_lock' };
      }
      return PASS;
    }

    case 'PurchaseSeed':
    case 'PurchaseEgg':
    case 'PurchaseTool':
    case 'PurchaseDecor': {
      return inventoryReserveCheck(config, inventory);
    }

    default:
      return PASS;
  }
}
