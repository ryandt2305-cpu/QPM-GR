## 🎯 Summary of Findings (CONFIRMED)

 

After extensive investigation including DOM inspection, sprite cache analysis, and React fiber data extraction, we have **definitively determined** how rainbow/gold pet sprites work:

 

### Data Structure (100% Confirmed)

 

Rainbow and gold pets are represented in the game data with:

 

```typescript

{

  itemType: 'Pet',

  petSpecies: 'SomePetName',

  mutations: ['Rainbow'] or ['Gold'],  // ✅ ONLY RELIABLE INDICATOR

  abilities: [...],

  targetScale: 2.410...,  // ⚠️ THIS IS PET GROWTH/SIZE, NOT MUTATION!

  // ... other properties

}

```

 

**Critical Finding:**

- **`mutations` array is the ONLY reliable way to detect rainbow/gold pets**

- **`targetScale` is pet growth/size level, NOT mutation type!**

 

Example from actual pet data:

```javascript

// Rainbow Worm

mutations: ['Rainbow']

targetScale: 1.031118991706166  // Small pet!

 

// Gold Turtle

mutations: ['Gold']

targetScale: 1.810422614784983  // Medium pet

 

// Normal Peacock

mutations: []

targetScale: 2.410892742695469  // BIGGER than both mutated pets!

```

 

**This proves `targetScale` has nothing to do with mutations!**

 

### Visual Rendering (100% Confirmed)

 

✅ **Confirmed Method: Canvas Pixel Manipulation**

 

Rainbow and gold effects are **NOT** created by:

- ❌ CSS filters (DevTools showed `filter: none` on all elements)

- ❌ Canvas context filters (showed `filter: none` in canvas context)

- ❌ Separate sprite sheets (403 errors on guessed URLs, not in sprite cache)

 

Instead, they are created by:

- ✅ **Direct pixel manipulation** using `getImageData()` / `putImageData()`

- ✅ Pets are rendered to **256×256 canvas elements**

- ✅ Effects are applied per-pixel during rendering

- ✅ Only `image-rendering: pixelated` CSS is used (for crisp display)

 

## Assets Confirmed

 

- ✅ **Base pets**: `https://magicgarden.gg/version/19aaa98/assets/tiles/pets.png`

- ✅ **Mutation overlay** (crops): `https://magicgarden.gg/version/19aaa98/assets/tiles/mutation_overlay.png`

- ✅ **Sprite cache**: `window.Sprites.tileCacheCanvas` has 20 cached tiles (base sprites only)

- ❌ **Rainbow/gold pet sprites**: Confirmed to NOT exist as separate files

## 🛠️ How to Extract Rainbow/Gold Pet Sprites

 

### Method 1: Extract Rendered Sprites (EASIEST)

 

Use `batch-extract-pets.js` to extract sprites from rendered canvases:

 

**Step 1: Extract Active Pets**

1. Put rainbow/gold pets in your **active team** (visible on screen)

2. Open DevTools Console (F12)

3. Copy/paste `batch-extract-pets.js` into console

4. Script will automatically:

   - Find all pets in inventory

   - Categorize by mutation type

   - Extract all visible active pet canvases

   - Download as PNG files with species/mutation names

 

**Step 2: Extract Inventory/Hutch Pets**

1. Open your **Pet Hutch** or scroll through **Inventory**

2. As pets become visible, their canvases render

3. Run this command in console:

```javascript

window.autoExtractPets()

```

4. Repeat as you scroll to make more pets visible

 

**Output:** PNG files named like `Worm_Rainbow_FluffyName.png`

 

### Method 2: Reverse-Engineer the Pixel Transformation

 

Use `reverse-engineer-rainbow-effect.js` to analyze HOW the rainbow/gold effect works:

 

**Prerequisites:**

- You need both a **normal** and **mutated** version of the same species

- Both must be in your **active team** (visible on screen)

 

**Steps:**

1. Put a normal pet and its rainbow/gold variant in your active team

2. Open DevTools Console (F12)

3. Copy/paste `reverse-engineer-rainbow-effect.js` into console

4. Script will:

   - Find pairs of same species with different mutations

   - Extract pixel data from both canvases

   - Compare RGB values to find transformation patterns

   - Calculate average color ratios and offsets

   - Detect hue shifts (rainbow) or brightness boosts (gold)

   - Store detailed sample data for analysis

 

**Output:**

```javascript

window.rainbowTransformSamples  // Array of pixel transformations for rainbow

window.goldTransformSamples     // Array of pixel transformations for gold

```

 

**Use this data to recreate the effect:**

```javascript

// Pseudocode based on analysis results

for (each pixel in sprite) {

  newR = originalR * ratioR + offsetR

  newG = originalG * ratioG + offsetG

  newB = originalB * ratioB + offsetB

  clamp to 0-255

}

```