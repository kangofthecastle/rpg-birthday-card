import { describe, expect, it } from 'vitest';
import {
  VIOLIN_SAMPLE_ANCHORS,
  VIOLIN_SAMPLE_URLS,
  selectViolinSample,
} from '../../src/game/violinSamples';

describe('violin sample selection', () => {
  it('uses the native low-register recording for the Bb3-A3 turn', () => {
    const a3 = selectViolinSample(220, 450);
    const bb3 = selectViolinSample(233.08, 450);

    expect(a3.anchorId).toBe('a3');
    expect(bb3.anchorId).toBe('a3');
    expect(a3.articulation).toBe('arco');
    expect(a3.recordedFrequency * a3.playbackRate).toBeCloseTo(220, 5);
    expect(bb3.recordedFrequency * bb3.playbackRate).toBeCloseTo(233.08, 5);
    expect(a3.url).toBe('/assets/audio/violin/arco-a3.ogg');
  });

  it('chooses and tunes the nearest anchor outside the low-register override', () => {
    const fs4 = selectViolinSample(369.99, 450);

    expect(fs4.anchorId).toBe('g4');
    expect(Math.abs(12 * Math.log2(fs4.playbackRate))).toBeLessThanOrEqual(2.01);
    expect(fs4.recordedFrequency * fs4.playbackRate).toBeCloseTo(369.99, 5);
  });

  it('uses smooth arco for short scored notes as well as longer notes', () => {
    expect(selectViolinSample(440, 150).articulation).toBe('arco');
    expect(selectViolinSample(440, 200).articulation).toBe('arco');
    expect(selectViolinSample(440, 299).articulation).toBe('arco');
    expect(selectViolinSample(440, 300).articulation).toBe('arco');
    expect(selectViolinSample(440, 450).articulation).toBe('arco');
    expect(selectViolinSample(440, 1800).articulation).toBe('arco');
  });

  it('preloads only the smooth arco URL for every anchor', () => {
    expect(VIOLIN_SAMPLE_ANCHORS.map((anchor) => anchor.id)).toEqual([
      'a3',
      'c4',
      'e4',
      'g4',
      'a4',
      'c5',
    ]);
    expect(VIOLIN_SAMPLE_URLS).toHaveLength(VIOLIN_SAMPLE_ANCHORS.length);
    expect(new Set(VIOLIN_SAMPLE_URLS).size).toBe(VIOLIN_SAMPLE_URLS.length);
  });
});
