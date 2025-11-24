// ============================================
// Shop ID Discovery Tool
// ============================================
// Paste this in console to see all current shop item IDs

function discoverAllShopIds() {
  console.log('🔍 DISCOVERING ALL SHOP ITEM IDs\n');
  console.log('This will show you the exact IDs to use for WebSocket purchases\n');

  // Get the shop stock state from QPM
  const stockState = window.__qpmJotaiStore__?.get?.(window.jotaiAtomCache?.cache?.values()
    ?.find?.(atom => atom?.debugLabel === 'shopsAtom'));

  if (!stockState) {
    console.log('❌ Could not find shop data. Make sure QPM is loaded and shops have been opened at least once.');
    return;
  }

  const categories = ['seed', 'egg', 'tool', 'decor'];

  for (const category of categories) {
    const categoryData = stockState[category];
    if (!categoryData?.inventory) {
      console.log(`⏭️ No data for ${category} shop`);
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 ${category.toUpperCase()} SHOP`);
    console.log('='.repeat(60));

    const items = categoryData.inventory;
    items.forEach((item, index) => {
      // Determine the ID field based on category
      let id;
      let idField;
      switch (category) {
        case 'seed':
          id = item.species;
          idField = 'species';
          break;
        case 'egg':
          id = item.eggId;
          idField = 'eggId';
          break;
        case 'tool':
          id = item.toolId;
          idField = 'toolId';
          break;
        case 'decor':
          id = item.decorId;
          idField = 'decorId';
          break;
      }

      const name = item.name || item.displayName || id || '(unknown)';
      const stock = item.stock ?? item.initialStock ?? '?';
      const priceCoins = item.priceCoins ?? item.price ?? '?';
      const priceCredits = item.priceCredits ?? '?';

      console.log(`\n  [${index + 1}] ${name}`);
      console.log(`      ID (${idField}): "${id}"`);
      console.log(`      Stock: ${stock}`);
      console.log(`      Price: ${priceCoins} coins / ${priceCredits} credits`);

      // Show WebSocket command example
      const commandType = {
        seed: 'PurchaseSeed',
        egg: 'PurchaseEgg',
        tool: 'PurchaseTool',
        decor: 'PurchaseDecor',
      }[category];

      const paramName = {
        seed: 'species',
        egg: 'eggId',
        tool: 'toolId',
        decor: 'decorId',
      }[category];

      console.log(`      WebSocket Command:`);
      console.log(`      window.MagicCircle_RoomConnection.sendMessage({`);
      console.log(`        type: '${commandType}',`);
      console.log(`        ${paramName}: '${id}',`);
      console.log(`        scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa']`);
      console.log(`      })`);
    });

    console.log(`\n${'='.repeat(60)}\n`);
  }

  console.log('✅ Discovery complete!\n');
  console.log('Copy the WebSocket commands above to test purchases.');
  console.log('Replace the ID with the one shown for each item.\n');
}

// Also export a quick reference generator
function generateQuickReference() {
  console.log('\n📋 QUICK REFERENCE - Copy/Paste Commands\n');

  const stockState = window.__qpmJotaiStore__?.get?.(window.jotaiAtomCache?.cache?.values()
    ?.find?.(atom => atom?.debugLabel === 'shopsAtom'));

  if (!stockState) {
    console.log('❌ Could not find shop data');
    return;
  }

  const categories = [
    { key: 'egg', type: 'PurchaseEgg', param: 'eggId' },
    { key: 'tool', type: 'PurchaseTool', param: 'toolId' },
    { key: 'decor', type: 'PurchaseDecor', param: 'decorId' },
  ];

  for (const { key, type, param } of categories) {
    const categoryData = stockState[key];
    if (!categoryData?.inventory) continue;

    console.log(`\n// ${key.toUpperCase()} COMMANDS:`);
    categoryData.inventory.forEach(item => {
      const id = item[param];
      const name = item.name || item.displayName || id;
      if (!id) return;

      console.log(`// ${name}`);
      console.log(`window.MagicCircle_RoomConnection.sendMessage({ type: '${type}', ${param}: '${id}', scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa'] })`);
      console.log('');
    });
  }
}

// Run both
console.clear();
discoverAllShopIds();
generateQuickReference();

console.log('\n💡 TIP: If shops show no data, open each shop manually (Alt+S/E/T/D) then run this again.');
