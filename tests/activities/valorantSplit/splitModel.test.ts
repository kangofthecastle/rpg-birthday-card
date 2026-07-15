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
  playerShotSpreadRad,
  rayRect,
  spikeTimeRemainingMs,
  shouldShowDefuseMeter,
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
  reload: false,
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

// A "hot" live round with no spawn protection (invuln / hold-fire cleared) so
// direct damage lands and combat is testable. Tests that want spawn protection
// set player.invulnMs explicitly.
function withState(partial: Partial<SplitState>): SplitState {
  const base = createSplitState(1);
  return {
    ...base,
    player: { ...base.player, invulnMs: 0 },
    holdFireMs: 0,
    ...partial,
  };
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
    expect(state.teammate.present).toBe(true);
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

  it('does not move or fire after departing', () => {
    const base = withState({ enemies: [enemyAt({ x: 426, y: 300 })] });
    const absent = {
      ...base,
      player: { ...base.player, pos: { x: 700, y: 400 }, invulnMs: 1e7 },
      teammate: { ...base.teammate, present: false, fireCooldownMs: 0 },
    };

    expect(fireTeammateShot(absent).result.fired).toBe(false);

    const next = tickSplit(absent, IDLE_INPUT, 250);

    expect(next.teammate.pos).toEqual(absent.teammate.pos);
    expect(collect(next.events, 'teammate-shot')).toHaveLength(0);
  });
});

describe('player hearts and death restart', () => {
  it('loses exactly one heart per body hit', () => {
    // Clear the spawn invulnerability so the hit lands.
    const state = { ...createSplitState(1), player: { ...createSplitState(1).player, invulnMs: 0 } };
    const next = damagePlayer(state);

    expect(next.player.hearts).toBe(3);
    expect(collect(next.events, 'heart-lost')).toHaveLength(1);
  });

  it('dies at zero hearts and enters the death overlay (no revive)', () => {
    let state = { ...createSplitState(1), player: { ...createSplitState(1).player, invulnMs: 0 } };

    state = damagePlayer(state); // 3
    state = damagePlayer(state); // 2
    state = damagePlayer(state); // 1
    const dead = damagePlayer(state); // hits 0 -> death

    expect(dead.phase).toBe('dead');
    expect(dead.player.hearts).toBe(0);
    expect(dead.deathMs).toBe(SPLIT_CONFIG.death.holdMs);
    expect(collect(dead.events, 'player-died')).toHaveLength(1);
  });

  it('hard-restarts from the beginning after the death overlay elapses', () => {
    // Take a couple of hits and bank some defuse progress, then die.
    let state = setPlayerPos(withState({ enemies: [] }), SPIKE);
    state = { ...state, player: { ...state.player, invulnMs: 0 } };
    state = tickSplit(state, { ...IDLE_INPUT, holdDefuse: true }, 2000);
    expect(state.defuse.progressMs).toBeGreaterThan(0);

    state = damagePlayer(state); // 3
    state = damagePlayer(state); // 2
    state = damagePlayer(state); // 1
    state = damagePlayer(state); // 0 -> dead
    expect(state.phase).toBe('dead');

    // Ride out the death overlay: it soft-resets into a completely fresh round.
    state = tickSplit(state, IDLE_INPUT, SPLIT_CONFIG.death.holdMs + 50);

    expect(collect(state.events, 'round-reset')).toHaveLength(1);
    expect(state.phase).toBe('retake');
    expect(state.player.hearts).toBe(SPLIT_CONFIG.player.maxHearts);
    expect(state.defuse.progressMs).toBe(0); // no partial checkpoints survive
    expect(state.spikeTimerMs).toBe(SPLIT_CONFIG.spikeTimerMs);
    expect(state.player.ammoInMag).toBe(SPLIT_CONFIG.player.magSize);
    expect(aliveEnemyCount(state)).toBe(3);
  });

  it('ignores damage during the spawn invulnerability window', () => {
    const state = {
      ...createSplitState(1),
      player: { ...createSplitState(1).player, invulnMs: 1500 },
    };

    const next = damagePlayer(state);

    expect(next.player.hearts).toBe(4);
    expect(next.events).toHaveLength(0);
  });

  it('dies and restarts under sustained fire, never getting stuck', () => {
    let state = withState({
      enemies: [enemyAt({ x: 480, y: 430 }, { ai: 'telegraphing', stateTimerMs: 40 })],
      player: { ...createSplitState(1).player, invulnMs: 0 },
    });
    let deaths = 0;
    let resets = 0;

    // Stay well under the 60s fuse so the round never detonates out from under
    // the assertion.
    for (let elapsed = 0; elapsed < 40000; elapsed += 32) {
      state = tickSplit(state, IDLE_INPUT, 32);
      deaths += collect(state.events, 'player-died').length;
      resets += collect(state.events, 'round-reset').length;

      // Phase is always a legal state; hearts never go negative.
      expect(['retake', 'dead', 'won', 'detonated']).toContain(state.phase);
      expect(state.player.hearts).toBeGreaterThanOrEqual(0);
      expect(state.player.hearts).toBeLessThanOrEqual(4);
    }

    expect(deaths).toBeGreaterThan(0);
    // Every death is followed by a clean restart (equal counts, off by at most
    // one if the loop ends mid-overlay).
    expect(resets).toBeGreaterThanOrEqual(deaths - 1);
  });
});

describe('ammo, reload, and dry fire', () => {
  function firing(extra: Partial<SplitInput> = {}): SplitInput {
    return { ...IDLE_INPUT, fire: true, ...extra };
  }

  it('starts with a full mag and two mags in reserve', () => {
    const state = createSplitState(1);

    expect(state.player.ammoInMag).toBe(SPLIT_CONFIG.player.magSize);
    expect(state.player.reserveRounds).toBe(
      (SPLIT_CONFIG.player.magazines - 1) * SPLIT_CONFIG.player.magSize,
    );
  });

  it('uses a 2.5-second Phantom reload lockout', () => {
    expect(SPLIT_CONFIG.player.reloadMs).toBe(2500);
  });

  it('spends one round per shot', () => {
    let state = setPlayerPos(withState({ enemies: [] }), { x: 200, y: 400 });
    const before = state.player.ammoInMag;

    // One shot fires per tick (gated by the shot clock); 200ms clears the 180ms
    // cooldown between calls.
    state = tickSplit(state, firing(), 200);

    expect(state.player.ammoInMag).toBe(before - 1);
  });

  it('reloads from the reserve pool after the reload lockout', () => {
    let state = setPlayerPos(withState({ enemies: [] }), { x: 200, y: 400 });
    state = { ...state, player: { ...state.player, ammoInMag: 5 } };
    const reserveBefore = state.player.reserveRounds;

    state = tickSplit(state, { ...IDLE_INPUT, reload: true }, 16);
    expect(state.player.reloadingMs).toBeGreaterThan(0);
    expect(collect(state.events, 'reload-start')).toHaveLength(1);

    // Let the lockout elapse.
    state = tickSplit(state, IDLE_INPUT, SPLIT_CONFIG.player.reloadMs + 20);

    expect(state.player.ammoInMag).toBe(SPLIT_CONFIG.player.magSize);
    expect(state.player.reserveRounds).toBe(reserveBefore - (SPLIT_CONFIG.player.magSize - 5));
    expect(collect(state.events, 'reload-complete')).toHaveLength(1);
  });

  it('emits a dry-fire when the mag and reserve are both empty', () => {
    let state = setPlayerPos(withState({ enemies: [] }), { x: 200, y: 400 });
    state = { ...state, player: { ...state.player, ammoInMag: 0, reserveRounds: 0 } };

    state = tickSplit(state, firing(), 200);

    expect(collect(state.events, 'dry-fire')).toHaveLength(1);
    expect(state.player.ammoInMag).toBe(0);
  });
});

describe('movement inaccuracy (Valorant-style spread)', () => {
  // Enemy 200px straight above; standing spread (±0.014 rad) can never miss a
  // 26px-wide body at that range, but the moving cone (±0.19 rad) sprays wide.
  const FIXED = { x: 200, y: 400 };
  const TARGET = { x: 200, y: 200 };

  function countHits(move: Vec2, seed: number, shots: number): number {
    let state = setPlayerPos(withState({ enemies: [enemyAt(TARGET)], rngState: seedRng(seed) }), FIXED);
    let hits = 0;

    for (let i = 0; i < shots; i += 1) {
      // Reset each iteration so displacement/HP/ammo never confound the geometry;
      // only the RNG stream carries forward.
      state = {
        ...state,
        player: {
          ...state.player,
          pos: FIXED,
          shotCooldownMs: 0,
          invulnMs: 5000,
          ammoInMag: 25,
          reloadingMs: 0,
          // Reset the spray each iteration so this measures the *rested* still vs
          // moving cone (the first-shot accuracy), not accumulated spray bloom.
          sprayShots: 0,
          sprayQuietMs: 0,
        },
        holdFireMs: 5000,
        enemies: [enemyAt(TARGET)],
      };
      state = tickSplit(state, { ...IDLE_INPUT, move, aimAngle: UP, fire: true }, 200);
      if (state.events.some((e) => e.type === 'player-shot' && e.hitEnemyId !== null)) {
        hits += 1;
      }
    }

    return hits;
  }

  it('never misses standing still but sprays a lot while moving', () => {
    const shots = 30;
    const standing = countHits({ x: 0, y: 0 }, 4242, shots);
    const moving = countHits({ x: 1, y: 0 }, 4242, shots);

    expect(standing).toBe(shots); // pinpoint when planted
    expect(moving).toBeLessThan(standing); // heavy movement error
    expect(moving).toBeLessThan(shots * 0.85);
  });
});

describe('Phantom rate of fire (11 rounds/sec)', () => {
  it('sets the shot clock to a 660 RPM cadence (~90.9ms)', () => {
    expect(SPLIT_CONFIG.player.shotCooldownMs).toBeCloseTo(1000 / 11, 6);
    expect(1000 / SPLIT_CONFIG.player.shotCooldownMs).toBeCloseTo(11, 6);
  });

  it('fires ~11 rounds over one second of held fire', () => {
    // Held trigger, no enemies (shots fly into space), fine 1ms frames so the
    // shot clock isn't coarsely quantized.
    let state = setPlayerPos(withState({ enemies: [] }), { x: 200, y: 400 });
    const firing: SplitInput = { ...IDLE_INPUT, fire: true, aimAngle: UP };
    let shots = 0;

    for (let t = 0; t < 1000; t += 1) {
      state = tickSplit(state, firing, 1);
      shots += collect(state.events, 'player-shot').length;
    }

    // 1000 / (1000/11) = 11 shots; allow ±1 for frame-boundary rounding.
    expect(shots).toBeGreaterThanOrEqual(10);
    expect(shots).toBeLessThanOrEqual(12);
  });
});

describe('Phantom magazine (30 loaded, 90 rounds total)', () => {
  it('carries a 30-round mag and two spare mags (60 reserve)', () => {
    const state = createSplitState(1);

    expect(SPLIT_CONFIG.player.magSize).toBe(30);
    expect(SPLIT_CONFIG.player.magazines).toBe(3);
    expect(state.player.ammoInMag).toBe(30);
    expect(state.player.reserveRounds).toBe(60);
    expect(state.player.ammoInMag + state.player.reserveRounds).toBe(90);
    expect(state.player.reserveRounds).toBe(
      (SPLIT_CONFIG.player.magazines - 1) * SPLIT_CONFIG.player.magSize,
    );
  });
});

describe('spray bloom (first-shot accuracy + ramp)', () => {
  const { spreadStillRad, spreadMovingRad, sprayBloomMaxRad, sprayFullShots } =
    SPLIT_CONFIG.player;

  it('is ~99% accurate on the first rested shot (near-zero cone)', () => {
    expect(playerShotSpreadRad(0, false)).toBe(spreadStillRad);
    expect(playerShotSpreadRad(0, false)).toBeLessThan(0.02);
  });

  it('grows monotonically with spray depth and caps at a sane max', () => {
    let prev = -1;
    for (let n = 0; n <= sprayFullShots; n += 1) {
      const cone = playerShotSpreadRad(n, false);
      expect(cone).toBeGreaterThan(prev); // strictly increasing up to the cap
      prev = cone;
    }

    // Capped: at/after sprayFullShots the cone is the rested floor plus the max
    // bloom and never grows further.
    const capped = playerShotSpreadRad(sprayFullShots, false);
    expect(capped).toBeCloseTo(spreadStillRad + sprayBloomMaxRad, 6);
    expect(playerShotSpreadRad(sprayFullShots + 50, false)).toBe(capped);
  });

  it('stays tight through the first four shots, then blooms clearly', () => {
    // Shots 1–4 (depth 0..3) stay pinned near the rested floor.
    for (let n = 0; n <= 3; n += 1) {
      expect(playerShotSpreadRad(n, false)).toBeLessThan(spreadStillRad * 1.6);
    }
    expect(playerShotSpreadRad(3, false)).toBeLessThan(0.025);

    // Beyond shot four the cone opens up markedly.
    expect(playerShotSpreadRad(8, false)).toBeGreaterThan(playerShotSpreadRad(3, false) * 2);
  });

  it('never makes a moving shot tighter than a stationary one at the same depth', () => {
    expect(playerShotSpreadRad(0, true)).toBe(spreadMovingRad); // rested moving penalty intact
    for (let n = 0; n <= sprayFullShots + 4; n += 1) {
      expect(playerShotSpreadRad(n, true)).toBeGreaterThan(playerShotSpreadRad(n, false));
    }
  });
});

describe('spray recovery and cursor-move independence', () => {
  function holdFire(state: SplitState, frames: number, input: Partial<SplitInput> = {}): SplitState {
    let next = state;
    for (let i = 0; i < frames; i += 1) {
      next = tickSplit(next, { ...IDLE_INPUT, fire: true, aimAngle: UP, ...input }, 8);
    }
    return next;
  }

  it('deepens while the trigger is held, then resets to rested after a pause', () => {
    let state = setPlayerPos(withState({ enemies: [] }), { x: 200, y: 400 });

    // ~600ms of held fire builds a spray several shots deep.
    state = holdFire(state, 75);
    expect(state.player.sprayShots).toBeGreaterThan(4);

    // A pause longer than sprayResetMs snaps the spray back to rested.
    state = tickSplit(state, IDLE_INPUT, SPLIT_CONFIG.player.sprayResetMs + 50);
    expect(state.player.sprayShots).toBe(0);
    expect(playerShotSpreadRad(state.player.sprayShots, false)).toBe(
      SPLIT_CONFIG.player.spreadStillRad,
    );
  });

  it('does not reset the spray during the shot-clock gap of sustained fire', () => {
    // The quiet reset threshold must exceed the fire interval, or a held spray
    // could never build past a single shot.
    expect(SPLIT_CONFIG.player.sprayResetMs).toBeGreaterThan(SPLIT_CONFIG.player.shotCooldownMs);
  });

  it('is unaffected by cursor/aim movement (only character movement matters)', () => {
    const base = setPlayerPos(withState({ enemies: [] }), { x: 200, y: 400 });

    // Two identical held-fire sprays that differ ONLY in aim: one locked, one
    // whipping the cursor around every frame. Character stays put (move = 0).
    let locked = base;
    let whipping = base;
    for (let i = 0; i < 40; i += 1) {
      locked = tickSplit(locked, { ...IDLE_INPUT, fire: true, aimAngle: UP }, 8);
      whipping = tickSplit(whipping, { ...IDLE_INPUT, fire: true, aimAngle: i * 0.7 }, 8);
    }

    // Aiming motion perturbs neither the spray depth nor the RNG stream, so the
    // cone (a pure function of depth + character-movement) is identical.
    expect(whipping.player.sprayShots).toBe(locked.player.sprayShots);
    expect(whipping.rngState).toBe(locked.rngState);
    expect(playerShotSpreadRad(whipping.player.sprayShots, false)).toBe(
      playerShotSpreadRad(locked.player.sprayShots, false),
    );
  });
});

describe('first-tap ambush wave', () => {
  it('drops two extra bots the instant the defuse is initiated', () => {
    let state = setPlayerPos(withState({ enemies: [] }), SPIKE);

    expect(state.defuseWaveSpawned).toBe(false);

    state = tickSplit(state, { ...IDLE_INPUT, holdDefuse: true }, 32);

    expect(state.defuseWaveSpawned).toBe(true);
    expect(aliveEnemyCount(state)).toBe(2);
    const wave = collect(state.events, 'defuse-wave');
    expect(wave).toHaveLength(1);
    expect((wave[0] as { count: number }).count).toBe(2);
  });

  it('does not spawn a second ambush on subsequent defuse ticks', () => {
    let state = setPlayerPos(withState({ enemies: [] }), SPIKE);

    state = tickSplit(state, { ...IDLE_INPUT, holdDefuse: true }, 32);
    state = tickSplit(state, { ...IDLE_INPUT, holdDefuse: true }, 32);
    state = tickSplit(state, { ...IDLE_INPUT, holdDefuse: true }, 32);

    expect(aliveEnemyCount(state)).toBe(2);
    expect(collect(state.events, 'defuse-wave')).toHaveLength(0);
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
  it('schedules a single opening group and never bleeds in a timed wave', () => {
    // The opening three are the ONLY scheduled spawn; there is no timed mid-round
    // reinforcement. Keep ____ invulnerable and never tap the spike so the only
    // possible growth would be a (now-removed) timer wave.
    let state = createSplitState(1);
    state = { ...state, player: { ...state.player, invulnMs: 1e7 } };

    expect(state.reinforcementsSpawned).toBe(1);
    expect(state.enemies).toHaveLength(3);

    // Ride most of the fuse — crossing the old ~T-35s (25s) mark — with no tap.
    // Nothing new ever spawns and no reinforcement event is emitted.
    for (let t = 0; t < 50000; t += 500) {
      state = { ...state, player: { ...state.player, invulnMs: 1e7 } };
      state = tickSplit(state, IDLE_INPUT, 500);
    }

    expect(state.reinforcementsSpawned).toBe(1);
    expect(state.enemies).toHaveLength(3);
    expect(collect(state.events, 'reinforcement')).toHaveLength(0);
  });

  it('does not require killing everyone — the win is the defuse', () => {
    // Winning while enemies are still alive. Keep ____ invulnerable so the
    // first-tap ambush wave can't knock her off the defuse mid-assertion.
    let state = setPlayerPos(withState({ enemies: [enemyAt({ x: 480, y: 145 })] }), SPIKE);
    state = withDefuse(state, { progressMs: SPLIT_CONFIG.defuse.checkpointMs, checkpointReached: true });
    state = { ...state, player: { ...state.player, invulnMs: 5000 } };

    state = tickSplit(state, { ...IDLE_INPUT, holdDefuse: true }, 3600);

    expect(isSplitWon(state)).toBe(true);
    expect(aliveEnemyCount(state)).toBeGreaterThan(0);
  });
});

describe('difficulty tuning (max five meaner bots)', () => {
  it('caps the roster at five: three opening bots + a two-bot defuse ambush', () => {
    // A single scheduled group of three, and the two-bot ambush that drops on
    // the first defuse tap. 3 + 2 = 5, and nothing else ever spawns.
    const scheduled = SPLIT_CONFIG.reinforcements.reduce((n, wave) => n + wave.spawns.length, 0);
    const ambush = SPLIT_CONFIG.defuseAmbush.spawns.length;

    expect(SPLIT_CONFIG.reinforcements).toHaveLength(1);
    expect(scheduled).toBe(3);
    expect(ambush).toBe(2);
    expect(scheduled + ambush).toBe(5);
  });

  it('makes each bot meaner than the previous baseline (0.38 / 300 / 280 / 62)', () => {
    expect(SPLIT_CONFIG.enemy.hitChance).toBeGreaterThan(0.38);
    expect(SPLIT_CONFIG.enemy.hitChance).toBeLessThan(0.5); // still under a coin flip
    expect(SPLIT_CONFIG.enemy.telegraphMs).toBeLessThan(300);
    expect(SPLIT_CONFIG.enemy.pauseMs).toBeLessThan(280);
    expect(SPLIT_CONFIG.enemy.speed).toBeGreaterThan(62);
    expect(SPLIT_CONFIG.enemy.strafeSpeed).toBeGreaterThan(48);
    expect(SPLIT_CONFIG.enemy.strafePeriodMs).toBeGreaterThan(0);
  });

  it('only enters and maintains an aim cycle with a real line of sight', () => {
    // The long platform barrier spans x 405..555, y 190..234, directly between
    // this bot and ____. A bot already aiming must cancel rather than drawing a
    // telegraph/firing into the impenetrable prop.
    const blocked = withState({
      enemies: [
        enemyAt(
          { x: 480, y: 140 },
          { ai: 'telegraphing', stateTimerMs: SPLIT_CONFIG.enemy.telegraphMs },
        ),
      ],
      teammate: { ...createSplitState(1).teammate, present: false },
    });

    const cancelled = tickSplit(blocked, IDLE_INPUT, 16);

    expect(cancelled.enemies[0].ai).toBe('advancing');
    expect(cancelled.enemies[0].stateTimerMs).toBe(SPLIT_CONFIG.enemy.reacquireMs);
    expect(collect(cancelled.events, 'enemy-shot')).toHaveLength(0);
  });

  it('fires promptly once a clear angle is available', () => {
    const base = createSplitState(1);
    let state = withState({
      player: { ...base.player, pos: { x: 800, y: 400 }, invulnMs: 1e7 },
      enemies: [
        enemyAt(
          { x: 800, y: 150 },
          { stateTimerMs: SPLIT_CONFIG.enemy.advanceMs },
        ),
      ],
      teammate: { ...base.teammate, present: false },
    });
    let elapsedMs = 0;
    let shots = 0;

    while (elapsedMs < 1000 && shots === 0) {
      state = tickSplit(state, IDLE_INPUT, 16);
      elapsedMs += 16;
      shots += collect(state.events, 'enemy-shot').length;
    }

    expect(shots).toBe(1);
    expect(elapsedMs).toBeLessThan(750);
  });

  it('never spawns more than five bots across a long defused round (3 + 2, no extra waves)', () => {
    // Sit ____ on the spike, invulnerable, holding the defuse the entire time so
    // the two-bot ambush drops on the first tap. This is the worst case for spawn
    // count — the opening three PLUS the ambush — and it must never exceed five.
    // Ride well past the old ~T-35s (25s) timer mark to prove no third wave.
    let state = setPlayerPos(withState({ enemies: createSplitState(7).enemies }), SPIKE);
    let maxSpawned = state.enemies.length;
    let maxAlive = aliveEnemyCount(state);

    for (let t = 0; t < 55000; t += 250) {
      state = { ...state, player: { ...state.player, invulnMs: 5000 } };
      state = tickSplit(state, { ...IDLE_INPUT, holdDefuse: true }, 250);
      // enemies[] accumulates dead bots within a round, so its length is the true
      // TOTAL-spawned tally — the count that must be capped at five.
      maxSpawned = Math.max(maxSpawned, state.enemies.length);
      maxAlive = Math.max(maxAlive, aliveEnemyCount(state));
      if (state.phase === 'won') {
        break;
      }
    }

    expect(maxSpawned).toBe(5);
    expect(maxAlive).toBeLessThanOrEqual(5);
  });

  it('total spawns never exceed five across multiple detonation soft-resets', () => {
    // A long simulation that tips into repeated detonation resets: ____ stands
    // off the spike (invulnerable, never defusing) so each 60s fuse runs out and
    // the round soft-resets to a fresh opening three. The per-round spawn tally
    // (enemies.length, which resets on each fresh round) must never exceed five
    // at any tick, and a timed reinforcement event must never fire.
    let state = createSplitState(3);
    let resets = 0;

    for (let t = 0; t < 200000; t += 250) {
      state = { ...state, player: { ...state.player, invulnMs: 1e7 } };
      state = tickSplit(state, IDLE_INPUT, 250);
      resets += collect(state.events, 'round-reset').length;
      expect(state.enemies.length).toBeLessThanOrEqual(5);
      expect(collect(state.events, 'reinforcement')).toHaveLength(0);
    }

    // The sim actually cycled through several rounds (proving resets don't leak
    // or stack spawns).
    expect(resets).toBeGreaterThan(1);
  });
});

describe('contested defuse', () => {
  function hold(state: SplitState, ms: number, holding: boolean): SplitState {
    return tickSplit(state, { ...IDLE_INPUT, holdDefuse: holding }, ms);
  }

  function atSpike(): SplitState {
    // Invulnerable so the first-tap ambush wave (spawned the instant defusing
    // begins) can't interrupt these pure defuse-mechanics assertions.
    const base = setPlayerPos(withState({ enemies: [] }), SPIKE);
    return { ...base, player: { ...base.player, invulnMs: 1e7 } };
  }

  it('accumulates progress only while in radius and holding E', () => {
    const idleAtSpike = atSpike();
    expect(isInDefuseRadius(idleAtSpike)).toBe(true);
    expect(shouldShowDefuseMeter(idleAtSpike)).toBe(false);

    const next = hold(idleAtSpike, 1000, true);

    expect(next.defuse.progressMs).toBeCloseTo(1000, 0);
    expect(next.defuse.defusing).toBe(true);
    expect(defuseProgress(next)).toBeGreaterThan(0);
    expect(shouldShowDefuseMeter(next)).toBe(true);
  });

  it('makes no progress when holding E outside the defuse radius', () => {
    const away = setPlayerPos(withState({ enemies: [] }), { x: 200, y: 400 });

    expect(isInDefuseRadius(away)).toBe(false);

    const next = hold(away, 1000, true);

    expect(next.defuse.progressMs).toBe(0);
    expect(next.defuse.defusing).toBe(false);
  });

  it('snaps progress instantly back to zero on release (pre-checkpoint)', () => {
    // Before the checkpoint the floor is zero, so releasing E snaps straight to
    // zero on the very next tick — there is no slow drain.
    let state = hold(atSpike(), 1000, true);
    expect(state.defuse.progressMs).toBeCloseTo(1000, 0);

    state = hold(state, 32, false);

    expect(state.defuse.progressMs).toBe(0);
    expect(state.defuse.defusing).toBe(false);
    expect(shouldShowDefuseMeter(state)).toBe(false);
  });

  it('snaps back to the half-defuse checkpoint (never below) once reached', () => {
    let state = hold(atSpike(), 3500, true);

    expect(state.defuse.checkpointReached).toBe(true);
    expect(collect(state.events, 'defuse-checkpoint')).toHaveLength(1);
    expect(defuseProgress(state)).toBeCloseTo(0.5, 1);

    // A single release tick snaps exactly to the banked checkpoint, and a long
    // release holds there.
    state = hold(state, 32, false);
    expect(state.defuse.progressMs).toBe(SPLIT_CONFIG.defuse.checkpointMs);

    state = hold(state, 8000, false);
    expect(state.defuse.progressMs).toBe(SPLIT_CONFIG.defuse.checkpointMs);
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

describe('defuse checkpoint at 3.5s (Valorant half-defuse semantics)', () => {
  function atSpike(): SplitState {
    const base = setPlayerPos(withState({ enemies: [] }), SPIKE);
    return { ...base, player: { ...base.player, invulnMs: 1e7 } };
  }

  function hold(state: SplitState, ms: number, holding: boolean): SplitState {
    return tickSplit(state, { ...IDLE_INPUT, holdDefuse: holding }, ms);
  }

  it('is a 7.0s total hold with the checkpoint exactly at the 3.5s half-mark', () => {
    expect(SPLIT_CONFIG.defuse.totalMs).toBe(7000);
    expect(SPLIT_CONFIG.defuse.checkpointMs).toBe(3500);
    expect(SPLIT_CONFIG.defuse.checkpointMs).toBe(SPLIT_CONFIG.defuse.totalMs / 2);
  });

  it('departs Omen once, immediately after banking the half-defuse checkpoint', () => {
    const state = hold(atSpike(), SPLIT_CONFIG.defuse.checkpointMs, true);

    expect(state.teammate.present).toBe(false);
    expect(state.events.map((event) => event.type).slice(-2)).toEqual([
      'defuse-checkpoint',
      'teammate-departed',
    ]);
    expect(
      state.events.find((event) => event.type === 'teammate-departed'),
    ).toMatchObject({
      type: 'teammate-departed',
      at: state.teammate.pos,
    });
  });

  it('does not emit another departure while finishing from the banked half', () => {
    let state = hold(atSpike(), SPLIT_CONFIG.defuse.checkpointMs, true);

    state = hold(state, 500, false);
    expect(state.teammate.present).toBe(false);
    expect(collect(state.events, 'teammate-departed')).toHaveLength(0);

    state = hold(state, SPLIT_CONFIG.defuse.checkpointMs, true);
    expect(isSplitWon(state)).toBe(true);
    expect(state.teammate.present).toBe(false);
    expect(collect(state.events, 'teammate-departed')).toHaveLength(0);
  });

  it('keeps Omen absent when a hit interrupts progress above the banked half', () => {
    let state = hold(atSpike(), SPLIT_CONFIG.defuse.checkpointMs + 1000, true);
    state = {
      ...state,
      player: { ...state.player, invulnMs: 0 },
    };

    state = damagePlayer(state);

    expect(state.defuse.progressMs).toBe(SPLIT_CONFIG.defuse.checkpointMs);
    expect(state.teammate.present).toBe(false);
  });

  it('restores Omen when death starts a fully fresh round', () => {
    let state = hold(atSpike(), SPLIT_CONFIG.defuse.checkpointMs, true);
    state = {
      ...state,
      player: { ...state.player, hearts: 1, invulnMs: 0 },
    };

    state = damagePlayer(state);
    expect(state.phase).toBe('dead');
    expect(state.teammate.present).toBe(false);

    state = tickSplit(state, IDLE_INPUT, SPLIT_CONFIG.death.holdMs + 50);
    expect(state.phase).toBe('retake');
    expect(state.teammate.present).toBe(true);
  });

  it('restores Omen when detonation starts a fully fresh round', () => {
    let state = hold(atSpike(), SPLIT_CONFIG.defuse.checkpointMs, true);
    state = { ...state, spikeTimerMs: 1 };

    state = tickSplit(state, IDLE_INPUT, 50);
    expect(state.phase).toBe('detonated');
    expect(state.teammate.present).toBe(false);

    state = tickSplit(state, IDLE_INPUT, SPLIT_CONFIG.detonation.holdMs + 50);
    expect(state.phase).toBe('retake');
    expect(state.teammate.present).toBe(true);
  });

  it('releasing BEFORE 3.5s resets progress all the way to zero', () => {
    let state = hold(atSpike(), SPLIT_CONFIG.defuse.checkpointMs - 1, true);
    expect(state.defuse.checkpointReached).toBe(false);
    expect(state.defuse.progressMs).toBeCloseTo(SPLIT_CONFIG.defuse.checkpointMs - 1, 0);
    expect(state.teammate.present).toBe(true);
    expect(collect(state.events, 'teammate-departed')).toHaveLength(0);

    state = hold(state, 32, false); // release
    expect(state.defuse.progressMs).toBe(0);
  });

  it('releasing AFTER crossing 3.5s restarts from the checkpoint, not zero', () => {
    let state = hold(atSpike(), 3600, true); // cross the checkpoint
    expect(state.defuse.checkpointReached).toBe(true);
    expect(collect(state.events, 'defuse-checkpoint')).toHaveLength(1);

    state = hold(state, 32, false); // release
    expect(state.defuse.progressMs).toBe(SPLIT_CONFIG.defuse.checkpointMs);

    // Resuming continues from the banked 3.5s, so 3.5s more of hold wins.
    state = hold(state, 3500, true);
    expect(isSplitWon(state)).toBe(true);
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
