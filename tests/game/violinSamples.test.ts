import { describe, expect, it } from 'vitest';
import {
  VIOLIN_SAMPLE_ANCHORS,
  VIOLIN_SAMPLE_URLS,
  selectViolinSample,
} from '../../src/game/violinSamples';

describe('violin sample selection', () => {
  it('keeps exact anchor pitches at their natural playback rate', () => {
    const sample = selectViolinSample(220, 450);
    expect(sample.anchorId).toBe('a3');
    expect(sample.articulation).toBe('arco');
    expect(sample.playbackRate).toBeCloseTo(1, 6);
    expect(sample.url).toBe('/assets/audio/violin/arco-a3.ogg');
  });

  it('chooses the nearest anchor while limiting transposition to two semitones', () => {
    const bb3 = selectViolinSample(233.08, 450);
    const fs4 = selectViolinSample(369.99, 450);

    expect(bb3.anchorId).toBe('a3');
    expect(fs4.anchorId).toBe('g4');
    expect(Math.abs(12 * Math.log2(bb3.playbackRate))).toBeLessThanOrEqual(2.01);
    expect(Math.abs(12 * Math.log2(fs4.playbackRate))).toBeLessThanOrEqual(2.01);
  });

  it('uses spiccato for fast notes and sustained arco for longer notes', () => {
    expect(selectViolinSample(440, 150).articulation).toBe('spiccato');
    expect(selectViolinSample(440, 200).articulation).toBe('spiccato');
    expect(selectViolinSample(440, 299).articulation).toBe('spiccato');
    expect(selectViolinSample(440, 300).articulation).toBe('arco');
    expect(selectViolinSample(440, 450).articulation).toBe('arco');
    expect(selectViolinSample(440, 1800).articulation).toBe('arco');
  });

  it('publishes one arco and one spiccato URL for every anchor', () => {
    expect(VIOLIN_SAMPLE_ANCHORS.map((anchor) => anchor.id)).toEqual([
      'a3',
      'c4',
      'e4',
      'g4',
      'a4',
      'c5',
    ]);
    expect(VIOLIN_SAMPLE_URLS).toHaveLength(VIOLIN_SAMPLE_ANCHORS.length * 2);
    expect(new Set(VIOLIN_SAMPLE_URLS).size).toBe(VIOLIN_SAMPLE_URLS.length);
  });
});
