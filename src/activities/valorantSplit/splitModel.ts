import { rollChance, seedRng } from './rng';
import { clamp } from '../../game/mathUtils';

// ---------------------------------------------------------------------------
// RETAKE.EXE pure model
//
// A deterministic, Phaser-free simulation of a top-down retro shooter homage to
// Valorant's Split B site — reframed as a *retake*: the spike is already planted
// and ticking from frame one, and ____'s squad has to fight onto the site and
// defuse it under fire before the timer hits zero. Everything here is unit-
// testable: entity movement, hitscan shot resolution (head vs body hitboxes),
// enemy/teammate AI, player hearts + revive, timed reinforcements, the live
// spike timer, the contest-able hold-to-defuse, and the no-fail detonation
// reset. The Phaser scene renders this state and feeds it input; it owns no
// game rules of its own.
//
// All sizes, keys, and tuning live in SPLIT_CONFIG so art/tuning can be swapped
// without touching logic.
// ---------------------------------------------------------------------------

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const SPLIT_CONFIG = {
  // The canvas is arena.width x arena.height; the playable box is that rect
  // inset by wallThickness and shifted by arena.x/y. The numbers mirror the
  // painted floor of arena-floor.png (1280x720 art at an exact 0.75 scale):
  // playable x [120, 860], y [122, 442] — left wall band 120, right 100, top
  // 122 (the Heaven walkway), bottom 98 (movement stops at the hazard stripes).
  arena: { x: 10, y: 12, width: 960, height: 540 },
  wallThickness: 110,
  player: {
    width: 26,
    height: 34,
    speed: 158,
    maxHearts: 4,
    shotCooldownMs: 180,
    reviveInvulnMs: 2000,
  },
  teammate: {
    width: 26,
    height: 34,
    speed: 138,
    followDistance: 128,
    fireCooldownMs: 620,
    range: 540,
  },
  enemy: {
    width: 26,
    height: 34,
    headFraction: 0.22,
    bodyHp: 4,
    speed: 62,
    advanceMs: 850,
    pauseMs: 280,
    telegraphMs: 300,
    hitChance: 0.38,
    range: 560,
    // While advancing, each bot weaves side-to-side (perpendicular to its
    // approach vector) so it's harder to line up a clean headshot. This is a
    // pure deterministic sway from elapsed time + the bot's id — no RNG. Peak
    // perpendicular speed in px/s and the full weave period in ms.
    strafeSpeed: 48,
    strafePeriodMs: 500,
  },
  revive: { holdFireMs: 2000 },
  // The spike is live from the first frame. spikeTimerMs is the total fuse; a
  // clean run defuses (7s of hold) with well over ten seconds to spare.
  spikeTimerMs: 60000,
  defuse: {
    totalMs: 7000,
    checkpointMs: 3500,
    // ____ must stand within this radius of the spike (centre-to-centre) to
    // make defuse progress.
    radius: 74,
    // No slow drain: the moment ____ stops actively defusing (releases E,
    // leaves the radius, or takes a hit) progress SNAPS instantly back to the
    // last banked checkpoint — the half-mark once reached, otherwise zero.
  },
  // When the fuse hits zero the round soft-resets. This is the "RUN IT BACK."
  // beat: screen flash/shake, then a fresh round. No keepsake loss, no exit.
  detonation: { holdMs: 1500 },
  // The spike sits on the painted "B" site stencil at the arena center.
  spike: { x: 480, y: 290, size: 26 },
  playerStart: { x: 480, y: 415 },
  teammateStart: { x: 426, y: 422 },
  // Timed reinforcements: the first group is live at spawn; one more wave bleeds
  // in mid-round so there's never a long dead stretch. Capped at FIVE bots total
  // (3 + 2, no third wave) — the bots are individually meaner instead. Killing
  // every bot is NOT the win condition — completing the defuse under fire is.
  reinforcements: [
    {
      atElapsedMs: 0,
      spawns: [
        { x: 300, y: 150 },
        { x: 480, y: 140 },
        { x: 660, y: 150 },
      ],
    },
    {
      // ~T-35s (35s left on a 60s fuse).
      atElapsedMs: 25000,
      spawns: [
        { x: 372, y: 150 },
        { x: 588, y: 150 },
      ],
    },
  ] as const,
  // Collision footprints for the five props in props.png (see splitArt.ts):
  // crate cluster, long platform barrier, double stack, low crate, lantern.
  cover: [
    { x: 252, y: 225, width: 110, height: 74 },
    { x: 405, y: 190, width: 150, height: 44 },
    { x: 635, y: 228, width: 58, height: 64 },
    { x: 488, y: 334, width: 64, height: 52 },
    { x: 305, y: 344, width: 56, height: 46 },
  ] as const,
  // Placeholder-art texture keys, kept in one place so real art swaps in later.
  textures: {
    floor: 'split-floor',
    wall: 'split-wall',
    cover: 'split-cover',
    player: 'split-viper',
    teammate: 'split-omen',
    enemy: 'split-bot',
    spike: 'split-spike',
    crosshair: 'split-crosshair',
  },
} as const;

const MAX_STEP_MS = 50;

export type SplitPhase = 'retake' | 'won' | 'detonated';

export type EnemyAiState = 'advancing' | 'pausing' | 'telegraphing';

export interface PlayerState {
  readonly pos: Vec2;
  readonly hearts: number;
  readonly invulnMs: number;
  readonly shotCooldownMs: number;
  readonly reviving: boolean;
}

export interface TeammateState {
  readonly pos: Vec2;
  readonly fireCooldownMs: number;
}

export interface EnemyState {
  readonly id: number;
  readonly pos: Vec2;
  readonly bodyHp: number;
  readonly alive: boolean;
  readonly ai: EnemyAiState;
  readonly stateTimerMs: number;
  readonly wave: number;
}

export interface DefuseState {
  readonly progressMs: number;
  readonly checkpointReached: boolean;
  // True on ticks where ____ is actively advancing the defuse (in-radius,
  // holding E, not reviving). Drives the scene's defuse-tick SFX.
  readonly defusing: boolean;
}

export type SplitEvent =
  | {
      readonly type: 'player-shot';
      readonly from: Vec2;
      readonly to: Vec2;
      readonly hitEnemyId: number | null;
      readonly headshot: boolean;
      readonly killed: boolean;
    }
  | {
      readonly type: 'teammate-shot';
      readonly from: Vec2;
      readonly to: Vec2;
      readonly hitEnemyId: number | null;
    }
  | {
      readonly type: 'enemy-shot';
      readonly from: Vec2;
      readonly to: Vec2;
      readonly enemyId: number;
      readonly hit: boolean;
    }
  | { readonly type: 'heart-lost'; readonly hearts: number }
  | { readonly type: 'revive' }
  | { readonly type: 'first-blood' }
  | {
      readonly type: 'enemy-killed';
      readonly enemyId: number;
      readonly by: 'player' | 'teammate';
    }
  | { readonly type: 'reinforcement'; readonly index: number; readonly count: number }
  // ____ was knocked off the defuse by taking a hit (progress fell to the
  // last checkpoint).
  | { readonly type: 'defuse-interrupted' }
  | { readonly type: 'defuse-checkpoint' }
  | { readonly type: 'defuse-complete' }
  // Fuse hit zero: begin the detonation overlay.
  | { readonly type: 'detonated'; readonly attempt: number }
  // Detonation overlay finished; a fresh round is now live.
  | { readonly type: 'round-reset'; readonly attempt: number };

export interface SplitState {
  readonly phase: SplitPhase;
  readonly elapsedMs: number;
  // Remaining fuse on the planted spike, in ms. Counts down during 'retake'.
  readonly spikeTimerMs: number;
  // Countdown for the detonation overlay while phase === 'detonated'.
  readonly detonationMs: number;
  // How many times the fuse has run out (0 on the first attempt). Purely for
  // flavor/bark text — failure never ends the game.
  readonly attempt: number;
  readonly rngState: number;
  readonly player: PlayerState;
  readonly teammate: TeammateState;
  readonly enemies: readonly EnemyState[];
  // How many reinforcement groups have spawned so far.
  readonly reinforcementsSpawned: number;
  readonly holdFireMs: number;
  readonly firstBloodDone: boolean;
  readonly defuse: DefuseState;
  readonly events: readonly SplitEvent[];
}

export interface SplitInput {
  readonly move: Vec2;
  readonly aimAngle: number;
  readonly fire: boolean;
  readonly holdDefuse: boolean;
}

export interface ShotResult {
  readonly fired: boolean;
  readonly hitEnemyId: number | null;
  readonly headshot: boolean;
  readonly killed: boolean;
  readonly from: Vec2;
  readonly to: Vec2;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createSplitState(seed = 1): SplitState {
  return freshRound(seedRng(seed), 0, []);
}

// Builds a live retake round from an existing RNG state (so a detonation reset
// deterministically continues the sequence rather than re-seeding). `events`
// seeds the new state's event list — used to carry the round-reset bark across
// the reset tick.
function freshRound(
  rngState: number,
  attempt: number,
  events: readonly SplitEvent[],
): SplitState {
  return {
    phase: 'retake',
    elapsedMs: 0,
    spikeTimerMs: SPLIT_CONFIG.spikeTimerMs,
    detonationMs: 0,
    attempt,
    rngState,
    player: {
      pos: SPLIT_CONFIG.playerStart,
      hearts: SPLIT_CONFIG.player.maxHearts,
      invulnMs: 0,
      shotCooldownMs: 0,
      reviving: false,
    },
    teammate: {
      pos: SPLIT_CONFIG.teammateStart,
      fireCooldownMs: SPLIT_CONFIG.teammate.fireCooldownMs,
    },
    enemies: spawnReinforcement(0, 0),
    reinforcementsSpawned: 1,
    holdFireMs: 0,
    firstBloodDone: false,
    defuse: { progressMs: 0, checkpointReached: false, defusing: false },
    events,
  };
}

function spawnReinforcement(reinforcementIndex: number, idOffset: number): EnemyState[] {
  const { spawns } = SPLIT_CONFIG.reinforcements[reinforcementIndex];

  return spawns.map((pos, index) => ({
    id: idOffset + index,
    pos,
    bodyHp: SPLIT_CONFIG.enemy.bodyHp,
    alive: true,
    ai: 'advancing' as EnemyAiState,
    stateTimerMs: SPLIT_CONFIG.enemy.advanceMs,
    wave: reinforcementIndex,
  }));
}

// ---------------------------------------------------------------------------
// Hitbox helpers (exported for the scene renderer)
// ---------------------------------------------------------------------------

export function centeredRect(pos: Vec2, width: number, height: number): Rect {
  return { x: pos.x - width / 2, y: pos.y - height / 2, width, height };
}

export function playerRect(player: PlayerState): Rect {
  return centeredRect(player.pos, SPLIT_CONFIG.player.width, SPLIT_CONFIG.player.height);
}

export function teammateRect(teammate: TeammateState): Rect {
  return centeredRect(teammate.pos, SPLIT_CONFIG.teammate.width, SPLIT_CONFIG.teammate.height);
}

export function enemyRect(enemy: EnemyState): Rect {
  return centeredRect(enemy.pos, SPLIT_CONFIG.enemy.width, SPLIT_CONFIG.enemy.height);
}

export function enemyHeadRect(enemy: EnemyState): Rect {
  const body = enemyRect(enemy);

  return {
    x: body.x,
    y: body.y,
    width: body.width,
    height: body.height * SPLIT_CONFIG.enemy.headFraction,
  };
}

export function spikeRect(): Rect {
  const { x, y, size } = SPLIT_CONFIG.spike;

  return centeredRect({ x, y }, size, size);
}

// ---------------------------------------------------------------------------
// Geometry: ray/rect intersection + line of sight
// ---------------------------------------------------------------------------

export interface RayHit {
  readonly t: number;
  readonly point: Vec2;
}

// Slab method for ray/AABB intersection. Each axis is handled explicitly so a
// zero direction component never produces `0 * Infinity = NaN` (which slips
// through `tmin > tmax` — NaN comparisons are always false — and yields phantom
// hits or, worse, silently ignored cover for a ray that grazes a rect's exact
// edge). A ray parallel to an axis simply misses unless its origin lies within
// that slab. Exported for unit testing.
export function rayRect(origin: Vec2, dir: Vec2, rect: Rect): RayHit | null {
  const EPS = 1e-9;
  const minX = rect.x;
  const maxX = rect.x + rect.width;
  const minY = rect.y;
  const maxY = rect.y + rect.height;

  let tmin = Number.NEGATIVE_INFINITY;
  let tmax = Number.POSITIVE_INFINITY;

  // X slab.
  if (Math.abs(dir.x) < EPS) {
    if (origin.x < minX || origin.x > maxX) {
      return null;
    }
  } else {
    const invDx = 1 / dir.x;
    let tx1 = (minX - origin.x) * invDx;
    let tx2 = (maxX - origin.x) * invDx;
    if (tx1 > tx2) {
      [tx1, tx2] = [tx2, tx1];
    }
    tmin = Math.max(tmin, tx1);
    tmax = Math.min(tmax, tx2);
  }

  // Y slab.
  if (Math.abs(dir.y) < EPS) {
    if (origin.y < minY || origin.y > maxY) {
      return null;
    }
  } else {
    const invDy = 1 / dir.y;
    let ty1 = (minY - origin.y) * invDy;
    let ty2 = (maxY - origin.y) * invDy;
    if (ty1 > ty2) {
      [ty1, ty2] = [ty2, ty1];
    }
    tmin = Math.max(tmin, ty1);
    tmax = Math.min(tmax, ty2);
  }

  if (tmax < 0 || tmin > tmax) {
    return null;
  }

  const t = tmin >= 0 ? tmin : tmax;

  if (t < 0) {
    return null;
  }

  return { t, point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t } };
}

function nearestCoverT(origin: Vec2, dir: Vec2): number {
  let nearest = Number.POSITIVE_INFINITY;

  for (const rect of SPLIT_CONFIG.cover) {
    const hit = rayRect(origin, dir, rect);

    if (hit && hit.t < nearest) {
      nearest = hit.t;
    }
  }

  return nearest;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleToDir(angle: number): Vec2 {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function hasLineOfSight(from: Vec2, to: Vec2): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);

  if (dist === 0) {
    return true;
  }

  const dir = { x: dx / dist, y: dy / dist };

  return nearestCoverT(from, dir) >= dist;
}

// ---------------------------------------------------------------------------
// Shot resolution
// ---------------------------------------------------------------------------

// Resolve a player hitscan shot at the given aim angle. Headshots (top
// headFraction band of an enemy body) instantly kill; body shots take
// SPLIT_CONFIG.enemy.bodyHp hits. Cover blocks the shot. This is pure and
// ignores the shot cooldown (tickSplit gates the cadence).
export function firePlayerShot(
  state: SplitState,
  aimAngle: number,
): { state: SplitState; result: ShotResult } {
  const origin = state.player.pos;
  const dir = angleToDir(aimAngle);
  const coverT = nearestCoverT(origin, dir);
  const range = SPLIT_CONFIG.enemy.range;

  let bestIndex = -1;
  let bestT = Number.POSITIVE_INFINITY;
  let bestPoint: Vec2 | null = null;

  state.enemies.forEach((enemy, index) => {
    if (!enemy.alive) {
      return;
    }

    const hit = rayRect(origin, dir, enemyRect(enemy));

    if (!hit || hit.t > range || hit.t >= coverT || hit.t >= bestT) {
      return;
    }

    bestIndex = index;
    bestT = hit.t;
    bestPoint = hit.point;
  });

  const endT = Math.min(range, coverT);
  const fallbackTo = { x: origin.x + dir.x * endT, y: origin.y + dir.y * endT };

  if (bestIndex < 0 || !bestPoint) {
    const result: ShotResult = {
      fired: true,
      hitEnemyId: null,
      headshot: false,
      killed: false,
      from: origin,
      to: fallbackTo,
    };

    return { state: pushEvent(state, { type: 'player-shot', from: origin, to: fallbackTo, hitEnemyId: null, headshot: false, killed: false }), result };
  }

  const enemy = state.enemies[bestIndex];
  const head = enemyHeadRect(enemy);
  const point: Vec2 = bestPoint;
  const headshot = point.y <= head.y + head.height;
  const nextHp = headshot ? 0 : enemy.bodyHp - 1;
  const killed = headshot || nextHp <= 0;

  let next = updateEnemy(state, bestIndex, {
    bodyHp: Math.max(0, nextHp),
    alive: !killed,
  });

  next = pushEvent(next, {
    type: 'player-shot',
    from: origin,
    to: point,
    hitEnemyId: enemy.id,
    headshot,
    killed,
  });

  if (killed) {
    next = registerKill(next, enemy.id, 'player');
  }

  const result: ShotResult = {
    fired: true,
    hitEnemyId: enemy.id,
    headshot,
    killed,
    from: origin,
    to: point,
  };

  return { state: next, result };
}

// Teammate (____/Omen) auto-fire: body shots only at the nearest visible
// enemy. He *softens* targets and never lands the killing blow — enemy body HP
// floors at 1 from teammate fire, so ____ always gets the kills.
export function fireTeammateShot(state: SplitState): {
  state: SplitState;
  result: { fired: boolean; hitEnemyId: number | null };
} {
  const origin = state.teammate.pos;
  let bestIndex = -1;
  let bestDist = Number.POSITIVE_INFINITY;

  state.enemies.forEach((enemy, index) => {
    if (!enemy.alive) {
      return;
    }

    const dist = distance(origin, enemy.pos);

    if (dist > SPLIT_CONFIG.teammate.range || dist >= bestDist) {
      return;
    }

    if (!hasLineOfSight(origin, enemy.pos)) {
      return;
    }

    bestIndex = index;
    bestDist = dist;
  });

  if (bestIndex < 0) {
    return { state, result: { fired: false, hitEnemyId: null } };
  }

  const enemy = state.enemies[bestIndex];
  const softenedHp = Math.max(1, enemy.bodyHp - 1);

  let next = updateEnemy(state, bestIndex, { bodyHp: softenedHp });

  next = pushEvent(next, {
    type: 'teammate-shot',
    from: origin,
    to: enemy.pos,
    hitEnemyId: enemy.id,
  });

  return { state: next, result: { fired: true, hitEnemyId: enemy.id } };
}

// Apply a single body hit to ____. Body only — one heart. Respects the revive
// invulnerability window. At zero hearts there is no fail: she revives on site
// with full hearts, brief invulnerability, and the bots hold fire. Any landed
// hit also knocks her off the defuse (progress falls to the last checkpoint).
export function damagePlayer(state: SplitState): SplitState {
  if (state.player.invulnMs > 0) {
    return state;
  }

  const hearts = state.player.hearts - 1;

  if (hearts <= 0) {
    const revived: SplitState = knockOffDefuse({
      ...state,
      player: {
        ...state.player,
        hearts: SPLIT_CONFIG.player.maxHearts,
        invulnMs: SPLIT_CONFIG.player.reviveInvulnMs,
        reviving: true,
      },
      holdFireMs: Math.max(state.holdFireMs, SPLIT_CONFIG.revive.holdFireMs),
    });

    return pushEvent(revived, { type: 'revive' });
  }

  const damaged: SplitState = knockOffDefuse({
    ...state,
    player: { ...state.player, hearts },
  });

  return pushEvent(damaged, { type: 'heart-lost', hearts });
}

// Knock ____ off the defuse: progress drops to the last checkpoint (0 if the
// half-checkpoint hasn't been reached yet). Emits 'defuse-interrupted' only if
// progress was actually above the floor.
function knockOffDefuse(state: SplitState): SplitState {
  const floor = state.defuse.checkpointReached ? SPLIT_CONFIG.defuse.checkpointMs : 0;

  if (state.defuse.progressMs <= floor) {
    return state;
  }

  const knocked: SplitState = {
    ...state,
    defuse: { ...state.defuse, progressMs: floor, defusing: false },
  };

  return pushEvent(knocked, { type: 'defuse-interrupted' });
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

export function tickSplit(state: SplitState, input: SplitInput, deltaMs: number): SplitState {
  let next: SplitState = { ...state, events: [] };

  // Player shot resolves once per tick (edge-triggered click), gated by cadence.
  if (
    input.fire &&
    next.phase === 'retake' &&
    next.player.shotCooldownMs <= 0 &&
    !next.player.reviving
  ) {
    const shot = firePlayerShot(next, input.aimAngle);
    next = {
      ...shot.state,
      player: { ...shot.state.player, shotCooldownMs: SPLIT_CONFIG.player.shotCooldownMs },
    };
  }

  let remaining = Math.max(0, deltaMs);

  do {
    const step = Math.min(MAX_STEP_MS, remaining);
    const before = next.phase;
    next = stepSplit(next, input, step);
    remaining -= step;

    // A detonation soft-reset is a frame boundary: the fresh round starts on
    // the next tick, not on this tick's leftover sub-steps.
    if (before === 'detonated' && next.phase === 'retake') {
      break;
    }
  } while (remaining > 0);

  return next;
}

function stepSplit(state: SplitState, input: SplitInput, deltaMs: number): SplitState {
  const seconds = deltaMs / 1000;
  let next = state;

  if (next.phase === 'detonated') {
    const detonationMs = next.detonationMs - deltaMs;

    if (detonationMs <= 0) {
      // Soft-reset into a fresh round, carrying the RNG sequence, the attempt
      // counter, and this tick's accumulated events (so the round-reset bark
      // survives the swap).
      const attempt = next.attempt;

      return freshRound(next.rngState, attempt, [
        ...next.events,
        { type: 'round-reset', attempt },
      ]);
    }

    return { ...next, detonationMs };
  }

  if (next.phase !== 'retake') {
    return next;
  }

  next = { ...next, elapsedMs: next.elapsedMs + deltaMs };

  // Burn the fuse; detonate at zero.
  const spikeTimerMs = next.spikeTimerMs - deltaMs;

  if (spikeTimerMs <= 0) {
    const attempt = next.attempt + 1;
    const detonated: SplitState = {
      ...next,
      spikeTimerMs: 0,
      phase: 'detonated',
      detonationMs: SPLIT_CONFIG.detonation.holdMs,
      attempt,
    };

    return pushEvent(detonated, { type: 'detonated', attempt });
  }

  next = { ...next, spikeTimerMs };

  // Timers.
  next = {
    ...next,
    holdFireMs: Math.max(0, next.holdFireMs - deltaMs),
    player: {
      ...next.player,
      shotCooldownMs: Math.max(0, next.player.shotCooldownMs - deltaMs),
      invulnMs: Math.max(0, next.player.invulnMs - deltaMs),
      reviving: next.player.invulnMs - deltaMs > 0 ? next.player.reviving : false,
    },
  };

  next = spawnPendingReinforcements(next);
  next = movePlayer(next, input, seconds);
  next = updateTeammate(next, seconds, deltaMs);
  next = updateEnemies(next, seconds, deltaMs);
  next = updateDefuse(next, input, deltaMs);

  return next;
}

function spawnPendingReinforcements(state: SplitState): SplitState {
  let next = state;

  while (
    next.reinforcementsSpawned < SPLIT_CONFIG.reinforcements.length &&
    next.elapsedMs >= SPLIT_CONFIG.reinforcements[next.reinforcementsSpawned].atElapsedMs
  ) {
    const index = next.reinforcementsSpawned;
    const fresh = spawnReinforcement(index, next.enemies.length);

    next = pushEvent(
      {
        ...next,
        enemies: [...next.enemies, ...fresh],
        reinforcementsSpawned: index + 1,
      },
      { type: 'reinforcement', index, count: fresh.length },
    );
  }

  return next;
}

function movePlayer(state: SplitState, input: SplitInput, seconds: number): SplitState {
  const speed = SPLIT_CONFIG.player.speed;
  const move = normalize(input.move);
  const nextPos = moveEntity(
    state.player.pos,
    { x: move.x * speed * seconds, y: move.y * speed * seconds },
    SPLIT_CONFIG.player.width,
    SPLIT_CONFIG.player.height,
  );

  return { ...state, player: { ...state.player, pos: nextPos } };
}

function updateTeammate(state: SplitState, seconds: number, deltaMs: number): SplitState {
  const config = SPLIT_CONFIG.teammate;
  const toPlayer = {
    x: state.player.pos.x - state.teammate.pos.x,
    y: state.player.pos.y - state.teammate.pos.y,
  };
  const dist = Math.hypot(toPlayer.x, toPlayer.y);
  let pos = state.teammate.pos;

  if (dist > config.followDistance) {
    const dir = { x: toPlayer.x / dist, y: toPlayer.y / dist };
    pos = moveEntity(
      pos,
      { x: dir.x * config.speed * seconds, y: dir.y * config.speed * seconds },
      config.width,
      config.height,
    );
  }

  const fireCooldownMs = Math.max(0, state.teammate.fireCooldownMs - deltaMs);
  let next: SplitState = { ...state, teammate: { pos, fireCooldownMs } };

  if (fireCooldownMs <= 0) {
    const shot = fireTeammateShot(next);

    if (shot.result.fired) {
      next = {
        ...shot.state,
        teammate: { ...shot.state.teammate, fireCooldownMs: config.fireCooldownMs },
      };
    }
  }

  return next;
}

function updateEnemies(state: SplitState, seconds: number, deltaMs: number): SplitState {
  const config = SPLIT_CONFIG.enemy;
  let next = state;

  next.enemies.forEach((enemy, index) => {
    if (!enemy.alive) {
      return;
    }

    let pos = enemy.pos;
    let ai = enemy.ai;
    let timer = enemy.stateTimerMs - deltaMs;

    if (ai === 'advancing') {
      const toPlayer = {
        x: next.player.pos.x - enemy.pos.x,
        y: next.player.pos.y - enemy.pos.y,
      };
      const dist = Math.hypot(toPlayer.x, toPlayer.y);

      if (dist > 1) {
        const dir = { x: toPlayer.x / dist, y: toPlayer.y / dist };
        // Perpendicular weave: deterministic sway from elapsed time + id, so
        // the bot doesn't walk a straight line into a headshot.
        const perp = { x: -dir.y, y: dir.x };
        const swaySpeed =
          config.strafeSpeed *
          Math.sin(((next.elapsedMs + enemy.id * 260) * Math.PI * 2) / config.strafePeriodMs);
        pos = moveEntity(
          pos,
          {
            x: (dir.x * config.speed + perp.x * swaySpeed) * seconds,
            y: (dir.y * config.speed + perp.y * swaySpeed) * seconds,
          },
          config.width,
          config.height,
        );
      }

      if (timer <= 0) {
        ai = 'pausing';
        timer = config.pauseMs;
      }
    } else if (ai === 'pausing') {
      if (timer <= 0) {
        ai = 'telegraphing';
        timer = config.telegraphMs;
      }
    } else if (ai === 'telegraphing') {
      if (timer <= 0) {
        // Fire at ____, then reset to advancing.
        next = resolveEnemyFire(next, index, pos);
        ai = 'advancing';
        timer = config.advanceMs;
      }
    }

    next = updateEnemy(next, index, { pos, ai, stateTimerMs: timer });
  });

  return next;
}

function resolveEnemyFire(state: SplitState, index: number, enemyPos: Vec2): SplitState {
  const enemy = state.enemies[index];
  const config = SPLIT_CONFIG.enemy;
  const dist = distance(enemyPos, state.player.pos);

  if (
    state.holdFireMs > 0 ||
    dist > config.range ||
    !hasLineOfSight(enemyPos, state.player.pos)
  ) {
    return state;
  }

  const roll = rollChance(state.rngState, config.hitChance);
  let next: SplitState = { ...state, rngState: roll.state };

  next = pushEvent(next, {
    type: 'enemy-shot',
    from: enemyPos,
    to: next.player.pos,
    enemyId: enemy.id,
    hit: roll.hit,
  });

  if (roll.hit) {
    next = damagePlayer(next);
  }

  return next;
}

function updateDefuse(state: SplitState, input: SplitInput, deltaMs: number): SplitState {
  const { totalMs, checkpointMs, radius } = SPLIT_CONFIG.defuse;
  const inRadius = distance(state.player.pos, SPLIT_CONFIG.spike) <= radius;
  const defusing = input.holdDefuse && inRadius && !state.player.reviving;

  let progressMs = state.defuse.progressMs;
  let checkpointReached = state.defuse.checkpointReached;
  const floor = checkpointReached ? checkpointMs : 0;
  let next = state;

  if (defusing) {
    progressMs = Math.min(totalMs, progressMs + deltaMs);
  } else {
    // No drain: releasing E / leaving the radius snaps instantly back to the
    // last banked checkpoint (the half-mark once reached, otherwise zero).
    progressMs = floor;
  }

  if (!checkpointReached && progressMs >= checkpointMs) {
    checkpointReached = true;
    next = pushEvent(next, { type: 'defuse-checkpoint' });
  }

  next = { ...next, defuse: { progressMs, checkpointReached, defusing } };

  if (progressMs >= totalMs) {
    next = pushEvent({ ...next, phase: 'won' }, { type: 'defuse-complete' });
  }

  return next;
}

// ---------------------------------------------------------------------------
// State update helpers
// ---------------------------------------------------------------------------

function updateEnemy(
  state: SplitState,
  index: number,
  patch: Partial<EnemyState>,
): SplitState {
  const enemies = state.enemies.map((enemy, i) =>
    i === index ? { ...enemy, ...patch } : enemy,
  );

  return { ...state, enemies };
}

function registerKill(
  state: SplitState,
  enemyId: number,
  by: 'player' | 'teammate',
): SplitState {
  let next = pushEvent(state, { type: 'enemy-killed', enemyId, by });

  if (!next.firstBloodDone) {
    next = pushEvent({ ...next, firstBloodDone: true }, { type: 'first-blood' });
  }

  return next;
}

function pushEvent(state: SplitState, event: SplitEvent): SplitState {
  return { ...state, events: [...state.events, event] };
}

function normalize(vec: Vec2): Vec2 {
  const length = Math.hypot(vec.x, vec.y);

  return length > 1 ? { x: vec.x / length, y: vec.y / length } : vec;
}

// Axis-separated movement with cover + wall collision so entities slide along
// obstacles instead of sticking.
function moveEntity(pos: Vec2, delta: Vec2, width: number, height: number): Vec2 {
  const minX = SPLIT_CONFIG.arena.x + SPLIT_CONFIG.wallThickness + width / 2;
  const maxX =
    SPLIT_CONFIG.arena.x + SPLIT_CONFIG.arena.width - SPLIT_CONFIG.wallThickness - width / 2;
  const minY = SPLIT_CONFIG.arena.y + SPLIT_CONFIG.wallThickness + height / 2;
  const maxY =
    SPLIT_CONFIG.arena.y + SPLIT_CONFIG.arena.height - SPLIT_CONFIG.wallThickness - height / 2;

  let x = clamp(pos.x + delta.x, minX, maxX);

  if (collidesWithCover({ x, y: pos.y }, width, height)) {
    x = pos.x;
  }

  let y = clamp(pos.y + delta.y, minY, maxY);

  if (collidesWithCover({ x, y }, width, height)) {
    y = pos.y;
  }

  return { x, y };
}

function collidesWithCover(pos: Vec2, width: number, height: number): boolean {
  const rect = centeredRect(pos, width, height);

  return SPLIT_CONFIG.cover.some((cover) => rectsOverlap(rect, cover));
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function isSplitWon(state: SplitState): boolean {
  return state.phase === 'won';
}

export function aliveEnemyCount(state: SplitState): number {
  return state.enemies.filter((enemy) => enemy.alive).length;
}

export function defuseProgress(state: SplitState): number {
  return state.defuse.progressMs / SPLIT_CONFIG.defuse.totalMs;
}

// Remaining fuse in ms, clamped to zero.
export function spikeTimeRemainingMs(state: SplitState): number {
  return Math.max(0, state.spikeTimerMs);
}

// Whether ____ is currently close enough to the spike to defuse.
export function isInDefuseRadius(state: SplitState): boolean {
  return distance(state.player.pos, SPLIT_CONFIG.spike) <= SPLIT_CONFIG.defuse.radius;
}
