import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createValorantSplitActivity } from '../../../src/activities/valorantSplit/valorantSplitActivity';
import type { SplitSceneCallbacks } from '../../../src/activities/valorantSplit/SplitScene';
import { createInitialRunState } from '../../../src/game/runState';

const { playSfx } = vi.hoisted(() => ({ playSfx: vi.fn() }));

vi.mock('../../../src/game/audio', () => ({ playSfx }));

beforeEach(() => {
  playSfx.mockClear();
  document.querySelector('[data-ui-layer="dialogue"]')?.remove();
});

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
  it('waits for explicit scene readiness, then holds gameplay through the Omen lead-in', async () => {
    let sceneCallbacks: SplitSceneCallbacks | undefined;
    const activity = createValorantSplitActivity((_parent, callbacks) => {
      sceneCallbacks = callbacks;
      return { destroy: vi.fn() };
    });
    const { fixture, mount } = mountFixture();
    const uiRoot = document.createElement('div');
    uiRoot.id = 'ui-root';
    document.body.append(uiRoot);

    try {
      await activity.start({
        state: createInitialRunState('friend-b'),
        mount,
        onComplete: vi.fn(),
        onCancel: vi.fn(),
      });

      // Merely constructing the Phaser game is not scene readiness.
      expect(document.body.textContent).not.toContain('Omen?');
      expect(playSfx).not.toHaveBeenCalledWith('sfx-omen-void');

      let released = false;
      const leadIn = sceneCallbacks?.onReady();
      expect(sceneCallbacks?.onReady()).toBe(leadIn);
      const ready = leadIn?.then(() => {
        released = true;
      });

      expect(document.body.textContent).toContain('Omen? Don’t think I’ve ever seen you play him');
      expect(released).toBe(false);
      expect(playSfx).not.toHaveBeenCalledWith('sfx-omen-void');

      document.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
      await Promise.resolve();

      expect(document.body.textContent).toContain('Unintelligible sounds from the void');
      expect(document.querySelector('.dialogue-box__text--italic')).not.toBeNull();
      expect(playSfx).toHaveBeenCalledWith('sfx-omen-void');
      expect(
        document.querySelector<HTMLImageElement>('.dialogue-box__portrait')?.getAttribute('src'),
      ).toBe('/assets/activities/valorant-split/omen.png');
      expect(playSfx.mock.calls.filter(([key]) => key === 'sfx-omen-void')).toHaveLength(1);
      expect(released).toBe(false);

      document.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
      expect(document.body.textContent).toContain('What?');
      expect(document.querySelector('.dialogue-box__text--italic')).toBeNull();
      expect(released).toBe(false);

      document.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
      await ready;

      expect(released).toBe(true);
      expect(document.querySelector('[data-ui-layer="dialogue"]')).toBeNull();
    } finally {
      document.querySelector('[data-ui-layer="dialogue"]')?.remove();
      uiRoot.remove();
      fixture.remove();
    }
  });

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
        activityId: 'valorant-split',
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
        activityId: 'valorant-split',
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
