// Organic in-water fish behavior for the ____ pond scene.
//
// This is a *visual* steering layer that sits on top of the catch meter in
// `fishingModel.ts`; it never decides whether a fish is caught (the meter still
// owns that). Its job is to make the pond fish notice a cast bobber, drift
// toward it with a little wander and hesitation, inspect/nibble before it
// commits, and then hold on the bobber while the player reels — so the water
// reads as reacting to the line instead of swimming a fixed sine wave.
//
// Pure and deterministic: all randomness comes from an injected seed via a
// small mulberry32 PRNG, so the model is unit-testable without a canvas.

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export type FishBehaviorPhase =
  | 'roam' // wandering open water, ignoring the line
  | 'approach' // steering toward a noticed bobber
  | 'inspect' // circling / nibbling at the bobber, not yet committed
  | 'commit' // hooked on: holds the bobber while the player reels
  | 'flee'; // spooked or just released: darts away, then roams again

export interface FishBehaviorState {
  readonly position: Vec2;
  readonly velocity: Vec2;
  /** Facing angle in radians, aligned with the eased velocity for rendering. */
  readonly heading: number;
  readonly phase: FishBehaviorPhase;
  /** Free-running wander target angle used by the roam/approach steering. */
  readonly wanderAngle: number;
  readonly phaseElapsedMs: number;
  /** While > elapsedMs, the fish is mid-hesitation (slows + veers). */
  readonly hesitateUntilMs: number;
  /** How long the current inspect bout should last before deciding. */
  readonly inspectDurationMs: number;
  readonly nibbleCount: number;
  /** 0..1 tug the fish is putting on the bobber this frame (drives the dip). */
  readonly bobberDip: number;
  readonly elapsedMs: number;
  /** mulberry32 state; advanced whenever the model consumes randomness. */
  readonly rngState: number;
}

export interface FishBehaviorTarget {
  readonly x: number;
  readonly y: number;
  /** Whether a line is currently cast (a bobber exists to be noticed). */
  readonly active: boolean;
  /** Round progress 0..1; a well-reeled fish is more willing to commit/hold. */
  readonly reeling: number;
}

export interface FishBehaviorBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface FishBehaviorParams {
  readonly bounds: FishBehaviorBounds;
  readonly roamSpeed: number; // px/s while wandering
  readonly approachSpeed: number; // px/s while steering to the bobber
  readonly dartSpeed: number; // px/s for commit lunges / fleeing
  readonly perceptionRadius: number; // notices the bobber within this range
  readonly nibbleRadius: number; // starts inspecting within this range
  readonly commitRadius: number; // "on the bobber" distance while committed
  readonly wanderJitter: number; // rad/s of wander-angle drift
  readonly turnRate: number; // rad/s the heading chases the velocity
  readonly hesitateChancePerSec: number; // approach stutters this often
  readonly hesitateMs: number; // how long a hesitation lasts
  readonly minInspectMs: number;
  readonly maxInspectMs: number;
  readonly shyChance: number; // 0..1 chance an inspect bout ends in a flee
}

const TWO_PI = Math.PI * 2;

/** mulberry32 — tiny, fast, deterministic PRNG returning [0,1). */
function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: t | 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/**
 * Default steering tuning for a pond fish. Faster meter fish also swim and
 * commit a touch faster in the water, so the visual matches the difficulty.
 */
export function createFishBehaviorParams(
  speedPerSecond: number,
  bounds: FishBehaviorBounds,
): FishBehaviorParams {
  const agility = clamp(speedPerSecond / 60, 0.7, 1.9);
  return {
    bounds,
    roamSpeed: 24 * agility,
    approachSpeed: 62 * agility,
    dartSpeed: 100 * agility,
    // Covers the whole pond so a cast line is reliably noticed from anywhere;
    // the organic feel comes from the wander/hesitation during the approach and
    // the inspect-before-commit bout, not from a slow discovery.
    perceptionRadius: 460,
    nibbleRadius: 26,
    commitRadius: 9,
    wanderJitter: 2.6,
    turnRate: 4.2,
    hesitateChancePerSec: 0.9,
    hesitateMs: 460,
    minInspectMs: 520,
    maxInspectMs: 1500,
    shyChance: 0.4,
  };
}

export function createFishBehaviorState(
  spawn: Vec2,
  seed: number,
  heading = Math.PI,
): FishBehaviorState {
  return {
    position: spawn,
    velocity: { x: 0, y: 0 },
    heading,
    phase: 'roam',
    wanderAngle: heading,
    phaseElapsedMs: 0,
    hesitateUntilMs: 0,
    inspectDurationMs: 0,
    nibbleCount: 0,
    bobberDip: 0,
    elapsedMs: 0,
    rngState: seed | 0,
  };
}

export function isFishBiting(state: FishBehaviorState): boolean {
  return state.phase === 'commit' || (state.phase === 'inspect' && state.bobberDip > 0.45);
}

/**
 * Force the fish into a flee (used when the catch resolves): it darts away from
 * the bobber and then resumes roaming, so a caught fish visibly leaves.
 */
export function spookFish(state: FishBehaviorState): FishBehaviorState {
  return { ...state, phase: 'flee', phaseElapsedMs: 0, bobberDip: 0 };
}

export function updateFishBehavior(
  state: FishBehaviorState,
  target: FishBehaviorTarget,
  params: FishBehaviorParams,
  deltaMs: number,
): FishBehaviorState {
  const dt = clamp(deltaMs, 0, 100) / 1000;
  if (dt <= 0) return state;

  let rng = state.rngState;
  const roll = (): number => {
    const r = nextRandom(rng);
    rng = r.state;
    return r.value;
  };

  const elapsedMs = state.elapsedMs + deltaMs;
  const phaseElapsedMs = state.phaseElapsedMs + deltaMs;
  const toTarget = { x: target.x - state.position.x, y: target.y - state.position.y };
  const dist = length(toTarget);

  let phase = state.phase;
  let wanderAngle = state.wanderAngle;
  let hesitateUntilMs = state.hesitateUntilMs;
  let inspectDurationMs = state.inspectDurationMs;
  let nibbleCount = state.nibbleCount;
  let bobberDip = 0;
  let phaseElapsedOut = phaseElapsedMs;

  // Desired velocity for this frame; each phase fills it in.
  let desired: Vec2 = state.velocity;
  let speed = params.roamSpeed;

  const enter = (next: FishBehaviorPhase): void => {
    phase = next;
    phaseElapsedOut = 0;
  };

  // --- Phase transitions & steering -------------------------------------
  if (phase === 'roam') {
    wanderAngle += (roll() - 0.5) * params.wanderJitter * TWO_PI * dt;
    desired = { x: Math.cos(wanderAngle), y: Math.sin(wanderAngle) };
    speed = params.roamSpeed;
    if (target.active && dist < params.perceptionRadius) {
      enter('approach');
    }
  } else if (phase === 'approach') {
    if (!target.active) {
      enter('roam');
    } else if (dist < params.nibbleRadius) {
      enter('inspect');
      inspectDurationMs =
        params.minInspectMs + roll() * (params.maxInspectMs - params.minInspectMs);
      nibbleCount = 0;
    } else {
      // Steer toward the bobber, but wander a little around the straight line
      // and occasionally hesitate so the path is not a laser.
      wanderAngle += (roll() - 0.5) * params.wanderJitter * TWO_PI * dt * 0.6;
      const baseAngle = Math.atan2(toTarget.y, toTarget.x);
      const veer = Math.sin(wanderAngle) * 0.5; // lateral drift, radians
      const aimAngle = baseAngle + veer;
      const hesitating = elapsedMs < hesitateUntilMs;
      if (!hesitating && roll() < params.hesitateChancePerSec * dt) {
        hesitateUntilMs = elapsedMs + params.hesitateMs;
      }
      desired = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
      speed = hesitating ? params.approachSpeed * 0.25 : params.approachSpeed;
    }
  } else if (phase === 'inspect') {
    if (!target.active) {
      enter('flee');
    } else {
      // Orbit the bobber and poke at it; bobberDip pulses drive the tug.
      const orbit = state.heading + Math.PI / 2;
      const inward = dist > params.commitRadius * 1.5 ? 0.6 : -0.25;
      const baseAngle = Math.atan2(toTarget.y, toTarget.x);
      const aimAngle = baseAngle * inward + orbit * (1 - Math.abs(inward));
      desired = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
      speed = params.approachSpeed * 0.7;
      const pulse = 0.5 + 0.5 * Math.sin(phaseElapsedMs / 90);
      bobberDip = pulse * (dist < params.nibbleRadius ? 0.8 : 0.3);
      // Each sine peak (~every 90*PI ms) reads as one nibble/poke at the bobber.
      nibbleCount = Math.floor(phaseElapsedMs / (Math.PI * 90));

      if (phaseElapsedMs >= inspectDurationMs) {
        // Decide: a well-reeled or lucky fish commits; a shy one flees & resets.
        const commitBias = 0.5 + target.reeling * 0.4;
        const shy = roll() < params.shyChance * (1 - target.reeling);
        if (!shy && roll() < commitBias) {
          enter('commit');
        } else {
          enter('flee');
        }
      }
    }
  } else if (phase === 'commit') {
    if (!target.active) {
      enter('flee');
    } else {
      // Hold on the bobber: creep onto it and tug steadily while reeled.
      const baseAngle = Math.atan2(toTarget.y, toTarget.x);
      desired = { x: Math.cos(baseAngle), y: Math.sin(baseAngle) };
      speed = dist > params.commitRadius ? params.approachSpeed : params.approachSpeed * 0.15;
      bobberDip = 0.7 + 0.3 * Math.sin(phaseElapsedMs / 70);
    }
  } else {
    // flee
    const awayAngle = Math.atan2(-toTarget.y, -toTarget.x);
    wanderAngle += (roll() - 0.5) * params.wanderJitter * TWO_PI * dt;
    desired = { x: Math.cos(awayAngle + Math.sin(wanderAngle) * 0.4), y: Math.sin(awayAngle) };
    speed = params.dartSpeed * (phaseElapsedMs < 300 ? 1 : 0.5);
    if (phaseElapsedMs > 700) {
      enter('roam');
    }
  }

  // --- Boundary avoidance: bend the desired heading back inside ----------
  const b = params.bounds;
  const margin = 26;
  let steerX = desired.x;
  let steerY = desired.y;
  if (state.position.x < b.minX + margin) steerX += 1;
  if (state.position.x > b.maxX - margin) steerX -= 1;
  if (state.position.y < b.minY + margin) steerY += 1;
  if (state.position.y > b.maxY - margin) steerY -= 1;
  const steerLen = Math.hypot(steerX, steerY) || 1;
  const targetVx = (steerX / steerLen) * speed;
  const targetVy = (steerY / steerLen) * speed;

  // Ease the actual velocity toward the desired one so turns look like a fish
  // banking rather than snapping.
  const ease = clamp(params.turnRate * dt, 0, 1);
  const vx = state.velocity.x + (targetVx - state.velocity.x) * ease;
  const vy = state.velocity.y + (targetVy - state.velocity.y) * ease;

  let x = state.position.x + vx * dt;
  let y = state.position.y + vy * dt;
  x = clamp(x, b.minX, b.maxX);
  y = clamp(y, b.minY, b.maxY);

  // Velocity is already eased toward the steering target above, so it is the
  // smooth source of truth for the fish's rendered direction. Easing heading a
  // second time made it lag behind tight inspect/orbit turns near the bobber;
  // during that lag the fish could be moving right while still facing left
  // (visibly swimming tail-first).
  let heading = state.heading;
  const movingSpeed = Math.hypot(vx, vy);
  if (movingSpeed > 1) {
    heading = Math.atan2(vy, vx);
  }

  return {
    position: { x, y },
    velocity: { x: vx, y: vy },
    heading,
    phase,
    wanderAngle,
    phaseElapsedMs: phaseElapsedOut,
    hesitateUntilMs,
    inspectDurationMs,
    nibbleCount,
    bobberDip,
    elapsedMs,
    rngState: rng,
  };
}
