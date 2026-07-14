import {
  hasActivityCompleted,
  hasSeenBeat,
  isCardMode,
  isBoatFolded,
  type RunState,
} from './runState';

export const INTRO_COMPLETE_BEAT_ID = 'recipient-intro';
export const FRIEND_ONE_TEXT_READ_BEAT_ID = 'friendone-text-read';
export const FRIEND_ONE_PC_READY_BEAT_ID = 'friendone-pc-ready';
export const VIOLIN_CALLED_BEAT_ID = 'violin-called';
export const FRIEND_TWO_HOUSE_ENTERED_BEAT_ID = 'friendtwo-house-entered';
export const FISHING_ACTIVITY_ID = 'friendone-pc-fishing';
export const RETAKE_ACTIVITY_ID = 'valorant-split';
export const VIOLIN_ACTIVITY_ID = 'recipient-violin-piece';

export type CanonicalStoryMilestone =
  | 'awakening'
  | 'intro-complete'
  | 'friendone-text-read'
  | 'fishing-complete'
  | 'friendtwo-house-entered'
  | 'retake-complete'
  | 'violin-complete'
  | 'boat-folded'
  | 'ending-complete';

export function getCanonicalStoryMilestone(state: RunState): CanonicalStoryMilestone {
  if (state.endingCompleted) return 'ending-complete';
  if (isBoatFolded(state)) return 'boat-folded';
  if (hasActivityCompleted(state, VIOLIN_ACTIVITY_ID)) return 'violin-complete';
  if (hasActivityCompleted(state, RETAKE_ACTIVITY_ID)) return 'retake-complete';
  if (hasSeenBeat(state, FRIEND_TWO_HOUSE_ENTERED_BEAT_ID)) return 'friendtwo-house-entered';
  if (hasActivityCompleted(state, FISHING_ACTIVITY_ID)) return 'fishing-complete';
  if (hasSeenBeat(state, FRIEND_ONE_TEXT_READ_BEAT_ID)) return 'friendone-text-read';
  if (hasSeenBeat(state, INTRO_COMPLETE_BEAT_ID)) return 'intro-complete';
  return 'awakening';
}

export function getStoryTravelBlock(
  destinationLocationId: string,
  state: RunState,
): string | undefined {
  if (state.endingCompleted) {
    return undefined;
  }

  const fishingComplete = hasActivityCompleted(state, FISHING_ACTIVITY_ID);
  if (
    ['main-outside', 'friendone-yard', 'friend-a'].includes(destinationLocationId) &&
    !hasSeenBeat(state, FRIEND_ONE_TEXT_READ_BEAT_ID) &&
    !fishingComplete
  ) {
    return 'Your PC is humming. Best check on it.';
  }

  return undefined;
}

/** The clearing's luminous story state begins when ____ finishes the violin piece. */
export function isClearingAwakened(state: RunState): boolean {
  return isCardMode(state) || hasActivityCompleted(state, VIOLIN_ACTIVITY_ID);
}

export function isFriendOneFollowing(state: RunState): boolean {
  return (
    hasActivityCompleted(state, FISHING_ACTIVITY_ID) &&
    !hasActivityCompleted(state, RETAKE_ACTIVITY_ID)
  );
}

export function shouldShowHomeNpc(
  locationId: string,
  npcId: 'friendone' | 'friendtwo',
  state: RunState,
): boolean {
  if (npcId === 'friendone') {
    return locationId === 'friend-a' && !hasActivityCompleted(state, FISHING_ACTIVITY_ID);
  }
  return locationId === 'friend-b' && state.endingCompleted;
}
