import { describe, expect, it, vi } from 'vitest';
import { getActivity, listActivities } from '../../src/activities/activityRegistry';
import { createFriendOneFishingActivity } from '../../src/activities/friendoneFishing/friendoneFishingActivity';
import type { FriendOneFishingSceneCallbacks } from '../../src/activities/friendoneFishing/FriendOneFishingScene';
import { LOCATIONS } from '../../src/content/locations';
import { createInitialRunState } from '../../src/game/runState';

function setSearch(search: string): void {
  window.history.pushState({}, '', `/${search}`);
}

function getEnabledFriendThreeAction(mount: HTMLElement, action: string): HTMLButtonElement {
  const button = mount.querySelector<HTMLButtonElement>(
    `[data-friendthree-action="${action}"]`,
  );

  expect(button).not.toBeNull();
  expect(button?.disabled).toBe(false);

  return button as HTMLButtonElement;
}

describe('activityRegistry', () => {
  it('lists all vertical-slice activities', () => {
    const ids = listActivities().map((activity) => activity.id);

    expect(ids).toEqual([
      'friendone-pc-fishing',
      'friend-b-paper-stars',
      'friend-c-song-line',
      'friendthree-strategy-table',
      'final-keepsake-reveal',
    ]);
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

  it('bridges ____ fishing scene completion exactly once', async () => {
    let sceneCallbacks: FriendOneFishingSceneCallbacks | undefined;
    const destroy = vi.fn();
    const activity = createFriendOneFishingActivity((_parent, callbacks) => {
      sceneCallbacks = callbacks;

      return {
        destroy,
      };
    });
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const fixture = document.createElement('div');
    const mount = document.createElement('div');

    document.body.appendChild(fixture);
    fixture.appendChild(mount);

    try {
      await activity.start({
        state: createInitialRunState('friend-a'),
        mount,
        onComplete,
        onCancel,
      });

      sceneCallbacks?.onComplete();
      sceneCallbacks?.onComplete();
      sceneCallbacks?.onCancel();

      expect(onComplete).toHaveBeenCalledWith({
        locationId: 'friend-a',
        keepsakeId: 'glowing-koi-scale',
      });
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      fixture.remove();
    }
  });

  it('ignores late ____ fishing scene callbacks after cancellation', async () => {
    let sceneCallbacks: FriendOneFishingSceneCallbacks | undefined;
    const destroy = vi.fn();
    const activity = createFriendOneFishingActivity((_parent, callbacks) => {
      sceneCallbacks = callbacks;

      return {
        destroy,
      };
    });
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const fixture = document.createElement('div');
    const mount = document.createElement('div');

    document.body.appendChild(fixture);
    fixture.appendChild(mount);

    try {
      await activity.start({
        state: createInitialRunState('friend-a'),
        mount,
        onComplete,
        onCancel,
      });

      mount
        .querySelector<HTMLButtonElement>('[data-friendone-fishing-cancel]')
        ?.click();
      sceneCallbacks?.onComplete();
      sceneCallbacks?.onCancel();

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      fixture.remove();
    }
  });

  it('keeps ____ fishing DOM actions keyboard-accessible', async () => {
    const destroy = vi.fn();
    const activity = createFriendOneFishingActivity(() => ({
      destroy,
    }));
    const onCancel = vi.fn();
    const fixture = document.createElement('div');
    const mount = document.createElement('div');

    document.body.appendChild(fixture);
    fixture.appendChild(mount);

    try {
      await activity.start({
        state: createInitialRunState('friend-a'),
        mount,
        onComplete: vi.fn(),
        onCancel,
      });

      const cancelButton = mount.querySelector<HTMLButtonElement>(
        '[data-friendone-fishing-cancel]',
      );
      cancelButton?.focus();
      cancelButton?.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Enter',
        }),
      );

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      fixture.remove();
    }
  });

  it('renders ____ fishing with a responsive activity shell', async () => {
    const activity = createFriendOneFishingActivity(() => ({
      destroy: vi.fn(),
    }));
    const fixture = document.createElement('div');
    const mount = document.createElement('div');

    document.body.appendChild(fixture);
    fixture.appendChild(mount);

    try {
      await activity.start({
        state: createInitialRunState('friend-a'),
        mount,
        onComplete: vi.fn(),
        onCancel: vi.fn(),
      });

      const panel = mount.querySelector<HTMLElement>('.activity-panel--friendone-fishing');
      const gameShell = mount.querySelector<HTMLElement>('.friendone-fishing-game');
      const host = mount.querySelector<HTMLElement>('[data-friendone-fishing-host]');

      expect(panel).not.toBeNull();
      expect(gameShell).not.toBeNull();
      expect(host?.parentElement).toBe(gameShell);
    } finally {
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

  it('runs the ____ strategy table lifecycle and calls complete', async () => {
    const activity = getActivity('friendthree-strategy-table');
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
        onCancel: vi.fn(),
      });

      expect(mount.querySelector('.friendthree-tabletop')).not.toBeNull();

      const road0 = getEnabledFriendThreeAction(mount, 'build-road:e0');
      road0.click();
      const road1 = getEnabledFriendThreeAction(mount, 'build-road:e1');
      road1.click();
      const road2 = getEnabledFriendThreeAction(mount, 'build-road:e2');
      road2.click();
      const settlement = getEnabledFriendThreeAction(mount, 'build-settlement:n3');
      settlement.click();

      road0.click();
      road1.click();
      road2.click();
      settlement.click();

      expect(onComplete).toHaveBeenCalledWith({
        activityId: 'friendthree-strategy-table',
        locationId: 'friend-c',
        won: true,
      });
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(mount.querySelector('[data-friendthree-action]')).toBeNull();
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
      'friendone-pc-fishing',
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
