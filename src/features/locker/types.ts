// src/features/locker/types.ts
// Config model and guard result types for the Locker.

export interface InventoryReserveConfig {
  enabled: boolean;
  minFreeSlots: number; // 0–50, default 5
}

export interface CustomRule {
  species: string;
  mutations: string[]; // ALL must be present on the tile to trigger (AND logic)
}

export interface LockerConfig {
  enabled: boolean;              // master switch (off by default)
  inventoryReserve: InventoryReserveConfig;
  hatchLock: boolean;            // blanket: block ALL egg hatching
  eggLocks: Record<string, boolean>;      // per-type egg locks
  plantLocks: Record<string, boolean>;    // per-species plant harvest locks
  mutationLocks: Record<string, boolean>; // per-mutation harvest locks (global)
  harvestLock: boolean;          // blanket: block ALL harvesting
  decorPickupLock: boolean;      // blanket: block ALL decor pickup
  decorLocks: Record<string, boolean>;    // per-decor pickup locks
  sellAllCropsLock: boolean;
  cropSellLocks: Record<string, boolean>; // per-crop sell protection (blocks SellAllCrops)
  customRules: CustomRule[];     // plant+mutation combo rules
  instaHarvestRainbow: boolean;  // skip hold-to-harvest for Rainbow plants
  instaHarvestGold: boolean;     // skip hold-to-harvest for Gold plants
  ariesHold: boolean;            // rapid-fire hold mode (hold Space → repeat at 10 Hz)
}

export interface GuardResult {
  blocked: boolean;
  reason?: string; // human-readable, shown in notification
  rule?: string;   // machine-readable ID for throttling
}
