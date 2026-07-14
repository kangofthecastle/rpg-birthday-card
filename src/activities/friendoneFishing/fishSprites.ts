// Optional image-gen sprites for the pond fish.
//
// Each fish type may ship a single-frame PNG at
//   public/assets/activities/friendone-fishing/fish-<id>.png
// painted as a side-view cutout on a transparent background, with the nose
// pointing RIGHT in every current source asset. The scene mirrors the sprite
// when travel changes sides and applies only a small pitch so the fish stays
// upright. When a file is absent the scene falls back to vector rendering.
// Presence is probed with `isImageUrl` (dev serves index.html for missing paths),
// so a missing sprite never logs a loader error, and the golden koi
// halo/sparkle stays procedural on top of the art.

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

/** Nose direction shared by the source art, in radians (0 = pointing right). */
export const FISH_SPRITE_NOSE_ANGLE = 0;

/**
 * Largest vertical pitch (radians) a swimming fish sprite is allowed to take.
 * The pond art is a SIDE view (dorsal fin up, belly down, nose left), so it must
 * never roll past vertical — otherwise it renders belly-up. ~0.5rad keeps a
 * lively nose-up/nose-down tilt while always staying upright.
 */
export const FISH_MAX_PITCH = 0.5;

export interface FishFacing {
  /** Mirror the source art horizontally so it faces its travel side. */
  readonly flipX: boolean;
  /** Gentle vertical pitch toward the travel heading, clamped upright. */
  readonly rotation: number;
}

/**
 * Map a travel heading to a side-view sprite orientation.
 *
 * The source art faces RIGHT. Instead of rotating the whole sprite to the heading
 * (which flips a side-view fish belly-up whenever it swims to the right — the
 * "fish moving backwards" bug), we mirror it to the travel side with `flipX` and
 * apply only a small vertical pitch. The fish always stays upright yet noses the
 * way it swims, and it flips cleanly as it reverses direction.
 */
export function fishSpriteFacing(heading: number, maxPitch = FISH_MAX_PITCH): FishFacing {
  const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
  const faceRight = Math.cos(heading) >= 0;
  const sourceFacesRight = Math.cos(FISH_SPRITE_NOSE_ANGLE) >= 0;
  // Mirror exactly when the requested travel side differs from the source art.
  // Pitch is measured from the horizontal direction the fish is facing.
  const flipX = faceRight !== sourceFacesRight;
  const pitch = faceRight ? wrap(heading) : wrap(heading - Math.PI);
  const rotation = Math.max(-maxPitch, Math.min(maxPitch, pitch));
  return { flipX, rotation };
}

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
