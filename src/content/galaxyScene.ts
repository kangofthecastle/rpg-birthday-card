/**
 * Shared keys, asset paths, and layout constants for the redressed final-spot —
 * the galaxy place where the ending's playable finale happens. Kept in one small
 * module so BootScene (which loads the textures) and LocationScene (which builds
 * the ground, the ____ NPC, and the arrival reveal) agree on names.
 */

// ____'s 4-direction idle/walk sheet: 1536×2048, 6 columns × 8 rows of 256px
// frames. Rows 0–3 are idle (down, left, right, up); rows 4–7 are walk. Only the
// idle-down row is used — he stands at the glow, facing the path ____ climbs.
export const FRIEND_TWO_SPRITE = {
  key: 'friendtwo-idle-walk-4dir',
  url: '/assets/sprites/characters/friendtwo-idle-walk-4dir-v1-alpha.png',
  frameWidth: 256,
  frameHeight: 256,
  scale: 0.45,
  origin: { x: 0.5, y: 1 },
  idleFrameRate: 4,
  /** First frame of the idle-down row. */
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
