import { describe, expect, it } from 'vitest';
import {
  FRIEND_TWO_GENERATED_ROWS,
  FRIEND_TWO_PARTIAL_FRAMES,
  resolveFriendTwoAnimationKey,
  resolveFriendTwoRow,
  friendtwoRowAnimationKey,
  friendtwoRowStripUrl,
  friendtwoRowTextureKey,
  type FriendTwoDirection,
  type FriendTwoMotion,
} from '../../src/content/friendtwoPartialSprite';

// Synthetic fixtures only — this suite reasons about the manifest's generated
// rows and the fallback rule, and must never depend on live-authored content
// (e.g. src/content/roomLayouts/friend-b.json, which may position this NPC).

const DIRECTIONS: readonly FriendTwoDirection[] = ['south', 'west', 'east', 'north'];
const MOTIONS: readonly FriendTwoMotion[] = ['idle', 'walk'];

// The rows that were intentionally NOT generated for this NPC.
describe('resolveFriendTwoRow', () => {
  it('uses the one forward idle for every idle request', () => {
    for (const direction of DIRECTIONS) {
      expect(resolveFriendTwoRow(direction, 'idle')).toBe('idle-south');
    }
  });

  it('plays walk-south directly (the one generated walk row)', () => {
    expect(resolveFriendTwoRow('south', 'walk')).toBe('walk-south');
  });

  it('falls side and north walk requests back to forward idle', () => {
    for (const direction of ['west', 'east', 'north'] as const) {
      expect(resolveFriendTwoRow(direction, 'walk')).toBe('idle-south');
    }
  });

  it('only ever returns a row that was actually generated', () => {
    for (const direction of DIRECTIONS) {
      for (const motion of MOTIONS) {
        expect(FRIEND_TWO_GENERATED_ROWS).toContain(resolveFriendTwoRow(direction, motion));
      }
    }
  });

});

describe('resolveFriendTwoAnimationKey', () => {
  it('maps a resolved row to its animation key', () => {
    expect(resolveFriendTwoAnimationKey('south', 'idle')).toBe(
      friendtwoRowAnimationKey('idle-south'),
    );
    // walk-north falls back to the only idle clip.
    expect(resolveFriendTwoAnimationKey('north', 'walk')).toBe(
      friendtwoRowAnimationKey('idle-south'),
    );
    expect(resolveFriendTwoAnimationKey('south', 'walk')).toBe(
      friendtwoRowAnimationKey('walk-south'),
    );
  });
});

describe('row key + url helpers', () => {
  it('derives distinct, stable texture and animation keys per row', () => {
    const textureKeys = new Set(FRIEND_TWO_GENERATED_ROWS.map(friendtwoRowTextureKey));
    const animKeys = new Set(FRIEND_TWO_GENERATED_ROWS.map(friendtwoRowAnimationKey));
    expect(textureKeys.size).toBe(FRIEND_TWO_GENERATED_ROWS.length);
    expect(animKeys.size).toBe(FRIEND_TWO_GENERATED_ROWS.length);
  });

  it('namespaces animation keys away from the galaxy ____ clip name', () => {
    // The galaxy-ending ____ registers `friendtwo-idle-down` on the compact atlas;
    // the partial-set clips must not collide with it in the global anim manager.
    for (const row of FRIEND_TWO_GENERATED_ROWS) {
      expect(friendtwoRowAnimationKey(row)).not.toBe('friendtwo-idle-down');
      expect(friendtwoRowTextureKey(row)).not.toBe('friendtwo-idle-walk-4dir');
    }
  });

  it('builds row strip urls under the partial-frames base', () => {
    expect(friendtwoRowStripUrl('idle-south')).toBe(
      `${FRIEND_TWO_PARTIAL_FRAMES.baseUrl}/rows/idle-south.png`,
    );
  });
});

describe('FRIEND_TWO_PARTIAL_FRAMES geometry', () => {
  it('keeps the ____/____ display treatment (scale 0.45, bottom-centre origin)', () => {
    expect(FRIEND_TWO_PARTIAL_FRAMES.scale).toBe(0.45);
    expect(FRIEND_TWO_PARTIAL_FRAMES.origin).toEqual({ x: 0.5, y: 1 });
  });

  it('mirrors the manifest cell + frame geometry', () => {
    expect(FRIEND_TWO_PARTIAL_FRAMES.frameWidth).toBe(256);
    expect(FRIEND_TWO_PARTIAL_FRAMES.frameHeight).toBe(256);
    expect(FRIEND_TWO_PARTIAL_FRAMES.framesPerRow).toBe(6);
    expect(FRIEND_TWO_PARTIAL_FRAMES.baselineY).toBe(248);
    expect(FRIEND_TWO_PARTIAL_FRAMES.normalizedCharacterHeight).toBe(216);
  });
});
