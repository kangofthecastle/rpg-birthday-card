// Edge-to-edge outdoor transitions. Pure geometry so the mapping math is unit
// testable in isolation from Phaser. Outdoor areas connect by walking off a map
// side (no E-press): when the player's physics body reaches within a small
// margin of an OPEN world edge that carries an edge exit, the scene swaps to the
// destination area and re-spawns the player on the destination's opposite edge,
// preserving their proportional position ALONG that edge.

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
 * edge — i.e. the player has walked off the open side. Only meaningful for edges
 * whose border wall has been opened (otherwise the wall stops the body short).
 */
export function isBodyAtEdge(
  edge: MapEdge,
  body: BodyRect,
  dims: MapDims,
  margin: number = EDGE_TRIGGER_MARGIN,
): boolean {
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
}

/**
 * Proportion (0..1) of the body's center along the tangent of `edge`, measured
 * across the walkable span (one tile inset from each corner). West/east edges
 * measure down (y); north/south edges measure across (x).
 */
export function edgeProportion(edge: MapEdge, body: BodyRect, dims: MapDims): number {
  const inset = dims.tileSize;
  const centerX = body.x + body.width / 2;
  const centerY = body.y + body.height / 2;

  if (edge === 'west' || edge === 'east') {
    return clamp01((centerY - inset) / (dims.height - inset * 2));
  }

  return clamp01((centerX - inset) / (dims.width - inset * 2));
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
): { x: number; y: number } {
  const inset = dims.tileSize;
  const depth = dims.tileSize * insetTiles;
  const alongX = inset + clamp01(t) * (dims.width - inset * 2);
  const alongY = inset + clamp01(t) * (dims.height - inset * 2);

  switch (destEdge) {
    case 'west':
      return { x: depth, y: alongY };
    case 'east':
      return { x: dims.width - depth, y: alongY };
    case 'north':
      return { x: alongX, y: depth };
    case 'south':
      return { x: alongX, y: dims.height - depth };
  }
}
