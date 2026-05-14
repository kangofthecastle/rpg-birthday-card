export type PlayerId = 'recipient' | 'friendthree';
export type ResourceType = 'wood' | 'stone' | 'grain';
export type HexId = `h${number}`;
export type NodeId = `n${number}`;
export type EdgeId = `e${number}`;

export interface ResourceCounts {
  readonly wood: number;
  readonly stone: number;
  readonly grain: number;
}

export interface BoardHex {
  readonly id: HexId;
  readonly resource: ResourceType;
  readonly roll: number;
  readonly nodeIds: readonly NodeId[];
  readonly q: number;
  readonly r: number;
}

export interface BoardNode {
  readonly id: NodeId;
  readonly x: number;
  readonly y: number;
  readonly hexIds: readonly HexId[];
}

export interface BoardEdge {
  readonly id: EdgeId;
  readonly nodeIds: readonly [NodeId, NodeId];
}

export interface BuiltRoad {
  readonly owner: PlayerId;
  readonly edgeId: EdgeId;
}

export interface BuiltSettlement {
  readonly owner: PlayerId;
  readonly nodeId: NodeId;
}

export interface MatchLogEntry {
  readonly type: 'roll' | 'build-road' | 'build-settlement' | 'trade' | 'pass' | 'win';
  readonly message: string;
}

export interface FriendThreeStrategyState {
  readonly turnNumber: number;
  readonly currentPlayer: PlayerId;
  readonly resources: Record<PlayerId, ResourceCounts>;
  readonly roads: readonly BuiltRoad[];
  readonly settlements: readonly BuiltSettlement[];
  readonly longestRoadOwner?: PlayerId;
  readonly winner?: PlayerId;
  readonly lastRoll?: number;
  readonly log: readonly MatchLogEntry[];
}
