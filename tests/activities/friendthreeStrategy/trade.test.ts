import { describe, expect, it } from 'vitest';
import { createInitialMatchState } from '../../../src/activities/friendthreeStrategy/board';
import { applyBankTrade, canBankTrade } from '../../../src/activities/friendthreeStrategy/trade';

describe('friendthree strategy bank trading', () => {
  it('reports valid bank trades when the player has the required source resources', () => {
    const state = createInitialMatchState();

    expect(canBankTrade(state, 'recipient', 'wood', 'grain')).toBe(true);
    expect(canBankTrade(state, 'recipient', 'stone', 'wood')).toBe(true);
    expect(canBankTrade({
      ...state,
      resources: {
        recipient: { wood: 0, stone: 0, grain: 2 },
        friendthree: state.resources.friendthree,
      },
    }, 'recipient', 'grain', 'wood')).toBe(true);
  });

  it('rejects bank trades with invalid pairs or insufficient source resources', () => {
    const state = createInitialMatchState();

    expect(canBankTrade(state, 'recipient', 'wood', 'wood')).toBe(false);
    expect(canBankTrade(state, 'recipient', 'grain', 'grain')).toBe(false);
    expect(canBankTrade(state, 'recipient', 'grain', 'wood')).toBe(false);
    expect(canBankTrade(state, 'friendthree', 'wood', 'grain')).toBe(false);
  });

  it('trades three wood for one chosen resource', () => {
    const state = createInitialMatchState();

    const next = applyBankTrade(state, 'recipient', 'wood', 'grain');

    expect(next.resources.recipient).toEqual({ wood: 1, stone: 4, grain: 2 });
  });

  it('trades three stone for one chosen resource', () => {
    const state = createInitialMatchState();

    const next = applyBankTrade(state, 'recipient', 'stone', 'wood');

    expect(next.resources.recipient).toEqual({ wood: 5, stone: 1, grain: 1 });
  });

  it('trades two grain only for road resources', () => {
    const state = {
      ...createInitialMatchState(),
      resources: {
        recipient: { wood: 0, stone: 0, grain: 3 },
        friendthree: { wood: 2, stone: 2, grain: 0 },
      },
    };

    const next = applyBankTrade(state, 'recipient', 'grain', 'stone');

    expect(next.resources.recipient).toEqual({ wood: 0, stone: 1, grain: 1 });
    expect(() => applyBankTrade(state, 'recipient', 'grain', 'grain')).toThrow(
      'Cannot trade grain for grain',
    );
  });

  it('rejects same-resource trades', () => {
    const state = createInitialMatchState();

    expect(() => applyBankTrade(state, 'recipient', 'wood', 'wood')).toThrow(
      'Cannot trade wood for wood',
    );
  });

  it('rejects insufficient resources with a useful error', () => {
    const state = createInitialMatchState();

    expect(() => applyBankTrade(state, 'friendthree', 'wood', 'grain')).toThrow(
      'friendthree cannot trade 3 wood for grain',
    );
  });

  it('preserves immutability, updates only the player resources, and appends a log entry', () => {
    const state = createInitialMatchState();

    const next = applyBankTrade(state, 'recipient', 'wood', 'stone');

    expect(next).not.toBe(state);
    expect(next.resources).not.toBe(state.resources);
    expect(next.resources.recipient).not.toBe(state.resources.recipient);
    expect(next.resources.friendthree).toBe(state.resources.friendthree);
    expect(state.resources.recipient).toEqual({ wood: 4, stone: 4, grain: 1 });
    expect(next.log).toEqual([
      {
        type: 'trade',
        message: 'recipient traded 3 wood for 1 stone',
      },
    ]);
  });
});
