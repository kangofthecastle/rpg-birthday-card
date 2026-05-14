import { describe, expect, it, vi } from 'vitest';
import { friendthreeStrategyActivity } from '../../src/activities/friendthreeStrategyActivity';
import { createInitialRunState } from '../../src/game/runState';

function getEnabledFriendThreeAction(mount: HTMLElement, action: string): HTMLButtonElement {
  const button = mount.querySelector<HTMLButtonElement>(
    `[data-friendthree-action="${action}"]`,
  );

  expect(button).not.toBeNull();
  expect(button?.disabled).toBe(false);

  return button as HTMLButtonElement;
}

describe('friendthreeStrategyActivity', () => {
  it('renders the tabletop match and reports a win when ____ completes the scripted route', async () => {
    const mount = document.createElement('div');
    const onComplete = vi.fn();

    document.body.appendChild(mount);

    try {
      await friendthreeStrategyActivity.start({
        state: createInitialRunState('friend-c'),
        mount,
        onComplete,
        onCancel: vi.fn(),
      });

      expect(mount.querySelector('.friendthree-tabletop')).not.toBeNull();
      expect(mount.textContent).toContain('____ Island');
      expect(mount.textContent).toContain('____');

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
      mount.remove();
    }
  });
});
