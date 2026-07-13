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
  gun: 'split-art-gun',
  spike: 'split-art-spike',
  ui: 'split-art-ui',
} as const;

// Top-bar portrait tiles (Valorant scoreboard style). Each is an optional
// drop-in 128x128 transparent PNG displayed at HUD_PORTRAIT_DISPLAY px; absent
// by default, the scene draws a procedural head-and-shoulders silhouette (cyan
// for allies, red for enemies). Two ally tiles (player + partner) and five
// enemy tiles (the full 3 + 2 roster). Keys are exposed in order for the scene.
export const HUD_PORTRAIT_DISPLAY = 30;
export const HUD_ALLY_KEYS: readonly string[] = ['split-hud-ally-1', 'split-hud-ally-2'];
export const HUD_ENEMY_KEYS: readonly string[] = [
  'split-hud-enemy-1',
  'split-hud-enemy-2',
  'split-hud-enemy-3',
  'split-hud-enemy-4',
  'split-hud-enemy-5',
];

const HUD_PORTRAIT_FILES: ReadonlyArray<{ readonly key: string; readonly file: string }> = [
  { key: HUD_ALLY_KEYS[0], file: 'hud-ally-1.png' },
  { key: HUD_ALLY_KEYS[1], file: 'hud-ally-2.png' },
  { key: HUD_ENEMY_KEYS[0], file: 'hud-enemy-1.png' },
  { key: HUD_ENEMY_KEYS[1], file: 'hud-enemy-2.png' },
  { key: HUD_ENEMY_KEYS[2], file: 'hud-enemy-3.png' },
  { key: HUD_ENEMY_KEYS[3], file: 'hud-enemy-4.png' },
  { key: HUD_ENEMY_KEYS[4], file: 'hud-enemy-5.png' },
];

export const ART_FILES: ReadonlyArray<{ readonly key: string; readonly file: string }> = [
  { key: ART_KEYS.floor, file: 'arena-floor.png' },
  { key: ART_KEYS.props, file: 'props.png' },
  { key: ART_KEYS.viper, file: 'viper.png' },
  { key: ART_KEYS.omen, file: 'omen.png' },
  { key: ART_KEYS.bot, file: 'bot.png' },
  // Optional drop-in for the held weapon. Absent by default: the scene falls
  // back to its generated Vandal-silhouette rifle (makeGun) until a painted
  // gun.png is dropped in here. Sprite should face barrel-right, grip roughly a
  // third from the rear (see GUN_ART_ORIGIN_X / GUN_ART_SCALE in SplitScene).
  { key: ART_KEYS.gun, file: 'gun.png' },
  { key: ART_KEYS.spike, file: 'spike.png' },
  { key: ART_KEYS.ui, file: 'ui.png' },
  ...HUD_PORTRAIT_FILES,
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
//
// handFraction is the vertical position of the character's hand/chest band as a
// fraction measured DOWN from the top of the rendered sprite (0 = head crown,
// 1 = feet). The scene anchors the held gun and muzzle flash there so the
// weapon sits in the hands rather than off the hitbox center — see
// SplitScene.gunHandY(). These are front-facing standing figures, so the hands
// read at roughly mid-torso.
export const CHARACTER_ART = {
  player: { key: ART_KEYS.viper, scale: 0.67, originY: 1, offsetY: 1, handFraction: 0.46 },
  teammate: { key: ART_KEYS.omen, scale: 0.67, originY: 1, offsetY: 1, handFraction: 0.46 },
  enemy: { key: ART_KEYS.bot, scale: 0.66, originY: 0, offsetY: -2.3, handFraction: 0.5 },
} as const;

export const SPIKE_BASE_SCALE = 0.72;
export const CROSSHAIR_SCALE = 1.4;
export const HEART_SCALE = 0.86;
export const MEDAL_SCALE = 1.35;
