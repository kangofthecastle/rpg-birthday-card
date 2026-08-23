import { describe, expect, it } from 'vitest';
import {
  LINE_BREAK_MISSES,
  FRIEND_ONE_FISH_SEQUENCE,
  TIMING_TARGET_COUNT,
  attemptFishingTarget,
  createFishingRound,
  getFishingCompletion,
  getMarkerSpeedPerSecond,
  getTimingTarget,
  isMarkerInTarget,
  updateFishingRound,
} from '../../../src/activities/friendoneFishing/fishingModel';

describe('fishingModel', () => {
  it('defines three progressively harder fish ending with the glowing koi', () => {
    expect(FRIEND_ONE_FISH_SEQUENCE.map((fish) => fish.id)).toEqual([
      'pond-drifter',
      'reed-darter',
      'glowing-koi',
    ]);

    const [drifter, darter, koi] = FRIEND_ONE_FISH_SEQUENCE;
    expect(drifter.timingSpeedPerSecond).toBeLessThan(darter.timingSpeedPerSecond);
    expect(darter.timingSpeedPerSecond).toBeLessThan(koi.timingSpeedPerSecond);
    expect(drifter.timingVariability).toBeLessThan(darter.timingVariability);
    expect(darter.timingVariability).toBeLessThan(koi.timingVariability);
    expect(drifter.targetWindowHeights[2]).toBeGreaterThan(koi.targetWindowHeights[2]);
    expect(drifter.timingSpeedPerSecond).toBeGreaterThanOrEqual(215);
    expect(koi.timingSpeedPerSecond).toBeGreaterThanOrEqual(350);
    expect(koi.targetWindowHeights[2]).toBeLessThanOrEqual(9);
    expect(koi.isSpecial).toBe(true);
  });

  it('moves the three targets from bottom to middle to top and narrows them', () => {
    const fish = FRIEND_ONE_FISH_SEQUENCE[0];
    const centers: number[] = [];
    const heights: number[] = [];

    for (let targetIndex = 0; targetIndex < TIMING_TARGET_COUNT; targetIndex += 1) {
      const target = getTimingTarget({ targetIndex }, fish);
      centers.push(target.centerY);
      heights.push(target.height);
    }

    expect(centers[0]).toBeGreaterThan(centers[1]);
    expect(centers[1]).toBeGreaterThan(centers[2]);
    expect(heights[0]).toBeGreaterThan(heights[1]);
    expect(heights[1]).toBeGreaterThan(heights[2]);
  });

  it('uses constant speed for the first target and variable speed afterward', () => {
    const fish = FRIEND_ONE_FISH_SEQUENCE[1];
    const firstA = createFishingRound(fish, { targetIndex: 0, elapsedMs: 0 });
    const firstB = createFishingRound(fish, { targetIndex: 0, elapsedMs: 730 });
    const laterA = createFishingRound(fish, { targetIndex: 2, elapsedMs: 0 });
    const laterB = createFishingRound(fish, { targetIndex: 2, elapsedMs: 730 });

    expect(getMarkerSpeedPerSecond(firstA, fish)).toBe(
      getMarkerSpeedPerSecond(firstB, fish),
    );
    expect(getMarkerSpeedPerSecond(laterA, fish)).not.toBe(
      getMarkerSpeedPerSecond(laterB, fish),
    );
  });

  it('moves the marker automatically and drives reel rotation from the same motion', () => {
    const fish = FRIEND_ONE_FISH_SEQUENCE[0];
    const initial = createFishingRound(fish, {
      markerY: 160,
      markerDirection: 1,
    });
    const next = updateFishingRound(initial, fish, 250);

    expect(next.markerY).toBeGreaterThan(initial.markerY);
    expect(next.reelAngle).toBeGreaterThan(initial.reelAngle);
  });

  it('lands a target only when the moving marker overlaps it', () => {
    const fish = FRIEND_ONE_FISH_SEQUENCE[0];
    const target = getTimingTarget({ targetIndex: 0 }, fish);
    const aligned = createFishingRound(fish, { markerY: target.centerY });

    expect(isMarkerInTarget(aligned, fish)).toBe(true);
    const hit = attemptFishingTarget(aligned, fish);
    expect(hit.outcome).toBe('hit');
    expect(hit.state.targetIndex).toBe(1);
    expect(hit.state.progress).toBeCloseTo(1 / 3);
    expect(hit.state.feedbackKind).toBe('hit');

    const lockedAttempt = attemptFishingTarget(hit.state, fish);
    expect(lockedAttempt.outcome).toBe('ignored');
    expect(lockedAttempt.state).toBe(hit.state);
  });

  it('freezes the marker and reel briefly when the reel catches a target', () => {
    const fish = FRIEND_ONE_FISH_SEQUENCE[0];
    const target = getTimingTarget({ targetIndex: 0 }, fish);
    const hit = attemptFishingTarget(
      createFishingRound(fish, { markerY: target.centerY, reelAngle: 1.25 }),
      fish,
    ).state;
    const duringCatch = updateFishingRound(hit, fish, 150);

    expect(duringCatch.markerY).toBe(hit.markerY);
    expect(duringCatch.reelAngle).toBe(hit.reelAngle);
    expect(duringCatch.feedbackKind).toBe('hit');
  });

  it('breaks the line after repeated misses and restarts only the current fish', () => {
    const fish = FRIEND_ONE_FISH_SEQUENCE[1];
    let state = createFishingRound(fish, {
      markerY: 180,
      targetIndex: 2,
    });

    for (let miss = 1; miss < LINE_BREAK_MISSES; miss += 1) {
      const attempt = attemptFishingTarget(state, fish);
      expect(attempt.outcome).toBe('miss');
      state = updateFishingRound(attempt.state, fish, 200);
    }

    const broken = attemptFishingTarget(state, fish);
    expect(broken.outcome).toBe('line-break');
    expect(broken.state.targetIndex).toBe(0);
    expect(broken.state.progress).toBe(0);
    expect(broken.state.misses).toBe(0);
    expect(broken.state.feedbackKind).toBe('line-break');
  });

  it('catches a fish after all three timing targets are landed', () => {
    const fish = FRIEND_ONE_FISH_SEQUENCE[2];
    let state = createFishingRound(fish);

    for (let targetIndex = 0; targetIndex < TIMING_TARGET_COUNT; targetIndex += 1) {
      const target = getTimingTarget(state, fish);
      state = createFishingRound(fish, {
        markerY: target.centerY,
        markerDirection: state.markerDirection,
        targetIndex: state.targetIndex,
        misses: state.misses,
        elapsedMs: state.elapsedMs,
        reelAngle: state.reelAngle,
      });
      state = attemptFishingTarget(state, fish).state;
      if (targetIndex < TIMING_TARGET_COUNT - 1) {
        state = updateFishingRound(state, fish, 300);
      }
    }

    expect(state.targetIndex).toBe(TIMING_TARGET_COUNT);
    expect(state.progress).toBe(1);
    expect(getFishingCompletion(state)).toBe(true);
  });

  it('keeps large updates close to repeated small timing steps', () => {
    const fish = FRIEND_ONE_FISH_SEQUENCE[2];
    const initial = createFishingRound(fish, {
      markerY: 150,
      markerDirection: 1,
      targetIndex: 2,
      elapsedMs: 310,
    });
    const large = updateFishingRound(initial, fish, 1200);
    let small = initial;

    for (let elapsed = 0; elapsed < 1200; elapsed += 20) {
      small = updateFishingRound(small, fish, 20);
    }

    expect(large.markerY).toBeCloseTo(small.markerY, 8);
    expect(large.reelAngle).toBeCloseTo(small.reelAngle, 8);
    expect(large.markerDirection).toBe(small.markerDirection);
    expect(large.elapsedMs).toBe(small.elapsedMs);
  });
});
