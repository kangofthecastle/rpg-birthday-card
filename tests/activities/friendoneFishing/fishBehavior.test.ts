import { describe, expect, it } from 'vitest';
import {
  createFishBehaviorParams,
  createFishBehaviorState,
  isFishBiting,
  spookFish,
  updateFishBehavior,
  type FishBehaviorState,
  type FishBehaviorTarget,
} from '../../../src/activities/friendoneFishing/fishBehavior';

const BOUNDS = { minX: 196, maxX: 606, minY: 214, maxY: 332 } as const;

function params() {
  return createFishBehaviorParams(60, BOUNDS);
}

function distanceTo(state: FishBehaviorState, target: { x: number; y: number }): number {
  return Math.hypot(state.position.x - target.x, state.position.y - target.y);
}

function run(
  state: FishBehaviorState,
  target: FishBehaviorTarget,
  steps: number,
  stepMs = 32,
): FishBehaviorState {
  let next = state;
  for (let i = 0; i < steps; i += 1) {
    next = updateFishBehavior(next, target, params(), stepMs);
  }
  return next;
}

describe('fishBehavior', () => {
  it('closes distance to an active bobber and eventually inspects it', () => {
    const bobber = { x: 210, y: 250 };
    const target: FishBehaviorTarget = { ...bobber, active: true, reeling: 0.5 };
    const start = createFishBehaviorState({ x: 560, y: 286 }, 12345);
    const startDist = distanceTo(start, bobber);

    const later = run(start, target, 90);

    expect(distanceTo(later, bobber)).toBeLessThan(startDist - 60);
    // Somewhere along the way it should have left the roam phase.
    expect(['approach', 'inspect', 'commit']).toContain(later.phase);
  });

  it('stays inside the pond bounds while wandering', () => {
    const target: FishBehaviorTarget = { x: 210, y: 250, active: false, reeling: 0 };
    let state = createFishBehaviorState({ x: 400, y: 270 }, 999);
    for (let i = 0; i < 400; i += 1) {
      state = updateFishBehavior(state, target, params(), 32);
      expect(state.position.x).toBeGreaterThanOrEqual(BOUNDS.minX);
      expect(state.position.x).toBeLessThanOrEqual(BOUNDS.maxX);
      expect(state.position.y).toBeGreaterThanOrEqual(BOUNDS.minY);
      expect(state.position.y).toBeLessThanOrEqual(BOUNDS.maxY);
    }
  });

  it('ignores the bobber when no line is cast (stays roaming)', () => {
    const target: FishBehaviorTarget = { x: 210, y: 250, active: false, reeling: 0 };
    const state = run(createFishBehaviorState({ x: 240, y: 250 }, 7), target, 40);
    expect(state.phase).toBe('roam');
  });

  it('reports a bite once it commits on the bobber', () => {
    const bobber = { x: 210, y: 250 };
    const target: FishBehaviorTarget = { ...bobber, active: true, reeling: 1 };
    // With reeling=1 the fish is maximally willing to commit; run long enough to
    // pass through approach + inspect into commit.
    const state = run(createFishBehaviorState({ x: 320, y: 260 }, 55), target, 220);
    expect(distanceTo(state, bobber)).toBeLessThan(30);
    expect(isFishBiting(state)).toBe(true);
  });

  it('flees away from the bobber after being spooked, then roams again', () => {
    const bobber = { x: 210, y: 250 };
    const target: FishBehaviorTarget = { ...bobber, active: true, reeling: 1 };
    const committed = run(createFishBehaviorState({ x: 260, y: 255 }, 3), target, 160);
    const spooked = spookFish(committed);
    expect(spooked.phase).toBe('flee');

    const fleeing = updateFishBehavior(spooked, target, params(), 100);
    const startDist = distanceTo(spooked, bobber);
    const afterFleeStep = updateFishBehavior(fleeing, target, params(), 100);
    expect(distanceTo(afterFleeStep, bobber)).toBeGreaterThan(startDist);

    const settled = run(afterFleeStep, target, 60);
    expect(settled.phase).not.toBe('flee');
  });

  it('is deterministic for a given seed', () => {
    const target: FishBehaviorTarget = { x: 210, y: 250, active: true, reeling: 0.4 };
    const a = run(createFishBehaviorState({ x: 500, y: 280 }, 424242), target, 120);
    const b = run(createFishBehaviorState({ x: 500, y: 280 }, 424242), target, 120);
    expect(a.position).toEqual(b.position);
    expect(a.phase).toBe(b.phase);
  });
});
