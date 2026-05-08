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
  readonly endingCompleted: boolean;
}

export interface CompletionInput {
  readonly locationId: string;
  readonly keepsakeId: string;
}

export function createInitialRunState(currentLocationId: string): RunState {
  return {
    currentLocationId,
    completedLocationIds: [],
    collectedKeepsakeIds: [],
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
  completion: CompletionInput,
): RunState {
  return {
    ...state,
    completedLocationIds: addUnique(state.completedLocationIds, completion.locationId),
    collectedKeepsakeIds: addUnique(state.collectedKeepsakeIds, completion.keepsakeId),
  };
}

export function hasCompletedLocation(state: RunState, locationId: string): boolean {
  return state.completedLocationIds.includes(locationId);
}

export function hasKeepsake(state: RunState, keepsakeId: string): boolean {
  return state.collectedKeepsakeIds.includes(keepsakeId);
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
