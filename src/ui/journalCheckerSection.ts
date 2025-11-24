// src/ui/journalCheckerSection.ts
// Visually revamped Journal Checker UI

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

        speciesCard.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">🌿</span>
              <strong style="color: #fff; font-size: 14px;">${species.species}</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #8BC34A; font-size: 13px; font-weight: bold;">${collectedCount}/${totalCount}</span>
              <span style="
                background: ${percentage === 100 ? '#8BC34A' : '#555'};
                color: ${percentage === 100 ? '#000' : '#fff'};
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: bold;
              ">${Math.round(percentage)}%</span>
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
              const variantColors = {
                'Normal': { bg: v.collected ? '#42A5F5' : '#333', text: v.collected ? '#fff' : '#777' },
                'Rainbow': { bg: v.collected ? '#9C27B0' : '#333', text: v.collected ? '#fff' : '#777' },
                'Gold': { bg: v.collected ? '#FFB300' : '#333', text: v.collected ? '#fff' : '#777' },
                'Frozen': { bg: v.collected ? '#00BCD4' : '#333', text: v.collected ? '#fff' : '#777' },
                'Wet': { bg: v.collected ? '#2196F3' : '#333', text: v.collected ? '#fff' : '#777' },
                'Chilled': { bg: v.collected ? '#03A9F4' : '#333', text: v.collected ? '#fff' : '#777' },
                'Dawnlit': { bg: v.collected ? '#FF6F00' : '#333', text: v.collected ? '#fff' : '#777' },
                'Dawnbound': { bg: v.collected ? '#FF9800' : '#333', text: v.collected ? '#fff' : '#777' },
                'Amberlit': { bg: v.collected ? '#FFA726' : '#333', text: v.collected ? '#fff' : '#777' },
                'Amberbound': { bg: v.collected ? '#FFB74D' : '#333', text: v.collected ? '#fff' : '#777' },
                'Max': { bg: v.collected ? '#E91E63' : '#333', text: v.collected ? '#fff' : '#777' }
              };
              const colors = variantColors[v.variant as keyof typeof variantColors] || { bg: v.collected ? '#4CAF50' : '#333', text: v.collected ? '#fff' : '#777' };

              return `
                <span style="
                  padding: 6px 12px;
                  border-radius: 6px;
                  font-size: 12px;
                  background: ${colors.bg};
                  color: ${colors.text};
                  font-weight: ${v.collected ? '600' : '400'};
                  transition: all 0.2s;
                  ${v.collected ? 'box-shadow: 0 2px 4px rgba(0,0,0,0.2);' : ''}
                ">${v.collected ? '✓ ' : ''}${v.variant}</span>
              `;
            }).join('')}
          </div>
        `;

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

        let html = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">🐾</span>
              <strong style="color: #fff; font-size: 14px;">${species.species}</strong>
            </div>
            <span style="
              background: ${percentage === 100 ? '#42A5F5' : '#555'};
              color: ${percentage === 100 ? '#000' : '#fff'};
              padding: 2px 8px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: bold;
            ">${Math.round(percentage)}%</span>
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
                  const variantColors = {
                    'Normal': { bg: v.collected ? '#42A5F5' : '#333', text: v.collected ? '#fff' : '#777' },
                    'Rainbow': { bg: v.collected ? '#9C27B0' : '#333', text: v.collected ? '#fff' : '#777' },
                    'Gold': { bg: v.collected ? '#FFB300' : '#333', text: v.collected ? '#fff' : '#777' },
                    'Max': { bg: v.collected ? '#E91E63' : '#333', text: v.collected ? '#fff' : '#777' }
                  };
                  const colors = variantColors[v.variant as keyof typeof variantColors] || { bg: v.collected ? '#42A5F5' : '#333', text: v.collected ? '#fff' : '#777' };

                  return `
                    <span style="
                      padding: 6px 12px;
                      border-radius: 6px;
                      font-size: 12px;
                      background: ${colors.bg};
                      color: ${colors.text};
                      font-weight: ${v.collected ? '600' : '400'};
                      ${v.collected ? 'box-shadow: 0 2px 4px rgba(0,0,0,0.2);' : ''}
                    ">${v.collected ? '✓ ' : ''}${v.variant}</span>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        speciesCard.innerHTML = html;
        resultsContainer.appendChild(speciesCard);
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
