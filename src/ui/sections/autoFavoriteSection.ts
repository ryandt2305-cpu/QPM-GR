// src/ui/sections/autoFavoriteSection.ts — Auto-Favorite settings section
import { createCard } from '../panelHelpers';
import { getAutoFavoriteConfig, updateAutoFavoriteConfig, subscribeToAutoFavoriteConfig } from '../../features/autoFavorite';
import { getAbilityColor } from '../../utils/petCardRenderer';
import { renderPetSpeciesIcon } from '../../utils/petCardRenderer';
import { areCatalogsReady, getAllPetSpecies } from '../../catalogs/gameCatalogs';
import { getAllPlantSpecies, getMutationCatalog } from '../../catalogs/gameCatalogs';
import { getCropSpriteWithMutations, getCropSpriteCanvas } from '../../sprite-v2/compat';
import { canvasToDataUrl } from '../../utils/canvasHelpers';

function getMutatedCropSpriteUrl(species: string, mutations: string[]): string {
  const speciesStr = String(species || '').trim().toLowerCase();
  if (!speciesStr) {
    return '';
  }
  const mutated = canvasToDataUrl(getCropSpriteWithMutations(speciesStr, mutations));
  if (mutated) return mutated;
  return canvasToDataUrl(getCropSpriteCanvas(speciesStr));
}

export async function createAutoFavoriteSection(): Promise<HTMLElement> {
  const { root, body } = createCard('⭐ Auto-Favorite', {
    subtitle: 'Automatically favorite crops and pets',
  });
  root.dataset.qpmSection = 'auto-favorite';

  const config = getAutoFavoriteConfig();

  // Main toggle
  const enableToggle = document.createElement('label');
  enableToggle.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: var(--qpm-surface-1, #1a1a1a);
    border-radius: 8px;
    cursor: pointer;
    margin-bottom: 16px;
  `;

  const enableCheckbox = document.createElement('input');
  enableCheckbox.type = 'checkbox';
  enableCheckbox.checked = config.enabled;
  enableCheckbox.style.cssText = `
    width: 20px;
    height: 20px;
    cursor: pointer;
  `;

  const enableLabel = document.createElement('span');
  enableLabel.textContent = 'Enable Auto-Favorite';
  enableLabel.style.cssText = `
    font-weight: 600;
    font-size: 14px;
    color: var(--qpm-text, #fff);
  `;

  enableCheckbox.addEventListener('change', () => {
    updateAutoFavoriteConfig({ enabled: enableCheckbox.checked });
  });

  enableToggle.appendChild(enableCheckbox);
  enableToggle.appendChild(enableLabel);
  body.appendChild(enableToggle);

  // Info box
  const infoBox = document.createElement('div');
  infoBox.style.cssText = `
    padding: 12px;
    background: rgba(76, 175, 80, 0.1);
    border-left: 3px solid var(--qpm-accent, #4CAF50);
    border-radius: 4px;
    margin-bottom: 16px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--qpm-text-muted, #aaa);
  `;
  infoBox.innerHTML = `
    💡 <strong>How it works:</strong><br>
    • Monitors inventory in background (no need to open inventory)<br>
    • Automatically favorites matching items when detected<br>
    • Never unfavorites items (safe for manual favorites)<br>
    • Works via WebSocket (instant, no lag)
  `;
  body.appendChild(infoBox);

  // Pet Abilities section
  const petAbilitiesSection = document.createElement('div');
  petAbilitiesSection.style.cssText = `
    margin-bottom: 16px;
  `;

  const petAbilitiesTitle = document.createElement('h4');
  petAbilitiesTitle.textContent = '🐾 Pet Abilities';
  petAbilitiesTitle.style.cssText = `
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--qpm-accent, #4CAF50);
  `;
  petAbilitiesSection.appendChild(petAbilitiesTitle);

  const petAbilityOptions = [
    { id: 'Gold Granter', label: 'Gold Granter' },
    { id: 'Rainbow Granter', label: 'Rainbow Granter' },
  ];

  petAbilityOptions.forEach(option => {
    const checkbox = document.createElement('label');
    checkbox.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.2s;
    `;
    checkbox.addEventListener('mouseenter', () => {
      checkbox.style.background = 'rgba(255, 255, 255, 0.05)';
    });
    checkbox.addEventListener('mouseleave', () => {
      checkbox.style.background = 'transparent';
    });

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = config.petAbilities?.includes(option.id) ?? false;
    input.style.cssText = `width: 16px; height: 16px; cursor: pointer;`;

    input.addEventListener('change', () => {
      const current = getAutoFavoriteConfig().petAbilities || [];
      const updated = input.checked
        ? [...current, option.id]
        : current.filter(m => m !== option.id);
      updateAutoFavoriteConfig({ petAbilities: updated });

      // Immediately favorite existing items with this ability
      if (input.checked) {
        (window as any).qpm_favoritePetAbility?.(option.id);
      }
    });

    // Create ability block instead of text label
    const abilityColor = getAbilityColor(option.id);
    const abilityBlock = document.createElement('div');
    abilityBlock.style.cssText = `
      width: 14px;
      height: 14px;
      background: ${abilityColor.base};
      border-radius: 2px;
      box-shadow: 0 0 6px ${abilityColor.glow}, 0 1px 3px rgba(0,0,0,0.3);
    `;
    abilityBlock.title = option.label;

    const label = document.createElement('span');
    label.textContent = option.label;
    label.style.cssText = `font-size: 13px; color: var(--qpm-text, #fff);`;

    checkbox.appendChild(input);
    checkbox.appendChild(abilityBlock);
    checkbox.appendChild(label);
    petAbilitiesSection.appendChild(checkbox);
  });

  body.appendChild(petAbilitiesSection);

  // Mutations section
  const mutationsSection = document.createElement('div');
  mutationsSection.style.cssText = `
    margin-bottom: 16px;
  `;

  const mutationsTitle = document.createElement('h4');
  mutationsTitle.textContent = '✨ Crop Mutations';
  mutationsTitle.style.cssText = `
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--qpm-accent, #4CAF50);
  `;
  mutationsSection.appendChild(mutationsTitle);

  // Get mutations from catalog (future-proof — auto-discovers new mutations from game manifest)
  const autoFavMutationCatalog = getMutationCatalog() ?? {};

  for (const [mutationId, mutationData] of Object.entries(autoFavMutationCatalog)) {
    const mutationLabel = (mutationData as any).name || mutationId;

    const checkbox = document.createElement('label');
    checkbox.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.2s;
    `;
    checkbox.addEventListener('mouseenter', () => {
      checkbox.style.background = 'rgba(255, 255, 255, 0.05)';
    });
    checkbox.addEventListener('mouseleave', () => {
      checkbox.style.background = 'transparent';
    });

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = config.mutations.includes(mutationId);
    input.style.cssText = `width: 16px; height: 16px; cursor: pointer;`;

    input.addEventListener('change', () => {
      const current = getAutoFavoriteConfig().mutations;
      const updated = input.checked
        ? [...current, mutationId]
        : current.filter(m => m !== mutationId);
      updateAutoFavoriteConfig({ mutations: updated });

      // Immediately favorite existing items with this mutation
      if (input.checked) {
        (window as any).qpm_favoriteMutation?.(mutationId);
      }
    });

    // Use mutated sunflower sprite instead of color dot
    const mutationSprite = getMutatedCropSpriteUrl('Sunflower', [mutationId]);
    const spriteEl = document.createElement('img');
    spriteEl.dataset.qpmSprite = `crop:Sunflower:${mutationId}`;
    spriteEl.title = mutationLabel;
    spriteEl.style.cssText = `
      width: 24px;
      height: 24px;
      object-fit: contain;
      image-rendering: pixelated;
      flex-shrink: 0;
    `;
    if (mutationSprite) {
      spriteEl.src = mutationSprite;
    }
    // No placeholder - sprite will load when ready via data-qpm-sprite

    const label = document.createElement('span');
    label.textContent = mutationLabel;
    label.style.cssText = `font-size: 13px; color: var(--qpm-text, #fff);`;

    checkbox.appendChild(input);
    checkbox.appendChild(spriteEl);
    checkbox.appendChild(label);
    mutationsSection.appendChild(checkbox);
  }

  body.appendChild(mutationsSection);

  // Advanced Filters section
  const advancedSection = document.createElement('div');
  advancedSection.style.cssText = `
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  `;

  const advancedTitle = document.createElement('h4');
  advancedTitle.textContent = '⚙️ Advanced Filters';
  advancedTitle.style.cssText = `
    margin: 0 0 12px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--qpm-accent, #4CAF50);
  `;
  advancedSection.appendChild(advancedTitle);

  const advancedNote = document.createElement('div');
  advancedNote.style.cssText = `
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 12px;
    padding: 8px;
    background: rgba(255, 152, 0, 0.1);
    border-left: 2px solid #FF9800;
    border-radius: 4px;
  `;
  advancedNote.textContent = '💡 Select multiple options to filter which items get auto-favorited.';
  advancedSection.appendChild(advancedNote);

  // Filter by Abilities (multi-select checkboxes) - DYNAMIC from petAbilities.ts
  const abilityFilterSection = document.createElement('div');
  abilityFilterSection.style.cssText = 'margin-bottom: 16px;';

  const abilityFilterTitle = document.createElement('h5');
  abilityFilterTitle.textContent = 'Filter by Abilities:';
  abilityFilterTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.8);';
  abilityFilterSection.appendChild(abilityFilterTitle);

  const abilityCheckboxContainer = document.createElement('div');
  abilityCheckboxContainer.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;';

  // Dynamically import all abilities from petAbilities.ts
  const { getAllAbilityDefinitions } = await import('../../data/petAbilities');
  const allAbilityDefinitions = getAllAbilityDefinitions();

  // Group abilities by base name (remove tier numbers for cleaner display)
  const abilityGroups = new Map<string, { id: string; name: string }[]>();

  allAbilityDefinitions.forEach(def => {
    // Extract base name (e.g., "Crop Size Boost" from "Crop Size Boost I")
    const baseName = def.name.replace(/\s+(I{1,4}|\d+)$/, '');
    if (!abilityGroups.has(baseName)) {
      abilityGroups.set(baseName, []);
    }
    abilityGroups.get(baseName)!.push({ id: def.id, name: def.name });
  });

  // Create options with single checkbox per base ability (groups all tiers)
  const abilityOptions: Array<{ value: string[]; label: string }> = [];

  Array.from(abilityGroups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([baseName, abilities]) => {
      // Group all tier IDs together for matching
      const abilityIds = abilities.map(a => a.id);
      abilityOptions.push({ value: abilityIds, label: baseName });
    });

  abilityOptions.forEach(option => {
    const checkbox = document.createElement('label');
    checkbox.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; border-radius: 4px; transition: background 0.2s; font-size: 12px;';
    checkbox.addEventListener('mouseenter', () => checkbox.style.background = 'rgba(255, 255, 255, 0.05)');
    checkbox.addEventListener('mouseleave', () => checkbox.style.background = 'transparent');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.abilityValue = option.value.join(',');
    // Check if ANY tier of this ability is selected
    const currentFilters = config.filterByAbilities || [];
    input.checked = option.value.some(id => currentFilters.includes(id));
    input.style.cssText = 'width: 16px; height: 16px; cursor: pointer; flex-shrink: 0;';

    input.addEventListener('change', () => {
      const current = getAutoFavoriteConfig().filterByAbilities || [];
      if (input.checked) {
        // Add all tiers of this ability
        const newIds = option.value.filter(id => !current.includes(id));
        updateAutoFavoriteConfig({ filterByAbilities: [...current, ...newIds] });
      } else {
        // Remove all tiers of this ability
        const updated = current.filter(id => !option.value.includes(id));
        updateAutoFavoriteConfig({ filterByAbilities: updated });
      }
    });

    const label = document.createElement('span');
    label.textContent = option.label;
    label.style.cssText = 'color: var(--qpm-text, #fff); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    label.title = option.label;

    checkbox.appendChild(input);
    checkbox.appendChild(label);
    abilityCheckboxContainer.appendChild(checkbox);
  });

  abilityFilterSection.appendChild(abilityCheckboxContainer);
  advancedSection.appendChild(abilityFilterSection);

  // Filter by Ability Count dropdown
  const abilityCountRow = document.createElement('div');
  abilityCountRow.style.cssText = 'margin-bottom: 12px;';

  const abilityCountLabel = document.createElement('label');
  abilityCountLabel.textContent = 'Filter by Ability Count:';
  abilityCountLabel.style.cssText = 'display: block; font-size: 12px; color: rgba(255, 255, 255, 0.7); margin-bottom: 4px;';
  abilityCountRow.appendChild(abilityCountLabel);

  const abilityCountSelect = document.createElement('select');
  abilityCountSelect.style.cssText = `
    width: 100%;
    padding: 8px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
  `;

  [
    { value: '', label: 'Any Count' },
    { value: '1', label: '1 Ability' },
    { value: '2', label: '2 Abilities' },
    { value: '3', label: '3 Abilities' },
    { value: '4', label: '4 Abilities' },
  ].forEach(option => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    abilityCountSelect.appendChild(opt);
  });

  abilityCountSelect.value = config.filterByAbilityCount != null ? String(config.filterByAbilityCount) : '';
  abilityCountSelect.addEventListener('change', () => {
    const value = abilityCountSelect.value ? parseInt(abilityCountSelect.value) : null;
    updateAutoFavoriteConfig({ filterByAbilityCount: value });
  });

  abilityCountRow.appendChild(abilityCountSelect);
  advancedSection.appendChild(abilityCountRow);

  // Filter by Species (multi-select checkboxes)
  const speciesFilterSection = document.createElement('div');
  speciesFilterSection.style.cssText = 'margin-bottom: 16px;';

  const speciesFilterTitle = document.createElement('h5');
  speciesFilterTitle.textContent = 'Filter by Pet Species:';
  speciesFilterTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.8);';
  speciesFilterSection.appendChild(speciesFilterTitle);

  const speciesCheckboxContainer = document.createElement('div');
  speciesCheckboxContainer.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;';

  // Get pet species dynamically from catalog (FUTUREPROOF!)
  const speciesOptions = areCatalogsReady() ? getAllPetSpecies() : [
    // Fallback list if catalogs not loaded yet
    'Worm', 'Snail', 'Bee', 'Chicken', 'Bunny', 'Dragonfly',
    'Pig', 'Cow', 'Turkey', 'Squirrel', 'Turtle', 'Goat',
    'Butterfly', 'Peacock', 'Capybara',
  ];

  speciesOptions.forEach(species => {
    const checkbox = document.createElement('label');
    checkbox.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; border-radius: 4px; transition: background 0.2s; font-size: 12px;';
    checkbox.addEventListener('mouseenter', () => checkbox.style.background = 'rgba(255, 255, 255, 0.05)');
    checkbox.addEventListener('mouseleave', () => checkbox.style.background = 'transparent');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.speciesValue = species;
    input.checked = (config.filterBySpecies || []).includes(species);
    input.style.cssText = 'width: 16px; height: 16px; cursor: pointer; flex-shrink: 0;';

    input.addEventListener('change', () => {
      const current = getAutoFavoriteConfig().filterBySpecies || [];
      const updated = input.checked ? [...current, species] : current.filter(s => s !== species);
      updateAutoFavoriteConfig({ filterBySpecies: updated });
    });

    // Use pet species icon (no STR label)
    const petIcon = renderPetSpeciesIcon(species);
    const iconContainer = document.createElement('div');
    iconContainer.innerHTML = petIcon;
    iconContainer.style.cssText = 'flex-shrink: 0;';

    checkbox.appendChild(input);
    checkbox.appendChild(iconContainer);
    speciesCheckboxContainer.appendChild(checkbox);
  });

  speciesFilterSection.appendChild(speciesCheckboxContainer);
  advancedSection.appendChild(speciesFilterSection);

  // Filter by Crop Type (multi-select checkboxes) - DYNAMIC from cropBaseStats.ts
  const cropTypeSection = document.createElement('div');
  cropTypeSection.style.cssText = 'margin-bottom: 16px;';

  const cropTypeTitle = document.createElement('h5');
  cropTypeTitle.textContent = 'Filter by Crop Name:';
  cropTypeTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.8);';
  cropTypeSection.appendChild(cropTypeTitle);

  const cropTypeCheckboxContainer = document.createElement('div');
  cropTypeCheckboxContainer.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;';

  // Get plant species dynamically from catalog (FUTUREPROOF!)
  // Fallback to hardcoded list if catalogs not ready
  let cropTypeOptions: string[];
  if (areCatalogsReady()) {
    cropTypeOptions = getAllPlantSpecies();
  } else {
    const { getAllCropNames } = await import('../../data/cropBaseStats');
    cropTypeOptions = getAllCropNames();
  }

  cropTypeOptions.forEach(cropName => {
    const checkbox = document.createElement('label');
    checkbox.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; border-radius: 4px; transition: background 0.2s; font-size: 12px;';
    checkbox.addEventListener('mouseenter', () => checkbox.style.background = 'rgba(255, 255, 255, 0.05)');
    checkbox.addEventListener('mouseleave', () => checkbox.style.background = 'transparent');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.cropValue = cropName;
    input.checked = (config.filterByCropTypes || []).includes(cropName);
    input.style.cssText = 'width: 16px; height: 16px; cursor: pointer; flex-shrink: 0;';

    input.addEventListener('change', () => {
      const current = getAutoFavoriteConfig().filterByCropTypes || [];
      const updated = input.checked ? [...current, cropName] : current.filter(ct => ct !== cropName);
      updateAutoFavoriteConfig({ filterByCropTypes: updated });
    });

    // Use crop sprite with data attribute for lazy loading
    const cropSprite = getMutatedCropSpriteUrl(cropName, []);
    const spriteImg = document.createElement('img');
    spriteImg.dataset.qpmSprite = `crop:${cropName}`;
    spriteImg.alt = cropName;
    spriteImg.style.cssText = 'width: 24px; height: 24px; object-fit: contain; image-rendering: pixelated; flex-shrink: 0;';
    if (cropSprite) {
      spriteImg.src = cropSprite;
    }
    // No placeholder - sprite will load when ready via data-qpm-sprite

    const label = document.createElement('span');
    label.textContent = cropName;
    label.style.cssText = 'color: var(--qpm-text, #fff); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;';
    label.title = cropName;

    checkbox.appendChild(input);
    checkbox.appendChild(spriteImg);
    checkbox.appendChild(label);
    cropTypeCheckboxContainer.appendChild(checkbox);
  });

  cropTypeSection.appendChild(cropTypeCheckboxContainer);
  advancedSection.appendChild(cropTypeSection);

  body.appendChild(advancedSection);

  // Subscribe to config changes to update UI
  subscribeToAutoFavoriteConfig((newConfig) => {
    enableCheckbox.checked = newConfig.enabled;
    abilityCountSelect.value = newConfig.filterByAbilityCount != null ? String(newConfig.filterByAbilityCount) : '';
    // Update checkboxes based on config (use data attributes to avoid index-order assumptions)
    abilityCheckboxContainer.querySelectorAll('input[type="checkbox"]').forEach((rawInput) => {
      const input = rawInput as HTMLInputElement;
      const ids = (input.dataset.abilityValue ?? '').split(',').filter(Boolean);
      input.checked = ids.some(id => (newConfig.filterByAbilities || []).includes(id));
    });
    speciesCheckboxContainer.querySelectorAll('input[type="checkbox"]').forEach((rawInput) => {
      const input = rawInput as HTMLInputElement;
      const val = input.dataset.speciesValue ?? '';
      input.checked = (newConfig.filterBySpecies || []).includes(val);
    });
    cropTypeCheckboxContainer.querySelectorAll('input[type="checkbox"]').forEach((rawInput) => {
      const input = rawInput as HTMLInputElement;
      const val = input.dataset.cropValue ?? '';
      input.checked = (newConfig.filterByCropTypes || []).includes(val);
    });
  });

  return root;
}
