// Shared deterministic seeded RNG + string hash. Kept framework-free (no Phaser
// imports) so it stays trivially unit-testable and reusable from any layer.
//
// NOTE: the SPLIT.EXE model keeps its own state-threading variant in
// src/activities/valorantSplit/rng.ts (a different, purely-functional API whose
// deterministic tests pin its exact draw sequence); this module is the closure
// form used by the procedural outdoor art and the fold ritual.

/** FNV-1a hash of a string, used to seed per-location/per-component PRNGs. */
export function fnv1a(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Small deterministic PRNG so procedural output is stable across reloads. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
