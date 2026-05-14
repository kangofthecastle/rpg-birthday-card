import type { FriendThreeStrategyState, PlayerId, ResourceCounts, ResourceType } from './types';

export function canBankTrade(
  state: FriendThreeStrategyState,
  player: PlayerId,
  source: ResourceType,
  target: ResourceType,
): boolean {
  if (source === target) {
    return false;
  }

  const cost = getTradeCostOrUndefined(source, target);
  return cost !== undefined && state.resources[player][source] >= cost;
}

export function applyBankTrade(
  state: FriendThreeStrategyState,
  player: PlayerId,
  source: ResourceType,
  target: ResourceType,
): FriendThreeStrategyState {
  if (source === target) {
    throw new Error(`Cannot trade ${source} for ${target}`);
  }

  const cost = getTradeCost(source, target);
  const playerResources = state.resources[player];

  if (playerResources[source] < cost) {
    throw new Error(`${player} cannot trade ${cost} ${source} for ${target}`);
  }

  const nextPlayerResources: ResourceCounts = {
    ...playerResources,
    [source]: playerResources[source] - cost,
    [target]: playerResources[target] + 1,
  };

  return {
    ...state,
    resources: {
      ...state.resources,
      [player]: nextPlayerResources,
    },
    log: [
      ...state.log,
      {
        type: 'trade',
        message: `${player} traded ${cost} ${source} for 1 ${target}`,
      },
    ],
  };
}

function getTradeCost(source: ResourceType, target: ResourceType): number {
  const cost = getTradeCostOrUndefined(source, target);
  if (cost === undefined) {
    throw new Error(`Cannot trade ${source} for ${target}`);
  }

  return cost;
}

function getTradeCostOrUndefined(source: ResourceType, target: ResourceType): number | undefined {
  if (source === 'grain') {
    if (target !== 'wood' && target !== 'stone') {
      return undefined;
    }

    return 2;
  }

  return 3;
}
