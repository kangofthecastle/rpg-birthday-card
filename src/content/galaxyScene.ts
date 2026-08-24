/**
 * Shared keys, asset paths, and layout constants for the redressed final-spot —
 * the galaxy place where the ending's playable finale happens. Kept in one small
 * module so BootScene (which loads the textures) and LocationScene (which builds
 * the ground, the ____ NPC, and the arrival reveal) agree on names.
 */

// ____'s compact forward-only sheet: 1536×512, 6 columns × 2 rows of 256px
// frames. Row 0 is forward idle and row 1 is walking south. At the galaxy edge
// he only needs row 0, facing ____ as she approaches.
export const FRIEND_TWO_SPRITE = {
  key: 'friendtwo-idle-walk-south',
  url: '/assets/sprites/characters/friendtwo-idle-walk-south-v2-alpha.png',
  frameWidth: 256,
  frameHeight: 256,
  scale: 0.45,
  origin: { x: 0.5, y: 1 },
  idleFrameRate: 4,
  /** First frame of the forward-idle row. */
  idleDownStartFrame: 0,
  idleDownFrameCount: 6,
  idleAnimationKey: 'friendtwo-idle-down',
} as const;

// The existing galaxy-sky and starlit-water paintings, loaded as Phaser textures
// so the galaxy ground can be composed from them exactly as the ending's terminal
// CSS frame is (sky pinned to the top, water below with an alpha-gradient blend
// band fading the water's top edge over the sky — no hard horizon seam).
export const ENDING_SKY_KEY = 'ending-sky';
export const ENDING_SKY_URL = '/assets/ending/ending-sky.png';
export const ENDING_WATER_KEY = 'ending-water';
export const ENDING_WATER_URL = '/assets/ending/ending-water.png';

// Optional file-first override: a full-bleed painted galaxy ground (1408×1024,
// matching the final-spot map). When present it replaces the composed ground.
export const GALAXY_GROUND_KEY = 'galaxy-ground';
export const GALAXY_GROUND_URL = '/assets/ending/galaxy-ground.png';

// Optional file-first tileable shore-water band texture (512×128) for the
// clearing's dark-water shore. Procedural water stays the fallback.
export const SHORE_WATER_KEY = 'shore-water';
export const SHORE_WATER_URL = '/assets/tiles/shore-water.png';

// The standalone violin ____ receives after ____'s final conversation. This
// ending-specific cutout has no floor stand, unlike the room inspection art.
export const GALAXY_VIOLIN_KEY = 'galaxy-ending-violin';
export const GALAXY_VIOLIN_URL = '/assets/ending/violin-standalone.png';

// Painted flare variants for the ten collectible letter-stars. Cycling a small
// family keeps the dotted field varied without making any one letter feel more
// important than another. The source PNGs are square transparent cutouts; the
// per-variant display sizes compensate for their different ray silhouettes.
export const GALAXY_STAR_VARIANTS = [
  {
    key: 'galaxy-star-flare-1',
    url: '/assets/ending/stars/star-flare-1.png',
    displaySize: 40,
  },
  {
    key: 'galaxy-star-flare-2',
    url: '/assets/ending/stars/star-flare-2.png',
    displaySize: 42,
  },
  {
    key: 'galaxy-star-flare-3',
    url: '/assets/ending/stars/star-flare-3.png',
    displaySize: 42,
  },
  {
    key: 'galaxy-star-flare-4',
    url: '/assets/ending/stars/star-flare-4.png',
    displaySize: 38,
  },
] as const;
