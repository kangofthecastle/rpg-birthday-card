// ---------------------------------------------------------------------------
// SPLIT.EXE real-art integration config.
//
// Everything about the generated art pack lives here: file URLs, texture keys,
// sprite-sheet frame slices (measured from the shipped PNGs), and display
// tuning. SplitScene consults this and silently falls back to its generated
// placeholder textures for any file that fails to load.
//
// Geometry note: arena-floor.png is 1280x720 and SPLIT_CONFIG.arena is
// 960x540, so the backdrop renders at an exact 0.75 uniform scale. The model's
// playable box (arena inset by wallThickness, offset by arena.x/y) was derived
// from the image's painted floor rect x[160,1148] y[162,595-with-hazard-band],
// so movement clamps line up with the baked walls.
// ---------------------------------------------------------------------------

export interface ArtFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const SPLIT_ART_BASE = '/assets/activities/valorant-split';

export const ART_KEYS = {
  floor: 'split-art-floor',
  props: 'split-art-props',
  viper: 'split-art-viper',
  omen: 'split-art-omen',
  bot: 'split-art-bot',
  spike: 'split-art-spike',
  ui: 'split-art-ui',
} as const;

export const ART_FILES: ReadonlyArray<{ readonly key: string; readonly file: string }> = [
  { key: ART_KEYS.floor, file: 'arena-floor.png' },
  { key: ART_KEYS.props, file: 'props.png' },
  { key: ART_KEYS.viper, file: 'viper.png' },
  { key: ART_KEYS.omen, file: 'omen.png' },
  { key: ART_KEYS.bot, file: 'bot.png' },
  { key: ART_KEYS.spike, file: 'spike.png' },
  { key: ART_KEYS.ui, file: 'ui.png' },
];

// props.png (512x256): five cover props, measured content boxes + 1px pad.
export const PROP_FRAMES: Readonly<Record<string, ArtFrame>> = {
  crateCluster: { x: 81, y: 13, width: 175, height: 136 },
  lowCrate: { x: 278, y: 65, width: 61, height: 73 },
  doubleStack: { x: 372, y: 33, width: 58, height: 111 },
  platform: { x: 84, y: 174, width: 193, height: 63 },
  lanternCrate: { x: 316, y: 155, width: 56, height: 88 },
};

// One prop per SPLIT_CONFIG.cover rect, in the same order, silhouette-matched:
// wide cluster left, long low platform above the site, tall double stack right,
// squat single crate center-south, lantern crate southwest.
export const COVER_PROP_ORDER: readonly string[] = [
  'crateCluster',
  'platform',
  'doubleStack',
  'lowCrate',
  'lanternCrate',
];

// spike.png (144x88): two equal-size frames so switching does not shift pixels.
export const SPIKE_FRAMES: Readonly<Record<'armed' | 'defusing', ArtFrame>> = {
  armed: { x: 3, y: 7, width: 64, height: 74 },
  defusing: { x: 77, y: 7, width: 64, height: 74 },
};

// ui.png (256x64).
export const UI_FRAMES: Readonly<Record<string, ArtFrame>> = {
  heartFull: { x: 44, y: 16, width: 35, height: 32 },
  heartEmpty: { x: 82, y: 16, width: 35, height: 32 },
  medal: { x: 121, y: 14, width: 36, height: 37 },
  crosshair: { x: 161, y: 19, width: 27, height: 26 },
  skull: { x: 192, y: 22, width: 20, height: 22 },
};

// Character display tuning. Scales are chosen against the model hitboxes
// (26x34): Viper/Omen plant their feet on the hitbox bottom and rise a little
// above it; the bot is TOP-aligned and scaled so its sphere head (rows 4-24 of
// 67 content rows) stays centered on the top-22% headshot band of the rect.
export const CHARACTER_ART = {
  player: { key: ART_KEYS.viper, scale: 0.58, originY: 1, offsetY: 1 },
  teammate: { key: ART_KEYS.omen, scale: 0.58, originY: 1, offsetY: 1 },
  enemy: { key: ART_KEYS.bot, scale: 0.567, originY: 0, offsetY: -2.3 },
} as const;

export const SPIKE_BASE_SCALE = 0.72;
export const CROSSHAIR_SCALE = 1.4;
export const HEART_SCALE = 0.86;
export const MEDAL_SCALE = 1.35;
