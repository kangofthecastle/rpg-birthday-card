import { describe, expect, it } from 'vitest';
import { nextRandom, rollChance, seedRng } from '../../../src/activities/valorantSplit/rng';
import {
  SPLIT_CONFIG,
  aliveEnemyCount,
  createSplitState,
  damagePlayer,
  defuseProgress,
  firePlayerShot,
  fireTeammateShot,
  isInDefuseRadius,
  isSplitWon,
  rayRect,
  spikeTimeRemainingMs,
  tickSplit,
  type DefuseState,
  type EnemyState,
  type Rect,
  type SplitEvent,
  type SplitInput,
  type SplitState,
  type Vec2,
} from '../../../src/activities/valorantSplit/splitModel';

const IDLE_INPUT: SplitInput = {
  move: { x: 0, y: 0 },
  aimAngle: 0,
  fire: false,
  holdDefuse: false,
};

const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;
const SPIKE = SPLIT_CONFIG.spike;

function enemyAt(pos: Vec2, overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 0,
    pos,
    bodyHp: SPLIT_CONFIG.enemy.bodyHp,
    alive: true,
    ai: 'advancing',
    stateTimerMs: 1000,
    wave: 0,
    ...overrides,
  };
}

function withState(partial: Partial<SplitState>): SplitState {
  return { ...createSplitState(1), ...partial };
}

function setPlayerPos(state: SplitState, pos: Vec2): SplitState {
  return { ...state, player: { ...state.player, pos } };
}

function withDefuse(state: SplitState, defuse: Partial<DefuseState>): SplitState {
  return { ...state, defuse: { ...state.defuse, ...defuse } };
}

function collect(events: readonly SplitEvent[], type: SplitEvent['type']): SplitEvent[] {
  return events.filter((event) => event.type === type);
}

describe('splitModel construction', () => {
  it('starts a live retake: full fuse, four hearts, three enemies, defuse at zero', () => {
    const state = createSplitState(1);

    expect(state.phase).toBe('retake');
    expect(state.player.hearts).toBe(4);
    expect(state.enemies).toHaveLength(3);
    expect(aliveEnemyCount(state)).toBe(3);
    expect(state.spikeTimerMs).toBe(SPLIT_CONFIG.spikeTimerMs);
    expect(spikeTimeRemainingMs(state)).toBe(SPLIT_CONFIG.spikeTimerMs);
    expect(state.attempt).toBe(0);
    expect(state.defuse.progressMs).toBe(0);
    expect(state.reinforcementsSpawned).toBe(1);
  });
});

describe('player hitscan resolution', () => {
  it('instantly kills on a headshot regardless of body hp', () => {
    // Player above the enemy, firing down: the ray enters the top head band.
    const state = setPlayerPos(
      withState({ enemies: [enemyAt({ x: 60, y: 300 })] }),
      { x: 60, y: 200 },
    );

    const { state: next, result } = firePlayerShot(state, DOWN);

    expect(result.headshot).toBe(true);
    expect(result.killed).toBe(true);
    expect(next.enemies[0].alive).toBe(false);
    expect(collect(next.events, 'first-blood')).toHaveLength(1);
  });

  it('takes four body shots to kill an enemy', () => {
    // Player below the enemy, firing up: the ray enters the lower body.
    let state = setPlayerPos(
      withState({ enemies: [enemyAt({ x: 60, y: 300 })] }),
      { x: 60, y: 470 },
    );

    for (let shot = 1; shot <= 3; shot += 1) {
      const outcome = firePlayerShot(state, UP);
      expect(outcome.result.headshot).toBe(false);
      expect(outcome.result.killed).toBe(false);
      expect(outcome.state.enemies[0].alive).toBe(true);
      expect(outcome.state.enemies[0].bodyHp).toBe(SPLIT_CONFIG.enemy.bodyHp - shot);
      state = outcome.state;
    }

    const finisher = firePlayerShot(state, UP);
    expect(finisher.result.killed).toBe(true);
    expect(finisher.state.enemies[0].alive).toBe(false);
  });

  it('is blocked by cover between the player and the enemy', () => {
    // Cover rect {405,190,150,44} (the platform barrier) spans the x=480
    // column between the player and the enemy.
    const state = setPlayerPos(
      withState({ enemies: [enemyAt({ x: 480, y: 140 })] }),
      { x: 480, y: 400 },
    );

    const { state: next, result } = firePlayerShot(state, UP);

    expect(result.hitEnemyId).toBeNull();
    expect(next.enemies[0].alive).toBe(true);
  });

  it('misses cleanly when nothing is in the line of fire', () => {
    const state = setPlayerPos(
      withState({ enemies: [enemyAt({ x: 400, y: 300 })] }),
      { x: 60, y: 470 },
    );

    const { result } = firePlayerShot(state, UP);

    expect(result.fired).toBe(true);
    expect(result.hitEnemyId).toBeNull();
  });
});

describe('teammate fire (____ / Omen)', () => {
  it('softens the nearest visible enemy with body shots but never lands the kill', () => {
    // Directly up the teammate's column (x=426) with a clear line of sight.
    let state = withState({
      enemies: [enemyAt({ x: 426, y: 300 })],
    });

    for (let shot = 0; shot < 12; shot += 1) {
      const outcome = fireTeammateShot(state);
      expect(outcome.result.fired).toBe(true);
      state = outcome.state;
    }

    // Floors at 1 body hp, never a headshot, never dead — ____ gets the kill.
    expect(state.enemies[0].bodyHp).toBe(1);
    expect(state.enemies[0].alive).toBe(true);
    expect(collect(state.events, 'teammate-shot').length).toBeGreaterThan(0);
    expect(collect(state.events, 'enemy-killed')).toHaveLength(0);
  });

  it('does not fire when no enemy has line of sight', () => {
    const state = withState({ enemies: [] });

    expect(fireTeammateShot(state).result.fired).toBe(false);
  });
});

describe('player hearts, revive, and no-fail', () => {
  it('loses exactly one heart per body hit', () => {
    const state = createSplitState(1);
    const next = damagePlayer(state);

    expect(next.player.hearts).toBe(3);
    expect(collect(next.events, 'heart-lost')).toHaveLength(1);
  });

  it('revives on site at zero hearts instead of failing', () => {
    let state = createSplitState(1);

    state = damagePlayer(state); // 3
    state = damagePlayer(state); // 2
    state = damagePlayer(state); // 1
    const revived = damagePlayer(state); // would hit 0 -> revive

    expect(revived.player.hearts).toBe(SPLIT_CONFIG.player.maxHearts);
    expect(revived.player.reviving).toBe(true);
    expect(revived.player.invulnMs).toBeGreaterThan(0);
    expect(revived.holdFireMs).toBeGreaterThanOrEqual(SPLIT_CONFIG.revive.holdFireMs);
    expect(collect(revived.events, 'revive')).toHaveLength(1);
  });

  it('ignores damage during the revive invulnerability window', () => {
    const state = {
      ...createSplitState(1),
      player: { ...createSplitState(1).player, invulnMs: 1500 },
    };

    const next = damagePlayer(state);

    expect(next.player.hearts).toBe(4);
    expect(next.events).toHaveLength(0);
  });

  it('never fails across a long firefight against an enemy in line of sight', () => {
    let state = withState({
      enemies: [enemyAt({ x: 360, y: 430 }, { ai: 'telegraphing', stateTimerMs: 40 })],
    });
    let heartLossEvents = 0;
    let reviveEvents = 0;

    // Stay well under the 60s fuse so the round never detonates out from
    // under the assertion.
    for (let elapsed = 0; elapsed < 40000; elapsed += 32) {
      state = tickSplit(state, IDLE_INPUT, 32);
      heartLossEvents += collect(state.events, 'heart-lost').length;
      reviveEvents += collect(state.events, 'revive').length;

      expect(state.player.hearts).toBeGreaterThanOrEqual(1);
      expect(state.player.hearts).toBeLessThanOrEqual(4);
      expect(state.phase).toBe('retake');
    }

    expect(heartLossEvents).toBeGreaterThan(0);
    expect(reviveEvents).toBeGreaterThan(0);
  });
});

describe('enemy accuracy is poor and seed-deterministic', () => {
  it('lands roughly the configured (low) hit rate over many rolls', () => {
    const chance = SPLIT_CONFIG.enemy.hitChance;

    expect(chance).toBeLessThan(0.5);

    let rngState = seedRng(1234);
    let hits = 0;
    const rolls = 4000;

    for (let i = 0; i < rolls; i += 1) {
      const roll = rollChance(rngState, chance);
      rngState = roll.state;
      if (roll.hit) {
        hits += 1;
      }
    }

    expect(hits / rolls).toBeCloseTo(chance, 1);
  });

  it('produces an identical roll sequence for the same seed', () => {
    const a = nextRandom(seedRng(99));
    const b = nextRandom(seedRng(99));

    expect(a.value).toBe(b.value);
    expect(a.state).toBe(b.state);
  });
});

describe('timed reinforcements', () => {
  it('bleeds in the scheduled groups as the fuse burns down', () => {
    // No starting enemies so the schedule is the only thing that spawns.
    let state = withState({ enemies: [], reinforcementsSpawned: 1 });

    expect(state.reinforcementsSpawned).toBe(1);

    // Past the ~T-40s reinforcement.
    state = tickSplit(state, IDLE_INPUT, 20050);
    expect(state.reinforcementsSpawned).toBe(2);
    expect(state.enemies).toHaveLength(2);
    const first = collect(state.events, 'reinforcement');
    expect(first).toHaveLength(1);
    expect((first[0] as { index: number; count: number }).index).toBe(1);
    expect((first[0] as { index: number; count: number }).count).toBe(2);

    // Past the ~T-20s reinforcement.
    state = tickSplit(state, IDLE_INPUT, 20050);
    expect(state.reinforcementsSpawned).toBe(3);
    expect(state.enemies).toHaveLength(4);
    expect(collect(state.events, 'reinforcement')).toHaveLength(1);
  });

  it('does not require killing everyone — the win is the defuse', () => {
    // Winning while enemies are still alive.
    let state = setPlayerPos(withState({ enemies: [enemyAt({ x: 480, y: 145 })] }), SPIKE);
    state = withDefuse(state, { progressMs: SPLIT_CONFIG.defuse.checkpointMs, checkpointReached: true });

    state = tickSplit(state, { ...IDLE_INPUT, holdDefuse: true }, 3600);

    expect(isSplitWon(state)).toBe(true);
    expect(aliveEnemyCount(state)).toBeGreaterThan(0);
  });
});

describe('contested defuse', () => {
  function hold(state: SplitState, ms: number, holding: boolean): SplitState {
    return tickSplit(state, { ...IDLE_INPUT, holdDefuse: holding }, ms);
  }

  function atSpike(): SplitState {
    return setPlayerPos(withState({ enemies: [] }), SPIKE);
  }

  it('accumulates progress only while in radius and holding E', () => {
    expect(isInDefuseRadius(atSpike())).toBe(true);

    const next = hold(atSpike(), 1000, true);

    expect(next.defuse.progressMs).toBeCloseTo(1000, 0);
    expect(next.defuse.defusing).toBe(true);
    expect(defuseProgress(next)).toBeGreaterThan(0);
  });

  it('makes no progress when holding E outside the defuse radius', () => {
    const away = setPlayerPos(withState({ enemies: [] }), { x: 200, y: 400 });

    expect(isInDefuseRadius(away)).toBe(false);

    const next = hold(away, 1000, true);

    expect(next.defuse.progressMs).toBe(0);
    expect(next.defuse.defusing).toBe(false);
  });

  it('decays progress slowly back toward the last checkpoint on release', () => {
    // Before the checkpoint the floor is zero, so a release bleeds toward zero
    // (slowly — decayPerMs < 1) but never below it.
    let state = hold(atSpike(), 1000, true);
    expect(state.defuse.progressMs).toBeCloseTo(1000, 0);

    state = hold(state, 1000, false);

    expect(state.defuse.progressMs).toBeLessThan(1000);
    expect(state.defuse.progressMs).toBeGreaterThanOrEqual(0);
    // decayPerMs = 0.4 -> loses ~400ms over 1000ms.
    expect(state.defuse.progressMs).toBeCloseTo(600, -1);
  });

  it('never falls below the half-defuse checkpoint once reached', () => {
    let state = hold(atSpike(), 3500, true);

    expect(state.defuse.checkpointReached).toBe(true);
    expect(collect(state.events, 'defuse-checkpoint')).toHaveLength(1);
    expect(defuseProgress(state)).toBeCloseTo(0.5, 1);

    // Long release: decay is clamped at the checkpoint.
    state = hold(state, 8000, false);

    expect(state.defuse.progressMs).toBeGreaterThanOrEqual(SPLIT_CONFIG.defuse.checkpointMs);
  });

  it('knocks ____ off the defuse (back to the checkpoint floor) when she takes a hit', () => {
    // Above the checkpoint but pre-checkpoint floor is zero.
    let state = withDefuse(withState({ enemies: [] }), {
      progressMs: 2000,
      checkpointReached: false,
      defusing: true,
    });

    state = damagePlayer(state);

    expect(state.defuse.progressMs).toBe(0);
    expect(state.defuse.defusing).toBe(false);
    expect(collect(state.events, 'defuse-interrupted')).toHaveLength(1);
    expect(collect(state.events, 'heart-lost')).toHaveLength(1);

    // With the checkpoint banked, a hit only drops back to the checkpoint.
    let banked = withDefuse(withState({ enemies: [] }), {
      progressMs: 5000,
      checkpointReached: true,
      defusing: true,
    });

    banked = damagePlayer(banked);

    expect(banked.defuse.progressMs).toBe(SPLIT_CONFIG.defuse.checkpointMs);
    expect(collect(banked.events, 'defuse-interrupted')).toHaveLength(1);
  });

  it('wins once the full seven-second hold completes', () => {
    let state = hold(atSpike(), 3500, true);
    state = hold(state, 3500, true);

    expect(isSplitWon(state)).toBe(true);
    expect(collect(state.events, 'defuse-complete')).toHaveLength(1);
  });
});

describe('detonation soft-reset (no-fail)', () => {
  it('detonates when the fuse hits zero and then runs it back with a fresh round', () => {
    // Short-fuse the spike so we reach zero quickly.
    let state = withState({ spikeTimerMs: 120, enemies: [] });

    state = tickSplit(state, IDLE_INPUT, 200);

    expect(state.phase).toBe('detonated');
    expect(state.attempt).toBe(1);
    const detonated = collect(state.events, 'detonated');
    expect(detonated).toHaveLength(1);
    expect((detonated[0] as { attempt: number }).attempt).toBe(1);

    // Ride out the detonation overlay: it soft-resets into a fresh retake.
    state = tickSplit(state, IDLE_INPUT, SPLIT_CONFIG.detonation.holdMs + 50);

    const reset = collect(state.events, 'round-reset');
    expect(reset).toHaveLength(1);
    expect((reset[0] as { attempt: number }).attempt).toBe(1);
    expect(state.phase).toBe('retake');
    expect(state.attempt).toBe(1);
    expect(state.spikeTimerMs).toBe(SPLIT_CONFIG.spikeTimerMs);
    expect(state.player.hearts).toBe(SPLIT_CONFIG.player.maxHearts);
    expect(state.defuse.progressMs).toBe(0);
    expect(state.enemies).toHaveLength(3);
    expect(aliveEnemyCount(state)).toBe(3);
  });
});

describe('rayRect — ray/AABB slab intersection', () => {
  // A 20x20 rect spanning x:[100,120], y:[100,120].
  const RECT: Rect = { x: 100, y: 100, width: 20, height: 20 };

  it('handles a vertical ray grazing the rect’s exact left edge x (no NaN)', () => {
    // Origin sits exactly on x=100 (the left slab boundary) with dir.x=0. The
    // old `0 * Infinity` slab math produced NaN here, silently ignoring cover.
    const hit = rayRect({ x: 100, y: 0 }, { x: 0, y: 1 }, RECT);

    expect(hit).not.toBeNull();
    expect(Number.isNaN(hit?.t ?? NaN)).toBe(false);
    expect(hit?.t).toBeCloseTo(100, 6);
    expect(hit?.point.x).toBeCloseTo(100, 6);
    expect(hit?.point.y).toBeCloseTo(100, 6);
  });

  it('handles a horizontal ray on the rect’s exact top edge y (no NaN)', () => {
    const hit = rayRect({ x: 0, y: 100 }, { x: 1, y: 0 }, RECT);

    expect(hit).not.toBeNull();
    expect(Number.isNaN(hit?.t ?? NaN)).toBe(false);
    expect(hit?.t).toBeCloseTo(100, 6);
    expect(hit?.point.x).toBeCloseTo(100, 6);
    expect(hit?.point.y).toBeCloseTo(100, 6);
  });

  it('misses when a vertical ray is parallel to and outside the x slab', () => {
    expect(rayRect({ x: 50, y: 0 }, { x: 0, y: 1 }, RECT)).toBeNull();
  });

  it('misses when a horizontal ray is parallel to and outside the y slab', () => {
    expect(rayRect({ x: 0, y: 50 }, { x: 1, y: 0 }, RECT)).toBeNull();
  });

  it('registers a normal straight-through hit at the near face', () => {
    const hit = rayRect({ x: 110, y: 0 }, { x: 0, y: 1 }, RECT);

    expect(hit).not.toBeNull();
    expect(hit?.t).toBeCloseTo(100, 6);
    expect(hit?.point).toEqual({ x: 110, y: 100 });
  });

  it('registers a normal diagonal hit at the corner', () => {
    const inv = 1 / Math.SQRT2;
    const hit = rayRect({ x: 90, y: 90 }, { x: inv, y: inv }, RECT);

    expect(hit).not.toBeNull();
    expect(hit?.t).toBeCloseTo(Math.hypot(10, 10), 6);
    expect(hit?.point.x).toBeCloseTo(100, 6);
    expect(hit?.point.y).toBeCloseTo(100, 6);
  });

  it('misses when the rect is entirely behind the ray origin', () => {
    // From below the rect (y=200): firing further down (+y, away) misses; firing
    // up (−y, toward it) enters the near face at y=120 → t=80.
    expect(rayRect({ x: 110, y: 200 }, { x: 0, y: 1 }, RECT)).toBeNull();
    expect(rayRect({ x: 110, y: 200 }, { x: 0, y: -1 }, RECT)?.t).toBeCloseTo(80, 6);
    // From above the rect (y=90): firing up (−y, away) misses.
    expect(rayRect({ x: 110, y: 90 }, { x: 0, y: -1 }, RECT)).toBeNull();
  });
});
