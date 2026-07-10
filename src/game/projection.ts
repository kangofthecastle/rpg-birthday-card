// Per-location screen projection. Every LocationScene consumer that maps between
// map (physics) space and screen space goes through a Projection, so a location
// can render either as the 2.5D iso diamond (interiors) or a plain top-down
// orthogonal view (outdoor areas) with the same call sites.
//
// - `iso`  wraps the existing isometricProjection math around a fixed origin.
// - `flat` is the identity: screen coordinates ARE map coordinates. A flat
//   projection has no movement origin, so PlayerController drives the body
//   straight along map axes (no iso velocity skew), and rect/tile corners are
//   axis-aligned instead of diamonds.

import {
  getIsoBounds,
  getIsoRectCorners,
  getIsoTileCorners,
  projectToIso,
  unprojectFromIso,
  type IsoBounds,
  type IsoOrigin,
  type IsoPoint,
} from './isometricProjection';
import type { ProjectionMode } from '../content/types';

export type { ProjectionMode } from '../content/types';
export type ProjectionPoint = IsoPoint;
export type ProjectionBounds = IsoBounds;

export interface Projection {
  readonly mode: ProjectionMode;
  readonly verticalScale: number;
  /**
   * Origin to feed PlayerController.movementProjection. Present for `iso` (so
   * screen-space input skews into iso map velocity); `undefined` for `flat` (so
   * input drives the body straight along map axes).
   */
  readonly movementOrigin?: IsoOrigin;
  /** Map (orthogonal) coordinates -> screen coordinates. */
  project(x: number, y: number): ProjectionPoint;
  /** Screen coordinates -> map (orthogonal) coordinates. Inverse of project. */
  unproject(sx: number, sy: number): ProjectionPoint;
  /** Screen-space corners of a map-space rect (iso parallelogram / flat rect). */
  rectCorners(x: number, y: number, width: number, height: number): readonly ProjectionPoint[];
  /** Screen-space corners of a single square map tile. */
  tileCorners(x: number, y: number, size: number): readonly ProjectionPoint[];
  /** Screen-space bounding box of the whole map rect (for camera limits). */
  bounds(width: number, height: number): ProjectionBounds;
  /** Map-space velocity -> screen-space velocity (drives facing + dust). */
  mapVelocityToScreen(vx: number, vy: number): ProjectionPoint;
  /**
   * The mapY whose projection lands at `screenY` for a fixed `mapX` — used by
   * the zone editor's depth-line drag, which slides a prop's depth along Y.
   */
  mapYFromScreenY(mapX: number, screenY: number): number;
}

export function createIsoProjection(origin: IsoOrigin): Projection {
  const verticalScale = origin.verticalScale ?? 0.5;
  return {
    mode: 'iso',
    verticalScale,
    movementOrigin: origin,
    project: (x, y) => projectToIso(x, y, origin),
    unproject: (sx, sy) => unprojectFromIso(sx, sy, origin),
    rectCorners: (x, y, width, height) => getIsoRectCorners(x, y, width, height, origin),
    tileCorners: (x, y, size) => getIsoTileCorners(x, y, size, origin),
    bounds: (width, height) => getIsoBounds(width, height, origin),
    mapVelocityToScreen: (vx, vy) => ({
      x: (vx - vy) / 2,
      y: ((vx + vy) * verticalScale) / 2,
    }),
    mapYFromScreenY: (mapX, screenY) => (2 * (screenY - origin.y)) / verticalScale - mapX,
  };
}

export function createFlatProjection(): Projection {
  return {
    mode: 'flat',
    verticalScale: 1,
    movementOrigin: undefined,
    project: (x, y) => ({ x, y }),
    unproject: (sx, sy) => ({ x: sx, y: sy }),
    rectCorners: (x, y, width, height) => [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
    tileCorners: (x, y, size) => [
      { x, y },
      { x: x + size, y },
      { x: x + size, y: y + size },
      { x, y: y + size },
    ],
    bounds: (width, height) => ({ minX: 0, minY: 0, maxX: width, maxY: height }),
    mapVelocityToScreen: (vx, vy) => ({ x: vx, y: vy }),
    mapYFromScreenY: (_mapX, screenY) => screenY,
  };
}

export function createProjection(mode: ProjectionMode | undefined, origin: IsoOrigin): Projection {
  return mode === 'flat' ? createFlatProjection() : createIsoProjection(origin);
}
