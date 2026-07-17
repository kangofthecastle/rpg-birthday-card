import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

import {
  clearHeldMovementKeys,
  getPlayerFacingFromScreenMovement,
  isMovementKeyHeld,
  trackHeldMovementKeys,
} from '../../src/game/playerController';

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

describe('held movement key tracking', () => {
  // The tracker exists because Phaser key state is per scene: an edge
  // transition's scene.restart forgets a physically held arrow, and whether
  // walking resumed depended on OS auto-repeat (which only repeats the most
  // recently pressed key). The DOM-level tracker outlives scene restarts.
  const dispatch = (type: 'keydown' | 'keyup', code: string): void => {
    window.dispatchEvent(new KeyboardEvent(type, { code }));
  };

  beforeEach(() => {
    clearHeldMovementKeys();
    trackHeldMovementKeys(window);
  });

  it('reports a held arrow key for its direction', () => {
    expect(isMovementKeyHeld('left')).toBe(false);
    dispatch('keydown', 'ArrowLeft');
    expect(isMovementKeyHeld('left')).toBe(true);
    dispatch('keyup', 'ArrowLeft');
    expect(isMovementKeyHeld('left')).toBe(false);
  });

  it('reports WASD codes for their directions', () => {
    dispatch('keydown', 'KeyW');
    dispatch('keydown', 'KeyD');
    expect(isMovementKeyHeld('up')).toBe(true);
    expect(isMovementKeyHeld('right')).toBe(true);
    expect(isMovementKeyHeld('down')).toBe(false);
    dispatch('keyup', 'KeyW');
    expect(isMovementKeyHeld('up')).toBe(false);
  });

  it('ignores non-movement keys', () => {
    dispatch('keydown', 'KeyE');
    expect(isMovementKeyHeld('up')).toBe(false);
    expect(isMovementKeyHeld('down')).toBe(false);
    expect(isMovementKeyHeld('left')).toBe(false);
    expect(isMovementKeyHeld('right')).toBe(false);
  });

  it('drops all held keys when the window blurs (keyups are lost on alt-tab)', () => {
    dispatch('keydown', 'ArrowUp');
    dispatch('keydown', 'ArrowRight');
    window.dispatchEvent(new Event('blur'));
    expect(isMovementKeyHeld('up')).toBe(false);
    expect(isMovementKeyHeld('right')).toBe(false);
  });

  it('installs its listeners only once', () => {
    trackHeldMovementKeys(window);
    trackHeldMovementKeys(window);
    dispatch('keydown', 'ArrowDown');
    dispatch('keyup', 'ArrowDown');
    // A double-registered tracker would be harmless here, but the guard keeps
    // listener growth bounded across PlayerController constructions.
    expect(isMovementKeyHeld('down')).toBe(false);
  });
});
