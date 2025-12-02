// src/ui/petComparisonHub.ts
// Comprehensive Pet Comparison Hub with detailed statistics display

import { getActivePetInfos } from '../store/pets';
import { getDetailedPetStats, type DetailedPetStats } from '../utils/petDataTester';
import { log } from '../utils/logger';

/**
 * Pet species emoji mapping for visual appeal
 */
const PET_EMOJI: Record<string, string> = {
  rabbit: '🐰',
  chicken: '🐔',
  cow: '🐄',
  pig: '🐷',
  sheep: '🐑',
  goat: '🐐',
  duck: '🦆',
  turkey: '🦃',
  horse: '🐴',
  donkey: '🫏',
  llama: '🦙',
  alpaca: '🦙',
  cat: '🐱',
  dog: '🐶',
  fox: '🦊',
  raccoon: '🦝',
  squirrel: '🐿️',
  hedgehog: '🦔',
  owl: '🦉',
  parrot: '🦜',
  turtle: '🐢',
  frog: '🐸',
  snail: '🐌',
  bee: '🐝',
  butterfly: '🦋',
  ladybug: '🐞',
  dragon: '🐉',
  unicorn: '🦄',
};

/**
 * Get emoji for pet species
 */
function getPetEmoji(species: string | null): string {
  if (!species) return '🐾';
  const normalized = species.toLowerCase().trim();
  return PET_EMOJI[normalized] || '🐾';
}

/**
 * Format large numbers with K/M/B suffixes
 */
function formatNumber(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  } else if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  } else {
    return value.toFixed(0);
  }
}

/**
 * Format coin values
 */
function formatCoins(value: number | null): string {
  if (value == null) return 'N/A';
  return `${formatNumber(value)} 💰`;
}

/**
 * Format XP values
 */
function formatXP(value: number | null): string {
  if (value == null) return 'N/A';
  return `${formatNumber(value)} XP`;
}

/**
 * Create the Pet Comparison Hub window
 */
export function createPetComparisonHub(): void {
  // Check if already exists
  if (document.getElementById('qpm-pet-comparison-hub')) {
    log('Pet Comparison Hub already open');
    return;
  }

  const activePets = getActivePetInfos();
  if (activePets.length === 0) {
    alert('❌ No active pets found. Place pets in your garden first!');
    return;
  }

  const container = document.createElement('div');
  container.id = 'qpm-pet-comparison-hub';
  container.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 95%;
    max-width: 1400px;
    max-height: 90vh;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border: 3px solid #0f3460;
    border-radius: 20px;
    box-shadow: 0 10px 50px rgba(0, 0, 0, 0.5);
    z-index: 100000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    background: linear-gradient(90deg, #0f3460 0%, #16213e 100%);
    padding: 20px 30px;
    border-bottom: 2px solid #e94560;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;

  const title = document.createElement('h2');
  title.textContent = '🐾 Pet Comparison Hub';
  title.style.cssText = `
    margin: 0;
    color: #e94560;
    font-size: 28px;
    font-weight: 700;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  `;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✖';
  closeBtn.style.cssText = `
    background: #e94560;
    color: white;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    font-size: 20px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: bold;
  `;
  closeBtn.onmouseenter = () => {
    closeBtn.style.background = '#ff6b81';
    closeBtn.style.transform = 'rotate(90deg)';
  };
  closeBtn.onmouseleave = () => {
    closeBtn.style.background = '#e94560';
    closeBtn.style.transform = 'rotate(0deg)';
  };
  closeBtn.onclick = () => container.remove();

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Tab navigation
  const tabNav = document.createElement('div');
  tabNav.style.cssText = `
    display: flex;
    background: #0f3460;
    border-bottom: 2px solid #533483;
  `;

  const tabs = [
    { id: 'overview', label: '📊 Overview', icon: '📊' },
    { id: 'comparison', label: '⚖️ Compare', icon: '⚖️' },
    { id: 'abilities', label: '⚡ Abilities', icon: '⚡' },
  ];

  let activeTab = 'overview';

  const contentArea = document.createElement('div');
  contentArea.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    background: #1a1a2e;
  `;

  const renderContent = () => {
    contentArea.innerHTML = '';
    if (activeTab === 'overview') {
      contentArea.appendChild(createOverviewTab());
    } else if (activeTab === 'comparison') {
      contentArea.appendChild(createComparisonTab());
    } else if (activeTab === 'abilities') {
      contentArea.appendChild(createAbilitiesTab());
    }
  };

  tabs.forEach(tab => {
    const btn = document.createElement('button');
    btn.textContent = tab.label;
    btn.style.cssText = `
      flex: 1;
      padding: 15px 20px;
      background: ${activeTab === tab.id ? '#533483' : 'transparent'};
      color: ${activeTab === tab.id ? '#fff' : '#aaa'};
      border: none;
      border-bottom: 3px solid ${activeTab === tab.id ? '#e94560' : 'transparent'};
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    `;
    btn.onmouseenter = () => {
      if (activeTab !== tab.id) {
        btn.style.background = '#16213e';
        btn.style.color = '#fff';
      }
    };
    btn.onmouseleave = () => {
      if (activeTab !== tab.id) {
        btn.style.background = 'transparent';
        btn.style.color = '#aaa';
      }
    };
    btn.onclick = () => {
      activeTab = tab.id;
      // Update all tab buttons
      tabNav.querySelectorAll('button').forEach((b, i) => {
        if (i === tabs.findIndex(t => t.id === tab.id)) {
          (b as HTMLButtonElement).style.background = '#533483';
          (b as HTMLButtonElement).style.color = '#fff';
          (b as HTMLButtonElement).style.borderBottom = '3px solid #e94560';
        } else {
          (b as HTMLButtonElement).style.background = 'transparent';
          (b as HTMLButtonElement).style.color = '#aaa';
          (b as HTMLButtonElement).style.borderBottom = '3px solid transparent';
        }
      });
      renderContent();
    };
    tabNav.appendChild(btn);
  });

  container.appendChild(header);
  container.appendChild(tabNav);
  container.appendChild(contentArea);

  renderContent();

  document.body.appendChild(container);
}

/**
 * Create Overview Tab
 */
function createOverviewTab(): HTMLElement {
  const content = document.createElement('div');
  
  const activePets = getActivePetInfos();
  const petStats = activePets.map(p => getDetailedPetStats(p));

  // Grid of pet cards
  const grid = document.createElement('div');
  grid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 20px;
  `;

  petStats.forEach(stats => {
    grid.appendChild(createPetCard(stats));
  });

  content.appendChild(grid);
  return content;
}

/**
 * Create a pet card for overview
 */
function createPetCard(stats: DetailedPetStats): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = `
    background: linear-gradient(135deg, #16213e 0%, #0f3460 100%);
    border: 2px solid #533483;
    border-radius: 15px;
    padding: 20px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    transition: transform 0.2s, box-shadow 0.2s;
    cursor: pointer;
  `;
  card.onmouseenter = () => {
    card.style.transform = 'translateY(-5px)';
    card.style.boxShadow = '0 8px 25px rgba(233, 69, 96, 0.3)';
  };
  card.onmouseleave = () => {
    card.style.transform = 'translateY(0)';
    card.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';
  };

  const emoji = getPetEmoji(stats.species);
  
  // Header with emoji and name
  const cardHeader = document.createElement('div');
  cardHeader.style.cssText = `
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 15px;
    padding-bottom: 15px;
    border-bottom: 2px solid #533483;
  `;

  const emojiEl = document.createElement('div');
  emojiEl.textContent = emoji;
  emojiEl.style.cssText = `
    font-size: 48px;
    line-height: 1;
  `;

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'flex: 1;';
  
  const name = document.createElement('div');
  name.textContent = stats.name || 'Unnamed';
  name.style.cssText = `
    font-size: 20px;
    font-weight: 700;
    color: #e94560;
    margin-bottom: 5px;
  `;

  const species = document.createElement('div');
  species.textContent = stats.species || 'Unknown';
  species.style.cssText = `
    font-size: 14px;
    color: #aaa;
  `;

  nameEl.appendChild(name);
  nameEl.appendChild(species);
  cardHeader.appendChild(emojiEl);
  cardHeader.appendChild(nameEl);

  // Stats grid
  const statsGrid = document.createElement('div');
  statsGrid.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 15px;
  `;

  const statItem = (label: string, value: string, color = '#fff') => {
    const item = document.createElement('div');
    item.style.cssText = `
      background: rgba(83, 52, 131, 0.2);
      padding: 10px;
      border-radius: 8px;
      border-left: 3px solid ${color};
    `;
    
    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      font-size: 11px;
      color: #aaa;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    `;
    
    const valueEl = document.createElement('div');
    valueEl.textContent = value;
    valueEl.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      color: ${color};
    `;
    
    item.appendChild(labelEl);
    item.appendChild(valueEl);
    return item;
  };

  statsGrid.appendChild(statItem('💪 Strength', `${stats.currentStrength ?? 'N/A'}`, '#00d4ff'));
  statsGrid.appendChild(statItem('🎯 Max STR', `${stats.maxStrength ?? 'N/A'}`, '#00d4ff'));
  statsGrid.appendChild(statItem('🎓 Level', `${stats.level ?? 'N/A'}`, '#ffb900'));
  statsGrid.appendChild(statItem('✨ XP', formatXP(stats.xp), '#ffb900'));
  statsGrid.appendChild(statItem('🍖 Hunger', `${stats.hungerPct?.toFixed(0) ?? 'N/A'}%`, '#00ff88'));
  statsGrid.appendChild(statItem('⏱️ Feeds/Hr', `${stats.feedsPerHour?.toFixed(2) ?? 'N/A'}`, '#00ff88'));

  // Mutations badges
  if (stats.mutations.length > 0) {
    const mutationsDiv = document.createElement('div');
    mutationsDiv.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    `;
    
    stats.mutations.forEach(mut => {
      const badge = document.createElement('span');
      badge.textContent = mut;
      badge.style.cssText = `
        background: ${mut === 'Gold' ? '#ffd700' : mut === 'Rainbow' ? 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)' : '#533483'};
        color: ${mut === 'Rainbow' ? '#000' : '#fff'};
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        text-shadow: ${mut === 'Rainbow' ? 'none' : '1px 1px 2px rgba(0,0,0,0.5)'};
      `;
      mutationsDiv.appendChild(badge);
    });
    
    statsGrid.appendChild(mutationsDiv);
  }

  // Abilities count
  const abilitiesDiv = document.createElement('div');
  abilitiesDiv.style.cssText = `
    background: rgba(233, 69, 96, 0.1);
    padding: 12px;
    border-radius: 8px;
    border: 1px solid #e94560;
    text-align: center;
  `;
  abilitiesDiv.innerHTML = `
    <div style="font-size: 24px; font-weight: 700; color: #e94560;">${stats.abilityCount}</div>
    <div style="font-size: 12px; color: #aaa; margin-top: 4px;">⚡ ABILITIES</div>
  `;

  card.appendChild(cardHeader);
  card.appendChild(statsGrid);
  card.appendChild(abilitiesDiv);

  return card;
}

/**
 * Create Comparison Tab
 */
function createComparisonTab(): HTMLElement {
  const content = document.createElement('div');
  
  const activePets = getActivePetInfos();
  const petStats = activePets.map(p => getDetailedPetStats(p));

  if (petStats.length < 2) {
    content.innerHTML = `
      <div style="text-align: center; padding: 60px; color: #aaa;">
        <div style="font-size: 64px; margin-bottom: 20px;">🐾</div>
        <div style="font-size: 20px; font-weight: 600; margin-bottom: 10px;">Need More Pets</div>
        <div style="font-size: 14px;">Place at least 2 pets in your garden to compare them.</div>
      </div>
    `;
    return content;
  }

  // Pet selector dropdowns
  const selectorDiv = document.createElement('div');
  selectorDiv.style.cssText = `
    display: flex;
    gap: 20px;
    align-items: center;
    justify-content: center;
    margin-bottom: 30px;
    padding: 20px;
    background: rgba(15, 52, 96, 0.5);
    border-radius: 12px;
  `;

  let selectedPetA = 0;
  let selectedPetB = Math.min(1, petStats.length - 1);

  const createSelector = (label: string, selectedIndex: number, onChange: (index: number) => void) => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'flex: 1; max-width: 300px;';
    
    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      font-size: 14px;
      color: #aaa;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    
    const select = document.createElement('select');
    select.style.cssText = `
      width: 100%;
      padding: 12px;
      background: #16213e;
      color: #fff;
      border: 2px solid #533483;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 0.2s;
    `;
    select.onmouseenter = () => select.style.borderColor = '#e94560';
    select.onmouseleave = () => select.style.borderColor = '#533483';
    
    petStats.forEach((stats, i) => {
      const option = document.createElement('option');
      option.value = i.toString();
      option.textContent = `${getPetEmoji(stats.species)} ${stats.name || 'Unnamed'} (Slot ${stats.slotIndex})`;
      if (i === selectedIndex) option.selected = true;
      select.appendChild(option);
    });
    
    select.onchange = () => onChange(parseInt(select.value));
    
    wrapper.appendChild(labelEl);
    wrapper.appendChild(select);
    return { wrapper, select };
  };

  const comparisonDisplay = document.createElement('div');
  
  const updateComparison = () => {
    const statA = petStats[selectedPetA];
    const statB = petStats[selectedPetB];
    if (!statA || !statB) return;
    
    comparisonDisplay.innerHTML = '';
    comparisonDisplay.appendChild(createComparisonTable(statA, statB));
  };

  const selectorA = createSelector('Pet A', selectedPetA, (i) => {
    selectedPetA = i;
    updateComparison();
  });
  
  const vs = document.createElement('div');
  vs.textContent = 'VS';
  vs.style.cssText = `
    font-size: 24px;
    font-weight: 700;
    color: #e94560;
    padding: 0 20px;
  `;
  
  const selectorB = createSelector('Pet B', selectedPetB, (i) => {
    selectedPetB = i;
    updateComparison();
  });

  selectorDiv.appendChild(selectorA.wrapper);
  selectorDiv.appendChild(vs);
  selectorDiv.appendChild(selectorB.wrapper);

  content.appendChild(selectorDiv);
  content.appendChild(comparisonDisplay);

  updateComparison();

  return content;
}

/**
 * Create comparison table
 */
function createComparisonTable(statsA: DetailedPetStats, statsB: DetailedPetStats): HTMLElement {
  const table = document.createElement('div');
  table.style.cssText = `
    background: #16213e;
    border-radius: 12px;
    overflow: hidden;
    border: 2px solid #533483;
  `;

  const createRow = (label: string, valueA: string, valueB: string, numA: number | null, numB: number | null, higherIsBetter = true) => {
    const row = document.createElement('div');
    row.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      padding: 15px 20px;
      border-bottom: 1px solid #0f3460;
      transition: background 0.2s;
    `;
    row.onmouseenter = () => row.style.background = 'rgba(83, 52, 131, 0.2)';
    row.onmouseleave = () => row.style.background = 'transparent';

    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      color: #aaa;
      font-weight: 600;
      display: flex;
      align-items: center;
    `;

    let winner = '';
    if (numA != null && numB != null) {
      if (numA > numB) {
        winner = higherIsBetter ? 'A' : 'B';
      } else if (numB > numA) {
        winner = higherIsBetter ? 'B' : 'A';
      }
    }

    const valueAEl = document.createElement('div');
    valueAEl.textContent = valueA;
    valueAEl.style.cssText = `
      color: ${winner === 'A' ? '#00ff88' : '#fff'};
      font-weight: ${winner === 'A' ? '700' : '400'};
      font-size: ${winner === 'A' ? '18px' : '16px'};
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    `;
    if (winner === 'A') valueAEl.innerHTML += ' <span style="color: #ffd700;">🏆</span>';

    const valueBEl = document.createElement('div');
    valueBEl.textContent = valueB;
    valueBEl.style.cssText = `
      color: ${winner === 'B' ? '#00ff88' : '#fff'};
      font-weight: ${winner === 'B' ? '700' : '400'};
      font-size: ${winner === 'B' ? '18px' : '16px'};
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    `;
    if (winner === 'B') valueBEl.innerHTML += ' <span style="color: #ffd700;">🏆</span>';

    row.appendChild(labelEl);
    row.appendChild(valueAEl);
    row.appendChild(valueBEl);

    return row;
  };

  // Header
  const headerRow = document.createElement('div');
  headerRow.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    padding: 20px;
    background: #0f3460;
    font-weight: 700;
    font-size: 18px;
    color: #e94560;
  `;
  headerRow.innerHTML = `
    <div>Attribute</div>
    <div style="text-align: center;">${getPetEmoji(statsA.species)} ${statsA.name || 'Pet A'}</div>
    <div style="text-align: center;">${getPetEmoji(statsB.species)} ${statsB.name || 'Pet B'}</div>
  `;

  table.appendChild(headerRow);

  // Basic info
  table.appendChild(createRow('Species', statsA.species || 'N/A', statsB.species || 'N/A', null, null));
  
  // Strength
  table.appendChild(createRow('💪 Current Strength', `${statsA.currentStrength ?? 'N/A'}`, `${statsB.currentStrength ?? 'N/A'}`, statsA.currentStrength, statsB.currentStrength));
  table.appendChild(createRow('🎯 Max Strength', `${statsA.maxStrength ?? 'N/A'}`, `${statsB.maxStrength ?? 'N/A'}`, statsA.maxStrength, statsB.maxStrength));
  table.appendChild(createRow('📈 Progress', `${statsA.strengthProgress ?? 'N/A'}%`, `${statsB.strengthProgress ?? 'N/A'}%`, statsA.strengthProgress, statsB.strengthProgress));
  
  // XP & Level
  table.appendChild(createRow('🎓 Level', `${statsA.level ?? 'N/A'}`, `${statsB.level ?? 'N/A'}`, statsA.level, statsB.level));
  table.appendChild(createRow('✨ XP', formatXP(statsA.xp), formatXP(statsB.xp), statsA.xp, statsB.xp));
  
  // Hunger
  table.appendChild(createRow('🍖 Hunger %', `${statsA.hungerPct?.toFixed(1) ?? 'N/A'}%`, `${statsB.hungerPct?.toFixed(1) ?? 'N/A'}%`, statsA.hungerPct, statsB.hungerPct));
  table.appendChild(createRow('⏱️ Feeds/Hour', `${statsA.feedsPerHour?.toFixed(2) ?? 'N/A'}`, `${statsB.feedsPerHour?.toFixed(2) ?? 'N/A'}`, statsA.feedsPerHour, statsB.feedsPerHour, false));
  table.appendChild(createRow('⏰ Time Until Starving', `${statsA.timeUntilStarving?.toFixed(1) ?? 'N/A'}h`, `${statsB.timeUntilStarving?.toFixed(1) ?? 'N/A'}h`, statsA.timeUntilStarving, statsB.timeUntilStarving));
  
  // Mutations
  table.appendChild(createRow('🌟 Mutations', `${statsA.mutationCount}`, `${statsB.mutationCount}`, statsA.mutationCount, statsB.mutationCount));
  table.appendChild(createRow('⭐ Gold', statsA.hasGold ? 'Yes' : 'No', statsB.hasGold ? 'Yes' : 'No', statsA.hasGold ? 1 : 0, statsB.hasGold ? 1 : 0));
  table.appendChild(createRow('🌈 Rainbow', statsA.hasRainbow ? 'Yes' : 'No', statsB.hasRainbow ? 'Yes' : 'No', statsA.hasRainbow ? 1 : 0, statsB.hasRainbow ? 1 : 0));
  
  // Abilities
  table.appendChild(createRow('⚡ Abilities', `${statsA.abilityCount}`, `${statsB.abilityCount}`, statsA.abilityCount, statsB.abilityCount));

  return table;
}

/**
 * Create Abilities Tab
 */
function createAbilitiesTab(): HTMLElement {
  const content = document.createElement('div');
  
  const activePets = getActivePetInfos();
  const petStats = activePets.map(p => getDetailedPetStats(p));

  petStats.forEach(stats => {
    const petSection = document.createElement('div');
    petSection.style.cssText = `
      margin-bottom: 30px;
      background: #16213e;
      border-radius: 12px;
      padding: 20px;
      border: 2px solid #533483;
    `;

    // Pet header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #533483;
    `;
    header.innerHTML = `
      <div style="font-size: 36px;">${getPetEmoji(stats.species)}</div>
      <div>
        <div style="font-size: 20px; font-weight: 700; color: #e94560;">${stats.name || 'Unnamed'}</div>
        <div style="font-size: 14px; color: #aaa;">${stats.species || 'Unknown'} • Slot ${stats.slotIndex}</div>
      </div>
    `;

    // Abilities grid
    const abilitiesGrid = document.createElement('div');
    abilitiesGrid.style.cssText = `
      display: grid;
      gap: 15px;
    `;

    stats.abilities.forEach(ability => {
      const card = document.createElement('div');
      card.style.cssText = `
        background: rgba(83, 52, 131, 0.2);
        padding: 15px;
        border-radius: 10px;
        border-left: 4px solid #e94560;
        transition: all 0.2s;
      `;
      card.onmouseenter = () => {
        card.style.background = 'rgba(83, 52, 131, 0.4)';
        card.style.transform = 'translateX(5px)';
      };
      card.onmouseleave = () => {
        card.style.background = 'rgba(83, 52, 131, 0.2)';
        card.style.transform = 'translateX(0)';
      };

      // Ability header
      const abilityHeader = document.createElement('div');
      abilityHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      `;
      
      const abilityName = document.createElement('div');
      abilityName.style.cssText = `
        font-size: 18px;
        font-weight: 700;
        color: #00d4ff;
      `;
      abilityName.textContent = ability.name;

      const tierBadge = document.createElement('div');
      if (ability.tier) {
        tierBadge.textContent = `Tier ${ability.tier}`;
        tierBadge.style.cssText = `
          background: linear-gradient(90deg, #e94560, #ff6b81);
          color: white;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
        `;
      }

      abilityHeader.appendChild(abilityName);
      if (ability.tier) abilityHeader.appendChild(tierBadge);

      // Stats grid
      const statsGrid = document.createElement('div');
      statsGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 10px;
        margin-top: 12px;
      `;

      const statBox = (label: string, value: string, highlight = false) => {
        const box = document.createElement('div');
        box.style.cssText = `
          background: ${highlight ? 'rgba(0, 255, 136, 0.1)' : 'rgba(15, 52, 96, 0.5)'};
          padding: 8px 12px;
          border-radius: 6px;
          border-left: 2px solid ${highlight ? '#00ff88' : '#533483'};
        `;
        box.innerHTML = `
          <div style="font-size: 10px; color: #aaa; text-transform: uppercase; margin-bottom: 4px;">${label}</div>
          <div style="font-size: 14px; font-weight: 600; color: ${highlight ? '#00ff88' : '#fff'};">${value}</div>
        `;
        return box;
      };

      if (ability.effectiveProbability != null) {
        statsGrid.appendChild(statBox('Probability', `${ability.effectiveProbability.toFixed(2)}%`));
      }
      if (ability.procsPerHour != null) {
        statsGrid.appendChild(statBox('Procs/Hour', ability.procsPerHour.toFixed(2), true));
      }
      if (ability.procsPerDay != null) {
        statsGrid.appendChild(statBox('Procs/Day', ability.procsPerDay.toFixed(0)));
      }
      if (ability.timeBetweenProcs != null) {
        statsGrid.appendChild(statBox('Time Between', `${ability.timeBetweenProcs.toFixed(1)}m`));
      }
      if (ability.effectiveValue != null) {
        statsGrid.appendChild(statBox('Effect Value', `${ability.effectiveValue.toFixed(2)}${ability.effectSuffix ?? ''}`));
      }
      if (ability.gardenValuePerProc != null) {
        statsGrid.appendChild(statBox('🌿 Garden Value/Proc', formatCoins(ability.gardenValuePerProc), true));
      }
      if (ability.valuePerHour != null) {
        statsGrid.appendChild(statBox('💰 Value/Hour', formatCoins(ability.valuePerHour), true));
      }
      if (ability.valuePerDay != null) {
        statsGrid.appendChild(statBox('💰 Value/Day', formatCoins(ability.valuePerDay), true));
      }

      card.appendChild(abilityHeader);
      card.appendChild(statsGrid);

      // Garden value detail
      if (ability.gardenValueDetail) {
        const detail = document.createElement('div');
        detail.textContent = `💡 ${ability.gardenValueDetail}`;
        detail.style.cssText = `
          margin-top: 10px;
          padding: 8px 12px;
          background: rgba(0, 255, 136, 0.1);
          border-radius: 6px;
          font-size: 12px;
          color: #aaa;
          border-left: 2px solid #00ff88;
        `;
        card.appendChild(detail);
      }

      // Notes
      if (ability.notes) {
        const notes = document.createElement('div');
        notes.textContent = `📝 ${ability.notes}`;
        notes.style.cssText = `
          margin-top: 8px;
          font-size: 12px;
          color: #aaa;
          font-style: italic;
        `;
        card.appendChild(notes);
      }

      abilitiesGrid.appendChild(card);
    });

    petSection.appendChild(header);
    petSection.appendChild(abilitiesGrid);
    content.appendChild(petSection);
  });

  return content;
}
