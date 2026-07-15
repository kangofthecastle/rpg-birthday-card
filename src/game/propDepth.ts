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
