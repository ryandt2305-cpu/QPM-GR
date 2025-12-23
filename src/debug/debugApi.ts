// src/debug/debugApi.ts
// Debug API moved to separate module for lazy loading
// This reduces initial parse time by deferring this code until needed

import { storage } from '../utils/storage';

// These imports are only used by debug functions, so they're fine to load here
// when the debug API is actually accessed
type DebugApiType = {
  storage: typeof storage;
  debugPets: () => any;
  debugAllAtoms: () => any;
  showPetSpriteGrid: (sheet?: string, maxTiles?: number) => any;
  showAllSpriteSheets: (maxTilesPerSheet?: number) => any;
  listSpriteResources: (category?: 'plants' | 'pets' | 'unknown' | 'all') => any;
  loadTrackedSpriteSheets: (maxSheets?: number, category?: 'plants' | 'pets' | 'unknown' | 'all') => any;
  spriteExtractor: any;
  viewAllSprites: () => void;
  checkTargetScale: () => any;
  debugSlotInfos: () => any;
  debugPetInventory: () => any;
  searchPageWindow: () => any;
  inspectPetCards: () => any;
  findPetDataInDOM: () => any;
  extractStrengthFromUI: () => any;
  debugLevels: () => any;
  debugInventory: () => Promise<any>;
  testPetData: () => any;
  testComparePets: (slotIndexA: number, slotIndexB: number) => void;
  testAbilityDefinitions: () => any;
  debugAriesIntegration: () => void;
  toggleBadgePreview: (force?: boolean) => Promise<any>;
  debugInventoryAtoms: (labels?: string[]) => Promise<any>;
  scanSeeds: () => Promise<any>;
  auditRainbowPets: () => Promise<any>;
  openPetHub3v3: () => Promise<boolean>;
  resetTutorial: () => Promise<void>;
  showTutorial: () => Promise<void>;
  inspectGarden?: () => any;
  exposeGarden?: () => any;
  currentTile?: () => any;
};

declare const unsafeWindow: (Window & typeof globalThis) | undefined;

/**
 * Creates the full debug API object.
 * This is called lazily when the debug API is first accessed.
 */
export async function createDebugApi(): Promise<DebugApiType> {
  // Dynamic imports to avoid loading all modules at startup
  const [
    { getActivePetsDebug },
    { estimatePetLevel, getPetXPHistory },
    { testPetData, testComparePets, testAbilityDefinitions },
    { getAtomByLabel, readAtomValue },
    { readInventoryDirect, getInventoryItems },
    { toggleWindow },
    spriteCompat,
  ] = await Promise.all([
    import('../store/pets'),
    import('../store/petLevelCalculator'),
    import('../utils/petDataTester'),
    import('../core/jotaiBridge'),
    import('../store/inventory'),
    import('../ui/modalWindow'),
    import('../sprite-v2/compat'),
  ]);

  const {
    renderSpriteGridOverlay,
    renderAllSpriteSheetsOverlay,
    listTrackedSpriteResources,
    loadTrackedSpriteSheets,
    spriteExtractor,
  } = spriteCompat;

  const debugApi: DebugApiType = {
    storage,

    debugPets: () => {
      const pets = getActivePetsDebug();
      console.log('=== Active Pets Debug ===');
      console.table(pets.map(p => ({
        Slot: p.slotIndex,
        Name: p.name || p.species,
        Species: p.species,
        Level: p.level,
        Strength: p.strength,
        TargetScale: p.targetScale,
        Abilities: p.abilities.join(', '),
        Hunger: p.hungerPct ? `${p.hungerPct.toFixed(1)}%` : 'N/A',
      })));
      console.log('Full normalized data:', pets);
      return pets;
    },

    debugAllAtoms: () => {
      try {
        const cache = (window as any).__qpmJotaiAtomCache__;
        if (!cache || typeof cache.entries !== 'function') {
          console.error('Jotai atom cache not available');
          return null;
        }

        console.log('=== All Available Atoms ===');
        const atomList: Array<{label: string, hasValue: boolean}> = [];
        for (const [atom, meta] of cache.entries()) {
          if (meta && typeof meta === 'object' && 'debugLabel' in meta) {
            const label = (meta as any).debugLabel;
            if (typeof label === 'string') {
              atomList.push({ label, hasValue: cache.has(atom) });
            }
          }
        }
        console.table(atomList);
        return atomList;
      } catch (error) {
        console.error('Failed to list atoms:', error);
        return null;
      }
    },

    showPetSpriteGrid: (sheet = 'pets', maxTiles = 80) => renderSpriteGridOverlay(sheet, maxTiles),
    showAllSpriteSheets: (maxTilesPerSheet = 120) => renderAllSpriteSheetsOverlay(maxTilesPerSheet),
    listSpriteResources: (category: 'plants' | 'pets' | 'unknown' | 'all' = 'all') => listTrackedSpriteResources(category),
    loadTrackedSpriteSheets: (maxSheets = 8, category: 'plants' | 'pets' | 'unknown' | 'all' = 'all') => loadTrackedSpriteSheets(maxSheets, category),
    spriteExtractor,

    viewAllSprites: () => {
      console.log('=== Exporting all sprite tiles ===');
      const container = document.createElement('div');
      container.style.cssText = `
        position: fixed; top: 50px; right: 50px;
        background: rgba(0,0,0,0.9); padding: 20px;
        max-width: 800px; max-height: 80vh; overflow: auto;
        z-index: 999999; display: grid;
        grid-template-columns: repeat(10, 1fr); gap: 5px;
      `;
      
      for (let i = 0; i < 60; i++) {
        const tile = spriteExtractor.getTile('plants', i);
        if (tile) {
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'position: relative; text-align: center;';
          
          const label = document.createElement('div');
          label.textContent = `${i}`;
          label.style.cssText = 'font-size: 10px; color: #fff; background: rgba(0,0,0,0.7); padding: 2px;';
          
          const img = new Image();
          img.src = tile.toDataURL();
          img.style.cssText = 'width: 64px; height: 64px; image-rendering: pixelated; border: 1px solid #444;';
          img.title = `Tile ${i}`;
          
          wrapper.appendChild(label);
          wrapper.appendChild(img);
          container.appendChild(wrapper);
        }
      }
      
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Close';
      closeBtn.style.cssText = 'position: sticky; top: 0; left: 0; z-index: 1; grid-column: 1 / -1;';
      closeBtn.onclick = () => container.remove();
      container.insertBefore(closeBtn, container.firstChild);
      
      document.body.appendChild(container);
      console.log('Sprite viewer opened.');
    },

    checkTargetScale: () => {
      const pets = getActivePetsDebug();
      console.log('=== TargetScale Analysis ===');
      pets.forEach((p, i) => {
        const targetScale = p.targetScale ?? 0;
        console.log(`Pet ${i}: ${p.name} - TargetScale: ${targetScale.toFixed(6)}`);
      });
      return pets;
    },

    debugSlotInfos: () => {
      try {
        const cache = (window as any).__qpmJotaiAtomCache__;
        const store = (window as any).__qpmJotaiStore__;
        if (!cache || !store) {
          console.error('Jotai cache/store not available');
          return null;
        }

        let slotInfosAtom = null;
        for (const [atom, meta] of cache.entries()) {
          if (meta?.debugLabel === 'myPetSlotInfosAtom') {
            slotInfosAtom = atom;
            break;
          }
        }

        if (!slotInfosAtom) {
          console.error('myPetSlotInfosAtom not found');
          return null;
        }

        const value = store.get(slotInfosAtom);
        console.log('myPetSlotInfosAtom:', value);
        return value;
      } catch (error) {
        console.error('Failed to inspect slot infos:', error);
        return null;
      }
    },

    debugPetInventory: () => {
      try {
        const cache = (window as any).__qpmJotaiAtomCache__;
        const store = (window as any).__qpmJotaiStore__;
        if (!cache || !store) {
          console.error('Jotai cache/store not available');
          return null;
        }

        const atomsToCheck = ['myPetInventoryAtom', 'myPetHutchPetItemsAtom'];
        const results: Record<string, any> = {};

        for (const atomLabel of atomsToCheck) {
          let targetAtom = null;
          for (const [atom, meta] of cache.entries()) {
            if (meta?.debugLabel === atomLabel) {
              targetAtom = atom;
              break;
            }
          }
          if (targetAtom) {
            results[atomLabel] = store.get(targetAtom);
          }
        }

        console.log('Pet inventory atoms:', results);
        return results;
      } catch (error) {
        console.error('Failed to inspect pet inventory:', error);
        return null;
      }
    },

    searchPageWindow: () => {
      const pageWin = (window as any).unsafeWindow || window;
      const locations = ['myData', 'myPets', 'activePets', 'petData', 'pets', 'gameState'];
      const found: Record<string, any> = {};
      for (const loc of locations) {
        if (loc in pageWin) {
          found[loc] = pageWin[loc];
        }
      }
      console.log('Found in page window:', found);
      return found;
    },

    inspectPetCards: () => {
      const selectors = ['[data-pet-slot]', '[data-pet-id]', '.pet-card', '.pet-slot'];
      const foundElements: HTMLElement[] = [];
      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach(el => {
          if (el instanceof HTMLElement) foundElements.push(el);
        });
      }
      console.log(`Found ${foundElements.length} pet card elements`);
      return foundElements;
    },

    findPetDataInDOM: () => {
      const pets = getActivePetsDebug();
      const petNames = pets.map(p => p.name).filter(Boolean);
      console.log('Searching DOM for pets:', petNames);
      return pets;
    },

    extractStrengthFromUI: () => {
      const pets = getActivePetsDebug();
      const results = pets.map(pet => ({
        pet: pet.name || pet.species,
        strength: pet.strength ?? null,
      }));
      console.table(results);
      return results;
    },

    debugLevels: () => {
      const pets = getActivePetsDebug();
      pets.forEach((pet, idx) => {
        console.log(`Pet ${idx}: ${pet.name} - Level: ${pet.level ?? 'N/A'}, XP: ${pet.xp ?? 'N/A'}`);
        if (pet.petId) {
          const levelEstimate = estimatePetLevel(pet);
          console.log(`  Estimate: Level ${levelEstimate.currentLevel} (${levelEstimate.confidence})`);
        }
      });
      return pets;
    },

    debugInventory: async () => {
      const userSlotsAtom = getAtomByLabel('userSlotsAtom');
      if (userSlotsAtom) {
        const inventory = await readAtomValue(userSlotsAtom);
        console.log('Inventory:', inventory);
        return inventory;
      }
      console.error('userSlotsAtom not found');
      return null;
    },

    testPetData,
    testComparePets,
    testAbilityDefinitions,

    debugAriesIntegration: () => {
      const checks = [
        { name: 'window.PetsService', value: (window as any).PetsService },
        { name: 'window.QWS', value: (window as any).QWS },
      ];
      console.log('Aries integration check:');
      checks.forEach(check => {
        console.log(`${check.value ? '✅' : '❌'} ${check.name}`);
      });
    },

    toggleBadgePreview: async (force?: boolean) => {
      try {
        const { toggleBadgePreview } = await import('../ui/achievementsWindow');
        return toggleBadgePreview(force);
      } catch (error) {
        console.error('Failed to toggle badge preview', error);
        return null;
      }
    },

    debugInventoryAtoms: async (labels = ['myInventoryAtom', 'myCropInventoryAtom']) => {
      for (const label of labels) {
        const atom = getAtomByLabel(label);
        if (atom) {
          const value = await readAtomValue<any>(atom);
          console.log(`${label}:`, value);
        }
      }
    },

    scanSeeds: async () => {
      const direct = await readInventoryDirect();
      const cached = getInventoryItems();
      console.log('Direct inventory items:', direct?.items?.length ?? 0);
      console.log('Cached inventory items:', cached.length);
      return { direct, cached };
    },

    auditRainbowPets: async () => {
      const petAtoms = ['myPetInventoryAtom', 'myPetHutchPetItemsAtom'];
      const results: Record<string, any[]> = {};
      for (const label of petAtoms) {
        const atom = getAtomByLabel(label);
        if (atom) {
          const items = await readAtomValue<any[]>(atom);
          const rainbows = (items || []).filter(it => 
            String(it?.mutation ?? it?.variant ?? '').toLowerCase().includes('rainbow')
          );
          results[label] = rainbows;
          console.log(`${label}: ${rainbows.length} rainbow pets`);
        }
      }
      return results;
    },

    openPetHub3v3: async () => {
      try {
        const btn = document.querySelector('button[data-window-id="pet-hub"]') as HTMLButtonElement | null;
        if (btn) {
          btn.click();
          setTimeout(() => {
            const tab = Array.from(document.querySelectorAll('button'))
              .find(b => b.textContent?.includes('3v3 Compare'));
            (tab as HTMLButtonElement | undefined)?.click();
          }, 300);
          return true;
        }

        const render = (root: HTMLElement) => 
          import('../ui/petHubWindow').then(({ renderPetHubWindow }) => renderPetHubWindow(root));
        toggleWindow('pet-hub', '🐾 Pet Hub', render, '1600px', '92vh');
        return true;
      } catch (error) {
        console.error('Failed to open Pet Hub', error);
        return false;
      }
    },

    resetTutorial: async () => {
      const { resetTutorial } = await import('../ui/tutorialPopup');
      resetTutorial();
      console.log('Tutorial reset. Reload to see it again.');
    },

    showTutorial: async () => {
      const { showTutorialPopup } = await import('../ui/tutorialPopup');
      showTutorialPopup();
    },
  };

  return debugApi;
}

// Cached debug API instance
let cachedDebugApi: DebugApiType | null = null;
let loadingPromise: Promise<DebugApiType> | null = null;

/**
 * Gets the debug API, loading it lazily if needed.
 * This is the main entry point for accessing debug functions.
 */
export async function getDebugApi(): Promise<DebugApiType> {
  if (cachedDebugApi) return cachedDebugApi;
  
  if (loadingPromise) return loadingPromise;
  
  loadingPromise = createDebugApi().then(api => {
    cachedDebugApi = api;
    return api;
  });
  
  return loadingPromise;
}

/**
 * Creates a proxy object that lazily loads the debug API on first access.
 * This allows us to expose QPM global immediately without blocking.
 */
export function createLazyDebugProxy(): Record<string, any> {
  const proxy: Record<string, any> = {
    // Storage is needed immediately for some inline handlers
    storage,
    
    // Flag to indicate this is a lazy proxy
    __isLazyProxy: true,
    
    // Method to get the full API
    __getFullApi: getDebugApi,
  };

  // Create lazy getters for all debug functions
  const lazyMethods = [
    'debugPets', 'debugAllAtoms', 'showPetSpriteGrid', 'showAllSpriteSheets',
    'listSpriteResources', 'loadTrackedSpriteSheets', 'spriteExtractor',
    'viewAllSprites', 'checkTargetScale', 'debugSlotInfos', 'debugPetInventory',
    'searchPageWindow', 'inspectPetCards', 'findPetDataInDOM', 'extractStrengthFromUI',
    'debugLevels', 'debugInventory', 'testPetData', 'testComparePets', 'testAbilityDefinitions',
    'debugAriesIntegration', 'toggleBadgePreview', 'debugInventoryAtoms', 'scanSeeds',
    'auditRainbowPets', 'openPetHub3v3', 'resetTutorial', 'showTutorial',
    'inspectGarden', 'exposeGarden', 'currentTile',
  ];

  for (const method of lazyMethods) {
    Object.defineProperty(proxy, method, {
      get() {
        return async (...args: any[]) => {
          const api = await getDebugApi();
          const fn = (api as any)[method];
          if (typeof fn === 'function') {
            return fn(...args);
          }
          return fn;
        };
      },
      configurable: true,
      enumerable: true,
    });
  }

  return proxy;
}
