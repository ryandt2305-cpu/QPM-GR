// ============================================
// Seed Shop ID Discovery Tool
// ============================================
// Paste this in console to see all seed species IDs
// Especially useful for verifying Celestial seed names

(function discoverSeedIds() {
  console.clear();
  console.log('🌱 SEED SHOP ID DISCOVERY\n');
  console.log('Finding all seed species IDs from shop data...\n');

  // Get the shop stock state from Jotai atoms
  const shopsAtom = Array.from(window.jotaiAtomCache?.cache?.values() || [])
    .find(atom => atom?.debugLabel === 'shopsAtom');

  if (!shopsAtom) {
    console.log('❌ Could not find shopsAtom. Make sure QPM is loaded.');
    return;
  }

  const stockState = window.__qpmJotaiStore__?.get?.(shopsAtom);
  if (!stockState) {
    console.log('❌ Could not read shop data.');
    return;
  }

  const seedData = stockState.seed;
  if (!seedData?.inventory) {
    console.log('⚠️ No seed shop data. Open the seed shop (Alt+S) first!');
    return;
  }

  console.log('═'.repeat(80));
  console.log('  🌱 ALL SEED SPECIES IDs');
  console.log('═'.repeat(80));

  const seeds = seedData.inventory;
  seeds.forEach((seed, index) => {
    const species = seed.species;
    const name = seed.name || seed.displayName || species || '(unknown)';
    const stock = seed.stock ?? seed.initialStock ?? '?';
    const priceCoins = seed.priceCoins ?? seed.price ?? '?';
    const rarity = extractRarity(name) || 'Common';

    console.log(`\n  [${index + 1}] ${name}`);
    console.log(`      Species ID: "${species}"`);
    console.log(`      Rarity: ${rarity}`);
    console.log(`      Stock: ${stock}`);
    console.log(`      Price: ${priceCoins} coins`);
    console.log(`      WebSocket Command:`);
    console.log(`      window.MagicCircle_RoomConnection.sendMessage({`);
    console.log(`        type: 'PurchaseSeed',`);
    console.log(`        species: '${species}',`);
    console.log(`        scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa']`);
    console.log(`      })`);
  });

  console.log('\n' + '═'.repeat(80));
  console.log('\n📋 CELESTIAL SEEDS (if present):\n');

  const celestialSeeds = seeds.filter(seed => {
    const name = (seed.name || seed.displayName || seed.species || '').toLowerCase();
    return name.includes('celestial') ||
           name.includes('moonbinder') ||
           name.includes('dawnbinder') ||
           name.includes('starweaver');
  });

  if (celestialSeeds.length === 0) {
    console.log('  ⚠️ No Celestial seeds found in current shop stock');
    console.log('  (They may not be in stock or not unlocked yet)');
  } else {
    celestialSeeds.forEach(seed => {
      const species = seed.species;
      const name = seed.name || seed.displayName || species;
      console.log(`  ✨ ${name}`);
      console.log(`     Species ID: "${species}"`);
      console.log(`     Command: window.MagicCircle_RoomConnection.sendMessage({ type: 'PurchaseSeed', species: '${species}', scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa'] })`);
      console.log('');
    });
  }

  console.log('═'.repeat(80));
  console.log('\n✅ Discovery complete!');
  console.log('Copy the WebSocket commands above to test seed purchases.\n');

  // Helper function to extract rarity
  function extractRarity(text) {
    const rarities = ['Mythical', 'Divine', 'Celestial', 'Legendary', 'Rare', 'Uncommon', 'Common'];
    for (const rarity of rarities) {
      if (text && text.includes(rarity)) {
        return rarity;
      }
    }
    return null;
  }

  // Also generate quick reference
  console.log('\n📋 QUICK COPY-PASTE COMMANDS:\n');
  seeds.forEach(seed => {
    const species = seed.species;
    const name = seed.name || seed.displayName || species;
    if (!species) return;

    console.log(`// ${name}`);
    console.log(`window.MagicCircle_RoomConnection.sendMessage({ type: 'PurchaseSeed', species: '${species}', scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa'] })`);
    console.log('');
  });

  console.log('═'.repeat(80));
  console.log('\n💡 TIP: If Celestial seeds are missing, they might not be in the current shop rotation.');
  console.log('         Open the seed shop (Alt+S) when they appear to discover their IDs.\n');
})();
