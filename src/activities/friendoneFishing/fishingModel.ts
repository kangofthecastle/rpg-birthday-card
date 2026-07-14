export const FISHING_METER_HEIGHT = 360;
export const CATCH_BAR_HEIGHT = 80;
export const FISH_TARGET_HEIGHT = 28;

const CATCH_BAR_RISE_PER_SECOND = 320;
const CATCH_BAR_FALL_PER_SECOND = 260;
const MAX_UPDATE_STEP_MS = 50;
const STEP_EPSILON_MS = 0.000001;

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
    speedPerSecond: 66,
    directionChangeMs: 1350,
    burstEveryMs: 0,
    burstDurationMs: 0,
    burstSpeedMultiplier: 1,
    catchRatePerSecond: 0.38,
    drainRatePerSecond: 0.17,
  },
  {
    id: 'reed-darter',
    label: 'Reed Darter',
    isSpecial: false,
    speedPerSecond: 94,
    directionChangeMs: 900,
    burstEveryMs: 2600,
    burstDurationMs: 260,
    burstSpeedMultiplier: 1.35,
    catchRatePerSecond: 0.34,
    drainRatePerSecond: 0.22,
  },
  {
    id: 'glowing-koi',
    label: 'Glowing Koi',
    isSpecial: true,
    speedPerSecond: 120,
    directionChangeMs: 650,
    burstEveryMs: 1500,
    burstDurationMs: 420,
    burstSpeedMultiplier: 1.75,
    catchRatePerSecond: 0.28,
    drainRatePerSecond: 0.3,
  },
] as const;

export function createFishingRound(
  fish: FishConfig,
  seed: FishingRoundSeed = {},
): FishingRoundState {
  return {
    fishY: clamp(
      seed.fishY ?? FISHING_METER_HEIGHT / 2,
      0,
      getMaxFishY(),
    ),
    fishDirection: seed.fishDirection ?? 1,
    catchBarY: clamp(
      seed.catchBarY ?? (FISHING_METER_HEIGHT - CATCH_BAR_HEIGHT) / 2,
      0,
      getMaxCatchBarY(),
    ),
    progress: clamp(seed.progress ?? 0, 0, 1),
    elapsedMs: seed.elapsedMs ?? 0,
    nextDirectionChangeAtMs: fish.directionChangeMs,
    nextBurstAtMs:
      fish.burstEveryMs > 0 ? fish.burstEveryMs : Number.POSITIVE_INFINITY,
    burstUntilMs: 0,
  };
}

export function updateFishingRound(
  state: FishingRoundState,
  fish: FishConfig,
  input: FishingInputState,
  deltaMs: number,
): FishingRoundState {
  let nextState = state;
  let remainingMs = Math.max(0, deltaMs);

  while (remainingMs > STEP_EPSILON_MS) {
    const preparedState = applyInstantEvents(nextState, fish);
    const stepMs = getNextStepMs(preparedState, fish, remainingMs);

    nextState = updateFishingSubstep(preparedState, fish, input, stepMs);
    remainingMs -= stepMs;
  }

  return deltaMs > 0 ? applyInstantEvents(nextState, fish) : nextState;
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

function updateFishingSubstep(
  state: FishingRoundState,
  fish: FishConfig,
  input: FishingInputState,
  deltaMs: number,
): FishingRoundState {
  const deltaSeconds = deltaMs / 1000;
  const fishSpeed = getFishSpeedPerSecond(state, fish);
  const fishY = clamp(
    state.fishY + state.fishDirection * fishSpeed * deltaSeconds,
    0,
    getMaxFishY(),
  );
  const bouncedDirection =
    fishY === 0
      ? 1
      : fishY === getMaxFishY()
        ? -1
        : state.fishDirection;
  const catchBarVelocity = input.holdActive
    ? -CATCH_BAR_RISE_PER_SECOND
    : CATCH_BAR_FALL_PER_SECOND;
  const catchBarY = clamp(
    state.catchBarY + catchBarVelocity * deltaSeconds,
    0,
    getMaxCatchBarY(),
  );
  const overlapState: FishingRoundState = {
    ...state,
    fishY,
    fishDirection: bouncedDirection,
    catchBarY,
    elapsedMs: state.elapsedMs + deltaMs,
  };
  const progressDelta = isFishInCatchBar(overlapState, fish)
    ? fish.catchRatePerSecond * deltaSeconds
    : -fish.drainRatePerSecond * deltaSeconds;

  return {
    ...overlapState,
    progress: clamp(state.progress + progressDelta, 0, 1),
  };
}

function applyInstantEvents(
  state: FishingRoundState,
  fish: FishConfig,
): FishingRoundState {
  let nextState = state;

  while (
    fish.directionChangeMs > 0 &&
    nextState.elapsedMs >= nextState.nextDirectionChangeAtMs
  ) {
    nextState = {
      ...nextState,
      fishDirection: nextState.fishDirection === 1 ? -1 : 1,
      nextDirectionChangeAtMs:
        nextState.nextDirectionChangeAtMs + fish.directionChangeMs,
    };
  }

  while (
    fish.burstEveryMs > 0 &&
    nextState.elapsedMs >= nextState.nextBurstAtMs
  ) {
    nextState = {
      ...nextState,
      burstUntilMs: nextState.nextBurstAtMs + fish.burstDurationMs,
      nextBurstAtMs: nextState.nextBurstAtMs + fish.burstEveryMs,
    };
  }

  return applyBoundaryBounce(nextState);
}

function applyBoundaryBounce(state: FishingRoundState): FishingRoundState {
  if (state.fishY <= 0 && state.fishDirection === -1) {
    return {
      ...state,
      fishY: 0,
      fishDirection: 1,
    };
  }

  if (state.fishY >= getMaxFishY() && state.fishDirection === 1) {
    return {
      ...state,
      fishY: getMaxFishY(),
      fishDirection: -1,
    };
  }

  return state;
}

function getNextStepMs(
  state: FishingRoundState,
  fish: FishConfig,
  remainingMs: number,
): number {
  let stepMs = Math.min(MAX_UPDATE_STEP_MS, remainingMs);

  stepMs = Math.min(stepMs, getTimeUntilMs(state, state.nextDirectionChangeAtMs));

  if (fish.burstEveryMs > 0) {
    stepMs = Math.min(stepMs, getTimeUntilMs(state, state.nextBurstAtMs));
  }

  if (state.burstUntilMs > state.elapsedMs) {
    stepMs = Math.min(stepMs, getTimeUntilMs(state, state.burstUntilMs));
  }

  stepMs = Math.min(stepMs, getTimeUntilFishBoundaryMs(state, fish));

  return Math.max(STEP_EPSILON_MS, stepMs);
}

function getTimeUntilMs(
  state: Pick<FishingRoundState, 'elapsedMs'>,
  targetElapsedMs: number,
): number {
  const timeUntilMs = targetElapsedMs - state.elapsedMs;

  return timeUntilMs > STEP_EPSILON_MS ? timeUntilMs : Number.POSITIVE_INFINITY;
}

function getTimeUntilFishBoundaryMs(
  state: FishingRoundState,
  fish: FishConfig,
): number {
  const fishSpeed = getFishSpeedPerSecond(state, fish);

  if (fishSpeed <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const distanceToBoundary =
    state.fishDirection === 1 ? getMaxFishY() - state.fishY : state.fishY;

  if (distanceToBoundary <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return (distanceToBoundary / fishSpeed) * 1000;
}

function getFishSpeedPerSecond(
  state: Pick<FishingRoundState, 'elapsedMs' | 'burstUntilMs'>,
  fish: FishConfig,
): number {
  const burstMultiplier =
    state.elapsedMs < state.burstUntilMs ? fish.burstSpeedMultiplier : 1;

  return fish.speedPerSecond * burstMultiplier;
}

function getMaxFishY(): number {
  return FISHING_METER_HEIGHT - FISH_TARGET_HEIGHT;
}

function getMaxCatchBarY(): number {
  return FISHING_METER_HEIGHT - CATCH_BAR_HEIGHT;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
