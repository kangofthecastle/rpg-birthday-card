import { describe, expect, it, vi } from 'vitest';
import { renderCollectionPanel } from '../../src/ui/collectionPanel';
import type { RunState } from '../../src/game/runState';

vi.mock('../../src/content/locations', () => ({
  getLocation: (locationId: string) => ({
    keepsake: {
      id:
        locationId === 'friend-a'
          ? 'glowing-koi-scale'
          : `${locationId}-keepsake`,
      label:
        locationId === 'friend-a'
          ? 'Glowing <img src=x onerror=alert(1)> Koi Scale'
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
      collectedKeepsakeIds: ['glowing-koi-scale'],
      completedActivityIds: [],
      wonActivityIds: [],
      endingCompleted: false,
    };

    const markup = renderCollectionPanel(state);

    expect(markup).toContain(
      'Glowing &lt;img src=x onerror=alert(1)&gt; Koi Scale',
    );
    expect(markup).not.toContain('<img src=x');
    expect(markup).toContain('Hidden keepsake');
  });
});
