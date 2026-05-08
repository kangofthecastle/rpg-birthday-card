import { describe, expect, it, vi } from 'vitest';
import { getActivity, listActivities } from '../../src/activities/activityRegistry';
import { createInitialRunState } from '../../src/game/runState';

describe('activityRegistry', () => {
  it('lists all vertical-slice activities', () => {
    const ids = listActivities().map((activity) => activity.id);

    expect(ids).toEqual([
      'friend-a-memory-bloom',
      'friend-b-paper-stars',
      'friend-c-song-line',
      'final-keepsake-reveal',
    ]);
  });

  it('runs an activity lifecycle and calls complete', async () => {
    const activity = getActivity('friend-a-memory-bloom');
    const onComplete = vi.fn();

    await activity.start({
      state: createInitialRunState('friend-a'),
      mount: document.createElement('div'),
      onComplete,
      onCancel: vi.fn(),
    });

    const button = document.querySelector<HTMLButtonElement>('[data-activity-complete]');
    button?.click();

    expect(onComplete).toHaveBeenCalledWith({
      locationId: 'friend-a',
      keepsakeId: 'pressed-flower',
    });
  });

  it('throws for unknown activities', () => {
    expect(() => getActivity('missing')).toThrow('Unknown activity: missing');
  });
});
