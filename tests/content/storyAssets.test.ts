import { describe, expect, it } from 'vitest';
import * as storyAssets from '../../src/content/storyAssets';

const { FINALE_OMEN_DISPLAY_SIZE } = storyAssets;

describe('storyAssets', () => {
  it('keeps the finale Omen modest and proportional to his 64×80 source', () => {
    expect(FINALE_OMEN_DISPLAY_SIZE).toEqual({ width: 82, height: 102 });
    expect(FINALE_OMEN_DISPLAY_SIZE.width / FINALE_OMEN_DISPLAY_SIZE.height)
      .toBeCloseTo(64 / 80, 2);
  });

  it('keeps ____’s light-blue PC glow inside the painted monitor glass', () => {
    const cue = (
      storyAssets as typeof storyAssets & {
        FRIEND_ONE_PC_GLASS_CUE?: {
          bounds: { left: number; top: number; width: number; height: number };
          gradient: readonly [number, number, number, number];
        };
      }
    ).FRIEND_ONE_PC_GLASS_CUE;

    expect(cue).toEqual({
      bounds: { left: 0.295, top: 0.05, width: 0.37, height: 0.18 },
      gradient: [0xaeefff, 0x7edcff, 0x4faedc, 0x277cae],
    });
    expect((cue?.bounds.left ?? 1) + (cue?.bounds.width ?? 1)).toBeLessThanOrEqual(0.67);
  });

  it('centers ____’s epilogue mail cue inside the dark CRT glass', () => {
    const cue = (
      storyAssets as typeof storyAssets & {
        RECIPIENT_PC_MAIL_CUE?: {
          screenBounds: { left: number; top: number; width: number; height: number };
          color: number;
        };
      }
    ).RECIPIENT_PC_MAIL_CUE;

    expect(cue).toEqual({
      screenBounds: { left: 0.3875, top: 0.1025, width: 0.23, height: 0.1425 },
      color: 0xffd75a,
    });
    expect((cue?.screenBounds.left ?? 1) + (cue?.screenBounds.width ?? 1))
      .toBeLessThanOrEqual(0.64);
    expect((cue?.screenBounds.top ?? 1) + (cue?.screenBounds.height ?? 1))
      .toBeLessThanOrEqual(0.26);
  });
});
