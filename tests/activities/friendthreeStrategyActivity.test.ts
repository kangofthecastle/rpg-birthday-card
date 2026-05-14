import { describe, expect, it, vi } from 'vitest';
import { friendthreeStrategyActivity } from '../../src/activities/friendthreeStrategyActivity';
import { createInitialRunState } from '../../src/game/runState';

function getEnabledFriendThreeAction(mount: HTMLElement, action: string): HTMLButtonElement {
  const button = getFriendThreeAction(mount, action);

  expect(button?.disabled).toBe(false);

  return button;
}

function getFriendThreeAction(mount: HTMLElement, action: string): HTMLButtonElement {
  const button = mount.querySelector<HTMLButtonElement>(
    `[data-friendthree-action="${action}"]`,
  );

  expect(button).not.toBeNull();

  return button as HTMLButtonElement;
}

describe('friendthreeStrategyActivity', () => {
  it('does not let ____ roll production twice in the same turn', async () => {
    const mount = document.createElement('div');

    document.body.appendChild(mount);

    try {
      await friendthreeStrategyActivity.start({
        state: createInitialRunState('friend-c'),
        mount,
        onComplete: vi.fn(),
        onCancel: vi.fn(),
      });

      getEnabledFriendThreeAction(mount, 'roll').click();

      expect(mount.textContent).toContain('____: W5 S4 G1');

      const rollAgain = getFriendThreeAction(mount, 'roll');
      expect(rollAgain.disabled).toBe(true);

      rollAgain.disabled = false;
      rollAgain.click();

      expect(mount.textContent).toContain('____: W5 S4 G1');
      expect(mount.textContent).not.toContain('____: W6 S4 G1');
    } finally {
      mount.remove();
    }
  });

  it('ignores malformed tabletop actions without mutating visible state', async () => {
    const mount = document.createElement('div');

    document.body.appendChild(mount);

    try {
      await friendthreeStrategyActivity.start({
        state: createInitialRunState('friend-c'),
        mount,
        onComplete: vi.fn(),
        onCancel: vi.fn(),
      });

      const roll = getEnabledFriendThreeAction(mount, 'roll');
      roll.dataset.friendthreeAction = 'not-real';

      expect(() => roll.click()).not.toThrow();
      expect(mount.textContent).toContain('Turn 1 · ____');
      expect(mount.textContent).toContain('____: W4 S4 G1');
      expect(mount.textContent).toContain('____ studies the opening road from the coast.');
    } finally {
      mount.remove();
    }
  });

  it('lets ____ roll, end turn, and see ____ take a quick turn', async () => {
    const mount = document.createElement('div');

    document.body.appendChild(mount);

    try {
      await friendthreeStrategyActivity.start({
        state: createInitialRunState('friend-c'),
        mount,
        onComplete: vi.fn(),
        onCancel: vi.fn(),
      });

      const roll = getEnabledFriendThreeAction(mount, 'roll');
      roll.click();

      expect(mount.textContent).toContain('Rolled 5');
      expect(mount.textContent).toContain('wood');
      expect(mount.textContent).toContain('5');

      const endTurn = getEnabledFriendThreeAction(mount, 'end-turn');
      endTurn.click();

      expect(mount.textContent).toContain('Turn 2');
      expect(mount.textContent).toContain('Turn 2 · ____');
      expect(mount.textContent).toContain('____: W6 S4 G1');
      expect(mount.textContent).toContain('Score 1 · W 1 / S 1 / G 0');
      expect(mount.textContent).toContain('passed');

      const friendthreeRoad = mount.querySelector<HTMLButtonElement>('[data-friendthree-action="build-road:e18"]');
      expect(friendthreeRoad).not.toBeNull();
      expect(friendthreeRoad?.classList.contains('friendthree-edge--friendthree')).toBe(true);
    } finally {
      mount.remove();
    }
  });

  it('lets ____ use bank trades from the tabletop controls', async () => {
    const mount = document.createElement('div');

    document.body.appendChild(mount);

    try {
      await friendthreeStrategyActivity.start({
        state: createInitialRunState('friend-c'),
        mount,
        onComplete: vi.fn(),
        onCancel: vi.fn(),
      });

      const tradeWoodForGrain = getEnabledFriendThreeAction(mount, 'trade:wood:grain');
      tradeWoodForGrain.click();

      expect(mount.textContent).toContain('____: W1 S4 G2');
      expect(mount.textContent).toContain('traded 3 wood for 1 grain');
    } finally {
      mount.remove();
    }
  });

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
