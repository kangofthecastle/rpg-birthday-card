import { describe, expect, it } from 'vitest';
import {
  sampleBreathingMote,
  sampleRibbonMote,
  type BreathingMoteMotion,
  type RibbonMoteMotion,
} from '../../src/game/loopingMoteMotion';

const motion: RibbonMoteMotion = {
  startX: 100,
  startY: 700,
  endY: 100,
  swayX: 40,
  delayMs: 500,
  runMs: 10_000,
  scale: 1,
  peakAlpha: 0.8,
};

describe('sampleRibbonMote', () => {
  it('stays invisible at its start point during the seeded delay', () => {
    expect(sampleRibbonMote(motion, 499)).toEqual({ x: 100, y: 700, alpha: 0 });
  });

  it('matches the northward path, yoyo sway, and held peak alpha', () => {
    expect(sampleRibbonMote(motion, 3_000)).toEqual({ x: 120, y: 550, alpha: 0.8 });
    expect(sampleRibbonMote(motion, 5_500)).toEqual({ x: 140, y: 400, alpha: 0.8 });
    expect(sampleRibbonMote(motion, 8_000)).toEqual({ x: 120, y: 250, alpha: 0.8 });
  });

  it('fades out before returning invisibly to the south edge', () => {
    expect(sampleRibbonMote(motion, 10_499).alpha).toBeLessThan(0.001);
    expect(sampleRibbonMote(motion, 10_500)).toEqual({ x: 100, y: 700, alpha: 0 });
  });
});

describe('sampleBreathingMote', () => {
  const breathing: BreathingMoteMotion = {
    startX: 10,
    startY: 20,
    endX: 30,
    endY: 0,
    moveDelayMs: 100,
    moveDurationMs: 1_000,
    alphaDelayMs: 200,
    alphaDurationMs: 500,
    alphaHoldMs: 300,
    alphaRepeatDelayMs: 400,
    lowAlpha: 0.1,
    peakAlpha: 0.7,
    scale: 1,
  };

  it('keeps movement and alpha on their independent seeded delays', () => {
    expect(sampleBreathingMote(breathing, 50)).toEqual({ x: 10, y: 20, alpha: 0 });
    expect(sampleBreathingMote(breathing, 150).alpha).toBe(0);
  });

  it('yoyos its position while holding the alpha peak', () => {
    const frame = sampleBreathingMote(breathing, 800);
    expect(frame.x).toBeGreaterThan(20);
    expect(frame.y).toBeLessThan(10);
    expect(frame.alpha).toBe(0.7);
  });

  it('rests at its low alpha during the repeat delay', () => {
    expect(sampleBreathingMote(breathing, 1_700).alpha).toBe(0.1);
  });
});
