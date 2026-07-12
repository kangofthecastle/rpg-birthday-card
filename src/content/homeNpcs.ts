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

import { FRIEND_TWO_SPRITE } from './galaxyScene';

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
  'friend-a': { sprite: FRIEND_ONE_SPRITE, mapX: 1050, mapY: 582 },
  'friend-b': { sprite: FRIEND_TWO_SPRITE, mapX: 452, mapY: 430 },
};
