import { describe, expect, it } from 'vitest';
import {
  RECIPIENT_SPRITE,
  RECIPIENT_IDLE_ANIMATIONS,
  RECIPIENT_WALK_ANIMATIONS,
  PLAYER_FACINGS,
} from '../../src/assets/recipientSpriteConfig';

describe('recipientSpriteConfig', () => {
  it('anchors ____ at her feet inside normalized sprite cells', () => {
    expect(RECIPIENT_SPRITE.frameWidth).toBe(256);
    expect(RECIPIENT_SPRITE.frameHeight).toBe(256);
    expect(RECIPIENT_SPRITE.framesPerDirection).toBe(8);
    expect(RECIPIENT_SPRITE.url).toBe('/assets/sprites/characters/recipient-walk-4dir-v3-alpha.png');
    expect(RECIPIENT_SPRITE.origin).toEqual({ x: 0.5, y: 1 });
  });

  it('defines walk and idle animation keys for every facing direction', () => {
    for (const facing of PLAYER_FACINGS) {
      expect(RECIPIENT_WALK_ANIMATIONS[facing]).toBe(`recipient-walk-${facing}`);
      expect(RECIPIENT_IDLE_ANIMATIONS[facing]).toBe(`recipient-idle-${facing}`);
    }
  });
});
