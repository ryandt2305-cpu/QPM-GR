import { createCard } from '../panelHelpers';
import { fetchImageUrl } from '../../utils/imageFetcher';

export function createGuideSection(): HTMLElement {
  const { root, body } = createCard('📖 Magic Garden Guide', {
    subtitle: 'Reference guide for game mechanics',
  });
  root.dataset.qpmSection = 'guide';

  const imageContainer = document.createElement('div');
  imageContainer.style.cssText = `
    width: 100%;
    text-align: center;
    padding: 12px;
    background: var(--qpm-surface-1, #1a1a1a);
    border-radius: 8px;
    position: relative;
  `;

  const clickHint = document.createElement('div');
  clickHint.textContent = '(Click to open full size!)';
  clickHint.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    color: rgba(150, 150, 150, 0.7);
    font-size: 12px;
    font-style: italic;
    background: rgba(0, 0, 0, 0.5);
    padding: 4px 8px;
    border-radius: 4px;
    pointer-events: none;
    z-index: 10;
  `;

  const img = document.createElement('img');
  img.alt = 'Magic Garden Guide';
  // Use GM_xmlhttpRequest to bypass CSP img-src restrictions (e.g. Discord)
  const guideUrl = 'https://raw.githubusercontent.com/ryandt2305-cpu/QPM-GR/master/docs/product/MGGuide.jpeg';
  fetchImageUrl(guideUrl).then((src) => { img.src = src; });
  img.style.cssText = `
    width: 100%;
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    transition: transform 0.2s;
    display: block;
  `;

  img.addEventListener('mouseenter', () => {
    img.style.transform = 'scale(1.02)';
  });

  img.addEventListener('mouseleave', () => {
    img.style.transform = 'scale(1)';
  });

  // Click to open full-size in new tab
  img.addEventListener('click', () => {
    window.open(img.src, '_blank');
  });

  img.onerror = () => {
    imageContainer.innerHTML = `
      <div style="padding: 40px; color: var(--qpm-text-muted, #999); font-style: italic;">
        📖 Guide image not found. Please ensure MGGuide.jpeg is uploaded to the master branch of the repository.
      </div>
    `;
  };

  imageContainer.appendChild(clickHint);
  imageContainer.appendChild(img);
  body.appendChild(imageContainer);

  return root;
}
