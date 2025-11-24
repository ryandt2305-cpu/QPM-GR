// ============================================
// FINAL WebSocket Discovery - Complete Solution
// ============================================

// ============================================
// Working Purchase Command (TESTED FORMAT)
// ============================================
function purchaseCarrotSeed() {
  const payload = {
    type: 'PurchaseSeed',
    species: 'Carrot',  // ← Uses species NAME, not ID!
    scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa']
  };

  console.log('🛒 Purchasing Carrot seed with correct format...');
  console.log('Payload:', payload);
  window.MagicCircle_RoomConnection.sendMessage(payload);
  console.log('✅ Command sent! Check shop/inventory.');
}


// ============================================
// Find ALL Atoms (Complete List)
// ============================================
function listAllAtoms() {
  const cache = window.jotaiAtomCache?.cache || window.jotaiAtomCache;
  const store = window.__qpmJotaiStore__;

  if (!cache || !store) {
    console.error('❌ Cache or store not found');
    return;
  }

  const atoms = [];
  for (const atom of cache.values()) {
    const label = atom?.debugLabel || atom?.label || '<unlabeled>';
    try {
      const value = store.get(atom);
      atoms.push({
        label,
        type: Array.isArray(value) ? 'Array' : typeof value,
        length: Array.isArray(value) ? value.length : null,
        hasData: !!value
      });
    } catch (e) {
      atoms.push({ label, type: 'error', error: e.message });
    }
  }

  console.log('📦 ALL ATOMS:\n');
  atoms.sort((a, b) => a.label.localeCompare(b.label)).forEach(a => {
    if (a.type === 'Array') {
      console.log(`  ${a.label} (Array[${a.length}])`);
    } else {
      console.log(`  ${a.label} (${a.type})`);
    }
  });

  console.log('\n🔍 CROP/INVENTORY RELATED:');
  atoms.filter(a => /crop|inventory|item|storage/i.test(a.label)).forEach(a => {
    console.log(`  ${a.label}`);
  });

  console.log('\n🐾 PET RELATED:');
  atoms.filter(a => /pet|hutch|slot/i.test(a.label)).forEach(a => {
    console.log(`  ${a.label}`);
  });

  return atoms;
}


// ============================================
// Deep Inventory Search
// ============================================
function findCropsAnywhere() {
  const cache = window.jotaiAtomCache?.cache || window.jotaiAtomCache;
  const store = window.__qpmJotaiStore__;

  console.log('🔍 Searching EVERYWHERE for crops...\n');

  for (const atom of cache.values()) {
    const label = atom?.debugLabel || atom?.label || '';

    try {
      const value = store.get(atom);

      // Check if it's an array with items
      if (Array.isArray(value)) {
        const crops = value.filter(item =>
          item && (
            item.itemType === 'Crop' ||
            item.type === 'Crop' ||
            (typeof item.species === 'string' && /carrot|strawberry|tomato/i.test(item.species))
          )
        );

        if (crops.length > 0) {
          console.log('✅ Found crops in:', label);
          console.log('   Count:', crops.length);
          console.log('   First crop:', crops[0]);
          console.log('');
        }
      }

      // Check if it's an object with items property
      if (value && typeof value === 'object' && value.items) {
        const crops = value.items.filter(item =>
          item && (
            item.itemType === 'Crop' ||
            item.type === 'Crop'
          )
        );

        if (crops.length > 0) {
          console.log('✅ Found crops in:', label, '(via .items property)');
          console.log('   Count:', crops.length);
          console.log('   First crop:', crops[0]);
          console.log('');
        }
      }
    } catch (e) {
      // Skip atoms that error
    }
  }
}


// ============================================
// Alternative FeedPet Monitor
// ============================================
function installAlternativeFeedMonitor() {
  // Try to intercept at a lower level
  const ws = window.MagicCircle_RoomConnection.currentWebSocket;

  if (ws) {
    const originalSend = ws.send;
    ws.send = function(data) {
      console.log('%c🌐 RAW WebSocket SEND', 'background: #ff00ff; color: white; font-weight: bold; padding: 4px 12px');
      console.log('Data:', data);
      try {
        const parsed = JSON.parse(data);
        console.log('Parsed:', parsed);
      } catch (e) {
        console.log('(Not JSON)');
      }
      return originalSend.call(this, data);
    };

    console.log('✅ Raw WebSocket monitor installed');
    console.log('👉 This catches ALL WebSocket traffic, even if not through sendMessage');
  } else {
    console.log('❌ No active WebSocket found');
  }
}


// ============================================
// Test Feed with Manual Pet/Crop Selection
// ============================================
function testFeedWithManualIds(petItemId, cropItemId) {
  if (!petItemId || !cropItemId) {
    console.log('Usage: testFeedWithManualIds("pet-id-here", "crop-id-here")');
    console.log('');
    console.log('To find IDs:');
    console.log('  1. Run: findActivePetsDetailed()');
    console.log('  2. Run: findCropsAnywhere()');
    console.log('  3. Copy the IDs from console output');
    return;
  }

  const payload = {
    type: 'FeedPet',
    petItemId: petItemId,
    cropItemId: cropItemId,
    scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa']
  };

  console.log('🍖 Sending FeedPet with manual IDs...');
  console.log('Payload:', payload);
  window.MagicCircle_RoomConnection.sendMessage(payload);
  console.log('✅ Command sent!');
}


// ============================================
// Detailed Active Pet Finder
// ============================================
function findActivePetsDetailed() {
  const cache = window.jotaiAtomCache?.cache || window.jotaiAtomCache;
  const store = window.__qpmJotaiStore__;

  console.log('🐾 Searching for active pets in detail...\n');

  for (const atom of cache.values()) {
    const label = atom?.debugLabel || atom?.label || '';

    if (/pet.*hutch.*items|pet.*slot/i.test(label)) {
      try {
        const value = store.get(atom);

        console.log('📦 Atom:', label);
        console.log('   Value:', value);

        if (Array.isArray(value)) {
          value.forEach((item, idx) => {
            if (item && (item.species || item.petId || item.id)) {
              console.log(`   [${idx}]`, item);
            }
          });
        }
        console.log('');
      } catch (e) {
        console.error('   Error:', e.message);
      }
    }
  }
}


// ============================================
// Test All Game Commands
// ============================================
function testAllCommands() {
  console.log('🧪 Available Test Commands:\n');
  console.log('1. Purchase Seeds:');
  console.log('   purchaseCarrotSeed()');
  console.log('   purchaseSeed("Strawberry")');
  console.log('');
  console.log('2. Feed Pets:');
  console.log('   testFeedWithManualIds("pet-id", "crop-id")');
  console.log('');
  console.log('3. Discovery:');
  console.log('   listAllAtoms()');
  console.log('   findActivePetsDetailed()');
  console.log('   findCropsAnywhere()');
  console.log('   installAlternativeFeedMonitor()');
  console.log('');
}

// Generic purchase function
function purchaseSeed(species) {
  const payload = {
    type: 'PurchaseSeed',
    species: species,
    scopePath: window.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa']
  };
  console.log('🛒 Purchasing', species, 'seed...');
  window.MagicCircle_RoomConnection.sendMessage(payload);
  console.log('✅ Command sent!');
}


// ============================================
// QUICK START
// ============================================
console.log('╔═══════════════════════════════════════════════╗');
console.log('║  🎯 FINAL WebSocket Discovery                 ║');
console.log('╚═══════════════════════════════════════════════╝');
console.log('');
console.log('✅ WORKING PURCHASE FORMAT FOUND!');
console.log('   Uses "species" name, not seedId');
console.log('');
console.log('📋 Quick Commands:');
console.log('  purchaseCarrotSeed()        - Buy a Carrot seed (WORKS!)');
console.log('  findActivePetsDetailed()    - Find your active pets');
console.log('  findCropsAnywhere()         - Find crops in inventory');
console.log('  testAllCommands()           - List all available tests');
console.log('');
console.log('🔬 Advanced:');
console.log('  listAllAtoms()                      - See ALL atoms');
console.log('  installAlternativeFeedMonitor()     - Raw WebSocket monitor');
console.log('  testFeedWithManualIds(petId, cropId) - Manual feed test');
console.log('');
console.log('═══════════════════════════════════════════════');
