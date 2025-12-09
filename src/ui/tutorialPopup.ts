// src/ui/tutorialPopup.ts
// Tutorial popup that shows on first load using docs/QPM_user_guide.jpg

import { storage } from '../utils/storage';
import { log } from '../utils/logger';

const TUTORIAL_SHOWN_KEY = 'qpm_tutorial_shown_v3.0.0';
const TUTORIAL_IMAGE_PATH = 'https://raw.githubusercontent.com/ryandt2305-cpu/QPM-GR/master/docs/QPM_user_guide.jpg';

export function shouldShowTutorial(): boolean {
  return !storage.get<boolean>(TUTORIAL_SHOWN_KEY, false);
}

export function markTutorialAsShown(): void {
  storage.set(TUTORIAL_SHOWN_KEY, true);
  log('✅ Tutorial marked as shown');
}

export function showTutorialPopup(): void {
  if (!shouldShowTutorial()) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: qpm-tutorial-fadein 0.3s ease;
    padding: 20px;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: linear-gradient(135deg, #1a1a2e, #0f0f1a);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1);
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: qpm-tutorial-scalein 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 24px 28px;
    background: linear-gradient(135deg, rgba(76, 175, 80, 0.15), rgba(33, 150, 243, 0.15));
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  const headerTitle = document.createElement('div');
  headerTitle.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  const icon = document.createElement('div');
  icon.style.cssText = `
    font-size: 32px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  `;
  icon.textContent = '📖';

  const titleText = document.createElement('div');
  titleText.innerHTML = `
    <div style="font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 2px;">
      Welcome to QPM v3.0.0!
    </div>
    <div style="font-size: 13px; color: rgba(255, 255, 255, 0.7);">
      Quick start guide for new features
    </div>
  `;

  headerTitle.appendChild(icon);
  headerTitle.appendChild(titleText);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #fff;
    border-radius: 8px;
    width: 36px;
    height: 36px;
    font-size: 18px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = 'rgba(255, 59, 48, 0.2)';
    closeBtn.style.borderColor = 'rgba(255, 59, 48, 0.4)';
    closeBtn.style.transform = 'scale(1.05)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    closeBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    closeBtn.style.transform = 'scale(1)';
  });
  closeBtn.addEventListener('click', closeTutorial);

  header.appendChild(headerTitle);
  header.appendChild(closeBtn);

  // Image container
  const imageContainer = document.createElement('div');
  imageContainer.style.cssText = `
    flex: 1;
    overflow: auto;
    padding: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
  `;

  const img = document.createElement('img');
  img.src = TUTORIAL_IMAGE_PATH;
  img.alt = 'QPM User Guide';
  img.style.cssText = `
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  `;
  img.onerror = () => {
    imageContainer.innerHTML = `
      <div style="color: rgba(255, 255, 255, 0.6); text-align: center; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
        <div style="font-size: 16px; margin-bottom: 8px;">Tutorial image not found</div>
        <div style="font-size: 13px; opacity: 0.7;">Expected at: ${TUTORIAL_IMAGE_PATH}</div>
      </div>
    `;
  };

  imageContainer.appendChild(img);

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = `
    padding: 20px 28px;
    background: rgba(0, 0, 0, 0.3);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  `;

  const footerText = document.createElement('div');
  footerText.style.cssText = `
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    flex: 1;
  `;
  footerText.innerHTML = `
    💡 <strong>Tip:</strong> Press <kbd style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 4px; font-family: monospace;">ESC</kbd> to close
  `;

  const dontShowBtn = document.createElement('button');
  dontShowBtn.textContent = "Don't show again";
  dontShowBtn.style.cssText = `
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.9);
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `;
  dontShowBtn.addEventListener('mouseenter', () => {
    dontShowBtn.style.background = 'rgba(255, 255, 255, 0.12)';
    dontShowBtn.style.borderColor = 'rgba(255, 255, 255, 0.25)';
  });
  dontShowBtn.addEventListener('mouseleave', () => {
    dontShowBtn.style.background = 'rgba(255, 255, 255, 0.08)';
    dontShowBtn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
  });
  dontShowBtn.addEventListener('click', () => {
    markTutorialAsShown();
    closeTutorial();
  });

  const gotItBtn = document.createElement('button');
  gotItBtn.textContent = 'Got it!';
  gotItBtn.style.cssText = `
    background: linear-gradient(135deg, #4CAF50, #45a049);
    border: none;
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
  `;
  gotItBtn.addEventListener('mouseenter', () => {
    gotItBtn.style.transform = 'translateY(-2px)';
    gotItBtn.style.boxShadow = '0 6px 16px rgba(76, 175, 80, 0.4)';
  });
  gotItBtn.addEventListener('mouseleave', () => {
    gotItBtn.style.transform = 'translateY(0)';
    gotItBtn.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.3)';
  });
  gotItBtn.addEventListener('click', () => {
    // Don't mark as shown - allow it to show again on refresh
    // Only "Don't show again" button will permanently hide it
    closeTutorial();
  });

  footer.appendChild(footerText);
  footer.appendChild(dontShowBtn);
  footer.appendChild(gotItBtn);

  // Assemble modal
  modal.appendChild(header);
  modal.appendChild(imageContainer);
  modal.appendChild(footer);
  overlay.appendChild(modal);

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes qpm-tutorial-fadein {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes qpm-tutorial-scalein {
      from { transform: scale(0.9); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  // Close on ESC key
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeTutorial();
    }
  };
  document.addEventListener('keydown', handleKeydown);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeTutorial();
    }
  });

  function closeTutorial() {
    overlay.style.animation = 'qpm-tutorial-fadein 0.2s ease reverse';
    modal.style.animation = 'qpm-tutorial-scalein 0.2s ease reverse';
    setTimeout(() => {
      overlay.remove();
      style.remove();
      document.removeEventListener('keydown', handleKeydown);
    }, 200);
  }

  document.body.appendChild(overlay);
  log('📖 Tutorial popup shown');
}

// Reset function for testing
export function resetTutorial(): void {
  if ('remove' in storage && typeof storage.remove === 'function') {
    storage.remove(TUTORIAL_SHOWN_KEY);
  } else {
    storage.set(TUTORIAL_SHOWN_KEY, false);
  }
  log('🔄 Tutorial reset - will show on next load');
}
