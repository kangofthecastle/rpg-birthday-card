import { describe, expect, it } from 'vitest';
import { resolvePropDepthRelativeToPlayer } from '../../src/game/propDepth';

describe('resolvePropDepthRelativeToPlayer', () => {
  it('keeps a prop behind ____ when its natural depth is already behind', () => {
    expect(resolvePropDepthRelativeToPlayer(420, 500, true)).toBe(420);
  });

  it('clamps a prop just behind ____ when its natural depth is in front', () => {
    expect(resolvePropDepthRelativeToPlayer(620, 500, true)).toBeCloseTo(499.99);
  });

  it('keeps a prop in front of ____ when its natural depth is already in front', () => {
    expect(resolvePropDepthRelativeToPlayer(620, 500, false)).toBe(620);
  });

  it('clamps a prop just in front of ____ when its natural depth is behind', () => {
    expect(resolvePropDepthRelativeToPlayer(420, 500, false)).toBeCloseTo(500.01);
  });

  it('preserves the natural order of props that share ____\'s side', () => {
    const bedDepth = resolvePropDepthRelativeToPlayer(420, 500, true);
    const tableDepth = resolvePropDepthRelativeToPlayer(460, 500, true);
    expect(tableDepth).toBeGreaterThan(bedDepth);
  });

  it('preserves natural order when both props must be clamped behind ____', () => {
    const bedDepth = resolvePropDepthRelativeToPlayer(900, 500, true);
    const tableDepth = resolvePropDepthRelativeToPlayer(1000, 500, true);
    expect(tableDepth).toBeGreaterThan(bedDepth);
    expect(tableDepth).toBeLessThan(500);
  });

  it('preserves natural order when both props must be clamped in front of ____', () => {
    const tableDepth = resolvePropDepthRelativeToPlayer(100, 500, false);
    const bedDepth = resolvePropDepthRelativeToPlayer(200, 500, false);
    expect(bedDepth).toBeGreaterThan(tableDepth);
    expect(tableDepth).toBeGreaterThan(500);
  });
});
