import { describe, expect, it } from 'vitest';
import {
  isInteractionLocked,
  shouldPlayEnterBeat,
} from '../../src/game/interactionState';
import {
  completeLocation,
  createInitialRunState,
  markBeatSeen,
  FRIEND_KEEPSAKE_IDS,
  REQUIRED_FINAL_KEEPSAKE_IDS,
  type RunState,
} from '../../src/game/runState';
import type { LocationEnterBeat } from '../../src/content/types';

function withAllFriendKeepsakes(): RunState {
  let state = createInitialRunState('recipient-house');

  for (const keepsakeId of FRIEND_KEEPSAKE_IDS) {
    state = completeLocation(state, { locationId: `loc-${keepsakeId}`, keepsakeId });
  }

  return state;
}

describe('isInteractionLocked', () => {
  it('is unlocked when the interaction has no friend-keepsake gate', () => {
    const state = createInitialRunState('recipient-house');
    expect(isInteractionLocked({}, state)).toBe(false);
  });

  it('is locked until both friend keepsakes are collected', () => {
    const gated = { requiresAllFriendKeepsakes: true } as const;

    expect(isInteractionLocked(gated, createInitialRunState('recipient-house'))).toBe(true);
    expect(isInteractionLocked(gated, withAllFriendKeepsakes())).toBe(false);
  });

  it('requiresAllKeepsakes stays locked until EVERY letter is held', () => {
    const gated = { requiresAllKeepsakes: true } as const;

    // Both friend letters, but not ____'s own → still locked (needs all three).
    expect(isInteractionLocked(gated, withAllFriendKeepsakes())).toBe(true);

    let state = createInitialRunState('clearing');
    for (const keepsakeId of REQUIRED_FINAL_KEEPSAKE_IDS) {
      state = completeLocation(state, { locationId: `loc-${keepsakeId}`, keepsakeId });
    }
    expect(isInteractionLocked(gated, state)).toBe(false);
  });
});

describe('shouldPlayEnterBeat', () => {
  const introBeat: LocationEnterBeat = {
    id: 'recipient-intro',
    dialogue: [{ text: '…wait. Where am I?' }],
  };
  const returnBeat: LocationEnterBeat = {
    id: 'recipient-return-home',
    requiresAllFriendKeepsakes: true,
    dialogue: [{ text: 'The lights are on.' }],
  };

  it('plays a one-time beat only until it has been seen', () => {
    const fresh = createInitialRunState('recipient-house');
    expect(shouldPlayEnterBeat(introBeat, fresh)).toBe(true);

    const seen = markBeatSeen(fresh, 'recipient-intro');
    expect(shouldPlayEnterBeat(introBeat, seen)).toBe(false);
  });

  it('holds the return-home beat until both friend keepsakes are collected', () => {
    expect(shouldPlayEnterBeat(returnBeat, createInitialRunState('recipient-house'))).toBe(false);
    expect(shouldPlayEnterBeat(returnBeat, withAllFriendKeepsakes())).toBe(true);
  });

  it('lets a non-once beat replay even after it has been seen', () => {
    const repeating: LocationEnterBeat = { ...introBeat, once: false };
    const seen = markBeatSeen(createInitialRunState('recipient-house'), 'recipient-intro');

    expect(shouldPlayEnterBeat(repeating, seen)).toBe(true);
  });
});
