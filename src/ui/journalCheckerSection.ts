// src/ui/journalCheckerSection.ts
// Visually revamped Journal Checker UI

import { getCropSpriteDataUrl, getPetSpriteDataUrl } from '../utils/spriteExtractor';
import { storage } from '../utils/storage';
import { getCropSizeIndicatorConfig, setCropSizeIndicatorConfig } from '../features/cropSizeIndicator';
import { getVariantChipColors } from '../data/variantBadges';

// Storage for user notes per species
function getSpeciesNotes(species: string): string {
  const notes = storage.get<Record<string, string>>('journal:notes', {});
  return notes[species] || '';
}

function saveSpeciesNotes(species: string, notes: string): void {
  const allNotes = storage.get<Record<string, string>>('journal:notes', {});
  allNotes[species] = notes;
  storage.set('journal:notes', allNotes);
}

export function createJournalCheckerSection(): HTMLElement {
  const root = document.createElement('div');
  root.dataset.qpmSection = 'journal-checker';
  root.style.cssText = `
    background: rgba(0, 0, 0, 0.85);
    border-radius: 8px;
    padding: 16px;
    color: #fff;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    margin-bottom: 20px;
    border-bottom: 2px solid #333;
    padding-bottom: 12px;
  `;
  header.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div>
        <div style="font-size: 18px; font-weight: bold; color: #fff; margin-bottom: 4px;">
          📔 Journal Checker
        </div>
        <div style="font-size: 12px; color: #aaa;">
          Track your collection progress across all categories
        </div>
      </div>
    </div>
  `;
  root.appendChild(header);

  // Stats summary with gradients and icons
  const statsContainer = document.createElement('div');
  statsContainer.style.cssText = `
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  `;

  const createStatBox = (icon: string, label: string, value: string, color: string, bgGradient: string) => {
    const box = document.createElement('div');
    box.style.cssText = `
      background: linear-gradient(135deg, ${bgGradient});
      border-radius: 12px;
      padding: 18px;
      text-align: center;
      border: 2px solid ${color}22;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
      position: relative;
      overflow: hidden;
    `;

    const content = document.createElement('div');
    content.style.cssText = 'position: relative; z-index: 1;';
    content.innerHTML = `
      <div style="font-size: 32px; margin-bottom: 8px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">${icon}</div>
      <div class="stat-value" style="color: ${color}; font-size: 26px; font-weight: bold; margin-bottom: 6px; font-family: 'Segoe UI', Arial, sans-serif; text-shadow: 0 2px 8px rgba(0,0,0,0.4);">${value}</div>
      <div style="color: #bbb; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${label}</div>
    `;
    box.appendChild(content);

    box.addEventListener('mouseenter', () => {
      box.style.transform = 'translateY(-4px)';
      box.style.borderColor = `${color}55`;
      box.style.boxShadow = `0 8px 16px ${color}22`;
    });
    box.addEventListener('mouseleave', () => {
      box.style.transform = 'translateY(0)';
      box.style.borderColor = `${color}22`;
      box.style.boxShadow = 'none';
    });

    return box;
  };

  const produceStatBox = createStatBox('🌾', 'Produce', '...', '#8BC34A', '#1e2a1e, #1a1a1a');
  const petVariantStatBox = createStatBox('🐾', 'Pet Variants', '...', '#42A5F5', '#1a212a, #1a1a1a');
  const overallStatBox = createStatBox('✨', 'Overall', '...', '#9C27B0', '#241a2a, #1a1a1a');

  statsContainer.appendChild(produceStatBox);
  statsContainer.appendChild(petVariantStatBox);
  statsContainer.appendChild(overallStatBox);

  root.appendChild(statsContainer);

  // Category selector with modern buttons
  const categoryContainer = document.createElement('div');
  categoryContainer.style.cssText = `
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  `;

  const categories = [
    { key: 'produce', label: 'Produce', icon: '🌾', color: '#8BC34A' },
    { key: 'pets', label: 'Pets', icon: '🐾', color: '#42A5F5' },
    { key: 'recommendations', label: 'Smart Tips', icon: '💡', color: '#9C27B0' },
    { key: 'missing', label: 'Missing', icon: '📋', color: '#FF9800' },
  ];

  let selectedCategory = 'produce';
  let showMissingOnly = false;

  const updateDisplay = async () => {
    const summary = await import('../features/journalChecker').then(m => m.getJournalSummary());
    const stats = await import('../features/journalChecker').then(m => m.getJournalStats());

    if (!summary || !stats) {
      resultsContainer.innerHTML = '<div style="color: #999; text-align: center; padding: 40px; font-size: 14px;">⚠️ Unable to load journal data<br><span style="font-size: 12px; color: #666;">Try refreshing or check console for errors</span></div>';
      return;
    }

    // Update stats with animation
    const updateStat = (box: HTMLElement, text: string) => {
      const valueEl = box.querySelector('.stat-value');
      if (valueEl) {
        valueEl.textContent = text;
        valueEl.animate([
          { transform: 'scale(1.2)', opacity: 0.5 },
          { transform: 'scale(1)', opacity: 1 }
        ], { duration: 300, easing: 'ease-out' });
      }
    };

    updateStat(produceStatBox, `${stats.produce.collected}/${stats.produce.total}`);
    updateStat(petVariantStatBox, `${stats.petVariants.collected}/${stats.petVariants.total}`);
    updateStat(overallStatBox, `${Math.round(stats.overall.percentage)}%`);

    // Clear results
    resultsContainer.innerHTML = '';

    if (selectedCategory === 'produce') {
      for (const species of summary.produce) {
        const variants = showMissingOnly
          ? species.variants.filter(v => !v.collected)
          : species.variants;

        if (variants.length === 0) continue;

        const collectedCount = species.variants.filter(v => v.collected).length;
        const totalCount = species.variants.length;
        const percentage = (collectedCount / totalCount) * 100;

        const speciesCard = document.createElement('div');

        // Add rainbow animation if all variants collected
        if (percentage === 100) {
          speciesCard.classList.add('qpm-rainbow-complete');
          speciesCard.style.cssText = `
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 10px;
            border: 1px solid #333;
            transition: all 0.2s;
          `;
        } else {
          speciesCard.style.cssText = `
            background: linear-gradient(135deg, #1f1f1f, #1a1a1a);
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 10px;
            border: 1px solid #333;
            transition: all 0.2s;
          `;
        }

        speciesCard.addEventListener('mouseenter', () => {
          if (percentage !== 100) {
            speciesCard.style.borderColor = '#8BC34A44';
          }
          speciesCard.style.transform = 'translateX(4px)';
        });
        speciesCard.addEventListener('mouseleave', () => {
          if (percentage !== 100) {
            speciesCard.style.borderColor = '#333';
          }
          speciesCard.style.transform = 'translateX(0)';
        });

        // Get sprite
        const speciesKey = species.species.toLowerCase().replace(/\s+/g, '');
        const spriteDataUrl = getCropSpriteDataUrl(speciesKey) || getCropSpriteDataUrl(species.species.toLowerCase());
        const isComplete = percentage === 100;
        
        speciesCard.innerHTML = `
          <div style="display: flex; gap: 12px; margin-bottom: 12px;">
            ${spriteDataUrl ? `
              <div style="
                width: 64px;
                height: 64px;
                background-image: url(${spriteDataUrl});
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                border-radius: 8px;
                border: 2px solid ${isComplete ? '#8BC34A' : '#444'};
                flex-shrink: 0;
                image-rendering: pixelated;
                ${isComplete ? 'box-shadow: 0 0 20px #8BC34A66; filter: saturate(1.5) brightness(1.2);' : ''}
              "></div>
            ` : ''}
            <div style="flex: 1;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <strong style="color: #fff; font-size: 14px;">${species.species}</strong>
                  ${isComplete ? '<span style="font-size: 16px;">✨</span>' : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="color: #8BC34A; font-size: 13px; font-weight: bold;">${collectedCount}/${totalCount}</span>
                  <span style="
                    background: ${isComplete ? '#8BC34A' : '#555'};
                    color: ${isComplete ? '#000' : '#fff'};
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: bold;
                  ">${Math.round(percentage)}%</span>
                </div>
              </div>
            </div>
          </div>
          <div style="
            background: #111;
            border-radius: 8px;
            height: 6px;
            margin-bottom: 12px;
            overflow: hidden;
          ">
            <div style="
              background: linear-gradient(90deg, #8BC34A, #66BB6A);
              height: 100%;
              width: ${percentage}%;
              transition: width 0.5s ease;
              box-shadow: 0 0 10px #8BC34A77;
            "></div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${variants.map(v => {
              const chip = getVariantChipColors(v.variant, v.collected);
              return `
                <span style="
                  padding: 6px 12px;
                  border-radius: 6px;
                  font-size: 12px;
                  background: ${chip.bg};
                  color: ${chip.text};
                  font-weight: ${chip.weight};
                  transition: all 0.2s;
                  ${v.collected ? 'box-shadow: 0 2px 4px rgba(0,0,0,0.2);' : ''}
                ">${v.collected ? '✓ ' : ''}${v.variant}</span>
              `;
            }).join('')}
          </div>
        `;

        // Add notes section
        const notesContainer = document.createElement('div');
        notesContainer.style.cssText = 'margin-top: 12px; padding-top: 12px; border-top: 1px solid #333;';
        
        const notesLabel = document.createElement('div');
        notesLabel.style.cssText = 'font-size: 11px; color: #aaa; margin-bottom: 6px; font-weight: 500;';
        notesLabel.textContent = '📝 Notes';
        notesContainer.appendChild(notesLabel);
        
        const notesTextarea = document.createElement('textarea');
        notesTextarea.value = getSpeciesNotes(species.species);
        notesTextarea.placeholder = 'Add your notes here...';
        notesTextarea.style.cssText = `
          width: 100%;
          min-height: 60px;
          padding: 8px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid #444;
          border-radius: 4px;
          color: #fff;
          font-size: 12px;
          font-family: inherit;
          resize: vertical;
        `;
        notesTextarea.addEventListener('blur', () => {
          saveSpeciesNotes(species.species, notesTextarea.value);
        });
        notesContainer.appendChild(notesTextarea);
        speciesCard.appendChild(notesContainer);

        resultsContainer.appendChild(speciesCard);
      }
    } else if (selectedCategory === 'pets') {
      for (const species of summary.pets) {
        const variants = showMissingOnly
          ? species.variants.filter(v => !v.collected)
          : species.variants;

        if (variants.length === 0) continue;

        const variantCollected = species.variants.filter(v => v.collected).length;
        const variantTotal = species.variants.length;
        const percentage = (variantCollected / variantTotal) * 100;

        const speciesCard = document.createElement('div');

        // Add rainbow animation if all variants collected
        if (percentage === 100) {
          speciesCard.classList.add('qpm-rainbow-complete');
          speciesCard.style.cssText = `
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 10px;
            border: 1px solid #333;
            transition: all 0.2s;
          `;
        } else {
          speciesCard.style.cssText = `
            background: linear-gradient(135deg, #1f1f1f, #1a1a1a);
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 10px;
            border: 1px solid #333;
            transition: all 0.2s;
          `;
        }

        speciesCard.addEventListener('mouseenter', () => {
          if (percentage !== 100) {
            speciesCard.style.borderColor = '#42A5F544';
          }
          speciesCard.style.transform = 'translateX(4px)';
        });
        speciesCard.addEventListener('mouseleave', () => {
          if (percentage !== 100) {
            speciesCard.style.borderColor = '#333';
          }
          speciesCard.style.transform = 'translateX(0)';
        });

        const isComplete = percentage === 100;
        const petSprite = getPetSpriteDataUrl(species.species.toLowerCase());
        const imageHtml = petSprite
          ? `<div style="
                width: 64px;
                height: 64px;
                background-image: url(${petSprite});
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                border-radius: 8px;
                border: 2px solid ${isComplete ? '#42A5F5' : '#444'};
                flex-shrink: 0;
                image-rendering: pixelated;
                ${isComplete ? 'box-shadow: 0 0 20px #42A5F566; filter: saturate(1.3);' : ''}
              "></div>`
          : `<div style="
                width: 64px;
                height: 64px;
                background: linear-gradient(135deg, ${isComplete ? '#42A5F5' : '#333'}, ${isComplete ? '#64B5F6' : '#222'});
                border-radius: 8px;
                border: 2px solid ${isComplete ? '#42A5F5' : '#444'};
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 32px;
                ${isComplete ? 'box-shadow: 0 0 20px #42A5F566;' : ''}
              ">??</div>`;
        
        let html = `
          <div style="display: flex; gap: 12px; margin-bottom: 12px;">
            ${imageHtml}
            <div style="flex: 1;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <strong style="color: #fff; font-size: 14px;">${species.species}</strong>
                  ${isComplete ? '<span style="font-size: 16px;">?o"</span>' : ''}
                </div>
                <span style="
                  background: ${isComplete ? '#42A5F5' : '#555'};
                  color: ${isComplete ? '#000' : '#fff'};
                  padding: 2px 8px;
                  border-radius: 12px;
                  font-size: 11px;
                  font-weight: bold;
                ">${Math.round(percentage)}%</span>
              </div>
            </div>
          </div>
          <div style="
            background: #111;
            border-radius: 8px;
            height: 6px;
            margin-bottom: 12px;
            overflow: hidden;
          ">
            <div style="
              background: linear-gradient(90deg, #42A5F5, #64B5F6);
              height: 100%;
              width: ${percentage}%;
              transition: width 0.5s ease;
              box-shadow: 0 0 10px #42A5F577;
            "></div>
          </div>
        `;
        if (variants.length > 0) {
          html += `
            <div style="margin-bottom: 12px;">
              <div style="color: #42A5F5; font-size: 11px; font-weight: 600; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
                Variants (${variantCollected}/${variantTotal})
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                ${variants.map(v => {
                  const chip = getVariantChipColors(v.variant, v.collected);
                  return `
                    <span style="
                      padding: 6px 12px;
                      border-radius: 6px;
                      font-size: 12px;
                      background: ${chip.bg};
                      color: ${chip.text};
                      font-weight: ${chip.weight};
                      ${v.collected ? 'box-shadow: 0 2px 4px rgba(0,0,0,0.2);' : ''}
                    ">${v.collected ? '✓ ' : ''}${v.variant}</span>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        speciesCard.innerHTML = html;
        
        // Add notes section for pets
        const notesContainer = document.createElement('div');
        notesContainer.style.cssText = 'margin-top: 12px; padding-top: 12px; border-top: 1px solid #333;';
        
        const notesLabel = document.createElement('div');
        notesLabel.style.cssText = 'font-size: 11px; color: #aaa; margin-bottom: 6px; font-weight: 500;';
        notesLabel.textContent = '📝 Notes';
        notesContainer.appendChild(notesLabel);
        
        const notesTextarea = document.createElement('textarea');
        notesTextarea.value = getSpeciesNotes(`pet:${species.species}`);
        notesTextarea.placeholder = 'Add your notes here...';
        notesTextarea.style.cssText = `
          width: 100%;
          min-height: 60px;
          padding: 8px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid #444;
          border-radius: 4px;
          color: #fff;
          font-size: 12px;
          font-family: inherit;
          resize: vertical;
        `;
        notesTextarea.addEventListener('blur', () => {
          saveSpeciesNotes(`pet:${species.species}`, notesTextarea.value);
        });
        notesContainer.appendChild(notesTextarea);
        speciesCard.appendChild(notesContainer);
        
        resultsContainer.appendChild(speciesCard);
      }
    } else if (selectedCategory === 'recommendations') {
      // Load recommendations
      const { generateJournalStrategy, getDifficultyEmoji, getPriorityEmoji, getDifficultyDescription } = await import('../features/journalRecommendations');
      const strategy = await generateJournalStrategy();

      if (!strategy) {
        resultsContainer.innerHTML = '<div style="color: #999; text-align: center; padding: 40px; font-size: 14px;">⚠️ Unable to generate recommendations<br><span style="font-size: 12px; color: #666;">Try refreshing or check console for errors</span></div>';
        return;
      }

      // Recommended Focus Section
      if (strategy.recommendedFocus.length > 0) {
        const focusSection = document.createElement('div');
        focusSection.style.cssText = `
          margin-bottom: 24px;
        `;
        focusSection.innerHTML = `
          <div style="
            font-size: 16px;
            font-weight: bold;
            color: #9C27B0;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #9C27B033;
          ">
            🎯 Recommended Focus (Top ${Math.min(10, strategy.recommendedFocus.length)})
          </div>
        `;

        strategy.recommendedFocus.slice(0, 10).forEach(rec => {
          const recCard = document.createElement('div');
          recCard.style.cssText = `
            background: linear-gradient(135deg, #1f1f1f, #1a1a1a);
            border-left: 4px solid ${rec.priority === 'high' ? '#f44336' : rec.priority === 'medium' ? '#ff9800' : '#666'};
            border-radius: 8px;
            padding: 14px;
            margin-bottom: 10px;
            transition: all 0.2s;
          `;

          recCard.addEventListener('mouseenter', () => {
            recCard.style.transform = 'translateX(4px)';
            recCard.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
          });
          recCard.addEventListener('mouseleave', () => {
            recCard.style.transform = 'translateX(0)';
            recCard.style.boxShadow = 'none';
          });

          const priorityBadge = rec.priority === 'high' ? 'HIGH' : rec.priority === 'medium' ? 'MED' : 'LOW';
          const priorityColor = rec.priority === 'high' ? '#f44336' : rec.priority === 'medium' ? '#ff9800' : '#666';

          // Get sprite for this species
          const spriteUrl = rec.type === 'produce'
            ? getCropSpriteDataUrl(rec.species.toLowerCase())
            : getPetSpriteDataUrl(rec.species.toLowerCase());

          const spriteHtml = spriteUrl
            ? `<img src="${spriteUrl}" alt="${rec.species}" style="width: 32px; height: 32px; image-rendering: pixelated;">`
            : `<span style="font-size: 18px;">${rec.type === 'produce' ? '🌿' : '🐾'}</span>`;

          recCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                ${spriteHtml}
                <strong style="color: #fff; font-size: 14px;">${rec.species}</strong>
              </div>
              <div style="display: flex; gap: 6px;">
                <span style="
                  background: ${priorityColor}33;
                  color: ${priorityColor};
                  padding: 2px 8px;
                  border-radius: 4px;
                  font-size: 10px;
                  font-weight: bold;
                ">${priorityBadge}</span>
                <span style="
                  background: #555;
                  color: #fff;
                  padding: 2px 8px;
                  border-radius: 4px;
                  font-size: 10px;
                  font-weight: bold;
                ">${getDifficultyEmoji(rec.difficulty)} ${getDifficultyDescription(rec.difficulty)}</span>
              </div>
            </div>
            <div style="
              background: #111;
              border-radius: 8px;
              height: 4px;
              margin-bottom: 8px;
              overflow: hidden;
            ">
              <div style="
                background: linear-gradient(90deg, #9C27B0, #BA68C8);
                height: 100%;
                width: ${rec.completionPct}%;
                box-shadow: 0 0 8px #9C27B077;
              "></div>
            </div>
            <div style="color: #aaa; font-size: 11px; margin-bottom: 6px;">
              <strong style="color: #9C27B0;">${rec.completionPct.toFixed(0)}% complete</strong> • ${rec.missingVariants.length} variant${rec.missingVariants.length !== 1 ? 's' : ''} remaining • Est. ${rec.estimatedTime}
            </div>
            <div style="color: #ccc; font-size: 12px; margin-bottom: 8px; line-height: 1.4;">
              ${rec.strategy}
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;">
              ${rec.missingVariants.map(v => `
                <span style="
                  padding: 4px 8px;
                  border-radius: 4px;
                  font-size: 10px;
                  background: #333;
                  color: #999;
                ">${v}</span>
              `).join('')}
            </div>
          `;

          focusSection.appendChild(recCard);
        });

        resultsContainer.appendChild(focusSection);
      }

      // Low-Hanging Fruit Section
      if (strategy.lowHangingFruit.length > 0) {
        const fruitSection = document.createElement('div');
        fruitSection.style.cssText = `
          margin-bottom: 24px;
        `;
        fruitSection.innerHTML = `
          <div style="
            font-size: 16px;
            font-weight: bold;
            color: #4CAF50;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #4CAF5033;
          ">
            🍒 Quick Wins (Easy Completions)
          </div>
        `;

        strategy.lowHangingFruit.slice(0, 5).forEach(rec => {
          const fruitCard = document.createElement('div');
          fruitCard.style.cssText = `
            background: #1a1a1a;
            border: 1px solid #4CAF5033;
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.2s;
          `;

          fruitCard.addEventListener('mouseenter', () => {
            fruitCard.style.background = '#1f1f1f';
            fruitCard.style.borderColor = '#4CAF5055';
          });
          fruitCard.addEventListener('mouseleave', () => {
            fruitCard.style.background = '#1a1a1a';
            fruitCard.style.borderColor = '#4CAF5033';
          });

          // Get sprite for the species
          const spriteUrl = rec.type === 'produce'
            ? getCropSpriteDataUrl(rec.species)
            : getPetSpriteDataUrl(rec.species);

          fruitCard.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
              <img src="${spriteUrl}" style="width: 32px; height: 32px; image-rendering: pixelated;" alt="${rec.species}" />
              <div>
                <div style="font-size: 13px; font-weight: 600; color: #fff;">${rec.species}</div>
                <div style="font-size: 10px; color: #999;">${rec.missingVariants.join(', ')}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; color: #4CAF50; font-weight: bold;">${rec.estimatedTime}</div>
              <div style="font-size: 10px; color: #666;">${getDifficultyEmoji(rec.difficulty)} ${getDifficultyDescription(rec.difficulty)}</div>
            </div>
          `;

          fruitSection.appendChild(fruitCard);
        });

        resultsContainer.appendChild(fruitSection);
      }

      // Fastest Path Section
      if (strategy.fastestPath.steps.length > 0) {
        const pathSection = document.createElement('div');
        pathSection.style.cssText = `
          margin-bottom: 24px;
        `;
        pathSection.innerHTML = `
          <div style="
            font-size: 16px;
            font-weight: bold;
            color: #FF9800;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #FF980033;
          ">
            🚀 Fastest Path to ${strategy.fastestPath.expectedCompletion} More Variants
          </div>
          <div style="
            background: #FF980022;
            border-left: 3px solid #FF9800;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 12px;
          ">
            <div style="font-size: 12px; color: #FF9800; font-weight: 600; margin-bottom: 4px;">
              ⏱️ Estimated Time: ${strategy.fastestPath.estimatedTime}
            </div>
            <div style="font-size: 11px; color: #aaa;">
              Complete these ${strategy.fastestPath.steps.length} species for maximum journal progress
            </div>
          </div>
        `;

        strategy.fastestPath.steps.slice(0, 8).forEach((rec, index) => {
          const stepCard = document.createElement('div');
          stepCard.style.cssText = `
            background: #1a1a1a;
            border-left: 3px solid #FF9800;
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 10px;
          `;

          // Get sprite for the species
          const spriteUrl = rec.type === 'produce'
            ? getCropSpriteDataUrl(rec.species)
            : getPetSpriteDataUrl(rec.species);

          stepCard.innerHTML = `
            <div style="
              background: #FF9800;
              color: #000;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              display: flex;
              const variantColors = {
                'Normal': { bg: v.collected ? '#FFFFFF' : '#333', text: v.collected ? '#111' : '#777' },
                'Rainbow': { bg: v.collected ? 'linear-gradient(120deg, #ff8a80, #ffd180, #80d8ff, #b388ff)' : '#333', text: v.collected ? '#111' : '#777' },
              font-weight: bold;
              flex-shrink: 0;
            ">${index + 1}</div>
            <img src="${spriteUrl}" style="width: 28px; height: 28px; image-rendering: pixelated; flex-shrink: 0;" alt="${rec.species}" />
                  'Dawnlit': { bg: v.collected ? '#a463ff' : '#333', text: v.collected ? '#fff' : '#777' },
                  'Dawncharged': { bg: v.collected ? '#7e00fc' : '#333', text: v.collected ? '#fff' : '#777' },
              <div style="font-size: 12px; font-weight: 600; color: #fff; margin-bottom: 2px;">
                ${rec.species} (${rec.missingVariants.join(', ')})
              </div>
              <div style="font-size: 10px; color: #999;">${rec.estimatedTime} • ${getDifficultyEmoji(rec.difficulty)} ${getDifficultyDescription(rec.difficulty)}</div>
            </div>
          `;

          pathSection.appendChild(stepCard);
        });

        resultsContainer.appendChild(pathSection);
      }

      // Long-Term Goals Section
      if (strategy.longTermGoals.length > 0) {
        const goalsSection = document.createElement('div');
        goalsSection.style.cssText = `
          margin-bottom: 24px;
        `;
        goalsSection.innerHTML = `
          <div style="
            font-size: 16px;
            font-weight: bold;
            color: #f44336;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #f4433633;
          ">
            🎖️ Long-Term Challenges
          </div>
          <div style="
            background: #f4433622;
            border-left: 3px solid #f44336;
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 12px;
            font-size: 11px;
            color: #f44336;
          ">
            ⚠️ These variants are very difficult or require rare conditions
          </div>
        `;

        strategy.longTermGoals.slice(0, 5).forEach(rec => {
          const goalCard = document.createElement('div');
          goalCard.style.cssText = `
            background: #1a1a1a;
            border: 1px solid #f4433633;
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 8px;
          `;

          // Get sprite for the species
          const spriteUrl = rec.type === 'produce'
            ? getCropSpriteDataUrl(rec.species)
            : getPetSpriteDataUrl(rec.species);

          goalCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${spriteUrl}" style="width: 32px; height: 32px; image-rendering: pixelated;" alt="${rec.species}" />
                <strong style="color: #fff; font-size: 13px;">${rec.species}</strong>
              </div>
              <span style="font-size: 20px;">${getDifficultyEmoji(rec.difficulty)}</span>
            </div>
            <div style="font-size: 11px; color: #aaa; margin-bottom: 6px;">
              ${rec.missingVariants.join(', ')}
            </div>
            <div style="font-size: 10px; color: #999; line-height: 1.4;">
              ${rec.strategy}
            </div>
          `;

          goalsSection.appendChild(goalCard);
        });

        resultsContainer.appendChild(goalsSection);
      }
    }
  };

  categories.forEach(cat => {
    const isActive = selectedCategory === cat.key || (cat.key === 'missing' && showMissingOnly);
    const button = document.createElement('button');
    button.textContent = `${cat.icon} ${cat.label}`;
    button.style.cssText = `
      flex: 1;
      padding: 10px 18px;
      border-radius: 8px;
      border: 2px solid ${isActive ? cat.color : '#333'};
      background: ${isActive ? `${cat.color}22` : '#222'};
      color: ${isActive ? cat.color : '#999'};
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s;
      min-width: 110px;
    `;

    button.addEventListener('mouseenter', () => {
      if (!isActive) {
        button.style.background = '#2a2a2a';
        button.style.borderColor = '#444';
        button.style.color = '#ccc';
      }
    });
    button.addEventListener('mouseleave', () => {
      if (!isActive) {
        button.style.background = '#222';
        button.style.borderColor = '#333';
        button.style.color = '#999';
      }
    });

    button.addEventListener('click', () => {
      if (cat.key === 'missing') {
        showMissingOnly = !showMissingOnly;
      } else {
        selectedCategory = cat.key;
        showMissingOnly = false;
      }

      // Update all button styles
      categoryContainer.querySelectorAll('button').forEach((btn, idx) => {
        const category = categories[idx];
        if (!category) return;
        const isActive = selectedCategory === category.key || (category.key === 'missing' && showMissingOnly);
        (btn as HTMLButtonElement).style.background = isActive ? `${category.color}22` : '#222';
        (btn as HTMLButtonElement).style.borderColor = isActive ? category.color : '#333';
        (btn as HTMLButtonElement).style.color = isActive ? category.color : '#999';
      });

      updateDisplay();
    });

    categoryContainer.appendChild(button);
  });

  root.appendChild(categoryContainer);

  // Tooltip Helper toggle (controls crop tooltip indicators)
  const helperToggleCard = document.createElement('div');
  helperToggleCard.style.cssText = `
    margin: -6px 0 16px;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid #2a2a2a;
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  `;

  const helperText = document.createElement('div');
  helperText.innerHTML = `
    <div style="font-size: 13px; font-weight: 600; color: #fff;">Tooltip Helper</div>
    <div style="font-size: 11px; color: #bbb;">Show journal letters inside crop tooltips</div>
  `;
  helperToggleCard.appendChild(helperText);

  const helperToggleButton = document.createElement('button');
  helperToggleButton.type = 'button';
  helperToggleButton.style.cssText = `
    border-radius: 999px;
    border: 2px solid #333;
    padding: 6px 18px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 72px;
  `;

  const applyToggleState = (enabled: boolean) => {
    helperToggleButton.textContent = enabled ? 'ON' : 'OFF';
    helperToggleButton.style.background = enabled
      ? 'linear-gradient(135deg, #5ad1ff, #35a8f7)'
      : 'rgba(0, 0, 0, 0.3)';
    helperToggleButton.style.borderColor = enabled ? '#5ad1ff' : '#333';
    helperToggleButton.style.color = enabled ? '#00223b' : '#777';
    helperToggleButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  };

  let tooltipHelperEnabled = getCropSizeIndicatorConfig().showJournalIndicators !== false;
  applyToggleState(tooltipHelperEnabled);

  helperToggleButton.addEventListener('click', () => {
    tooltipHelperEnabled = !tooltipHelperEnabled;
    applyToggleState(tooltipHelperEnabled);
    setCropSizeIndicatorConfig({ showJournalIndicators: tooltipHelperEnabled });
  });

  helperToggleCard.appendChild(helperToggleButton);
  root.appendChild(helperToggleCard);

  // Results container with custom scrollbar
  const resultsContainer = document.createElement('div');
  resultsContainer.style.cssText = `
    max-height: 550px;
    overflow-y: auto;
    padding-right: 4px;
  `;

  // Add custom scrollbar styling and rainbow animation
  const style = document.createElement('style');
  style.textContent = `
    div[data-qpm-section="journal-checker"] ::-webkit-scrollbar {
      width: 8px;
    }
    div[data-qpm-section="journal-checker"] ::-webkit-scrollbar-track {
      background: #1a1a1a;
      border-radius: 4px;
    }
    div[data-qpm-section="journal-checker"] ::-webkit-scrollbar-thumb {
      background: #444;
      border-radius: 4px;
    }
    div[data-qpm-section="journal-checker"] ::-webkit-scrollbar-thumb:hover {
      background: #555;
    }

    /* Rainbow animation for completed items */
    @keyframes qpm-rainbow-border {
      0% { border-color: #ff0000; box-shadow: 0 0 20px #ff000044, inset 0 0 20px #ff000011; }
      16.67% { border-color: #ff8800; box-shadow: 0 0 20px #ff880044, inset 0 0 20px #ff880011; }
      33.33% { border-color: #ffff00; box-shadow: 0 0 20px #ffff0044, inset 0 0 20px #ffff0011; }
      50% { border-color: #00ff00; box-shadow: 0 0 20px #00ff0044, inset 0 0 20px #00ff0011; }
      66.67% { border-color: #0088ff; box-shadow: 0 0 20px #0088ff44, inset 0 0 20px #0088ff11; }
      83.33% { border-color: #8800ff; box-shadow: 0 0 20px #8800ff44, inset 0 0 20px #8800ff11; }
      100% { border-color: #ff0000; box-shadow: 0 0 20px #ff000044, inset 0 0 20px #ff000011; }
    }

    @keyframes qpm-rainbow-gradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .qpm-rainbow-complete {
      animation: qpm-rainbow-border 3s linear infinite, qpm-rainbow-gradient 8s ease infinite;
      border-width: 2px !important;
      background: linear-gradient(
        135deg,
        #ff0000 0%,
        #ff8800 16.67%,
        #ffff00 33.33%,
        #00ff00 50%,
        #0088ff 66.67%,
        #8800ff 83.33%,
        #ff0000 100%
      );
      background-size: 400% 400%;
    }

    .qpm-rainbow-complete strong {
      color: #000 !important;
      text-shadow: 0 0 2px rgba(255, 255, 255, 0.5);
    }

    .qpm-rainbow-complete span[style*="color"] {
      color: #000 !important;
    }
  `;
  document.head.appendChild(style);

  root.appendChild(resultsContainer);

  // Refresh button with icon
  const refreshButton = document.createElement('button');
  refreshButton.textContent = '🔄 Refresh Journal Data';
  refreshButton.style.cssText = `
    width: 100%;
    padding: 12px;
    margin-top: 16px;
    border-radius: 8px;
    border: 2px solid #333;
    background: linear-gradient(135deg, #2a2a2a, #222);
    color: #fff;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
  `;

  refreshButton.addEventListener('mouseenter', () => {
    refreshButton.style.background = 'linear-gradient(135deg, #333, #2a2a2a)';
    refreshButton.style.borderColor = '#444';
    refreshButton.style.transform = 'translateY(-2px)';
    refreshButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
  });
  refreshButton.addEventListener('mouseleave', () => {
    refreshButton.style.background = 'linear-gradient(135deg, #2a2a2a, #222)';
    refreshButton.style.borderColor = '#333';
    refreshButton.style.transform = 'translateY(0)';
    refreshButton.style.boxShadow = 'none';
  });

  refreshButton.addEventListener('click', () => {
    refreshButton.textContent = '⏳ Loading...';
    refreshButton.style.opacity = '0.6';
    import('../features/journalChecker').then(m => {
      m.refreshJournalCache();
      updateDisplay().then(() => {
        refreshButton.textContent = '🔄 Refresh Journal Data';
        refreshButton.style.opacity = '1';
      });
    });
  });

  root.appendChild(refreshButton);

  // Initial load
  updateDisplay();

  return root;
}
