// Synthesized WebAudio node graphs for every music bed and SFX key.
//
// This module is deliberately kept separate from `audio.ts` (the manager)
// so the "how does it sound" tuning lives in one focused place. Nothing
// here talks to files, localStorage, or the DOM directly — every function
// takes an already-created AudioContext plus a destination node to connect
// into, and returns either a disposer (music, which loops until told to
// stop) or an approximate duration in milliseconds (SFX, which are one-shot
// envelopes the caller can schedule cleanup around).
//
// To retune a sound: find its section below (search the key, e.g.
// "music-home" or "sfx-shot") and adjust the named constants at the top of
// that section. Shared building blocks (`playTone`, `playNoiseBurst`,
// `createPadBed`, ...) are declared once near the top.

import type { MusicKey, SfxKey } from './audio';

export interface SynthMusicHandle {
  /** Stop and disconnect every node this bed created, including anything
   * scheduled to start later (e.g. the ending bed's later layers). Safe to
   * call more than once. */
  dispose(): void;
}

export type MusicSynthFactory = (ctx: AudioContext, output: AudioNode) => SynthMusicHandle;

export interface SfxSynthOptions {
  rate: number;
  volume: number;
}

/** Returns an approximate duration in milliseconds so the caller can clean
 * up the voice bus once the sound has finished. */
export type SfxSynthFactory = (ctx: AudioContext, output: AudioNode, options: SfxSynthOptions) => number;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

interface ToneOptions {
  type?: OscillatorType;
  frequency: number;
  /** If set, the oscillator pitch glides from `frequency` to this value
   * across the tone's full duration (used for the shot "pew" and hit
   * "thud" pitch drops). */
  endFrequency?: number;
  gain?: number;
  attackMs?: number;
  holdMs?: number;
  releaseMs?: number;
  startAt?: number;
}

/** Plays a single enveloped oscillator tone. Returns the absolute
 * AudioContext time at which the tone finishes ringing out, so callers can
 * add up total one-shot duration. */
function playTone(ctx: AudioContext, output: AudioNode, options: ToneOptions): number {
  const {
    type = 'sine',
    frequency,
    endFrequency,
    gain = 0.4,
    attackMs = 4,
    holdMs = 40,
    releaseMs = 90,
    startAt = ctx.currentTime,
  } = options;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(frequency, 1), startAt);

  const attackEnd = startAt + attackMs / 1000;
  const holdEnd = attackEnd + holdMs / 1000;
  const releaseEnd = holdEnd + releaseMs / 1000;

  if (endFrequency !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFrequency, 1), releaseEnd);
  }

  const envelope = ctx.createGain();
  envelope.gain.value = 0;
  osc.connect(envelope);
  envelope.connect(output);

  envelope.gain.setValueAtTime(0, startAt);
  envelope.gain.linearRampToValueAtTime(gain, attackEnd);
  envelope.gain.setValueAtTime(gain, holdEnd);
  envelope.gain.linearRampToValueAtTime(0.0001, releaseEnd);

  osc.start(startAt);
  osc.stop(releaseEnd + 0.02);
  osc.onended = () => {
    osc.disconnect();
    envelope.disconnect();
  };

  return releaseEnd;
}

interface NoiseBurstOptions {
  seconds: number;
  filterType: BiquadFilterType;
  filterFreq: number;
  filterQ?: number;
  gain: number;
  attackMs: number;
  releaseMs: number;
  startAt?: number;
}

/** Plays a short filtered noise burst (used for clicks, cracks, and
 * paper-ish texture layered under some SFX). */
function playNoiseBurst(ctx: AudioContext, output: AudioNode, options: NoiseBurstOptions): void {
  const {
    seconds,
    filterType,
    filterFreq,
    filterQ,
    gain,
    attackMs,
    releaseMs,
    startAt = ctx.currentTime,
  } = options;

  const buffer = createNoiseBuffer(ctx, seconds);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  if (filterQ !== undefined) {
    filter.Q.value = filterQ;
  }

  const envelope = ctx.createGain();
  envelope.gain.value = 0;

  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(output);

  const attackEnd = startAt + attackMs / 1000;
  const releaseEnd = attackEnd + releaseMs / 1000;
  envelope.gain.setValueAtTime(0, startAt);
  envelope.gain.linearRampToValueAtTime(gain, attackEnd);
  envelope.gain.linearRampToValueAtTime(0.0001, releaseEnd);

  source.start(startAt);
  source.stop(releaseEnd + 0.02);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    envelope.disconnect();
  };
}

// ---------------------------------------------------------------------------
// Music beds
// ---------------------------------------------------------------------------

interface PadPreset {
  /** Chord tone frequencies (Hz), low to high. */
  chordFrequencies: number[];
  waveform: OscillatorType;
  filterType: BiquadFilterType;
  filterFrequency: number;
  filterQ: number;
  voiceGain: number;
  /** Seconds for each voice to swell in; later voices in the chord enter
   * slightly staggered after this. */
  attackSeconds: number;
  detuneSpreadCents: number;
  /** Slow filter-cutoff LFO for gentle movement. Set lfoRateHz to 0 to
   * disable. */
  lfoRateHz: number;
  lfoDepthHz: number;
  /** Adds a very quiet filtered noise wash for an "airy" quality. */
  addAiryNoise?: boolean;
}

function createPadBed(ctx: AudioContext, output: AudioNode, preset: PadPreset): SynthMusicHandle {
  const disposers: Array<() => void> = [];

  const filter = ctx.createBiquadFilter();
  filter.type = preset.filterType;
  filter.frequency.value = preset.filterFrequency;
  filter.Q.value = preset.filterQ;
  filter.connect(output);
  disposers.push(() => filter.disconnect());

  const startAt = ctx.currentTime;

  preset.chordFrequencies.forEach((frequency, index) => {
    const osc = ctx.createOscillator();
    osc.type = preset.waveform;
    osc.frequency.value = frequency;
    osc.detune.value = (index - (preset.chordFrequencies.length - 1) / 2) * preset.detuneSpreadCents;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    osc.connect(voiceGain);
    voiceGain.connect(filter);

    voiceGain.gain.setValueAtTime(0, startAt);
    voiceGain.gain.linearRampToValueAtTime(
      preset.voiceGain,
      startAt + preset.attackSeconds + index * 0.35,
    );

    osc.start(startAt);
    disposers.push(() => {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
      osc.disconnect();
      voiceGain.disconnect();
    });
  });

  if (preset.lfoRateHz > 0) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = preset.lfoRateHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = preset.lfoDepthHz;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start(startAt);
    disposers.push(() => {
      try {
        lfo.stop();
      } catch {
        // already stopped
      }
      lfo.disconnect();
      lfoGain.disconnect();
    });
  }

  if (preset.addAiryNoise) {
    const buffer = createNoiseBuffer(ctx, 4);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 2000;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.015;
    source.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(filter);
    source.start(startAt);
    disposers.push(() => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      source.disconnect();
      noiseFilter.disconnect();
      noiseGain.disconnect();
    });
  }

  return {
    dispose: () => disposers.forEach((dispose) => dispose()),
  };
}

// music-home: warm major pad (C3-E3-G3-C4), slow filter movement.
const HOME_PAD_PRESET: PadPreset = {
  chordFrequencies: [130.81, 164.81, 196.0, 261.63],
  waveform: 'triangle',
  filterType: 'lowpass',
  filterFrequency: 1400,
  filterQ: 0.6,
  voiceGain: 0.09,
  attackSeconds: 2.5,
  detuneSpreadCents: 5,
  lfoRateHz: 0.06,
  lfoDepthHz: 250,
};

// music-letters: the same chord as home, softer and mellower — sine
// voices, lower level, gentler filter movement, for the post-ending
// letters screen.
const LETTERS_PAD_PRESET: PadPreset = {
  chordFrequencies: [130.81, 164.81, 196.0, 261.63],
  waveform: 'sine',
  filterType: 'lowpass',
  filterFrequency: 1000,
  filterQ: 0.5,
  voiceGain: 0.06,
  attackSeconds: 3.5,
  detuneSpreadCents: 3,
  lfoRateHz: 0.04,
  lfoDepthHz: 150,
};

// music-path: airy open fifths (no third), higher register, brighter
// filter, plus a whisper of high-passed noise for outdoor "air".
const PATH_PAD_PRESET: PadPreset = {
  chordFrequencies: [196.0, 293.66, 392.0],
  waveform: 'sine',
  filterType: 'lowpass',
  filterFrequency: 3000,
  filterQ: 0.4,
  voiceGain: 0.07,
  attackSeconds: 2,
  detuneSpreadCents: 6,
  lfoRateHz: 0.08,
  lfoDepthHz: 400,
  addAiryNoise: true,
};

function createHomeBed(ctx: AudioContext, output: AudioNode): SynthMusicHandle {
  return createPadBed(ctx, output, HOME_PAD_PRESET);
}

function createLettersBed(ctx: AudioContext, output: AudioNode): SynthMusicHandle {
  return createPadBed(ctx, output, LETTERS_PAD_PRESET);
}

function createPathBed(ctx: AudioContext, output: AudioNode): SynthMusicHandle {
  return createPadBed(ctx, output, PATH_PAD_PRESET);
}

// music-friendone: watery soft pluck loop — randomized pentatonic plucks with a
// quiet octave-up shimmer partner, through a resonant lowpass filter.
const FRIEND_ONE_PENTATONIC_HZ = [392.0, 440.0, 523.25, 587.33, 659.25];
const FRIEND_ONE_PLUCK_MIN_GAP_MS = 1200;
const FRIEND_ONE_PLUCK_MAX_GAP_MS = 2800;

function createFriendOneBed(ctx: AudioContext, output: AudioNode): SynthMusicHandle {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  filter.Q.value = 1.2;
  filter.connect(output);

  let disposed = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const activeVoiceCleanups = new Set<() => void>();

  const playPluck = (frequency: number) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = frequency * 2;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0;

    osc.connect(voiceGain);
    shimmer.connect(shimmerGain);
    voiceGain.connect(filter);
    shimmerGain.connect(filter);

    const start = ctx.currentTime;
    voiceGain.gain.setValueAtTime(0, start);
    voiceGain.gain.linearRampToValueAtTime(0.1, start + 0.02);
    voiceGain.gain.linearRampToValueAtTime(0.0001, start + 1.4);
    shimmerGain.gain.setValueAtTime(0, start);
    shimmerGain.gain.linearRampToValueAtTime(0.02, start + 0.02);
    shimmerGain.gain.linearRampToValueAtTime(0.0001, start + 1.0);

    osc.start(start);
    shimmer.start(start);
    osc.stop(start + 1.5);
    shimmer.stop(start + 1.1);

    const cleanup = () => {
      osc.disconnect();
      shimmer.disconnect();
      voiceGain.disconnect();
      shimmerGain.disconnect();
      activeVoiceCleanups.delete(cleanup);
    };
    osc.onended = cleanup;
    activeVoiceCleanups.add(cleanup);
  };

  const scheduleNext = () => {
    if (disposed) {
      return;
    }
    const frequency = FRIEND_ONE_PENTATONIC_HZ[Math.floor(Math.random() * FRIEND_ONE_PENTATONIC_HZ.length)];
    playPluck(frequency);
    const gapMs = FRIEND_ONE_PLUCK_MIN_GAP_MS + Math.random() * (FRIEND_ONE_PLUCK_MAX_GAP_MS - FRIEND_ONE_PLUCK_MIN_GAP_MS);
    timeoutId = setTimeout(scheduleNext, gapMs);
  };

  scheduleNext();

  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      filter.disconnect();
      activeVoiceCleanups.forEach((cleanup) => cleanup());
    },
  };
}

// music-split: low tense pulse, sparse — a soft sub-bass drone that
// breathes in and out, plus rare dissonant high tension ticks.
const SPLIT_DRONE_HZ = 55; // A1
const SPLIT_PULSE_HZ = 0.4; // ~2.5s breathing cycle
const SPLIT_TENSION_GAP_MS = [4000, 5200, 6800, 8000];

function createSplitBed(ctx: AudioContext, output: AudioNode): SynthMusicHandle {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  filter.connect(output);

  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = SPLIT_DRONE_HZ;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  drone.connect(droneGain);
  droneGain.connect(filter);

  const start = ctx.currentTime;
  droneGain.gain.setValueAtTime(0, start);
  droneGain.gain.linearRampToValueAtTime(0.1, start + 1.5);
  drone.start(start);

  const pulse = ctx.createOscillator();
  pulse.type = 'sine';
  pulse.frequency.value = SPLIT_PULSE_HZ;
  const pulseDepth = ctx.createGain();
  pulseDepth.gain.value = 0.04;
  pulse.connect(pulseDepth);
  pulseDepth.connect(droneGain.gain);
  pulse.start(start);

  let disposed = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const activeVoiceCleanups = new Set<() => void>();

  const playTensionTick = () => {
    // A sparse, quiet dissonant tick a tritone above the drone register.
    const frequency = SPLIT_DRONE_HZ * 2 * Math.pow(2, 6 / 12);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(filter);

    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.03, t + 0.05);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.9);
    osc.start(t);
    osc.stop(t + 1);

    const cleanup = () => {
      osc.disconnect();
      gain.disconnect();
      activeVoiceCleanups.delete(cleanup);
    };
    osc.onended = cleanup;
    activeVoiceCleanups.add(cleanup);
  };

  const scheduleTensionTick = () => {
    if (disposed) {
      return;
    }
    playTensionTick();
    const gapMs = SPLIT_TENSION_GAP_MS[Math.floor(Math.random() * SPLIT_TENSION_GAP_MS.length)];
    timeoutId = setTimeout(scheduleTensionTick, gapMs);
  };

  scheduleTensionTick();

  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      try {
        drone.stop();
      } catch {
        // already stopped
      }
      try {
        pulse.stop();
      } catch {
        // already stopped
      }
      drone.disconnect();
      droneGain.disconnect();
      pulse.disconnect();
      pulseDepth.disconnect();
      filter.disconnect();
      activeVoiceCleanups.forEach((cleanup) => cleanup());
    },
  };
}

// music-ending: huge slow swelling pad that builds new layers over roughly
// 20 seconds — root, fifth, octave, third, and a high shimmer, each with
// its own long attack.
interface EndingLayer {
  frequency: number;
  delayMs: number;
  attackSeconds: number;
  gain: number;
  waveform: OscillatorType;
}

const ENDING_LAYERS: EndingLayer[] = [
  { frequency: 130.81, delayMs: 0, attackSeconds: 6, gain: 0.1, waveform: 'sine' }, // C3 root
  { frequency: 196.0, delayMs: 5000, attackSeconds: 6, gain: 0.08, waveform: 'triangle' }, // G3 fifth
  { frequency: 261.63, delayMs: 10000, attackSeconds: 7, gain: 0.07, waveform: 'sine' }, // C4 octave
  { frequency: 329.63, delayMs: 15000, attackSeconds: 8, gain: 0.06, waveform: 'triangle' }, // E4 third
  { frequency: 523.25, delayMs: 20000, attackSeconds: 8, gain: 0.045, waveform: 'sine' }, // C5 shimmer
];

function createEndingBed(ctx: AudioContext, output: AudioNode): SynthMusicHandle {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2200;
  filter.connect(output);

  let disposed = false;
  const timeoutIds: Array<ReturnType<typeof setTimeout>> = [];
  const disposers: Array<() => void> = [() => filter.disconnect()];

  const addLayer = (layer: EndingLayer) => {
    if (disposed) {
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = layer.waveform;
    osc.frequency.value = layer.frequency;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(filter);

    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(layer.gain, t + layer.attackSeconds);
    osc.start(t);

    disposers.push(() => {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
      osc.disconnect();
      gain.disconnect();
    });
  };

  ENDING_LAYERS.forEach((layer) => {
    if (layer.delayMs === 0) {
      addLayer(layer);
    } else {
      timeoutIds.push(setTimeout(() => addLayer(layer), layer.delayMs));
    }
  });

  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      timeoutIds.forEach((id) => clearTimeout(id));
      disposers.forEach((dispose) => dispose());
    },
  };
}

export const MUSIC_SYNTHS: Record<MusicKey, MusicSynthFactory> = {
  'music-home': createHomeBed,
  'music-path': createPathBed,
  'music-friendone': createFriendOneBed,
  'music-split': createSplitBed,
  'music-ending': createEndingBed,
  'music-letters': createLettersBed,
};

// ---------------------------------------------------------------------------
// SFX
// ---------------------------------------------------------------------------

function sfxInteract(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  const end = playTone(ctx, output, {
    type: 'sine',
    frequency: 660 * rate,
    gain: 0.35 * volume,
    attackMs: 3,
    holdMs: 20,
    releaseMs: 70,
    startAt: start,
  });
  return (end - start) * 1000;
}

function sfxDialogueAdvance(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  const end = playTone(ctx, output, {
    type: 'triangle',
    frequency: 880 * rate,
    gain: 0.25 * volume,
    attackMs: 2,
    holdMs: 10,
    releaseMs: 40,
    startAt: start,
  });
  return (end - start) * 1000;
}

function sfxKeepsake(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // Sweet ascending chime: C5-E5-G5.
  const start = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99];
  let latestEnd = start;
  notes.forEach((frequency, index) => {
    const noteStart = start + index * 0.09;
    const end = playTone(ctx, output, {
      type: 'sine',
      frequency: frequency * rate,
      gain: 0.3 * volume,
      attackMs: 4,
      holdMs: 60,
      releaseMs: 220,
      startAt: noteStart,
    });
    latestEnd = Math.max(latestEnd, end);
  });
  return (latestEnd - start) * 1000;
}

function sfxLetterOpen(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.4,
    filterType: 'highpass',
    filterFreq: 1500,
    gain: 0.06 * volume,
    attackMs: 10,
    releaseMs: 180,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'sine',
    frequency: 587.33 * rate,
    gain: 0.2 * volume,
    attackMs: 20,
    holdMs: 60,
    releaseMs: 260,
    startAt: start + 0.05,
  });
  return (end - start) * 1000;
}

function sfxShot(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // Soft "pew" — a gentle sine pitch drop, deliberately not harsh.
  const start = ctx.currentTime;
  const end = playTone(ctx, output, {
    type: 'sine',
    frequency: 720 * rate,
    endFrequency: 220 * rate,
    gain: 0.3 * volume,
    attackMs: 2,
    holdMs: 20,
    releaseMs: 110,
    startAt: start,
  });
  return (end - start) * 1000;
}

function sfxHit(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  const toneEnd = playTone(ctx, output, {
    type: 'sine',
    frequency: 140 * rate,
    endFrequency: 80 * rate,
    gain: 0.3 * volume,
    attackMs: 2,
    holdMs: 20,
    releaseMs: 90,
    startAt: start,
  });
  playNoiseBurst(ctx, output, {
    seconds: 0.08,
    filterType: 'bandpass',
    filterFreq: 1800,
    filterQ: 1.2,
    gain: 0.1 * volume,
    attackMs: 1,
    releaseMs: 60,
    startAt: start,
  });
  return (toneEnd - start) * 1000;
}

function sfxHeadshot(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  const toneEnd = playTone(ctx, output, {
    type: 'square',
    frequency: 700 * rate,
    endFrequency: 1200 * rate,
    gain: 0.25 * volume,
    attackMs: 1,
    holdMs: 30,
    releaseMs: 140,
    startAt: start,
  });
  playNoiseBurst(ctx, output, {
    seconds: 0.1,
    filterType: 'highpass',
    filterFreq: 3000,
    gain: 0.12 * volume,
    attackMs: 1,
    releaseMs: 80,
    startAt: start,
  });
  return (toneEnd - start) * 1000;
}

function sfxHeartLoss(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // Descending sad interval, G4 -> E4.
  const start = ctx.currentTime;
  const notes = [392.0, 329.63];
  let latestEnd = start;
  notes.forEach((frequency, index) => {
    const noteStart = start + index * 0.11;
    const end = playTone(ctx, output, {
      type: 'triangle',
      frequency: frequency * rate,
      gain: 0.25 * volume,
      attackMs: 4,
      holdMs: 40,
      releaseMs: 160,
      startAt: noteStart,
    });
    latestEnd = Math.max(latestEnd, end);
  });
  return (latestEnd - start) * 1000;
}

function sfxSpikeBeep(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // A single beep. The caller (spike-defuse minigame) controls the
  // accelerating feel by shortening the interval between calls and/or
  // raising `rate` as the timer runs down.
  const start = ctx.currentTime;
  const end = playTone(ctx, output, {
    type: 'square',
    frequency: 900 * rate,
    gain: 0.22 * volume,
    attackMs: 2,
    holdMs: 30,
    releaseMs: 30,
    startAt: start,
  });
  return (end - start) * 1000;
}

function sfxDefuseTick(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.03,
    filterType: 'bandpass',
    filterFreq: 2500,
    filterQ: 2,
    gain: 0.15 * volume,
    attackMs: 1,
    releaseMs: 25,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'square',
    frequency: 1200 * rate,
    gain: 0.1 * volume,
    attackMs: 1,
    holdMs: 5,
    releaseMs: 20,
    startAt: start,
  });
  return Math.max((end - start) * 1000, 30);
}

function sfxClutch(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // Bigger, brighter ascending run than the keepsake chime.
  const start = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  let latestEnd = start;
  notes.forEach((frequency, index) => {
    const noteStart = start + index * 0.07;
    const end = playTone(ctx, output, {
      type: 'triangle',
      frequency: frequency * rate,
      gain: 0.32 * volume,
      attackMs: 3,
      holdMs: 70,
      releaseMs: 260,
      startAt: noteStart,
    });
    latestEnd = Math.max(latestEnd, end);
  });
  return (latestEnd - start) * 1000;
}

function sfxBootKey(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.02,
    filterType: 'highpass',
    filterFreq: 4000,
    gain: 0.08 * volume,
    attackMs: 1,
    releaseMs: 15,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'square',
    frequency: 1800 * rate,
    gain: 0.05 * volume,
    attackMs: 1,
    holdMs: 4,
    releaseMs: 12,
    startAt: start,
  });
  return Math.max((end - start) * 1000, 20);
}

function sfxEndingSwell(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // One-shot layered swell stinger for the ending's big moment — distinct
  // from the looping `music-ending` bed, this is a triggered flourish.
  const start = ctx.currentTime;
  const notes = [130.81, 196.0, 261.63, 329.63];
  let latestEnd = start;
  notes.forEach((frequency, index) => {
    const end = playTone(ctx, output, {
      type: index % 2 === 0 ? 'sine' : 'triangle',
      frequency: frequency * rate,
      gain: 0.18 * volume,
      attackMs: 1800 + index * 400,
      holdMs: 1200,
      releaseMs: 2200,
      startAt: start,
    });
    latestEnd = Math.max(latestEnd, end);
  });
  return (latestEnd - start) * 1000;
}

export const SFX_SYNTHS: Record<SfxKey, SfxSynthFactory> = {
  'sfx-interact': sfxInteract,
  'sfx-dialogue-advance': sfxDialogueAdvance,
  'sfx-keepsake': sfxKeepsake,
  'sfx-letter-open': sfxLetterOpen,
  'sfx-shot': sfxShot,
  'sfx-hit': sfxHit,
  'sfx-headshot': sfxHeadshot,
  'sfx-heart-loss': sfxHeartLoss,
  'sfx-spike-beep': sfxSpikeBeep,
  'sfx-defuse-tick': sfxDefuseTick,
  'sfx-clutch': sfxClutch,
  'sfx-boot-key': sfxBootKey,
  'sfx-ending-swell': sfxEndingSwell,
};
