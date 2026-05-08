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
    label: 'Main character reference board',
    status: 'planned',
    locationIds: ['global'],
    notes:
      'Built from user-provided reference images with outfit, palette, silhouette, and personality notes.',
    qaChecks: ['recognizable stylization', 'palette lock', 'silhouette notes'],
  },
  {
    id: 'character-main-walk-8dir',
    kind: 'spritesheet',
    label: 'Main character 8-direction walk',
    status: 'planned',
    locationIds: ['global'],
    notes:
      '96x128 frames, bottom-center anchored, eight directions, six frames per direction.',
    qaChecks: ['frame size', 'anchor consistency', 'identity consistency', 'game zoom readability'],
  },
  {
    id: 'character-main-idle',
    kind: 'spritesheet',
    label: 'Main character subtle idle',
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
