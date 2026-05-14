import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

import { getPlayerFacingFromScreenMovement } from '../../src/game/playerController';

describe('getPlayerFacingFromScreenMovement', () => {
  it.each([
    [{ x: 0, y: 1 }, 'down'],
    [{ x: -1, y: 1 }, 'down-left'],
    [{ x: -1, y: 0 }, 'left'],
    [{ x: -1, y: -1 }, 'up-left'],
    [{ x: 0, y: -1 }, 'up'],
    [{ x: 1, y: -1 }, 'up-right'],
    [{ x: 1, y: 0 }, 'right'],
    [{ x: 1, y: 1 }, 'down-right'],
  ] as const)('selects %s as %s', (movement, facing) => {
    expect(getPlayerFacingFromScreenMovement(movement)).toBe(facing);
  });

  it('keeps the previous facing when movement is too small to imply a direction', () => {
    expect(getPlayerFacingFromScreenMovement({ x: 0.1, y: 0.1 }, 'up-left')).toBe('up-left');
  });
});
