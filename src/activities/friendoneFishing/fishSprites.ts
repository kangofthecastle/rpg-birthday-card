// Optional image-gen sprites for the pond fish.
//
// Each fish type may ship a single-frame PNG at
//   public/assets/activities/friendone-fishing/fish-<id>.png
// painted as a TOP-DOWN cutout (viewed from above, as if looking down into the
// water) on a transparent background, with the nose pointing LEFT in the source
// art. The scene rotates the whole sprite to the fish's travel heading (no flip,
// because a top-down fish reads correctly at any rotation). When the file is
// present the scene renders from it; when it is absent the scene falls back to
// the existing vector rendering. Presence is probed with `isImageUrl` (dev
// serves index.html for missing paths), so an absent sprite never logs a loader
// error, and the golden koi halo/sparkle stays procedural on top of the art.

export interface FishSpriteConfig {
  /** Phaser texture key. */
  readonly key: string;
  /** URL under public/. */
  readonly url: string;
  /** Target on-screen width in scene pixels when swimming in the pond. */
  readonly pondWidth: number;
  /** Target on-screen width in scene pixels when shown in the catch meter. */
  readonly meterWidth: number;
}

export const FISH_SPRITE_BASE_URL = '/assets/activities/friendone-fishing';

/** Nose direction of the source art, in radians (PI = pointing left). */
export const FISH_SPRITE_NOSE_ANGLE = Math.PI;

// Per-fish target display widths, matching the locked asset spec
// (pond-drifter ~56x24, reed-darter ~56x20, glowing-koi ~68x28). Height follows
// the art's own aspect ratio.
const POND_WIDTH: Record<string, number> = {
  'pond-drifter': 56,
  'reed-darter': 56,
  'glowing-koi': 68,
};

export function fishSpriteFor(fishId: string): FishSpriteConfig {
  const pondWidth = POND_WIDTH[fishId] ?? 56;
  return {
    key: `friendone-fish-${fishId}`,
    url: `${FISH_SPRITE_BASE_URL}/fish-${fishId}.png`,
    pondWidth,
    // The meter shows the fish a little smaller so it fits the 48px column.
    meterWidth: Math.min(pondWidth, 48),
  };
}
