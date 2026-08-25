import { describe, expect, it } from 'vitest';
import { matchPathPaletteMean, pathJoinFeather } from '../../src/game/outdoorGround';

describe('outdoor path palette matching', () => {
  it('matches RGB grading while preserving alpha and authored detail differences', () => {
    const target = new Uint8ClampedArray([
      100, 80, 60, 255,
      120, 100, 80, 128,
      9, 8, 7, 0,
    ]);
    const reference = new Uint8ClampedArray([
      110, 90, 70, 255,
      130, 110, 90, 128,
    ]);

    const matched = matchPathPaletteMean(target, reference);

    expect(Array.from(matched)).toEqual([
      110, 90, 70, 255,
      130, 110, 90, 128,
      9, 8, 7, 0,
    ]);
  });

  it('leaves an empty transparent tile unchanged', () => {
    const transparent = new Uint8ClampedArray([12, 34, 56, 0]);
    const reference = new Uint8ClampedArray([100, 90, 80, 255]);

    expect(matchPathPaletteMean(transparent, reference)).toEqual(transparent);
  });

  it('brings connected tile edges to the straight path join colour', () => {
    const row = [50, 100, 100, 50].flatMap((value) => [value, value, value, 255]);
    const target = new Uint8ClampedArray(Array.from({ length: 4 }, () => row).flat());
    const reference = new Uint8ClampedArray(
      Array.from({ length: 16 }, () => [100, 100, 100, 255]).flat(),
    );

    const matched = matchPathPaletteMean(target, reference, 4);

    for (let row = 0; row < 4; row += 1) {
      expect(Math.abs(matched[(row * 4) * 4] - 100)).toBeLessThan(25);
      expect(Math.abs(matched[(row * 4 + 3) * 4] - 100)).toBeLessThan(25);
    }
  });

  it('feathers a connector from full strength at the join to clear at both ends', () => {
    expect(pathJoinFeather(0, 65)).toBeCloseTo(0);
    expect(pathJoinFeather(32, 65)).toBeCloseTo(1);
    expect(pathJoinFeather(64, 65)).toBeCloseTo(0);
    expect(pathJoinFeather(16, 65)).toBeCloseTo(pathJoinFeather(48, 65));
  });
});
