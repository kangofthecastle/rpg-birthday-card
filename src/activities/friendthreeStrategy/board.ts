import type {
  BoardEdge,
  BoardHex,
  BoardNode,
  FriendThreeStrategyState,
  EdgeId,
  HexId,
  NodeId,
} from './types';

export const EMPTY_RESOURCES = { wood: 0, stone: 0, grain: 0 } as const;

export const BOARD_HEXES: readonly BoardHex[] = [
  { id: 'h0', resource: 'wood', roll: 5, nodeIds: ['n0', 'n1', 'n4'], q: 0, r: 0 },
  { id: 'h1', resource: 'stone', roll: 6, nodeIds: ['n1', 'n2', 'n5', 'n4'], q: 1, r: 0 },
  { id: 'h2', resource: 'wood', roll: 8, nodeIds: ['n2', 'n3', 'n6', 'n5'], q: 2, r: 0 },
  { id: 'h3', resource: 'stone', roll: 4, nodeIds: ['n4', 'n5', 'n8', 'n7'], q: 0, r: 1 },
  { id: 'h4', resource: 'grain', roll: 9, nodeIds: ['n5', 'n6', 'n9', 'n8'], q: 1, r: 1 },
  { id: 'h5', resource: 'wood', roll: 10, nodeIds: ['n7', 'n8', 'n10'], q: 0, r: 2 },
  { id: 'h6', resource: 'stone', roll: 3, nodeIds: ['n8', 'n9', 'n11', 'n10'], q: 1, r: 2 },
];

export const BOARD_NODES: readonly BoardNode[] = [
  { id: 'n0', x: 80, y: 80, hexIds: ['h0'] },
  { id: 'n1', x: 160, y: 64, hexIds: ['h0', 'h1'] },
  { id: 'n2', x: 240, y: 64, hexIds: ['h1', 'h2'] },
  { id: 'n3', x: 320, y: 80, hexIds: ['h2'] },
  { id: 'n4', x: 120, y: 150, hexIds: ['h0', 'h1', 'h3'] },
  { id: 'n5', x: 210, y: 145, hexIds: ['h1', 'h2', 'h3', 'h4'] },
  { id: 'n6', x: 300, y: 150, hexIds: ['h2', 'h4'] },
  { id: 'n7', x: 120, y: 230, hexIds: ['h3', 'h5'] },
  { id: 'n8', x: 210, y: 230, hexIds: ['h3', 'h4', 'h5', 'h6'] },
  { id: 'n9', x: 300, y: 230, hexIds: ['h4', 'h6'] },
  { id: 'n10', x: 170, y: 305, hexIds: ['h5', 'h6'] },
  { id: 'n11', x: 270, y: 305, hexIds: ['h6'] },
];

export const BOARD_EDGES: readonly BoardEdge[] = [
  edge('e0', 'n0', 'n1'),
  edge('e1', 'n1', 'n2'),
  edge('e2', 'n2', 'n3'),
  edge('e3', 'n0', 'n4'),
  edge('e4', 'n1', 'n4'),
  edge('e5', 'n1', 'n5'),
  edge('e6', 'n2', 'n5'),
  edge('e7', 'n2', 'n6'),
  edge('e8', 'n3', 'n6'),
  edge('e9', 'n4', 'n5'),
  edge('e10', 'n5', 'n6'),
  edge('e11', 'n4', 'n7'),
  edge('e12', 'n5', 'n8'),
  edge('e13', 'n6', 'n9'),
  edge('e14', 'n7', 'n8'),
  edge('e15', 'n8', 'n9'),
  edge('e16', 'n7', 'n10'),
  edge('e17', 'n8', 'n10'),
  edge('e18', 'n8', 'n11'),
  edge('e19', 'n9', 'n11'),
  edge('e20', 'n10', 'n11'),
];

export function createInitialMatchState(): FriendThreeStrategyState {
  return {
    turnNumber: 1,
    currentPlayer: 'recipient',
    resources: {
      recipient: { wood: 4, stone: 4, grain: 1 },
      friendthree: { wood: 2, stone: 2, grain: 0 },
    },
    roads: [],
    settlements: [
      { owner: 'recipient', nodeId: 'n0' },
      { owner: 'friendthree', nodeId: 'n11' },
    ],
    log: [],
  };
}

export function validateBoard(): void {
  const nodeIds = new Set<NodeId>(BOARD_NODES.map((node) => node.id));
  const hexIds = new Set<HexId>(BOARD_HEXES.map((hex) => hex.id));

  for (const hex of BOARD_HEXES) {
    for (const nodeId of hex.nodeIds) {
      if (!nodeIds.has(nodeId)) {
        throw new Error(`Hex ${hex.id} references missing node ${nodeId}`);
      }
    }
  }

  for (const node of BOARD_NODES) {
    for (const hexId of node.hexIds) {
      if (!hexIds.has(hexId)) {
        throw new Error(`Node ${node.id} references missing hex ${hexId}`);
      }
    }
  }

  for (const boardEdge of BOARD_EDGES) {
    for (const nodeId of boardEdge.nodeIds) {
      if (!nodeIds.has(nodeId)) {
        throw new Error(`Edge ${boardEdge.id} references missing node ${nodeId}`);
      }
    }
  }
}

export function getEdge(edgeId: EdgeId): BoardEdge {
  const boardEdge = BOARD_EDGES.find((candidate) => candidate.id === edgeId);
  if (!boardEdge) {
    throw new Error(`Unknown edge ${edgeId}`);
  }
  return boardEdge;
}

export function getNode(nodeId: NodeId): BoardNode {
  const node = BOARD_NODES.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`Unknown node ${nodeId}`);
  }
  return node;
}

function edge(id: EdgeId, a: NodeId, b: NodeId): BoardEdge {
  return { id, nodeIds: [a, b] };
}
