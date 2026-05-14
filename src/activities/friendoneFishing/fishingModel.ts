export const FISHING_METER_HEIGHT = 360;
export const CATCH_BAR_HEIGHT = 92;
export const FISH_TARGET_HEIGHT = 28;

const CATCH_BAR_RISE_PER_SECOND = 320;
const CATCH_BAR_FALL_PER_SECOND = 260;

export interface FishConfig {
  readonly id: string;
  readonly label: string;
  readonly isSpecial: boolean;
  readonly speedPerSecond: number;
  readonly directionChangeMs: number;
  readonly burstEveryMs: number;
  readonly burstDurationMs: number;
  readonly burstSpeedMultiplier: number;
  readonly catchRatePerSecond: number;
  readonly drainRatePerSecond: number;
}

export interface FishingInputState {
  readonly holdActive: boolean;
}

export interface FishingRoundState {
  readonly fishY: number;
  readonly fishDirection: 1 | -1;
  readonly catchBarY: number;
  readonly progress: number;
  readonly elapsedMs: number;
  readonly nextDirectionChangeAtMs: number;
  readonly nextBurstAtMs: number;
  readonly burstUntilMs: number;
}

export interface FishingRoundSeed {
  readonly fishY?: number;
  readonly catchBarY?: number;
  readonly progress?: number;
  readonly fishDirection?: 1 | -1;
  readonly elapsedMs?: number;
}

export const FRIEND_ONE_FISH_SEQUENCE: readonly FishConfig[] = [
  {
    id: 'pond-drifter',
    label: 'Pond Drifter',
    isSpecial: false,
    speedPerSecond: 54,
    directionChangeMs: 1600,
    burstEveryMs: 0,
    burstDurationMs: 0,
    burstSpeedMultiplier: 1,
    catchRatePerSecond: 0.44,
    drainRatePerSecond: 0.12,
  },
  {
    id: 'reed-darter',
    label: 'Reed Darter',
    isSpecial: false,
    speedPerSecond: 82,
    directionChangeMs: 1050,
    burstEveryMs: 0,
    burstDurationMs: 0,
    burstSpeedMultiplier: 1,
    catchRatePerSecond: 0.38,
    drainRatePerSecond: 0.16,
  },
  {
    id: 'glowing-koi',
    label: 'Glowing Koi',
    isSpecial: true,
    speedPerSecond: 105,
    directionChangeMs: 780,
    burstEveryMs: 1800,
    burstDurationMs: 360,
    burstSpeedMultiplier: 1.65,
    catchRatePerSecond: 0.32,
    drainRatePerSecond: 0.2,
  },
] as const;

export function createFishingRound(
  fish: FishConfig,
  seed: FishingRoundSeed = {},
): FishingRoundState {
  return {
    fishY: clamp(seed.fishY ?? FISHING_METER_HEIGHT / 2, 0, FISHING_METER_HEIGHT - FISH_TARGET_HEIGHT),
    fishDirection: seed.fishDirection ?? 1,
    catchBarY: clamp(
      seed.catchBarY ?? (FISHING_METER_HEIGHT - CATCH_BAR_HEIGHT) / 2,
      0,
      FISHING_METER_HEIGHT - CATCH_BAR_HEIGHT,
    ),
    progress: clamp(seed.progress ?? 0, 0, 1),
    elapsedMs: seed.elapsedMs ?? 0,
    nextDirectionChangeAtMs: fish.directionChangeMs,
    nextBurstAtMs: fish.burstEveryMs > 0 ? fish.burstEveryMs : Number.POSITIVE_INFINITY,
    burstUntilMs: 0,
  };
}

export function updateFishingRound(
  state: FishingRoundState,
  fish: FishConfig,
  input: FishingInputState,
  deltaMs: number,
): FishingRoundState {
  const deltaSeconds = deltaMs / 1000;
  const elapsedMs = state.elapsedMs + deltaMs;
  const fishWasInCatchBar = isFishInCatchBar(state, fish);
  const afterDirection = updateDirection(state, fish, elapsedMs);
  const afterBurst = updateBurst(afterDirection, fish, elapsedMs);
  const burstActive = elapsedMs < afterBurst.burstUntilMs;
  const fishSpeed =
    fish.speedPerSecond * (burstActive ? fish.burstSpeedMultiplier : 1);
  const fishY = clamp(
    afterBurst.fishY + afterBurst.fishDirection * fishSpeed * deltaSeconds,
    0,
    FISHING_METER_HEIGHT - FISH_TARGET_HEIGHT,
  );
  const bouncedDirection =
    fishY === 0
      ? 1
      : fishY === FISHING_METER_HEIGHT - FISH_TARGET_HEIGHT
        ? -1
        : afterBurst.fishDirection;
  const catchBarVelocity = input.holdActive
    ? -CATCH_BAR_RISE_PER_SECOND
    : CATCH_BAR_FALL_PER_SECOND;
  const catchBarY = clamp(
    state.catchBarY + catchBarVelocity * deltaSeconds,
    0,
    FISHING_METER_HEIGHT - CATCH_BAR_HEIGHT,
  );
  const overlapState: FishingRoundState = {
    ...afterBurst,
    fishY,
    fishDirection: bouncedDirection,
    catchBarY,
    elapsedMs,
  };
  const progressDelta = fishWasInCatchBar
    ? fish.catchRatePerSecond * deltaSeconds
    : -fish.drainRatePerSecond * deltaSeconds;

  return {
    ...overlapState,
    progress: clamp(state.progress + progressDelta, 0, 1),
  };
}

export function isFishInCatchBar(
  state: Pick<FishingRoundState, 'fishY' | 'catchBarY'>,
  _fish: FishConfig,
): boolean {
  const fishTop = state.fishY;
  const fishBottom = state.fishY + FISH_TARGET_HEIGHT;
  const barTop = state.catchBarY;
  const barBottom = state.catchBarY + CATCH_BAR_HEIGHT;

  return fishBottom >= barTop && fishTop <= barBottom;
}

export function getFishingCompletion(state: FishingRoundState): boolean {
  return state.progress >= 1;
}

function updateDirection(
  state: FishingRoundState,
  fish: FishConfig,
  elapsedMs: number,
): FishingRoundState {
  if (elapsedMs < state.nextDirectionChangeAtMs) {
    return state;
  }

  return {
    ...state,
    fishDirection: state.fishDirection === 1 ? -1 : 1,
    nextDirectionChangeAtMs: elapsedMs + fish.directionChangeMs,
  };
}

function updateBurst(
  state: FishingRoundState,
  fish: FishConfig,
  elapsedMs: number,
): FishingRoundState {
  if (fish.burstEveryMs <= 0 || elapsedMs < state.nextBurstAtMs) {
    return state;
  }

  return {
    ...state,
    burstUntilMs: elapsedMs + fish.burstDurationMs,
    nextBurstAtMs: elapsedMs + fish.burstEveryMs,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
