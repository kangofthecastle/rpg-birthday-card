import { describe, expect, it } from 'vitest';
import {
  getIsoBounds,
  getIsoTileCorners,
  projectScreenDirectionToIsoVelocity,
  projectToIso,
} from '../../src/game/isometricProjection';

describe('isometric projection', () => {
  const origin = { x: 512, y: 80, verticalScale: 0.5 };

  it('projects orthogonal map coordinates into a 2.5D diamond plane', () => {
    expect(projectToIso(0, 0, origin)).toEqual({ x: 512, y: 80 });
    expect(projectToIso(64, 0, origin)).toEqual({ x: 544, y: 96 });
    expect(projectToIso(0, 64, origin)).toEqual({ x: 480, y: 96 });
  });

  it('turns a square tile into a diamond with a top, right, bottom, and left corner', () => {
    expect(getIsoTileCorners(0, 0, 64, origin)).toEqual([
      { x: 512, y: 80 },
      { x: 544, y: 96 },
      { x: 512, y: 112 },
      { x: 480, y: 96 },
    ]);
  });

  it('calculates projected bounds for camera limits', () => {
    expect(getIsoBounds(128, 64, origin)).toEqual({
      minX: 480,
      minY: 80,
      maxX: 576,
      maxY: 128,
    });
  });

  it('converts screen-space player controls into map velocity for cardinal visual movement', () => {
    expect(projectScreenDirectionToIsoVelocity({ x: 1, y: 0 }, origin, 220)).toEqual({
      x: 220,
      y: -220,
    });
    expect(projectScreenDirectionToIsoVelocity({ x: -1, y: 0 }, origin, 220)).toEqual({
      x: -220,
      y: 220,
    });
    expect(projectScreenDirectionToIsoVelocity({ x: 0, y: -1 }, origin, 220)).toEqual({
      x: -440,
      y: -440,
    });
    expect(projectScreenDirectionToIsoVelocity({ x: 0, y: 1 }, origin, 220)).toEqual({
      x: 440,
      y: 440,
    });
  });

  it('keeps diagonal screen-space controls at a consistent visual speed', () => {
    const mapVelocity = projectScreenDirectionToIsoVelocity({ x: 1, y: -1 }, origin, 220);
    const screenVelocity = {
      x: (mapVelocity.x - mapVelocity.y) / 2,
      y: ((mapVelocity.x + mapVelocity.y) * origin.verticalScale) / 2,
    };

    expect(Math.hypot(screenVelocity.x, screenVelocity.y)).toBeCloseTo(220);
  });
});
