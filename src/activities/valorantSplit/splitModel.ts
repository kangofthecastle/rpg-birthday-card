import { rollChance, seedRng } from './rng';

// ---------------------------------------------------------------------------
// SPLIT.EXE pure model
//
// A deterministic, Phaser-free simulation of a top-down retro shooter homage to
// Valorant's Split B site. Everything here is unit-testable: entity movement,
// hitscan shot resolution (head vs body hitboxes), enemy/teammate AI, player
// hearts + revive, wave progression, and the hold-to-defuse finale. The Phaser
// scene renders this state and feeds it input; it owns no game rules of its own.
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
  arena: { x: 0, y: 0, width: 720, height: 560 },
  wallThickness: 28,
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
    speed: 52,
    advanceMs: 850,
    pauseMs: 480,
    telegraphMs: 540,
    hitChance: 0.26,
    range: 560,
  },
  revive: { holdFireMs: 2000 },
  defuse: { totalMs: 7000, checkpointMs: 3500 },
  waves: [3, 2] as const,
  spike: { x: 360, y: 244, size: 26 },
  playerStart: { x: 360, y: 470 },
  teammateStart: { x: 296, y: 486 },
  enemySpawns: [
    [
      { x: 200, y: 92 },
      { x: 360, y: 72 },
      { x: 520, y: 92 },
    ],
    [
      { x: 276, y: 90 },
      { x: 444, y: 90 },
    ],
  ] as const,
  cover: [
    { x: 150, y: 214, width: 92, height: 70 },
    { x: 300, y: 150, width: 120, height: 40 },
    { x: 470, y: 210, width: 92, height: 70 },
    { x: 322, y: 306, width: 84, height: 60 },
    { x: 178, y: 384, width: 82, height: 60 },
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

export type SplitPhase = 'combat' | 'defuse' | 'won';

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
  | { readonly type: 'wave-start'; readonly wave: number }
  | { readonly type: 'spike-active' }
  | { readonly type: 'defuse-checkpoint' }
  | { readonly type: 'defuse-complete' };

export interface SplitState {
  readonly phase: SplitPhase;
  readonly elapsedMs: number;
  readonly rngState: number;
  readonly player: PlayerState;
  readonly teammate: TeammateState;
  readonly enemies: readonly EnemyState[];
  readonly waveIndex: number;
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
  return {
    phase: 'combat',
    elapsedMs: 0,
    rngState: seedRng(seed),
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
    enemies: spawnWave(0, 0),
    waveIndex: 0,
    holdFireMs: 0,
    firstBloodDone: false,
    defuse: { progressMs: 0, checkpointReached: false },
    events: [],
  };
}

function spawnWave(waveIndex: number, idOffset: number): EnemyState[] {
  const spawns = SPLIT_CONFIG.enemySpawns[waveIndex];

  return spawns.map((pos, index) => ({
    id: idOffset + index,
    pos,
    bodyHp: SPLIT_CONFIG.enemy.bodyHp,
    alive: true,
    ai: 'advancing' as EnemyAiState,
    stateTimerMs: SPLIT_CONFIG.enemy.advanceMs,
    wave: waveIndex,
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

interface RayHit {
  readonly t: number;
  readonly point: Vec2;
}

function rayRect(origin: Vec2, dir: Vec2, rect: Rect): RayHit | null {
  const invDx = dir.x !== 0 ? 1 / dir.x : Number.POSITIVE_INFINITY;
  const invDy = dir.y !== 0 ? 1 / dir.y : Number.POSITIVE_INFINITY;

  const tx1 = (rect.x - origin.x) * invDx;
  const tx2 = (rect.x + rect.width - origin.x) * invDx;
  const ty1 = (rect.y - origin.y) * invDy;
  const ty2 = (rect.y + rect.height - origin.y) * invDy;

  const tmin = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2));
  const tmax = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2));

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
// with full hearts, brief invulnerability, and the bots hold fire.
export function damagePlayer(state: SplitState): SplitState {
  if (state.player.invulnMs > 0) {
    return state;
  }

  const hearts = state.player.hearts - 1;

  if (hearts <= 0) {
    const revived: SplitState = {
      ...state,
      player: {
        ...state.player,
        hearts: SPLIT_CONFIG.player.maxHearts,
        invulnMs: SPLIT_CONFIG.player.reviveInvulnMs,
        reviving: true,
      },
      holdFireMs: Math.max(state.holdFireMs, SPLIT_CONFIG.revive.holdFireMs),
    };

    return pushEvent(revived, { type: 'revive' });
  }

  const damaged: SplitState = {
    ...state,
    player: { ...state.player, hearts },
  };

  return pushEvent(damaged, { type: 'heart-lost', hearts });
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

export function tickSplit(state: SplitState, input: SplitInput, deltaMs: number): SplitState {
  let next: SplitState = { ...state, events: [] };

  // Player shot resolves once per tick (edge-triggered click), gated by cadence.
  if (
    input.fire &&
    next.phase === 'combat' &&
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

  while (remaining > 0) {
    const step = Math.min(MAX_STEP_MS, remaining);
    next = stepSplit(next, input, step);
    remaining -= step;
  }

  return resolvePhaseTransitions(next);
}

function stepSplit(state: SplitState, input: SplitInput, deltaMs: number): SplitState {
  const seconds = deltaMs / 1000;
  let next = state;

  next = { ...next, elapsedMs: next.elapsedMs + deltaMs };

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

  next = movePlayer(next, input, seconds);
  next = updateTeammate(next, seconds, deltaMs);
  next = updateEnemies(next, seconds, deltaMs);
  next = updateDefuse(next, input, deltaMs);

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

  if (fireCooldownMs <= 0 && next.phase === 'combat') {
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
        pos = moveEntity(
          pos,
          { x: dir.x * config.speed * seconds, y: dir.y * config.speed * seconds },
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
  if (state.phase !== 'defuse') {
    return state;
  }

  const { totalMs, checkpointMs } = SPLIT_CONFIG.defuse;
  let progressMs = state.defuse.progressMs;
  let checkpointReached = state.defuse.checkpointReached;
  let next = state;

  if (input.holdDefuse) {
    progressMs = Math.min(totalMs, progressMs + deltaMs);
  }

  // Half-defuse checkpoint: once reached, progress never falls below it.
  if (checkpointReached) {
    progressMs = Math.max(progressMs, checkpointMs);
  }

  if (!checkpointReached && progressMs >= checkpointMs) {
    checkpointReached = true;
    next = pushEvent(next, { type: 'defuse-checkpoint' });
  }

  next = { ...next, defuse: { progressMs, checkpointReached } };

  if (progressMs >= totalMs) {
    next = pushEvent({ ...next, phase: 'won' }, { type: 'defuse-complete' });
  }

  return next;
}

function resolvePhaseTransitions(state: SplitState): SplitState {
  if (state.phase !== 'combat') {
    return state;
  }

  if (state.enemies.some((enemy) => enemy.alive)) {
    return state;
  }

  if (state.waveIndex + 1 < SPLIT_CONFIG.waves.length) {
    const nextWaveIndex = state.waveIndex + 1;
    const idOffset = state.enemies.length;
    const withWave: SplitState = {
      ...state,
      waveIndex: nextWaveIndex,
      enemies: [...state.enemies, ...spawnWave(nextWaveIndex, idOffset)],
    };

    return pushEvent(withWave, { type: 'wave-start', wave: nextWaveIndex });
  }

  return pushEvent({ ...state, phase: 'defuse' }, { type: 'spike-active' });
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
