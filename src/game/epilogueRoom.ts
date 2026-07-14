export interface EpiloguePlacement {
  readonly frame: string;
  readonly mapX: number;
  readonly mapY: number;
}

export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EpilogueBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EpiloguePoint {
  readonly x: number;
  readonly y: number;
}

export interface EpilogueSegment {
  readonly start: EpiloguePoint;
  readonly end: EpiloguePoint;
}

export interface EpilogueQuad {
  readonly topLeft: EpiloguePoint;
  readonly topRight: EpiloguePoint;
  readonly bottomRight: EpiloguePoint;
  readonly bottomLeft: EpiloguePoint;
}

export interface EpiloguePhotoPlacement {
  readonly centerX: number;
  readonly centerY: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly corners: EpilogueQuad;
}

export const EPILOGUE_PHOTO_WALL_SOURCE_SIZE = { width: 358, height: 240 } as const;
export const EPILOGUE_WALL_SHEAR = 0.5;
export const EPILOGUE_PHOTO_MASTER_CROP = { x: 0, y: 1, width: 480, height: 616 } as const;
export const EPILOGUE_SHEARED_PHOTO_TEXTURE_KEY =
  'story-epilogue-boat-photo-wall-sheared';
export const EPILOGUE_HIGH_WINDOW_SOURCE_SIZE = { width: 171, height: 243 } as const;

export const BOAT_PHOTO_FRAME_PIXELS = {
  x: 146,
  y: 52,
  width: 60,
  height: 77,
} as const;

export const BOAT_PHOTO_FRAME: NormalizedRect = {
  x: BOAT_PHOTO_FRAME_PIXELS.x / EPILOGUE_PHOTO_WALL_SOURCE_SIZE.width,
  y: BOAT_PHOTO_FRAME_PIXELS.y / EPILOGUE_PHOTO_WALL_SOURCE_SIZE.height,
  width: BOAT_PHOTO_FRAME_PIXELS.width / EPILOGUE_PHOTO_WALL_SOURCE_SIZE.width,
  height: BOAT_PHOTO_FRAME_PIXELS.height / EPILOGUE_PHOTO_WALL_SOURCE_SIZE.height,
};

export function resolveShearedCanvasSize(
  width: number,
  height: number,
  slope: number,
): { width: number; height: number } {
  return {
    width,
    height: Math.ceil(height + Math.abs(slope) * width),
  };
}

function shearPoint(
  point: EpiloguePoint,
  slope: number,
  sourceWidth: number,
): EpiloguePoint {
  return {
    x: point.x,
    y: point.y + slope * point.x + (slope < 0 ? Math.abs(slope) * sourceWidth : 0),
  };
}

export function resolveEpiloguePhotoPlacement(bounds: EpilogueBounds): EpiloguePhotoPlacement {
  const scale = bounds.width / EPILOGUE_PHOTO_WALL_SOURCE_SIZE.width;
  const frame = BOAT_PHOTO_FRAME_PIXELS;
  const toScreen = (point: EpiloguePoint): EpiloguePoint => ({
    x: bounds.x + point.x * scale,
    y: bounds.y + point.y * scale,
  });
  const corners: EpilogueQuad = {
    topLeft: toScreen(
      shearPoint(
        { x: frame.x, y: frame.y },
        EPILOGUE_WALL_SHEAR,
        EPILOGUE_PHOTO_WALL_SOURCE_SIZE.width,
      ),
    ),
    topRight: toScreen(
      shearPoint(
        { x: frame.x + frame.width, y: frame.y },
        EPILOGUE_WALL_SHEAR,
        EPILOGUE_PHOTO_WALL_SOURCE_SIZE.width,
      ),
    ),
    bottomRight: toScreen(
      shearPoint(
        { x: frame.x + frame.width, y: frame.y + frame.height },
        EPILOGUE_WALL_SHEAR,
        EPILOGUE_PHOTO_WALL_SOURCE_SIZE.width,
      ),
    ),
    bottomLeft: toScreen(
      shearPoint(
        { x: frame.x, y: frame.y + frame.height },
        EPILOGUE_WALL_SHEAR,
        EPILOGUE_PHOTO_WALL_SOURCE_SIZE.width,
      ),
    ),
  };
  const minX = Math.min(...Object.values(corners).map(({ x }) => x));
  const maxX = Math.max(...Object.values(corners).map(({ x }) => x));
  const minY = Math.min(...Object.values(corners).map(({ y }) => y));
  const maxY = Math.max(...Object.values(corners).map(({ y }) => y));
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    displayWidth: maxX - minX,
    displayHeight: maxY - minY,
    corners,
  };
}

export function resolveShearedWindowSill(
  bounds: EpilogueBounds,
  slope: number,
): EpilogueSegment {
  const source = EPILOGUE_HIGH_WINDOW_SOURCE_SIZE;
  const scale = bounds.width / source.width;
  const toScreen = (point: EpiloguePoint): EpiloguePoint => ({
    x: bounds.x + point.x * scale,
    y: bounds.y + point.y * scale,
  });
  const left = shearPoint({ x: source.width * 0.36, y: source.height }, slope, source.width);
  const right = shearPoint({ x: source.width * 0.64, y: source.height }, slope, source.width);
  return { start: toScreen(left), end: toScreen(right) };
}

/** A beam mouth set inside the lower-right glass, not on or beyond the sill. */
export function resolveShearedWindowLightOpening(
  bounds: EpilogueBounds,
  slope: number,
): EpilogueSegment {
  const source = EPILOGUE_HIGH_WINDOW_SOURCE_SIZE;
  const scale = bounds.width / source.width;
  const toScreen = (point: EpiloguePoint): EpiloguePoint => ({
    x: bounds.x + point.x * scale,
    y: bounds.y + point.y * scale,
  });
  const glassY = source.height * 0.58;
  const inner = shearPoint({ x: source.width * 0.44, y: glassY }, slope, source.width);
  const outer = shearPoint({ x: source.width * 0.78, y: glassY }, slope, source.width);
  return { start: toScreen(inner), end: toScreen(outer) };
}

function scaleSegment(segment: EpilogueSegment, amount: number): EpilogueSegment {
  const center = {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };
  const scalePoint = (point: EpiloguePoint): EpiloguePoint => ({
    x: center.x + (point.x - center.x) * amount,
    y: center.y + (point.y - center.y) * amount,
  });
  return { start: scalePoint(segment.start), end: scalePoint(segment.end) };
}

export function resolveEpilogueBeamBands(
  source: EpilogueSegment,
  photoCorners: EpilogueQuad,
): readonly { source: EpilogueSegment; target: EpilogueSegment }[] {
  const target: EpilogueSegment = {
    start: {
      x: (photoCorners.topLeft.x + photoCorners.bottomLeft.x) / 2,
      y: (photoCorners.topLeft.y + photoCorners.bottomLeft.y) / 2,
    },
    end: {
      x: (photoCorners.topRight.x + photoCorners.bottomRight.x) / 2,
      y: (photoCorners.topRight.y + photoCorners.bottomRight.y) / 2,
    },
  };
  return [
    { source: scaleSegment(source, 0.55), target: scaleSegment(target, 2.4) },
    { source: scaleSegment(source, 0.36), target: scaleSegment(target, 1.55) },
    { source: scaleSegment(source, 0.18), target: scaleSegment(target, 0.8) },
  ];
}

export function resolveEpilogueRoomAnchors<T extends EpiloguePlacement>(
  placements: readonly T[],
): {
  readonly desk?: T;
  readonly photoWall?: T;
  readonly highWindow?: T;
  readonly lowWindow?: T;
} {
  const windows = placements
    .filter((placement) => placement.frame === 'window')
    .sort((a, b) => a.mapY - b.mapY);
  return {
    desk: placements.find((placement) => placement.frame === 'desk'),
    photoWall: placements.find((placement) => placement.frame === 'photoWall'),
    highWindow: windows[0],
    lowWindow: windows.at(-1),
  };
}
