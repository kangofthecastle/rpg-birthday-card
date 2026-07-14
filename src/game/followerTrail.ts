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
      caughtUp: true,
    };
  }

  const dx = target.x - state.position.x;
  const dy = target.y - state.position.y;
  const remaining = Math.hypot(dx, dy);
  if (remaining <= state.config.idleDistance) {
    return {
      ...state,
      history,
      position: target,
      target,
      moving: false,
      caughtUp: false,
    };
  }

  const step = Math.min(remaining, state.config.speed * Math.max(0, deltaMs) / 1000);
  const ratio = remaining > 0 ? step / remaining : 0;
  return {
    ...state,
    history,
    position: {
      x: state.position.x + dx * ratio,
      y: state.position.y + dy * ratio,
    },
    target,
    facing: facingFor(dx, dy, state.facing),
    moving: true,
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
