import { describe, expect, it } from 'vitest';
import {
  BOARD_EDGES,
  BOARD_HEXES,
  BOARD_NODES,
  createInitialMatchState,
  validateBoard,
} from '../../../src/activities/friendthreeStrategy/board';

describe('friendthree strategy board', () => {
  it('defines a compact board with three resources', () => {
    expect(BOARD_HEXES).toHaveLength(7);
    expect(new Set(BOARD_HEXES.map((hex) => hex.resource))).toEqual(
      new Set(['wood', 'stone', 'grain']),
    );
    expect(BOARD_HEXES.filter((hex) => hex.resource === 'wood')).toHaveLength(3);
    expect(BOARD_HEXES.filter((hex) => hex.resource === 'stone')).toHaveLength(3);
    expect(BOARD_HEXES.filter((hex) => hex.resource === 'grain')).toHaveLength(1);
  });

  it('uses valid graph references', () => {
    expect(() => validateBoard()).not.toThrow();
  });

  it('starts ____ and ____ on opposite sides with ____ slightly advantaged', () => {
    const state = createInitialMatchState();

    expect(state.settlements).toEqual([
      { owner: 'recipient', nodeId: 'n0' },
      { owner: 'friendthree', nodeId: 'n11' },
    ]);
    expect(state.resources.recipient).toEqual({ wood: 4, stone: 4, grain: 1 });
    expect(state.resources.friendthree).toEqual({ wood: 2, stone: 2, grain: 0 });
    expect(state.roads).toEqual([]);
    expect(state.turnNumber).toBe(1);
    expect(state.currentPlayer).toBe('recipient');
  });

  it('defines nodes and edges for road placement', () => {
    expect(BOARD_NODES.length).toBeGreaterThanOrEqual(12);
    expect(BOARD_EDGES.length).toBeGreaterThanOrEqual(18);
  });
});
