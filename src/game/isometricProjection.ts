export interface IsoOrigin {
  readonly x: number;
  readonly y: number;
  readonly verticalScale?: number;
}

export interface IsoPoint {
  readonly x: number;
  readonly y: number;
}

export interface IsoBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function projectToIso(x: number, y: number, origin: IsoOrigin): IsoPoint {
  const verticalScale = origin.verticalScale ?? 0.5;

  return {
    x: (x - y) / 2 + origin.x,
    y: ((x + y) * verticalScale) / 2 + origin.y,
  };
}

export function getIsoTileCorners(
  tileX: number,
  tileY: number,
  tileSize: number,
  origin: IsoOrigin,
): readonly IsoPoint[] {
  return getIsoRectCorners(tileX, tileY, tileSize, tileSize, origin);
}

export function getIsoRectCorners(
  x: number,
  y: number,
  width: number,
  height: number,
  origin: IsoOrigin,
): readonly IsoPoint[] {
  return [
    projectToIso(x, y, origin),
    projectToIso(x + width, y, origin),
    projectToIso(x + width, y + height, origin),
    projectToIso(x, y + height, origin),
  ];
}

export function getIsoBounds(width: number, height: number, origin: IsoOrigin): IsoBounds {
  const corners = getIsoRectCorners(0, 0, width, height, origin);
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}
