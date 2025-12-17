// src/utils/petCardRenderer.ts - Generate Pet Hub-style pet cards with abilities + name + STR
import { getPetSpriteDataUrl } from '../sprite-v2/compat';
import { getMutationSpriteDataUrl } from './petMutationRenderer';
import { spriteCache } from './spriteCache';
import { getSpeciesXpPerLevel, calculateMaxStrength } from '../store/xpTracker';

interface PetCardConfig {
  species: string;
  name?: string;
  xp?: number;
  targetScale?: number;
  abilities?: string[];
  mutations?: string[];
  size?: 'small' | 'medium' | 'large'; // small: 48px, medium: 64px (default), large: 96px
}

/**
 * Normalize ability name for display
 * Converts camelCase or PascalCase ability IDs to human-readable names
 */
export function normalizeAbilityName(abilityId: string): string {
  if (!abilityId) return '';

  // Add spaces before capital letters and numbers
  const withSpaces = abilityId
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Z])/g, '$1 $2');

  // Special replacements for common patterns
  return withSpaces
    .replace(/\bII\b/g, 'II')
    .replace(/\bIII\b/g, 'III')
    .replace(/\bIV\b/g, 'IV')
    .replace(/\bXp\b/gi, 'XP')
    .replace(/_NEW\b/g, '')
    .trim();
}

/**
 * Get ability color configuration
 */
export function getAbilityColor(abilityName: string): { base: string; glow: string; text: string } {
  const name = (abilityName || '').toLowerCase().replace(/\s+/g, '');
  
  // Rainbow and Gold special abilities
  if (name.includes('rainbowgranter') || name.includes('rainbow')) return { base: 'linear-gradient(135deg, #FF0000 0%, #FF7F00 16.67%, #FFFF00 33.33%, #00FF00 50%, #0000FF 66.67%, #4B0082 83.33%, #9400D3 100%)', glow: 'rgba(124,77,255,0.7)', text: '#FFF' };
  if (name.includes('goldgranter') || name.includes('golden') || name === 'gold') return { base: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FFD700 100%)', glow: 'rgba(255,215,0,0.75)', text: '#000' };
  
  // Coin abilities
  if (name.includes('coinfinder')) return { base: '#FFD700', glow: 'rgba(255,215,0,0.65)', text: '#000' };
  
  // Produce/Crop abilities
  if (name.includes('produceeater') || name.includes('cropeater')) return { base: '#FF5722', glow: 'rgba(255,87,34,0.6)', text: '#FFF' };
  if (name.includes('producerefund') || name.includes('croprefund')) return { base: '#FF5722', glow: 'rgba(255,87,34,0.6)', text: '#FFF' };
  if (name.includes('producescaleboost') || name.includes('cropsize')) return { base: '#4CAF50', glow: 'rgba(76,175,80,0.6)', text: '#FFF' };
  if (name.includes('producemutation') || name.includes('cropmutation')) return { base: '#E91E63', glow: 'rgba(233,30,99,0.6)', text: '#FFF' };
  
  // Seed abilities
  if (name.includes('seedfinder')) return { base: '#FF9800', glow: 'rgba(255,152,0,0.6)', text: '#FFF' };
  
  // Egg abilities
  if (name.includes('egggrowth')) return { base: '#9C27B0', glow: 'rgba(156,39,176,0.6)', text: '#FFF' };
  
  // Pet abilities
  if (name.includes('petrefund')) return { base: '#00BCD4', glow: 'rgba(0,188,212,0.6)', text: '#FFF' };
  if (name.includes('petmutation')) return { base: '#E91E63', glow: 'rgba(233,30,99,0.6)', text: '#FFF' };
  if (name.includes('petageboost') || name.includes('maxstrength') || name.includes('strengthboost')) return { base: '#673AB7', glow: 'rgba(103,58,183,0.6)', text: '#FFF' };
  if (name.includes('pethatchsizeboost') || name.includes('hatchxp')) return { base: '#7C4DFF', glow: 'rgba(124,77,255,0.65)', text: '#FFF' };
  
  // Sell abilities
  if (name.includes('sellboost')) return { base: '#F44336', glow: 'rgba(244,67,54,0.6)', text: '#FFF' };
  
  // Hunger abilities
  if (name.includes('hunger')) return { base: '#EC407A', glow: 'rgba(236,64,122,0.6)', text: '#FFF' };
  
  // XP abilities
  if (name.includes('xpboost')) return { base: '#2196F3', glow: 'rgba(33,150,243,0.6)', text: '#FFF' };
  
  // Plant/Produce Growth abilities
  if (name.includes('plantgrowth') || name.includes('producegrowth')) return { base: '#26A69A', glow: 'rgba(38,166,154,0.6)', text: '#FFF' };
  
  // Weather/Special abilities
  if (name.includes('raindance')) return { base: '#2196F3', glow: 'rgba(33,150,243,0.6)', text: '#FFF' };
  if (name.includes('doublehatch')) return { base: '#5C6BC0', glow: 'rgba(92,107,192,0.6)', text: '#FFF' };
  if (name.includes('doubleharvest')) return { base: '#1976D2', glow: 'rgba(25,118,210,0.6)', text: '#FFF' };
  
  // Default
  return { base: '#90A4AE', glow: 'rgba(144,164,174,0.6)', text: '#FFF' };
}

/**
 * Render ability squares HTML
 */
function renderAbilitySquares(abilities: string[], size: number = 14): string {
  if (!abilities || abilities.length === 0) return '';
  const displayed = abilities.slice(0, 4);
  return displayed.map(ability => {
    const colors = getAbilityColor(ability);
    return `<div class="pet-card-ability-square" title="${ability}" style="background:${colors.base};border:1px solid rgba(255,255,255,0.3);box-shadow:0 0 6px ${colors.glow};width:${size}px;height:${size}px;border-radius:3px;"></div>`;
  }).join('');
}

/**
 * Calculate pet strength from XP
 */
function calculatePetStrength(species: string, xp: number, targetScale: number): number {
  const maxStrength = calculateMaxStrength(targetScale, species);
  const xpPerLevel = getSpeciesXpPerLevel(species);
  
  if (!xpPerLevel || xpPerLevel <= 0 || !maxStrength) return 0;
  
  const level = Math.min(30, Math.floor(xp / xpPerLevel));
  const baseStrength = 50;
  const strengthPerLevel = (maxStrength - baseStrength) / 30;
  return Math.min(maxStrength, Math.round(baseStrength + level * strengthPerLevel));
}

/**
 * Generate Pet Hub-style pet card HTML
 * Returns complete card with abilities + sprite + name + STR
 */
export function renderPetCard(config: PetCardConfig): string {
  const {
    species: rawSpecies,
    name,
    xp = 0,
    targetScale = 1,
    abilities = [],
    mutations = [],
    size = 'medium',
  } = config;

  // Ensure species is a valid string
  const species = String(rawSpecies || '').trim();
  if (!species) {
    return '<div style="font-size: 32px;">🐾</div>';
  }

  // Size mappings
  const sizeMap = {
    small: { sprite: 48, ability: 10, padding: 8 },
    medium: { sprite: 64, ability: 14, padding: 12 },
    large: { sprite: 96, ability: 18, padding: 16 },
  };
  
  const dimensions = sizeMap[size];
  const spriteSize = dimensions.sprite;
  const abilitySize = dimensions.ability;
  
  // Calculate STR
  const strength = xp > 0 ? calculatePetStrength(species, xp, targetScale) : 0;
  
  // Get sprite (check cache first)
  let sprite = spriteCache.get('pet', species, mutations);
  if (!sprite) {
    // Apply mutation hierarchy: Rainbow > Gold
    if (mutations.includes('rainbow') || mutations.includes('Rainbow')) {
      sprite = getMutationSpriteDataUrl(species, 'rainbow');
    } else if (mutations.includes('gold') || mutations.includes('Gold')) {
      sprite = getMutationSpriteDataUrl(species, 'gold');
    }
    
    // Fallback to base sprite
    if (!sprite) {
      sprite = getPetSpriteDataUrl(species);
    }
    
    if (sprite) {
      spriteCache.set('pet', species, sprite, mutations);
    }
  }
  
  // Render ability squares
  const abilitySquares = renderAbilitySquares(abilities, abilitySize);
  
  // Pet display name
  const displayName = name || species;
  
  return `
    <div class="qpm-pet-card" style="position: relative; padding: ${dimensions.padding}px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(30,20,45,0.9); display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: ${spriteSize + dimensions.padding * 2 + 30}px;">
      ${abilitySquares ? `<div class="qpm-pet-card-abilities" style="position: absolute; left: 12px; top: ${dimensions.padding + spriteSize / 2}px; transform: translateY(-50%); display: flex; flex-direction: column; gap: 3px; z-index: 2;">${abilitySquares}</div>` : ''}
      <div class="qpm-pet-card-sprite" style="width: ${spriteSize}px; height: ${spriteSize}px; display: flex; align-items: center; justify-content: center;">
        ${sprite ? `<img src="${sprite}" alt="${displayName}" style="width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated;" />` : `<div style="font-size: ${spriteSize / 2}px; opacity: 0.4;">🐾</div>`}
      </div>
      <div class="qpm-pet-card-name" style="font-size: 13px; font-weight: 700; color: #e2e8f0; text-align: center; line-height: 1.2; max-width: 100%; word-wrap: break-word;">${displayName}</div>
      <div class="qpm-pet-card-str" style="font-size: 12px; font-weight: 700; color: #a78bfa; background: rgba(168,139,250,0.15); padding: 3px 8px; border-radius: 6px;">STR: ${strength}</div>
    </div>
  `;
}

/**
 * Generate pet species icon for filter cards (no STR label)
 * Just shows sprite + name
 */
export function renderPetSpeciesIcon(species: string): string {
  const speciesStr = String(species || '').trim();
  if (!speciesStr) {
    return '<div style="font-size: 16px;">🐾</div>';
  }

  // Get base sprite (no mutations for filter cards)
  const sprite = getPetSpriteDataUrl(speciesStr);

  return `
    <div class="qpm-pet-species-icon" style="display: inline-flex; align-items: center; gap: 6px;">
      ${sprite ? `<img src="${sprite}" alt="${speciesStr}" style="width: 24px; height: 24px; object-fit: contain; image-rendering: pixelated; border-radius: 4px; border: 1px solid rgba(168,139,250,0.2);" />` : `<div style="font-size: 16px;">🐾</div>`}
      <span style="font-size: 12px; font-weight: 600; color: #e2e8f0;">${speciesStr}</span>
    </div>
  `;
}

/**
 * Generate lightweight pet sprite only (for use in lists/trackers)
 * Still includes abilities + name + STR but in compact format
 */
export function renderCompactPetSprite(config: PetCardConfig): string {
  const {
    species: rawSpecies,
    name,
    xp = 0,
    targetScale = 1,
    abilities = [],
    mutations = [],
  } = config;

  // Ensure species is a valid string
  const species = String(rawSpecies || '').trim();
  if (!species) {
    return '<div style="font-size: 16px;">🐾</div>';
  }

  const strength = xp > 0 ? calculatePetStrength(species, xp, targetScale) : 0;
  let sprite = spriteCache.get('pet', species, mutations);
  
  if (!sprite) {
    // Apply mutation hierarchy: Rainbow > Gold
    if (mutations.includes('rainbow') || mutations.includes('Rainbow')) {
      sprite = getMutationSpriteDataUrl(species, 'rainbow');
    } else if (mutations.includes('gold') || mutations.includes('Gold')) {
      sprite = getMutationSpriteDataUrl(species, 'gold');
    }
    
    // Fallback to base sprite
    if (!sprite) {
      sprite = getPetSpriteDataUrl(species);
    }
    
    if (sprite) {
      spriteCache.set('pet', species, sprite, mutations);
    }
  }
  
  const abilitySquares = renderAbilitySquares(abilities, 10);
  const displayName = name || species;
  
  return `
    <div class="qpm-compact-pet" style="display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; background: rgba(30,20,45,0.7); border: 1px solid rgba(168,139,250,0.2);">
      <div style="position: relative;">
        ${abilitySquares ? `<div style="position: absolute; left: -14px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 2px;">${abilitySquares}</div>` : ''}
        ${sprite ? `<img src="${sprite}" alt="${displayName}" style="width: 32px; height: 32px; object-fit: contain; image-rendering: pixelated;" />` : `<div style="font-size: 16px;">🐾</div>`}
      </div>
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <span style="font-size: 12px; font-weight: 700; color: #e2e8f0;">${displayName}</span>
        <span style="font-size: 10px; font-weight: 700; color: #a78bfa;">STR: ${strength}</span>
      </div>
    </div>
  `;
}
