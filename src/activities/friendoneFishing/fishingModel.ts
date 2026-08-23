export const FISHING_METER_HEIGHT = 360;
export const TIMING_MARKER_HEIGHT = 12;
export const TIMING_TARGET_COUNT = 3;
export const LINE_BREAK_MISSES = 4;

const TIMING_TARGET_CENTERS = [292, 180, 68] as const;
const TARGET_SPEED_MULTIPLIERS = [1, 1.18, 1.38] as const;
const MAX_UPDATE_STEP_MS = 20;
const STEP_EPSILON_MS = 0.000001;

const HIT_LOCK_MS = 280;
const MISS_LOCK_MS = 150;
const LINE_BREAK_LOCK_MS = 850;

export type FishingFeedbackKind = 'none' | 'hit' | 'miss' | 'line-break';
export type FishingAttemptOutcome = 'ignored' | 'hit' | 'miss' | 'line-break';

export interface FishConfig {
  readonly id: string;
  readonly label: string;
  readonly isSpecial: boolean;
  /** Pond-swimming speed; the timing marker has separate tuning below. */
  readonly speedPerSecond: number;
  readonly timingSpeedPerSecond: number;
  readonly timingVariability: number;
  readonly targetWindowHeights: readonly [number, number, number];
}

export interface FishingRoundState {
  /** Center Y of the moving timing marker, in 0..FISHING_METER_HEIGHT space. */
  readonly markerY: number;
  readonly markerDirection: 1 | -1;
  readonly targetIndex: number;
  readonly misses: number;
  readonly progress: number;
  readonly elapsedMs: number;
  /** Accumulated rotation shared by the simple 2D reel graphic. */
  readonly reelAngle: number;
  readonly feedbackKind: FishingFeedbackKind;
  readonly feedbackRemainingMs: number;
}

export interface FishingRoundSeed {
  readonly markerY?: number;
  readonly markerDirection?: 1 | -1;
  readonly targetIndex?: number;
  readonly misses?: number;
  readonly elapsedMs?: number;
  readonly reelAngle?: number;
}

export interface TimingTarget {
  readonly centerY: number;
  readonly height: number;
}

export interface FishingAttemptResult {
  readonly state: FishingRoundState;
  readonly outcome: FishingAttemptOutcome;
}

export const FRIEND_ONE_FISH_SEQUENCE: readonly FishConfig[] = [
  {
    id: 'pond-drifter',
    label: 'Pond Drifter',
    isSpecial: false,
    speedPerSecond: 66,
    timingSpeedPerSecond: 215,
    timingVariability: 0.45,
    targetWindowHeights: [38, 28, 20],
  },
  {
    id: 'reed-darter',
    label: 'Reed Darter',
    isSpecial: false,
    speedPerSecond: 94,
    timingSpeedPerSecond: 275,
    timingVariability: 0.62,
    targetWindowHeights: [30, 21, 14],
  },
  {
    id: 'glowing-koi',
    label: 'Glowing Koi',
    isSpecial: true,
    speedPerSecond: 120,
    timingSpeedPerSecond: 350,
    timingVariability: 0.82,
    targetWindowHeights: [24, 16, 9],
  },
] as const;

export function createFishingRound(
  _fish: FishConfig,
  seed: FishingRoundSeed = {},
): FishingRoundState {
  const targetIndex = clampInteger(seed.targetIndex ?? 0, 0, TIMING_TARGET_COUNT);

  return {
    markerY: clamp(
      seed.markerY ?? FISHING_METER_HEIGHT / 2,
      getMinMarkerY(),
      getMaxMarkerY(),
    ),
    markerDirection: seed.markerDirection ?? 1,
    targetIndex,
    misses: clampInteger(seed.misses ?? 0, 0, LINE_BREAK_MISSES - 1),
    progress: targetIndex / TIMING_TARGET_COUNT,
    elapsedMs: Math.max(0, seed.elapsedMs ?? 0),
    reelAngle: seed.reelAngle ?? 0,
    feedbackKind: 'none',
    feedbackRemainingMs: 0,
  };
}

export function updateFishingRound(
  state: FishingRoundState,
  fish: FishConfig,
  deltaMs: number,
): FishingRoundState {
  let nextState = state;
  let remainingMs = Math.max(0, deltaMs);

  if (getFishingCompletion(state)) {
    return advanceFeedback(state, remainingMs);
  }

  if (nextState.feedbackRemainingMs > 0) {
    const feedbackStep = Math.min(remainingMs, nextState.feedbackRemainingMs);
    nextState = advanceFeedback(nextState, feedbackStep);
    remainingMs -= feedbackStep;
  }

  while (remainingMs > STEP_EPSILON_MS) {
    const stepMs = Math.min(MAX_UPDATE_STEP_MS, remainingMs);
    nextState = updateFishingSubstep(nextState, fish, stepMs);
    remainingMs -= stepMs;
  }

  return nextState;
}

export function attemptFishingTarget(
  state: FishingRoundState,
  fish: FishConfig,
): FishingAttemptResult {
  if (state.feedbackRemainingMs > 0 || getFishingCompletion(state)) {
    return { state, outcome: 'ignored' };
  }

  if (isMarkerInTarget(state, fish)) {
    const targetIndex = Math.min(TIMING_TARGET_COUNT, state.targetIndex + 1);
    return {
      outcome: 'hit',
      state: {
        ...state,
        targetIndex,
        progress: targetIndex / TIMING_TARGET_COUNT,
        feedbackKind: 'hit',
        feedbackRemainingMs: HIT_LOCK_MS,
      },
    };
  }

  const misses = state.misses + 1;
  if (misses >= LINE_BREAK_MISSES) {
    return {
      outcome: 'line-break',
      state: {
        ...state,
        markerY: FISHING_METER_HEIGHT / 2,
        markerDirection: 1,
        targetIndex: 0,
        misses: 0,
        progress: 0,
        feedbackKind: 'line-break',
        feedbackRemainingMs: LINE_BREAK_LOCK_MS,
      },
    };
  }

  return {
    outcome: 'miss',
    state: {
      ...state,
      misses,
      feedbackKind: 'miss',
      feedbackRemainingMs: MISS_LOCK_MS,
    },
  };
}

export function getTimingTarget(
  state: Pick<FishingRoundState, 'targetIndex'>,
  fish: FishConfig,
): TimingTarget {
  const index = clampInteger(state.targetIndex, 0, TIMING_TARGET_COUNT - 1);
  return {
    centerY: TIMING_TARGET_CENTERS[index],
    height: fish.targetWindowHeights[index],
  };
}

export function isMarkerInTarget(
  state: Pick<FishingRoundState, 'markerY' | 'targetIndex'>,
  fish: FishConfig,
): boolean {
  if (state.targetIndex >= TIMING_TARGET_COUNT) {
    return false;
  }

  const target = getTimingTarget(state, fish);
  const markerTop = state.markerY - TIMING_MARKER_HEIGHT / 2;
  const markerBottom = state.markerY + TIMING_MARKER_HEIGHT / 2;
  const targetTop = target.centerY - target.height / 2;
  const targetBottom = target.centerY + target.height / 2;

  return markerBottom >= targetTop && markerTop <= targetBottom;
}

export function getFishingCompletion(state: FishingRoundState): boolean {
  return state.targetIndex >= TIMING_TARGET_COUNT;
}

export function getMarkerSpeedPerSecond(
  state: Pick<FishingRoundState, 'elapsedMs' | 'targetIndex'>,
  fish: FishConfig,
): number {
  const targetIndex = clampInteger(state.targetIndex, 0, TIMING_TARGET_COUNT - 1);
  const stageVariability =
    targetIndex === 0
      ? 0
      : fish.timingVariability * (targetIndex === 1 ? 0.62 : 1);
  const phase = state.elapsedMs / 1000;
  const modulation =
    Math.sin(phase * 2.15 + targetIndex * 0.9) * 0.68 +
    Math.sin(phase * 5.3 + targetIndex * 1.7) * 0.32;
  const speedFactor = clamp(1 + modulation * stageVariability, 0.42, 1.9);

  return (
    fish.timingSpeedPerSecond *
    TARGET_SPEED_MULTIPLIERS[targetIndex] *
    speedFactor
  );
}

function updateFishingSubstep(
  state: FishingRoundState,
  fish: FishConfig,
  deltaMs: number,
): FishingRoundState {
  const deltaSeconds = deltaMs / 1000;
  const speed = getMarkerSpeedPerSecond(state, fish);
  let markerY = state.markerY + state.markerDirection * speed * deltaSeconds;
  let markerDirection = state.markerDirection;

  while (markerY < getMinMarkerY() || markerY > getMaxMarkerY()) {
    if (markerY > getMaxMarkerY()) {
      markerY = getMaxMarkerY() - (markerY - getMaxMarkerY());
      markerDirection = -1;
    } else if (markerY < getMinMarkerY()) {
      markerY = getMinMarkerY() + (getMinMarkerY() - markerY);
      markerDirection = 1;
    }
  }

  return {
    ...state,
    markerY,
    markerDirection,
    elapsedMs: state.elapsedMs + deltaMs,
    // One full reel turn corresponds to roughly 86 meter-space pixels. Using
    // the marker's actual displacement keeps rotation exact through bounces.
    reelAngle: state.reelAngle + (markerY - state.markerY) / 13.7,
    feedbackKind: 'none',
    feedbackRemainingMs: 0,
  };
}

function advanceFeedback(state: FishingRoundState, deltaMs: number): FishingRoundState {
  if (state.feedbackRemainingMs <= 0 || deltaMs <= 0) {
    return state;
  }

  const feedbackRemainingMs = Math.max(0, state.feedbackRemainingMs - deltaMs);
  return {
    ...state,
    elapsedMs: state.elapsedMs + deltaMs,
    feedbackRemainingMs,
    feedbackKind: feedbackRemainingMs > 0 ? state.feedbackKind : 'none',
  };
}

function getMinMarkerY(): number {
  return TIMING_MARKER_HEIGHT / 2;
}

function getMaxMarkerY(): number {
  return FISHING_METER_HEIGHT - TIMING_MARKER_HEIGHT / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
