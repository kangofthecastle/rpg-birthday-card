import { describe, expect, it } from 'vitest';
import {
  EDGE_PORTAL_WIDTH_TILES,
  EDGE_TRIGGER_MARGIN,
  edgePortalSpan,
  edgeProportion,
  edgeSpawnPoint,
  isBodyAtEdge,
  oppositeEdge,
  type BodyRect,
  type MapDims,
} from '../../src/game/edgeTransitions';

// main-outside is 30x18 tiles, the standard areas 22x16, all 64px tiles.
const MAIN: MapDims = { width: 30 * 64, height: 18 * 64, tileSize: 64 };
const STD: MapDims = { width: 22 * 64, height: 16 * 64, tileSize: 64 };

function body(x: number, y: number, w = 36, h = 32): BodyRect {
  return { x, y, width: w, height: h };
}

describe('oppositeEdge', () => {
  it('pairs the four sides', () => {
    expect(oppositeEdge('north')).toBe('south');
    expect(oppositeEdge('south')).toBe('north');
    expect(oppositeEdge('east')).toBe('west');
    expect(oppositeEdge('west')).toBe('east');
  });
});

describe('isBodyAtEdge', () => {
  it('fires only within the trigger margin of the matching world edge', () => {
    expect(isBodyAtEdge('west', body(EDGE_TRIGGER_MARGIN - 1, 500), STD)).toBe(true);
    expect(isBodyAtEdge('west', body(EDGE_TRIGGER_MARGIN + 40, 500), STD)).toBe(false);

    const rightX = STD.width - EDGE_TRIGGER_MARGIN - 36 + 20;
    expect(isBodyAtEdge('east', body(rightX, 500), STD)).toBe(true);
    expect(isBodyAtEdge('east', body(200, 500), STD)).toBe(false);

    expect(isBodyAtEdge('north', body(700, EDGE_TRIGGER_MARGIN - 1), STD)).toBe(true);
    expect(isBodyAtEdge('south', body(700, STD.height - 40), STD)).toBe(true);
    expect(isBodyAtEdge('south', body(700, 200), STD)).toBe(false);
  });

  it('does not fire at the world edge outside the centred path corridor', () => {
    expect(isBodyAtEdge('north', body(200, 0), STD)).toBe(false);
    expect(isBodyAtEdge('west', body(0, 100), STD)).toBe(false);
  });
});

describe('edgePortalSpan', () => {
  it('uses the path tile plus two complete tiles on either side', () => {
    const horizontal = edgePortalSpan('north', STD);
    const vertical = edgePortalSpan('west', STD);

    expect(horizontal.end - horizontal.start).toBe(EDGE_PORTAL_WIDTH_TILES * STD.tileSize);
    expect(vertical.end - vertical.start).toBe(EDGE_PORTAL_WIDTH_TILES * STD.tileSize);
    // Even tile counts anchor on floor(count / 2), matching the rendered path cell.
    expect(horizontal).toEqual({ start: 9 * 64, end: 14 * 64 });
    expect(vertical).toEqual({ start: 6 * 64, end: 11 * 64 });
  });
});

describe('edgeProportion / edgeSpawnPoint round trip', () => {
  it('preserves the position along the edge across differently sized maps', () => {
    // Standing 30% down friendtwo-yard's east edge (vertical: measured by y).
    const sourceSpan = edgePortalSpan('east', STD);
    const t = 0.3;
    const y = sourceSpan.start + t * (sourceSpan.end - sourceSpan.start);
    const centerY = y; // choose body so its center sits at y
    const b = body(STD.width - 20, centerY - 16);

    const proportion = edgeProportion('east', b, STD);
    expect(proportion).toBeCloseTo(t, 5);

    // Arriving on main-outside's west edge at the same proportion.
    const spawn = edgeSpawnPoint('west', proportion, MAIN);
    const destinationSpan = edgePortalSpan('west', MAIN);
    const arrivalProportion = (spawn.y - destinationSpan.start) /
      (destinationSpan.end - destinationSpan.start);
    expect(arrivalProportion).toBeCloseTo(t, 5);
    // Landed a fixed inset inside the border, not on the edge.
    expect(spawn.x).toBeGreaterThan(MAIN.tileSize);
    expect(spawn.x).toBeLessThan(MAIN.tileSize * 2);
  });

  it('spawns proportionally along a horizontal edge', () => {
    const span = edgePortalSpan('north', STD);
    const spawn = edgeSpawnPoint('north', 0.5, STD);
    expect(spawn.x).toBeCloseTo((span.start + span.end) / 2, 5);
    expect(spawn.y).toBeCloseTo(STD.tileSize * 1.5, 5);

    const south = edgeSpawnPoint('south', 0, STD);
    expect(south.x).toBeCloseTo(span.start, 5);
    expect(south.y).toBeCloseTo(STD.height - STD.tileSize * 1.5, 5);
  });

  it('clamps proportion into 0..1', () => {
    expect(edgeProportion('west', body(10, -9999), STD)).toBe(0);
    expect(edgeProportion('west', body(10, 999999), STD)).toBe(1);
    const spawn = edgeSpawnPoint('east', 5, STD);
    expect(spawn.y).toBeCloseTo(edgePortalSpan('east', STD).end, 5);
  });
});
