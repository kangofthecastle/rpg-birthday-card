import { describe, expect, it } from 'vitest';
import * as followerRouteModule from '../../src/game/followerRoute';
import {
  advanceFollowerRoute,
  createFollowerRoute,
  createFriendTwoRoomFriendOneRoute,
  facingForScreenDeltaWithHysteresis,
  FRIEND_TWO_ROOM_FRIEND_ONE_OFFSET,
  type RoutePoint,
} from '../../src/game/followerRoute';

const point = (x: number, y: number): RoutePoint => ({ x, y });

describe('followerRoute', () => {
  it('faces down when projected movement is mostly downward on screen', () => {
    const facingForScreenDelta = (
      followerRouteModule as typeof followerRouteModule & {
        facingForScreenDelta?: (
          from: RoutePoint,
          to: RoutePoint,
          fallback: 'down' | 'left' | 'right' | 'up',
        ) => 'down' | 'left' | 'right' | 'up';
      }
    ).facingForScreenDelta;

    expect(facingForScreenDelta?.(point(100, 100), point(142, 188), 'right')).toBe('down');
  });

  describe('facingForScreenDeltaWithHysteresis', () => {
    it('faces up for straight-north screen movement regardless of starting facing', () => {
      expect(facingForScreenDeltaWithHysteresis(point(100, 100), point(100, 40), 'down')).toBe('up');
      expect(facingForScreenDeltaWithHysteresis(point(100, 100), point(100, 40), 'right')).toBe('up');
      expect(facingForScreenDeltaWithHysteresis(point(100, 100), point(100, 40), 'left')).toBe('up');
    });

    it('returns current facing when the delta is below the dead zone', () => {
      expect(facingForScreenDeltaWithHysteresis(point(100, 100), point(100.2, 99.8), 'left')).toBe('left');
      expect(facingForScreenDeltaWithHysteresis(point(0, 0), point(0, 0), 'up')).toBe('up');
    });

    it('keeps current facing on a perfect 45-degree diagonal across repeated calls', () => {
      let facing: 'down' | 'left' | 'right' | 'up' = 'left';
      for (let step = 1; step <= 10; step += 1) {
        facing = facingForScreenDeltaWithHysteresis(
          point(step - 1, step - 1),
          point(step, step),
          facing,
        );
        expect(facing).toBe('left');
      }
    });

    it('does not oscillate on a near-45-degree diagonal', () => {
      // dx just barely beats dy, but not by the bias factor, so it should stick.
      expect(facingForScreenDeltaWithHysteresis(point(0, 0), point(11, 10), 'up')).toBe('up');
    });

    it('switches to right once eastbound movement clearly dominates after a corner', () => {
      // Was heading north; now turns hard east so dx dominates by more than the bias.
      let facing: 'down' | 'left' | 'right' | 'up' = 'up';
      facing = facingForScreenDeltaWithHysteresis(point(0, 0), point(40, 2), facing);
      expect(facing).toBe('right');
    });

    it('switches within a couple frames when turning a corner from north to east', () => {
      let facing: 'down' | 'left' | 'right' | 'up' = 'up';
      const frames: RoutePoint[] = [point(18, 24), point(36, 20), point(56, 19)];
      let from = point(10, 30);
      let switched = -1;
      frames.forEach((to, index) => {
        facing = facingForScreenDeltaWithHysteresis(from, to, facing);
        if (facing === 'right' && switched < 0) switched = index;
        from = to;
      });
      expect(facing).toBe('right');
      expect(switched).toBeGreaterThanOrEqual(0);
      expect(switched).toBeLessThanOrEqual(1);
    });
  });

  it('starts ____ near ____ without sharing her exact spawn point', () => {
    const recipient = point(704, 768);
    const route = createFriendTwoRoomFriendOneRoute(recipient);

    expect(route.position).toEqual({
      x: recipient.x + FRIEND_TWO_ROOM_FRIEND_ONE_OFFSET.x,
      y: recipient.y + FRIEND_TWO_ROOM_FRIEND_ONE_OFFSET.y,
    });
    expect(route.position).not.toEqual(recipient);
    const separation = Math.hypot(
      route.position.x - recipient.x,
      route.position.y - recipient.y,
    );
    expect(separation).toBeGreaterThan(90);
    expect(separation).toBeLessThan(130);
  });

  it('moves gradually and never exceeds the configured walk distance', () => {
    const route = createFollowerRoute(point(0, 0), [point(100, 0)], { speed: 150 });
    const next = advanceFollowerRoute(route, 100);

    expect(next.position).toEqual(point(15, 0));
    expect(next.facing).toBe('right');
    expect(next.moving).toBe(true);
    expect(next.arrived).toBe(false);
  });

  it('uses remaining movement to traverse waypoints without teleporting', () => {
    let route = createFollowerRoute(
      point(0, 0),
      [point(10, 0), point(10, 10), point(30, 10)],
      { speed: 20 },
    );

    route = advanceFollowerRoute(route, 750);
    expect(route.position).toEqual(point(10, 5));
    expect(route.waypointIndex).toBe(1);
    expect(route.facing).toBe('down');
    expect(route.arrived).toBe(false);

    route = advanceFollowerRoute(route, 250);
    expect(route.position).toEqual(point(10, 10));
    expect(route.waypointIndex).toBe(2);
  });

  it('parks at the final waypoint and remains still on later updates', () => {
    let route = createFollowerRoute(point(0, 0), [point(12, 0)], { speed: 12 });
    route = advanceFollowerRoute(route, 1000);

    expect(route.position).toEqual(point(12, 0));
    expect(route.arrived).toBe(true);
    expect(route.moving).toBe(false);

    expect(advanceFollowerRoute(route, 1000)).toEqual(route);
  });
});
