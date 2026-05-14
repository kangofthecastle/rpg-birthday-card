import { describe, expect, it, vi } from 'vitest';
import { getActivity, listActivities } from '../../src/activities/activityRegistry';
import { createFriendOneFishingActivity } from '../../src/activities/friendoneFishing/friendoneFishingActivity';
import { LOCATIONS } from '../../src/content/locations';
import { createInitialRunState } from '../../src/game/runState';

function setSearch(search: string): void {
  window.history.pushState({}, '', `/${search}`);
}

describe('activityRegistry', () => {
  it('lists all vertical-slice activities', () => {
    const ids = listActivities().map((activity) => activity.id);

    expect(ids).toEqual([
      'friend-a-memory-bloom',
      'friendone-pc-fishing',
      'friend-b-paper-stars',
      'friend-c-song-line',
      'friendthree-strategy-table',
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

  it('does not expose ____ fishing test completion outside test mode', async () => {
    setSearch('');

    const destroy = vi.fn();
    const activity = createFriendOneFishingActivity(() => ({
      destroy,
    }));
    const onComplete = vi.fn();
    const fixture = document.createElement('div');
    const mount = document.createElement('div');

    document.body.appendChild(fixture);
    fixture.appendChild(mount);

    try {
      await activity.start({
        state: createInitialRunState('friend-a'),
        mount,
        onComplete,
        onCancel: vi.fn(),
      });

      expect(
        mount.querySelector('[data-friendone-fishing-test-complete]'),
      ).toBeNull();
      expect(onComplete).not.toHaveBeenCalled();
      expect(destroy).not.toHaveBeenCalled();
    } finally {
      setSearch('');
      fixture.remove();
    }
  });

  it('runs the ____ fishing activity lifecycle and calls complete once', async () => {
    setSearch('?testMode=1');

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
      setSearch('');
      fixture.remove();
    }
  });

  it('allows ____ fishing cancellation before game creation resolves', async () => {
    const destroy = vi.fn();
    let resolveGame: (game: { destroy: () => void }) => void = () => undefined;
    const gamePromise = new Promise<{ destroy: () => void }>((resolve) => {
      resolveGame = resolve;
    });
    const activity = createFriendOneFishingActivity(() => gamePromise);
    const onCancel = vi.fn();
    const fixture = document.createElement('div');
    const mount = document.createElement('div');

    document.body.appendChild(fixture);
    fixture.appendChild(mount);

    const startPromise = activity.start({
      state: createInitialRunState('friend-a'),
      mount,
      onComplete: vi.fn(),
      onCancel,
    });

    try {
      const cancelButton = mount.querySelector<HTMLButtonElement>(
        '[data-friendone-fishing-cancel]',
      );
      expect(cancelButton).not.toBeNull();

      cancelButton?.click();
      cancelButton?.click();

      expect(onCancel).toHaveBeenCalledTimes(1);

      resolveGame({ destroy });
      await startPromise;

      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      resolveGame({ destroy });
      await startPromise;
      fixture.remove();
    }
  });

  it('cancels ____ fishing when game creation rejects', async () => {
    const activity = createFriendOneFishingActivity(() =>
      Promise.reject(new Error('Failed to create fishing game')),
    );
    const onCancel = vi.fn();
    const onComplete = vi.fn();
    const fixture = document.createElement('div');
    const mount = document.createElement('div');

    document.body.appendChild(fixture);
    fixture.appendChild(mount);

    try {
      await expect(
        activity.start({
          state: createInitialRunState('friend-a'),
          mount,
          onComplete,
          onCancel,
        }),
      ).resolves.toBeUndefined();

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
    } finally {
      fixture.remove();
    }
  });

  it('throws for unknown activities', () => {
    expect(() => getActivity('missing')).toThrow('Unknown activity: missing');
  });

  it('runs the ____ strategy table placeholder lifecycle and calls cancel', async () => {
    const activity = getActivity('friendthree-strategy-table');
    const onCancel = vi.fn();
    const onComplete = vi.fn();
    const fixture = document.createElement('div');
    const mount = document.createElement('div');

    document.body.appendChild(fixture);
    fixture.appendChild(mount);

    try {
      await activity.start({
        state: createInitialRunState('friend-c'),
        mount,
        onComplete,
        onCancel,
      });

      expect(mount.textContent).toContain(
        '____ Island is being set up on the table.',
      );

      const button = mount.querySelector<HTMLButtonElement>('[data-activity-cancel]');
      expect(button).not.toBeNull();

      button?.click();
      button?.click();

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
    } finally {
      fixture.remove();
    }
  });

  it('registers every activity interaction used by locations', () => {
    const activityIds = LOCATIONS.flatMap((location) =>
      location.interactions.flatMap((interaction) =>
        interaction.kind === 'activity' ? [interaction.activityId] : [],
      ),
    );

    expect(activityIds).toEqual([
      'friend-a-memory-bloom',
      'friend-b-paper-stars',
      'friend-c-song-line',
      'friendthree-strategy-table',
      'final-keepsake-reveal',
    ]);
    expect(() => {
      activityIds.forEach((activityId) => getActivity(activityId));
    }).not.toThrow();
  });
});
