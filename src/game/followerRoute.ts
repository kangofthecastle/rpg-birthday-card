import type { FollowerFacing } from './followerTrail';

export interface RoutePoint {
  readonly x: number;
  readonly y: number;
}

export interface FollowerRouteConfig {
  readonly speed: number;
}

export interface FollowerRouteState {
  readonly position: RoutePoint;
  readonly waypoints: readonly RoutePoint[];
  /** Index of the waypoint currently being approached. */
  readonly waypointIndex: number;
  readonly facing: FollowerFacing;
  readonly moving: boolean;
  readonly arrived: boolean;
  readonly config: FollowerRouteConfig;
}

const DEFAULT_CONFIG: FollowerRouteConfig = { speed: 150 };
const FRIEND_ONE_FOLLOW_SPEED = 175;

// In the isometric projection this lands ____ about one character-width to
// ____'s left: clearly together, but never visually sharing a spawn.
export const FRIEND_TWO_ROOM_FRIEND_ONE_OFFSET: RoutePoint = { x: -96, y: 64 };

/** Open-floor path from ____'s entry area to the unused PC on the right. */
export const FRIEND_TWO_ROOM_FRIEND_ONE_PC_WAYPOINTS: readonly RoutePoint[] = [
  { x: 760, y: 704 },
  { x: 888, y: 624 },
  { x: 1040, y: 552 },
  { x: 1180, y: 492 },
];

export function createFollowerRoute(
  start: RoutePoint,
  waypoints: readonly RoutePoint[],
  config: Partial<FollowerRouteConfig> = {},
): FollowerRouteState {
  return {
    position: { ...start },
    waypoints: waypoints.map((waypoint) => ({ ...waypoint })),
    waypointIndex: 0,
    facing: 'down',
    moving: false,
    arrived: waypoints.length === 0,
    config: { ...DEFAULT_CONFIG, ...config },
  };
}

export function createFriendTwoRoomFriendOneRoute(recipient: RoutePoint): FollowerRouteState {
  return createFollowerRoute(
    {
      x: recipient.x + FRIEND_TWO_ROOM_FRIEND_ONE_OFFSET.x,
      y: recipient.y + FRIEND_TWO_ROOM_FRIEND_ONE_OFFSET.y,
    },
    FRIEND_TWO_ROOM_FRIEND_ONE_PC_WAYPOINTS,
    { speed: FRIEND_ONE_FOLLOW_SPEED },
  );
}

export function advanceFollowerRoute(
  state: FollowerRouteState,
  deltaMs: number,
): FollowerRouteState {
  if (state.arrived) return state;

  let position = state.position;
  let waypointIndex = state.waypointIndex;
  let remainingStep = state.config.speed * Math.max(0, deltaMs) / 1000;
  let facing = state.facing;
  let moved = false;

  while (remainingStep > 0 && waypointIndex < state.waypoints.length) {
    const target = state.waypoints[waypointIndex];
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= Number.EPSILON) {
      position = { ...target };
      waypointIndex += 1;
      continue;
    }

    facing = facingFor(dx, dy, facing);
    const travel = Math.min(distance, remainingStep);
    position = {
      x: position.x + dx * travel / distance,
      y: position.y + dy * travel / distance,
    };
    remainingStep -= travel;
    moved = true;

    if (travel >= distance) {
      position = { ...target };
      waypointIndex += 1;
    }
  }

  const arrived = waypointIndex >= state.waypoints.length;
  return {
    ...state,
    position,
    waypointIndex,
    facing,
    moving: moved && !arrived,
    arrived,
  };
}

export function facingForScreenDelta(
  from: RoutePoint,
  to: RoutePoint,
  fallback: FollowerFacing,
): FollowerFacing {
  return facingFor(to.x - from.x, to.y - from.y, fallback);
}

function facingFor(dx: number, dy: number, fallback: FollowerFacing): FollowerFacing {
  if (Math.abs(dx) < Number.EPSILON && Math.abs(dy) < Number.EPSILON) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/**
 * Screen-space facing with hysteresis. Like {@link facingForScreenDelta}, but
 * sticky: the returned facing only moves away from `current` when the winning
 * axis' magnitude beats the other axis by at least `bias`. This stops flappy
 * flips on diagonals (a perfect 45° keeps `current`) while still turning
 * corners within a frame or two once one axis clearly dominates.
 * deltaMs scales the dead zone to elapsed time, retaining the original 60 Hz
 * threshold without suppressing legitimate small steps on faster displays.
 */
export function facingForScreenDeltaWithHysteresis(
  from: RoutePoint,
  to: RoutePoint,
  current: FollowerFacing,
  bias = 1.3,
  deltaMs = 1000 / 60,
): FollowerFacing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);

  // Dead zone: barely any movement, keep whatever we were showing.
  const deadZone = 0.5 * Math.max(0, deltaMs) / (1000 / 60);
  if ((ax === 0 && ay === 0) || (ax < deadZone && ay < deadZone)) return current;

  const candidate = facingFor(dx, dy, current);
  if (candidate === current) return current;

  // Only switch if the winning axis dominates the other by the bias factor.
  // Ties or near-ties (e.g. a 45° diagonal) leave `current` untouched.
  const winner = ax >= ay ? ax : ay;
  const loser = ax >= ay ? ay : ax;
  if (winner >= loser * bias) return candidate;
  return current;
}
