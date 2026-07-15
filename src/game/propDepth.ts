import type { Projection } from './projection';

/** ____'s billboard sorts slightly below her physics feet for visual grounding. */
export const PLAYER_VISUAL_DEPTH_BIAS = 10;

/**
 * Converts ____'s biased billboard depth back into the same map space used by
 * authorable prop lines. Testing a raw physics point while rendering at a
 * different depth makes a line appear visually crossed before it can fire.
 */
export function getPlayerDepthSortingPoint(
  projection: Pick<Projection, 'project' | 'unproject'>,
  playerMapX: number,
  playerMapY: number,
): { readonly x: number; readonly y: number } {
  const screenPoint = projection.project(playerMapX, playerMapY);
  return projection.unproject(
    screenPoint.x,
    screenPoint.y + PLAYER_VISUAL_DEPTH_BIAS,
  );
}

/**
 * Resolves a prop's depth against ____ without erasing the prop's natural
 * ordering relative to other furniture. The line only clamps the prop across
 * ____ when its natural depth is on the wrong side.
 */
export function resolvePropDepthRelativeToPlayer(
  naturalDepth: number,
  playerDepth: number,
  playerInFront: boolean,
): number {
  const crossingDepth = playerDepth + (playerInFront ? -0.01 : 0.01);

  // Several props can be on the same side of ____ at once. If they all cross
  // her at the exact same depth, Phaser resolves the tie using display-list
  // insertion order, which makes furniture appear to jump in front of one
  // another as ____ walks. Keep a tiny amount of their natural depth in the
  // clamped value so the original prop order remains stable while still
  // leaving every clamped prop on ____'s intended side.
  const orderOffset = Math.max(
    -0.004,
    Math.min(0.004, (naturalDepth - playerDepth) * 0.000001),
  );
  const stableCrossingDepth = crossingDepth + orderOffset;

  return playerInFront
    ? Math.min(naturalDepth, stableCrossingDepth)
    : Math.max(naturalDepth, stableCrossingDepth);
}

/**
 * Enforces a fixed furniture stack after player-relative sorting. Phaser draws
 * larger depths in front, so an object that must stay behind a layered prop has
 * to sit below even that prop's rearmost part.
 */
export function clampDepthBehindLayers(
  depth: number,
  foregroundDepths: readonly number[],
): number {
  if (foregroundDepths.length === 0) {
    return depth;
  }
  return Math.min(depth, Math.min(...foregroundDepths) - 0.01);
}
