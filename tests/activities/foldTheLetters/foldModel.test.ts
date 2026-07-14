import { describe, expect, it } from 'vitest';
import {
  advanceComponent,
  applyKindle,
  applyRoll,
  assembledComponentCount,
  BOATIGAMI_COMPLETE_LINE,
  BOATIGAMI_OPENING_LINE,
  commitFold,
  componentProgress,
  createRitualState,
  currentComponent,
  currentFoldCrease,
  currentHullCrease,
  currentHullShape,
  currentVerb,
  FOLD_COMMIT_THRESHOLD,
  FOLD_COMMIT_THRESHOLD_OPEN,
  foldCommitThreshold,
  FOLD_COMPONENTS,
  HOIST_COMPLETE_THRESHOLD,
  HULL_CREASES,
  isAssembled,
  isCatchingWind,
  isComplete,
  KINDLE_TARGET_MS,
  LANTERN_STAVES,
  releaseFold,
  ritualProgress,
  rollNoteIndex,
  ROLL_NOTE_COUNT,
  ROLL_TARGET,
  SAIL_FOLD_CREASE,
  SAIL_FACE_LINES,
  setFoldProgress,
  setHoistProgress,
  willCommitFold,
  type RitualState,
} from '../../../src/activities/foldTheLetters/foldModel';

/** Drives one fold all the way home (drag past the threshold, then release). */
function fold(state: RitualState): RitualState {
  return releaseFold(setFoldProgress(state, 1));
}

/** Folds the whole hull (three folds) to the assembled boat. */
function foldHull(start: RitualState): RitualState {
  let state = start;
  for (let i = 0; i < HULL_CREASES.length; i += 1) {
    expect(currentHullCrease(state)).toBeDefined();
    state = fold(state);
  }
  return state;
}

/** Makes the sail triangle, then hoists it to the masthead. */
function assembleSail(start: RitualState): RitualState {
  let state = fold(start);
  expect(state.sailFolded).toBe(true);
  return setHoistProgress(state, 1);
}

function assembleLantern(start: RitualState): RitualState {
  let state = start;
  for (let i = 0; i < 200 && currentVerb(state) === 'roll'; i += 1) {
    state = applyRoll(state, 0.3);
  }
  expect(currentVerb(state)).toBe('kindle');
  for (let i = 0; i < 200 && !isAssembled(state); i += 1) {
    state = applyKindle(state, 60, true);
  }
  return state;
}

describe('keepsake ritual model — components & verbs', () => {
  it('keeps the edited Boatigami narrative prose in ritual order', () => {
    expect(BOATIGAMI_OPENING_LINE).toBe(
      'Three keepsakes, carried a long way. Give them to the water.',
    );
    expect(HULL_CREASES.map((crease) => crease.snippet)).toEqual([
      '',
      '',
      '',
    ]);
    expect(FOLD_COMPONENTS[0].assembledLine).toBe(
      'The hull holds its shape.',
    );
    expect(SAIL_FOLD_CREASE.snippet).toBe('');
    expect(SAIL_FACE_LINES).toEqual([
      '',
      '',
      '',
      '',
    ]);
    expect(FOLD_COMPONENTS[1].assembledLine).toBe(
      'The sail catches and holds.',
    );
    expect(LANTERN_STAVES).toEqual([
      '𝄞 the piece, finally played',
      'played once, all the way through',
    ]);
    expect(FOLD_COMPONENTS[2].assembledLine).toBe(
      'The music curls into a lantern, and the light comes up through the notes.',
    );
    expect(BOATIGAMI_COMPLETE_LINE).toBe(
      'The boat opens out, dimensional and whole. Its lantern catches.',
    );
  });

  it('orders the three components with their own verbs and sources', () => {
    expect(FOLD_COMPONENTS.map((c) => c.id)).toEqual(['hull', 'sail', 'lantern']);
    expect(FOLD_COMPONENTS.map((c) => c.verb)).toEqual(['fold', 'hoist', 'roll']);
    expect(FOLD_COMPONENTS.map((c) => c.letterKeepsakeId)).toEqual([
      'glowing-koi-scale',
      'defused-spike-charm',
      'recipient-sheet-music',
    ]);
  });

  it('starts on the hull, first fold, fold verb, zero live progress', () => {
    const state = createRitualState();
    expect(state.phase).toBe('working');
    expect(currentComponent(state)?.id).toBe('hull');
    expect(currentVerb(state)).toBe('fold');
    expect(currentHullCrease(state)?.id).toBe('hull-1');
    expect(currentFoldCrease(state)?.id).toBe('hull-1');
    expect(state.foldProgress).toBe(0);
    expect(assembledComponentCount(state)).toBe(0);
    expect(ritualProgress(state)).toBe(0);
  });
});

describe('hull — three-fold paper-boat sequence, derived silhouettes', () => {
  it('is exactly three folds, sheet → book → peak → boat, each derived from the last', () => {
    expect(HULL_CREASES).toHaveLength(3);
    expect(HULL_CREASES.map((c) => c.id)).toEqual(['hull-1', 'hull-2', 'hull-3']);
    expect(HULL_CREASES.map((c) => c.fromShape)).toEqual(['sheet', 'book', 'peak']);
    expect(HULL_CREASES.map((c) => c.toShape)).toEqual(['book', 'peak', 'boat']);
    expect(HULL_CREASES.map((c) => c.kind)).toEqual(['reflect', 'corners', 'open']);
    // The chain is continuous: each fold's result is the next fold's start.
    for (let i = 1; i < HULL_CREASES.length; i += 1) {
      expect(HULL_CREASES[i].fromShape).toBe(HULL_CREASES[i - 1].toShape);
    }
  });

  it('advances the rendered silhouette fold by fold to the boat', () => {
    let state = createRitualState();
    const seen = [currentHullShape(state)];
    for (let i = 0; i < HULL_CREASES.length; i += 1) {
      state = fold(state);
      seen.push(currentHullShape(state));
    }
    expect(seen).toEqual(['sheet', 'book', 'peak', 'boat']);
    expect(isAssembled(state)).toBe(true);
    expect(currentHullShape(state)).toBe('boat');
  });
});

describe('verb: FOLD — continuous direct manipulation', () => {
  it('tracks live fold progress and reports commit intent at the threshold', () => {
    let state = createRitualState();
    expect(willCommitFold(state)).toBe(false);

    state = setFoldProgress(state, 0.3);
    expect(state.foldProgress).toBeCloseTo(0.3, 6);
    expect(willCommitFold(state)).toBe(false);
    expect(currentHullCrease(state)?.id).toBe('hull-1'); // not committed yet

    state = setFoldProgress(state, FOLD_COMMIT_THRESHOLD);
    expect(willCommitFold(state)).toBe(true);

    // Progress clamps to 0..1.
    expect(setFoldProgress(state, 5).foldProgress).toBe(1);
    expect(setFoldProgress(state, -5).foldProgress).toBe(0);
  });

  it('releasing early falls the flap back open (no commit, no penalty)', () => {
    let state = setFoldProgress(createRitualState(), 0.4);
    state = releaseFold(state);
    expect(state.foldProgress).toBe(0);
    expect(state.hullCreaseIndex).toBe(0); // did not advance
    expect(currentHullShape(state)).toBe('sheet');
  });

  it('releasing past the threshold settles the fold home and resets progress', () => {
    let state = setFoldProgress(createRitualState(), 0.8);
    state = releaseFold(state);
    expect(state.hullCreaseIndex).toBe(1);
    expect(state.foldProgress).toBe(0);
    expect(currentHullShape(state)).toBe('book');
  });

  it('commitFold clicks the hull together after the last fold', () => {
    let state = createRitualState();
    for (let i = 1; i < HULL_CREASES.length; i += 1) {
      state = commitFold(state);
      expect(state.phase).toBe('working');
      expect(currentHullCrease(state)?.id).toBe(HULL_CREASES[i].id);
    }
    state = commitFold(state);
    expect(isAssembled(state)).toBe(true);
    expect(currentHullCrease(state)).toBeUndefined();
    expect(assembledComponentCount(state)).toBe(1);
  });

  it('live fold progress feeds component progress continuously', () => {
    const a = setFoldProgress(createRitualState(), 0.0);
    const b = setFoldProgress(createRitualState(), 0.5);
    expect(componentProgress(b)).toBeGreaterThan(componentProgress(a));
    // First of three folds, half-dragged → about one sixth of the hull.
    expect(componentProgress(b)).toBeCloseTo(0.5 / 3, 6);
  });

  it('commits the open-out fold (hull → boat) on a shorter pull than a crease fold', () => {
    // The crease folds (hull-1 reflect, hull-2 corners) use the standard threshold.
    let state = createRitualState();
    expect(currentFoldCrease(state)?.kind).toBe('reflect');
    expect(foldCommitThreshold(state)).toBe(FOLD_COMMIT_THRESHOLD);
    expect(willCommitFold(setFoldProgress(state, FOLD_COMMIT_THRESHOLD - 0.05))).toBe(false);

    state = fold(state); // → hull-2 (corners)
    expect(foldCommitThreshold(state)).toBe(FOLD_COMMIT_THRESHOLD);
    state = fold(state); // → hull-3 (open)
    expect(currentFoldCrease(state)?.kind).toBe('open');
    expect(foldCommitThreshold(state)).toBe(FOLD_COMMIT_THRESHOLD_OPEN);
    expect(FOLD_COMMIT_THRESHOLD_OPEN).toBeLessThan(FOLD_COMMIT_THRESHOLD);

    // A medium pull that would NOT commit a crease fold DOES commit the open fold.
    const medium = FOLD_COMMIT_THRESHOLD_OPEN + 0.02;
    expect(medium).toBeLessThan(FOLD_COMMIT_THRESHOLD);
    expect(willCommitFold(setFoldProgress(state, medium))).toBe(true);
    expect(isAssembled(releaseFold(setFoldProgress(state, medium)))).toBe(true);

    // Below the open threshold falls the flap back open (no commit, no penalty).
    const shy = releaseFold(setFoldProgress(state, FOLD_COMMIT_THRESHOLD_OPEN - 0.05));
    expect(shy.foldProgress).toBe(0);
    expect(isAssembled(shy)).toBe(false);
  });
});

describe('verb: HOIST (sail) — pinned to the pointer', () => {
  it('makes the triangle with a fold, then sets absolute hoist', () => {
    let state = advanceComponent(foldHull(createRitualState()));
    expect(currentComponent(state)?.id).toBe('sail');
    expect(currentVerb(state)).toBe('fold');
    expect(currentFoldCrease(state)?.id).toBe(SAIL_FOLD_CREASE.id);

    state = fold(state);
    expect(state.sailFolded).toBe(true);
    expect(currentVerb(state)).toBe('hoist');

    const mid = setHoistProgress(state, 0.5);
    expect(mid.hoistProgress).toBe(0.5);
    // It tracks the pointer both ways while below the top.
    expect(setHoistProgress(mid, 0.2).hoistProgress).toBe(0.2);
  });

  it('reports catching wind inside a wobble window (view/feel cue)', () => {
    expect(isCatchingWind(0.1)).toBe(false);
    expect(isCatchingWind(0.4)).toBe(true);
  });

  it('assembles once hoisted to the top', () => {
    const state = assembleSail(advanceComponent(foldHull(createRitualState())));
    expect(state.hoistProgress).toBe(1);
    expect(isAssembled(state)).toBe(true);
    expect(assembledComponentCount(state)).toBe(2);
  });

  it('snaps home when the sail is dragged to within the masthead tolerance', () => {
    let base = advanceComponent(foldHull(createRitualState()));
    base = fold(base);
    expect(currentVerb(base)).toBe('hoist');

    // Just short of the tolerance: it tracks the pointer, does NOT snap home.
    const shy = setHoistProgress(base, HOIST_COMPLETE_THRESHOLD - 0.01);
    expect(shy.hoistProgress).toBeCloseTo(HOIST_COMPLETE_THRESHOLD - 0.01, 6);
    expect(isAssembled(shy)).toBe(false);

    // A near-masthead release (a hair under 1) snaps fully home and assembles.
    const nearTop = setHoistProgress(base, 0.9996);
    expect(nearTop.hoistProgress).toBe(1);
    expect(isAssembled(nearTop)).toBe(true);

    // Exactly at the tolerance boundary counts as home too.
    const atThreshold = setHoistProgress(base, HOIST_COMPLETE_THRESHOLD);
    expect(atThreshold.hoistProgress).toBe(1);
    expect(isAssembled(atThreshold)).toBe(true);
  });
});

describe('verb: ROLL then KINDLE (lantern)', () => {
  it('rolls with swept angle and sounds notes one by one', () => {
    let state = lanternStart();
    expect(currentVerb(state)).toBe('roll');
    expect(rollNoteIndex(state)).toBe(0);
    state = applyRoll(state, ROLL_TARGET / 2);
    expect(rollNoteIndex(state)).toBe(ROLL_NOTE_COUNT / 2);
    state = applyRoll(state, -ROLL_TARGET);
    expect(state.rollAngle).toBe(ROLL_TARGET);
    expect(currentVerb(state)).toBe('kindle');
  });

  it('rolls fully into the lantern in one full turn (2π) of the tube surface', () => {
    expect(ROLL_TARGET).toBeCloseTo(Math.PI * 2, 6);
  });

  it('distributes all six note plucks evenly across the full roll', () => {
    const seen: number[] = [];
    for (let i = 0; i <= ROLL_NOTE_COUNT; i += 1) {
      const state = applyRoll(lanternStart(), (ROLL_TARGET * i) / ROLL_NOTE_COUNT);
      seen.push(rollNoteIndex(state));
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('kindles by holding, and bleeds off (but never fails) when released', () => {
    let state = lanternStart();
    state = applyRoll(state, ROLL_TARGET);
    expect(currentVerb(state)).toBe('kindle');

    state = applyKindle(state, 500, true);
    expect(state.kindleMs).toBe(500);
    const released = applyKindle(state, 500, false);
    expect(released.kindleMs).toBeLessThan(500);
    expect(released.kindleMs).toBeGreaterThan(0);
    const overReleased = applyKindle({ ...state, kindleMs: 100 }, 10_000, false);
    expect(overReleased.kindleMs).toBe(0);

    state = applyKindle(state, KINDLE_TARGET_MS, true);
    expect(state.kindleMs).toBe(KINDLE_TARGET_MS);
    expect(isAssembled(state)).toBe(true);
  });
});

describe('progression & completeness', () => {
  it('completes only after all three components assemble and advance', () => {
    let state = createRitualState();
    state = advanceComponent(foldHull(state));
    expect(isComplete(state)).toBe(false);
    state = advanceComponent(assembleSail(state));
    expect(isComplete(state)).toBe(false);
    state = advanceComponent(assembleLantern(state));
    expect(isComplete(state)).toBe(true);
    expect(assembledComponentCount(state)).toBe(FOLD_COMPONENTS.length);
    expect(ritualProgress(state)).toBe(1);

    // Terminal: further gestures/advances do nothing.
    expect(setFoldProgress(state, 1)).toEqual(state);
    expect(commitFold(state)).toEqual(state);
    expect(setHoistProgress(state, 1)).toEqual(state);
    expect(applyRoll(state, 1)).toEqual(state);
    expect(applyKindle(state, 100, true)).toEqual(state);
    expect(advanceComponent(state)).toEqual(state);
  });

  it('reports monotonically increasing ritual progress', () => {
    let state = createRitualState();
    let last = -1;
    const steps: RitualState[] = [];
    // Hull — sample the live progress mid-fold too.
    for (let i = 0; i < HULL_CREASES.length; i += 1) {
      steps.push(state);
      steps.push(setFoldProgress(state, 0.5));
      state = fold(state);
    }
    state = advanceComponent(state);
    steps.push(state);
    // Sail
    state = fold(state);
    steps.push(state);
    for (let p = 0; p <= 1.0001; p += 0.2) {
      state = setHoistProgress(state, Math.min(1, p));
      steps.push(state);
    }
    state = advanceComponent(state);
    steps.push(state);
    // Lantern
    for (let i = 0; i < 200 && currentVerb(state) === 'roll'; i += 1) {
      state = applyRoll(state, 0.3);
      if (i % 20 === 0) steps.push(state);
    }
    for (let i = 0; i < 200 && !isAssembled(state); i += 1) {
      state = applyKindle(state, 60, true);
      if (i % 20 === 0) steps.push(state);
    }
    state = advanceComponent(state);
    steps.push(state);

    for (const s of steps) {
      const p = ritualProgress(s);
      expect(p).toBeGreaterThanOrEqual(last - 1e-9);
      last = p;
    }
    expect(ritualProgress(state)).toBe(1);
    expect(componentProgress(state)).toBe(1);
  });
});

function lanternStart(): RitualState {
  return { ...createRitualState(), componentIndex: 2, phase: 'working' };
}
