// src/main.ts
import { ready, sleep, getGameHudRoot } from './utils/dom';
import { log } from './utils/logger';
import { startCropTypeLocking } from './features/cropTypeLocking';
import { startMutationReminder } from './features/mutationReminder';
import { startMutationTracker } from './features/mutationTracker';
import { initializeHarvestReminder, configureHarvestReminder } from './features/harvestReminder';
import { initializeTurtleTimer, configureTurtleTimer } from './features/turtleTimer.ts';
import { createOriginalUI, setCfg } from './ui/originalPanel';
import { startGardenBridge } from './features/gardenBridge';
import { initializeStatsStore } from './store/stats';
import { initializePetXpTracker } from './store/petXpTracker';
import { initializeXpTracker } from './store/xpTracker';
import { initializeMutationValueTracking } from './features/mutationValueTracking';
import { initializeAutoFavorite } from './features/autoFavorite';
import { getActivePetsDebug } from './store/pets';
import { startInventoryStore } from './store/inventory';
import { shareGlobal } from './core/pageContext';
import { estimatePetLevel, getPetXPHistory } from './store/petLevelCalculator';
import { feedPetInstantly, feedPetByIds, feedAllPetsInstantly, isInstantFeedAvailable } from './features/instantFeed';
import { startVersionChecker } from './utils/versionChecker';
import { startCropBoostTracker } from './features/cropBoostTracker';
import { initPublicRooms } from './features/publicRooms';
import { spriteExtractor } from './utils/spriteExtractor';
import { initCropSizeIndicator } from './features/cropSizeIndicator';

// Expose debug API globally (using shareGlobal for userscript sandbox compatibility)
const QPM_DEBUG_API = {
  debugPets: () => {
    const pets = getActivePetsDebug();
    console.log('=== Active Pets Debug (v2024-11-13-DOM-STRENGTH) ===');
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
    console.log('\n=== Raw Data Inspection ===');
    pets.forEach((p, i) => {
      console.log(`\nPet ${i} (${p.name}):`);
      console.log('Raw object:', p.raw);
      if (p.raw && typeof p.raw === 'object') {
        const raw = p.raw as Record<string, unknown>;
        console.log('Available fields:', Object.keys(raw));
        if (raw.slot && typeof raw.slot === 'object') {
          console.log('slot fields:', Object.keys(raw.slot as Record<string, unknown>));
          console.log('slot.xp:', (raw.slot as Record<string, unknown>).xp);
        }
        if (raw.pet && typeof raw.pet === 'object') {
          console.log('pet fields:', Object.keys(raw.pet as Record<string, unknown>));
        }
      }
    });
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
            atomList.push({
              label,
              hasValue: cache.has(atom)
            });
          }
        }
      }
      console.table(atomList);

      // Also check for pet-related atoms specifically
      console.log('\n=== Pet-related Atoms ===');
      const petAtoms = atomList.filter(a => a.label.toLowerCase().includes('pet'));
      console.table(petAtoms);

      return atomList;
    } catch (error) {
      console.error('Failed to list atoms:', error);
      return null;
    }
  },

  // Expose sprite extractor for debugging
  spriteExtractor: spriteExtractor,
  
  // Debug function to view all sprite tiles
  viewAllSprites: () => {
    console.log('=== Exporting all sprite tiles ===');
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      top: 50px;
      right: 50px;
      background: rgba(0,0,0,0.9);
      padding: 20px;
      max-width: 800px;
      max-height: 80vh;
      overflow: auto;
      z-index: 999999;
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: 5px;
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
    console.log('Sprite viewer opened. Click tiles to see index.');
  },

  checkTargetScale: () => {
    const pets = getActivePetsDebug();
    console.log('=== TargetScale Analysis ===');
    console.log('Checking if targetScale might be strength-related...\n');

    pets.forEach((p, i) => {
      const targetScale = p.targetScale ?? 0;
      const xp = p.xp ?? 0;

      // Try common formulas to convert targetScale to strength (0-100+ range)
      const possibleStrength1 = Math.round(targetScale * 50); // Scale up by 50
      const possibleStrength2 = Math.round((targetScale - 1) * 100); // Offset and scale
      const possibleStrength3 = Math.round(targetScale * 45 + 5); // Linear transform

      console.log(`Pet ${i}: ${p.name}`);
      console.log(`  XP: ${xp}`);
      console.log(`  TargetScale: ${targetScale.toFixed(6)}`);
      console.log(`  Possible STR (×50): ${possibleStrength1}`);
      console.log(`  Possible STR ((x-1)×100): ${possibleStrength2}`);
      console.log(`  Possible STR (×45+5): ${possibleStrength3}\n`);
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

      console.log('=== myPetSlotInfosAtom Data ===');

      // Find the atom
      let slotInfosAtom = null;
      for (const [atom, meta] of cache.entries()) {
        if (meta && typeof meta === 'object' && 'debugLabel' in meta) {
          const label = (meta as any).debugLabel;
          if (label === 'myPetSlotInfosAtom') {
            slotInfosAtom = atom;
            break;
          }
        }
      }

      if (!slotInfosAtom) {
        console.error('myPetSlotInfosAtom not found in cache');
        return null;
      }

      // Get the value
      const value = store.get(slotInfosAtom);
      console.log('Raw value:', value);

      // Try to extract entries
      if (Array.isArray(value)) {
        console.log(`\nFound ${value.length} entries:\n`);
        value.forEach((entry, i) => {
          console.log(`Entry ${i}:`, entry);
          if (entry && typeof entry === 'object') {
            console.log(`  Fields:`, Object.keys(entry));
            if ('slot' in entry && entry.slot && typeof entry.slot === 'object') {
              console.log(`  slot fields:`, Object.keys(entry.slot));
            }
            if ('pet' in entry && entry.pet && typeof entry.pet === 'object') {
              console.log(`  pet fields:`, Object.keys(entry.pet));
            }
            if ('stats' in entry && entry.stats && typeof entry.stats === 'object') {
              console.log(`  stats fields:`, Object.keys(entry.stats));
              console.log(`  stats content:`, entry.stats);
            }
          }
        });
      }

      return value;
    } catch (error) {
      console.error('Failed to inspect myPetSlotInfosAtom:', error);
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

      console.log('=== Pet Inventory & Hutch Atoms ===\n');

      const atomsToCheck = [
        'myPetInventoryAtom',
        'myPetHutchPetItemsAtom',
        'myPrimitivePetSlotsAtom',
        'petInfosAtom'
      ];

      const results: Record<string, any> = {};

      for (const atomLabel of atomsToCheck) {
        console.log(`\n--- ${atomLabel} ---`);

        // Find the atom
        let targetAtom = null;
        for (const [atom, meta] of cache.entries()) {
          if (meta && typeof meta === 'object' && 'debugLabel' in meta) {
            const label = (meta as any).debugLabel;
            if (label === atomLabel) {
              targetAtom = atom;
              break;
            }
          }
        }

        if (!targetAtom) {
          console.log(`${atomLabel} not found`);
          continue;
        }

        try {
          const value = store.get(targetAtom);
          results[atomLabel] = value;
          console.log('Value:', value);

          if (Array.isArray(value) && value.length > 0) {
            const first = value[0];
            if (first && typeof first === 'object') {
              console.log('First entry fields:', Object.keys(first));

              // Check for nested pet/stats/slot
              if ('pet' in first && first.pet && typeof first.pet === 'object') {
                console.log('  pet fields:', Object.keys(first.pet));
                console.log('  pet sample:', first.pet);
              }
              if ('stats' in first && first.stats && typeof first.stats === 'object') {
                console.log('  stats fields:', Object.keys(first.stats));
                console.log('  stats sample:', first.stats);
              }
              if ('slot' in first && first.slot && typeof first.slot === 'object') {
                console.log('  slot fields:', Object.keys(first.slot));
              }
            }
          }
        } catch (error) {
          console.error(`Error reading ${atomLabel}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error('Failed to inspect pet atoms:', error);
      return null;
    }
  },

  searchPageWindow: () => {
    try {
      const pageWin = (window as any).unsafeWindow || window;
      console.log('=== Searching Page Window for Pet Data ===\n');

      // Check common locations
      const locations = [
        'myData',
        'myPets',
        'activePets',
        'petData',
        'pets',
        'UnifiedState',
        'gameState',
        'quinoaData'
      ];

      const found: Record<string, any> = {};

      for (const loc of locations) {
        if (loc in pageWin) {
          console.log(`\nFound: ${loc}`);
          const value = pageWin[loc];
          console.log('Type:', typeof value);

          if (value && typeof value === 'object') {
            console.log('Keys:', Object.keys(value).slice(0, 20));
            found[loc] = value;

            // Look for pet-related nested data
            if ('pets' in value) {
              console.log('  → has pets property:', value.pets);
            }
            if ('activePets' in value) {
              console.log('  → has activePets property:', value.activePets);
            }
            if ('inventory' in value && value.inventory) {
              console.log('  → has inventory property');
              const inv = value.inventory;
              if (inv && typeof inv === 'object' && 'items' in inv) {
                const items = (inv as any).items;
                if (Array.isArray(items)) {
                  console.log(`  → inventory has ${items.length} items`);
                  // Look for pets in inventory
                  const petItems = items.filter((item: any) =>
                    item && typeof item === 'object' &&
                    (item.itemType === 'Pet' || item.type === 'Pet' || 'petSpecies' in item || 'species' in item)
                  );
                  if (petItems.length > 0) {
                    console.log(`  → Found ${petItems.length} pet items in inventory`);
                    console.log('  → First pet item:', petItems[0]);
                    console.log('  → First pet fields:', Object.keys(petItems[0]));
                  }
                }
              }
            }
          }
        }
      }

      // Search all window properties for pet-related data
      console.log('\n=== Searching all window properties ===');
      const allKeys = Object.keys(pageWin).filter(k =>
        k.toLowerCase().includes('pet') ||
        k.toLowerCase().includes('animal') ||
        k.toLowerCase().includes('creature')
      );
      console.log('Pet-related keys:', allKeys);

      return found;
    } catch (error) {
      console.error('Failed to search page window:', error);
      return null;
    }
  },

  inspectPetCards: () => {
    try {
      console.log('=== Inspecting Pet Card UI Elements ===\n');

      // Look for pet cards on the left side of screen
      const petCardSelectors = [
        '[data-pet-slot]',
        '[data-pet-id]',
        '[data-slot-index]',
        '.pet-card',
        '.pet-slot',
        '[class*="pet"]',
        '[class*="Pet"]'
      ];

      const foundElements: HTMLElement[] = [];

      for (const selector of petCardSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`Found ${elements.length} elements with selector: ${selector}`);
          elements.forEach(el => {
            if (el instanceof HTMLElement && !foundElements.includes(el)) {
              foundElements.push(el);
            }
          });
        }
      }

      console.log(`\nTotal unique pet card elements found: ${foundElements.length}\n`);

      foundElements.slice(0, 10).forEach((el, idx) => {
        console.log(`\n--- Element ${idx} ---`);
        console.log('Tag:', el.tagName);
        console.log('Classes:', el.className);
        console.log('Text content:', el.textContent?.substring(0, 200));
        console.log('Data attributes:', Object.keys(el.dataset));

        // Try to extract level/strength from text
        const text = el.textContent || '';
        const levelMatch = text.match(/(?:level|lvl|lv)[:\s]*(\d+)/i);
        const strMatch = text.match(/(?:str|strength)[:\s]*(\d+)/i);
        const ageMatch = text.match(/(?:age)[:\s]*(\d+)/i);

        if (levelMatch) console.log('  → Found level:', levelMatch[1]);
        if (strMatch) console.log('  → Found strength:', strMatch[1]);
        if (ageMatch) console.log('  → Found age:', ageMatch[1]);
      });

      return foundElements;
    } catch (error) {
      console.error('Failed to inspect pet cards:', error);
      return null;
    }
  },

  findPetDataInDOM: () => {
    try {
      console.log('=== Searching DOM for Pet Level/Strength Data ===\n');

      const pets = getActivePetsDebug();
      const petNames = pets.map(p => p.name).filter(Boolean);

      console.log('Looking for pets:', petNames);

      // Search for elements containing pet names or level/strength keywords
      const allElements = document.querySelectorAll('*');
      const relevantElements: Array<{el: Element, reason: string}> = [];

      for (const el of allElements) {
        const text = el.textContent?.toLowerCase() || '';

        // Skip if too much text (likely container)
        if (text.length > 500) continue;

        // Check for pet names
        for (const name of petNames) {
          if (name && text.includes(name.toLowerCase())) {
            relevantElements.push({el, reason: `Contains pet name: ${name}`});
            break;
          }
        }

        // Check for level/age/strength keywords
        if (/\b(age|level|lvl|lv|str|strength|max str)\b/i.test(text)) {
          relevantElements.push({el, reason: 'Contains level/strength keywords'});
        }
      }

      console.log(`\nFound ${relevantElements.length} potentially relevant elements\n`);

      // Show up to 15 most relevant elements
      relevantElements.slice(0, 15).forEach(({el, reason}, idx) => {
        console.log(`\n--- Element ${idx} ---`);
        console.log('Reason:', reason);
        console.log('Tag:', el.tagName);
        console.log('Classes:', el.className);
        console.log('Text (first 300 chars):', el.textContent?.substring(0, 300));

        // Try to extract numeric values
        const text = el.textContent || '';
        const ageMatch = text.match(/age[:\s]*(\d+)/i);
        const strMatch = text.match(/(?:max\s+)?str[:\s]*(\d+)/i);
        const levelMatch = text.match(/(?:level|lvl|lv)[:\s]*(\d+)/i);

        if (ageMatch) console.log('  ✓ Age:', ageMatch[1]);
        if (strMatch) console.log('  ✓ Strength:', strMatch[1]);
        if (levelMatch) console.log('  ✓ Level:', levelMatch[1]);
      });

      return relevantElements;
    } catch (error) {
      console.error('Failed to search DOM:', error);
      return null;
    }
  },

  extractStrengthFromUI: () => {
    try {
      console.log('=== Extracting Strength from Pet Card UI ===\n');

      const pets = getActivePetsDebug();
      const results: Array<{pet: string, strength: number | null, element: Element | null}> = [];

      // Search for elements containing "STR XX" pattern
      const allElements = Array.from(document.querySelectorAll('*'));

      for (const pet of pets) {
        const petName = pet.name || pet.species || `Pet ${pet.slotIndex}`;
        let foundStrength: number | null = null;
        let foundElement: Element | null = null;

        // Look for elements with text matching "STR \d+"
        for (const el of allElements) {
          const text = el.textContent || '';

          // Skip containers with too much text
          if (text.length > 100) continue;

          // Look for "STR XX" pattern
          const strMatch = text.match(/\bSTR\s+(\d+)\b/i);
          if (strMatch && strMatch[1]) {
            const strength = parseInt(strMatch[1], 10);

            // Check if this element is near the pet's position/slot
            // For now, just collect all STR values and log them
            console.log(`Found STR ${strength} in element:`, el);
            console.log('  Tag:', el.tagName);
            console.log('  Classes:', el.className);
            console.log('  Text:', text.trim());
            console.log('  Parent:', el.parentElement?.className);

            // Try to match by order (first STR found = first pet, etc)
            if (!foundStrength) {
              foundStrength = strength;
              foundElement = el;
            }
          }
        }

        results.push({
          pet: petName,
          strength: foundStrength,
          element: foundElement
        });
      }

      console.log('\n=== Extracted Strength Values ===');
      console.table(results.map(r => ({
        Pet: r.pet,
        Strength: r.strength ?? 'Not found'
      })));

      return results;
    } catch (error) {
      console.error('Failed to extract strength from UI:', error);
      return null;
    }
  },

  debugLevels: () => {
    try {
      console.log('=== Pet Level Calculation Debug ===\n');

      const pets = getActivePetsDebug();

      pets.forEach((pet, idx) => {
        console.log(`\n--- Pet ${idx}: ${pet.name} (${pet.species}) ---`);
        console.log(`XP: ${pet.xp ?? 'N/A'}`);
        console.log(`Strength: ${pet.strength ?? 'N/A'}`);
        console.log(`Level (Jotai): ${pet.level ?? 'null'}`);

        if (pet.petId) {
          const history = getPetXPHistory(pet.petId);
          console.log(`XP History: ${history.length} samples`);

          if (history.length >= 2) {
            const first = history[0]!;
            const last = history[history.length - 1]!;
            const xpGained = last.xp - first.xp;
            const timeElapsed = (last.timestamp - first.timestamp) / 1000;
            const xpRate = xpGained / timeElapsed;

            console.log(`  First sample: ${first.xp} XP at ${new Date(first.timestamp).toLocaleTimeString()}`);
            console.log(`  Last sample: ${last.xp} XP at ${new Date(last.timestamp).toLocaleTimeString()}`);
            console.log(`  XP gained: ${xpGained.toFixed(0)} over ${timeElapsed.toFixed(0)}s`);
            console.log(`  XP rate: ${xpRate.toFixed(2)} XP/sec`);
          }

          const levelEstimate = estimatePetLevel(pet);
          console.log(`\nLevel Estimate:`);
          console.log(`  Current Level: ${levelEstimate.currentLevel ?? 'N/A'} / ${levelEstimate.maxLevel}`);
          console.log(`  Confidence: ${levelEstimate.confidence}`);
          console.log(`  Total XP Needed: ${levelEstimate.totalXPNeeded?.toFixed(0) ?? 'N/A'}`);
          console.log(`  XP Rate: ${levelEstimate.xpGainRate?.toFixed(2) ?? 'N/A'} XP/sec`);

          if (levelEstimate.totalXPNeeded && pet.xp) {
            const progress = (pet.xp / levelEstimate.totalXPNeeded) * 100;
            console.log(`  Progress: ${progress.toFixed(1)}%`);
          }
        }
      });

      return pets;
    } catch (error) {
      console.error('Failed to debug levels:', error);
      return null;
    }
  },

  // Instant Feed Functions (WebSocket-based)
  feedPet: async (petIndex: number) => {
    console.log(`🍖 Feeding pet at index ${petIndex}...`);
    const result = await feedPetInstantly(petIndex);
    if (result.success) {
      console.log(`✅ Successfully fed ${result.petName || result.petSpecies} with ${result.foodSpecies}`);
    } else {
      console.error(`❌ Failed to feed pet: ${result.error}`);
    }
    return result;
  },

  feedPetByIds: async (petId: string, cropId: string) => {
    console.log(`🍖 Feeding pet ${petId} with crop ${cropId}...`);
    const result = await feedPetByIds(petId, cropId);
    if (result.success) {
      console.log(`✅ Successfully fed pet`);
    } else {
      console.error(`❌ Failed to feed pet: ${result.error}`);
    }
    return result;
  },

  feedAllPets: async (hungerThreshold = 40) => {
    console.log(`🍖 Feeding all pets below ${hungerThreshold}% hunger...`);
    const results = await feedAllPetsInstantly(hungerThreshold);
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`✅ Fed ${successful} pets, ${failed} failed`);
    return results;
  },

  isInstantFeedAvailable: () => {
    const available = isInstantFeedAvailable();
    console.log(available ? '✅ Instant feed is available' : '❌ Instant feed is NOT available (RoomConnection missing)');
    return available;
  },

  debugInventory: async () => {
    try {
      const { getAtomByLabel, readAtomValue } = await import('./core/jotaiBridge');

      console.log('=== Inventory Debug ===\n');

      // Try userSlotsAtom first
      const userSlotsAtom = getAtomByLabel('userSlotsAtom');
      if (userSlotsAtom) {
        const inventory = await readAtomValue(userSlotsAtom);
        console.log('userSlotsAtom inventory:', inventory);

        const plantItems = Array.isArray(inventory) ? inventory.filter((item: any) =>
          item.itemType === 'Plant' ||
          (item.slots && item.slots.length > 0)
        ) : [];
        console.log(`\nFound ${plantItems?.length || 0} plant items:`);
        console.table(plantItems?.map((item: any, i: number) => ({
          Index: i,
          Species: item.species || 'N/A',
          Name: item.name || 'N/A',
          ItemType: item.itemType,
          HasSlots: !!(item.slots && item.slots.length > 0),
          NumSlots: item.slots?.length || 0,
          Keys: Object.keys(item).join(', ')
        })));

        // Show first plant in detail
        if (plantItems && plantItems.length > 0) {
          console.log('\n=== First Plant Item (Full Structure) ===');
          console.log(plantItems[0]);
          if (plantItems[0].slots) {
            console.log('\n=== Slots Detail ===');
            console.log(plantItems[0].slots);
          }
        }

        return { userSlots: inventory, plantItems };
      }

      console.error('❌ userSlotsAtom not found');
      return null;
    } catch (error) {
      console.error('Failed to debug inventory:', error);
      return null;
    }
  },
};

shareGlobal('QPM', QPM_DEBUG_API);
log('✅ QPM debug API registered (use QPM.debugPets() in console)');

// Load configuration similar to original
const LS_KEY = 'quinoa-pet-manager';
const defaultCfg = {
  enabled: false,
  threshold: 40,
  pollMs: 3000,
  clickCooldownMs: 4000,
  retryDelaySeconds: 15,
  logs: true,
  ui: {
    preventScrollClicks: true,
  },
  inventoryLocker: {
    syncMode: true,
  },
  mutationReminder: {
    enabled: true,
    showNotifications: true,
    highlightPlants: true,
  },
  harvestReminder: {
    enabled: false,
    highlightEnabled: true,
    toastEnabled: true,
    minSize: 80,
    selectedMutations: {
      Rainbow: true,
      Gold: false,
      Frozen: false,
      Wet: false,
      Chilled: false,
      Dawnlit: false,
      Amberlit: false,
      Amberbound: false,
      Dawnbound: false,
    },
  },
  turtleTimer: {
    enabled: true,
    includeBoardwalk: false,
    minActiveHungerPct: 2,
    fallbackTargetScale: 1.5,
    focus: 'latest',
  },
};

function loadCfg() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}

const loadedCfg = loadCfg();
const cfg = {
  ...defaultCfg,
  ...loadedCfg,
  ui: { ...defaultCfg.ui, ...(loadedCfg.ui || {}) },
  inventoryLocker: { ...defaultCfg.inventoryLocker, ...(loadedCfg.inventoryLocker || {}) },
  mutationReminder: { ...defaultCfg.mutationReminder, ...(loadedCfg.mutationReminder || {}) },
  harvestReminder: {
    ...defaultCfg.harvestReminder,
    ...(loadedCfg.harvestReminder || {}),
    selectedMutations: {
      ...defaultCfg.harvestReminder.selectedMutations,
      ...(loadedCfg.harvestReminder?.selectedMutations || {}),
    },
  },
  turtleTimer: {
    ...defaultCfg.turtleTimer,
    ...(loadedCfg.turtleTimer || {}),
  },
};

// Global error filter to silence noisy external proxy errors
window.addEventListener('error', (event) => {
  try {
    const message = String(event?.message || '');
    if (message.includes("Failed to execute 'contains' on 'Node'")) {
      event.stopImmediatePropagation?.();
      event.preventDefault?.();
      return false;
    }
  } catch {}
  return true;
}, true);

async function waitForGame(): Promise<void> {
  log('⏳ Waiting for game to load...');
  
  // Wait for body
  await ready;
  await sleep(100);
  
  // Wait for QuinoaUI (SPA-ready indicator)
  const maxWait = 30000;
  const interval = 500;
  const deadline = Date.now() + maxWait;
  
  while (Date.now() < deadline) {
    const hudRoot = getGameHudRoot();
    if (hudRoot) {
      const hudContent = hudRoot.querySelector('canvas, button, [data-tm-main-interface], [data-tm-hud-root], [data-tm-player-id]');
      if (hudContent) {
        log('✅ Game UI detected');
        return;
      }
    }

    const anyCanvas = document.querySelector('#App canvas');
    if (anyCanvas) {
      log('✅ Game UI detected');
      return;
    }

    await sleep(interval);
  }
  
  log('⚠️ Game UI not detected within timeout, proceeding anyway');
}

async function initialize(): Promise<void> {
  log('🚀 Quinoa Pet Manager initializing...');
  
  // Initialize sprite extractor early to intercept image loads
  spriteExtractor.init();
  
  // Wait for game to be ready
  await waitForGame();
  initializeStatsStore();
  initializePetXpTracker();
  initializeXpTracker();
  initializeMutationValueTracking();
  initializeAutoFavorite();
  await startInventoryStore();

  // Initialize features
  startCropTypeLocking();
  await startGardenBridge();
  initializeHarvestReminder({
    enabled: cfg.harvestReminder.enabled,
    highlightEnabled: cfg.harvestReminder.highlightEnabled,
    toastEnabled: cfg.harvestReminder.toastEnabled,
    minSize: cfg.harvestReminder.minSize,
    selectedMutations: cfg.harvestReminder.selectedMutations,
  });
  initializeTurtleTimer(cfg.turtleTimer);

  startMutationReminder();
  startMutationTracker();

  configureHarvestReminder({
    enabled: cfg.harvestReminder.enabled,
    highlightEnabled: cfg.harvestReminder.highlightEnabled,
    toastEnabled: cfg.harvestReminder.toastEnabled,
    minSize: cfg.harvestReminder.minSize,
    selectedMutations: cfg.harvestReminder.selectedMutations,
  });
  configureTurtleTimer(cfg.turtleTimer);

  // Start crop boost tracker
  startCropBoostTracker();

  // Initialize crop size indicator
  initCropSizeIndicator();

  // Initialize public rooms
  initPublicRooms();

  // Set configuration for UI
  setCfg(cfg);

  // Create UI
  await createOriginalUI();

  // Start version checker (checks for updates periodically)
  startVersionChecker();

  log('✅ Quinoa Pet Manager initialized successfully');
}

// Initialize when script loads
initialize().catch(error => {
  console.error('[QuinoaPetMgr] Initialization failed:', error);
});