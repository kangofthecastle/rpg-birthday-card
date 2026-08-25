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
  /** Equal-sized chords (Hz, low to high) played as a slow progression. */
  chordProgression: readonly (readonly number[])[];
  chordChangeMs: number;
  chordTransitionSeconds: number;
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
  const firstChord = preset.chordProgression[0];

  if (!firstChord || preset.chordProgression.some((chord) => chord.length !== firstChord.length)) {
    throw new Error('Pad progressions must contain equal-sized chords.');
  }

  const filter = ctx.createBiquadFilter();
  filter.type = preset.filterType;
  filter.frequency.value = preset.filterFrequency;
  filter.Q.value = preset.filterQ;
  filter.connect(output);
  disposers.push(() => filter.disconnect());

  const startAt = ctx.currentTime;
  let disposed = false;

  interface PadChordGroup {
    readonly bus: GainNode;
    dispose(): void;
  }

  const activeChordGroups = new Set<PadChordGroup>();
  const cleanupTimers = new Set<ReturnType<typeof setTimeout>>();

  const createChordGroup = (
    chord: readonly number[],
    fadeSeconds: number,
  ): PadChordGroup => {
    const chordBus = ctx.createGain();
    chordBus.gain.value = 0;
    chordBus.connect(filter);

    const chordStart = ctx.currentTime;
    chordBus.gain.setValueAtTime(0, chordStart);
    chordBus.gain.linearRampToValueAtTime(1, chordStart + fadeSeconds);

    const oscillators = chord.map((frequency, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = preset.waveform;
      oscillator.frequency.value = frequency;
      oscillator.detune.value = (index - (chord.length - 1) / 2) * preset.detuneSpreadCents;

      const voiceGain = ctx.createGain();
      voiceGain.gain.value = preset.voiceGain;
      oscillator.connect(voiceGain);
      voiceGain.connect(chordBus);
      oscillator.start(chordStart);
      return { oscillator, voiceGain };
    });

    let groupDisposed = false;
    const group: PadChordGroup = {
      bus: chordBus,
      dispose: () => {
        if (groupDisposed) {
          return;
        }
        groupDisposed = true;
        oscillators.forEach(({ oscillator, voiceGain }) => {
          try {
            oscillator.stop();
          } catch {
            // already stopped
          }
          oscillator.disconnect();
          voiceGain.disconnect();
        });
        chordBus.disconnect();
        activeChordGroups.delete(group);
      },
    };
    activeChordGroups.add(group);
    return group;
  };

  let currentChordGroup = createChordGroup(firstChord, preset.attackSeconds);
  let progressionTimer: ReturnType<typeof setTimeout> | undefined;

  if (preset.chordProgression.length > 1) {
    let progressionIndex = 0;

    const advanceProgression = () => {
      if (disposed) {
        return;
      }
      progressionIndex = (progressionIndex + 1) % preset.chordProgression.length;
      const nextChord = preset.chordProgression[progressionIndex];
      const previousChordGroup = currentChordGroup;
      currentChordGroup = createChordGroup(nextChord, preset.chordTransitionSeconds);

      const transitionEnd = ctx.currentTime + preset.chordTransitionSeconds;
      previousChordGroup.bus.gain.cancelScheduledValues(ctx.currentTime);
      previousChordGroup.bus.gain.setValueAtTime(previousChordGroup.bus.gain.value, ctx.currentTime);
      previousChordGroup.bus.gain.linearRampToValueAtTime(0.0001, transitionEnd);

      const cleanupTimer = setTimeout(() => {
        previousChordGroup.dispose();
        cleanupTimers.delete(cleanupTimer);
      }, preset.chordTransitionSeconds * 1000 + 50);
      cleanupTimers.add(cleanupTimer);
      progressionTimer = setTimeout(advanceProgression, preset.chordChangeMs);
    };

    progressionTimer = setTimeout(advanceProgression, preset.chordChangeMs);
  }

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
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (progressionTimer !== undefined) {
        clearTimeout(progressionTimer);
      }
      cleanupTimers.forEach((timer) => clearTimeout(timer));
      activeChordGroups.forEach((group) => group.dispose());
      disposers.forEach((dispose) => dispose());
    },
  };
}

// music-home: warm, unhurried C-Am-F-G movement with the original soft pad.
const HOME_PAD_PRESET: PadPreset = {
  chordProgression: [
    [130.81, 164.81, 196.0, 261.63], // C
    [110.0, 164.81, 196.0, 261.63], // Am7
    [87.31, 130.81, 164.81, 220.0], // Fmaj7
    [98.0, 146.83, 196.0, 220.0], // Gsus2
  ],
  chordChangeMs: 7000,
  chordTransitionSeconds: 1.2,
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
  chordProgression: [
    [130.81, 164.81, 196.0, 261.63],
    [110.0, 164.81, 196.0, 261.63],
    [87.31, 130.81, 164.81, 220.0],
    [98.0, 146.83, 196.0, 220.0],
  ],
  chordChangeMs: 9500,
  chordTransitionSeconds: 1.8,
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
  chordProgression: [
    [196.0, 293.66, 392.0], // G-D-G
    [146.83, 220.0, 293.66], // D-A-D
    [164.81, 246.94, 329.63], // E-B-E
    [130.81, 196.0, 261.63], // C-G-C
  ],
  chordChangeMs: 8000,
  chordTransitionSeconds: 1.3,
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
const SPLIT_BASS_NOTES_HZ = [49, 65.41, 43.65] as const; // G1-C2-F1
const SPLIT_BASS_NOTE_GAP_MS = 6500;
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
  let tensionTimeoutId: ReturnType<typeof setTimeout> | undefined;
  let bassNoteTimeoutId: ReturnType<typeof setTimeout> | undefined;
  let bassNoteIndex = 0;
  const activeVoiceCleanups = new Set<() => void>();

  const playNextBassNote = () => {
    if (disposed) {
      return;
    }
    playTone(ctx, filter, {
      type: 'sine',
      frequency: SPLIT_BASS_NOTES_HZ[bassNoteIndex],
      gain: 0.025,
      attackMs: 180,
      holdMs: 420,
      releaseMs: 900,
    });
    bassNoteIndex = (bassNoteIndex + 1) % SPLIT_BASS_NOTES_HZ.length;
    bassNoteTimeoutId = setTimeout(playNextBassNote, SPLIT_BASS_NOTE_GAP_MS);
  };

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
    tensionTimeoutId = setTimeout(scheduleTensionTick, gapMs);
  };

  scheduleTensionTick();
  bassNoteTimeoutId = setTimeout(playNextBassNote, SPLIT_BASS_NOTE_GAP_MS);

  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (tensionTimeoutId !== undefined) {
        clearTimeout(tensionTimeoutId);
      }
      if (bassNoteTimeoutId !== undefined) {
        clearTimeout(bassNoteTimeoutId);
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

// music-ending: a slow harmonic journey with a small answering melody. The old
// bed exposed one C for five seconds, then stacked more fixed notes onto it; in
// practice that read as a single monotonous drone through the boat transition.
const ENDING_PAD_PRESET: PadPreset = {
  chordProgression: [
    [65.41, 130.81, 164.81, 196.0], // Cmaj7 colour: C2 C3 E3 G3
    [55.0, 110.0, 164.81, 196.0], // Am7: A1 A2 E3 G3
    [43.65, 87.31, 130.81, 164.81], // Fmaj7: F1 F2 C3 E3
    [49.0, 98.0, 146.83, 196.0], // G open: G1 G2 D3 G3
  ],
  chordChangeMs: 6200,
  chordTransitionSeconds: 1.8,
  waveform: 'sine',
  filterType: 'lowpass',
  filterFrequency: 1850,
  filterQ: 0.55,
  voiceGain: 0.052,
  attackSeconds: 2.4,
  detuneSpreadCents: 4,
  lfoRateHz: 0.045,
  lfoDepthHz: 220,
  addAiryNoise: true,
};

interface EndingMelodyNote {
  readonly frequency: number;
  readonly gapMs: number;
}

// An original, unhurried C-major/A-minor pentatonic line. Uneven gaps keep it
// conversational rather than clockwork; each note overlaps softly into the next.
const ENDING_MELODY: readonly EndingMelodyNote[] = [
  { frequency: 329.63, gapMs: 2100 }, // E4
  { frequency: 392.0, gapMs: 1900 }, // G4
  { frequency: 440.0, gapMs: 2600 }, // A4
  { frequency: 523.25, gapMs: 3200 }, // C5
  { frequency: 493.88, gapMs: 1800 }, // B4
  { frequency: 392.0, gapMs: 2200 }, // G4
  { frequency: 329.63, gapMs: 1700 }, // E4
  { frequency: 293.66, gapMs: 3400 }, // D4
];

const ENDING_MASTER_GAIN = 0.58;

function createEndingBed(ctx: AudioContext, output: AudioNode): SynthMusicHandle {
  const endingBus = ctx.createGain();
  endingBus.gain.value = ENDING_MASTER_GAIN;
  endingBus.connect(output);
  const pad = createPadBed(ctx, endingBus, ENDING_PAD_PRESET);
  const melodyFilter = ctx.createBiquadFilter();
  melodyFilter.type = 'lowpass';
  melodyFilter.frequency.value = 2600;
  melodyFilter.Q.value = 0.7;
  melodyFilter.connect(endingBus);
  let disposed = false;
  let melodyIndex = 0;
  let melodyTimer: ReturnType<typeof setTimeout> | undefined;

  const playNextMelodyNote = (): void => {
    if (disposed) return;
    const note = ENDING_MELODY[melodyIndex % ENDING_MELODY.length]!;
    playTone(ctx, melodyFilter, {
      type: melodyIndex % 3 === 2 ? 'triangle' : 'sine',
      frequency: note.frequency,
      gain: 0.038,
      attackMs: 180,
      holdMs: 520,
      releaseMs: 1700,
    });
    melodyIndex += 1;
    melodyTimer = setTimeout(playNextMelodyNote, note.gapMs);
  };
  melodyTimer = setTimeout(playNextMelodyNote, 700);

  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (melodyTimer !== undefined) {
        clearTimeout(melodyTimer);
      }
      pad.dispose();
      melodyFilter.disconnect();
      endingBus.disconnect();
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
  // A punchy rifle crack, layered like a real gunshot:
  //   1. a bright high-passed noise "crack" (the supersonic snap),
  //   2. a mid bandpassed noise "body" (the mechanical report),
  //   3. a low sine "thump" that pitch-drops fast (the chest-thump), and
  //   4. a tiny click transient for the attack.
  // All decays are short so rapid automatic fire stays crisp, not muddy.
  const start = ctx.currentTime;

  // 1. High crack.
  playNoiseBurst(ctx, output, {
    seconds: 0.09,
    filterType: 'highpass',
    filterFreq: 2600,
    gain: 0.32 * volume,
    attackMs: 0.5,
    releaseMs: 70,
    startAt: start,
  });
  // 2. Mid body.
  playNoiseBurst(ctx, output, {
    seconds: 0.1,
    filterType: 'bandpass',
    filterFreq: 950 * rate,
    filterQ: 0.9,
    gain: 0.26 * volume,
    attackMs: 0.5,
    releaseMs: 90,
    startAt: start,
  });
  // 3. Low thump.
  const thumpEnd = playTone(ctx, output, {
    type: 'sine',
    frequency: 190 * rate,
    endFrequency: 62 * rate,
    gain: 0.34 * volume,
    attackMs: 1,
    holdMs: 8,
    releaseMs: 120,
    startAt: start,
  });
  // 4. Click transient.
  playNoiseBurst(ctx, output, {
    seconds: 0.012,
    filterType: 'highpass',
    filterFreq: 5000,
    gain: 0.2 * volume,
    attackMs: 0.3,
    releaseMs: 10,
    startAt: start,
  });

  return (thumpEnd - start) * 1000;
}

function sfxReload(ctx: AudioContext, output: AudioNode, { volume }: SfxSynthOptions): number {
  // Mechanical reload: mag-out click, mag-in thunk, then a charging-handle
  // clack — three filtered noise transients spread across ~0.5s.
  const start = ctx.currentTime;

  // Mag release click.
  playNoiseBurst(ctx, output, {
    seconds: 0.04,
    filterType: 'highpass',
    filterFreq: 3200,
    gain: 0.18 * volume,
    attackMs: 0.5,
    releaseMs: 35,
    startAt: start,
  });
  // Mag seat thunk (lower body) around 0.22s.
  playNoiseBurst(ctx, output, {
    seconds: 0.07,
    filterType: 'bandpass',
    filterFreq: 420,
    filterQ: 1,
    gain: 0.24 * volume,
    attackMs: 1,
    releaseMs: 70,
    startAt: start + 0.22,
  });
  playTone(ctx, output, {
    type: 'sine',
    frequency: 160,
    endFrequency: 90,
    gain: 0.18 * volume,
    attackMs: 1,
    holdMs: 10,
    releaseMs: 90,
    startAt: start + 0.22,
  });
  // Charging-handle clack near the end (~0.44s).
  playNoiseBurst(ctx, output, {
    seconds: 0.05,
    filterType: 'bandpass',
    filterFreq: 2200,
    filterQ: 1.4,
    gain: 0.2 * volume,
    attackMs: 0.5,
    releaseMs: 45,
    startAt: start + 0.44,
  });

  return 520;
}

function sfxDryfire(ctx: AudioContext, output: AudioNode, { volume }: SfxSynthOptions): number {
  // Hollow "click" of the trigger on an empty chamber.
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.03,
    filterType: 'highpass',
    filterFreq: 3800,
    gain: 0.16 * volume,
    attackMs: 0.3,
    releaseMs: 25,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'square',
    frequency: 320,
    gain: 0.06 * volume,
    attackMs: 0.5,
    holdMs: 4,
    releaseMs: 18,
    startAt: start,
  });
  return Math.max((end - start) * 1000, 40);
}

function sfxDeath(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // Heavy downed impact: a low pitch-collapsing thud under a lowpassed noise
  // whump, plus a short descending "flatline" tone so death reads clearly.
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.26,
    filterType: 'lowpass',
    filterFreq: 520,
    gain: 0.34 * volume,
    attackMs: 2,
    releaseMs: 260,
    startAt: start,
  });
  playTone(ctx, output, {
    type: 'sine',
    frequency: 180 * rate,
    endFrequency: 34 * rate,
    gain: 0.42 * volume,
    attackMs: 2,
    holdMs: 40,
    releaseMs: 320,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'triangle',
    frequency: 300,
    endFrequency: 150,
    gain: 0.16 * volume,
    attackMs: 4,
    holdMs: 30,
    releaseMs: 260,
    startAt: start + 0.06,
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

function sfxDefuseLoop(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // A sustained, rising electronic hum meant to be RETRIGGERED continuously
  // while ____ holds the defuse (the scene calls it on a short interval, and
  // raises `rate` with defuse progress so the pitch climbs toward the finish).
  // Two slightly detuned saw voices plus a square "fizz" partial through a
  // gently-opening lowpass give it an unmistakable "working on it" texture that
  // sits under the faster ticks. Deliberately longer than the retrigger gap so
  // successive calls overlap into one continuous bed.
  const start = ctx.currentTime;
  const holdSeconds = 0.34;
  const attack = 0.03;
  const release = 0.09;
  const attackEnd = start + attack;
  const holdEnd = attackEnd + holdSeconds;
  const releaseEnd = holdEnd + release;
  const base = 150 * rate;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  // Cutoff opens with rate so higher-progress loops sound brighter/tenser.
  filter.frequency.setValueAtTime(700 + rate * 500, start);
  filter.frequency.linearRampToValueAtTime(1100 + rate * 700, holdEnd);
  filter.Q.value = 3;
  filter.connect(output);

  const envelope = ctx.createGain();
  envelope.gain.value = 0;
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(0.16 * volume, attackEnd);
  envelope.gain.setValueAtTime(0.16 * volume, holdEnd);
  envelope.gain.linearRampToValueAtTime(0.0001, releaseEnd);
  envelope.connect(filter);

  const voices: Array<{ type: OscillatorType; freq: number; gain: number }> = [
    { type: 'sawtooth', freq: base, gain: 0.6 },
    { type: 'sawtooth', freq: base * 1.006, gain: 0.5 },
    { type: 'square', freq: base * 2, gain: 0.18 },
  ];
  const oscillators = voices.map((voice) => {
    const osc = ctx.createOscillator();
    osc.type = voice.type;
    osc.frequency.value = voice.freq;
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = voice.gain;
    osc.connect(voiceGain);
    voiceGain.connect(envelope);
    osc.start(start);
    osc.stop(releaseEnd + 0.02);
    osc.onended = () => {
      osc.disconnect();
      voiceGain.disconnect();
    };
    return osc;
  });

  const last = oscillators[oscillators.length - 1];
  if (last) {
    last.onended = () => {
      oscillators.forEach((osc) => osc.disconnect());
      envelope.disconnect();
      filter.disconnect();
    };
  }

  return (releaseEnd - start) * 1000;
}

function sfxDefuseCheckpoint(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // Chunky mechanical "clunk" — the half-defuse latching home. A short low
  // thunk with a click of noise on top.
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.03,
    filterType: 'bandpass',
    filterFreq: 1400,
    filterQ: 1.4,
    gain: 0.16 * volume,
    attackMs: 1,
    releaseMs: 40,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'square',
    frequency: 300 * rate,
    endFrequency: 180 * rate,
    gain: 0.22 * volume,
    attackMs: 2,
    holdMs: 30,
    releaseMs: 90,
    startAt: start,
  });
  return (end - start) * 1000;
}

function sfxOmenTeleport(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.34,
    filterType: 'bandpass',
    filterFreq: 720 * rate,
    filterQ: 3.2,
    gain: 0.18 * volume,
    attackMs: 12,
    releaseMs: 300,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'sawtooth',
    frequency: 190 * rate,
    endFrequency: 58 * rate,
    gain: 0.13 * volume,
    attackMs: 8,
    holdMs: 40,
    releaseMs: 360,
    startAt: start,
  });
  return (end - start) * 1000;
}

function sfxStoryHum(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  let latest = start;
  // A low, breathy shadow of the theme's opening A-G-F-G. Four quiet notes are
  // enough to feel intentional without revealing the melody outright.
  [
    { frequency: 220, startOffset: 0, holdMs: 260 },
    { frequency: 196, startOffset: 0.42, holdMs: 120 },
    { frequency: 174.61, startOffset: 0.6, holdMs: 360 },
    { frequency: 196, startOffset: 1.02, holdMs: 120 },
  ].forEach(({ frequency, startOffset, holdMs }) => {
    latest = Math.max(latest, playTone(ctx, output, {
      type: 'sine',
      frequency: frequency * rate,
      gain: 0.065 * volume,
      attackMs: 140,
      holdMs,
      releaseMs: 320,
      startAt: start + startOffset,
    }));
  });
  return (latest - start) * 1000;
}

function sfxPcFail(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.24,
    filterType: 'lowpass',
    filterFreq: 520,
    gain: 0.12 * volume,
    attackMs: 8,
    releaseMs: 180,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'sawtooth',
    frequency: 92 * rate,
    endFrequency: 38 * rate,
    gain: 0.1 * volume,
    attackMs: 25,
    holdMs: 110,
    releaseMs: 80,
    startAt: start,
  });
  return (end - start) * 1000;
}

function sfxPcReady(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.32,
    filterType: 'lowpass',
    filterFreq: 1100 * rate,
    gain: 0.035 * volume,
    attackMs: 45,
    releaseMs: 240,
    startAt: start,
  });
  let latest = start;
  [392, 659.25].forEach((frequency, index) => {
    latest = Math.max(latest, playTone(ctx, output, {
      type: 'triangle',
      frequency: frequency * rate,
      gain: 0.1 * volume,
      attackMs: 5,
      holdMs: 45,
      releaseMs: 180,
      startAt: start + 0.05 + index * 0.14,
    }));
  });
  return (latest - start) * 1000;
}

function sfxPhoneNotification(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  let latest = start;
  [880, 1174.66].forEach((frequency, index) => {
    latest = Math.max(latest, playTone(ctx, output, {
      type: 'sine',
      frequency: frequency * rate,
      gain: 0.16 * volume,
      attackMs: 2,
      holdMs: 35,
      releaseMs: 120,
      startAt: start + index * 0.09,
    }));
  });
  return (latest - start) * 1000;
}

function sfxKoiArrive(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  let latest = start;
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    latest = Math.max(latest, playTone(ctx, output, {
      type: 'sine',
      frequency: frequency * rate,
      gain: 0.13 * volume,
      attackMs: 8,
      holdMs: 45,
      releaseMs: 260,
      startAt: start + index * 0.1,
    }));
  });
  return (latest - start) * 1000;
}

function sfxOmenVoid(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.3,
    filterType: 'bandpass',
    filterFreq: 360,
    filterQ: 5,
    gain: 0.09 * volume,
    attackMs: 30,
    releaseMs: 260,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'triangle',
    frequency: 118 * rate,
    endFrequency: 76 * rate,
    gain: 0.08 * volume,
    attackMs: 18,
    holdMs: 80,
    releaseMs: 260,
    startAt: start,
  });
  return (end - start) * 1000;
}

function sfxPhotoComplete(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.025,
    filterType: 'highpass',
    filterFreq: 2800,
    gain: 0.07 * volume,
    attackMs: 1,
    releaseMs: 20,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'sine',
    frequency: 659.25 * rate,
    endFrequency: 783.99 * rate,
    gain: 0.12 * volume,
    attackMs: 4,
    holdMs: 55,
    releaseMs: 300,
    startAt: start + 0.05,
  });
  return (end - start) * 1000;
}

function sfxDefuseComplete(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // Rising resolve sting — three notes climbing to a bright, held top.
  const start = ctx.currentTime;
  const notes = [440.0, 587.33, 880.0];
  let latestEnd = start;
  notes.forEach((frequency, index) => {
    const noteStart = start + index * 0.08;
    const last = index === notes.length - 1;
    const end = playTone(ctx, output, {
      type: 'triangle',
      frequency: frequency * rate,
      gain: 0.3 * volume,
      attackMs: 3,
      holdMs: last ? 160 : 60,
      releaseMs: last ? 320 : 120,
      startAt: noteStart,
    });
    latestEnd = Math.max(latestEnd, end);
  });
  return (latestEnd - start) * 1000;
}

function sfxDetonate(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // Brief low boom — a pitch-dropping sine thud under a filtered noise blast.
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.22,
    filterType: 'lowpass',
    filterFreq: 700,
    gain: 0.32 * volume,
    attackMs: 2,
    releaseMs: 220,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'sine',
    frequency: 150 * rate,
    endFrequency: 40 * rate,
    gain: 0.4 * volume,
    attackMs: 2,
    holdMs: 40,
    releaseMs: 260,
    startAt: start,
  });
  return (end - start) * 1000;
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

function sfxDevelopLock(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // Soft two-note "settle" chime for a successful develop lock — warmer and
  // gentler than the keepsake fanfare: a perfect fifth, E5 → B5.
  const start = ctx.currentTime;
  const notes = [659.25, 987.77];
  let latestEnd = start;
  notes.forEach((frequency, index) => {
    const end = playTone(ctx, output, {
      type: 'sine',
      frequency: frequency * rate,
      gain: 0.24 * volume,
      attackMs: 5,
      holdMs: 70,
      releaseMs: 300,
      startAt: start + index * 0.08,
    });
    latestEnd = Math.max(latestEnd, end);
  });
  return (latestEnd - start) * 1000;
}

function sfxDevelopMiss(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // Gentle, non-punishing "almost" — a single soft muted triangle blip that
  // eases down a whole tone, deliberately quiet.
  const start = ctx.currentTime;
  const end = playTone(ctx, output, {
    type: 'triangle',
    frequency: 392.0 * rate,
    endFrequency: 349.23 * rate,
    gain: 0.16 * volume,
    attackMs: 6,
    holdMs: 40,
    releaseMs: 150,
    startAt: start,
  });
  return (end - start) * 1000;
}

// ---------------------------------------------------------------------------
// Violin tones — the voice of "the piece on the stand" activity
// ---------------------------------------------------------------------------

export interface ViolinToneOptions {
  /** Pitch in Hz. */
  frequency: number;
  /** How long the note sustains before its release tail, in ms. */
  durationMs: number;
  /** Peak gain (0..1-ish); defaults to a warm, unobtrusive level. */
  gain?: number;
  startAt?: number;
}

const VIOLIN_ATTACK_MS = 55;
const VIOLIN_RELEASE_MS = 380;
const VIOLIN_VIBRATO_HZ = 5.4;
const VIOLIN_VIBRATO_CENTS = 7;

/** A warm, singing violin-ish note: a sawtooth body blended with a triangle for
 * roundness, gentle vibrato, a soft bowed attack and a ringing release, run
 * through a lowpass so it never gets scratchy. Returns the note's approximate
 * total duration in ms (sustain + release) so the caller can schedule cleanup.
 * This carries the whole scene, so it's tuned to be pleasant on repeat. */
export function playViolinTone(
  ctx: AudioContext,
  output: AudioNode,
  options: ViolinToneOptions,
): number {
  const {
    frequency,
    durationMs,
    gain = 0.26,
    startAt = ctx.currentTime,
  } = options;

  const safeFrequency = Math.max(frequency, 1);
  const sustainSeconds = Math.max(durationMs, 60) / 1000;
  const attackEnd = startAt + VIOLIN_ATTACK_MS / 1000;
  const sustainEnd = startAt + sustainSeconds;
  const releaseEnd = sustainEnd + VIOLIN_RELEASE_MS / 1000;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(6000, safeFrequency * 6);
  filter.Q.value = 0.7;
  filter.connect(output);

  const envelope = ctx.createGain();
  envelope.gain.value = 0;
  envelope.connect(filter);
  envelope.gain.setValueAtTime(0, startAt);
  envelope.gain.linearRampToValueAtTime(gain, attackEnd);
  // A touch of natural decay into the sustain, then a long ring-out.
  envelope.gain.linearRampToValueAtTime(gain * 0.82, sustainEnd);
  envelope.gain.linearRampToValueAtTime(0.0001, releaseEnd);

  // Gentle vibrato shared by both voices.
  const vibrato = ctx.createOscillator();
  vibrato.type = 'sine';
  vibrato.frequency.value = VIOLIN_VIBRATO_HZ;
  const vibratoDepth = ctx.createGain();
  // Depth in Hz for a small cents-based wobble, ramping in after the attack so
  // the onset is clean.
  const depthHz = safeFrequency * (Math.pow(2, VIOLIN_VIBRATO_CENTS / 1200) - 1);
  vibratoDepth.gain.value = 0;
  vibratoDepth.gain.setValueAtTime(0, startAt);
  vibratoDepth.gain.linearRampToValueAtTime(depthHz, attackEnd + 0.12);
  vibrato.connect(vibratoDepth);
  vibrato.start(startAt);
  vibrato.stop(releaseEnd + 0.02);

  const body = ctx.createOscillator();
  body.type = 'sawtooth';
  body.frequency.value = safeFrequency;
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.55;
  body.connect(bodyGain);
  bodyGain.connect(envelope);
  vibratoDepth.connect(body.frequency);

  const sweet = ctx.createOscillator();
  sweet.type = 'triangle';
  sweet.frequency.value = safeFrequency;
  const sweetGain = ctx.createGain();
  sweetGain.gain.value = 0.6;
  sweet.connect(sweetGain);
  sweetGain.connect(envelope);
  vibratoDepth.connect(sweet.frequency);

  body.start(startAt);
  sweet.start(startAt);
  body.stop(releaseEnd + 0.02);
  sweet.stop(releaseEnd + 0.02);

  const cleanup = () => {
    body.disconnect();
    sweet.disconnect();
    bodyGain.disconnect();
    sweetGain.disconnect();
    vibrato.disconnect();
    vibratoDepth.disconnect();
    envelope.disconnect();
    filter.disconnect();
  };
  body.onended = cleanup;

  return (releaseEnd - startAt) * 1000;
}

function sfxViolinWaver(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // The "not quite" — a soft, breathy detuned wobble that sags a semitone and
  // fades. Deliberately gentle and unpunishing; the phrase just waits.
  const start = ctx.currentTime;
  const base = 349.23 * rate; // F4-ish
  const end = playTone(ctx, output, {
    type: 'triangle',
    frequency: base,
    endFrequency: base * Math.pow(2, -1 / 12),
    gain: 0.14 * volume,
    attackMs: 12,
    holdMs: 90,
    releaseMs: 220,
    startAt: start,
  });
  // A quiet, slightly detuned partner gives the wavering, out-of-tune feel.
  playTone(ctx, output, {
    type: 'sine',
    frequency: base * 1.012,
    endFrequency: base * Math.pow(2, -1 / 12) * 1.012,
    gain: 0.08 * volume,
    attackMs: 12,
    holdMs: 90,
    releaseMs: 220,
    startAt: start,
  });
  return (end - start) * 1000;
}

function sfxViolinSwell(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // The full arrangement pouring in at the finale: a warm D-major chord that
  // blooms and holds under ____'s last notes (root, fifth, octave, third, and
  // a high shimmer), each swelling on its own long attack. A one-shot flourish,
  // distinct from any looping bed.
  const start = ctx.currentTime;
  const notes = [146.83, 220.0, 293.66, 369.99, 587.33]; // D3 A3 D4 F#4 D5
  let latestEnd = start;
  notes.forEach((frequency, index) => {
    const end = playTone(ctx, output, {
      type: index % 2 === 0 ? 'triangle' : 'sine',
      frequency: frequency * rate,
      gain: (0.16 - index * 0.015) * volume,
      attackMs: 900 + index * 340,
      holdMs: 1500,
      releaseMs: 1700,
      startAt: start + index * 0.05,
    });
    latestEnd = Math.max(latestEnd, end);
  });
  return (latestEnd - start) * 1000;
}

function sfxPaperFold(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // A soft, crisp crease: a very short bandpassed noise "shff" with a tiny
  // low click underneath. Deliberately gentle and papery.
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.14,
    filterType: 'bandpass',
    filterFreq: 2600 * rate,
    filterQ: 0.8,
    gain: 0.13 * volume,
    attackMs: 3,
    releaseMs: 120,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'triangle',
    frequency: 220 * rate,
    endFrequency: 150 * rate,
    gain: 0.05 * volume,
    attackMs: 2,
    holdMs: 8,
    releaseMs: 50,
    startAt: start,
  });
  return Math.max((end - start) * 1000, 140);
}

function sfxBoatExpand(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // A gentle pop that blooms: a soft rising sine "whoomp" plus a warm two-note
  // chime opening up, as the flat boat pops into shape and the lantern catches.
  const start = ctx.currentTime;
  const bloom = playTone(ctx, output, {
    type: 'sine',
    frequency: 180 * rate,
    endFrequency: 340 * rate,
    gain: 0.2 * volume,
    attackMs: 30,
    holdMs: 60,
    releaseMs: 320,
    startAt: start,
  });
  const notes = [523.25, 784.0]; // C5, G5
  let latestEnd = bloom;
  notes.forEach((frequency, index) => {
    const end = playTone(ctx, output, {
      type: 'sine',
      frequency: frequency * rate,
      gain: 0.16 * volume,
      attackMs: 6,
      holdMs: 70,
      releaseMs: 340,
      startAt: start + 0.06 + index * 0.1,
    });
    latestEnd = Math.max(latestEnd, end);
  });
  return (latestEnd - start) * 1000;
}

function sfxSailHoist(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // Cloth catching air + a rope creak: a short lowpassed noise "fwoomp" that
  // swells (canvas filling) with a faint low wooden creak beneath.
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.5,
    filterType: 'lowpass',
    filterFreq: 900 * rate,
    filterQ: 0.9,
    gain: 0.12 * volume,
    attackMs: 90,
    releaseMs: 340,
    startAt: start,
  });
  const creak = playTone(ctx, output, {
    type: 'sawtooth',
    frequency: 150 * rate,
    endFrequency: 116 * rate,
    gain: 0.04 * volume,
    attackMs: 30,
    holdMs: 40,
    releaseMs: 180,
    startAt: start + 0.02,
  });
  return Math.max((creak - start) * 1000, 500);
}
function sfxLanternKindle(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // A warm bloom of light: a soft rising sine that opens up, plus a gentle
  // filtered noise "breath" as the glow catches through the rolled paper.
  const start = ctx.currentTime;
  const bloom = playTone(ctx, output, {
    type: 'sine',
    frequency: 196 * rate,
    endFrequency: 392 * rate,
    gain: 0.16 * volume,
    attackMs: 120,
    holdMs: 120,
    releaseMs: 520,
    startAt: start,
  });
  playNoiseBurst(ctx, output, {
    seconds: 0.7,
    filterType: 'bandpass',
    filterFreq: 1400 * rate,
    filterQ: 0.6,
    gain: 0.05 * volume,
    attackMs: 200,
    releaseMs: 460,
    startAt: start,
  });
  return (bloom - start) * 1000;
}
function sfxWaterLap(ctx: AudioContext, output: AudioNode, { rate, volume }: SfxSynthOptions): number {
  // A short, soft lap of water: a lowpassed noise swell that rises and falls,
  // used during the sail-away. Short enough to retrigger for a loose lapping.
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.9,
    filterType: 'lowpass',
    filterFreq: 620 * rate,
    filterQ: 0.7,
    gain: 0.12 * volume,
    attackMs: 320,
    releaseMs: 520,
    startAt: start,
  });
  return 900;
}

function sfxFishingCast(
  ctx: AudioContext,
  output: AudioNode,
  { rate, volume }: SfxSynthOptions,
): number {
  // A round little bobber plop: soft water, then one buoyant bubble.
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.28,
    filterType: 'lowpass',
    filterFreq: 980 * rate,
    filterQ: 0.8,
    gain: 0.07 * volume,
    attackMs: 5,
    releaseMs: 220,
    startAt: start,
  });
  playTone(ctx, output, {
    type: 'sine',
    frequency: 260 * rate,
    endFrequency: 155 * rate,
    gain: 0.14 * volume,
    attackMs: 3,
    holdMs: 18,
    releaseMs: 150,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'sine',
    frequency: 540 * rate,
    endFrequency: 720 * rate,
    gain: 0.08 * volume,
    attackMs: 3,
    holdMs: 8,
    releaseMs: 105,
    startAt: start + 0.07,
  });
  return Math.max(280, (end - start) * 1000);
}

function sfxFishingNibble(
  ctx: AudioContext,
  output: AudioNode,
  { rate, volume }: SfxSynthOptions,
): number {
  // Two tiny curious bubbles when a fish first noses up to the float.
  const start = ctx.currentTime;
  let latestEnd = start;
  [760, 1040].forEach((frequency, index) => {
    latestEnd = Math.max(latestEnd, playTone(ctx, output, {
      type: 'sine',
      frequency: frequency * rate,
      endFrequency: frequency * 1.14 * rate,
      gain: (0.09 - index * 0.018) * volume,
      attackMs: 2,
      holdMs: 7,
      releaseMs: 90,
      startAt: start + index * 0.065,
    }));
  });
  return (latestEnd - start) * 1000;
}

function sfxFishingHit(
  ctx: AudioContext,
  output: AudioNode,
  { rate, volume }: SfxSynthOptions,
): number {
  // Bright wooden plink. Callers raise `rate` across the three timing targets.
  const start = ctx.currentTime;
  const end = playTone(ctx, output, {
    type: 'triangle',
    frequency: 690 * rate,
    gain: 0.2 * volume,
    attackMs: 2,
    holdMs: 18,
    releaseMs: 190,
    startAt: start,
  });
  playTone(ctx, output, {
    type: 'sine',
    frequency: 1380 * rate,
    gain: 0.055 * volume,
    attackMs: 2,
    holdMs: 8,
    releaseMs: 115,
    startAt: start + 0.012,
  });
  return (end - start) * 1000;
}

function sfxFishingMiss(
  ctx: AudioContext,
  output: AudioNode,
  { rate, volume }: SfxSynthOptions,
): number {
  // A forgiving hollow bloop: clear feedback without an arcade-error buzzer.
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.16,
    filterType: 'bandpass',
    filterFreq: 720 * rate,
    filterQ: 1.4,
    gain: 0.035 * volume,
    attackMs: 2,
    releaseMs: 120,
    startAt: start,
  });
  const end = playTone(ctx, output, {
    type: 'triangle',
    frequency: 350 * rate,
    endFrequency: 225 * rate,
    gain: 0.13 * volume,
    attackMs: 3,
    holdMs: 24,
    releaseMs: 190,
    startAt: start,
  });
  return (end - start) * 1000;
}

function sfxFishingLineBreak(
  ctx: AudioContext,
  output: AudioNode,
  { rate, volume }: SfxSynthOptions,
): number {
  // Elastic twang plus a small fibre snap, kept softer than the catch sounds.
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.2,
    filterType: 'highpass',
    filterFreq: 1700 * rate,
    filterQ: 0.7,
    gain: 0.075 * volume,
    attackMs: 1,
    releaseMs: 115,
    startAt: start + 0.025,
  });
  const end = playTone(ctx, output, {
    type: 'triangle',
    frequency: 560 * rate,
    endFrequency: 165 * rate,
    gain: 0.15 * volume,
    attackMs: 2,
    holdMs: 12,
    releaseMs: 270,
    startAt: start,
  });
  return (end - start) * 1000;
}

function sfxFishingCatch(
  ctx: AudioContext,
  output: AudioNode,
  { rate, volume }: SfxSynthOptions,
): number {
  // A small splash under a cheerful rising chime as the fish is landed.
  const start = ctx.currentTime;
  playNoiseBurst(ctx, output, {
    seconds: 0.5,
    filterType: 'lowpass',
    filterFreq: 1550 * rate,
    filterQ: 0.6,
    gain: 0.085 * volume,
    attackMs: 6,
    releaseMs: 390,
    startAt: start,
  });
  let latestEnd = start;
  [587.33, 739.99, 880].forEach((frequency, index) => {
    latestEnd = Math.max(latestEnd, playTone(ctx, output, {
      type: index === 2 ? 'sine' : 'triangle',
      frequency: frequency * rate,
      gain: (0.14 - index * 0.02) * volume,
      attackMs: 3,
      holdMs: 38,
      releaseMs: 260,
      startAt: start + 0.06 + index * 0.075,
    }));
  });
  return Math.max(500, (latestEnd - start) * 1000);
}

export const SFX_SYNTHS: Record<SfxKey, SfxSynthFactory> = {
  'sfx-interact': sfxInteract,
  'sfx-dialogue-advance': sfxDialogueAdvance,
  'sfx-keepsake': sfxKeepsake,
  'sfx-letter-open': sfxLetterOpen,
  'sfx-story-hum': sfxStoryHum,
  'sfx-pc-fail': sfxPcFail,
  'sfx-pc-ready': sfxPcReady,
  'sfx-phone-notification': sfxPhoneNotification,
  'sfx-koi-arrive': sfxKoiArrive,
  'sfx-fishing-cast': sfxFishingCast,
  'sfx-fishing-nibble': sfxFishingNibble,
  'sfx-fishing-hit': sfxFishingHit,
  'sfx-fishing-miss': sfxFishingMiss,
  'sfx-fishing-line-break': sfxFishingLineBreak,
  'sfx-fishing-catch': sfxFishingCatch,
  'sfx-omen-void': sfxOmenVoid,
  'sfx-photo-complete': sfxPhotoComplete,
  'sfx-shot': sfxShot,
  'sfx-reload': sfxReload,
  'sfx-dryfire': sfxDryfire,
  'sfx-death': sfxDeath,
  'sfx-hit': sfxHit,
  'sfx-headshot': sfxHeadshot,
  'sfx-heart-loss': sfxHeartLoss,
  'sfx-spike-beep': sfxSpikeBeep,
  'sfx-defuse-tick': sfxDefuseTick,
  'sfx-defuse-loop': sfxDefuseLoop,
  'sfx-defuse-checkpoint': sfxDefuseCheckpoint,
  'sfx-omen-teleport': sfxOmenTeleport,
  'sfx-defuse-complete': sfxDefuseComplete,
  'sfx-detonate': sfxDetonate,
  'sfx-clutch': sfxClutch,
  'sfx-boot-key': sfxBootKey,
  'sfx-ending-swell': sfxEndingSwell,
  'sfx-develop-lock': sfxDevelopLock,
  'sfx-develop-miss': sfxDevelopMiss,
  'sfx-violin-waver': sfxViolinWaver,
  'sfx-violin-swell': sfxViolinSwell,
  'sfx-paper-fold': sfxPaperFold,
  'sfx-sail-hoist': sfxSailHoist,
  'sfx-boat-expand': sfxBoatExpand,
  'sfx-lantern-kindle': sfxLanternKindle,
  'sfx-water-lap': sfxWaterLap,
};
