import { getPetSpriteDataUrlWithMutations, isSpritesReady } from '../../sprite-v2/compat';
import { getAbilityColor, normalizeAbilityName } from '../../utils/petCardRenderer';

export function getPetSprite(
  species: string | null | undefined,
  hasRainbow: boolean,
  hasGold: boolean,
): string {
  if (!isSpritesReady()) return '';
  const name = (species ?? '').trim();
  if (!name) return '';
  const mutations = hasRainbow ? ['Rainbow'] : hasGold ? ['Gold'] : [];
  return getPetSpriteDataUrlWithMutations(name, mutations);
}

export function renderAbilitySquares(
  abilities: string[],
  size: number,
  hasRainbow: boolean,
  hasGold: boolean,
  species?: string,
): string {
  if (!abilities || abilities.length === 0) return '';

  const speciesLower = (species || '').toLowerCase();
  const widerSpecies = ['turtle', 'butterfly', 'peacock'];
  const needsExtraOffset = widerSpecies.some((wide) => speciesLower.includes(wide));
  const leftOffset = needsExtraOffset ? -16 : -10;

  const squares = abilities.slice(0, 3).map((abilityName) => {
    const color = getAbilityColor(abilityName);
    const normalizedName = normalizeAbilityName(abilityName);
    return `
      <div title="${normalizedName}" style="
        width: ${size}px;
        height: ${size}px;
        background: ${color.base};
        border: 1px solid rgba(255,255,255,0.3);
        box-shadow: 0 0 6px ${color.glow};
        border-radius: 2px;
      "></div>
    `;
  }).join('');

  return `
    <div style="
      position: absolute;
      left: ${leftOffset}px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 3px;
      z-index: 2;
    ">${squares}</div>
  `;
}
