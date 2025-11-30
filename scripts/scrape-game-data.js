#!/usr/bin/env node
/**
 * Game Data Scraper
 * Extracts updated game data from main-D6KeWgpc.js (or latest game source file)
 * Generates TypeScript definitions for pets, abilities, crops, and more
 */

const fs = require('fs');
const path = require('path');

const GAME_SOURCE = path.join(__dirname, '../main-D6KeWgpc.js');
const OUTPUT_DIR = path.join(__dirname, '../scraped-data');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('🔍 Scraping game data from:', GAME_SOURCE);

// Read game source
let gameSource = '';
try {
  gameSource = fs.readFileSync(GAME_SOURCE, 'utf8');
} catch (error) {
  console.error('❌ Failed to read game source file:', error.message);
  process.exit(1);
}

/**
 * Extract pet data from game source
 */
function extractPetData(source) {
  const pets = {};
  
  // Comprehensive pet name list to search for
  const petNames = [
    'Worm', 'Snail', 'Bee', 'Chicken', 'Bunny', 'Dragonfly',
    'Pig', 'Cow', 'Turkey', 'Squirrel', 'Turtle', 'Goat',
    'Butterfly', 'Peacock', 'Capybara'
  ];
  
  for (const petName of petNames) {
    // Find the pet definition starting point
    const startPattern = `${petName}:{tileRef:xn.${petName},`;
    const startIndex = source.indexOf(startPattern);
    
    if (startIndex === -1) {
      console.log(`   ⚠️  Could not find ${petName}`);
      continue;
    }
    
    // Find the end - look for the diet array and closing brace
    // Format: ...diet:["item1","item2",...]}
    let endIndex = startIndex;
    let braceCount = 1;
    let inArray = false;
    
    // Start after the opening brace of the pet object
    for (let i = startIndex + startPattern.length; i < source.length; i++) {
      const char = source[i];
      
      if (char === '[') inArray = true;
      if (char === ']') inArray = false;
      
      if (!inArray) {
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }
    }
    
    const entry = source.substring(startIndex, endIndex);
    
    // Extract properties
    const displayNameMatch = entry.match(/name:"([^"]+)"/);
    const hungerMatch = entry.match(/coinsToFullyReplenishHunger:(\d+)e?(\d*)/);
    const abilitiesMatch = entry.match(/innateAbilityWeights:\{([^}]+)\}/);
    const scaleMatch = entry.match(/baseTileScale:([\d.]+)/);
    const maxScaleMatch = entry.match(/maxScale:([\d.]+)/);
    const sellPriceMatch = entry.match(/maturitySellPrice:(\d+)e?(\d*)/);
    const weightMatch = entry.match(/matureWeight:([\d.]+)/);
    const moveProbMatch = entry.match(/moveProbability:([\d.]+)/);
    const hoursMatch = entry.match(/hoursToMature:(\d+)/);
    const rarityMatch = entry.match(/rarity:Be\.(\w+)/);
    
    if (!hungerMatch || !abilitiesMatch || !hoursMatch) {
      console.log(`   ⚠️  Missing required fields for ${petName}`);
      continue;
    }
    
    // Parse ability weights
    const abilities = {};
    const abilitiesStr = abilitiesMatch[1];
    const abilityPairs = abilitiesStr.split(',');
    for (const pair of abilityPairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) continue;
      const abilityName = pair.substring(0, colonIndex).trim();
      const weight = pair.substring(colonIndex + 1).trim();
      if (abilityName && weight) {
        abilities[abilityName] = parseInt(weight);
      }
    }
    
    // Handle scientific notation (e.g., 25e3 = 25000)
    const hungerCost = hungerMatch[2] 
      ? parseInt(hungerMatch[1]) * Math.pow(10, parseInt(hungerMatch[2]))
      : parseInt(hungerMatch[1]);
      
    const sellPrice = sellPriceMatch
      ? (sellPriceMatch[2]
        ? parseInt(sellPriceMatch[1]) * Math.pow(10, parseInt(sellPriceMatch[2]))
        : parseInt(sellPriceMatch[1]))
      : 0;
    
    pets[petName] = {
      name: displayNameMatch ? displayNameMatch[1] : petName,
      hungerCost,
      abilities,
      baseTileScale: scaleMatch ? parseFloat(scaleMatch[1]) : 1.0,
      maxScale: maxScaleMatch ? parseFloat(maxScaleMatch[1]) : 2.0,
      sellPrice,
      weight: weightMatch ? parseFloat(weightMatch[1]) : 0,
      moveProb: moveProbMatch ? parseFloat(moveProbMatch[1]) : 0,
      hoursToMature: parseInt(hoursMatch[1]),
      rarity: rarityMatch ? rarityMatch[1] : 'Unknown'
    };
  }
  
  return pets;
}

/**
 * Extract ability definitions from game source
 */
function extractAbilityData(source) {
  const abilities = {};
  
  // Look for ability ID enum: xn.Abilities or similar
  // Pattern: AbilityName:ID
  const abilityEnumPattern = /Abilities[^}]+\{([^}]+)\}/g;
  const match = abilityEnumPattern.exec(source);
  
  if (match) {
    const enumContent = match[1];
    const abilityPairs = enumContent.split(',');
    
    for (const pair of abilityPairs) {
      const [name, id] = pair.split(':');
      if (name && id) {
        abilities[name.trim()] = parseInt(id.trim());
      }
    }
  }
  
  return abilities;
}

/**
 * Extract crop/produce data from game source
 */
function extractCropData(source) {
  const crops = {};
  
  // Pattern: CropName:{...maxScale:X.X...}
  const cropPattern = /(\w+):\{[^}]*maxScale:([\d.]+)[^}]*\}/g;
  
  let match;
  while ((match = cropPattern.exec(source)) !== null) {
    const [_, name, maxScale] = match;
    
    // Filter out non-crop entries (pets, etc.)
    if (!name.match(/^(Bee|Chicken|Bunny|Turtle|Worm|Snail|Pig|Cow|Turkey|Squirrel|Goat|Butterfly|Peacock|Capybara|Dragonfly)$/)) {
      crops[name] = {
        maxScale: parseFloat(maxScale)
      };
    }
  }
  
  return crops;
}

/**
 * Extract egg spawn rates
 */
function extractEggRates(source) {
  const eggRates = {};
  
  // Pattern: EggType: { Species: 0.XX, ... }
  const patterns = [
    { name: 'Common', pattern: /Common.*?\{[^:]+:([0-9.]+)[^:]+:([0-9.]+)[^:]+:([0-9.]+)[^}]+\}/ },
    { name: 'Uncommon', pattern: /Uncommon.*?\{[^:]+:([0-9.]+)[^:]+:([0-9.]+)[^:]+:([0-9.]+)[^}]+\}/ },
    { name: 'Rare', pattern: /Rare.*?\{[^:]+:([0-9.]+)[^:]+:([0-9.]+)[^:]+:([0-9.]+)[^}]+\}/ },
    { name: 'Legendary', pattern: /Legendary.*?\{[^:]+:([0-9.]+)[^:]+:([0-9.]+)[^:]+:([0-9.]+)[^}]+\}/ },
  ];
  
  // This is simplified - would need actual species names from context
  return eggRates;
}

/**
 * Generate TypeScript interface from data
 */
function generateTypeScript(data, interfaceName) {
  let ts = `// Auto-generated from game source: ${new Date().toISOString()}\n\n`;
  ts += `export interface ${interfaceName} {\n`;
  
  for (const [key, value] of Object.entries(data)) {
    ts += `  ${key}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')};\n`;
  }
  
  ts += '}\n\n';
  ts += `export const ${interfaceName.toUpperCase()}: ${interfaceName} = ${JSON.stringify(data, null, 2)};\n`;
  
  return ts;
}

// Extract all data
console.log('📊 Extracting pet data...');
const petData = extractPetData(gameSource);
console.log(`   Found ${Object.keys(petData).length} pets`);

console.log('🎯 Extracting ability data...');
const abilityData = extractAbilityData(gameSource);
console.log(`   Found ${Object.keys(abilityData).length} abilities`);

console.log('🌱 Extracting crop data...');
const cropData = extractCropData(gameSource);
console.log(`   Found ${Object.keys(cropData).length} crops`);

// Write output files
console.log('\n📝 Writing output files...');

// Pet data
const petOutput = {
  timestamp: new Date().toISOString(),
  source: 'main-D6KeWgpc.js',
  pets: petData
};
fs.writeFileSync(
  path.join(OUTPUT_DIR, 'pets.json'),
  JSON.stringify(petOutput, null, 2)
);
console.log('   ✅ pets.json');

// Ability data
const abilityOutput = {
  timestamp: new Date().toISOString(),
  source: 'main-D6KeWgpc.js',
  abilities: abilityData
};
fs.writeFileSync(
  path.join(OUTPUT_DIR, 'abilities.json'),
  JSON.stringify(abilityOutput, null, 2)
);
console.log('   ✅ abilities.json');

// Crop data
const cropOutput = {
  timestamp: new Date().toISOString(),
  source: 'main-D6KeWgpc.js',
  crops: cropData
};
fs.writeFileSync(
  path.join(OUTPUT_DIR, 'crops.json'),
  JSON.stringify(cropOutput, null, 2)
);
console.log('   ✅ crops.json');

// Generate summary report
const report = `
# Game Data Scrape Report
**Generated:** ${new Date().toISOString()}
**Source:** main-D6KeWgpc.js

## Summary
- **Pets Found:** ${Object.keys(petData).length}
- **Abilities Found:** ${Object.keys(abilityData).length}
- **Crops Found:** ${Object.keys(cropData).length}

## Pet Details
${Object.entries(petData).map(([key, pet]) => `
### ${pet.name}
- **Rarity:** ${pet.rarity}
- **Hours to Mature:** ${pet.hoursToMature}
- **Hunger Cost:** ${pet.hungerCost} coins
- **Sell Price:** ${pet.sellPrice} coins
- **Abilities:** ${Object.entries(pet.abilities).map(([name, weight]) => `${name} (${weight}%)`).join(', ')}
`).join('\n')}

## Abilities
${Object.entries(abilityData).map(([name, id]) => `- ${name}: ${id}`).join('\n')}

## Next Steps
1. Review scraped data in \`scraped-data/\` directory
2. Compare with existing data files in \`src/data/\`
3. Update TypeScript definitions if new items detected
4. Run tests to ensure compatibility
`;

fs.writeFileSync(
  path.join(OUTPUT_DIR, 'REPORT.md'),
  report
);
console.log('   ✅ REPORT.md');

console.log('\n✨ Scraping complete!');
console.log(`📁 Output directory: ${OUTPUT_DIR}`);
console.log('\n💡 Review the scraped data and update your source files accordingly.');
