import { describe, expect, it } from 'vitest';
import { ASSET_MANIFEST, getAssetsForLocation } from '../../src/assets/assetManifest';
import { LOCATIONS } from '../../src/content/locations';

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

  it('tracks every asset referenced by location content', () => {
    const manifestIds = new Set(ASSET_MANIFEST.map((asset) => asset.id));
    const referencedAssetIds = LOCATIONS.flatMap((location) => [
      ...(location.rewardMessage ?? []).flatMap((message) =>
        message.portraitId ? [message.portraitId] : [],
      ),
      ...location.interactions.flatMap((interaction) =>
        (interaction.dialogue ?? []).flatMap((message) =>
          message.portraitId ? [message.portraitId] : [],
        ),
      ),
      ...(location.keepsake ? [location.keepsake.iconAssetId] : []),
    ]);

    expect(referencedAssetIds).not.toEqual([]);
    expect(referencedAssetIds.filter((assetId) => !manifestIds.has(assetId))).toEqual([]);
  });

  it('tracks reference boards before planned friend portraits', () => {
    const manifestIds = new Set(ASSET_MANIFEST.map((asset) => asset.id));
    const plannedFriendPortraits = ASSET_MANIFEST.filter(
      (asset) =>
        asset.kind === 'portrait' &&
        asset.status === 'planned' &&
        asset.locationIds.some((locationId) => locationId.startsWith('friend-')),
    );
    const missingReferenceBoardIds = plannedFriendPortraits.flatMap((asset) =>
      asset.locationIds
        .filter((locationId) => locationId.startsWith('friend-'))
        .map((locationId) => `${locationId}-reference-board`)
        .filter((referenceBoardId) => !manifestIds.has(referenceBoardId)),
    );

    expect(plannedFriendPortraits).not.toEqual([]);
    expect(missingReferenceBoardIds).toEqual([]);
  });

  it('does not mark temporary art as final', () => {
    const shippedFinalAssets = ASSET_MANIFEST.filter(
      (asset) => asset.status === 'final',
    );

    expect(shippedFinalAssets).toEqual([]);
  });
});
