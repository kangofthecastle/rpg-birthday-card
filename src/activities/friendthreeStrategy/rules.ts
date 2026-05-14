import { BOARD_EDGES, BOARD_HEXES } from './board';
import { getWinner, updateLongestRoadOwner } from './scoring';
import type {
  FriendThreeStrategyState,
  EdgeId,
  NodeId,
  PlayerId,
  ResourceCounts,
  ResourceType,
} from './types';

const ROAD_COST = { wood: 1, stone: 1, grain: 0 } as const satisfies ResourceCounts;
const SETTLEMENT_COST = { wood: 1, stone: 1, grain: 1 } as const satisfies ResourceCounts;
const SCRIPTED_ROLLS = [5, 6, 9, 8, 4, 10, 3] as const;

export function rollProduction(state: FriendThreeStrategyState, roll: number): FriendThreeStrategyState {
  const matchingHexes = BOARD_HEXES.filter((hex) => hex.roll === roll);
  const resourceGains: Partial<Record<PlayerId, ResourceCounts>> = {};
  const gainMessages: string[] = [];

  for (const hex of matchingHexes) {
    for (const settlement of state.settlements) {
      if (!hex.nodeIds.includes(settlement.nodeId)) {
        continue;
      }

      const currentResources = resourceGains[settlement.owner] ?? state.resources[settlement.owner];
      resourceGains[settlement.owner] = addResource(currentResources, hex.resource, 1);
      gainMessages.push(`${settlement.owner} gained 1 ${hex.resource} from ${hex.id}`);
    }
  }

  return {
    ...state,
    resources: {
      ...state.resources,
      ...resourceGains,
    },
    lastRoll: roll,
    log: [
      ...state.log,
      {
        type: 'roll',
        message: `Rolled ${roll}: ${gainMessages.length > 0 ? gainMessages.join(', ') : 'no production'}`,
      },
    ],
  };
}

export function getBuildableEdges(state: FriendThreeStrategyState, player: PlayerId): EdgeId[] {
  if (!canPay(state.resources[player], ROAD_COST)) {
    return [];
  }

  const occupiedEdgeIds = new Set(state.roads.map((road) => road.edgeId));
  const playerSettlementNodeIds = new Set(
    state.settlements
      .filter((settlement) => settlement.owner === player)
      .map((settlement) => settlement.nodeId),
  );
  const opponentSettlementNodeIds = new Set(
    state.settlements
      .filter((settlement) => settlement.owner !== player)
      .map((settlement) => settlement.nodeId),
  );
  const playerRoadNodeIds = new Set<NodeId>();

  for (const road of state.roads) {
    if (road.owner !== player) {
      continue;
    }

    const edge = BOARD_EDGES.find((candidate) => candidate.id === road.edgeId);
    if (!edge) {
      continue;
    }

    for (const nodeId of edge.nodeIds) {
      if (opponentSettlementNodeIds.has(nodeId)) {
        continue;
      }

      playerRoadNodeIds.add(nodeId);
    }
  }

  return BOARD_EDGES.filter(
    (edge) =>
      !occupiedEdgeIds.has(edge.id) &&
      edge.nodeIds.some((nodeId) => playerSettlementNodeIds.has(nodeId) || playerRoadNodeIds.has(nodeId)),
  ).map((edge) => edge.id);
}

export function buildRoad(
  state: FriendThreeStrategyState,
  player: PlayerId,
  edgeId: EdgeId,
): FriendThreeStrategyState {
  if (!getBuildableEdges(state, player).includes(edgeId)) {
    throw new Error(`${player} cannot build road ${edgeId}`);
  }

  return updateScoringAndWinner({
    ...state,
    resources: {
      ...state.resources,
      [player]: spendResources(state.resources[player], ROAD_COST),
    },
    roads: [...state.roads, { owner: player, edgeId }],
    log: [
      ...state.log,
      {
        type: 'build-road',
        message: `${player} built road ${edgeId}`,
      },
    ],
  });
}

export function getBuildableNodes(state: FriendThreeStrategyState, player: PlayerId): NodeId[] {
  if (!canPay(state.resources[player], SETTLEMENT_COST)) {
    return [];
  }

  const occupiedNodeIds = new Set(state.settlements.map((settlement) => settlement.nodeId));
  const buildableNodeIds = new Set<NodeId>();

  for (const road of state.roads) {
    if (road.owner !== player) {
      continue;
    }

    const edge = BOARD_EDGES.find((candidate) => candidate.id === road.edgeId);
    if (!edge) {
      continue;
    }

    for (const nodeId of edge.nodeIds) {
      if (!occupiedNodeIds.has(nodeId)) {
        buildableNodeIds.add(nodeId);
      }
    }
  }

  return Array.from(buildableNodeIds);
}

export function buildSettlement(
  state: FriendThreeStrategyState,
  player: PlayerId,
  nodeId: NodeId,
): FriendThreeStrategyState {
  if (!getBuildableNodes(state, player).includes(nodeId)) {
    throw new Error(`${player} cannot build settlement ${nodeId}`);
  }

  return updateScoringAndWinner({
    ...state,
    resources: {
      ...state.resources,
      [player]: spendResources(state.resources[player], SETTLEMENT_COST),
    },
    settlements: [...state.settlements, { owner: player, nodeId }],
    log: [
      ...state.log,
      {
        type: 'build-settlement',
        message: `${player} built settlement ${nodeId}`,
      },
    ],
  });
}

export function endTurn(state: FriendThreeStrategyState): FriendThreeStrategyState {
  const nextPlayer: PlayerId = state.currentPlayer === 'recipient' ? 'friendthree' : 'recipient';

  return {
    ...state,
    currentPlayer: nextPlayer,
    turnNumber: state.currentPlayer === 'friendthree' ? state.turnNumber + 1 : state.turnNumber,
    log: [
      ...state.log,
      {
        type: 'pass',
        message: `${state.currentPlayer} passed`,
      },
    ],
  };
}

export function getScriptedRoll(turnNumber: number): number {
  const rollIndex = positiveModulo(turnNumber - 1, SCRIPTED_ROLLS.length);
  return SCRIPTED_ROLLS[rollIndex];
}

function updateScoringAndWinner(state: FriendThreeStrategyState): FriendThreeStrategyState {
  const scored = updateLongestRoadOwner(state);
  const winner = getWinner(scored);

  if (!winner) {
    return {
      ...scored,
      winner: undefined,
    };
  }

  if (state.winner === winner) {
    return {
      ...scored,
      winner,
    };
  }

  return {
    ...scored,
    winner,
    log: [
      ...scored.log,
      {
        type: 'win',
        message: `${winner} wins`,
      },
    ],
  };
}

function canPay(resources: ResourceCounts, cost: ResourceCounts): boolean {
  return resources.wood >= cost.wood && resources.stone >= cost.stone && resources.grain >= cost.grain;
}

function spendResources(resources: ResourceCounts, cost: ResourceCounts): ResourceCounts {
  return {
    wood: resources.wood - cost.wood,
    stone: resources.stone - cost.stone,
    grain: resources.grain - cost.grain,
  };
}

function addResource(
  resources: ResourceCounts,
  resource: ResourceType,
  amount: number,
): ResourceCounts {
  return {
    ...resources,
    [resource]: resources[resource] + amount,
  };
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
