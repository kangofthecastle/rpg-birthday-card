import { describe, expect, it } from 'vitest';
import {
  createFlatProjection,
  createIsoProjection,
  createProjection,
} from '../../src/game/projection';
import {
  getIsoBounds,
  getIsoRectCorners,
  getIsoTileCorners,
  projectToIso,
  unprojectFromIso,
  type IsoOrigin,
} from '../../src/game/isometricProjection';

const origin: IsoOrigin = { x: 512, y: 80, verticalScale: 0.5 };

describe('createProjection', () => {
  it('selects flat for the flat mode and iso otherwise (default iso)', () => {
    expect(createProjection('flat', origin).mode).toBe('flat');
    expect(createProjection('iso', origin).mode).toBe('iso');
    expect(createProjection(undefined, origin).mode).toBe('iso');
  });
});

describe('iso projection equivalence', () => {
  const projection = createIsoProjection(origin);

  it('matches the standalone iso functions for project/unproject', () => {
    for (const [x, y] of [
      [0, 0],
      [704, 768],
      [-40, 512],
      [1408, 1024],
    ] as const) {
      expect(projection.project(x, y)).toEqual(projectToIso(x, y, origin));
      expect(projection.unproject(x, y)).toEqual(unprojectFromIso(x, y, origin));
    }
  });

  it('matches the standalone iso corner and bounds helpers', () => {
    expect(projection.rectCorners(64, 128, 96, 32)).toEqual(
      getIsoRectCorners(64, 128, 96, 32, origin),
    );
    expect(projection.tileCorners(0, 0, 64)).toEqual(getIsoTileCorners(0, 0, 64, origin));
    expect(projection.bounds(1920, 1152)).toEqual(getIsoBounds(1920, 1152, origin));
  });

  it('exposes the origin for player movement and preserves its vertical scale', () => {
    expect(projection.movementOrigin).toBe(origin);
    expect(projection.verticalScale).toBe(0.5);
  });

  it('inverts a screenY back to mapY at a fixed mapX (depth-line drag)', () => {
    const mapX = 320;
    const mapY = 640;
    const screenY = projectToIso(mapX, mapY, origin).y;
    expect(projection.mapYFromScreenY(mapX, screenY)).toBeCloseTo(mapY, 6);
  });
});

describe('flat projection identity', () => {
  const projection = createFlatProjection();

  it('maps screen coordinates 1:1 to map coordinates both ways', () => {
    for (const [x, y] of [
      [0, 0],
      [704, 768],
      [1920, 1152],
    ] as const) {
      expect(projection.project(x, y)).toEqual({ x, y });
      expect(projection.unproject(x, y)).toEqual({ x, y });
    }
  });

  it('has no movement origin, so input drives the body along map axes', () => {
    expect(projection.movementOrigin).toBeUndefined();
    expect(projection.verticalScale).toBe(1);
  });

  it('produces axis-aligned rect and tile corners (no diamond)', () => {
    expect(projection.rectCorners(10, 20, 100, 40)).toEqual([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 60 },
      { x: 10, y: 60 },
    ]);
    expect(projection.tileCorners(0, 0, 64)).toEqual([
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 64 },
      { x: 0, y: 64 },
    ]);
  });

  it('yields camera bounds equal to exactly the map rect (no iso padding)', () => {
    expect(projection.bounds(1920, 1152)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 1920,
      maxY: 1152,
    });
  });

  it('passes map velocity straight through to screen velocity', () => {
    expect(projection.mapVelocityToScreen(220, -140)).toEqual({ x: 220, y: -140 });
  });

  it('treats screenY as mapY for the depth-line drag', () => {
    expect(projection.mapYFromScreenY(999, 640)).toBe(640);
  });
});
