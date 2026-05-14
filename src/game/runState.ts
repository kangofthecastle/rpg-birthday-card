export const REQUIRED_FINAL_KEEPSAKE_IDS = [
  'pressed-flower',
  'paper-star',
  'tiny-key',
] as const;

export type RequiredKeepsakeId = (typeof REQUIRED_FINAL_KEEPSAKE_IDS)[number];

export interface RunState {
  readonly currentLocationId: string;
  readonly completedLocationIds: readonly string[];
  readonly collectedKeepsakeIds: readonly string[];
  readonly completedActivityIds: readonly string[];
  readonly wonActivityIds: readonly string[];
  readonly endingCompleted: boolean;
}

export type ActivityCompletionInput =
  | LocationKeepsakeCompletionInput
  | OptionalActivityCompletionInput;

export interface LocationKeepsakeCompletionInput {
  readonly locationId: string;
  readonly activityId?: string;
  readonly keepsakeId: string;
  readonly won?: boolean;
}

export interface OptionalActivityCompletionInput {
  readonly locationId: string;
  readonly activityId: string;
  readonly keepsakeId?: never;
  readonly won?: boolean;
}

export type CompletionInput = LocationKeepsakeCompletionInput;

export function createInitialRunState(currentLocationId: string): RunState {
  return {
    currentLocationId,
    completedLocationIds: [],
    collectedKeepsakeIds: [],
    completedActivityIds: [],
    wonActivityIds: [],
    endingCompleted: false,
  };
}

export function setCurrentLocation(
  state: RunState,
  currentLocationId: string,
): RunState {
  return {
    ...state,
    currentLocationId,
  };
}

export function completeLocation(
  state: RunState,
  completion: ActivityCompletionInput,
): RunState {
  return applyActivityCompletion(state, completion);
}

export function applyActivityCompletion(
  state: RunState,
  completion: ActivityCompletionInput,
): RunState {
  const shouldCompleteLocation =
    Boolean(completion.keepsakeId) && !hasCompletedLocation(state, completion.locationId);

  return {
    ...state,
    completedLocationIds: shouldCompleteLocation
      ? addUnique(state.completedLocationIds, completion.locationId)
      : state.completedLocationIds,
    collectedKeepsakeIds:
      shouldCompleteLocation && completion.keepsakeId
        ? addUnique(state.collectedKeepsakeIds, completion.keepsakeId)
        : state.collectedKeepsakeIds,
    completedActivityIds: completion.activityId
      ? addUnique(state.completedActivityIds, completion.activityId)
      : state.completedActivityIds,
    wonActivityIds:
      completion.activityId && completion.won
        ? addUnique(state.wonActivityIds, completion.activityId)
        : state.wonActivityIds,
  };
}

export function hasCompletedLocation(state: RunState, locationId: string): boolean {
  return state.completedLocationIds.includes(locationId);
}

export function hasKeepsake(state: RunState, keepsakeId: string): boolean {
  return state.collectedKeepsakeIds.includes(keepsakeId);
}

export function hasActivityCompleted(state: RunState, activityId: string): boolean {
  return state.completedActivityIds.includes(activityId);
}

export function hasActivityWon(state: RunState, activityId: string): boolean {
  return state.wonActivityIds.includes(activityId);
}

export function isFinalSpotUnlocked(state: RunState): boolean {
  return REQUIRED_FINAL_KEEPSAKE_IDS.every((keepsakeId) =>
    hasKeepsake(state, keepsakeId),
  );
}

export function markEndingCompleted(state: RunState): RunState {
  return {
    ...state,
    endingCompleted: true,
  };
}

function addUnique(values: readonly string[], value: string): readonly string[] {
  if (values.includes(value)) {
    return values;
  }

  return [...values, value];
}
