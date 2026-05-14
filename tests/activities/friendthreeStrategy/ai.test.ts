import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialMatchState } from '../../../src/activities/friendthreeStrategy/board';
import { chooseFriendThreeAction } from '../../../src/activities/friendthreeStrategy/ai';
import { createSeededRandom } from '../../../src/activities/friendthreeStrategy/rng';

describe('friendthree strategy AI', () => {
  afterEach(() => {
    vi.doUnmock('../../../src/activities/friendthreeStrategy/trade');
    vi.resetModules();
  });

  it('chooses the first sorted legal road when road-choice random is at least 0.25', () => {
    expect(chooseFriendThreeAction(createInitialMatchState(), () => 0.5)).toEqual({
      type: 'build-road',
      edgeId: 'e18',
    });
  });

  it('chooses the second sorted legal road when road-choice random is below 0.25', () => {
    expect(chooseFriendThreeAction(createInitialMatchState(), () => 0.1)).toEqual({
      type: 'build-road',
      edgeId: 'e19',
    });
  });

  it('prefers settlements when affordable and available', () => {
    const state = {
      ...createInitialMatchState(),
      resources: {
        recipient: { wood: 0, stone: 0, grain: 0 },
        friendthree: { wood: 2, stone: 2, grain: 1 },
      },
      roads: [{ owner: 'friendthree' as const, edgeId: 'e20' as const }],
    };

    expect(chooseFriendThreeAction(state, createSeededRandom(99))).toEqual({
      type: 'build-settlement',
      nodeId: 'n10',
    });
  });

  it('sometimes delays when ____ is ahead', () => {
    const state = {
      ...createInitialMatchState(),
      longestRoadOwner: 'friendthree' as const,
      roads: [
        { owner: 'friendthree' as const, edgeId: 'e18' as const },
        { owner: 'friendthree' as const, edgeId: 'e19' as const },
        { owner: 'friendthree' as const, edgeId: 'e20' as const },
      ],
    };

    expect(chooseFriendThreeAction(state, createSeededRandom(1))).toEqual({ type: 'pass' });
  });

  it('uses bank trade when blocked by a missing road resource', () => {
    const state = {
      ...createInitialMatchState(),
      resources: {
        recipient: { wood: 0, stone: 0, grain: 0 },
        friendthree: { wood: 0, stone: 1, grain: 2 },
      },
    };

    expect(chooseFriendThreeAction(state, createSeededRandom(12))).toEqual({
      type: 'trade',
      from: 'grain',
      to: 'wood',
    });
  });

  it('does not return a trade when shared bank-trade legality rejects the candidate', async () => {
    vi.resetModules();
    vi.doMock('../../../src/activities/friendthreeStrategy/trade', () => ({
      canBankTrade: () => false,
    }));
    const { chooseFriendThreeAction: chooseWithRejectedTrades } = await import(
      '../../../src/activities/friendthreeStrategy/ai'
    );
    const state = {
      ...createInitialMatchState(),
      resources: {
        recipient: { wood: 0, stone: 0, grain: 0 },
        friendthree: { wood: 0, stone: 1, grain: 2 },
      },
    };

    expect(chooseWithRejectedTrades(state, createSeededRandom(12))).toEqual({ type: 'pass' });
  });
});
