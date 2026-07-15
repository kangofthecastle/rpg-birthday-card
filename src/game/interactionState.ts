import type { LocationEnterBeat } from '../content/types';
import {
  hasAllFriendKeepsakes,
  hasActivityCompleted,
  hasSeenBeat,
  isCardMode,
  isFinalSpotUnlocked,
  type RunState,
} from './runState';

export function isInteractionAvailable(
  interaction: {
    readonly kind?: string;
    readonly requiresBeatId?: string;
    readonly requiresActivityId?: string;
    readonly hiddenAfterActivityId?: string;
    readonly replayAfterEnding?: boolean;
    readonly availableAfterEnding?: boolean;
    readonly hiddenAfterBeatId?: string;
    readonly requiresEndingCompleted?: boolean;
    readonly lockedUntilActivityId?: string;
  },
  state: RunState,
): boolean {
  // Cards mode makes every activity replayable. The epilogue also revives
  // activities and inspect hotspots explicitly authored for post-ending use.
  const replayableActivity =
    interaction.kind === 'activity' &&
    (isCardMode(state) || (state.endingCompleted && interaction.replayAfterEnding));
  const availableAfterEnding =
    state.endingCompleted && interaction.availableAfterEnding;

  if (
    interaction.requiresBeatId &&
    !hasSeenBeat(state, interaction.requiresBeatId) &&
    !replayableActivity &&
    !availableAfterEnding
  ) {
    return false;
  }
  if (
    interaction.requiresActivityId &&
    !hasActivityCompleted(state, interaction.requiresActivityId) &&
    !replayableActivity &&
    !availableAfterEnding
  ) {
    return false;
  }
  if (
    interaction.hiddenAfterActivityId &&
    hasActivityCompleted(state, interaction.hiddenAfterActivityId) &&
    !replayableActivity
  ) {
    return false;
  }
  if (interaction.hiddenAfterBeatId && hasSeenBeat(state, interaction.hiddenAfterBeatId)) {
    return false;
  }
  return !interaction.requiresEndingCompleted || state.endingCompleted;
}

/**
 * An interaction that remains visible while a prerequisite is outstanding.
 * `lockedUntilActivityId` gates story order without hiding the hotspot;
 * `requiresAllKeepsakes` needs every letter (the clearing shore ritual), while
 * `requiresAllFriendKeepsakes` needs only the two friend letters.
 */
export function isInteractionLocked(
  interaction: {
    readonly kind?: string;
    readonly requiresAllFriendKeepsakes?: boolean;
    readonly requiresAllKeepsakes?: boolean;
    readonly lockedUntilActivityId?: string;
    readonly replayAfterEnding?: boolean;
  },
  state: RunState,
): boolean {
  if (
    interaction.kind === 'activity' &&
    (isCardMode(state) || (state.endingCompleted && interaction.replayAfterEnding))
  ) {
    return false;
  }

  if (
    interaction.lockedUntilActivityId &&
    !hasActivityCompleted(state, interaction.lockedUntilActivityId)
  ) {
    return true;
  }
  if (interaction.requiresAllKeepsakes && !isFinalSpotUnlocked(state)) {
    return true;
  }
  return Boolean(interaction.requiresAllFriendKeepsakes) && !hasAllFriendKeepsakes(state);
}

/** Whether a one-time (by default) entry beat should fire on this entry. */
export function shouldPlayEnterBeat(beat: LocationEnterBeat, state: RunState): boolean {
  const once = beat.once !== false;

  if (once && hasSeenBeat(state, beat.id)) {
    return false;
  }

  if (beat.requiresAllFriendKeepsakes && !hasAllFriendKeepsakes(state)) {
    return false;
  }

  if (beat.requiresBeatId && !hasSeenBeat(state, beat.requiresBeatId)) {
    return false;
  }

  if (beat.requiresActivityId && !hasActivityCompleted(state, beat.requiresActivityId)) {
    return false;
  }

  return true;
}
