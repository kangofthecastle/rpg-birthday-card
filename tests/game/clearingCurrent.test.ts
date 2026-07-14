import { describe, expect, it } from 'vitest';
import {
  advanceClearingCurrentItem,
  advanceClearingMote,
  createClearingCurrent,
  createClearingMotePath,
  sampleClearingMotePath,
} from '../../src/game/clearingCurrent';

describe('clearingCurrent', () => {
  it('creates deterministic westbound koi and a dense guidance stream', () => {
    const first = createClearingCurrent(1234, 1280, 600, 100);
    const second = createClearingCurrent(1234, 1280, 600, 100);
    expect(first).toEqual(second);
    expect(first.koi).toHaveLength(3);
    expect(first.motes.length).toBeGreaterThanOrEqual(50);
    expect(first.koi.every((item) => item.speedX < 0)).toBe(true);
    expect(first.koi.every((item) => item.flipX === true)).toBe(true);
    expect(first.motes.every((item) => item.speed > 0)).toBe(true);
  });

  it('advances by delta time and wraps west-edge items to the east', () => {
    const item = { x: 100, y: 620, speedX: -20, flipX: true, phase: 0, scale: 1 };
    expect(advanceClearingCurrentItem(item, 500, 1280).x).toBe(90);

    const wrapped = advanceClearingCurrentItem({ ...item, x: -80 }, 1000, 1280);
    expect(wrapped.x).toBeGreaterThan(1280);
  });

  it('routes motes from the left water, through a centre bend, then north', () => {
    const path = createClearingMotePath(1024, 512, 96);
    const start = sampleClearingMotePath(path, 0);
    const horizontalEnd = sampleClearingMotePath(path, 0.28);
    const bend = sampleClearingMotePath(path, 0.62);
    const north = sampleClearingMotePath(path, 1);

    expect(start.x).toBeLessThan(0);
    expect(start.y).toBeGreaterThan(512);
    expect(horizontalEnd.y).toBeCloseTo(start.y, 5);
    expect(bend.x).toBeGreaterThan(1024 * 0.42);
    expect(bend.x).toBeLessThan(1024 * 0.58);
    expect(bend.y).toBeLessThan(430);
    expect(north.x).toBeCloseTo(bend.x, 5);
    expect(north.y).toBeLessThan(180);
  });

  it('advances and wraps a mote along the guidance path', () => {
    const mote = { progress: 0.95, speed: 0.1, phase: 1, scale: 0.8, spread: 0 };
    expect(advanceClearingMote(mote, 250).progress).toBeCloseTo(0.975, 5);
    expect(advanceClearingMote(mote, 1000).progress).toBeCloseTo(0.05, 5);
  });
});
