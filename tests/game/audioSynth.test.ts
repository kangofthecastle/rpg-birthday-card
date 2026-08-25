import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MUSIC_KEYS, SFX_KEYS } from '../../src/game/audio';
import type { MusicKey, SfxKey } from '../../src/game/audio';
import { MUSIC_SYNTHS, SFX_SYNTHS } from '../../src/game/audioSynth';

// -----------------------------------------------------------------------
// Structural WebAudio mock (see tests/game/audio.test.ts for the same
// pattern with more commentary). These tests only check that each synth
// definition builds a plausible node graph and behaves — never that it
// "sounds right", per the module's own testing guidance.
// -----------------------------------------------------------------------

class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn((value: number) => {
    this.value = value;
    return this;
  });
  linearRampToValueAtTime = vi.fn((value: number) => {
    this.value = value;
    return this;
  });
  exponentialRampToValueAtTime = vi.fn((value: number) => {
    this.value = value;
    return this;
  });
  cancelScheduledValues = vi.fn(() => this);
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeBiquadFilterNode {
  type = 'lowpass';
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeOscillatorNode {
  type = 'sine';
  frequency = new FakeAudioParam();
  detune = new FakeAudioParam();
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeBufferSourceNode {
  buffer: unknown = null;
  loop = false;
  playbackRate = new FakeAudioParam();
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioBuffer {
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {}
  getChannelData(): Float32Array {
    return new Float32Array(this.length);
  }
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 44100;

  gains: FakeGainNode[] = [];
  oscillators: FakeOscillatorNode[] = [];
  filters: FakeBiquadFilterNode[] = [];
  bufferSources: FakeBufferSourceNode[] = [];

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }

  createOscillator(): FakeOscillatorNode {
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return node;
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    const node = new FakeBiquadFilterNode();
    this.filters.push(node);
    return node;
  }

  createBufferSource(): FakeBufferSourceNode {
    const node = new FakeBufferSourceNode();
    this.bufferSources.push(node);
    return node;
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(channels, length, sampleRate);
  }
}

function createFakeGraph(): { ctx: AudioContext; fakeCtx: FakeAudioContext; output: FakeGainNode } {
  const fakeCtx = new FakeAudioContext();
  const output = fakeCtx.createGain();
  return { ctx: fakeCtx as unknown as AudioContext, fakeCtx, output };
}

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('key registry completeness', () => {
  it('has a synth factory for every declared music key, and no extras', () => {
    expect(Object.keys(MUSIC_SYNTHS).sort()).toEqual([...MUSIC_KEYS].sort());
    for (const key of MUSIC_KEYS) {
      expect(typeof MUSIC_SYNTHS[key]).toBe('function');
    }
  });

  it('has a synth factory for every declared SFX key, and no extras', () => {
    expect(Object.keys(SFX_SYNTHS).sort()).toEqual([...SFX_KEYS].sort());
    for (const key of SFX_KEYS) {
      expect(typeof SFX_SYNTHS[key]).toBe('function');
    }
  });
});

describe('music synth beds', () => {
  it.each(MUSIC_KEYS)('%s builds a node graph and dispose() is safe to call repeatedly', (key: MusicKey) => {
    const { ctx, output } = createFakeGraph();
    const handle = MUSIC_SYNTHS[key](ctx, output as unknown as AudioNode);

    expect(typeof handle.dispose).toBe('function');
    expect(() => handle.dispose()).not.toThrow();
    expect(() => handle.dispose()).not.toThrow(); // idempotent
  });

  it.each(MUSIC_KEYS)('%s creates at least one sound-producing node', (key: MusicKey) => {
    const { ctx, fakeCtx, output } = createFakeGraph();
    const handle = MUSIC_SYNTHS[key](ctx, output as unknown as AudioNode);

    expect(fakeCtx.oscillators.length + fakeCtx.bufferSources.length).toBeGreaterThan(0);
    handle.dispose();
  });

  it('music-home is a warm major-chord pad connected through a lowpass filter', () => {
    const { ctx, fakeCtx, output } = createFakeGraph();
    const handle = MUSIC_SYNTHS['music-home'](ctx, output as unknown as AudioNode);

    expect(fakeCtx.filters).toHaveLength(1);
    expect(fakeCtx.filters[0].type).toBe('lowpass');
    expect(fakeCtx.filters[0].connect).toHaveBeenCalledWith(output);
    // Four chord-tone oscillators plus one slow LFO oscillator.
    expect(fakeCtx.oscillators).toHaveLength(5);
    handle.dispose();
  });

  it.each([
    ['music-home', 4],
    ['music-path', 3],
    ['music-letters', 4],
  ] as const)('%s moves its pad voices to a new chord over time', (key, voiceCount) => {
    vi.useFakeTimers();
    const { ctx, fakeCtx, output } = createFakeGraph();
    const handle = MUSIC_SYNTHS[key](ctx, output as unknown as AudioNode);
    const initialOscillatorCount = fakeCtx.oscillators.length;

    vi.advanceTimersByTime(12_000);
    expect(fakeCtx.oscillators.length).toBeGreaterThanOrEqual(initialOscillatorCount + voiceCount);
    expect(fakeCtx.oscillators.every(
      (oscillator) => oscillator.frequency.exponentialRampToValueAtTime.mock.calls.length === 0,
    )).toBe(true);

    const oscillatorCountAtDispose = fakeCtx.oscillators.length;
    handle.dispose();
    vi.advanceTimersByTime(30_000);
    expect(fakeCtx.oscillators).toHaveLength(oscillatorCountAtDispose);
  });

  it('music-ending begins with harmony, adds melody, and stops scheduling on dispose', () => {
    vi.useFakeTimers();
    const { ctx, fakeCtx, output } = createFakeGraph();
    const handle = MUSIC_SYNTHS['music-ending'](ctx, output as unknown as AudioNode);

    const initialOscillatorCount = fakeCtx.oscillators.length;
    // Four simultaneous chord voices plus the pad's slow filter LFO: never the
    // old single-note opening drone.
    expect(initialOscillatorCount).toBeGreaterThanOrEqual(5);
    expect(new Set(fakeCtx.oscillators.slice(0, 4).map((osc) => osc.frequency.value)).size).toBe(4);
    expect(fakeCtx.gains.some((gain) => gain.gain.value === 0.58)).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(fakeCtx.oscillators.length).toBeGreaterThan(initialOscillatorCount);

    const oscillatorCountAtHalfway = fakeCtx.oscillators.length;
    vi.advanceTimersByTime(15000);
    expect(fakeCtx.oscillators.length).toBeGreaterThan(oscillatorCountAtHalfway);

    const finalOscillatorCount = fakeCtx.oscillators.length;
    handle.dispose();
    vi.advanceTimersByTime(60000);
    // No further layers should be added once disposed.
    expect(fakeCtx.oscillators.length).toBe(finalOscillatorCount);
  });

  it('music-friendone fallback stays sustained instead of scheduling cue-like notes', () => {
    vi.useFakeTimers();
    const { ctx, fakeCtx, output } = createFakeGraph();
    const handle = MUSIC_SYNTHS['music-friendone'](ctx, output as unknown as AudioNode);

    // Three sustained chord voices and the slow filter LFO used by music-path.
    expect(fakeCtx.oscillators).toHaveLength(4);
    expect(fakeCtx.bufferSources).toHaveLength(1);
    expect(fakeCtx.bufferSources[0].loop).toBe(true);

    vi.advanceTimersByTime(7_000);
    expect(fakeCtx.oscillators).toHaveLength(4);

    const countAtDispose = fakeCtx.oscillators.length;
    handle.dispose();
    vi.advanceTimersByTime(30_000);
    expect(fakeCtx.oscillators).toHaveLength(countAtDispose);
  });

  it('music-split schedules sparse tension ticks over time and dispose() halts scheduling', () => {
    vi.useFakeTimers();
    const { ctx, fakeCtx, output } = createFakeGraph();
    const handle = MUSIC_SYNTHS['music-split'](ctx, output as unknown as AudioNode);

    const initialCount = fakeCtx.oscillators.length;
    expect(initialCount).toBeGreaterThan(0); // drone + pulse LFO

    vi.advanceTimersByTime(9000);
    const countAfterTicking = fakeCtx.oscillators.length;
    expect(countAfterTicking).toBeGreaterThan(initialCount);
    expect(fakeCtx.oscillators.some((oscillator) => oscillator.frequency.value === 49)).toBe(true);
    expect(fakeCtx.oscillators[0].frequency.exponentialRampToValueAtTime).not.toHaveBeenCalled();

    handle.dispose();
    vi.advanceTimersByTime(9000);
    expect(fakeCtx.oscillators.length).toBe(countAfterTicking);
  });
});

describe('SFX synth definitions', () => {
  it.each(SFX_KEYS)('%s returns a positive duration and produces a sound-making node', (key: SfxKey) => {
    const { ctx, fakeCtx, output } = createFakeGraph();
    const duration = SFX_SYNTHS[key](ctx, output as unknown as AudioNode, { rate: 1, volume: 1 });

    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThan(0);
    expect(fakeCtx.oscillators.length + fakeCtx.bufferSources.length).toBeGreaterThan(0);
  });

  it('sfx-interact scales its tone frequency with the rate option', () => {
    const { ctx, fakeCtx, output } = createFakeGraph();
    SFX_SYNTHS['sfx-interact'](ctx, output as unknown as AudioNode, { rate: 1, volume: 1 });
    const baseFrequency = fakeCtx.oscillators[0].frequency.value;

    const doubled = createFakeGraph();
    SFX_SYNTHS['sfx-interact'](doubled.ctx, doubled.output as unknown as AudioNode, { rate: 2, volume: 1 });
    const doubledFrequency = doubled.fakeCtx.oscillators[0].frequency.value;

    expect(doubledFrequency).toBeCloseTo(baseFrequency * 2, 5);
  });

  it('sfx-spike-beep is a single caller-controlled beep whose pitch follows rate', () => {
    const { ctx, fakeCtx, output } = createFakeGraph();
    SFX_SYNTHS['sfx-spike-beep'](ctx, output as unknown as AudioNode, { rate: 1.5, volume: 1 });

    expect(fakeCtx.oscillators).toHaveLength(1);
    expect(fakeCtx.oscillators[0].frequency.value).toBeCloseTo(900 * 1.5, 5);
  });

  it('sfx-story-hum quietly hints at the first four pitches of the theme', () => {
    const { ctx, fakeCtx, output } = createFakeGraph();
    SFX_SYNTHS['sfx-story-hum'](ctx, output as unknown as AudioNode, { rate: 1, volume: 1 });

    expect(fakeCtx.oscillators).toHaveLength(4);
    expect(fakeCtx.oscillators.map((oscillator) => oscillator.frequency.value)).toEqual([
      220,
      196,
      174.61,
      196,
    ]);
  });

  it('sfx-shot is a layered gunshot: a low sine thump under noise-burst cracks', () => {
    const { ctx, fakeCtx, output } = createFakeGraph();
    SFX_SYNTHS['sfx-shot'](ctx, output as unknown as AudioNode, { rate: 1, volume: 1 });

    // A low pitch-dropping sine "thump"...
    expect(fakeCtx.oscillators).toHaveLength(1);
    expect(fakeCtx.oscillators[0].type).toBe('sine');
    // ...plus layered filtered noise bursts (crack + body + click) for punch.
    expect(fakeCtx.bufferSources.length).toBeGreaterThanOrEqual(2);
  });
});
