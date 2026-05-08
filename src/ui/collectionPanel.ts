import { getLocation } from '../content/locations';
import type { RunState } from '../game/runState';

export function renderCollectionPanel(state: RunState): string {
  const keepsakes = ['friend-a', 'friend-b', 'friend-c']
    .map((locationId) => getLocation(locationId).keepsake)
    .filter((keepsake) => keepsake !== undefined);

  const items = keepsakes
    .map((keepsake) => {
      const collected = state.collectedKeepsakeIds.includes(keepsake.id);
      return `
        <li class="collection-item ${collected ? 'collection-item--collected' : ''}">
          <span class="collection-item__icon">${collected ? '*' : '?'}</span>
          <span>${collected ? keepsake.label : 'Hidden keepsake'}</span>
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
