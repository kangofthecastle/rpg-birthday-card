// Pure geometry helpers for polygon collision zones. These are deliberately
// framework-free (no Phaser) so they can be unit-tested and reused by both the
// runtime collider builder and the in-game zone editor.

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A simple (non-self-intersecting) polygon as a flat list of [x, y] pairs. */
export type Polygon = ReadonlyArray<readonly [number, number]>;

/**
 * Even-odd ray-casting point-in-polygon test. Points exactly on an edge are
 * treated consistently (the standard half-open convention), which is all the
 * rasteriser needs since it samples cell centres, never edges.
 */
export function pointInPolygon(px: number, py: number, polygon: Polygon): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

/** Axis-aligned bounding box of a polygon (or undefined for < 1 vertex). */
export function polygonBounds(polygon: Polygon): Rect | undefined {
  if (polygon.length === 0) {
    return undefined;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Rasterises one or more simple polygons onto a uniform grid, sampling each
 * cell's centre with a point-in-polygon test, then merges filled cells into
 * axis-aligned rectangles. Merging runs in two passes:
 *   1. horizontal runs of filled cells on each row become one rect,
 *   2. vertically-adjacent runs sharing the same x-span and width are merged.
 * The result is a compact set of rects (map-space pixels) that approximates the
 * union of the polygons — ideal for cheap static arcade bodies.
 *
 * Concave polygons work because each cell is tested independently.
 */
export function rasterizePolygonsToRects(
  polygons: readonly Polygon[],
  cellSize: number,
): Rect[] {
  if (cellSize <= 0) {
    throw new Error('cellSize must be positive');
  }

  const filledPolys = polygons.filter((p) => p.length >= 3);
  if (filledPolys.length === 0) {
    return [];
  }

  // Union bounding box across all polygons, snapped to the grid.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of filledPolys) {
    const b = polygonBounds(poly)!;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  const col0 = Math.floor(minX / cellSize);
  const row0 = Math.floor(minY / cellSize);
  const cols = Math.max(0, Math.ceil(maxX / cellSize) - col0);
  const rows = Math.max(0, Math.ceil(maxY / cellSize) - row0);
  if (cols === 0 || rows === 0) {
    return [];
  }

  // Fill grid: a cell is on when its centre lands inside any polygon.
  const grid: boolean[][] = [];
  for (let r = 0; r < rows; r += 1) {
    const rowCells: boolean[] = new Array(cols).fill(false);
    const cy = (row0 + r + 0.5) * cellSize;
    for (let c = 0; c < cols; c += 1) {
      const cx = (col0 + c + 0.5) * cellSize;
      for (const poly of filledPolys) {
        if (pointInPolygon(cx, cy, poly)) {
          rowCells[c] = true;
          break;
        }
      }
    }
    grid.push(rowCells);
  }

  // Pass 1: horizontal runs per row.
  interface Run {
    readonly c0: number;
    readonly c1: number; // exclusive
    r0: number;
    r1: number; // exclusive
  }
  const openRuns: Run[] = []; // runs from the previous row still growing
  const closedRuns: Run[] = [];

  for (let r = 0; r < rows; r += 1) {
    const rowRuns: Run[] = [];
    let c = 0;
    while (c < cols) {
      if (!grid[r][c]) {
        c += 1;
        continue;
      }
      const start = c;
      while (c < cols && grid[r][c]) {
        c += 1;
      }
      rowRuns.push({ c0: start, c1: c, r0: r, r1: r + 1 });
    }

    // Pass 2 (vertical merge): extend a matching open run from the row above,
    // else start a new open run. Non-extended open runs are closed.
    const stillOpen: Run[] = [];
    for (const run of rowRuns) {
      const match = openRuns.find(
        (o) => o.c0 === run.c0 && o.c1 === run.c1 && o.r1 === r,
      );
      if (match) {
        match.r1 = r + 1;
        stillOpen.push(match);
      } else {
        stillOpen.push(run);
      }
    }
    for (const o of openRuns) {
      if (!stillOpen.includes(o)) {
        closedRuns.push(o);
      }
    }
    openRuns.length = 0;
    openRuns.push(...stillOpen);
  }
  closedRuns.push(...openRuns);

  return closedRuns.map((run) => ({
    x: (col0 + run.c0) * cellSize,
    y: (row0 + run.r0) * cellSize,
    width: (run.c1 - run.c0) * cellSize,
    height: (run.r1 - run.r0) * cellSize,
  }));
}
