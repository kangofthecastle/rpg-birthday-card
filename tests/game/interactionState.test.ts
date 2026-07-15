import { describe, expect, it } from 'vitest';
import {
  isInteractionAvailable,
  isInteractionLocked,
  shouldPlayEnterBeat,
} from '../../src/game/interactionState';
import {
  completeLocation,
  createCardModeRunState,
  createInitialRunState,
  markBeatSeen,
  markEndingCompleted,
  FRIEND_KEEPSAKE_IDS,
  REQUIRED_FINAL_KEEPSAKE_IDS,
  type RunState,
} from '../../src/game/runState';
import type { LocationEnterBeat } from '../../src/content/types';
import { LOCATIONS } from '../../src/content/locations';

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

  it('keeps an activity interaction inspectable but locked until its prerequisite activity', () => {
    const violin = { lockedUntilActivityId: 'valorant-split' } as const;
    const fresh = createInitialRunState('recipient-house');

    expect(isInteractionAvailable(violin, fresh)).toBe(true);
    expect(isInteractionLocked(violin, fresh)).toBe(true);

    const afterRetake = completeLocation(fresh, {
      locationId: 'friend-b',
      activityId: 'valorant-split',
    });
    expect(isInteractionAvailable(violin, afterRetake)).toBe(true);
    expect(isInteractionLocked(violin, afterRetake)).toBe(false);
  });

  it('bypasses activity locks in cards mode', () => {
    const violin = {
      kind: 'activity',
      lockedUntilActivityId: 'valorant-split',
    } as const;

    expect(isInteractionLocked(violin, createCardModeRunState())).toBe(false);
    expect(isInteractionLocked(violin, createInitialRunState('recipient-house'))).toBe(true);
  });

  it('bypasses completed story gates for activity replays in the epilogue', () => {
    const retake = {
      kind: 'activity',
      lockedUntilActivityId: 'friendone-pc-fishing',
      replayAfterEnding: true,
    } as const;
    const epilogue = markEndingCompleted(createInitialRunState('friend-b'));

    expect(isInteractionLocked(retake, epilogue)).toBe(false);
  });
});

describe('isInteractionAvailable', () => {
  it('hides a one-time interaction after its named beat', () => {
    const interaction = { hiddenAfterBeatId: 'friendone-pc-ready' } as const;
    const fresh = createInitialRunState('friend-a');
    expect(isInteractionAvailable(interaction, fresh)).toBe(true);
    expect(isInteractionAvailable(interaction, markBeatSeen(fresh, 'friendone-pc-ready'))).toBe(false);
  });

  it('bypasses activity prerequisites and completion hiding only in cards mode', () => {
    const retake = {
      kind: 'activity',
      requiresActivityId: 'friendone-pc-fishing',
      hiddenAfterActivityId: 'valorant-split',
    } as const;
    const cards = createCardModeRunState();
    const story = createInitialRunState('friend-b');

    expect(isInteractionAvailable(retake, cards)).toBe(true);
    expect(isInteractionAvailable(retake, story)).toBe(false);

    const completedCards = completeLocation(cards, {
      locationId: 'friend-b',
      activityId: 'valorant-split',
    });
    expect(isInteractionAvailable(retake, completedCards)).toBe(true);
  });

  it('keeps a completed activity available for replay in the epilogue', () => {
    const retake = {
      kind: 'activity',
      hiddenAfterActivityId: 'valorant-split',
      replayAfterEnding: true,
    } as const;
    const completed = completeLocation(createInitialRunState('friend-b'), {
      locationId: 'friend-b',
      activityId: 'valorant-split',
    });
    const epilogue = markEndingCompleted(completed);

    expect(isInteractionAvailable(retake, completed)).toBe(false);
    expect(isInteractionAvailable(retake, epilogue)).toBe(true);
  });

  it('keeps an authored inspect available in the epilogue and cards mode', () => {
    const inspect = {
      kind: 'easterEgg',
      requiresActivityId: 'friendone-pc-fishing',
      availableAfterEnding: true,
    } as const;
    const story = createInitialRunState('friend-b');

    expect(isInteractionAvailable(inspect, story)).toBe(false);
    expect(isInteractionAvailable(inspect, markEndingCompleted(story))).toBe(true);
    expect(isInteractionAvailable(inspect, createCardModeRunState())).toBe(true);
  });

  it('makes every authored game interaction immediately playable in cards mode', () => {
    const state = createCardModeRunState();
    const games = LOCATIONS.flatMap((location) =>
      location.interactions.filter((interaction) => interaction.kind === 'activity'),
    );

    expect(games.map((game) => game.activityId)).toEqual([
      'fold-the-letters',
      'friendone-pc-fishing',
      'valorant-split',
      'recipient-violin-piece',
    ]);
    for (const game of games) {
      expect(isInteractionAvailable(game, state), game.id).toBe(true);
      expect(isInteractionLocked(game, state), game.id).toBe(false);
    }
  });
});

describe('shouldPlayEnterBeat', () => {
  const introBeat: LocationEnterBeat = {
    id: 'recipient-intro',
    dialogue: [{ text: '...wait. Where am I?' }],
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

  it('waits for a required activity and beat', () => {
    const gated: LocationEnterBeat = {
      id: 'friendtwo-house-entered',
      requiresActivityId: 'friendone-pc-fishing',
      requiresBeatId: 'friendone-text-read',
      dialogue: [{ text: "That's strange. He's not here!" }],
    };
    const fresh = createInitialRunState('friend-b');
    expect(shouldPlayEnterBeat(gated, fresh)).toBe(false);

    const invited = markBeatSeen(fresh, 'friendone-text-read');
    const ready = completeLocation(invited, {
      locationId: 'friend-a',
      activityId: 'friendone-pc-fishing',
    });
    expect(shouldPlayEnterBeat(gated, ready)).toBe(true);
  });
});
