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
  isSplitWon,
  tickSplit,
  type EnemyState,
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

function collect(events: readonly SplitEvent[], type: SplitEvent['type']): SplitEvent[] {
  return events.filter((event) => event.type === type);
}

describe('splitModel construction', () => {
  it('starts with four hearts, three enemies, and combat phase', () => {
    const state = createSplitState(1);

    expect(state.phase).toBe('combat');
    expect(state.player.hearts).toBe(4);
    expect(state.enemies).toHaveLength(3);
    expect(aliveEnemyCount(state)).toBe(3);
    expect(SPLIT_CONFIG.waves).toEqual([3, 2]);
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

    for (let elapsed = 0; elapsed < 60000; elapsed += 32) {
      state = tickSplit(state, IDLE_INPUT, 32);
      heartLossEvents += collect(state.events, 'heart-lost').length;
      reviveEvents += collect(state.events, 'revive').length;

      expect(state.player.hearts).toBeGreaterThanOrEqual(1);
      expect(state.player.hearts).toBeLessThanOrEqual(4);
      expect(state.phase).toBe('combat');
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

describe('wave progression and win condition', () => {
  it('spawns the second wave only after the first is cleared', () => {
    const cleared = {
      ...createSplitState(1),
      enemies: createSplitState(1).enemies.map((enemy) => ({ ...enemy, alive: false })),
    };

    const next = tickSplit(cleared, IDLE_INPUT, 0);

    expect(next.waveIndex).toBe(1);
    expect(next.enemies).toHaveLength(5);
    expect(aliveEnemyCount(next)).toBe(2);
    expect(collect(next.events, 'wave-start')).toHaveLength(1);
    expect(next.phase).toBe('combat');
  });

  it('activates the spike after the final wave is cleared', () => {
    let state = createSplitState(1);
    state = { ...state, enemies: state.enemies.map((e) => ({ ...e, alive: false })) };
    state = tickSplit(state, IDLE_INPUT, 0); // spawn wave 2
    state = { ...state, enemies: state.enemies.map((e) => ({ ...e, alive: false })) };
    state = tickSplit(state, IDLE_INPUT, 0); // clear wave 2

    expect(state.phase).toBe('defuse');
    expect(collect(state.events, 'spike-active')).toHaveLength(1);
  });
});

describe('spike defuse hold / release / half tick', () => {
  function defusingState(): SplitState {
    return withState({ phase: 'defuse', enemies: [] });
  }

  function hold(state: SplitState, ms: number, holding: boolean): SplitState {
    return tickSplit(state, { ...IDLE_INPUT, holdDefuse: holding }, ms);
  }

  it('accumulates progress while E is held', () => {
    const next = hold(defusingState(), 1000, true);

    expect(next.defuse.progressMs).toBeCloseTo(1000);
    expect(defuseProgress(next)).toBeGreaterThan(0);
  });

  it('pauses (does not reset) progress when released before the checkpoint', () => {
    let state = hold(defusingState(), 1000, true);
    state = hold(state, 1000, false);

    expect(state.defuse.progressMs).toBeCloseTo(1000);
    expect(state.defuse.checkpointReached).toBe(false);
  });

  it('never falls below the half-defuse checkpoint once reached', () => {
    let state = hold(defusingState(), 3500, true);

    expect(state.defuse.checkpointReached).toBe(true);
    expect(collect(state.events, 'defuse-checkpoint')).toHaveLength(1);
    expect(defuseProgress(state)).toBeCloseTo(0.5);

    state = hold(state, 2000, false);

    expect(state.defuse.progressMs).toBeGreaterThanOrEqual(SPLIT_CONFIG.defuse.checkpointMs);
  });

  it('wins once the full seven-second hold completes', () => {
    let state = hold(defusingState(), 3500, true);
    state = hold(state, 3500, true);

    expect(isSplitWon(state)).toBe(true);
    expect(collect(state.events, 'defuse-complete')).toHaveLength(1);
  });
});
