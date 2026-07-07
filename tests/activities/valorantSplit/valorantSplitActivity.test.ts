import { describe, expect, it, vi } from 'vitest';
import { createValorantSplitActivity } from '../../../src/activities/valorantSplit/valorantSplitActivity';
import type { SplitSceneCallbacks } from '../../../src/activities/valorantSplit/SplitScene';
import { createInitialRunState } from '../../../src/game/runState';

function setSearch(search: string): void {
  window.history.pushState({}, '', `/${search}`);
}

function mountFixture(): { fixture: HTMLElement; mount: HTMLElement } {
  const fixture = document.createElement('div');
  const mount = document.createElement('div');

  document.body.appendChild(fixture);
  fixture.appendChild(mount);

  return { fixture, mount };
}

describe('valorantSplitActivity', () => {
  it('does not expose the test completion control outside test mode', async () => {
    setSearch('');

    const destroy = vi.fn();
    const activity = createValorantSplitActivity(() => ({ destroy }));
    const onComplete = vi.fn();
    const { fixture, mount } = mountFixture();

    try {
      await activity.start({
        state: createInitialRunState('friend-b'),
        mount,
        onComplete,
        onCancel: vi.fn(),
      });

      expect(mount.querySelector('[data-valorant-split-test-complete]')).toBeNull();
      expect(onComplete).not.toHaveBeenCalled();
      expect(destroy).not.toHaveBeenCalled();
    } finally {
      setSearch('');
      fixture.remove();
    }
  });

  it('runs the lifecycle and completes with the spike-charm keepsake once', async () => {
    setSearch('?testMode=1');

    const destroy = vi.fn();
    const activity = createValorantSplitActivity((parent) => {
      parent.dataset.fakeSplitGame = 'mounted';

      return { destroy };
    });
    const onComplete = vi.fn();
    const { fixture, mount } = mountFixture();

    try {
      await activity.start({
        state: createInitialRunState('friend-b'),
        mount,
        onComplete: (completion) => {
          onComplete(completion);
          mount.remove();
        },
        onCancel: vi.fn(),
      });

      const button = mount.querySelector<HTMLButtonElement>(
        '[data-valorant-split-test-complete]',
      );
      expect(button).not.toBeNull();
      expect(button?.textContent).toBe('Defuse the spike');
      expect(
        mount.querySelector<HTMLElement>('[data-valorant-split-host]')?.dataset.fakeSplitGame,
      ).toBe('mounted');

      button?.click();
      button?.click();

      expect(onComplete).toHaveBeenCalledWith({
        locationId: 'friend-b',
        keepsakeId: 'defused-spike-charm',
      });
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      setSearch('');
      fixture.remove();
    }
  });

  it('bridges scene completion exactly once', async () => {
    let sceneCallbacks: SplitSceneCallbacks | undefined;
    const destroy = vi.fn();
    const activity = createValorantSplitActivity((_parent, callbacks) => {
      sceneCallbacks = callbacks;

      return { destroy };
    });
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const { fixture, mount } = mountFixture();

    try {
      await activity.start({
        state: createInitialRunState('friend-b'),
        mount,
        onComplete,
        onCancel,
      });

      sceneCallbacks?.onComplete();
      sceneCallbacks?.onComplete();
      sceneCallbacks?.onCancel();

      expect(onComplete).toHaveBeenCalledWith({
        locationId: 'friend-b',
        keepsakeId: 'defused-spike-charm',
      });
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      fixture.remove();
    }
  });

  it('ignores late scene callbacks after cancellation', async () => {
    let sceneCallbacks: SplitSceneCallbacks | undefined;
    const destroy = vi.fn();
    const activity = createValorantSplitActivity((_parent, callbacks) => {
      sceneCallbacks = callbacks;

      return { destroy };
    });
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const { fixture, mount } = mountFixture();

    try {
      await activity.start({
        state: createInitialRunState('friend-b'),
        mount,
        onComplete,
        onCancel,
      });

      mount.querySelector<HTMLButtonElement>('[data-valorant-split-cancel]')?.click();
      sceneCallbacks?.onComplete();
      sceneCallbacks?.onCancel();

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      fixture.remove();
    }
  });

  it('keeps DOM actions keyboard-accessible', async () => {
    const destroy = vi.fn();
    const activity = createValorantSplitActivity(() => ({ destroy }));
    const onCancel = vi.fn();
    const { fixture, mount } = mountFixture();

    try {
      await activity.start({
        state: createInitialRunState('friend-b'),
        mount,
        onComplete: vi.fn(),
        onCancel,
      });

      const cancelButton = mount.querySelector<HTMLButtonElement>('[data-valorant-split-cancel]');
      cancelButton?.focus();
      cancelButton?.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
      );

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      fixture.remove();
    }
  });

  it('cancels when game creation rejects', async () => {
    const activity = createValorantSplitActivity(() =>
      Promise.reject(new Error('Failed to create SPLIT.EXE game')),
    );
    const onCancel = vi.fn();
    const onComplete = vi.fn();
    const { fixture, mount } = mountFixture();

    try {
      await expect(
        activity.start({
          state: createInitialRunState('friend-b'),
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
});
