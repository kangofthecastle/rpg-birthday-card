import { LOCATIONS } from '../content/locations';

const KEEPSAKE_LOCATION_KINDS: readonly string[] = ['friend', 'home'];

export const FRIEND_KEEPSAKE_IDS: readonly string[] = LOCATIONS.flatMap((location) =>
  location.kind === 'friend' && location.keepsake ? [location.keepsake.id] : [],
);

// The final spot needs every keepsake-bearing location cleared — the two friend
// houses plus ____'s own home (the Golden Hour Photo). Stays data-driven.
export const REQUIRED_FINAL_KEEPSAKE_IDS: readonly string[] = LOCATIONS.flatMap(
  (location) =>
    KEEPSAKE_LOCATION_KINDS.includes(location.kind) && location.keepsake
      ? [location.keepsake.id]
      : [],
);

export interface RunState {
  readonly currentLocationId: string;
  readonly completedLocationIds: readonly string[];
  readonly collectedKeepsakeIds: readonly string[];
  readonly completedActivityIds: readonly string[];
  readonly wonActivityIds: readonly string[];
  readonly seenBeatIds: readonly string[];
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
    seenBeatIds: [],
    endingCompleted: false,
  };
}

/**
 * testMode-only helper: build a run state that already holds the given
 * keepsakes (and marks their owning locations complete). Lets a Playwright
 * smoke land at, say, the lantern clearing with the run in a realistic
 * "all keepsakes collected" state, mirroring the existing testMode jump-ins.
 */
export function createSeededRunState(
  currentLocationId: string,
  keepsakeIds: readonly string[],
): RunState {
  const completedLocationIds = LOCATIONS.flatMap((location) =>
    location.keepsake && keepsakeIds.includes(location.keepsake.id)
      ? [location.id]
      : [],
  );

  return {
    ...createInitialRunState(currentLocationId),
    collectedKeepsakeIds: [...keepsakeIds],
    completedLocationIds,
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

export function hasAllFriendKeepsakes(state: RunState): boolean {
  return FRIEND_KEEPSAKE_IDS.every((keepsakeId) => hasKeepsake(state, keepsakeId));
}

export function hasSeenBeat(state: RunState, beatId: string): boolean {
  return state.seenBeatIds.includes(beatId);
}

export function markBeatSeen(state: RunState, beatId: string): RunState {
  return {
    ...state,
    seenBeatIds: addUnique(state.seenBeatIds, beatId),
  };
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
