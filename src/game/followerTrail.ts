import type { MapEdge } from './edgeTransitions';

export interface TrailPoint {
  readonly x: number;
  readonly y: number;
}

export type FollowerFacing = 'down' | 'left' | 'right' | 'up';

export interface FollowerTrailConfig {
  readonly trailDistance: number;
  readonly speed: number;
  readonly idleDistance: number;
  readonly catchUpDistance: number;
  readonly sampleDistance: number;
  readonly maxHistory: number;
}

export interface FollowerTrailState {
  readonly position: TrailPoint;
  readonly target: TrailPoint;
  readonly history: readonly TrailPoint[];
  readonly facing: FollowerFacing;
  readonly moving: boolean;
  /** Time actually stationary; preserves the walk clip between physics steps. */
  readonly idleElapsedMs: number;
  readonly caughtUp: boolean;
  readonly config: FollowerTrailConfig;
}

const DEFAULT_CONFIG: FollowerTrailConfig = {
  trailDistance: 64,
  speed: 150,
  idleDistance: 3,
  catchUpDistance: 420,
  sampleDistance: 4,
  maxHistory: 96,
};

const WALK_SETTLE_MS = 80;

/**
 * Places a newly loaded follower behind the direction ____ is entering from.
 * Without the arrival edge, retain the legacy left-side start used by doors and
 * direct scene loads.
 */
export function followerStartBehindLeader(
  leader: TrailPoint,
  arrivalEdge?: MapEdge,
  distance = 64,
): TrailPoint {
  switch (arrivalEdge) {
    case 'west':
      return { x: leader.x - distance, y: leader.y };
    case 'east':
      return { x: leader.x + distance, y: leader.y };
    case 'north':
      return { x: leader.x, y: leader.y - distance };
    case 'south':
      return { x: leader.x, y: leader.y + distance };
    default:
      return { x: leader.x - distance, y: leader.y };
  }
}

export function createFollowerTrail(
  initial: TrailPoint,
  config: Partial<FollowerTrailConfig> = {},
): FollowerTrailState {
  return {
    position: { ...initial },
    target: { ...initial },
    history: [{ ...initial }],
    facing: 'down',
    moving: false,
    idleElapsedMs: 0,
    caughtUp: false,
    config: { ...DEFAULT_CONFIG, ...config },
  };
}

export function advanceFollowerTrail(
  state: FollowerTrailState,
  leader: TrailPoint,
  deltaMs: number,
): FollowerTrailState {
  const history = recordLeader(state.history, leader, state.config);
  const target = pointBehindLeader(history, leader, state.config.trailDistance);
  const leaderDistance = distance(state.position, leader);

  if (leaderDistance > state.config.catchUpDistance) {
    return {
      ...state,
      history,
      position: target,
      target,
      moving: false,
      idleElapsedMs: 0,
      caughtUp: true,
    };
  }

  const dx = target.x - state.position.x;
  const dy = target.y - state.position.y;
  const remaining = Math.hypot(dx, dy);
  const elapsed = Math.max(0, deltaMs);
  const step = Math.min(remaining, state.config.speed * elapsed / 1000);
  const ratio = remaining > 0 ? step / remaining : 0;
  // Even the final few pixels obey the speed limit. Snapping across the idle
  // radius can otherwise exceed a high-refresh frame's movement allowance.
  const position = step >= remaining ? target : {
    x: state.position.x + dx * ratio,
    y: state.position.y + dy * ratio,
  };
  if (remaining <= state.config.idleDistance) {
    // ____'s physics runs at 60 Hz; render frames between those steps can
    // have an unchanged target. Only settle after a short elapsed-time pause,
    // so they cannot repeatedly restart ____'s walking animation.
    const idleElapsedMs = step > 0.001 ? 0 : state.idleElapsedMs + elapsed;
    return {
      ...state,
      history,
      position,
      target,
      moving: state.moving && idleElapsedMs < WALK_SETTLE_MS,
      idleElapsedMs,
      caughtUp: false,
    };
  }

  return {
    ...state,
    history,
    position,
    target,
    facing: facingFor(dx, dy, state.facing),
    moving: true,
    idleElapsedMs: 0,
    caughtUp: false,
  };
}

function recordLeader(
  history: readonly TrailPoint[],
  leader: TrailPoint,
  config: FollowerTrailConfig,
): readonly TrailPoint[] {
  const last = history.at(-1);
  if (last && distance(last, leader) < config.sampleDistance) {
    return history;
  }
  return [...history, { ...leader }].slice(-config.maxHistory);
}

function pointBehindLeader(
  history: readonly TrailPoint[],
  leader: TrailPoint,
  trailDistance: number,
): TrailPoint {
  const points = history.length > 0 ? history : [leader];
  let cursor: TrailPoint = leader;
  let remaining = trailDistance;

  for (let index = points.length - 2; index >= 0; index -= 1) {
    const previous = points[index];
    const segment = distance(cursor, previous);
    if (segment >= remaining && segment > 0) {
      const ratio = remaining / segment;
      return {
        x: cursor.x + (previous.x - cursor.x) * ratio,
        y: cursor.y + (previous.y - cursor.y) * ratio,
      };
    }
    remaining -= segment;
    cursor = previous;
  }

  return { ...points[0] };
}

function facingFor(dx: number, dy: number, fallback: FollowerFacing): FollowerFacing {
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return fallback;
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0 ? 'left' : 'right';
  }
  return dy < 0 ? 'up' : 'down';
}

function distance(a: TrailPoint, b: TrailPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
