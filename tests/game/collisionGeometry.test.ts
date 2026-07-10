import { describe, expect, it } from 'vitest';
import {
  pointInPolygon,
  polygonBounds,
  rasterizePolygonsToRects,
  type Polygon,
  type Rect,
} from '../../src/game/collisionGeometry';

const SQUARE: Polygon = [
  [0, 0],
  [80, 0],
  [80, 80],
  [0, 80],
];

// A concave "C" / notched block: an 80x80 square with a rectangular bite taken
// out of its right-middle, so a cell at the notch centre is OUTSIDE.
const CONCAVE: Polygon = [
  [0, 0],
  [80, 0],
  [80, 24],
  [40, 24],
  [40, 56],
  [80, 56],
  [80, 80],
  [0, 80],
];

function totalArea(rects: Rect[]): number {
  return rects.reduce((sum, r) => sum + r.width * r.height, 0);
}

function covers(rects: Rect[], x: number, y: number): boolean {
  return rects.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
}

describe('pointInPolygon', () => {
  it('detects inside and outside points for a square', () => {
    expect(pointInPolygon(40, 40, SQUARE)).toBe(true);
    expect(pointInPolygon(-1, 40, SQUARE)).toBe(false);
    expect(pointInPolygon(100, 40, SQUARE)).toBe(false);
  });

  it('respects the notch of a concave polygon', () => {
    // Left of the notch: inside. Inside the bite: outside.
    expect(pointInPolygon(20, 40, CONCAVE)).toBe(true);
    expect(pointInPolygon(60, 40, CONCAVE)).toBe(false);
    // Above/below the bite the full width is solid.
    expect(pointInPolygon(60, 12, CONCAVE)).toBe(true);
    expect(pointInPolygon(60, 68, CONCAVE)).toBe(true);
  });
});

describe('polygonBounds', () => {
  it('returns the axis-aligned bounding box', () => {
    expect(polygonBounds(CONCAVE)).toEqual({ x: 0, y: 0, width: 80, height: 80 });
  });

  it('returns undefined for an empty polygon', () => {
    expect(polygonBounds([])).toBeUndefined();
  });
});

describe('rasterizePolygonsToRects', () => {
  it('merges a solid square into a single rectangle on an aligned grid', () => {
    const rects = rasterizePolygonsToRects([SQUARE], 8);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual({ x: 0, y: 0, width: 80, height: 80 });
  });

  it('carves the notch out of a concave polygon (area < bbox, notch uncovered)', () => {
    const rects = rasterizePolygonsToRects([CONCAVE], 8);
    // The bite region centre must NOT be covered by any rect.
    expect(covers(rects, 60, 40)).toBe(false);
    // Solid regions are covered.
    expect(covers(rects, 20, 40)).toBe(true);
    expect(covers(rects, 60, 12)).toBe(true);
    // Total area is strictly less than the 80x80 bounding box.
    expect(totalArea(rects)).toBeLessThan(80 * 80);
    expect(totalArea(rects)).toBeGreaterThan(0);
  });

  it('rasterises the union of multiple polygons', () => {
    const other: Polygon = [
      [200, 200],
      [232, 200],
      [232, 232],
      [200, 232],
    ];
    const rects = rasterizePolygonsToRects([SQUARE, other], 8);
    expect(covers(rects, 40, 40)).toBe(true);
    expect(covers(rects, 216, 216)).toBe(true);
    expect(covers(rects, 120, 120)).toBe(false);
  });

  it('ignores degenerate polygons with fewer than three vertices', () => {
    expect(rasterizePolygonsToRects([[[0, 0], [1, 1]]], 8)).toEqual([]);
    expect(rasterizePolygonsToRects([], 8)).toEqual([]);
  });

  it('rejects a non-positive cell size', () => {
    expect(() => rasterizePolygonsToRects([SQUARE], 0)).toThrow();
  });
});
