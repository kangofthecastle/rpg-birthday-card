// Small framework-free numeric helpers shared across game/activity layers.

/** Clamp a value into the inclusive [0, 1] range. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Clamp a value into the inclusive [min, max] range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
