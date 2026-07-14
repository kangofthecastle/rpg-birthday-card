import { describe, expect, it } from 'vitest';
import {
  beamTrapezoid,
  resolveWindowBeamMouth,
  resolveWindowBeamSource,
} from '../../src/game/windowBeamGeometry';

describe('window beam source geometry', () => {
  it('uses the same centre and shear for ordinary and targeted beams', () => {
    const source = resolveWindowBeamSource(
      { mapX: 320, mapY: 160, wallShear: -0.5 },
      180,
      { x: 700, y: 120, verticalScale: 0.5 },
    );
    const mouth = resolveWindowBeamMouth(source.center, 30, source.slope);
    const ordinary = beamTrapezoid(source.center, { x: 900, y: 500 }, 30, 80, source.slope);

    expect(ordinary.slice(0, 2)).toEqual([mouth.start, mouth.end]);
    expect((mouth.start.x + mouth.end.x) / 2).toBe(source.center.x);
    expect((mouth.start.y + mouth.end.y) / 2).toBe(source.center.y);
    expect((mouth.end.y - mouth.start.y) / (mouth.end.x - mouth.start.x)).toBe(-0.5);
  });
});
