import { describe, expect, it } from 'vitest';
import {
  FISHING_ACTIVITY_ID,
  FRIEND_ONE_TEXT_READ_BEAT_ID,
  RETAKE_ACTIVITY_ID,
  VIOLIN_CALLED_BEAT_ID,
  getCanonicalStoryMilestone,
  getStoryTravelBlock,
  isFriendOneFollowing,
  shouldShowHomeNpc,
} from '../../src/game/storyProgression';
import {
  applyActivityCompletion,
  createInitialRunState,
  markBeatSeen,
  markEndingCompleted,
  createSeededRunState,
  completeLocation,
  REQUIRED_FINAL_KEEPSAKE_IDS,
  type RunState,
} from '../../src/game/runState';

function complete(state: RunState, activityId: string, locationId: string): RunState {
  return applyActivityCompletion(state, { locationId, activityId });
}

describe('canonical story progression', () => {
  it('advances through text, fishing, ____ entry, and retake in order', () => {
    let state = createInitialRunState('recipient-house');
    expect(getCanonicalStoryMilestone(state)).toBe('awakening');

    state = markBeatSeen(state, 'recipient-intro');
    expect(getCanonicalStoryMilestone(state)).toBe('intro-complete');

    state = markBeatSeen(state, FRIEND_ONE_TEXT_READ_BEAT_ID);
    expect(getCanonicalStoryMilestone(state)).toBe('friendone-text-read');

    state = complete(state, FISHING_ACTIVITY_ID, 'friend-a');
    expect(getCanonicalStoryMilestone(state)).toBe('fishing-complete');

    state = markBeatSeen(state, 'friendtwo-house-entered');
    expect(getCanonicalStoryMilestone(state)).toBe('friendtwo-house-entered');

    state = complete(state, RETAKE_ACTIVITY_ID, 'friend-b');
    expect(getCanonicalStoryMilestone(state)).toBe('retake-complete');
  });

  it('gates destinations on their canonical prerequisites', () => {
    let state = createInitialRunState('recipient-house');
    expect(getStoryTravelBlock('main-outside', state)).toContain('PC');

    state = markBeatSeen(state, FRIEND_ONE_TEXT_READ_BEAT_ID);
    expect(getStoryTravelBlock('main-outside', state)).toBeUndefined();
    expect(getStoryTravelBlock('friendtwo-yard', state)).toBeUndefined();
    expect(getStoryTravelBlock('friend-b', state)).toBeUndefined();

    state = complete(state, FISHING_ACTIVITY_ID, 'friend-a');
    expect(getStoryTravelBlock('friendtwo-yard', state)).toBeUndefined();
    expect(getStoryTravelBlock('clearing', state)).toContain('papers');
  });

  it('exports the one-shot autonomous violin acknowledgement beat', () => {
    expect(VIOLIN_CALLED_BEAT_ID).toBe('violin-called');
  });

  it('unlocks clearing from all three papers even without a violin activity flag', () => {
    let state = createInitialRunState('main-outside');
    for (const keepsakeId of REQUIRED_FINAL_KEEPSAKE_IDS) {
      state = completeLocation(state, { locationId: `seed-${keepsakeId}`, keepsakeId });
    }

    expect(state.completedActivityIds).toEqual([]);
    expect(getStoryTravelBlock('clearing', state)).toBeUndefined();

    const missingOne = createInitialRunState('main-outside');
    expect(getStoryTravelBlock('clearing', missingOne)).toContain('papers');
  });

  it('treats seeded later milestones as satisfying their earlier route prerequisites', () => {
    const seeded = createSeededRunState('recipient-house', [
      'glowing-koi-scale',
      'defused-spike-charm',
    ]);

    expect(getStoryTravelBlock('main-outside', seeded)).toBeUndefined();
    expect(getStoryTravelBlock('friendtwo-yard', seeded)).toBeUndefined();
    expect(getStoryTravelBlock('main-outside', markEndingCompleted(createInitialRunState('recipient-house')))).toBeUndefined();
  });

  it('derives ____ following and both residents from run state', () => {
    let state = createInitialRunState('friend-a');
    expect(shouldShowHomeNpc('friend-a', 'friendone', state)).toBe(true);
    expect(shouldShowHomeNpc('friend-b', 'friendtwo', state)).toBe(false);
    expect(isFriendOneFollowing(state)).toBe(false);

    state = complete(state, FISHING_ACTIVITY_ID, 'friend-a');
    expect(shouldShowHomeNpc('friend-a', 'friendone', state)).toBe(false);
    expect(isFriendOneFollowing(state)).toBe(true);

    state = complete(state, RETAKE_ACTIVITY_ID, 'friend-b');
    expect(isFriendOneFollowing(state)).toBe(false);
    expect(shouldShowHomeNpc('friend-b', 'friendtwo', markEndingCompleted(state))).toBe(true);
  });
});
