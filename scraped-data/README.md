# Game Data Scraper Documentation

## Overview
The game data scraper (`scripts/scrape-game-data.js`) automatically extracts current game data from the minified game source file (`main-D6KeWgpc.js`) to ensure your userscript displays accurate information.

## Usage

### Quick Start
```bash
npm run scrape-game-data
```

### What It Does
1. **Reads** the game source file (`main-D6KeWgpc.js`)
2. **Extracts** pet data, abilities, and crop information
3. **Outputs** JSON files to `scraped-data/` directory:
   - `pets.json` - All pet species with stats
   - `abilities.json` - Ability IDs and names  
   - `crops.json` - Crop max scales
   - `REPORT.md` - Human-readable summary

### Example Output
```json
{
  "timestamp": "2025-11-30T09:09:39.147Z",
  "source": "main-D6KeWgpc.js",
  "pets": {
    "Turkey": {
      "name": "Turkey",
      "hungerCost": 500,
      "abilities": {
        "RainDance": 60,
        "EggGrowthBoostII_NEW": 35,
        "DoubleHatch": 5
      },
      "baseTileScale": 1,
      "maxScale": 2.5,
      "sellPrice": 3000000,
      "weight": 10,
      "moveProb": 0.25,
      "hoursToMature": 72,
      "rarity": "Rare"
    }
  }
}
```

## When to Run

### Game Updates
Run the scraper whenever the game updates with:
- New pets or species
- New abilities
- New crops/produce
- Changed stats (hunger costs, maturity times, etc.)

### Recommended Workflow
1. **Save new game source**: When the game updates, save the new minified source file as `main-D6KeWgpc.js` (or update filename in scraper)
2. **Run scraper**: `npm run scrape-game-data`
3. **Review output**: Check `scraped-data/REPORT.md` for changes
4. **Update TypeScript files**: Compare with `src/data/` files and update as needed
5. **Test**: Run `npm run build:dist` and test in-game
6. **Commit**: Save changes to git

## How It Works

### Pet Data Extraction
The scraper uses a bracket-counting algorithm to parse minified JavaScript:

```javascript
// Finds: Turkey:{tileRef:xn.Turkey,name:"Turkey",...}
// Extracts all nested properties including ability weights
```

### Data Parsed
For each pet:
- `name` - Display name
- `hungerCost` - Coins to fully replenish hunger
- `abilities` - Object mapping ability names to spawn weights
- `baseTileScale` - Initial size multiplier
- `maxScale` - Maximum size at maturity
- `sellPrice` - Mature sell value (handles scientific notation like 3e6)
- `weight` - Mature weight in units
- `moveProb` - Movement probability (0-1)
- `hoursToMature` - Time to reach maturity
- `rarity` - Common/Uncommon/Rare/Legendary/Mythic

## Updating the Scraper

### Adding New Pet
Edit the `petNames` array in `extractPetData()`:
```javascript
const petNames = [
  'Worm', 'Snail', 'Bee', 'Chicken', 'Bunny', 'Dragonfly',
  'Pig', 'Cow', 'Turkey', 'Squirrel', 'Turtle', 'Goat',
  'Butterfly', 'Peacock', 'Capybara',
  'NewPet' // Add here
];
```

### Extracting New Data Types
Create a new extraction function following the pattern:
```javascript
function extractNewDataType(source) {
  const data = {};
  
  // Use regex or string parsing to find patterns
  const pattern = /YourPattern:\{([^}]+)\}/g;
  
  let match;
  while ((match = pattern.exec(source)) !== null) {
    // Parse and store data
  }
  
  return data;
}
```

## Troubleshooting

### "Could not find pet X"
- Check if the pet name matches exactly (case-sensitive)
- Verify the game source file has that pet
- The pet format may have changed - update the extraction logic

### "Missing required fields for X"
- The regex patterns may need updating
- Check if game source format changed (view raw file)
- Add debug logging to see what was matched

### Scientific Notation Issues
The scraper handles formats like:
- `500` → 500
- `25e3` → 25000  
- `3e6` → 3000000

If a value looks wrong, check the `sellPrice` or `hungerCost` parsing logic.

## Integration with Userscript

### Manual Updates
After scraping, compare `scraped-data/pets.json` with your TypeScript files:

```typescript
// src/data/petTimeToMature.ts
export const PET_TIME_TO_MATURE: Record<string, number> = {
  Turkey: 72, // ← Update from scraped data
  // ...
};
```

### Automated Updates (Future Enhancement)
Consider creating a script that:
1. Runs scraper
2. Diffs against existing TypeScript files
3. Generates TypeScript code
4. Prompts for review before applying changes

## Output Files

### pets.json
Complete pet database with all stats and abilities.

**Use for:** Updating `src/data/gameData.ts`, `petTimeToMature.ts`, `petAbilities.ts`

### abilities.json
Ability ID mappings (when extractable from source).

**Use for:** Verifying ability names match game code

### crops.json
Crop max scales for size calculations.

**Use for:** Updating `src/utils/plantScales.ts`

### REPORT.md
Human-readable summary with:
- Pet count and details
- Ability list
- Next steps for integration

## Best Practices

1. **Version Control**: Commit scraped data alongside code changes
2. **Backup**: Keep old `main-D6KeWgpc.js` files for reference
3. **Validation**: Always test scraped data in-game before releasing
4. **Documentation**: Update `PATCH_NOTES.md` with changes found
5. **Review**: Don't blindly trust scraped data - verify critical values

## Example Workflow

```bash
# 1. Update game source file (manually save from browser)
# Save to: main-D6KeWgpc.js

# 2. Run scraper
npm run scrape-game-data

# 3. Review changes
cat scraped-data/REPORT.md

# 4. Update TypeScript files
# Compare scraped-data/pets.json with src/data/gameData.ts
# Update any changed values

# 5. Rebuild
npm run build:dist

# 6. Test in Tampermonkey
# Install dist/QPM.user.js

# 7. Commit
git add .
git commit -m "Update game data for Turkey pet addition"
```

## Future Enhancements

### Potential Improvements
- [ ] Extract ability effects (proc rates, durations, etc.)
- [ ] Parse crop growth times and seed costs
- [ ] Extract weather event data
- [ ] Scrape shop item prices
- [ ] Generate TypeScript interfaces automatically
- [ ] Create diff tool to show changes between scrapes
- [ ] Add validation against known game constants
- [ ] Support multiple game source file versions

### Auto-Update System
Ideal future workflow:
1. User provides game URL or auth token
2. Script fetches latest game source automatically
3. Compares with previous scrape
4. Generates git diff
5. Creates PR with changes
6. CI/CD runs tests and deploys if passing

## Questions?

If you encounter issues with the scraper:
1. Check the game source file exists and is readable
2. Verify Node.js version (should be v18+)
3. Look for error messages in console output
4. Review the regex patterns in the script
5. Create an issue in the repo with error details
