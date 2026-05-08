import { describe, expect, it, vi } from 'vitest';
import { getActivity, listActivities } from '../../src/activities/activityRegistry';
import { LOCATIONS } from '../../src/content/locations';
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
    const mount = document.createElement('div');

    await activity.start({
      state: createInitialRunState('friend-a'),
      mount,
      onComplete,
      onCancel: vi.fn(),
    });

    const button = mount.querySelector<HTMLButtonElement>('[data-activity-complete]');
    expect(button).not.toBeNull();

    button?.click();
    button?.click();

    expect(mount.isConnected).toBe(false);
    expect(onComplete).toHaveBeenCalledWith({
      locationId: 'friend-a',
      keepsakeId: 'pressed-flower',
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('throws for unknown activities', () => {
    expect(() => getActivity('missing')).toThrow('Unknown activity: missing');
  });

  it('registers every location activity', () => {
    const activityIds = LOCATIONS.flatMap((location) =>
      location.activityId ? [location.activityId] : [],
    );

    expect(activityIds).toEqual([
      'friend-a-memory-bloom',
      'friend-b-paper-stars',
      'friend-c-song-line',
      'final-keepsake-reveal',
    ]);
    expect(() => {
      activityIds.forEach((activityId) => getActivity(activityId));
    }).not.toThrow();
  });
});
