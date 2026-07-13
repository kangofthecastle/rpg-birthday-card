import { describe, expect, it } from 'vitest';
import {
  FISH_MAX_PITCH,
  fishSpriteFacing,
} from '../../../src/activities/friendoneFishing/fishSprites';
import {
  createFishBehaviorParams,
  createFishBehaviorState,
  updateFishBehavior,
  type FishBehaviorState,
  type FishBehaviorTarget,
} from '../../../src/activities/friendoneFishing/fishBehavior';

const BOUNDS = { minX: 196, maxX: 606, minY: 214, maxY: 332 } as const;

describe('fishSpriteFacing', () => {
  it('faces right (mirrored) with an upright, near-level pitch when swimming right', () => {
    const facing = fishSpriteFacing(0);
    expect(facing.flipX).toBe(true);
    // Regression: the old code rotated by heading - PI, so swimming right rolled
    // the side-view sprite ~180deg (belly-up / tail-first). It must stay level.
    expect(Math.abs(facing.rotation)).toBeLessThan(0.05);
  });

  it('faces left (unmirrored) and level when swimming left', () => {
    const facing = fishSpriteFacing(Math.PI);
    expect(facing.flipX).toBe(false);
    expect(Math.abs(facing.rotation)).toBeLessThan(0.05);
  });

  it('noses down-right when swimming down-right', () => {
    const facing = fishSpriteFacing(0.3);
    expect(facing.flipX).toBe(true);
    expect(facing.rotation).toBeCloseTo(0.3, 5);
  });

  it('noses down-left (unmirrored) when swimming down-left', () => {
    const facing = fishSpriteFacing(Math.PI - 0.3);
    expect(facing.flipX).toBe(false);
    // heading - PI wrapped => -0.3
    expect(facing.rotation).toBeCloseTo(-0.3, 5);
  });

  it('never rolls past the upright pitch clamp for any heading', () => {
    for (let a = -Math.PI; a <= Math.PI; a += Math.PI / 24) {
      const facing = fishSpriteFacing(a);
      expect(Math.abs(facing.rotation)).toBeLessThanOrEqual(FISH_MAX_PITCH + 1e-9);
    }
  });

  it('clamps near-vertical travel to the max pitch instead of standing on its nose', () => {
    expect(fishSpriteFacing(Math.PI / 2).rotation).toBeCloseTo(FISH_MAX_PITCH, 5);
    expect(fishSpriteFacing(-Math.PI / 2).rotation).toBeCloseTo(-FISH_MAX_PITCH, 5);
  });
});

describe('fish facing follows model velocity', () => {
  function run(
    state: FishBehaviorState,
    target: FishBehaviorTarget,
    steps: number,
  ): FishBehaviorState {
    const params = createFishBehaviorParams(60, BOUNDS);
    let next = state;
    for (let i = 0; i < steps; i += 1) {
      next = updateFishBehavior(next, target, params, 32);
    }
    return next;
  }

  it('flips to face the bobber it is swimming toward', () => {
    // Fish starts on the right; bobber is far to its left, so it swims left and
    // must face left (unmirrored art).
    const start = createFishBehaviorState({ x: 560, y: 286 }, 4242);
    const state = run(start, { x: 210, y: 250, active: true, reeling: 0.5 }, 30);
    expect(state.velocity.x).toBeLessThan(0);
    const facing = fishSpriteFacing(state.heading);
    expect(facing.flipX).toBe(false);
    // Heading points the way it travels.
    expect(Math.cos(state.heading)).toBeLessThan(0);
  });
});
