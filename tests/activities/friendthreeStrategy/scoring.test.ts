import { describe, expect, it } from 'vitest';
import { createInitialMatchState } from '../../../src/activities/friendthreeStrategy/board';
import type { FriendThreeStrategyState } from '../../../src/activities/friendthreeStrategy/types';
import {
  calculateLongestRoadLength,
  getWinner,
  scorePlayer,
  updateLongestRoadOwner,
} from '../../../src/activities/friendthreeStrategy/scoring';

describe('friendthree strategy scoring', () => {
  it('scores one victory point per settlement', () => {
    const state = {
      ...createInitialMatchState(),
      settlements: [
        { owner: 'recipient', nodeId: 'n0' },
        { owner: 'recipient', nodeId: 'n1' },
        { owner: 'friendthree', nodeId: 'n11' },
      ],
    } satisfies FriendThreeStrategyState;

    expect(scorePlayer(state, 'recipient')).toBe(2);
    expect(scorePlayer(state, 'friendthree')).toBe(1);
  });

  it('adds two victory points for the longest road owner', () => {
    const state = {
      ...createInitialMatchState(),
      longestRoadOwner: 'recipient',
    } satisfies FriendThreeStrategyState;

    expect(scorePlayer(state, 'recipient')).toBe(3);
    expect(scorePlayer(state, 'friendthree')).toBe(1);
  });

  it('awards longest road at three connected roads', () => {
    const state = {
      ...createInitialMatchState(),
      roads: [
        { owner: 'recipient', edgeId: 'e0' },
        { owner: 'recipient', edgeId: 'e1' },
        { owner: 'recipient', edgeId: 'e2' },
        { owner: 'friendthree', edgeId: 'e18' },
        { owner: 'friendthree', edgeId: 'e19' },
      ],
    } satisfies FriendThreeStrategyState;

    expect(updateLongestRoadOwner(state).longestRoadOwner).toBe('recipient');
  });

  it('removes longest road owner on qualifying ties', () => {
    const state = {
      ...createInitialMatchState(),
      longestRoadOwner: 'recipient',
      roads: [
        { owner: 'recipient', edgeId: 'e0' },
        { owner: 'recipient', edgeId: 'e1' },
        { owner: 'recipient', edgeId: 'e2' },
        { owner: 'friendthree', edgeId: 'e17' },
        { owner: 'friendthree', edgeId: 'e19' },
        { owner: 'friendthree', edgeId: 'e20' },
      ],
    } satisfies FriendThreeStrategyState;

    expect(updateLongestRoadOwner(state).longestRoadOwner).toBeUndefined();
  });

  it('gets the first player with at least four victory points, checking ____ first', () => {
    const recipientWins = {
      ...createInitialMatchState(),
      settlements: [
        { owner: 'recipient', nodeId: 'n0' },
        { owner: 'recipient', nodeId: 'n1' },
      ],
      longestRoadOwner: 'recipient',
    } satisfies FriendThreeStrategyState;

    const simultaneous = {
      ...recipientWins,
      settlements: [
        { owner: 'recipient', nodeId: 'n0' },
        { owner: 'recipient', nodeId: 'n1' },
        { owner: 'friendthree', nodeId: 'n10' },
        { owner: 'friendthree', nodeId: 'n11' },
      ],
      longestRoadOwner: 'recipient',
    } satisfies FriendThreeStrategyState;

    expect(getWinner(recipientWins)).toBe('recipient');
    expect(getWinner(simultaneous)).toBe('recipient');
  });

  it('chooses the longest branch without reusing an edge', () => {
    const state = {
      ...createInitialMatchState(),
      roads: [
        { owner: 'recipient', edgeId: 'e3' },
        { owner: 'recipient', edgeId: 'e4' },
        { owner: 'recipient', edgeId: 'e9' },
        { owner: 'recipient', edgeId: 'e12' },
        { owner: 'recipient', edgeId: 'e15' },
      ],
    } satisfies FriendThreeStrategyState;

    expect(calculateLongestRoadLength(state, 'recipient')).toBe(4);
  });

  it('stops road continuity at opponent settlements', () => {
    const state = {
      ...createInitialMatchState(),
      roads: [
        { owner: 'recipient', edgeId: 'e0' },
        { owner: 'recipient', edgeId: 'e1' },
      ],
      settlements: [
        { owner: 'recipient', nodeId: 'n0' },
        { owner: 'friendthree', nodeId: 'n1' },
      ],
    } satisfies FriendThreeStrategyState;

    expect(calculateLongestRoadLength(state, 'recipient')).toBe(1);
  });

  it('allows road continuity through friendly settlements', () => {
    const state = {
      ...createInitialMatchState(),
      roads: [
        { owner: 'recipient', edgeId: 'e0' },
        { owner: 'recipient', edgeId: 'e1' },
      ],
      settlements: [
        { owner: 'recipient', nodeId: 'n0' },
        { owner: 'recipient', nodeId: 'n1' },
      ],
    } satisfies FriendThreeStrategyState;

    expect(calculateLongestRoadLength(state, 'recipient')).toBe(2);
  });
});
