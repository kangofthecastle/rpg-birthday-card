import { getEdge } from './board';
import type { FriendThreeStrategyState, EdgeId, NodeId, PlayerId } from './types';

const LONGEST_ROAD_MINIMUM = 3;

export function scorePlayer(state: FriendThreeStrategyState, player: PlayerId): number {
  const settlementPoints = state.settlements.filter((settlement) => settlement.owner === player).length;
  const longestRoadPoints = state.longestRoadOwner === player ? 2 : 0;

  return settlementPoints + longestRoadPoints;
}

export function getWinner(state: FriendThreeStrategyState): PlayerId | undefined {
  for (const player of ['recipient', 'friendthree'] as const) {
    if (scorePlayer(state, player) >= 4) {
      return player;
    }
  }

  return undefined;
}

export function updateLongestRoadOwner(state: FriendThreeStrategyState): FriendThreeStrategyState {
  const recipientLength = calculateLongestRoadLength(state, 'recipient');
  const friendthreeLength = calculateLongestRoadLength(state, 'friendthree');
  const longestRoadOwner =
    recipientLength >= LONGEST_ROAD_MINIMUM && recipientLength > friendthreeLength
      ? 'recipient'
      : friendthreeLength >= LONGEST_ROAD_MINIMUM && friendthreeLength > recipientLength
        ? 'friendthree'
        : undefined;

  return {
    ...state,
    longestRoadOwner,
  };
}

export function calculateLongestRoadLength(state: FriendThreeStrategyState, player: PlayerId): number {
  const playerEdgeIds = state.roads
    .filter((road) => road.owner === player)
    .map((road) => road.edgeId);
  const opponentSettlementNodeIds = new Set(
    state.settlements
      .filter((settlement) => settlement.owner !== player)
      .map((settlement) => settlement.nodeId),
  );

  if (playerEdgeIds.length === 0) {
    return 0;
  }

  const edgesByNode = new Map<NodeId, EdgeId[]>();
  for (const edgeId of playerEdgeIds) {
    const edge = getEdge(edgeId);

    for (const nodeId of edge.nodeIds) {
      const edgeIds = edgesByNode.get(nodeId) ?? [];
      edgeIds.push(edgeId);
      edgesByNode.set(nodeId, edgeIds);
    }
  }

  let longest = 0;
  for (const edgeId of playerEdgeIds) {
    const edge = getEdge(edgeId);

    longest = Math.max(
      longest,
      1 + walkLongestRoad(edge.nodeIds[0], edgesByNode, opponentSettlementNodeIds, new Set([edgeId])),
      1 + walkLongestRoad(edge.nodeIds[1], edgesByNode, opponentSettlementNodeIds, new Set([edgeId])),
    );
  }

  return longest;
}

function walkLongestRoad(
  nodeId: NodeId,
  edgesByNode: ReadonlyMap<NodeId, readonly EdgeId[]>,
  opponentSettlementNodeIds: ReadonlySet<NodeId>,
  usedEdgeIds: ReadonlySet<EdgeId>,
): number {
  if (opponentSettlementNodeIds.has(nodeId)) {
    return 0;
  }

  let longest = 0;

  for (const edgeId of edgesByNode.get(nodeId) ?? []) {
    if (usedEdgeIds.has(edgeId)) {
      continue;
    }

    const edge = getEdge(edgeId);
    const nextNodeId = edge.nodeIds[0] === nodeId ? edge.nodeIds[1] : edge.nodeIds[0];
    const nextUsedEdgeIds = new Set(usedEdgeIds);
    nextUsedEdgeIds.add(edgeId);

    longest = Math.max(
      longest,
      1 + walkLongestRoad(
        nextNodeId,
        edgesByNode,
        opponentSettlementNodeIds,
        nextUsedEdgeIds,
      ),
    );
  }

  return longest;
}
