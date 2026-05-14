export type AssetKind =
  | 'reference-board'
  | 'spritesheet'
  | 'portrait'
  | 'tileset'
  | 'prop-sheet'
  | 'keepsake'
  | 'message-art'
  | 'activity-art';

export type AssetStatus = 'planned' | 'temporary' | 'review' | 'final';

export interface GameAsset {
  readonly id: string;
  readonly kind: AssetKind;
  readonly label: string;
  readonly status: AssetStatus;
  readonly locationIds: readonly string[];
  readonly notes: string;
  readonly qaChecks: readonly string[];
}

export const ASSET_MANIFEST: readonly GameAsset[] = [
  {
    id: 'character-main-reference-board',
    kind: 'reference-board',
    label: '____ main character reference board',
    status: 'review',
    locationIds: ['global'],
    notes:
      'Built from ____ reference images with warm skin tone, long dark wavy hair, cozy beige sweater, small muted olive backpack, and cheerful personality cues.',
    qaChecks: ['recognizable stylization', 'palette lock', 'silhouette notes'],
  },
  {
    id: 'character-main-walk-8dir',
    kind: 'spritesheet',
    label: '____ main character 8-direction walk',
    status: 'planned',
    locationIds: ['global'],
    notes:
      '96x128 frames, bottom-center anchored, eight directions, six frames per direction.',
    qaChecks: ['frame size', 'anchor consistency', 'identity consistency', 'game zoom readability'],
  },
  {
    id: 'character-main-idle',
    kind: 'spritesheet',
    label: '____ main character subtle idle',
    status: 'planned',
    locationIds: ['global'],
    notes: 'Subtle breathing, blink, or weight-shift loop at 96x128.',
    qaChecks: ['frame size', 'transparent background', 'subtle motion'],
  },
  {
    id: 'friend-a-reference-board',
    kind: 'reference-board',
    label: 'Friend A reference board',
    status: 'planned',
    locationIds: ['friend-a'],
    notes: 'Built from user-provided reference images and friend-specific personality notes.',
    qaChecks: ['recognizable stylization', 'palette lock'],
  },
  {
    id: 'character-recipient-walk-8dir',
    kind: 'spritesheet',
    label: '____ 8-direction idle/walk spritesheet',
    status: 'review',
    locationIds: ['global'],
    notes:
      'Saved at public/assets/sprites/characters/recipient-idle-walk-8dir-v1-alpha.png. This is the active review/prototype idle-walk scope with 16 rows, six frames per row, idle rows first, walk rows second, separate diagonal rows, and a small muted olive backpack instead of a tote.',
    qaChecks: ['16x6 idle-walk layout', 'transparent background', 'identity consistency', 'anchor consistency'],
  },
  {
    id: 'character-friendone-walk-4dir',
    kind: 'spritesheet',
    label: '____ 4-direction idle/walk spritesheet',
    status: 'review',
    locationIds: ['global'],
    notes:
      'Saved at public/assets/sprites/characters/friendone-idle-walk-4dir-v1-alpha.png. Built from existing ____ walk art with idle rows, mirrored side timing, repaired back-facing hair crop, and the clipped side-edge source frame omitted.',
    qaChecks: ['8x6 idle-walk layout', 'transparent background', 'identity consistency', 'anchor consistency'],
  },
  {
    id: 'character-friendthree-walk-4dir',
    kind: 'spritesheet',
    label: '____ 4-direction idle/walk spritesheet',
    status: 'review',
    locationIds: ['global'],
    notes:
      'Saved at public/assets/sprites/characters/friendthree-idle-walk-4dir-v1-alpha.png. Built from existing ____ walk art with idle rows, mirrored side timing, and boundary-aware recovery for the back-facing head crop.',
    qaChecks: ['8x6 idle-walk layout', 'transparent background', 'identity consistency', 'anchor consistency'],
  },
  {
    id: 'character-friendtwo-walk-4dir',
    kind: 'spritesheet',
    label: '____ 4-direction idle/walk spritesheet',
    status: 'review',
    locationIds: ['global'],
    notes:
      'Saved at public/assets/sprites/characters/friendtwo-idle-walk-4dir-v1-alpha.png. Built from existing ____ walk art with idle rows, mirrored side timing, transparent background cleanup, and normalized bottom-center anchoring.',
    qaChecks: ['8x6 idle-walk layout', 'transparent background', 'identity consistency', 'anchor consistency'],
  },
  {
    id: 'friend-b-reference-board',
    kind: 'reference-board',
    label: 'Friend B reference board',
    status: 'planned',
    locationIds: ['friend-b'],
    notes: 'Built from user-provided reference images and Friend B-specific personality notes.',
    qaChecks: ['recognizable stylization', 'palette lock'],
  },
  {
    id: 'friend-c-reference-board',
    kind: 'reference-board',
    label: 'Friend C reference board',
    status: 'planned',
    locationIds: ['friend-c'],
    notes: 'Built from user-provided reference images and Friend C-specific personality notes.',
    qaChecks: ['recognizable stylization', 'palette lock'],
  },
  {
    id: 'portrait-friend-a',
    kind: 'portrait',
    label: 'Friend A portrait',
    status: 'planned',
    locationIds: ['friend-a'],
    notes: 'Higher-detail illustrated pixel-art portrait tied to Friend A reference board.',
    qaChecks: ['identity consistency', 'dialogue scale readability'],
  },
  {
    id: 'portrait-friendone',
    kind: 'portrait',
    label: '____ dialogue portrait',
    status: 'planned',
    locationIds: ['friend-a'],
    notes: 'Portrait used by ____ house dialogue and reward message.',
    qaChecks: ['identity consistency', 'dialogue scale readability'],
  },
  {
    id: 'portrait-friend-b',
    kind: 'portrait',
    label: 'Friend B portrait',
    status: 'planned',
    locationIds: ['friend-b'],
    notes: 'Higher-detail illustrated pixel-art portrait tied to Friend B reward message.',
    qaChecks: ['identity consistency', 'dialogue scale readability'],
  },
  {
    id: 'portrait-friend-c',
    kind: 'portrait',
    label: 'Friend C portrait',
    status: 'planned',
    locationIds: ['friend-c'],
    notes: 'Higher-detail illustrated pixel-art portrait tied to Friend C reward message.',
    qaChecks: ['identity consistency', 'dialogue scale readability'],
  },
  {
    id: 'portrait-friendthree',
    kind: 'portrait',
    label: '____ dialogue portrait',
    status: 'planned',
    locationIds: ['friend-c'],
    notes:
      'Dedicated portrait for ____ dialogue. The first dialogue-box pass can use the current ____ walk spritesheet as a temporary portrait source until final portrait art is produced.',
    qaChecks: ['identity consistency', 'dialogue scale readability'],
  },
  {
    id: 'tileset-garden-house-foundation',
    kind: 'tileset',
    label: 'Garden house 64x64 foundation tiles',
    status: 'planned',
    locationIds: ['friend-a'],
    notes: 'Floors, walls, rug, and path materials for the first vertical-slice house.',
    qaChecks: ['64x64 grid', 'tile seams', 'scale consistency', 'palette consistency'],
  },
  {
    id: 'props-garden-house',
    kind: 'prop-sheet',
    label: 'Garden house prop sheet',
    status: 'planned',
    locationIds: ['friend-a'],
    notes: 'Furniture, shelf clutter, garden objects, and activity props.',
    qaChecks: ['transparent background', 'scale consistency', 'collision readability'],
  },
  {
    id: 'keepsake-pressed-flower',
    kind: 'keepsake',
    label: 'Pressed flower keepsake icon',
    status: 'planned',
    locationIds: ['friend-a', 'final-spot'],
    notes: 'Small keepsake icon used in collection UI and final reveal.',
    qaChecks: ['small-size readability', 'palette consistency'],
  },
  {
    id: 'keepsake-glowing-koi-scale',
    kind: 'keepsake',
    label: 'Glowing koi scale keepsake icon',
    status: 'planned',
    locationIds: ['friend-a', 'final-spot'],
    notes: 'Small keepsake icon used in collection UI and final reveal for ____ PC fishing.',
    qaChecks: ['small-size readability', 'palette consistency'],
  },
  {
    id: 'keepsake-paper-star',
    kind: 'keepsake',
    label: 'Paper star keepsake icon',
    status: 'planned',
    locationIds: ['friend-b', 'final-spot'],
    notes: 'Small keepsake icon used in collection UI and final reveal.',
    qaChecks: ['small-size readability', 'palette consistency'],
  },
  {
    id: 'keepsake-tiny-key',
    kind: 'keepsake',
    label: 'Tiny key keepsake icon',
    status: 'planned',
    locationIds: ['friend-c', 'final-spot'],
    notes: 'Small keepsake icon used in collection UI and final reveal.',
    qaChecks: ['small-size readability', 'palette consistency'],
  },
  {
    id: 'activity-art-friendone-pc-pond',
    kind: 'activity-art',
    label: '____ PC pond fishing scene',
    status: 'temporary',
    locationIds: ['friend-a'],
    notes: 'Temporary Phaser-drawn cozy pond scene used for the first playable fishing activity.',
    qaChecks: ['cozy readability', 'player and ____ composition', 'meter contrast'],
  },
  {
    id: 'activity-art-glowing-koi',
    kind: 'activity-art',
    label: 'Glowing koi fish target',
    status: 'temporary',
    locationIds: ['friend-a'],
    notes: 'Temporary Phaser-drawn glowing koi with warm halo and shimmer treatment.',
    qaChecks: ['special-fish readability', 'warm glow effect', 'motion readability'],
  },
  {
    id: 'message-art-garden-house',
    kind: 'message-art',
    label: 'Garden house reward message art',
    status: 'planned',
    locationIds: ['friend-a'],
    notes: 'Special-message image treatment for the first reward moment.',
    qaChecks: ['text-safe composition', 'portrait consistency'],
  },
];

export function getAssetsForLocation(locationId: string): readonly GameAsset[] {
  return ASSET_MANIFEST.filter((asset) => asset.locationIds.includes(locationId));
}
