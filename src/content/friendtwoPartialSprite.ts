/**
 * ____'s home-NPC sprite, backed by the "partial frame set" that asset-bot
 * generated at public/assets/sprites/characters/friendtwo-partial-frames-v1/.
 *
 * Unlike ____/____ (single 6×8 atlases) this set ships one 1536×256 strip PER
 * ROW (6 frames of 256px each), and — deliberately — only a subset of rows:
 * idle for all four facings plus walk-south. ____'s owner confirmed this NPC
 * never needs walk-west / walk-east / walk-north for this game, so those rows
 * were intentionally not generated (manifest `intentionallyNotGenerated`).
 *
 * That makes direction handling the interesting part: `resolveFriendTwoRow` maps a
 * requested (direction, motion) to a row that actually exists, falling the three
 * missing walk facings back to the SAME-direction idle row — so a caller can ask
 * for any facing/motion and always get a real, correctly-facing row (never a
 * crash, never a wrong-way walk). walk-south is the one generated walk row and
 * plays normally.
 *
 * The manifest reports a 216px normalized character height on a 247px baseline
 * inside a 256px cell — the same silhouette proportions as the ____/____
 * sheets — so the shared scale 0.45 + bottom-centre origin (0.5, 1) treatment
 * plants ____'s feet at the same ground point as before.
 */

export type FriendTwoDirection = 'south' | 'west' | 'east' | 'north';
export type FriendTwoMotion = 'idle' | 'walk';

/** The rows actually generated for this NPC (manifest `completeRows`). */
export type FriendTwoRow =
  | 'idle-south'
  | 'idle-west'
  | 'idle-east'
  | 'idle-north'
  | 'walk-south';

export const FRIEND_TWO_GENERATED_ROWS: readonly FriendTwoRow[] = [
  'idle-south',
  'idle-west',
  'idle-east',
  'idle-north',
  'walk-south',
];

/**
 * Shared geometry + timing for the partial set. Values mirror the manifest
 * (cell 256, 6 frames/row, baseline 247, character height 216) and adopt the
 * ____/____ display treatment (scale 0.45, bottom-centre origin) so ____'s
 * on-screen size and footing stay consistent with the other home NPCs.
 */
export const FRIEND_TWO_PARTIAL_FRAMES = {
  baseUrl: '/assets/sprites/characters/friendtwo-partial-frames-v1',
  frameWidth: 256,
  frameHeight: 256,
  framesPerRow: 6,
  baselineY: 247,
  normalizedCharacterHeight: 216,
  scale: 0.45,
  origin: { x: 0.5, y: 1 },
  idleFrameRate: 4,
  walkFrameRate: 10,
} as const;

/** Phaser texture key for a row's loaded strip. */
export function friendtwoRowTextureKey(row: FriendTwoRow): string {
  return `friendtwo-partial-${row}`;
}

/** Public URL of a row's 1536×256 strip. */
export function friendtwoRowStripUrl(row: FriendTwoRow): string {
  return `${FRIEND_TWO_PARTIAL_FRAMES.baseUrl}/rows/${row}.png`;
}

/**
 * Phaser animation key for a row. Namespaced away from the galaxy-ending ____
 * (`friendtwo-idle-down`, built on the old full atlas) so the two never collide in
 * the global animation manager.
 */
export function friendtwoRowAnimationKey(row: FriendTwoRow): string {
  return `friendtwo-partial-anim-${row}`;
}

/**
 * Resolve which generated row should play for a requested facing + motion.
 *
 * - Any row that exists is used directly (all four idles, plus walk-south).
 * - A walk request for west/east/north — the intentionally-missing rows — falls
 *   back to that same direction's idle row, so the NPC keeps facing the right
 *   way and no undefined row is ever requested.
 *
 * Pure and total over the four directions × two motions.
 */
export function resolveFriendTwoRow(
  direction: FriendTwoDirection,
  motion: FriendTwoMotion,
): FriendTwoRow {
  const requested = `${motion}-${direction}` as FriendTwoRow;
  if (FRIEND_TWO_GENERATED_ROWS.includes(requested)) {
    return requested;
  }
  // Only the three walk-{west,east,north} rows are absent; fall back to idle.
  return `idle-${direction}` as FriendTwoRow;
}

/** Resolve straight to the animation key that should play. */
export function resolveFriendTwoAnimationKey(
  direction: FriendTwoDirection,
  motion: FriendTwoMotion,
): string {
  return friendtwoRowAnimationKey(resolveFriendTwoRow(direction, motion));
}
