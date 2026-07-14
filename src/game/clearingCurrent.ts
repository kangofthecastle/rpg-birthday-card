import { mulberry32 } from './rng';

export interface ClearingCurrentItem {
  readonly x: number;
  readonly y: number;
  readonly speedX: number;
  /** The source koi texture faces right, so westbound travel mirrors it. */
  readonly flipX: boolean;
  readonly phase: number;
  readonly scale: number;
}

export interface ClearingMote {
  readonly progress: number;
  readonly speed: number;
  readonly phase: number;
  readonly scale: number;
  /** Centre-weighted position across the loose stream, in the range -1..1. */
  readonly spread: number;
}

export interface ClearingPoint {
  readonly x: number;
  readonly y: number;
}

export interface ClearingMotePath {
  readonly start: ClearingPoint;
  readonly bendIn: ClearingPoint;
  readonly bendOut: ClearingPoint;
  readonly end: ClearingPoint;
}

export interface ClearingCurrentState {
  readonly koi: readonly ClearingCurrentItem[];
  readonly motes: readonly ClearingMote[];
}

export function createClearingMotePath(
  width: number,
  bandTop: number,
  bandHeight: number,
): ClearingMotePath {
  const centreX = width * 0.5;
  return {
    start: { x: -48, y: bandTop + bandHeight * 0.72 },
    bendIn: { x: width * 0.29, y: bandTop + bandHeight * 0.72 },
    bendOut: { x: centreX, y: bandTop - bandHeight * 1.45 },
    end: { x: centreX, y: -48 },
  };
}

const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;

export function sampleClearingMotePath(path: ClearingMotePath, progress: number): ClearingPoint {
  const t = Math.min(1, Math.max(0, progress));
  if (t <= 0.28) {
    const local = t / 0.28;
    return {
      x: lerp(path.start.x, path.bendIn.x, local),
      y: lerp(path.start.y, path.bendIn.y, local),
    };
  }
  if (t <= 0.62) {
    const local = (t - 0.28) / 0.34;
    const control = { x: path.bendIn.x + (path.bendOut.x - path.bendIn.x) * 0.72,
      y: path.bendIn.y };
    const inverse = 1 - local;
    return {
      x: inverse * inverse * path.bendIn.x +
        2 * inverse * local * control.x + local * local * path.bendOut.x,
      y: inverse * inverse * path.bendIn.y +
        2 * inverse * local * control.y + local * local * path.bendOut.y,
    };
  }
  const local = (t - 0.62) / 0.38;
  return {
    x: lerp(path.bendOut.x, path.end.x, local),
    y: lerp(path.bendOut.y, path.end.y, local),
  };
}

/**
 * Samples a mote inside a loose ribbon around the route rather than placing
 * every mote directly on its centreline. The horizontal water leg stays within
 * the shore band; after the bend, the ribbon opens sideways to the same broad,
 * centre-weighted feel as the main-area awakening stream.
 */
export function sampleClearingMoteRibbon(
  path: ClearingMotePath,
  progress: number,
  spread: number,
  width: number,
  bandHeight: number,
): ClearingPoint {
  const point = sampleClearingMotePath(path, progress);
  const before = sampleClearingMotePath(path, Math.max(0, progress - 0.002));
  const after = sampleClearingMotePath(path, Math.min(1, progress + 0.002));
  const tangentX = after.x - before.x;
  const tangentY = after.y - before.y;
  const tangentLength = Math.max(0.001, Math.hypot(tangentX, tangentY));
  const normalX = -tangentY / tangentLength;
  const normalY = tangentX / tangentLength;

  // Keep the incoming lights spread through the water instead of above/below
  // it, then widen them across the clearing as the current turns north.
  const turn = Math.min(1, Math.max(0, (progress - 0.28) / 0.34));
  const waterSpread = bandHeight * 0.34;
  const northSpread = width * 0.2;
  const distance = spread * lerp(waterSpread, northSpread, turn);
  return {
    x: point.x + normalX * distance,
    y: point.y + normalY * distance,
  };
}

export function createClearingCurrent(
  seed: number,
  width: number,
  bandTop: number,
  bandHeight: number,
): ClearingCurrentState {
  const rng = mulberry32(seed);
  const createKoi = (index: number, count: number): ClearingCurrentItem => {
    const x = width * ((index + 0.5) / count) + (rng() - 0.5) * width * 0.08;
    const y = bandTop + bandHeight * (0.2 + rng() * 0.6);
    const speedX = -(8 + rng() * 6);
    return {
      x,
      y,
      speedX,
      flipX: speedX < 0,
      phase: rng() * Math.PI * 2,
      scale: 0.36 + rng() * 0.2,
    };
  };
  const koiCount = 3;
  const moteCount = 68;
  return {
    koi: Array.from({ length: koiCount }, (_unused, index) => createKoi(index, koiCount)),
    motes: Array.from({ length: moteCount }, (_unused, index) => ({
      progress: (index / moteCount + rng() * 0.018) % 1,
      // About 24–45 px/sec over the route: the same unhurried range as the
      // main-area motes, expressed as normalized path progress per second.
      speed: 0.02 + rng() * 0.014,
      phase: rng() * Math.PI * 2,
      scale: 0.7 + rng() * 1.0,
      // Same triangular, centre-weighted distribution used by the main-area
      // ribbon, so most bulbs stay near the flow while some drift wider.
      spread: rng() + rng() - 1,
    })),
  };
}

export function advanceClearingMote(mote: ClearingMote, deltaMs: number): ClearingMote {
  return {
    ...mote,
    progress: (mote.progress + mote.speed * Math.max(0, deltaMs) / 1000) % 1,
  };
}

export function advanceClearingCurrentItem(
  item: ClearingCurrentItem,
  deltaMs: number,
  width: number,
): ClearingCurrentItem {
  const nextX = item.x + item.speedX * Math.max(0, deltaMs) / 1000;
  return {
    ...item,
    x: nextX < -64 ? width + 64 + (Math.abs(nextX) % 32) : nextX,
  };
}
