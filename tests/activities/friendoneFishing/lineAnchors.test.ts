import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class Scene {
      constructor(_key?: string) {}
    },
  },
}));

import { FriendOneFishingScene } from '../../../src/activities/friendoneFishing/FriendOneFishingScene';

describe('FriendOneFishingScene fishing-line anchors', () => {
  it('draws each line from the painted rod tip', () => {
    const lineBetween = vi.fn();
    const graphics = {
      fillCircle: vi.fn(),
      fillStyle: vi.fn(),
      lineBetween,
      lineStyle: vi.fn(),
      strokeCircle: vi.fn(),
      strokeEllipse: vi.fn(),
    };
    const scene = new FriendOneFishingScene() as unknown as {
      motionGraphics: typeof graphics;
      drawFishingLines: (time: number, holdActive: boolean) => void;
    };
    scene.motionGraphics = graphics;

    scene.drawFishingLines(0, false);

    expect(lineBetween.mock.calls.slice(0, 2).map(([x, y]) => ({ x, y }))).toEqual([
      { x: 189, y: 144 },
      { x: 271, y: 142 },
    ]);
  });
});
