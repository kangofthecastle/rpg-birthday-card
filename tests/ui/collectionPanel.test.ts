import { describe, expect, it, vi } from 'vitest';
import { renderCollectionPanel } from '../../src/ui/collectionPanel';
import type { RunState } from '../../src/game/runState';

vi.mock('../../src/content/locations', () => ({
  LOCATIONS: [
    // entry-like location without a keepsake is skipped by the panel
    { id: 'entry', keepsake: undefined },
    {
      id: 'friend-a',
      keepsake: {
        id: 'glowing-koi-scale',
        label: 'Glowing <img src=x onerror=alert(1)> Koi Scale',
        description: '',
        iconAssetId: 'keepsake-glowing-koi-scale',
      },
    },
    {
      id: 'friend-b',
      keepsake: {
        id: 'friend-b-keepsake',
        label: 'friend-b label',
        description: '',
        iconAssetId: '',
      },
    },
  ],
}));

describe('renderCollectionPanel', () => {
  it('escapes authored keepsake labels in generated markup', () => {
    const state: RunState = {
      currentLocationId: 'entry',
      completedLocationIds: [],
      collectedKeepsakeIds: ['glowing-koi-scale'],
      completedActivityIds: [],
      wonActivityIds: [],
      seenBeatIds: [],
      endingCompleted: false,
    };

    const markup = renderCollectionPanel(state);

    expect(markup).toContain(
      'Glowing &lt;img src=x onerror=alert(1)&gt; Koi Scale',
    );
    expect(markup).not.toContain('<img src=x');
    expect(markup).toContain('A letter, still to come');
  });

  it('renders a keepsake icon image for collected keepsakes', () => {
    const state: RunState = {
      currentLocationId: 'entry',
      completedLocationIds: [],
      collectedKeepsakeIds: ['glowing-koi-scale'],
      completedActivityIds: [],
      wonActivityIds: [],
      seenBeatIds: [],
      endingCompleted: false,
    };

    const markup = renderCollectionPanel(state);

    // Collected keepsake renders its icon image with the label as alt/tooltip.
    expect(markup).toContain('src="/assets/keepsakes/keepsake-glowing-koi-scale.png"');
    expect(markup).toContain(
      'alt="Glowing &lt;img src=x onerror=alert(1)&gt; Koi Scale"',
    );
    expect(markup).toContain('class="collection-item__icon"');
    // Uncollected keepsake keeps a dimmed placeholder, no image.
    expect(markup).toContain('collection-item__icon--empty');
  });
});
