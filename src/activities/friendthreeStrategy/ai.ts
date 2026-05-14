import { scorePlayer } from './scoring';
import { getBuildableEdges, getBuildableNodes } from './rules';
import { canBankTrade } from './trade';
import type { RandomSource } from './rng';
import type { FriendThreeStrategyState, EdgeId, NodeId, ResourceType } from './types';

export type FriendThreeAction =
  | { readonly type: 'build-road'; readonly edgeId: EdgeId }
  | { readonly type: 'build-settlement'; readonly nodeId: NodeId }
  | { readonly type: 'trade'; readonly from: ResourceType; readonly to: ResourceType }
  | { readonly type: 'pass' };

export function chooseFriendThreeAction(state: FriendThreeStrategyState, random: RandomSource): FriendThreeAction {
  const friendthreeScore = scorePlayer(state, 'friendthree');
  const recipientScore = scorePlayer(state, 'recipient');

  if (friendthreeScore > recipientScore && random() < 0.65) {
    return { type: 'pass' };
  }

  const buildableNodes = getBuildableNodes(state, 'friendthree').sort();
  if (buildableNodes.length > 0 && random() >= 0.18) {
    return { type: 'build-settlement', nodeId: buildableNodes[0] };
  }

  const buildableEdges = getBuildableEdges(state, 'friendthree').sort();
  if (buildableEdges.length > 0) {
    const index = random() < 0.25 && buildableEdges.length > 1 ? 1 : 0;
    return { type: 'build-road', edgeId: buildableEdges[index] };
  }

  const resources = state.resources.friendthree;
  if (resources.wood === 0 && canBankTrade(state, 'friendthree', 'grain', 'wood')) {
    return { type: 'trade', from: 'grain', to: 'wood' };
  }

  if (resources.stone === 0 && canBankTrade(state, 'friendthree', 'grain', 'stone')) {
    return { type: 'trade', from: 'grain', to: 'stone' };
  }

  if (resources.grain === 0 && canBankTrade(state, 'friendthree', 'wood', 'grain')) {
    return { type: 'trade', from: 'wood', to: 'grain' };
  }

  if (resources.grain === 0 && canBankTrade(state, 'friendthree', 'stone', 'grain')) {
    return { type: 'trade', from: 'stone', to: 'grain' };
  }

  return { type: 'pass' };
}
