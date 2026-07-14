import { describe, expect, it } from 'vitest';
import { ASSET_MANIFEST, getAssetsForLocation } from '../../src/assets/assetManifest';
import { LOCATIONS } from '../../src/content/locations';

type ManifestAsset = (typeof ASSET_MANIFEST)[number];

function findDuplicateAssetIds(assets: readonly Pick<ManifestAsset, 'id'>[]): string[] {
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();

  assets.forEach((asset) => {
    if (seenIds.has(asset.id)) {
      duplicateIds.add(asset.id);
      return;
    }

    seenIds.add(asset.id);
  });

  return [...duplicateIds];
}

function getManifestAsset(assetId: string): ManifestAsset {
  const matches = ASSET_MANIFEST.filter((asset) => asset.id === assetId);

  expect(matches).toHaveLength(1);

  return matches[0];
}

describe('assetManifest', () => {
  it('detects duplicate asset IDs before building lookup helpers', () => {
    const duplicateId = ASSET_MANIFEST[0].id;
    const assetsWithDuplicate = [
      ASSET_MANIFEST[0],
      { ...ASSET_MANIFEST[1], id: duplicateId },
    ];

    expect(findDuplicateAssetIds(assetsWithDuplicate)).toEqual([duplicateId]);
  });

  it('uses unique asset IDs across the manifest', () => {
    expect(findDuplicateAssetIds(ASSET_MANIFEST)).toEqual([]);
  });

  it('tracks the vertical-slice character and world asset needs', () => {
    const ids = ASSET_MANIFEST.map((asset) => asset.id);

    expect(ids).toContain('character-main-reference-board');
    expect(ids).toContain('character-main-walk-8dir');
    expect(ids).toContain('tileset-garden-house-foundation');
    expect(ids).toContain('props-garden-house');
  });

  it('names ____ as the main character and tracks her review spritesheet', () => {
    const mainCharacterAssets = ASSET_MANIFEST.filter((asset) =>
      asset.id.startsWith('character-main'),
    );
    const generatedRecipientSheet = ASSET_MANIFEST.find(
      (asset) => asset.id === 'character-recipient-walk-8dir',
    );

    expect(mainCharacterAssets.map((asset) => asset.label).join(' ')).toContain('____');
    expect(generatedRecipientSheet?.status).toBe('review');
    expect(generatedRecipientSheet?.notes).toContain(
      'public/assets/sprites/characters/recipient-idle-walk-8dir-v1-alpha.png',
    );
  });

  it('tracks refreshed companion idle/walk spritesheets', () => {
    expect(getManifestAsset('character-friendtwo-walk-4dir').notes).toContain(
      'public/assets/sprites/characters/friendtwo-idle-walk-south-v2-alpha.png',
    );
    expect(getManifestAsset('character-friendone-walk-4dir').notes).toContain(
      'public/assets/sprites/characters/friendone-idle-walk-4dir-v8-light-brown-alpha.png',
    );
  });

  it('tracks ____ fishing activity art and reward assets', () => {
    const friendonePondArt = getManifestAsset('activity-art-friendone-pc-pond');
    const glowingKoiArt = getManifestAsset('activity-art-glowing-koi');

    expect(getManifestAsset('portrait-friendone').locationIds).toContain('friend-a');
    expect(getManifestAsset('keepsake-glowing-koi-scale').locationIds).toContain('friend-a');
    expect(friendonePondArt).toMatchObject({
      kind: 'activity-art',
      status: 'review',
      locationIds: ['friend-a'],
    });
    expect(friendonePondArt.notes).toContain(
      'public/assets/activities/friendone-fishing/pond-dock-v2.png',
    );
    expect(friendonePondArt.notes).toContain('live Phaser overlays');
    expect(friendonePondArt.qaChecks).toEqual(
      expect.arrayContaining([
        'retro pixel-art readability',
        'player and ____ composition',
        'meter contrast',
      ]),
    );
    expect(glowingKoiArt).toMatchObject({
      kind: 'activity-art',
      status: 'temporary',
      locationIds: ['friend-a'],
    });
    expect(glowingKoiArt.qaChecks).toEqual(
      expect.arrayContaining([
        'special-fish readability',
        'warm glow effect',
        'motion readability',
      ]),
    );
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
