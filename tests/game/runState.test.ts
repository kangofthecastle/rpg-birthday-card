import { describe, expect, it } from 'vitest';
import {
  createInitialRunState,
  completeLocation,
  applyActivityCompletion,
  hasActivityCompleted,
  hasActivityWon,
  hasKeepsake,
  isFinalSpotUnlocked,
  markEndingCompleted,
} from '../../src/game/runState';
import type { ActivityCompletionInput } from '../../src/game/runState';

// @ts-expect-error Activity completions must include either a keepsakeId or activityId.
const missingCompletionKind = { locationId: 'friend-a' } satisfies ActivityCompletionInput;
void missingCompletionKind;

describe('runState', () => {
  it('starts with no completed locations or keepsakes', () => {
    const state = createInitialRunState('entry');

    expect(state.currentLocationId).toBe('entry');
    expect(state.completedLocationIds).toEqual([]);
    expect(state.collectedKeepsakeIds).toEqual([]);
    expect(state.completedActivityIds).toEqual([]);
    expect(state.wonActivityIds).toEqual([]);
    expect(isFinalSpotUnlocked(state)).toBe(false);
    expect(state.endingCompleted).toBe(false);
  });

  it('grants a keepsake when a friend location is completed', () => {
    const state = createInitialRunState('entry');
    const next = completeLocation(state, {
      locationId: 'friend-a',
      keepsakeId: 'glowing-koi-scale',
    });

    expect(next.completedLocationIds).toEqual(['friend-a']);
    expect(next.collectedKeepsakeIds).toEqual(['glowing-koi-scale']);
    expect(hasKeepsake(next, 'glowing-koi-scale')).toBe(true);
    expect(state.completedLocationIds).toEqual([]);
    expect(state.collectedKeepsakeIds).toEqual([]);
  });

  it('does not duplicate completed locations or keepsakes', () => {
    const state = completeLocation(createInitialRunState('entry'), {
      locationId: 'friend-a',
      keepsakeId: 'glowing-koi-scale',
    });
    const next = completeLocation(state, {
      locationId: 'friend-a',
      keepsakeId: 'glowing-koi-scale',
    });

    expect(next.completedLocationIds).toEqual(['friend-a']);
    expect(next.collectedKeepsakeIds).toEqual(['glowing-koi-scale']);
  });

  it('does not grant a new keepsake when replaying a completed location', () => {
    const state = completeLocation(createInitialRunState('entry'), {
      locationId: 'friend-a',
      keepsakeId: 'glowing-koi-scale',
    });
    const next = completeLocation(state, {
      locationId: 'friend-a',
      keepsakeId: 'paper-star',
    });

    expect(next.completedLocationIds).toEqual(['friend-a']);
    expect(next.collectedKeepsakeIds).toEqual(['glowing-koi-scale']);
    expect(isFinalSpotUnlocked(next)).toBe(false);
  });

  it('tracks optional activity completion without granting a keepsake', () => {
    const state = createInitialRunState('entry');
    const next = applyActivityCompletion(state, {
      locationId: 'friend-a',
      activityId: 'tea-service',
    });

    expect(next.completedActivityIds).toEqual(['tea-service']);
    expect(hasActivityCompleted(next, 'tea-service')).toBe(true);
    expect(next.completedLocationIds).toEqual([]);
    expect(next.collectedKeepsakeIds).toEqual([]);
  });

  it('tracks optional activity wins separately from keepsake completion', () => {
    const state = createInitialRunState('entry');
    const next = applyActivityCompletion(state, {
      locationId: 'friend-a',
      activityId: 'tea-service',
      won: true,
    });

    expect(next.completedActivityIds).toEqual(['tea-service']);
    expect(next.wonActivityIds).toEqual(['tea-service']);
    expect(hasActivityWon(next, 'tea-service')).toBe(true);
    expect(next.completedLocationIds).toEqual([]);
    expect(next.collectedKeepsakeIds).toEqual([]);
  });

  it('tracks activity-only wins passed through completeLocation without granting a keepsake', () => {
    const state = createInitialRunState('entry');
    const next = completeLocation(state, {
      locationId: 'friend-b',
      activityId: 'craft-side-game',
      won: true,
    });

    expect(next.completedActivityIds).toEqual(['craft-side-game']);
    expect(next.wonActivityIds).toEqual(['craft-side-game']);
    expect(next.completedLocationIds).toEqual([]);
    expect(next.collectedKeepsakeIds).toEqual([]);
  });

  it('still grants a keepsake for existing location completions through the activity completion path', () => {
    const state = createInitialRunState('entry');
    const next = applyActivityCompletion(state, {
      locationId: 'friend-a',
      keepsakeId: 'glowing-koi-scale',
    });

    expect(next.completedLocationIds).toEqual(['friend-a']);
    expect(next.collectedKeepsakeIds).toEqual(['glowing-koi-scale']);
    expect(hasKeepsake(next, 'glowing-koi-scale')).toBe(true);
  });

  it('unlocks the final spot only after all required keepsakes are collected', () => {
    let state = createInitialRunState('entry');
    state = completeLocation(state, {
      locationId: 'friend-a',
      keepsakeId: 'glowing-koi-scale',
    });

    expect(isFinalSpotUnlocked(state)).toBe(false);

    state = completeLocation(state, {
      locationId: 'friend-b',
      keepsakeId: 'paper-star',
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
