import { describe, expect, it } from 'vitest';
import {
  EDGE_TRIGGER_MARGIN,
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

    expect(isBodyAtEdge('north', body(500, EDGE_TRIGGER_MARGIN - 1), STD)).toBe(true);
    expect(isBodyAtEdge('south', body(500, STD.height - 40), STD)).toBe(true);
    expect(isBodyAtEdge('south', body(500, 200), STD)).toBe(false);
  });
});

describe('edgeProportion / edgeSpawnPoint round trip', () => {
  it('preserves the position along the edge across differently sized maps', () => {
    // Standing 30% down friendtwo-yard's east edge (vertical: measured by y).
    const inset = STD.tileSize;
    const t = 0.3;
    const y = inset + t * (STD.height - inset * 2);
    const centerY = y; // choose body so its center sits at y
    const b = body(STD.width - 20, centerY - 16);

    const proportion = edgeProportion('east', b, STD);
    expect(proportion).toBeCloseTo(t, 5);

    // Arriving on main-outside's west edge at the same proportion.
    const spawn = edgeSpawnPoint('west', proportion, MAIN);
    const arrivalProportion =
      (spawn.y - MAIN.tileSize) / (MAIN.height - MAIN.tileSize * 2);
    expect(arrivalProportion).toBeCloseTo(t, 5);
    // Landed a fixed inset inside the border, not on the edge.
    expect(spawn.x).toBeGreaterThan(MAIN.tileSize);
    expect(spawn.x).toBeLessThan(MAIN.tileSize * 2);
  });

  it('spawns proportionally along a horizontal edge', () => {
    const spawn = edgeSpawnPoint('north', 0.5, STD);
    expect(spawn.x).toBeCloseTo(STD.width / 2, 5);
    expect(spawn.y).toBeCloseTo(STD.tileSize * 1.5, 5);

    const south = edgeSpawnPoint('south', 0, STD);
    expect(south.x).toBeCloseTo(STD.tileSize, 5);
    expect(south.y).toBeCloseTo(STD.height - STD.tileSize * 1.5, 5);
  });

  it('clamps proportion into 0..1', () => {
    expect(edgeProportion('west', body(10, -9999), STD)).toBe(0);
    expect(edgeProportion('west', body(10, 999999), STD)).toBe(1);
    const spawn = edgeSpawnPoint('east', 5, STD);
    expect(spawn.y).toBeCloseTo(STD.height - STD.tileSize, 5);
  });
});
