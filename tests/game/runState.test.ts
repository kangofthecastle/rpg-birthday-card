import { describe, expect, it } from 'vitest';
import {
  createInitialRunState,
  createCardModeRunState,
  createSeededRunState,
  completeLocation,
  applyActivityCompletion,
  hasActivityCompleted,
  hasActivityWon,
  hasAllFriendKeepsakes,
  hasKeepsake,
  hasSeenBeat,
  isCardMode,
  isFinalSpotUnlocked,
  markBeatSeen,
  markEndingCompleted,
  FRIEND_KEEPSAKE_IDS,
  REQUIRED_FINAL_KEEPSAKE_IDS,
} from '../../src/game/runState';
import type { ActivityCompletionInput } from '../../src/game/runState';

// @ts-expect-error Activity completions must include either a keepsakeId or activityId.
const missingCompletionKind = { locationId: 'friend-a' } satisfies ActivityCompletionInput;
void missingCompletionKind;

describe('runState', () => {
  it('starts with no completed locations or keepsakes', () => {
    const state = createInitialRunState('entry');

    expect(state.currentLocationId).toBe('entry');
    expect(state.mode).toBe('story');
    expect(isCardMode(state)).toBe(false);
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

  it('unlocks the final spot only after every keepsake-bearing location is cleared', () => {
    let state = createInitialRunState('entry');
    state = completeLocation(state, {
      locationId: 'friend-a',
      keepsakeId: 'glowing-koi-scale',
    });

    expect(isFinalSpotUnlocked(state)).toBe(false);

    state = completeLocation(state, {
      locationId: 'friend-b',
      keepsakeId: 'defused-spike-charm',
    });

    // Both friend keepsakes are in hand, but the home keepsake is still required.
    expect(hasAllFriendKeepsakes(state)).toBe(true);
    expect(isFinalSpotUnlocked(state)).toBe(false);

    state = completeLocation(state, {
      locationId: 'recipient-house',
      keepsakeId: 'recipient-sheet-music',
    });

    expect(isFinalSpotUnlocked(state)).toBe(true);
  });

  it('derives required keepsakes from friend and home locations', () => {
    expect(REQUIRED_FINAL_KEEPSAKE_IDS).toContain('recipient-sheet-music');
    expect(FRIEND_KEEPSAKE_IDS).not.toContain('recipient-sheet-music');
    expect(REQUIRED_FINAL_KEEPSAKE_IDS.length).toBe(FRIEND_KEEPSAKE_IDS.length + 1);
  });

  it('reports friend-keepsake completion for the return-home beat', () => {
    let state = createInitialRunState('entry');
    expect(hasAllFriendKeepsakes(state)).toBe(false);

    for (const keepsakeId of FRIEND_KEEPSAKE_IDS) {
      state = completeLocation(state, { locationId: `loc-${keepsakeId}`, keepsakeId });
    }

    expect(hasAllFriendKeepsakes(state)).toBe(true);
  });

  it('tracks one-time entry beats without mutating the original state', () => {
    const state = createInitialRunState('recipient-house');
    expect(hasSeenBeat(state, 'recipient-intro')).toBe(false);

    const next = markBeatSeen(state, 'recipient-intro');

    expect(hasSeenBeat(next, 'recipient-intro')).toBe(true);
    expect(hasSeenBeat(state, 'recipient-intro')).toBe(false);
    expect(markBeatSeen(next, 'recipient-intro').seenBeatIds).toEqual(['recipient-intro']);
  });

  it('marks the ending completed without mutating the original state', () => {
    const state = createInitialRunState('entry');
    const next = markEndingCompleted(state);

    expect(state.endingCompleted).toBe(false);
    expect(next.endingCompleted).toBe(true);
  });

  it('seeds the owning activities along with their keepsakes', () => {
    const state = createSeededRunState('friend-b', [
      'glowing-koi-scale',
      'defused-spike-charm',
    ]);

    expect(state.completedActivityIds).toEqual(['friendone-pc-fishing', 'valorant-split']);
  });

  it('creates an isolated cards-mode epilogue with every letter but no completed games', () => {
    const state = createCardModeRunState();

    expect(state.mode).toBe('cards');
    expect(isCardMode(state)).toBe(true);
    expect(state.currentLocationId).toBe('recipient-house');
    expect(state.collectedKeepsakeIds).toEqual(REQUIRED_FINAL_KEEPSAKE_IDS);
    expect(state.completedActivityIds).toEqual([]);
    expect(state.wonActivityIds).toEqual([]);
    expect(state.endingCompleted).toBe(true);
    expect(isFinalSpotUnlocked(state)).toBe(true);
    expect(state.seenBeatIds).toEqual(expect.arrayContaining([
      'recipient-intro',
      'friendone-text-read',
      'friendone-pc-ready',
      'friendtwo-house-entered',
      'recipient-return-home',
      'violin-called',
    ]));
  });
});
