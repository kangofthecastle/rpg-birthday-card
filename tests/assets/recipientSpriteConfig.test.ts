import { describe, expect, it } from 'vitest';
import {
  RECIPIENT_SPRITE,
  RECIPIENT_IDLE_ANIMATIONS,
  RECIPIENT_IDLE_FRAME_OFFSETS,
  RECIPIENT_ROW_START_FRAME,
  RECIPIENT_TAP_STEP_FRAME_OFFSETS,
  RECIPIENT_TAP_STEP_HOLD_MS,
  RECIPIENT_WALK_DUST,
  RECIPIENT_WALK_FRAME_COUNTS,
  RECIPIENT_WALK_ANIMATIONS,
  PLAYER_FACINGS,
} from '../../src/assets/recipientSpriteConfig';

describe('recipientSpriteConfig', () => {
  it('anchors ____ at her feet inside normalized sprite cells', () => {
    expect(RECIPIENT_SPRITE.frameWidth).toBe(256);
    expect(RECIPIENT_SPRITE.frameHeight).toBe(256);
    expect(RECIPIENT_SPRITE.url).toBe('/assets/sprites/characters/recipient-walk-4dir-v13-alpha.png');
    expect(RECIPIENT_SPRITE.origin).toEqual({ x: 0.5, y: 1 });
  });

  it('maps ____ sprite rows in the generated sheet order', () => {
    expect(PLAYER_FACINGS).toEqual([
      'down',
      'down-left',
      'left',
      'up-left',
      'up',
      'up-right',
      'right',
      'down-right',
    ]);
    expect(RECIPIENT_ROW_START_FRAME).toEqual({
      down: 0,
      'down-left': 8,
      left: 8,
      'up-left': 8,
      up: 24,
      'up-right': 16,
      right: 16,
      'down-right': 16,
    });
  });

  it('uses eight-frame walks for every direction', () => {
    expect(RECIPIENT_WALK_FRAME_COUNTS).toEqual({
      down: 8,
      'down-left': 8,
      left: 8,
      'up-left': 8,
      up: 8,
      'up-right': 8,
      right: 8,
      'down-right': 8,
    });
  });

  it('uses neutral feet-together frames when ____ stops', () => {
    expect(RECIPIENT_IDLE_FRAME_OFFSETS).toEqual({
      down: 0,
      'down-left': 2,
      left: 2,
      'up-left': 2,
      up: 0,
      'up-right': 2,
      right: 2,
      'down-right': 2,
    });
  });

  it('uses subtle non-idle frames for short movement taps', () => {
    expect(RECIPIENT_TAP_STEP_FRAME_OFFSETS).toEqual({
      down: [1, 2, 4, 6],
      'down-left': [1, 2, 4, 6],
      left: [1, 2, 4, 6],
      'up-left': [1, 2, 4, 6],
      up: [1, 2, 4, 6],
      'up-right': [1, 2, 4, 6],
      right: [1, 2, 4, 6],
      'down-right': [1, 2, 4, 6],
    });
    expect(RECIPIENT_TAP_STEP_HOLD_MS).toBe(140);

    for (const facing of PLAYER_FACINGS) {
      for (const offset of RECIPIENT_TAP_STEP_FRAME_OFFSETS[facing]) {
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThan(RECIPIENT_WALK_FRAME_COUNTS[facing]);
      }
    }
  });

  it('defines a subtle procedural walking dust effect', () => {
    expect(RECIPIENT_WALK_DUST).toMatchObject({
      key: 'recipient-walk-dust-puff',
      intervalMs: 90,
      lifespanMs: 300,
      alpha: 0.75,
    });
    expect(RECIPIENT_WALK_DUST.footYOffset).toBeLessThan(0);
    expect(RECIPIENT_WALK_DUST.startScale).toBeLessThan(RECIPIENT_WALK_DUST.endScale);
  });

  it('defines walk and idle animation keys for every facing direction', () => {
    for (const facing of PLAYER_FACINGS) {
      expect(RECIPIENT_WALK_ANIMATIONS[facing]).toBe(`recipient-walk-${facing}`);
      expect(RECIPIENT_IDLE_ANIMATIONS[facing]).toBe(`recipient-idle-${facing}`);
    }
  });
});
