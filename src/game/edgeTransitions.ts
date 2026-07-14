// Edge-to-edge outdoor transitions. Pure geometry so the mapping math is unit
// testable in isolation from Phaser. Outdoor areas connect by walking off a map
// side (no E-press): when the player's physics body reaches within a small
// margin of an OPEN world edge and is inside its centred path corridor, the scene
// swaps to the destination area and re-spawns the player in the matching corridor,
// preserving their proportional position ALONG that opening.

import { clamp01 } from './mathUtils';

export type MapEdge = 'north' | 'south' | 'east' | 'west';

export interface MapDims {
  /** Full map width in pixels. */
  readonly width: number;
  /** Full map height in pixels. */
  readonly height: number;
  /** Tile size in pixels (the border wall is one tile thick). */
  readonly tileSize: number;
}

/** Axis-aligned rectangle (top-left origin), typically a physics body. */
export interface BodyRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How close (px) the body's leading edge must get to a world edge to trigger. */
export const EDGE_TRIGGER_MARGIN = 20;
/** Input-grace after an edge arrival so the player doesn't re-trigger backward. */
export const EDGE_ARRIVAL_COOLDOWN_MS = 400;
/** Tiles inside the destination border where an edge arrival lands. */
export const EDGE_SPAWN_INSET_TILES = 1.5;
/** The path itself plus two path-widths of forgiveness on either side. */
export const EDGE_PORTAL_WIDTH_TILES = 5;

export interface EdgePortalSpan {
  readonly start: number;
  readonly end: number;
}

/** Centred walkable span along an edge, measured in map pixels. */
export function edgePortalSpan(
  edge: MapEdge,
  dims: MapDims,
  widthTiles: number = EDGE_PORTAL_WIDTH_TILES,
): EdgePortalSpan {
  const tangentLength = edge === 'west' || edge === 'east' ? dims.height : dims.width;
  const tangentTiles = Math.max(1, Math.round(tangentLength / dims.tileSize));
  const tileCount = Math.min(tangentTiles, Math.max(1, Math.round(widthTiles)));
  // The procedural path chooses floor(mapSize / 2), which is a concrete tile on
  // even-sized maps rather than the geometric seam between the two middle tiles.
  // Anchor the five-wide opening on that same path tile: path ± two tiles.
  const centerTile = Math.floor(tangentTiles / 2);
  const startTile = Math.max(
    0,
    Math.min(tangentTiles - tileCount, centerTile - Math.floor(tileCount / 2)),
  );
  const start = startTile * dims.tileSize;
  return { start, end: Math.min(tangentLength, (startTile + tileCount) * dims.tileSize) };
}

export function oppositeEdge(edge: MapEdge): MapEdge {
  switch (edge) {
    case 'north':
      return 'south';
    case 'south':
      return 'north';
    case 'east':
      return 'west';
    case 'west':
      return 'east';
  }
}

/**
 * True when the body's edge-facing extent is within `margin` of the given world
 * edge and its centre is inside the path corridor. Only meaningful for edges whose
 * border wall has that same corridor carved open.
 */
export function isBodyAtEdge(
  edge: MapEdge,
  body: BodyRect,
  dims: MapDims,
  margin: number = EDGE_TRIGGER_MARGIN,
  portalWidthTiles: number = EDGE_PORTAL_WIDTH_TILES,
): boolean {
  const atWorldEdge = (() => {
    switch (edge) {
      case 'west':
        return body.x <= margin;
      case 'east':
        return body.x + body.width >= dims.width - margin;
      case 'north':
        return body.y <= margin;
      case 'south':
        return body.y + body.height >= dims.height - margin;
    }
  })();
  if (!atWorldEdge) return false;

  const span = edgePortalSpan(edge, dims, portalWidthTiles);
  const tangentCenter = edge === 'west' || edge === 'east'
    ? body.y + body.height / 2
    : body.x + body.width / 2;
  return tangentCenter >= span.start && tangentCenter <= span.end;
}

/**
 * Proportion (0..1) of the body's center within the path corridor. West/east
 * edges measure down (y); north/south edges measure across (x).
 */
export function edgeProportion(
  edge: MapEdge,
  body: BodyRect,
  dims: MapDims,
  portalWidthTiles: number = EDGE_PORTAL_WIDTH_TILES,
): number {
  const centerX = body.x + body.width / 2;
  const centerY = body.y + body.height / 2;
  const span = edgePortalSpan(edge, dims, portalWidthTiles);
  const width = Math.max(Number.EPSILON, span.end - span.start);

  if (edge === 'west' || edge === 'east') {
    return clamp01((centerY - span.start) / width);
  }

  return clamp01((centerX - span.start) / width);
}

/**
 * Map-space spawn point on `destEdge` at proportion `t` along that edge, placed
 * `insetTiles` tiles inside the border so the arriving player stands clear of
 * the edge (and of the return edge behind them).
 */
export function edgeSpawnPoint(
  destEdge: MapEdge,
  t: number,
  dims: MapDims,
  insetTiles: number = EDGE_SPAWN_INSET_TILES,
  portalWidthTiles: number = EDGE_PORTAL_WIDTH_TILES,
): { x: number; y: number } {
  const depth = dims.tileSize * insetTiles;
  const span = edgePortalSpan(destEdge, dims, portalWidthTiles);
  const along = span.start + clamp01(t) * (span.end - span.start);

  switch (destEdge) {
    case 'west':
      return { x: depth, y: along };
    case 'east':
      return { x: dims.width - depth, y: along };
    case 'north':
      return { x: along, y: depth };
    case 'south':
      return { x: along, y: dims.height - depth };
  }
}
