import { describe, expect, it } from 'vitest';
import {
  CATCH_BAR_HEIGHT,
  FISHING_METER_HEIGHT,
  FRIEND_ONE_FISH_SEQUENCE,
  createFishingRound,
  getFishingCompletion,
  isFishInCatchBar,
  updateFishingRound,
} from '../../../src/activities/friendoneFishing/fishingModel';

describe('fishingModel', () => {
  it('defines a three-fish sequence ending with a special glowing koi', () => {
    expect(FRIEND_ONE_FISH_SEQUENCE.map((fish) => fish.id)).toEqual([
      'pond-drifter',
      'reed-darter',
      'glowing-koi',
    ]);

    const [first, second, third] = FRIEND_ONE_FISH_SEQUENCE;

    expect(first.speedPerSecond).toBeLessThan(second.speedPerSecond);
    expect(third.isSpecial).toBe(true);
    expect(third.label).toBe('Glowing Koi');
    expect(third.speedPerSecond).toBeGreaterThan(second.speedPerSecond);
    expect(third.burstSpeedMultiplier).toBeGreaterThan(1);
  });

  it('raises the catch bar while held and lowers it when released', () => {
    const fish = FRIEND_ONE_FISH_SEQUENCE[0];
    const initial = createFishingRound(fish, {
      fishY: 180,
      catchBarY: 180,
    });

    const raised = updateFishingRound(initial, fish, { holdActive: true }, 250);
    const lowered = updateFishingRound(raised, fish, { holdActive: false }, 250);

    expect(raised.catchBarY).toBeLessThan(initial.catchBarY);
    expect(lowered.catchBarY).toBeGreaterThan(raised.catchBarY);
    expect(raised.catchBarY).toBeGreaterThanOrEqual(0);
    expect(lowered.catchBarY).toBeLessThanOrEqual(FISHING_METER_HEIGHT - CATCH_BAR_HEIGHT);
  });

  it('fills progress while the fish overlaps the catch bar', () => {
    const fish = FRIEND_ONE_FISH_SEQUENCE[0];
    const initial = createFishingRound(fish, {
      fishY: 200,
      catchBarY: 170,
      progress: 0.25,
    });

    expect(isFishInCatchBar(initial, fish)).toBe(true);

    const next = updateFishingRound(initial, fish, { holdActive: false }, 500);

    expect(next.progress).toBeGreaterThan(initial.progress);
  });

  it('drains progress moderately while the fish is outside the catch bar', () => {
    const fish = FRIEND_ONE_FISH_SEQUENCE[1];
    const initial = createFishingRound(fish, {
      fishY: 20,
      catchBarY: 250,
      progress: 0.7,
    });

    expect(isFishInCatchBar(initial, fish)).toBe(false);

    const next = updateFishingRound(initial, fish, { holdActive: false }, 500);

    expect(next.progress).toBeLessThan(initial.progress);
    expect(next.progress).toBeGreaterThan(0);
  });

  it('reports completion only after progress reaches one', () => {
    const fish = FRIEND_ONE_FISH_SEQUENCE[2];
    const incomplete = createFishingRound(fish, {
      fishY: 200,
      catchBarY: 170,
      progress: 0.99,
    });

    expect(getFishingCompletion(incomplete)).toBe(false);

    const complete = updateFishingRound(incomplete, fish, { holdActive: false }, 1000);

    expect(complete.progress).toBe(1);
    expect(getFishingCompletion(complete)).toBe(true);
  });
});
