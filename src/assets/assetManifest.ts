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
      'Saved at public/assets/sprites/characters/friendone-idle-walk-4dir-v9-light-brown-face-fixed-alpha.png. Identical geometry, animation, clothing, skin, and alpha to v6, with only ____ hair pixels shifted from copper-orange to soft light chestnut brown.',
    qaChecks: ['8x6 idle-walk layout', 'transparent background', 'identity consistency', 'anchor consistency'],
  },
  {
    id: 'character-friendtwo-walk-4dir',
    kind: 'spritesheet',
    label: '____ forward idle/walk-south spritesheet',
    status: 'review',
    locationIds: ['global'],
    notes:
      'Saved at public/assets/sprites/characters/friendtwo-idle-walk-south-v2-alpha.png, with runtime row strips under friendtwo-forward-frames-v2. ____ identity is transferred onto ____ forward-idle and walk-south geometry, normalized to ____ character height and baseline.',
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
    status: 'review',
    locationIds: ['friend-a'],
    notes:
      'Generated portrait saved at public/assets/portraits/portrait-friendone.png and wired into the dialogue box.',
    qaChecks: ['identity consistency', 'dialogue scale readability'],
  },
  {
    id: 'portrait-friend-b',
    kind: 'portrait',
    label: 'Friend B portrait',
    status: 'review',
    locationIds: ['friend-b'],
    notes:
      'Generated ____ portrait saved at public/assets/portraits/portrait-friendtwo.png and wired into the dialogue box.',
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
    id: 'keepsake-glowing-koi-scale',
    kind: 'keepsake',
    label: 'Glowing koi scale keepsake icon',
    status: 'review',
    locationIds: ['friend-a', 'final-spot'],
    notes: 'Small keepsake icon used in collection UI and final reveal for ____ PC fishing.',
    qaChecks: ['small-size readability', 'palette consistency'],
  },
  {
    id: 'keepsake-defused-spike-charm',
    kind: 'keepsake',
    label: 'Defused spike charm keepsake icon',
    status: 'review',
    locationIds: ['friend-b', 'final-spot'],
    notes:
      'Small keepsake icon used in collection UI and final reveal for the RETAKE.EXE minigame. A miniature defused Valorant-style spike with a calm teal glowing core.',
    qaChecks: ['small-size readability', 'palette consistency'],
  },
  {
    id: 'keepsake-golden-hour-photo',
    kind: 'keepsake',
    label: '____ sheet music keepsake icon',
    status: 'review',
    locationIds: ['recipient-house', 'final-spot'],
    notes:
      "Small keepsake icon for ____'s self-keepsake: a golden-hour photograph revealed by her PC once both friend keepsakes are collected.",
    qaChecks: ['small-size readability', 'palette consistency'],
  },
  {
    id: 'activity-art-split-arena-tiles',
    kind: 'activity-art',
    label: 'RETAKE.EXE arena tiles',
    status: 'review',
    locationIds: ['friend-b'],
    notes:
      'Low-bit pixel-art top-down floor/wall/cover tiles evoking Valorant Split B site. Delivered as public/assets/activities/valorant-split/arena-floor.png + props.png and wired into SplitScene via splitArt.ts; generated shapes remain as load-failure fallback.',
    qaChecks: ['64px-grid readability', 'palette lock', 'cover silhouette clarity'],
  },
  {
    id: 'activity-art-split-minisprites',
    kind: 'activity-art',
    label: 'RETAKE.EXE Viper/Omen/bot minisprites',
    status: 'review',
    locationIds: ['friend-b'],
    notes:
      'Top-down minisprites: ____-as-Viper (green accents), ____-as-Omen teammate (blue-purple shroud), and enemy bots with a readable top head band. Must keep the top ~22% head zone legible so the headshot hitbox reads. Delivered as viper.png/omen.png/bot.png under public/assets/activities/valorant-split/ and wired via splitArt.ts.',
    qaChecks: ['head-band readability', 'faction color contrast', 'top-down silhouette clarity'],
  },
  {
    id: 'activity-art-split-gun',
    kind: 'activity-art',
    label: 'RETAKE.EXE Vandal rifle',
    status: 'planned',
    locationIds: ['friend-b'],
    notes:
      'Optional drop-in for the held weapon: a top-down/side Vandal-silhouette rifle (long barrel + muzzle, boxy receiver, angled magazine, rear stock, foregrip), drawn barrel-right with the grip roughly a third from the rear so it pivots believably in the hand. Team color is applied at runtime via GUN_TINT, so a neutral gunmetal sprite works. Deliver as public/assets/activities/valorant-split/gun.png; absent by default — the scene falls back to its generated Vandal-silhouette rifle (makeGun) and wires the slot via splitArt.ts ART_KEYS.gun.',
    qaChecks: ['long-gun silhouette clarity', 'grip-pivot placement', 'reads at gameplay scale'],
  },
  {
    id: 'activity-art-split-spike',
    kind: 'activity-art',
    label: 'RETAKE.EXE planted spike',
    status: 'review',
    locationIds: ['friend-b'],
    notes:
      'Planted/defusing spike prop with a pulsing teal core for the defuse finale. Delivered as public/assets/activities/valorant-split/spike.png (armed + defusing states) and wired via splitArt.ts.',
    qaChecks: ['pulsing-core readability', 'planted-vs-defused states'],
  },
  {
    id: 'activity-art-friendone-pc-pond',
    kind: 'activity-art',
    label: '____ PC pond fishing scene',
    status: 'review',
    locationIds: ['friend-a'],
    notes:
      'Generated retro pixel-art pond and dock backdrop saved at public/assets/activities/friendone-fishing/pond-dock-v2.png for the ____ PC fishing activity. ____ and ____ are based on the current character sprite references while fishing lines, bobbers, fish, and koi glow remain live Phaser overlays.',
    qaChecks: ['retro pixel-art readability', 'player and ____ composition', 'meter contrast'],
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
  {
    id: 'portrait-recipient',
    kind: 'portrait',
    label: '____ dialogue portrait',
    status: 'review',
    locationIds: ['global'],
    notes:
      'Generated portrait saved at public/assets/portraits/portrait-recipient.png and mapped in the dialogue box for any line tagged portrait-recipient.',
    qaChecks: ['identity consistency', 'dialogue scale readability'],
  },
  {
    id: 'inspect-signpost',
    kind: 'portrait',
    label: 'Signpost inspection portrait',
    status: 'review',
    locationIds: ['main-outside'],
    notes: 'Outdoor signpost art reused as the dialogue inspection portrait.',
    qaChecks: ['dialogue crop readability', 'world-art consistency'],
  },
  {
    id: 'inspect-friendone-pc',
    kind: 'portrait',
    label: '____ PC inspection portrait',
    status: 'review',
    locationIds: ['friend-a'],
    notes: 'Object portrait saved at public/assets/portraits/objects/friendone-pc.png.',
    qaChecks: ['dialogue crop readability', 'room-art consistency'],
  },
  {
    id: 'inspect-friendtwo-setup',
    kind: 'portrait',
    label: '____ setup inspection portrait',
    status: 'review',
    locationIds: ['friend-b'],
    notes: 'Object portrait saved at public/assets/portraits/objects/friendtwo-setup.png.',
    qaChecks: ['dialogue crop readability', 'room-art consistency'],
  },
  {
    id: 'inspect-violin',
    kind: 'portrait',
    label: 'Violin inspection portrait',
    status: 'review',
    locationIds: ['recipient-house'],
    notes: 'Object portrait saved at public/assets/portraits/objects/violin.png.',
    qaChecks: ['dialogue crop readability', 'room-art consistency'],
  },
  {
    id: 'inspect-mango-rice',
    kind: 'portrait',
    label: 'Mango rice inspection portrait',
    status: 'review',
    locationIds: ['recipient-house'],
    notes: '____ kitchen art reused as the mango sticky rice inspection portrait.',
    qaChecks: ['dialogue crop readability', 'room-art consistency'],
  },
  {
    id: 'inspect-photo-wall',
    kind: 'portrait',
    label: 'Photo wall inspection portrait',
    status: 'review',
    locationIds: ['recipient-house'],
    notes: 'Object portrait saved at public/assets/portraits/objects/photo-wall.png.',
    qaChecks: ['dialogue crop readability', 'room-art consistency'],
  },
  {
    id: 'inspect-bed',
    kind: 'portrait',
    label: '____ bed inspection portrait',
    status: 'review',
    locationIds: ['recipient-house'],
    notes: '____ bed prop reused as the dialogue inspection portrait.',
    qaChecks: ['dialogue crop readability', 'room-art consistency'],
  },
  {
    id: 'inspect-recipient-pc',
    kind: 'portrait',
    label: '____ PC inspection portrait',
    status: 'review',
    locationIds: ['recipient-house'],
    notes: '____ desk and PC prop reused as the dialogue inspection portrait.',
    qaChecks: ['dialogue crop readability', 'room-art consistency'],
  },
  {
    id: 'tileset-recipient-room',
    kind: 'tileset',
    label: '____ room floor/wall tiles',
    status: 'review',
    locationIds: ['recipient-house'],
    notes:
      'Seamless 64x64 wood floor + cream wall pair at public/assets/tiles/recipient-room-tiles.png, rendered by roomRenderer for the dressed recipient-house.',
    qaChecks: ['tile seams', 'scale consistency', 'palette consistency'],
  },
  {
    id: 'props-recipient-room',
    kind: 'prop-sheet',
    label: '____ room prop sheet',
    status: 'review',
    locationIds: ['recipient-house'],
    notes:
      'Bed, desk/PC, violin, camera and photo wall, mango sticky rice table, rug, plants, and window at public/assets/props/recipient-room-props.png; crops and world footprints defined in roomDressing.ts.',
    qaChecks: ['transparent background', 'scale vs player height', 'collision readability'],
  },
  {
    id: 'ending-ocean-galaxy-backdrop',
    kind: 'message-art',
    label: 'Ending water-to-painted-galaxy transition',
    status: 'review',
    locationIds: ['final-spot'],
    notes:
      'Dark-water arrival and terrain bridge at public/assets/ending/water-arrival.png and water-to-galaxy.png, ending on galaxy-arrival.png: the exact initial camera crop of the playable galaxy-ground.png painting.',
    qaChecks: ['horizon registration', 'boat persists through bridge', 'live-scene handoff'],
  },
  {
    id: 'ending-standalone-violin',
    kind: 'message-art',
    label: 'Standalone ending violin',
    status: 'review',
    locationIds: ['final-spot'],
    notes:
      'Transparent no-stand violin at public/assets/ending/violin-standalone.png, carried by ____ for the one-note star reveal.',
    qaChecks: ['transparent background', 'no floor stand', 'small-size readability'],
  },
];

export function getAssetsForLocation(locationId: string): readonly GameAsset[] {
  return ASSET_MANIFEST.filter((asset) => asset.locationIds.includes(locationId));
}
