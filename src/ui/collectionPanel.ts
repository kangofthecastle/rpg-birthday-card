import { LOCATIONS } from '../content/locations';
import type { RunState } from '../game/runState';

export function renderCollectionPanel(state: RunState): string {
  const keepsakes = LOCATIONS.map((location) => location.keepsake).filter(
    (keepsake) => keepsake !== undefined,
  );

  const items = keepsakes
    .map((keepsake) => {
      const collected = state.collectedKeepsakeIds.includes(keepsake.id);
      const label = collected ? keepsake.label : 'Hidden keepsake';
      const safeLabel = escapeHtml(label);
      const icon = collected
        ? `<img class="collection-item__icon" src="/assets/keepsakes/${encodeURIComponent(
            keepsake.iconAssetId,
          )}.png" alt="${safeLabel}" title="${safeLabel}" />`
        : '<span class="collection-item__icon collection-item__icon--empty" aria-hidden="true"></span>';
      return `
        <li class="collection-item ${collected ? 'collection-item--collected' : ''}">
          ${icon}
          <span>${safeLabel}</span>
        </li>
      `;
    })
    .join('');

  return `
    <aside class="collection-panel" aria-label="Keepsake collection">
      <h2>Keepsakes</h2>
      <ul>${items}</ul>
    </aside>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
