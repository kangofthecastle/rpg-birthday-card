import { describe, expect, it } from 'vitest';
import { createInitialMatchState } from '../../../src/activities/friendthreeStrategy/board';
import {
  buildRoad,
  buildSettlement,
  endTurn,
  getBuildableEdges,
  getBuildableNodes,
  getScriptedRoll,
  rollProduction,
} from '../../../src/activities/friendthreeStrategy/rules';
import type { FriendThreeStrategyState } from '../../../src/activities/friendthreeStrategy/types';

describe('friendthree strategy rules', () => {
  it('produces wood for ____ from h0 on roll 5', () => {
    const state = createInitialMatchState();

    const next = rollProduction(state, 5);

    expect(next.resources.recipient).toEqual({ wood: 5, stone: 4, grain: 1 });
    expect(next.resources.friendthree).toEqual(state.resources.friendthree);
    expect(next.lastRoll).toBe(5);
    expect(next.log).toEqual([
      {
        type: 'roll',
        message: 'Rolled 5: recipient gained 1 wood from h0',
      },
    ]);
  });

  it('builds a road from ____ settlement n0 via e0 and spends road resources', () => {
    const state = createInitialMatchState();

    expect(getBuildableEdges(state, 'recipient')).toContain('e0');

    const next = buildRoad(state, 'recipient', 'e0');

    expect(next.roads).toEqual([{ owner: 'recipient', edgeId: 'e0' }]);
    expect(next.resources.recipient).toEqual({ wood: 3, stone: 3, grain: 1 });
    expect(next.log).toEqual([
      {
        type: 'build-road',
        message: 'recipient built road e0',
      },
    ]);
  });

  it('rejects disconnected and occupied roads', () => {
    const state = createInitialMatchState();
    const occupied = {
      ...state,
      roads: [{ owner: 'recipient', edgeId: 'e0' }],
    } satisfies FriendThreeStrategyState;

    expect(getBuildableEdges(state, 'recipient')).not.toContain('e20');
    expect(() => buildRoad(state, 'recipient', 'e20')).toThrow('recipient cannot build road e20');
    expect(() => buildRoad(occupied, 'recipient', 'e0')).toThrow('recipient cannot build road e0');
  });

  it('does not let roads extend through opponent settlements', () => {
    const state = {
      ...createInitialMatchState(),
      settlements: [
        { owner: 'recipient', nodeId: 'n0' },
        { owner: 'friendthree', nodeId: 'n1' },
      ],
      roads: [{ owner: 'recipient', edgeId: 'e0' }],
    } satisfies FriendThreeStrategyState;

    expect(getBuildableEdges(state, 'recipient')).toContain('e3');
    expect(getBuildableEdges(state, 'recipient')).not.toContain('e1');
    expect(getBuildableEdges(state, 'recipient')).not.toContain('e4');
    expect(getBuildableEdges(state, 'recipient')).not.toContain('e5');
    expect(() => buildRoad(state, 'recipient', 'e1')).toThrow('recipient cannot build road e1');
  });

  it('builds a settlement from a connected road and spends all settlement resources', () => {
    const state = buildRoad(createInitialMatchState(), 'recipient', 'e0');

    expect(getBuildableNodes(state, 'recipient')).toContain('n1');

    const next = buildSettlement(state, 'recipient', 'n1');

    expect(next.settlements).toEqual([
      { owner: 'recipient', nodeId: 'n0' },
      { owner: 'friendthree', nodeId: 'n11' },
      { owner: 'recipient', nodeId: 'n1' },
    ]);
    expect(next.resources.recipient).toEqual({ wood: 2, stone: 2, grain: 0 });
    expect(next.log.at(-1)).toEqual({
      type: 'build-settlement',
      message: 'recipient built settlement n1',
    });
  });

  it('declares ____ the winner after a three-road chain and settlement n3', () => {
    const ready = {
      ...createInitialMatchState(),
      resources: {
        recipient: { wood: 4, stone: 4, grain: 1 },
        friendthree: { wood: 2, stone: 2, grain: 0 },
      },
    } satisfies FriendThreeStrategyState;

    const withRoads = buildRoad(buildRoad(buildRoad(ready, 'recipient', 'e0'), 'recipient', 'e1'), 'recipient', 'e2');
    const next = buildSettlement(withRoads, 'recipient', 'n3');

    expect(next.longestRoadOwner).toBe('recipient');
    expect(next.winner).toBe('recipient');
    expect(next.log.at(-1)).toEqual({
      type: 'win',
      message: 'recipient wins',
    });
  });

  it('alternates turns and increments the turn number only after ____ passes', () => {
    const state = createInitialMatchState();

    const friendthreeTurn = endTurn(state);
    const recipientTurn = endTurn(friendthreeTurn);

    expect(friendthreeTurn.currentPlayer).toBe('friendthree');
    expect(friendthreeTurn.turnNumber).toBe(1);
    expect(recipientTurn.currentPlayer).toBe('recipient');
    expect(recipientTurn.turnNumber).toBe(2);
    expect(recipientTurn.log).toEqual([
      { type: 'pass', message: 'recipient passed' },
      { type: 'pass', message: 'friendthree passed' },
    ]);
  });

  it('returns scripted rolls in a deterministic cycle', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(getScriptedRoll)).toEqual([
      5,
      6,
      9,
      8,
      4,
      10,
      3,
      5,
      6,
    ]);
  });

  it('returns deterministic scripted rolls for non-positive turn numbers', () => {
    expect([0, -1, -8].map(getScriptedRoll)).toEqual([3, 10, 10]);
  });

  it('does not mutate the input state when building', () => {
    const state = createInitialMatchState();
    const originalRoads = state.roads;
    const originalResources = state.resources.recipient;
    const originalLog = state.log;

    const next = buildRoad(state, 'recipient', 'e0');

    expect(next).not.toBe(state);
    expect(next.roads).not.toBe(originalRoads);
    expect(next.resources.recipient).not.toBe(originalResources);
    expect(next.log).not.toBe(originalLog);
    expect(state.roads).toEqual([]);
    expect(state.resources.recipient).toEqual({ wood: 4, stone: 4, grain: 1 });
    expect(state.log).toEqual([]);
  });

  it('does not mutate the input state when producing resources', () => {
    const state = createInitialMatchState();
    const originalRecipientResources = state.resources.recipient;
    const originalLog = state.log;

    const next = rollProduction(state, 5);

    expect(next).not.toBe(state);
    expect(next.resources.recipient).not.toBe(originalRecipientResources);
    expect(next.log).not.toBe(originalLog);
    expect(state.resources.recipient).toEqual({ wood: 4, stone: 4, grain: 1 });
    expect(state.lastRoll).toBeUndefined();
    expect(state.log).toEqual([]);
  });
});
