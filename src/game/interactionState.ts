import type { LocationEnterBeat } from '../content/types';
import { hasAllFriendKeepsakes, hasSeenBeat, type RunState } from './runState';

/** A friend-keepsake-gated interaction (e.g. ____'s PC) that isn't unlocked yet. */
export function isInteractionLocked(
  interaction: { readonly requiresAllFriendKeepsakes?: boolean },
  state: RunState,
): boolean {
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
