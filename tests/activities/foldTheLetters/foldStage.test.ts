import { describe, expect, it } from 'vitest';
import { pointInPolygon, pointNearPolygon } from '../../../src/activities/foldTheLetters/foldStage';

// The on-paper pickup gate (fix a): a fold/roll/kindle only starts when the
// pointer lands ON the current paper silhouette, or within PICK_MARGIN (24 logical
// px) of its edge — so clicking empty background does nothing, but imprecise grabs
// near an edge/corner still take. These guard the geometry the stage feeds the gate.
const MARGIN = 24;

type P = { x: number; y: number };
const rect = (x: number, y: number, w: number, h: number): P[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

// The hull silhouettes in logical px (HULL_CX=320, HULL_CY=182, HULL_H=128).
const SHEET = rect(224, 41.2, 192, 204.8); // sheet: x[224,416] y[41.2,246]
const PEAK: P[] = [
  { x: 320, y: 143.6 }, // apex
  { x: 416, y: 239.6 }, // right shoulder
  { x: 416, y: 246 },
  { x: 224, y: 246 },
  { x: 224, y: 239.6 }, // left shoulder
];
const SAIL_SHEET = rect(176, 92, 288, 190);
const LANTERN_PAGE = rect(190, 95, 260, 150); // centre (320,170), 260x150

describe('pointInPolygon', () => {
  it('is true for an interior point and false for an exterior one', () => {
    expect(pointInPolygon({ x: 320, y: 200 }, PEAK)).toBe(true);
    expect(pointInPolygon({ x: 320, y: 100 }, PEAK)).toBe(false); // above the apex
    expect(pointInPolygon({ x: 60, y: 60 }, SHEET)).toBe(false);
  });
});

describe('pointNearPolygon — on-paper fold pickup', () => {
  it('accepts a grab in the middle of the paper', () => {
    expect(pointNearPolygon({ x: 326, y: 70 }, SHEET, MARGIN)).toBe(true); // fold-1 grab
    expect(pointNearPolygon({ x: 320, y: 200 }, PEAK, MARGIN)).toBe(true);
  });

  it('accepts an imprecise grab just off an edge (within the margin)', () => {
    // The open-fold smoke starts its pull at (248,183) — ~23px off the peak's left
    // slanted edge. It must register as an on-paper grab.
    expect(pointNearPolygon({ x: 248, y: 183 }, PEAK, MARGIN)).toBe(true);
  });

  it('rejects a click on empty background far from the paper', () => {
    expect(pointNearPolygon({ x: 120, y: 183 }, SHEET, MARGIN)).toBe(false);
    expect(pointNearPolygon({ x: 500, y: 350 }, SHEET, MARGIN)).toBe(false);
    expect(pointNearPolygon({ x: 60, y: 60 }, PEAK, MARGIN)).toBe(false);
  });

  it('gates the sail-fold sheet and the lantern page the same way', () => {
    expect(pointNearPolygon({ x: 320, y: 183 }, SAIL_SHEET, MARGIN)).toBe(true);
    expect(pointNearPolygon({ x: 20, y: 20 }, SAIL_SHEET, MARGIN)).toBe(false);
    // Smoke roll (circle start ~381,183) and kindle (326,183) land on the page.
    expect(pointNearPolygon({ x: 381, y: 183 }, LANTERN_PAGE, MARGIN)).toBe(true);
    expect(pointNearPolygon({ x: 326, y: 183 }, LANTERN_PAGE, MARGIN)).toBe(true);
    expect(pointNearPolygon({ x: 100, y: 380 }, LANTERN_PAGE, MARGIN)).toBe(false);
  });
});
