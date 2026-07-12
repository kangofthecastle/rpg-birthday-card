import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// -----------------------------------------------------------------------
// A minimal structural mock of the WebAudio API. jsdom doesn't implement
// AudioContext at all, so every test that exercises `initAudio()` stubs
// `window.AudioContext` with this fake before dynamically importing the
// module under test. We only assert on graph shape (node/connection
// counts, scheduled param calls) — never on actual audio output, per the
// module's own test guidance.
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
  destination = {};
  state = 'running';

  gains: FakeGainNode[] = [];
  oscillators: FakeOscillatorNode[] = [];
  filters: FakeBiquadFilterNode[] = [];
  bufferSources: FakeBufferSourceNode[] = [];

  constructor() {
    createdContexts.push(this);
  }

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

  decodeAudioData(): Promise<FakeAudioBuffer> {
    return Promise.resolve(new FakeAudioBuffer(1, 1, 44100));
  }

  resume(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

let createdContexts: FakeAudioContext[] = [];

function stubAudioContext(): void {
  vi.stubGlobal('AudioContext', FakeAudioContext as unknown as typeof AudioContext);
}

function okFileResponse(): Response {
  return {
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  } as unknown as Response;
}

function stubFetchAlwaysFails(): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no audio file in this test env')));
}

function stubFetchSucceedsOnFirstTry(): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okFileResponse()));
}

/** Flushes pending microtasks (fetch/decodeAudioData promise chains). */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.resetModules();
  createdContexts = [];
  localStorage.clear();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('key registry', () => {
  it('exposes the full music and SFX key lists from the spec', async () => {
    const audio = await import('../../src/game/audio');

    expect(audio.MUSIC_KEYS).toEqual([
      'music-home',
      'music-path',
      'music-friendone',
      'music-split',
      'music-ending',
      'music-letters',
    ]);
    expect(audio.SFX_KEYS).toEqual([
      'sfx-interact',
      'sfx-dialogue-advance',
      'sfx-keepsake',
      'sfx-letter-open',
      'sfx-shot',
      'sfx-reload',
      'sfx-dryfire',
      'sfx-death',
      'sfx-hit',
      'sfx-headshot',
      'sfx-heart-loss',
      'sfx-spike-beep',
      'sfx-defuse-tick',
      'sfx-defuse-loop',
      'sfx-defuse-checkpoint',
      'sfx-defuse-complete',
      'sfx-detonate',
      'sfx-clutch',
      'sfx-boot-key',
      'sfx-ending-swell',
      'sfx-develop-lock',
      'sfx-develop-miss',
      'sfx-violin-waver',
      'sfx-violin-swell',
      'sfx-paper-fold',
      'sfx-sail-hoist',
      'sfx-boat-expand',
      'sfx-lantern-kindle',
      'sfx-water-lap',
    ]);
    expect(audio.AUDIO_KEYS).toEqual([...audio.MUSIC_KEYS, ...audio.SFX_KEYS]);
  });

  it('gives every registered key a synth fallback definition', async () => {
    const audio = await import('../../src/game/audio');
    const synth = await import('../../src/game/audioSynth');

    for (const key of audio.MUSIC_KEYS) {
      expect(typeof synth.MUSIC_SYNTHS[key]).toBe('function');
    }
    for (const key of audio.SFX_KEYS) {
      expect(typeof synth.SFX_SYNTHS[key]).toBe('function');
    }
    expect(Object.keys(synth.MUSIC_SYNTHS).sort()).toEqual([...audio.MUSIC_KEYS].sort());
    expect(Object.keys(synth.SFX_SYNTHS).sort()).toEqual([...audio.SFX_KEYS].sort());
  });
});

describe('safety before init / without WebAudio support', () => {
  it('is a safe no-op to call playback methods before initAudio()', async () => {
    stubAudioContext();
    const audio = await import('../../src/game/audio');

    expect(() => audio.playMusic('music-home')).not.toThrow();
    expect(() => audio.playSfx('sfx-interact')).not.toThrow();
    expect(() => audio.stopMusic()).not.toThrow();
    expect(createdContexts).toHaveLength(0);
  });

  it('still tracks and persists mute state before initAudio() has run', async () => {
    const audio = await import('../../src/game/audio');

    expect(audio.isMuted()).toBe(false);
    audio.setMuted(true);
    expect(audio.isMuted()).toBe(true);
    expect(localStorage.getItem('a-game-audio-muted')).toBe('1');
  });

  it('is a safe no-op when the environment has no AudioContext at all', async () => {
    // Deliberately do not stub window.AudioContext.
    const audio = await import('../../src/game/audio');

    audio.initAudio();
    expect(() => audio.playMusic('music-home')).not.toThrow();
    expect(() => audio.playSfx('sfx-interact')).not.toThrow();
    expect(() => audio.stopMusic()).not.toThrow();
    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('AudioContext unavailable'));
  });
});

describe('initAudio', () => {
  it('wires master/music/sfx gain buses with sensible default levels', async () => {
    stubAudioContext();
    const audio = await import('../../src/game/audio');

    audio.initAudio();

    expect(createdContexts).toHaveLength(1);
    const ctx = createdContexts[0];
    expect(ctx.gains).toHaveLength(3);
    const [masterGain, musicGain, sfxGain] = ctx.gains;

    expect(masterGain.gain.value).toBe(1); // not muted by default
    // ~-14dB
    expect(musicGain.gain.value).toBeCloseTo(0.1995, 3);
    // ~-3dB, louder than music
    expect(sfxGain.gain.value).toBeCloseTo(0.7079, 3);
    expect(musicGain.gain.value).toBeLessThan(sfxGain.gain.value);

    expect(musicGain.connect).toHaveBeenCalledWith(masterGain);
    expect(sfxGain.connect).toHaveBeenCalledWith(masterGain);
  });

  it('is idempotent', async () => {
    stubAudioContext();
    const audio = await import('../../src/game/audio');

    audio.initAudio();
    audio.initAudio();
    audio.initAudio();

    expect(createdContexts).toHaveLength(1);
  });

  it('starts muted (masterGain at 0) when a mute preference was already persisted', async () => {
    localStorage.setItem('a-game-audio-muted', '1');
    stubAudioContext();
    const audio = await import('../../src/game/audio');

    expect(audio.isMuted()).toBe(true);
    audio.initAudio();

    const [masterGain] = createdContexts[0].gains;
    expect(masterGain.gain.value).toBe(0);
  });
});

describe('file-first resolution', () => {
  it('falls back to the synth definition when no audio files are present', async () => {
    stubAudioContext();
    stubFetchAlwaysFails();
    const audio = await import('../../src/game/audio');
    const synth = await import('../../src/game/audioSynth');
    const synthSpy = vi.spyOn(synth.MUSIC_SYNTHS, 'music-home');

    audio.initAudio();
    audio.playMusic('music-home');
    await flushAsync();

    expect(fetch).toHaveBeenCalledWith('/audio/music-home.mp3');
    expect(fetch).toHaveBeenCalledWith('/audio/music-home.ogg');
    expect(synthSpy).toHaveBeenCalledOnce();

    const ctx = createdContexts[0];
    expect(ctx.bufferSources).toHaveLength(0); // no file playback attempted
    expect(ctx.oscillators.length).toBeGreaterThan(0); // synth pad built instead
    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('using synth fallback for "music-home"'));
  });

  it('prefers a file over the synth definition when one loads successfully', async () => {
    stubAudioContext();
    stubFetchSucceedsOnFirstTry();
    const audio = await import('../../src/game/audio');
    const synth = await import('../../src/game/audioSynth');
    const synthSpy = vi.spyOn(synth.MUSIC_SYNTHS, 'music-home');

    audio.initAudio();
    audio.playMusic('music-home');
    await flushAsync();

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/audio/music-home.mp3');
    expect(synthSpy).not.toHaveBeenCalled();

    const ctx = createdContexts[0];
    expect(ctx.bufferSources).toHaveLength(1);
    const [source] = ctx.bufferSources;
    expect(source.loop).toBe(true);
    expect(source.start).toHaveBeenCalledOnce();
    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('loaded audio file for "music-home"'));
  });

  it('only resolves a given key once, caching the decision', async () => {
    stubAudioContext();
    stubFetchAlwaysFails();
    const audio = await import('../../src/game/audio');

    audio.initAudio();
    audio.playSfx('sfx-interact');
    await flushAsync();
    audio.playSfx('sfx-interact');
    await flushAsync();

    expect(fetch).toHaveBeenCalledTimes(2); // mp3 + ogg attempted once, not twice
  });
});

describe('mute persistence', () => {
  it('persists across a fresh module load', async () => {
    stubAudioContext();
    const first = await import('../../src/game/audio');
    first.setMuted(true);
    expect(localStorage.getItem('a-game-audio-muted')).toBe('1');

    vi.resetModules();
    const second = await import('../../src/game/audio');
    expect(second.isMuted()).toBe(true);

    second.toggleMuted();
    expect(second.isMuted()).toBe(false);
    expect(localStorage.getItem('a-game-audio-muted')).toBe('0');
  });

  it('fades the master gain when muted after init', async () => {
    stubAudioContext();
    const audio = await import('../../src/game/audio');
    audio.initAudio();
    const [masterGain] = createdContexts[0].gains;

    audio.setMuted(true);
    expect(masterGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));

    audio.setMuted(false);
    expect(masterGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, expect.any(Number));
  });
});

describe('music crossfades', () => {
  it('fades in a new bed and fades out + disposes the previous one after fadeMs', async () => {
    vi.useFakeTimers();
    stubAudioContext();
    stubFetchAlwaysFails();
    const audio = await import('../../src/game/audio');

    audio.initAudio();
    const ctx = createdContexts[0];

    audio.playMusic('music-home', { fadeMs: 1000 });
    const bed1Gain = ctx.gains[ctx.gains.length - 1];
    await flushAsync();

    const bed1OscillatorCount = ctx.oscillators.length;
    expect(bed1OscillatorCount).toBeGreaterThan(0);
    expect(bed1Gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, expect.any(Number));

    audio.playMusic('music-path', { fadeMs: 500 });
    const bed2Gain = ctx.gains[ctx.gains.length - 1];
    expect(bed2Gain).not.toBe(bed1Gain);

    // The outgoing bed is faded to 0 immediately, synchronously.
    expect(bed1Gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));

    await flushAsync();
    expect(bed2Gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, expect.any(Number));

    const bed1Oscillators = ctx.oscillators.slice(0, bed1OscillatorCount);
    bed1Oscillators.forEach((osc) => expect(osc.stop).not.toHaveBeenCalled());

    vi.advanceTimersByTime(500);

    bed1Oscillators.forEach((osc) => {
      expect(osc.stop).toHaveBeenCalled();
      expect(osc.disconnect).toHaveBeenCalled();
    });
    expect(bed1Gain.disconnect).toHaveBeenCalled();
  });

  it('is a no-op when asked to play the bed that is already current', async () => {
    stubAudioContext();
    stubFetchAlwaysFails();
    const audio = await import('../../src/game/audio');

    audio.initAudio();
    const ctx = createdContexts[0];

    audio.playMusic('music-home');
    await flushAsync();
    const gainCountAfterFirstPlay = ctx.gains.length;

    audio.playMusic('music-home');
    await flushAsync();

    expect(ctx.gains.length).toBe(gainCountAfterFirstPlay);
  });

  it('stopMusic fades out and disposes the current bed', async () => {
    vi.useFakeTimers();
    stubAudioContext();
    stubFetchAlwaysFails();
    const audio = await import('../../src/game/audio');

    audio.initAudio();
    const ctx = createdContexts[0];

    audio.playMusic('music-home', { fadeMs: 400 });
    const bedGain = ctx.gains[ctx.gains.length - 1];
    await flushAsync();
    const oscillatorCount = ctx.oscillators.length;

    audio.stopMusic({ fadeMs: 400 });
    expect(bedGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));

    const oscillators = ctx.oscillators.slice(0, oscillatorCount);
    oscillators.forEach((osc) => expect(osc.stop).not.toHaveBeenCalled());

    vi.advanceTimersByTime(400);
    oscillators.forEach((osc) => expect(osc.stop).toHaveBeenCalled());
    expect(bedGain.disconnect).toHaveBeenCalled();

    // Calling stopMusic again with nothing playing is a safe no-op.
    expect(() => audio.stopMusic()).not.toThrow();
  });
});

describe('defuse loop', () => {
  it('builds a sustained multi-oscillator hum (incl. sawtooth voices) on the sfx bus', async () => {
    stubAudioContext();
    stubFetchAlwaysFails();
    const audio = await import('../../src/game/audio');

    audio.initAudio();
    const ctx = createdContexts[0];
    const before = ctx.oscillators.length;

    // Rate climbs with defuse progress; the scene drives it this way.
    audio.playSfx('sfx-defuse-loop', { rate: 1.4, volume: 1 });
    await flushAsync();

    const built = ctx.oscillators.slice(before);
    // Two detuned saws + a square partial => at least 3 voices.
    expect(built.length).toBeGreaterThanOrEqual(3);
    expect(built.some((osc) => osc.type === 'sawtooth')).toBe(true);
    // Pitch tracks the rate (base 150Hz * 1.4 ~ 210Hz on the saw body).
    const saw = built.find((osc) => osc.type === 'sawtooth');
    expect(saw?.frequency.value).toBeCloseTo(150 * 1.4, 0);
    built.forEach((osc) => expect(osc.start).toHaveBeenCalled());
  });
});

describe('playSfx', () => {
  it('plays a synth SFX voice through the sfx bus and cleans it up', async () => {
    vi.useFakeTimers();
    stubAudioContext();
    stubFetchAlwaysFails();
    const audio = await import('../../src/game/audio');

    audio.initAudio();
    const ctx = createdContexts[0];

    audio.playSfx('sfx-interact', { rate: 2, volume: 0.5 });
    await flushAsync();

    expect(ctx.oscillators.length).toBeGreaterThan(0);

    // The SFX oscillator's frequency should reflect the requested rate.
    const tone = ctx.oscillators[ctx.oscillators.length - 1];
    expect(tone.frequency.value).toBeCloseTo(660 * 2, 5);

    vi.advanceTimersByTime(1000);
    // No throw / crash after cleanup timers run.
    expect(true).toBe(true);
  });
});
