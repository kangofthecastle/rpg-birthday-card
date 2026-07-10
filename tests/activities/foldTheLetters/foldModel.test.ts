import { describe, expect, it } from 'vitest';
import {
  advanceComponent,
  applyFoldDrag,
  applyHoist,
  applyKindle,
  applyRoll,
  assembledComponentCount,
  componentProgress,
  createRitualState,
  currentComponent,
  currentHullCrease,
  currentHullShape,
  currentVerb,
  FOLD_COMPONENTS,
  HULL_CREASES,
  HOIST_GAIN,
  isAssembled,
  isCatchingWind,
  isComplete,
  isValidFoldDrag,
  KINDLE_TARGET_MS,
  ritualProgress,
  rollNoteIndex,
  ROLL_NOTE_COUNT,
  ROLL_TARGET,
  SAIL_FOLD_CREASE,
  type RitualState,
} from '../../../src/activities/foldTheLetters/foldModel';

/** Folds the whole hull with valid direction-aware drags. */
function foldHull(start: RitualState): RitualState {
  let state = start;
  for (let i = 0; i < HULL_CREASES.length; i += 1) {
    const crease = currentHullCrease(state);
    expect(crease).toBeDefined();
    state = applyValidFold(state, crease!);
  }
  return state;
}

function applyValidFold(state: RitualState, crease: (typeof HULL_CREASES)[number]): RitualState {
  const drag =
    crease.dragAxis === 'horizontal'
      ? { dx: 60, dy: 4 }
      : crease.dragAxis === 'vertical'
        ? { dx: 4, dy: 60 }
        : { dx: 50, dy: 50 };
  return applyFoldDrag(state, drag.dx, drag.dy);
}

/** Drives an assembled component on to the next verb/component. */
function assembleSail(start: RitualState): RitualState {
  // fold the triangle, then hoist to the top.
  let state = applyFoldDrag(start, 50, 50);
  expect(state.sailFolded).toBe(true);
  for (let i = 0; i < 400 && !isAssembled(state); i += 1) {
    state = applyHoist(state, 20);
  }
  return state;
}

function assembleLantern(start: RitualState): RitualState {
  let state = start;
  // roll it up
  for (let i = 0; i < 200 && currentVerb(state) === 'roll'; i += 1) {
    state = applyRoll(state, 0.3);
  }
  expect(currentVerb(state)).toBe('kindle');
  // hold to kindle
  for (let i = 0; i < 200 && !isAssembled(state); i += 1) {
    state = applyKindle(state, 60, true);
  }
  return state;
}

describe('keepsake ritual model — components & verbs', () => {
  it('orders the three components with their own verbs and sources', () => {
    expect(FOLD_COMPONENTS.map((c) => c.id)).toEqual(['hull', 'sail', 'lantern']);
    expect(FOLD_COMPONENTS.map((c) => c.verb)).toEqual(['fold', 'hoist', 'roll']);
    expect(FOLD_COMPONENTS.map((c) => c.letterKeepsakeId)).toEqual([
      'glowing-koi-scale',
      'defused-spike-charm',
      'golden-hour-photo',
    ]);
  });

  it('starts on the hull, first crease, fold verb', () => {
    const state = createRitualState();
    expect(state.phase).toBe('working');
    expect(currentComponent(state)?.id).toBe('hull');
    expect(currentVerb(state)).toBe('fold');
    expect(currentHullCrease(state)?.id).toBe('hull-1');
    expect(assembledComponentCount(state)).toBe(0);
    expect(ritualProgress(state)).toBe(0);
  });
});

describe('hull — authentic paper-boat fold sequence', () => {
  it('folds the traditional hat-to-boat sequence, one shape per crease', () => {
    // Six creases, each turning one recognizable silhouette into the next:
    // sheet → book → peak → hat → diamond → kite → boat.
    expect(HULL_CREASES).toHaveLength(6);
    expect(HULL_CREASES.map((c) => c.id)).toEqual([
      'hull-1',
      'hull-2',
      'hull-3',
      'hull-4',
      'hull-5',
      'hull-6',
    ]);
    expect(HULL_CREASES.map((c) => c.fromShape)).toEqual([
      'sheet',
      'book',
      'peak',
      'hat',
      'diamond',
      'kite',
    ]);
    expect(HULL_CREASES.map((c) => c.toShape)).toEqual([
      'book',
      'peak',
      'hat',
      'diamond',
      'kite',
      'boat',
    ]);
    // The chain is continuous: each crease's result is the next crease's start.
    for (let i = 1; i < HULL_CREASES.length; i += 1) {
      expect(HULL_CREASES[i].fromShape).toBe(HULL_CREASES[i - 1].toShape);
    }
  });

  it('advances the rendered silhouette shape crease by crease to the boat', () => {
    let state = createRitualState();
    expect(currentHullShape(state)).toBe('sheet');
    const seen = [currentHullShape(state)];
    for (let i = 0; i < HULL_CREASES.length; i += 1) {
      state = applyValidFold(state, currentHullCrease(state) ?? HULL_CREASES[i]);
      seen.push(currentHullShape(state));
    }
    expect(seen).toEqual(['sheet', 'book', 'peak', 'hat', 'diamond', 'kite', 'boat']);
    // Once every crease is folded the hull IS the boat, and it has clicked
    // together (assembled).
    expect(isAssembled(state)).toBe(true);
    expect(currentHullShape(state)).toBe('boat');
  });
});

describe('verb: FOLD (hull) — direction-aware', () => {
  it('accepts a drag only along the required perpendicular axis', () => {
    const vertical = HULL_CREASES.find((c) => c.dragAxis === 'vertical')!;
    expect(isValidFoldDrag(vertical, 4, 60)).toBe(true); // moving down the sheet
    expect(isValidFoldDrag(vertical, 60, 4)).toBe(false); // wrong axis
    expect(isValidFoldDrag(vertical, 2, 5)).toBe(false); // too short

    const horizontal = HULL_CREASES.find((c) => c.dragAxis === 'horizontal')!;
    expect(isValidFoldDrag(horizontal, 60, 4)).toBe(true);
    expect(isValidFoldDrag(horizontal, 4, 60)).toBe(false);

    expect(isValidFoldDrag(SAIL_FOLD_CREASE, 50, 50)).toBe(true); // diagonal corner
    expect(isValidFoldDrag(SAIL_FOLD_CREASE, 60, 2)).toBe(false); // not diagonal
  });

  it('a wrong-direction drag is a no-op; the crease does not advance', () => {
    const state = createRitualState();
    const crease = currentHullCrease(state)!; // hull-1 is vertical
    const wrong = crease.dragAxis === 'vertical' ? applyFoldDrag(state, 60, 2) : applyFoldDrag(state, 2, 60);
    expect(wrong).toEqual(state);
  });

  it('folds crease by crease and clicks the hull together after the last', () => {
    let state = createRitualState();
    for (let i = 1; i < HULL_CREASES.length; i += 1) {
      const crease = currentHullCrease(state)!;
      state = applyValidFold(state, crease);
      expect(state.phase).toBe('working');
      expect(currentHullCrease(state)?.id).toBe(HULL_CREASES[i].id);
    }
    const last = currentHullCrease(state)!;
    state = applyValidFold(state, last);
    expect(isAssembled(state)).toBe(true);
    expect(currentHullCrease(state)).toBeUndefined();
    expect(assembledComponentCount(state)).toBe(1);
  });
});

describe('verb: HOIST (sail)', () => {
  it('makes the triangle with a fold, then only upward drags raise the sail', () => {
    let state = advanceComponent(foldHull(createRitualState()));
    expect(currentComponent(state)?.id).toBe('sail');
    expect(currentVerb(state)).toBe('fold');

    state = applyFoldDrag(state, 50, 50);
    expect(state.sailFolded).toBe(true);
    expect(currentVerb(state)).toBe('hoist');

    const downward = applyHoist(state, -30);
    expect(downward).toEqual(state); // dragging down does nothing

    const up = applyHoist(state, 30);
    expect(up.hoistProgress).toBeGreaterThan(state.hoistProgress);
  });

  it('tugs harder inside a wind-catch window (lower gain)', () => {
    // Same upward pixels gain less progress while catching wind.
    let open: RitualState = { ...baseSail(), hoistProgress: 0.1 };
    let caught: RitualState = { ...baseSail(), hoistProgress: 0.4 };
    expect(isCatchingWind(0.1)).toBe(false);
    expect(isCatchingWind(0.4)).toBe(true);
    const openGain = applyHoist(open, 20).hoistProgress - 0.1;
    const caughtGain = applyHoist(caught, 20).hoistProgress - 0.4;
    expect(caughtGain).toBeLessThan(openGain);
    expect(openGain).toBeCloseTo(20 * HOIST_GAIN, 6);
  });

  it('assembles once hoisted to the top', () => {
    const state = assembleSail(advanceComponent(foldHull(createRitualState())));
    expect(state.hoistProgress).toBe(1);
    expect(isAssembled(state)).toBe(true);
    expect(assembledComponentCount(state)).toBe(2);
  });
});

describe('verb: ROLL then KINDLE (lantern)', () => {
  it('rolls with swept angle and sounds notes one by one', () => {
    let state = lanternStart();
    expect(currentVerb(state)).toBe('roll');
    expect(rollNoteIndex(state)).toBe(0);
    state = applyRoll(state, ROLL_TARGET / 2);
    expect(rollNoteIndex(state)).toBe(ROLL_NOTE_COUNT / 2);
    // roll direction is agnostic — negative deltas still wrap.
    state = applyRoll(state, -ROLL_TARGET);
    expect(state.rollAngle).toBe(ROLL_TARGET);
    expect(currentVerb(state)).toBe('kindle');
  });

  it('kindles by holding, and bleeds off (but never fails) when released', () => {
    let state = lanternStart();
    state = applyRoll(state, ROLL_TARGET);
    expect(currentVerb(state)).toBe('kindle');

    state = applyKindle(state, 500, true);
    expect(state.kindleMs).toBe(500);
    // Releasing decays, but slower than it builds and never below zero.
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
    expect(applyFoldDrag(state, 60, 4)).toEqual(state);
    expect(applyHoist(state, 40)).toEqual(state);
    expect(applyRoll(state, 1)).toEqual(state);
    expect(applyKindle(state, 100, true)).toEqual(state);
    expect(advanceComponent(state)).toEqual(state);
  });

  it('reports monotonically increasing ritual progress', () => {
    let state = createRitualState();
    let last = -1;
    const steps: RitualState[] = [];
    // Hull
    for (let i = 0; i < HULL_CREASES.length; i += 1) {
      steps.push(state);
      state = applyValidFold(state, currentHullCrease(state)!);
    }
    state = advanceComponent(state);
    steps.push(state);
    // Sail
    state = applyFoldDrag(state, 50, 50);
    steps.push(state);
    for (let i = 0; i < 400 && !isAssembled(state); i += 1) {
      state = applyHoist(state, 20);
      if (i % 40 === 0) steps.push(state);
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

function baseSail(): RitualState {
  return {
    ...createRitualState(),
    componentIndex: 1,
    phase: 'working',
    sailFolded: true,
  };
}

function lanternStart(): RitualState {
  return { ...createRitualState(), componentIndex: 2, phase: 'working' };
}
