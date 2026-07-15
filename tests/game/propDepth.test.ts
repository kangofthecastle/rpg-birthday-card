import { describe, expect, it } from 'vitest';
import {
  clampDepthBehindLayers,
  getPlayerDepthSortingPoint,
  resolvePropDepthRelativeToPlayer,
} from '../../src/game/propDepth';
import { createFlatProjection, createIsoProjection } from '../../src/game/projection';
import { getCollisionZones } from '../../src/content/collisionZones';
import {
  getBedDepthLines,
  isPlayerInFrontOfBedDepthLines,
} from '../../src/content/bedDepth';

describe('getPlayerDepthSortingPoint', () => {
  it('maps the isometric billboard bias back into map space', () => {
    const projection = createIsoProjection({ x: 640, y: 96, verticalScale: 0.5 });

    expect(getPlayerDepthSortingPoint(projection, 280, 840)).toEqual({
      x: 300,
      y: 860,
    });
  });

  it('keeps the flat projection bias vertical', () => {
    expect(getPlayerDepthSortingPoint(createFlatProjection(), 280, 840)).toEqual({
      x: 280,
      y: 850,
    });
  });

  it('fires ____ bed foot depth at the reproduced left-corner position', () => {
    const projection = createIsoProjection({ x: 640, y: 96, verticalScale: 0.5 });
    const sortingPoint = getPlayerDepthSortingPoint(projection, 280, 840);
    const overrides = getCollisionZones('recipient-house')!.propDepthOverrides!;
    const lines = getBedDepthLines(overrides, 'bed');

    expect(isPlayerInFrontOfBedDepthLines(lines, 280, 840)).toBe(false);
    expect(isPlayerInFrontOfBedDepthLines(
      lines,
      sortingPoint.x,
      sortingPoint.y,
    )).toBe(true);
  });
});

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

describe('clampDepthBehindLayers', () => {
  it('keeps an already-behind prop at its existing depth', () => {
    expect(clampDepthBehindLayers(400, [500, 520])).toBe(400);
  });

  it('caps a prop behind the rearmost foreground layer', () => {
    expect(clampDepthBehindLayers(560, [500, 520])).toBeCloseTo(499.99);
  });

  it('does nothing when the foreground prop has no rendered layers', () => {
    expect(clampDepthBehindLayers(560, [])).toBe(560);
  });
});
