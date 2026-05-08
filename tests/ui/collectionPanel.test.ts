import { describe, expect, it, vi } from 'vitest';
import { renderCollectionPanel } from '../../src/ui/collectionPanel';
import type { RunState } from '../../src/game/runState';

vi.mock('../../src/content/locations', () => ({
  getLocation: (locationId: string) => ({
    keepsake: {
      id:
        locationId === 'friend-a'
          ? 'pressed-flower'
          : `${locationId}-keepsake`,
      label:
        locationId === 'friend-a'
          ? 'Pressed <img src=x onerror=alert(1)> Flower'
          : `${locationId} label`,
      description: '',
      iconAssetId: '',
    },
  }),
}));

describe('renderCollectionPanel', () => {
  it('escapes authored keepsake labels in generated markup', () => {
    const state: RunState = {
      currentLocationId: 'entry',
      completedLocationIds: [],
      collectedKeepsakeIds: ['pressed-flower'],
      endingCompleted: false,
    };

    const markup = renderCollectionPanel(state);

    expect(markup).toContain('Pressed &lt;img src=x onerror=alert(1)&gt; Flower');
    expect(markup).not.toContain('<img src=x');
    expect(markup).toContain('Hidden keepsake');
  });
});
