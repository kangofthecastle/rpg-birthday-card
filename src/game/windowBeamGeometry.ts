import type { PropPlacement } from '../content/roomDressing';
import { projectToIso, type IsoOrigin, type IsoPoint } from './isometricProjection';

/** Shared opening used by every beam emitted from a room window. */
export function resolveWindowBeamSource(
  windowProp: Pick<PropPlacement, 'mapX' | 'mapY' | 'wallShear'>,
  wallHeight: number,
  origin: IsoOrigin,
): { center: IsoPoint; slope: number } {
  const wallBase = projectToIso(windowProp.mapX, windowProp.mapY, origin);
  return {
    center: { x: wallBase.x, y: wallBase.y - wallHeight * 0.62 },
    slope: windowProp.wallShear ?? 0,
  };
}

/** Converts the shared centre/slope into a beam mouth of the requested width. */
export function resolveWindowBeamMouth(
  center: IsoPoint,
  halfWidth: number,
  slope = 0,
): { start: IsoPoint; end: IsoPoint } {
  return {
    start: { x: center.x - halfWidth, y: center.y - slope * halfWidth },
    end: { x: center.x + halfWidth, y: center.y + slope * halfWidth },
  };
}

/** A sheared source mouth widening into a horizontal floor landing. */
export function beamTrapezoid(
  source: IsoPoint,
  land: IsoPoint,
  topHalfWidth: number,
  botHalfWidth: number,
  sourceSlope = 0,
): IsoPoint[] {
  const mouth = resolveWindowBeamMouth(source, topHalfWidth, sourceSlope);
  return [
    mouth.start,
    mouth.end,
    { x: land.x + botHalfWidth, y: land.y },
    { x: land.x - botHalfWidth, y: land.y },
  ];
}
