import { describe, expect, it } from 'vitest';
import { ASSET_MANIFEST, getAssetsForLocation } from '../../src/assets/assetManifest';

describe('assetManifest', () => {
  it('tracks the vertical-slice character and world asset needs', () => {
    const ids = ASSET_MANIFEST.map((asset) => asset.id);

    expect(ids).toContain('character-main-reference-board');
    expect(ids).toContain('character-main-walk-8dir');
    expect(ids).toContain('tileset-garden-house-foundation');
    expect(ids).toContain('props-garden-house');
  });

  it('can list assets for one location', () => {
    const gardenAssets = getAssetsForLocation('friend-a').map((asset) => asset.id);

    expect(gardenAssets).toContain('tileset-garden-house-foundation');
    expect(gardenAssets).toContain('portrait-friend-a');
  });

  it('does not mark temporary art as final', () => {
    const shippedFinalAssets = ASSET_MANIFEST.filter(
      (asset) => asset.status === 'final',
    );

    expect(shippedFinalAssets).toEqual([]);
  });
});
