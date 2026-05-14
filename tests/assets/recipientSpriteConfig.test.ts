import { describe, expect, it } from 'vitest';
import {
  RECIPIENT_ANIMATION_SOURCE_FACING,
  RECIPIENT_FLIP_X_BY_FACING,
  RECIPIENT_SPRITE,
  RECIPIENT_IDLE_ANIMATIONS,
  RECIPIENT_IDLE_FRAME_COUNTS,
  RECIPIENT_IDLE_ROW_START_FRAME,
  RECIPIENT_TAP_STEP_FRAME_OFFSETS,
  RECIPIENT_TAP_STEP_HOLD_MS,
  RECIPIENT_WALK_DUST,
  RECIPIENT_WALK_FRAME_COUNTS,
  RECIPIENT_WALK_ROW_START_FRAME,
  RECIPIENT_WALK_ANIMATIONS,
  PLAYER_FACINGS,
} from '../../src/assets/recipientSpriteConfig';

describe('recipientSpriteConfig', () => {
  it('anchors ____ at her feet inside normalized sprite cells', () => {
    expect(RECIPIENT_SPRITE.frameWidth).toBe(256);
    expect(RECIPIENT_SPRITE.frameHeight).toBe(256);
    expect(RECIPIENT_SPRITE.url).toBe('/assets/sprites/characters/recipient-idle-walk-8dir-v1-alpha.png');
    expect(RECIPIENT_SPRITE.origin).toEqual({ x: 0.5, y: 1 });
  });

  it('maps ____ idle rows before walk rows in idle-walk scope order', () => {
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
    expect(RECIPIENT_IDLE_ROW_START_FRAME).toEqual({
      down: 0,
      'down-left': 6,
      left: 12,
      'up-left': 18,
      up: 24,
      'up-right': 30,
      right: 36,
      'down-right': 42,
    });
    expect(RECIPIENT_WALK_ROW_START_FRAME).toEqual({
      down: 48,
      'down-left': 54,
      left: 60,
      'up-left': 66,
      up: 72,
      'up-right': 78,
      right: 84,
      'down-right': 90,
    });
  });

  it('uses six-frame idle and walk loops for every direction', () => {
    expect(RECIPIENT_IDLE_FRAME_COUNTS).toEqual({
      down: 6,
      'down-left': 6,
      left: 6,
      'up-left': 6,
      up: 6,
      'up-right': 6,
      right: 6,
      'down-right': 6,
    });
    expect(RECIPIENT_WALK_FRAME_COUNTS).toEqual({
      down: 6,
      'down-left': 6,
      left: 6,
      'up-left': 6,
      up: 6,
      'up-right': 6,
      right: 6,
      'down-right': 6,
    });
  });

  it('uses subtle non-idle frames for short movement taps', () => {
    expect(RECIPIENT_TAP_STEP_FRAME_OFFSETS).toEqual({
      down: [1, 2, 3, 4],
      'down-left': [1, 2, 3, 4],
      left: [1, 2, 3, 4],
      'up-left': [1, 2, 3, 4],
      up: [1, 2, 3, 4],
      'up-right': [1, 2, 3, 4],
      right: [1, 2, 3, 4],
      'down-right': [1, 2, 3, 4],
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

  it('mirrors the stronger left-facing rows for right-facing playback', () => {
    expect(RECIPIENT_ANIMATION_SOURCE_FACING).toEqual({
      down: 'down',
      'down-left': 'down-left',
      left: 'left',
      'up-left': 'up-left',
      up: 'up',
      'up-right': 'up-left',
      right: 'left',
      'down-right': 'down-left',
    });
    expect(RECIPIENT_FLIP_X_BY_FACING).toEqual({
      down: false,
      'down-left': false,
      left: false,
      'up-left': false,
      up: false,
      'up-right': true,
      right: true,
      'down-right': true,
    });
  });
});
