import { describe, expect, it, vi } from 'vitest';
import { getActivity, listActivities } from '../../src/activities/activityRegistry';
import { createFriendOneFishingActivity } from '../../src/activities/friendoneFishing/friendoneFishingActivity';
import { LOCATIONS } from '../../src/content/locations';
import { createInitialRunState } from '../../src/game/runState';

describe('activityRegistry', () => {
  it('lists all vertical-slice activities', () => {
    const ids = listActivities().map((activity) => activity.id);

    expect(ids).toEqual([
      'friend-a-memory-bloom',
      'friendone-pc-fishing',
      'friend-b-paper-stars',
      'friend-c-song-line',
      'final-keepsake-reveal',
    ]);
  });

  it('runs an activity lifecycle and calls complete', async () => {
    const activity = getActivity('friend-a-memory-bloom');
    const onComplete = vi.fn();
    const fixture = document.createElement('div');
    const mount = document.createElement('div');

    document.body.appendChild(fixture);
    fixture.appendChild(mount);

    try {
      await activity.start({
        state: createInitialRunState('friend-a'),
        mount,
        onComplete: (completion) => {
          onComplete(completion);
          mount.remove();
        },
        onCancel: vi.fn(),
      });

      const button = mount.querySelector<HTMLButtonElement>('[data-activity-complete]');
      expect(button).not.toBeNull();
      expect(mount.isConnected).toBe(true);

      button?.click();
      button?.click();

      expect(mount.isConnected).toBe(false);
      expect(onComplete).toHaveBeenCalledWith({
        locationId: 'friend-a',
        keepsakeId: 'pressed-flower',
      });
      expect(onComplete).toHaveBeenCalledTimes(1);
    } finally {
      fixture.remove();
    }
  });

  it('runs the ____ fishing activity lifecycle and calls complete once', async () => {
    const destroy = vi.fn();
    const activity = createFriendOneFishingActivity((parent) => {
      parent.dataset.fakeFishingGame = 'mounted';

      return {
        destroy,
      };
    });
    const onComplete = vi.fn();
    const fixture = document.createElement('div');
    const mount = document.createElement('div');

    document.body.appendChild(fixture);
    fixture.appendChild(mount);

    try {
      await activity.start({
        state: createInitialRunState('friend-a'),
        mount,
        onComplete: (completion) => {
          onComplete(completion);
          mount.remove();
        },
        onCancel: vi.fn(),
      });

      const button = mount.querySelector<HTMLButtonElement>(
        '[data-friendone-fishing-test-complete]',
      );
      expect(button).not.toBeNull();
      expect(button?.textContent).toBe('Complete fishing');
      expect(
        mount.querySelector<HTMLElement>('[data-friendone-fishing-host]')?.dataset
          .fakeFishingGame,
      ).toBe('mounted');

      button?.click();
      button?.click();

      expect(onComplete).toHaveBeenCalledWith({
        locationId: 'friend-a',
        keepsakeId: 'glowing-koi-scale',
      });
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      fixture.remove();
    }
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
