import { describe, expect, it } from 'vitest';
import {
  advanceFollowerTrail,
  createFollowerTrail,
  followerStartBehindLeader,
  type TrailPoint,
} from '../../src/game/followerTrail';

const point = (x: number, y: number): TrailPoint => ({ x, y });

describe('followerTrail', () => {
  it('starts behind ____ for every edge-arrival direction', () => {
    const recipient = point(100, 200);

    expect(followerStartBehindLeader(recipient, 'west')).toEqual(point(36, 200));
    expect(followerStartBehindLeader(recipient, 'east')).toEqual(point(164, 200));
    expect(followerStartBehindLeader(recipient, 'north')).toEqual(point(100, 136));
    expect(followerStartBehindLeader(recipient, 'south')).toEqual(point(100, 264));
    expect(followerStartBehindLeader(recipient)).toEqual(point(36, 200));
  });

  it('keeps a bounded history of distinct leader positions', () => {
    let state = createFollowerTrail(point(0, 0), { maxHistory: 4 });

    for (let x = 0; x <= 60; x += 10) {
      state = advanceFollowerTrail(state, point(x, 0), 16);
    }

    expect(state.history).toHaveLength(4);
    expect(state.history.at(-1)).toEqual(point(60, 0));
  });

  it('targets the leader path about 64 pixels behind instead of steering at the leader', () => {
    let state = createFollowerTrail(point(0, 0));

    for (let x = 8; x <= 120; x += 8) {
      state = advanceFollowerTrail(state, point(x, 0), 16);
    }

    expect(state.target.x).toBeGreaterThanOrEqual(48);
    expect(state.target.x).toBeLessThanOrEqual(72);
    expect(state.target.y).toBe(0);
  });

  it('uses four-way facing while moving and becomes idle at its target', () => {
    let state = createFollowerTrail(point(0, 0));
    state = advanceFollowerTrail(state, point(100, 0), 100);
    expect(state.facing).toBe('right');
    expect(state.moving).toBe(true);

    for (let index = 0; index < 20; index += 1) {
      state = advanceFollowerTrail(state, point(100, 0), 100);
    }
    expect(state.moving).toBe(false);
  });

  it('follows corners through recorded path points', () => {
    let state = createFollowerTrail(point(0, 0));
    for (let x = 8; x <= 96; x += 8) {
      state = advanceFollowerTrail(state, point(x, 0), 16);
    }
    for (let y = 8; y <= 96; y += 8) {
      state = advanceFollowerTrail(state, point(96, y), 16);
    }

    expect(state.target.x).toBe(96);
    expect(state.target.y).toBeGreaterThan(16);
    expect(state.target.y).toBeLessThan(64);
  });

  it('catches up off-camera when the leader is far away', () => {
    const state = advanceFollowerTrail(
      createFollowerTrail(point(0, 0)),
      point(600, 0),
      16,
    );

    expect(state.caughtUp).toBe(true);
    expect(state.position.x).toBeGreaterThanOrEqual(520);
    expect(state.position.x).toBeLessThan(600);
  });
});
