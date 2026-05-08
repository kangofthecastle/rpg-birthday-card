import { describe, expect, it } from 'vitest';
import {
  createInitialRunState,
  completeLocation,
  hasKeepsake,
  isFinalSpotUnlocked,
  markEndingCompleted,
} from '../../src/game/runState';

describe('runState', () => {
  it('starts with no completed locations or keepsakes', () => {
    const state = createInitialRunState('entry');

    expect(state.currentLocationId).toBe('entry');
    expect(state.completedLocationIds).toEqual([]);
    expect(state.collectedKeepsakeIds).toEqual([]);
    expect(isFinalSpotUnlocked(state)).toBe(false);
    expect(state.endingCompleted).toBe(false);
  });

  it('grants a keepsake when a friend location is completed', () => {
    const state = createInitialRunState('entry');
    const next = completeLocation(state, {
      locationId: 'friend-a',
      keepsakeId: 'pressed-flower',
    });

    expect(next.completedLocationIds).toEqual(['friend-a']);
    expect(next.collectedKeepsakeIds).toEqual(['pressed-flower']);
    expect(hasKeepsake(next, 'pressed-flower')).toBe(true);
    expect(state.completedLocationIds).toEqual([]);
    expect(state.collectedKeepsakeIds).toEqual([]);
  });

  it('does not duplicate completed locations or keepsakes', () => {
    const state = completeLocation(createInitialRunState('entry'), {
      locationId: 'friend-a',
      keepsakeId: 'pressed-flower',
    });
    const next = completeLocation(state, {
      locationId: 'friend-a',
      keepsakeId: 'pressed-flower',
    });

    expect(next.completedLocationIds).toEqual(['friend-a']);
    expect(next.collectedKeepsakeIds).toEqual(['pressed-flower']);
  });

  it('unlocks the final spot only after all required keepsakes are collected', () => {
    let state = createInitialRunState('entry');
    state = completeLocation(state, {
      locationId: 'friend-a',
      keepsakeId: 'pressed-flower',
    });
    state = completeLocation(state, {
      locationId: 'friend-b',
      keepsakeId: 'paper-star',
    });

    expect(isFinalSpotUnlocked(state)).toBe(false);

    state = completeLocation(state, {
      locationId: 'friend-c',
      keepsakeId: 'tiny-key',
    });

    expect(isFinalSpotUnlocked(state)).toBe(true);
  });

  it('marks the ending completed without mutating the original state', () => {
    const state = createInitialRunState('entry');
    const next = markEndingCompleted(state);

    expect(state.endingCompleted).toBe(false);
    expect(next.endingCompleted).toBe(true);
  });
});
