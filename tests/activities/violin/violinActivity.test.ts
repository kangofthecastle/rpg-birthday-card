import { describe, expect, it, vi } from 'vitest';
import { createViolinActivity } from '../../../src/activities/violin/violinActivity';
import type { ViolinSceneCallbacks } from '../../../src/activities/violin/ViolinScene';
import { createInitialRunState } from '../../../src/game/runState';

vi.mock('../../../src/game/audio', () => ({
  prepareViolinSamples: vi.fn().mockResolvedValue(undefined),
}));

function mountFixture(): { fixture: HTMLElement; mount: HTMLElement } {
  const fixture = document.createElement('div');
  const mount = document.createElement('div');
  fixture.appendChild(mount);
  document.body.appendChild(fixture);
  return { fixture, mount };
}

describe('violinActivity', () => {
  it('commits a real scene pass before tearing the rhythm game down', async () => {
    let sceneCallbacks: ViolinSceneCallbacks | undefined;
    const order: string[] = [];
    const activity = createViolinActivity((_parent, callbacks) => {
      sceneCallbacks = callbacks;
      return {
        destroy: () => {
          order.push('destroy');
        },
      };
    });
    const onComplete = vi.fn(() => order.push('complete'));
    const { fixture, mount } = mountFixture();

    try {
      await activity.start({
        state: createInitialRunState('recipient-house'),
        mount,
        onComplete,
        onCancel: vi.fn(),
      });

      expect(mount.querySelector('.activity-shell__controls')?.textContent).toBe(
        'Press Space to begin · play each note at the line · D F J K · score 60,000 to pass · Esc to leave',
      );

      sceneCallbacks?.onComplete();
      sceneCallbacks?.onComplete();

      expect(onComplete).toHaveBeenCalledWith({
        locationId: 'recipient-house',
        activityId: 'recipient-violin-piece',
        keepsakeId: 'recipient-sheet-music',
      });
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['complete', 'destroy']);
    } finally {
      fixture.remove();
    }
  });

  it('does not lose the pass if Phaser teardown throws', async () => {
    let sceneCallbacks: ViolinSceneCallbacks | undefined;
    const activity = createViolinActivity((_parent, callbacks) => {
      sceneCallbacks = callbacks;
      return {
        destroy: () => {
          throw new Error('renderer teardown failed');
        },
      };
    });
    const onComplete = vi.fn();
    const { fixture, mount } = mountFixture();

    try {
      await activity.start({
        state: createInitialRunState('recipient-house'),
        mount,
        onComplete,
        onCancel: vi.fn(),
      });

      expect(() => sceneCallbacks?.onComplete()).not.toThrow();
      expect(onComplete).toHaveBeenCalledTimes(1);
    } finally {
      fixture.remove();
    }
  });
});
