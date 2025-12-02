// Reverse-engineer the rainbow/gold pixel transformation

// Compares normal vs rainbow/gold sprites to find the algorithm

 
 
(async function reverseEngineerRainbowEffect() {

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const INVENTORY_ATOM_LABELS = ['myInventoryAtom', 'myCropInventoryAtom'];
  const PET_HUTCH_ATOM_LABEL = 'myPetHutchPetItemsAtom';
  const ACTIVE_PETS_ATOM_LABEL = 'myPetInfosAtom';
  const PATCH_FLAG = '__rainbowOrigWrite';
  const DEFAULT_PET_SHEET_URL = 'https://magicgarden.gg/version/19aaa98/assets/tiles/pets.png';
  const PET_TILE_SIZE_CANDIDATES = [256, 512, 128];
  const PET_TILE_MAP = {
    bee: 0,
    chicken: 1,
    bunny: 2,
    turtle: 3,
    capybara: 4,
    cow: 5,
    pig: 6,
    butterfly: 7,
    snail: 8,
    worm: 9,
    commonegg: 10,
    uncommonegg: 11,
    rareegg: 12,
    legendaryegg: 13,
    mythicalegg: 14,
    divineegg: 15,
    celestialegg: 16,
    squirrel: 17,
    goat: 18,
    dragonfly: 19,
    turkey: 28,
    peacock: 29,
  };
  const mutationTransforms = {};
  const generatedMutationSprites = {};
  let cachedPetSheet = null;
  let petSheetPromise = null;
  let jotaiStore = null;
  let captureInProgress = false;
  let cachedPetEntries = [];
  let cachedSpeciesList = [];
  const missingTileWarnings = new Set();

  console.log('='.repeat(60));

  console.log('RAINBOW/GOLD PIXEL TRANSFORMATION ANALYZER');

  console.log('='.repeat(60));

 

  // Step 1: Find pairs of same species with different mutations

  const { entries: allPets, counts: petCounts } = await loadAllKnownPets();

  if (!allPets || allPets.length === 0) {

    console.error('❌ Unable to read pet atoms (inventory/hutch/active). Make sure the mini atom bridge or inspector is running.');

    return;

  }

 

  console.log(`\n✅ Found ${allPets.length} total pets via atoms (active: ${petCounts.active}, inventory: ${petCounts.inventory}, hutch: ${petCounts.hutch})\n`);

 

  // Group by species

  const bySpecies = {};

  allPets.forEach(pet => {

    const species = pet.petSpecies || pet.species || 'Unknown';

    if (!bySpecies[species]) bySpecies[species] = [];

    bySpecies[species].push(pet);

  });

 

  // Find species where we have both normal and mutated versions

  console.log('Looking for species with multiple mutation types...\n');

 

  const comparablePairs = [];

  for (const species in bySpecies) {

    const pets = bySpecies[species];

    const normal = pets.find(p => !p.mutations || p.mutations.length === 0);

    const rainbow = pets.find(p => p.mutations?.includes('Rainbow'));

    const gold = pets.find(p => p.mutations?.includes('Gold'));

 

    if (normal && rainbow) {

      comparablePairs.push({ species, normal, rainbow, type: 'rainbow' });

      console.log(`🌈 ${species}: Normal + Rainbow pair found`);

    }

    if (normal && gold) {

      comparablePairs.push({ species, normal, gold, type: 'gold' });

      console.log(`✨ ${species}: Normal + Gold pair found`);

    }

  }

 

  if (comparablePairs.length === 0) {

    console.log('❌ No comparable pairs found. You need both normal and mutated versions of the same species in your team/visible.');

    console.log('\n💡 TIP: Put a normal pet and its rainbow/gold variant in your active team, then run this script.');

    return;

  }

 

  console.log(`\n✅ Found ${comparablePairs.length} comparable pairs\n`);

 

  // Step 2: Analyze canvas pixel data

  console.log('='.repeat(60));

  console.log('PIXEL DATA ANALYSIS');

  console.log('='.repeat(60) + '\n');

 

  // Function to get canvas for a pet

  function findPetCanvas(entry) {

    if (!entry) return null;

    const targetIds = buildPetIdSet(entry);

    const targetSpecies = normalizeSpeciesKey(entry.petSpecies || entry.species);

    const targetMutations = normalizeMutationList(entry.mutations);

    const canvases = document.querySelectorAll('canvas[width="256"][height="256"]');

    for (const canvas of canvases) {

      const button = canvas.closest('button');

      if (!button) continue;

      const fiberKey = Object.keys(button).find(k => k.startsWith('__react'));

      if (!fiberKey) continue;

      let fiber = button[fiberKey];

      let depth = 0;

      while (fiber && depth < 15) {

        const info = extractFiberPetInfo(fiber);

        if (info && matchesPetEntry(info, targetIds, targetSpecies, targetMutations)) {

          return canvas;

        }

        fiber = fiber.return;

        depth++;

      }

    }

    return null;

  }

  function extractFiberPetInfo(fiber) {

    const props = fiber.memoizedProps || fiber.pendingProps;

    const slot = props?.petSlot || props?.slot || null;

    if (!slot) return null;

    const pet = slot.pet || slot;

    return {

      ids: buildIdArray([slot.id, slot.petId, slot.slotId, pet?.id, pet?.petId]),

      species: pet?.petSpecies || pet?.species || null,

      mutations: Array.isArray(pet?.mutations) ? pet.mutations : [],

    };

  }

  function buildIdArray(list) {

    return list

      .map(value => (value == null ? null : String(value)))

      .filter(Boolean);

  }

  function buildPetIdSet(entry) {

    const ids = buildIdArray([entry.id, entry.petId, entry.slotId, entry.slotIndex]);

    return new Set(ids);

  }

  function normalizeMutationList(list) {

    if (!Array.isArray(list) || !list.length) return [];

    return list

      .map(value => normalizeMutation(value))

      .filter(Boolean)

      .sort();

  }

  function normalizeMutation(value) {

    if (!value) return '';

    return String(value).trim().toLowerCase();

  }

  function matchesPetEntry(slotInfo, targetIds, targetSpecies, targetMutations) {

    if (!slotInfo) return false;

    const slotSpecies = normalizeSpeciesKey(slotInfo.species);

    const slotMutations = normalizeMutationList(slotInfo.mutations);

    const slotIdSet = new Set(slotInfo.ids || []);

    const idMatch = targetIds.size > 0 && intersects(slotIdSet, targetIds);

    const speciesMatch = targetSpecies && slotSpecies === targetSpecies;

    const mutationMatch = targetMutations.length

      ? arraysEqual(targetMutations, slotMutations)

      : slotMutations.length === 0;

    return idMatch || (speciesMatch && mutationMatch);

  }

  function intersects(setA, setB) {

    for (const value of setA) {

      if (setB.has(value)) return true;

    }

    return false;

  }

  function arraysEqual(a, b) {

    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {

      if (a[i] !== b[i]) return false;

    }

    return true;

  }

 

  async function analyzeComparablePair(pair) {

    console.log(`
${'='.repeat(60)}`);

    console.log(`Analyzing: ${pair.species} (${pair.type})`);

    console.log('='.repeat(60));

    let normalCanvas = findPetCanvas(pair.normal);

    const mutatedCanvas = findPetCanvas(pair[pair.type]);

    if (!mutatedCanvas) {

      console.log(`⚠️ ${pair.type} ${pair.species} not visible. Add the mutated pet to an active slot.`);

      return;

    }

    if (!normalCanvas) {

      console.log(`⚠️ Normal ${pair.species} not visible. Attempting to use base sprite from pets.png...`);

      normalCanvas = await getBaseSpriteCanvas(pair.species);

      if (normalCanvas) {

        console.log('✅ Loaded base sprite from pet sheet as normal reference.');

      } else {

        console.log(`❌ Unable to locate a normal ${pair.species} reference. Add the normal pet to an active slot.`);

        return;

      }

    }

    console.log('✅ Canvases ready, analyzing...');

    analyzePixelDifference(normalCanvas, mutatedCanvas, pair.type);

  }

  // Function to analyze pixel differences

  function analyzePixelDifference(normalCanvas, mutatedCanvas, mutationType) {

    console.log(`\nAnalyzing ${mutationType} transformation...\n`);

 

    try {

      const ctx1 = normalCanvas.getContext('2d');

      const ctx2 = mutatedCanvas.getContext('2d');

 

      const data1 = ctx1.getImageData(0, 0, normalCanvas.width, normalCanvas.height);

      const data2 = ctx2.getImageData(0, 0, mutatedCanvas.width, mutatedCanvas.height);

 

      const pixels1 = data1.data;

      const pixels2 = data2.data;

 

      // Sample analysis of first 100 non-transparent pixels

      const samples = [];

      let sampleCount = 0;

 

      for (let i = 0; i < pixels1.length && sampleCount < 100; i += 4) {

        const r1 = pixels1[i];

        const g1 = pixels1[i + 1];

        const b1 = pixels1[i + 2];

        const a1 = pixels1[i + 3];

 

        const r2 = pixels2[i];

        const g2 = pixels2[i + 1];

        const b2 = pixels2[i + 2];

        const a2 = pixels2[i + 3];

 

        // Skip fully transparent pixels

        if (a1 === 0 || a2 === 0) continue;

 

        // Skip if colors are identical (no transformation)

        if (r1 === r2 && g1 === g2 && b1 === b2) continue;

 

        samples.push({

          original: { r: r1, g: g1, b: b1, a: a1 },

          mutated: { r: r2, g: g2, b: b2, a: a2 },

          ratios: {

            r: r2 / (r1 || 1),

            g: g2 / (g1 || 1),

            b: b2 / (b1 || 1)

          },

          diffs: {

            r: r2 - r1,

            g: g2 - g1,

            b: b2 - b1

          }

        });

 

        sampleCount++;

      }

 

      if (samples.length === 0) {

        console.log('⚠️ No pixel differences found. Sprites might be identical.');

        return null;

      }

 

      console.log(`📊 Analyzed ${samples.length} transformed pixels\n`);

 

      // Analyze patterns

      console.log('Sample transformations:');

      samples.slice(0, 10).forEach((s, i) => {

        console.log(`\n  Pixel ${i + 1}:`);

        console.log(`    Original: RGB(${s.original.r}, ${s.original.g}, ${s.original.b})`);

        console.log(`    Mutated:  RGB(${s.mutated.r}, ${s.mutated.g}, ${s.mutated.b})`);

        console.log(`    Ratios:   R:${s.ratios.r.toFixed(2)} G:${s.ratios.g.toFixed(2)} B:${s.ratios.b.toFixed(2)}`);

        console.log(`    Diffs:    R:${s.diffs.r} G:${s.diffs.g} B:${s.diffs.b}`);

      });

 

      // Calculate average transformations

      const avgRatios = {

        r: samples.reduce((sum, s) => sum + s.ratios.r, 0) / samples.length,

        g: samples.reduce((sum, s) => sum + s.ratios.g, 0) / samples.length,

        b: samples.reduce((sum, s) => sum + s.ratios.b, 0) / samples.length

      };

 

      const avgDiffs = {

        r: samples.reduce((sum, s) => sum + s.diffs.r, 0) / samples.length,

        g: samples.reduce((sum, s) => sum + s.diffs.g, 0) / samples.length,

        b: samples.reduce((sum, s) => sum + s.diffs.b, 0) / samples.length

      };

 

      console.log('\n📈 AVERAGE TRANSFORMATION:');

      console.log(`  Multiply ratios: R×${avgRatios.r.toFixed(3)} G×${avgRatios.g.toFixed(3)} B×${avgRatios.b.toFixed(3)}`);

      console.log(`  Add offsets:     R+${avgDiffs.r.toFixed(1)} G+${avgDiffs.g.toFixed(1)} B+${avgDiffs.b.toFixed(1)}`);

 

      // Check for hue shift pattern (rainbow)

      if (mutationType === 'rainbow') {

        console.log('\n🌈 Checking for hue shift pattern...');

 

        // Convert samples to HSL to detect hue rotation

        const hslSamples = samples.map(s => {

          return {

            originalHue: rgbToHue(s.original.r, s.original.g, s.original.b),

            mutatedHue: rgbToHue(s.mutated.r, s.mutated.g, s.mutated.b)

          };

        }).filter(s => s.originalHue !== null && s.mutatedHue !== null);

 

        if (hslSamples.length > 0) {

          const hueShifts = hslSamples.map(s => s.mutatedHue - s.originalHue);

          const avgHueShift = hueShifts.reduce((sum, h) => sum + h, 0) / hueShifts.length;

          console.log(`  Average hue shift: ${avgHueShift.toFixed(1)}° (${(avgHueShift / 360 * 100).toFixed(1)}% of color wheel)`);

        }

      }

 

      // Check for brightness boost pattern (gold)

      if (mutationType === 'gold') {

        console.log('\n✨ Checking for brightness/saturation boost...');

 

        const brightnesses = samples.map(s => {

          const b1 = Math.max(s.original.r, s.original.g, s.original.b);

          const b2 = Math.max(s.mutated.r, s.mutated.g, s.mutated.b);

          return b2 / (b1 || 1);

        });

 

        const avgBrightnessBoost = brightnesses.reduce((sum, b) => sum + b, 0) / brightnesses.length;

        console.log(`  Average brightness boost: ${avgBrightnessBoost.toFixed(2)}x`);

      }

 

      // Store full sample data

      window[`${mutationType}TransformSamples`] = samples;

      console.log(`\n💾 Full data stored in: window.${mutationType}TransformSamples`);

 

      recordMutationTransform(mutationType, { ratios: avgRatios, diffs: avgDiffs, samples });

      return { samples, avgRatios, avgDiffs };

 

    } catch (error) {

      console.error('❌ Error analyzing pixels:', error);

      return null;

    }

  }

 

  // Helper: RGB to Hue

  function rgbToHue(r, g, b) {

    r /= 255;

    g /= 255;

    b /= 255;

 

    const max = Math.max(r, g, b);

    const min = Math.min(r, g, b);

    const delta = max - min;

 

    if (delta === 0) return null; // Grayscale, no hue

 

    let hue;

    if (max === r) {

      hue = ((g - b) / delta) % 6;

    } else if (max === g) {

      hue = (b - r) / delta + 2;

    } else {

      hue = (r - g) / delta + 4;

    }

 

    hue = Math.round(hue * 60);

    if (hue < 0) hue += 360;

 

    return hue;

  }

 

  // Step 3: Analyze each comparable pair

  console.log('Searching for canvases in DOM...\n');

  for (const pair of comparablePairs) {

    await analyzeComparablePair(pair);

  }

 

  // Final instructions

  console.log('\n' + '='.repeat(60));

  console.log('NEXT STEPS');

  console.log('='.repeat(60));

  console.log('\n1. Review the transformation patterns above');

  console.log('2. Check stored data: window.rainbowTransformSamples');

  console.log('3. Check stored data: window.goldTransformSamples');

  console.log('4. Use these patterns to recreate the effect in your own code');

  console.log('\nExample recreation pseudocode:');

  console.log('  for each pixel in sprite:');

  console.log('    newR = originalR * ratioR + offsetR');

  console.log('    newG = originalG * ratioG + offsetG');

  console.log('    newB = originalB * ratioB + offsetB');

  console.log('    clamp values to 0-255');

  console.log('\nOnce a transformation is captured, generate sprites without rendering each pet manually:');

  console.log("  await window.generateMutationSprites('rainbow')");

  console.log("  await window.generateMutationSprites('gold')");

  console.log("Download a single sprite via window.downloadMutationSprite('Chicken', 'rainbow').");

 

  console.log('\n' + '='.repeat(60));

  console.log('DONE');

  console.log('='.repeat(60));
 
  // ---------------------------------------------------------------------------

  async function loadAllKnownPets() {

    const cache = await waitForAtomCache();

    if (!cache) {

      console.warn('⚠️ jotaiAtomCache not detected. Open inventory once or run the Atom Inspector userscript.');

      return { entries: [], counts: { active: 0, inventory: 0, hutch: 0 } };

    }

 

    const counts = { active: 0, inventory: 0, hutch: 0 };

    const entries = [];

 

    const inventoryRaw = await readAtomValueSafe(INVENTORY_ATOM_LABELS);

    if (inventoryRaw) {

      const pets = normalizeInventoryItems(inventoryRaw).filter(isPetEntry);

      counts.inventory = pets.length;

      pets.forEach((pet) => entries.push({ ...pet, __source: 'inventory' }));

    }

 

    const hutchRaw = await readAtomValueSafe(PET_HUTCH_ATOM_LABEL);

    if (hutchRaw) {

      const pets = normalizeInventoryItems(hutchRaw).filter(isPetEntry);

      counts.hutch = pets.length;

      pets.forEach((pet) => entries.push({ ...pet, __source: 'hutch' }));

    }

 

    const activeRaw = await readAtomValueSafe(ACTIVE_PETS_ATOM_LABEL);

    if (activeRaw) {

      const pets = normalizeActivePetInfos(activeRaw);

      counts.active = pets.length;

      pets.forEach((pet) => entries.push({ ...pet, __source: 'active' }));

    }

 

    const deduped = dedupePets(entries);

    cachedPetEntries = deduped;

    cachedSpeciesList = extractSpeciesList(deduped);

    pageWindow.allPetSpecies = cachedSpeciesList;

    return { entries: deduped, counts };

  }

 

  function normalizeInventoryItems(raw) {

    if (!raw) return [];

    if (Array.isArray(raw)) return raw;

    if (Array.isArray(raw.items)) return raw.items;

    if (Array.isArray(raw.inventory)) return raw.inventory;

    if (Array.isArray(raw.list)) return raw.list;

    if (typeof raw === 'object') {

      const values = Object.values(raw);

      for (const value of values) {

        if (Array.isArray(value) && value.length && typeof value[0] === 'object') {

          return value;

        }

      }

    }

    return [];

  }

 

  function normalizeActivePetInfos(raw) {

    if (!Array.isArray(raw)) return [];

 

    return raw.map(entry => {

      const slot = entry?.slot ?? entry ?? {};

      return {

        id: slot.id || slot.petId || slot.slotId || slot.slotIndex || null,

        petSpecies: slot.petSpecies || slot.species || null,

        species: slot.petSpecies || slot.species || null,

        mutations: Array.isArray(slot.mutations) ? slot.mutations : [],

        name: slot.name || slot.displayName || null,

        itemType: 'Pet',

        raw: slot,

      };

    }).filter(isPetEntry);

  }

 

  function dedupePets(pets) {

    if (!Array.isArray(pets)) return [];

    const seen = new Set();

    const result = [];

    for (const pet of pets) {

      const key = buildPetKey(pet);

      if (seen.has(key)) continue;

      seen.add(key);

      result.push(pet);

    }

    return result;

  }

 

  function buildPetKey(pet) {

    const id = pet?.id || pet?.petId || pet?.slotId || pet?.slotIndex || 'unknown';

    const species = pet?.petSpecies || pet?.species || 'unknown';

    const mutations = Array.isArray(pet?.mutations) ? pet.mutations.slice().sort().join(',') : '';

    return `${id}-${species}-${mutations}`;

  }

 

  function isPetEntry(entry) {

    if (!entry || typeof entry !== 'object') return false;

    if (entry.itemType === 'Pet') return true;

    if (entry.petSpecies) return true;

    if (entry.species && !entry.itemType) return true;

    return false;

  }

 

  async function readAtomValueSafe(labels) {

    const list = Array.isArray(labels) ? labels : [labels];

    for (const label of list) {

      const atom = getAtomByLabel(label);

      if (!atom) continue;

      try {

        const value = await readAtomValue(atom);

        if (value != null) {

          return value;

        }

      } catch (error) {

        console.warn(`⚠️ Failed to read ${label}:`, error);

      }

    }

 

    return null;

  }

 

  /* ------------------------------------------------------------------------ */
  /* Offline sprite generation helpers                                        */
  /* ------------------------------------------------------------------------ */

  async function getBaseSpriteCanvas(species) {

    const sheet = await ensurePetSpriteSheet();

    if (!sheet) return null;

    return getSpeciesTileCanvas(sheet, species);

  }

 

  async function generateMutationSpritesForAllPets(mutationType, options = {}) {

    const transform = mutationTransforms[mutationType];

    if (!transform) {

      console.warn(`⚠️ No ${mutationType} transformation data recorded yet. Run the analyzer first.`);

      return null;

    }

 

    const sheet = await ensurePetSpriteSheet();

    if (!sheet) {

      console.warn('⚠️ Unable to load pet sprite sheet. Make sure you have visited an area that loads pets.png.');

      return null;

    }

 

    const targetSpecies = Array.isArray(options.species) && options.species.length

      ? options.species

      : (cachedSpeciesList.length ? cachedSpeciesList : Object.keys(PET_TILE_MAP));

 

    if (!targetSpecies.length) {

      console.warn('⚠️ No species available to render. Open your pet inventory/hutch first.');

      return null;

    }

 

    const result = {};

    const normalizedTransform = {

      ratios: transform.ratios || transform.avgRatios || { r: 1, g: 1, b: 1 },

      diffs: transform.diffs || transform.avgDiffs || { r: 0, g: 0, b: 0 },

    };

 

    let generatedCount = 0;

    for (const species of targetSpecies) {

      const tileCanvas = getSpeciesTileCanvas(sheet, species);

      if (!tileCanvas) {

        continue;

      }

      const mutatedCanvas = applyColorTransformCanvas(tileCanvas, normalizedTransform);

      const dataUrl = mutatedCanvas.toDataURL('image/png');

      if (!generatedMutationSprites[mutationType]) {

        generatedMutationSprites[mutationType] = {};

      }

      generatedMutationSprites[mutationType][species] = { canvas: mutatedCanvas, dataUrl };

      result[species] = generatedMutationSprites[mutationType][species];

      generatedCount++;

    }

 

    if (!generatedCount) {

      console.warn(`⚠️ Failed to generate any ${mutationType} sprites. Add tile mappings via window.registerPetTileIndex('Species', index).`);

      return null;

    }

 

    console.log(`✅ Generated ${generatedCount} ${mutationType} sprites. Access via window.generatedMutationSprites['${mutationType}'].`);

    return result;

  }

 

  function downloadMutationSprite(species, mutationType = 'rainbow') {

    const bucket = generatedMutationSprites[mutationType];

    if (!bucket) {

      console.warn(`⚠️ No generated sprites for ${mutationType} yet. Run window.generateMutationSprites('${mutationType}') first.`);

      return;

    }

    const entry = bucket[species];

    if (!entry) {

      console.warn(`⚠️ No cached sprite for ${species} (${mutationType}).`);

      return;

    }

    triggerDownload(entry.dataUrl, `${species}_${mutationType}.png`);

  }

 

  function triggerDownload(dataUrl, filename) {

    const link = document.createElement('a');

    link.href = dataUrl;

    link.download = filename;

    document.body.appendChild(link);

    link.click();

    setTimeout(() => link.remove(), 0);

  }

 

  async function ensurePetSpriteSheet() {

    if (cachedPetSheet) {

      return cachedPetSheet;

    }

    if (petSheetPromise) {

      return petSheetPromise;

    }

 

    petSheetPromise = (async () => {

      const url = findSpriteSheetUrl(/pets\.png/i) || DEFAULT_PET_SHEET_URL;

      console.log(`[rainbow-effect] Loading pet sprite sheet: ${url}`);

      const img = await loadImageElement(url);

      const canvas = document.createElement('canvas');

      canvas.width = img.width;

      canvas.height = img.height;

      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0);

      const tileSize = detectTileSize(img.width, img.height);

      const tilesPerRow = Math.floor(img.width / tileSize);

      const tilesPerColumn = Math.floor(img.height / tileSize);

      cachedPetSheet = { url, canvas, ctx, tileSize, tilesPerRow, tilesPerColumn };

      return cachedPetSheet;

    })().catch((error) => {

      console.error('❌ Failed to load pet sprite sheet:', error);

      return null;

    });

 

    return petSheetPromise;

  }

 

  function detectTileSize(width, height) {

    for (const size of PET_TILE_SIZE_CANDIDATES) {

      if (width % size === 0 && height % size === 0) {

        return size;

      }

    }

    return 256;

  }

 

  function findSpriteSheetUrl(pattern) {

    const perf = pageWindow?.performance ?? performance;

    if (perf && typeof perf.getEntriesByType === 'function') {

      const entries = perf.getEntriesByType('resource');

      for (const entry of entries) {

        if (pattern.test(entry.name)) {

          return entry.name;

        }

      }

    }

 

    const nodes = Array.from(document.querySelectorAll('link[href], script[src], img[src]'));

    for (const node of nodes) {

      const url = node.getAttribute('href') || node.getAttribute('src');

      if (url && pattern.test(url)) {

        return url;

      }

    }

 

    return null;

  }

 

  function getSpeciesTileCanvas(sheet, species) {

    const index = getTileIndexForSpecies(species);

    if (typeof index !== 'number') {

      return null;

    }

 

    const tileCanvas = document.createElement('canvas');

    tileCanvas.width = sheet.tileSize;

    tileCanvas.height = sheet.tileSize;

    const ctx = tileCanvas.getContext('2d');

    const x = (index % sheet.tilesPerRow) * sheet.tileSize;

    const y = Math.floor(index / sheet.tilesPerRow) * sheet.tileSize;

    ctx.drawImage(sheet.canvas, x, y, sheet.tileSize, sheet.tileSize, 0, 0, sheet.tileSize, sheet.tileSize);

    return tileCanvas;

  }

 

  function getTileIndexForSpecies(species) {

    const key = normalizeSpeciesKey(species);

    if (!key) {

      return null;

    }

    if (Object.prototype.hasOwnProperty.call(PET_TILE_MAP, key)) {

      return PET_TILE_MAP[key];

    }

    if (!missingTileWarnings.has(key)) {

      console.warn(`⚠️ No tile mapping for species "${species}". Provide one via window.registerPetTileIndex('${species}', index).`);

      missingTileWarnings.add(key);

    }

    return null;

  }

 

  function registerPetTileIndex(species, index) {

    const key = normalizeSpeciesKey(species);

    if (!key || !Number.isFinite(Number(index))) {

      console.warn('⚠️ Usage: window.registerPetTileIndex("Species", tileIndexNumber)');

      return;

    }

    PET_TILE_MAP[key] = Number(index);

    missingTileWarnings.delete(key);

    console.log(`✅ Registered tile #${index} for ${species}`);

  }

 

  function normalizeSpeciesKey(name) {

    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  }

 

  function extractSpeciesList(pets) {

    const set = new Set();

    pets.forEach((pet) => {

      const label = (pet.petSpecies || pet.species || '').trim();

      if (label) {

        set.add(label);

      }

    });

    return Array.from(set).sort();

  }

 

  function applyColorTransformCanvas(sourceCanvas, transform) {

    const canvas = document.createElement('canvas');

    canvas.width = sourceCanvas.width;

    canvas.height = sourceCanvas.height;

    const ctx = canvas.getContext('2d');

    ctx.drawImage(sourceCanvas, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const data = imageData.data;

    const ratios = transform.ratios || { r: 1, g: 1, b: 1 };

    const diffs = transform.diffs || { r: 0, g: 0, b: 0 };

    for (let i = 0; i < data.length; i += 4) {

      data[i] = clampChannel(data[i] * ratios.r + diffs.r);

      data[i + 1] = clampChannel(data[i + 1] * ratios.g + diffs.g);

      data[i + 2] = clampChannel(data[i + 2] * ratios.b + diffs.b);

    }

    ctx.putImageData(imageData, 0, 0);

    return canvas;

  }

 

  function clampChannel(value) {

    return Math.max(0, Math.min(255, Math.round(value)));

  }

 

  function recordMutationTransform(mutationType, payload) {

    if (!payload || !payload.ratios || !payload.diffs) {

      return;

    }

    mutationTransforms[mutationType] = { ratios: payload.ratios, diffs: payload.diffs };

    pageWindow[`${mutationType}Transform`] = payload;

    console.log(`💾 Stored ${mutationType} transform averages (R×${payload.ratios.r.toFixed(3)} G×${payload.ratios.g.toFixed(3)} B×${payload.ratios.b.toFixed(3)})`);

  }

 

  function loadImageElement(url) {

    return new Promise((resolve, reject) => {

      const img = new Image();

      img.crossOrigin = 'anonymous';

      img.onload = () => resolve(img);

      img.onerror = (error) => reject(error);

      img.src = url;

    });

  }

 

  pageWindow.generateMutationSprites = generateMutationSpritesForAllPets;
  pageWindow.downloadMutationSprite = downloadMutationSprite;
  pageWindow.registerPetTileIndex = registerPetTileIndex;
  pageWindow.generatedMutationSprites = generatedMutationSprites;
  pageWindow.petTileIndexMap = PET_TILE_MAP;

  function getAtomCache() {

    const root = pageWindow?.jotaiAtomCache;

    if (!root) return null;

    if (root.cache && typeof root.cache.values === 'function') {

      return root.cache;

    }

    if (typeof root.values === 'function') {

      return root;

    }

    return null;

  }

 

  async function waitForAtomCache(timeoutMs = 6000) {

    const start = Date.now();

    let cache = getAtomCache();

    while (!cache && Date.now() - start < timeoutMs) {

      await sleep(80);

      cache = getAtomCache();

    }

    return cache;

  }

 

  function getAtomByLabel(label) {

    const cache = getAtomCache();

    if (!cache || typeof cache.values !== 'function') return null;

    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const matcher = new RegExp(`^${escaped}$`);

    for (const atom of cache.values()) {

      if (!atom) continue;

      const atomLabel = String(atom.debugLabel || atom.label || '');

      if (matcher.test(atomLabel)) return atom;

    }

    return null;

  }

 

  async function readAtomValue(atom) {

    const store = await ensureJotaiStore();

    if (!store || store.__polyfill) {

      throw new Error('Jotai store unavailable');

    }

    return store.get(atom);

  }

 

  async function ensureJotaiStore() {

    if (jotaiStore && !jotaiStore.__polyfill) {

      return jotaiStore;

    }

 

    if (captureInProgress) {

      const start = Date.now();

      while (captureInProgress && Date.now() - start < 5000) {

        await sleep(80);

      }

      if (jotaiStore && !jotaiStore.__polyfill) {

        return jotaiStore;

      }

    }

 

    captureInProgress = true;

    try {

      const fiberStore = findStoreViaFiber();

      if (fiberStore) {

        jotaiStore = fiberStore;

        return jotaiStore;

      }

 

      jotaiStore = await captureViaWriteOnce();

      return jotaiStore;

    } finally {

      captureInProgress = false;

    }

  }

 

  function findStoreViaFiber() {

    const hook = pageWindow?.__REACT_DEVTOOLS_GLOBAL_HOOK__;

    if (!hook?.renderers?.size) return null;

    for (const [rendererId] of hook.renderers) {

      const roots = hook.getFiberRoots?.(rendererId);

      if (!roots) continue;

      for (const root of roots) {

        const seen = new Set();

        const stack = [];

        const current = root?.current ?? root;

        if (current) stack.push(current);

        while (stack.length) {

          const fiber = stack.pop();

          if (!fiber || seen.has(fiber)) continue;

          seen.add(fiber);

          const value = fiber.pendingProps?.value;

          if (value && typeof value.get === 'function' && typeof value.set === 'function' && typeof value.sub === 'function') {

            return value;

          }

          if (fiber.child) stack.push(fiber.child);

          if (fiber.sibling) stack.push(fiber.sibling);

          if (fiber.alternate) stack.push(fiber.alternate);

        }

      }

    }

    return null;

  }

 

  async function captureViaWriteOnce(timeoutMs = 5000) {

    const cache = getAtomCache();

    if (!cache || typeof cache.values !== 'function') {

      return createPolyfillStore();

    }

 

    let capturedGet = null;

    let capturedSet = null;

    const patchedAtoms = [];

 

    const restorePatchedAtoms = () => {

      for (const atom of patchedAtoms) {

        try {

          if (atom[PATCH_FLAG]) {

            atom.write = atom[PATCH_FLAG];

            delete atom[PATCH_FLAG];

          }

        } catch {}

      }

    };

 

    for (const atom of cache.values()) {

      if (!atom || typeof atom.write !== 'function' || atom[PATCH_FLAG]) continue;

      const original = atom.write;

      atom[PATCH_FLAG] = original;

      atom.write = function patchedWrite(get, set, ...args) {

        if (!capturedSet) {

          capturedGet = get;

          capturedSet = set;

          restorePatchedAtoms();

        }

        return original.call(this, get, set, ...args);

      };

      patchedAtoms.push(atom);

    }

 

    const start = Date.now();

    while (!capturedSet && Date.now() - start < timeoutMs) {

      await sleep(50);

    }

 

    restorePatchedAtoms();

 

    if (!capturedSet || !capturedGet) {

      return createPolyfillStore();

    }

 

    return {

      get(atom) {

        return capturedGet(atom);

      },

      set(atom, value) {

        return capturedSet(atom, value);

      },

      sub(atom, cb) {

        let active = true;

        let lastValue;

        const interval = setInterval(() => {

          if (!active) return;

          try {

            const next = capturedGet(atom);

            if (next !== lastValue) {

              lastValue = next;

              cb();

            }

          } catch {}

        }, 120);

        return () => {

          active = false;

          clearInterval(interval);

        };

      },

    };

  }

 

  function createPolyfillStore() {

    return {

      __polyfill: true,

      get() {

        throw new Error('Store not captured');

      },

      set() {

        throw new Error('Store not captured');

      },

      sub() {

        return () => {};

      },

    };

  }

 

  function sleep(ms) {

    return new Promise(resolve => setTimeout(resolve, ms));

  }

})().catch((error) => {

  console.error('❌ Reverse-engineer rainbow script failed:', error);

});

 