import { describe, expect, it } from 'vitest';
import {
  BOARD_EDGES,
  BOARD_HEXES,
  BOARD_NODES,
  createInitialMatchState,
  getEdge,
  getNode,
  validateBoard,
} from '../../../src/activities/friendthreeStrategy/board';

describe('friendthree strategy board', () => {
  it('defines a compact board with three resources', () => {
    expect(BOARD_HEXES).toHaveLength(7);
    expect(BOARD_HEXES.map((hex) => hex.id)).toEqual(['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
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

  it('rejects duplicate hex ids', () => {
    expect(() =>
      validateBoard({
        hexes: [{ ...BOARD_HEXES[0] }, { ...BOARD_HEXES[0] }],
        nodes: BOARD_NODES,
        edges: BOARD_EDGES,
      }),
    ).toThrow('Duplicate hex id h0');
  });

  it('rejects duplicate node ids', () => {
    expect(() =>
      validateBoard({
        hexes: BOARD_HEXES,
        nodes: [{ ...BOARD_NODES[0] }, { ...BOARD_NODES[0] }],
        edges: BOARD_EDGES,
      }),
    ).toThrow('Duplicate node id n0');
  });

  it('rejects duplicate edge ids', () => {
    expect(() =>
      validateBoard({
        hexes: BOARD_HEXES,
        nodes: BOARD_NODES,
        edges: [{ ...BOARD_EDGES[0] }, { ...BOARD_EDGES[0] }],
      }),
    ).toThrow('Duplicate edge id e0');
  });

  it('rejects hexes that reference missing nodes', () => {
    expect(() =>
      validateBoard({
        hexes: [{ ...BOARD_HEXES[0], nodeIds: ['n999'] }],
        nodes: BOARD_NODES,
        edges: BOARD_EDGES,
      }),
    ).toThrow('Hex h0 references missing node n999');
  });

  it('rejects duplicate node ids within a hex', () => {
    expect(() =>
      validateBoard({
        hexes: [{ ...BOARD_HEXES[0], nodeIds: ['n0', 'n0'] }],
        nodes: [{ ...BOARD_NODES[0], hexIds: ['h0'] }],
        edges: [],
      }),
    ).toThrow('Hex h0 lists node n0 more than once');
  });

  it('rejects nodes that reference missing hexes', () => {
    expect(() =>
      validateBoard({
        hexes: [],
        nodes: [{ ...BOARD_NODES[0], hexIds: ['h999'] }],
        edges: [],
      }),
    ).toThrow('Node n0 references missing hex h999');
  });

  it('rejects duplicate hex ids within a node', () => {
    expect(() =>
      validateBoard({
        hexes: [{ ...BOARD_HEXES[0], nodeIds: ['n0'] }],
        nodes: [{ ...BOARD_NODES[0], hexIds: ['h0', 'h0'] }],
        edges: [],
      }),
    ).toThrow('Node n0 lists hex h0 more than once');
  });

  it('rejects hex membership that is not mirrored by the node', () => {
    expect(() =>
      validateBoard({
        hexes: [{ ...BOARD_HEXES[0], nodeIds: ['n1'] }],
        nodes: [{ ...BOARD_NODES[1], hexIds: [] }],
        edges: [],
      }),
    ).toThrow('Node n1 does not reference hex h0');
  });

  it('rejects node membership that is not mirrored by the hex', () => {
    expect(() =>
      validateBoard({
        hexes: [{ ...BOARD_HEXES[1], nodeIds: ['n1', 'n2'] }],
        nodes: [{ ...BOARD_NODES[0], hexIds: ['h1'] }, BOARD_NODES[1], BOARD_NODES[2]],
        edges: [],
      }),
    ).toThrow('Hex h1 does not reference node n0');
  });

  it('rejects edge self-loops', () => {
    expect(() =>
      validateBoard({
        hexes: BOARD_HEXES,
        nodes: BOARD_NODES,
        edges: [{ ...BOARD_EDGES[0], nodeIds: ['n0', 'n0'] }],
      }),
    ).toThrow('Edge e0 cannot connect node n0 to itself');
  });

  it('rejects duplicate physical node-pair edges', () => {
    expect(() =>
      validateBoard({
        hexes: BOARD_HEXES,
        nodes: BOARD_NODES,
        edges: [
          { ...BOARD_EDGES[0], id: 'e0', nodeIds: ['n0', 'n1'] },
          { ...BOARD_EDGES[1], id: 'e1', nodeIds: ['n1', 'n0'] },
        ],
      }),
    ).toThrow('Duplicate edge between n0 and n1');
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
    expect(BOARD_NODES.map((node) => node.id)).toEqual([
      'n0',
      'n1',
      'n2',
      'n3',
      'n4',
      'n5',
      'n6',
      'n7',
      'n8',
      'n9',
      'n10',
      'n11',
    ]);
    expect(BOARD_EDGES.map((edge) => edge.id)).toEqual([
      'e0',
      'e1',
      'e2',
      'e3',
      'e4',
      'e5',
      'e6',
      'e7',
      'e8',
      'e9',
      'e10',
      'e11',
      'e12',
      'e13',
      'e14',
      'e15',
      'e16',
      'e17',
      'e18',
      'e19',
      'e20',
    ]);
  });

  it('looks up board nodes and edges by id', () => {
    expect(getEdge('e0').nodeIds).toEqual(['n0', 'n1']);
    expect(getNode('n0').hexIds).toEqual(['h0']);
    expect(() => getEdge('e999' as any)).toThrow('Unknown edge e999');
    expect(() => getNode('n999' as any)).toThrow('Unknown node n999');
  });
});
