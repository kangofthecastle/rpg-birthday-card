/**
 * The friends who actually live in the friend houses, staged as visible idle
 * NPCs standing at their host dialogue hotspot. ____ lives in friend-a; ____
 * (internally "friend-b") lives in friend-b.
 *
 * These sprites are purely decorative — no collider, no trigger of their own.
 * The existing Interactables rect (`friendone-host` / `friendtwo-host`) still owns the
 * interaction, so walking up and pressing E fires the host dialogue exactly once
 * (the character and the hotspot are the same beat, not two). This mirrors how
 * the galaxy ending stages ____ via `createGalaxyScenery` — a standing idle
 * billboard next to the thing the player actually interacts with.
 */

import {
  FRIEND_TWO_PARTIAL_FRAMES,
  friendtwoRowAnimationKey,
  friendtwoRowTextureKey,
} from './friendtwoPartialSprite';

// ____'s 4-direction idle/walk sheet: 1536×2048, 6 columns × 8 rows of 256px
// frames — identical layout to ____'s. Rows 0–3 are idle (down, left, right,
// up); rows 4–7 are walk. Only the idle-down row is used here — she stands at
// her tea table, facing the door ____ comes in through.
export const FRIEND_ONE_SPRITE = {
  key: 'friendone-idle-walk-4dir',
  url: '/assets/sprites/characters/friendone-idle-walk-4dir-v1-alpha.png',
  frameWidth: 256,
  frameHeight: 256,
  scale: 0.45,
  origin: { x: 0.5, y: 1 },
  idleFrameRate: 4,
  /** First frame of the idle-down row. */
  idleDownStartFrame: 0,
  idleDownFrameCount: 6,
  idleAnimationKey: 'friendone-idle-down',
} as const;

// ____'s home billboard sprite, built from the partial frame set's idle-south
// strip (the only facing this static resident shows — he stands at his desk's
// left corner facing the entrance). Each row ships as its own 1536×256 strip, so
// the "key" here is that one strip's texture and its 6 frames drive the idle
// bob. The other generated rows (idle-west/east/north, walk-south) are still
// loaded and registered (see LocationScene.createFriendTwoPartialAnimations) and
// reachable through resolveFriendTwoRow, but nothing plays them for this billboard.
export const FRIEND_TWO_HOME_SPRITE = {
  key: friendtwoRowTextureKey('idle-south'),
  scale: FRIEND_TWO_PARTIAL_FRAMES.scale,
  origin: FRIEND_TWO_PARTIAL_FRAMES.origin,
  idleFrameRate: FRIEND_TWO_PARTIAL_FRAMES.idleFrameRate,
  /** First frame of the idle-south strip (rows are one-per-file, so 0). */
  idleDownStartFrame: 0,
  idleDownFrameCount: FRIEND_TWO_PARTIAL_FRAMES.framesPerRow,
  idleAnimationKey: friendtwoRowAnimationKey('idle-south'),
} as const;

/** The shared shape of an idle-down character billboard config. */
export interface HomeHostSprite {
  readonly key: string;
  readonly scale: number;
  readonly origin: { readonly x: number; readonly y: number };
  readonly idleFrameRate: number;
  readonly idleDownStartFrame: number;
  readonly idleDownFrameCount: number;
  readonly idleAnimationKey: string;
}

export interface HomeHostNpc {
  /**
   * Stable id for this resident, used as the key under a room layout's optional
   * `npcs` override section (roomLayouts/<id>.json) so a dressEdit Save can pin a
   * per-character position. Distinct from the location id (the Record key) since
   * the JSON names the character, not the room.
   */
  readonly id: string;
  readonly sprite: HomeHostSprite;
  /** Feet position in room map (pre-projection) coordinates. */
  readonly mapX: number;
  readonly mapY: number;
}

/**
 * The resident standing idle in each home, keyed by location id. Feet map coords
 * sit at the character's host hotspot:
 *  - friend-a `friendone-host` rect = 986,563 → 1114,659 (center 1050,611); the tea
 *    table sits on it. ____ stands just north of the table so it occludes her
 *    lower body and she reads as waiting at it, facing the entrance (down).
 *  - friend-b `friendtwo-host` rect = 464,384 → 592,480 (center 528,432); the left
 *    end of the battlestation. ____ stands at that left corner facing the
 *    entrance (down), his desk in front of him — head clear above the desk so
 *    he reads as standing at his PC rather than hidden behind a monitor.
 */
export const HOME_HOST_NPCS: Record<string, HomeHostNpc> = {
  'friend-a': { id: 'friendone', sprite: FRIEND_ONE_SPRITE, mapX: 1050, mapY: 582 },
  'friend-b': { id: 'friendtwo', sprite: FRIEND_TWO_HOME_SPRITE, mapX: 452, mapY: 430 },
};

/**
 * Resolve a home NPC's feet position: an authored dressEdit override (from the
 * room layout's `npcs` section, keyed by NPC id) wins over the TS default, and
 * an absent/partial override falls back to the TS default — the same
 * JSON-overrides-TS rule the room props follow. Pure so LocationScene and tests
 * share one source of truth.
 */
export function resolveHomeNpcPosition(
  npc: HomeHostNpc,
  overrides: Readonly<Record<string, { readonly x: number; readonly y: number }>>,
): { mapX: number; mapY: number } {
  const override = overrides[npc.id];
  return {
    mapX: override?.x ?? npc.mapX,
    mapY: override?.y ?? npc.mapY,
  };
}
