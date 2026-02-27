import { createCard } from '../panelHelpers';
import { isBulkFavoriteActive } from '../../features/bulkFavorite';

export function createBulkFavoriteSection(): HTMLElement {
  const statusChip = document.createElement('span');
  statusChip.className = 'qpm-chip';
  statusChip.textContent = isBulkFavoriteActive() ? 'Active' : 'Inactive';

  const { root, body } = createCard('❤️ Bulk Favorite', {
    collapsible: true,
    startCollapsed: true,
    subtitleElement: statusChip,
  });
  root.dataset.qpmSection = 'bulk-favorite';

  const status = document.createElement('div');
  status.className = 'qpm-section-muted';
  status.style.marginBottom = '8px';
  status.textContent = 'Quickly favorite or unfavorite all produce of a species at once.';
  body.appendChild(status);

  const infoBox = document.createElement('div');
  infoBox.innerHTML = '💡 <strong>How it works:</strong><br>• Open your inventory<br>• Buttons appear next to the inventory for each produce type<br>• Click a button to favorite/unfavorite ALL items of that species<br>• Heart indicator shows if all items are favorited';
  infoBox.style.cssText = 'background:#333;padding:8px;border-radius:4px;margin-bottom:8px;font-size:10px;line-height:1.5;border-left:3px solid #FFCA28';
  body.appendChild(infoBox);

  const helper = document.createElement('div');
  helper.textContent = 'Tip: Open inventory to see the bulk favorite buttons on the right side of the modal.';
  helper.style.cssText = 'font-size:10px;color:#A5D6A7;line-height:1.4;margin-top:8px;';
  body.appendChild(helper);

  return root;
}
