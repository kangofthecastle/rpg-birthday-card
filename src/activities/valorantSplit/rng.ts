// Tiny mulberry32-style deterministic RNG, kept fully functional (no hidden
// mutable state) so the SPLIT.EXE model stays pure and unit-testable. The
// generator state is a single uint32; every draw returns the next state.

export function seedRng(seed: number): number {
  return seed >>> 0;
}

export interface RngDraw {
  readonly value: number;
  readonly state: number;
}

export function nextRandom(state: number): RngDraw {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;

  return { value, state: a >>> 0 };
}

export function nextInRange(state: number, min: number, max: number): RngDraw {
  const draw = nextRandom(state);

  return { value: min + draw.value * (max - min), state: draw.state };
}

export interface RngChance {
  readonly hit: boolean;
  readonly state: number;
}

export function rollChance(state: number, chance: number): RngChance {
  const draw = nextRandom(state);

  return { hit: draw.value < chance, state: draw.state };
}
