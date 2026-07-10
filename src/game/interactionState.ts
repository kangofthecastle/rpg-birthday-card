import type { LocationEnterBeat } from '../content/types';
import {
  hasAllFriendKeepsakes,
  hasSeenBeat,
  isFinalSpotUnlocked,
  type RunState,
} from './runState';

/**
 * A keepsake-gated interaction that isn't unlocked yet. `requiresAllKeepsakes`
 * needs every letter (the clearing shore ritual); `requiresAllFriendKeepsakes`
 * needs only the two friend letters (e.g. ____'s PC / violin).
 */
export function isInteractionLocked(
  interaction: {
    readonly requiresAllFriendKeepsakes?: boolean;
    readonly requiresAllKeepsakes?: boolean;
  },
  state: RunState,
): boolean {
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

  return true;
}
