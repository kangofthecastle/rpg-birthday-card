// A small, dependency-free WebAudio manager.
//
// Deliberately has no Phaser dependency so it can be unit-tested in jsdom
// with a mocked AudioContext, and can be wired into the game later without
// pulling any scene/activity code into this module.
//
// Usage:
//
//   import { initAudio, playMusic, playSfx } from './game/audio';
//
//   // Must be called from inside a user gesture handler (a click/keydown
//   // listener) to satisfy browser autoplay policy. Calling it outside of
//   // a gesture will still create the AudioContext, but it may start
//   // "suspended" and produce no sound until a later gesture resumes it.
//   button.addEventListener('click', () => {
//     initAudio();
//     playMusic('music-home');
//   });
//
// Every key first tries to load a real file from `/audio/<key>.mp3` (then
// `.ogg`) on first use. If neither is present (or decoding fails), the key
// silently falls back to its synthesized definition in `audioSynth.ts`.
// The resolution is cached per key, so the fallback decision is only made
// once. See `public/audio/README.md` for the file-drop contract.
//
// All exported functions are safe no-ops before `initAudio()` has run, and
// after `initAudio()` if no AudioContext is available in this environment.

import { MUSIC_SYNTHS, SFX_SYNTHS, playViolinTone } from './audioSynth';
import { clamp01 } from './mathUtils';

// ---------------------------------------------------------------------------
// Key registry
// ---------------------------------------------------------------------------

export const MUSIC_KEYS = [
  'music-home',
  'music-path',
  'music-friendone',
  'music-split',
  'music-ending',
  'music-letters',
] as const;

export const SFX_KEYS = [
  'sfx-interact',
  'sfx-dialogue-advance',
  'sfx-keepsake',
  'sfx-letter-open',
  'sfx-shot',
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
] as const;

export const AUDIO_KEYS = [...MUSIC_KEYS, ...SFX_KEYS] as const;

export type MusicKey = (typeof MUSIC_KEYS)[number];
export type SfxKey = (typeof SFX_KEYS)[number];
export type AudioKey = MusicKey | SfxKey;

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const AUDIO_FILE_BASE_PATH = '/audio';
const FILE_EXTENSIONS = ['mp3', 'ogg'] as const;

const MUSIC_BUS_LEVEL_DB = -14;
const SFX_BUS_LEVEL_DB = -3;

const DEFAULT_MUSIC_FADE_MS = 1200;
const MUTE_FADE_MS = 150;
const SFX_CLEANUP_SLACK_MS = 60;

const MUTE_STORAGE_KEY = 'a-game-audio-muted';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

type Resolution = { type: 'file'; buffer: AudioBuffer } | { type: 'synth' };

interface MusicBedInstance {
  key: MusicKey;
  bedGain: GainNode;
  disposed: boolean;
  dispose: () => void;
}

interface AudioManagerState {
  ctx: AudioContext | null;
  masterGain: GainNode | null;
  musicGain: GainNode | null;
  sfxGain: GainNode | null;
  initialized: boolean;
  muted: boolean;
  currentBed: MusicBedInstance | null;
  resolutionCache: Map<AudioKey, Promise<Resolution>>;
}

const state: AudioManagerState = {
  ctx: null,
  masterGain: null,
  musicGain: null,
  sfxGain: null,
  initialized: false,
  muted: readStoredMuted(),
  currentBed: null,
  resolutionCache: new Map(),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Creates the AudioContext and gain buses. Idempotent — later calls are
 * no-ops. Must be invoked from inside a user gesture handler to satisfy
 * autoplay policy (see module doc comment above). Safe to call in
 * environments without WebAudio support; audio simply stays disabled. */
export function initAudio(): void {
  if (state.initialized) {
    return;
  }
  state.initialized = true;

  const AudioContextCtor = resolveAudioContextCtor();
  if (!AudioContextCtor) {
    debugLog('AudioContext unavailable; audio disabled');
    return;
  }

  try {
    const ctx = new AudioContextCtor();
    const masterGain = ctx.createGain();
    const musicGain = ctx.createGain();
    const sfxGain = ctx.createGain();

    musicGain.gain.value = dbToGain(MUSIC_BUS_LEVEL_DB);
    sfxGain.gain.value = dbToGain(SFX_BUS_LEVEL_DB);
    masterGain.gain.value = state.muted ? 0 : 1;

    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(ctx.destination);

    state.ctx = ctx;
    state.masterGain = masterGain;
    state.musicGain = musicGain;
    state.sfxGain = sfxGain;

    void ctx.resume?.();
  } catch (error) {
    debugLog(`AudioContext init failed: ${String(error)}`);
    state.ctx = null;
  }
}

export interface PlayMusicOptions {
  fadeMs?: number;
}

/** Crossfades from whatever music bed is currently playing (if any) to
 * `key`. Calling this again with the bed that's already playing is a
 * no-op. */
export function playMusic(key: MusicKey, options: PlayMusicOptions = {}): void {
  const ctx = state.ctx;
  const musicGain = state.musicGain;
  if (!ctx || !musicGain) {
    return;
  }
  if (state.currentBed?.key === key) {
    return;
  }

  // Expose the active bed key for tests/observability (the ending regression
  // smoke asserts the ending's bed is not stomped by a stray edge transition).
  if (typeof document !== 'undefined') {
    document.body.dataset.musicKey = key;
  }

  const fadeMs = options.fadeMs ?? DEFAULT_MUSIC_FADE_MS;
  const previousBed = state.currentBed;

  const bedGain = ctx.createGain();
  bedGain.gain.value = 0;
  bedGain.connect(musicGain);

  const bedInstance: MusicBedInstance = {
    key,
    bedGain,
    disposed: false,
    dispose: () => {
      // replaced once the bed's source is ready below
    },
  };
  state.currentBed = bedInstance;

  void resolveKey(key).then((resolution) => {
    if (state.currentBed !== bedInstance) {
      // Superseded by a later playMusic()/stopMusic() call before this
      // resolved; just clean up the gain node we created.
      bedGain.disconnect();
      return;
    }

    if (resolution.type === 'file') {
      const source = ctx.createBufferSource();
      source.buffer = resolution.buffer;
      source.loop = true;
      source.connect(bedGain);
      source.start();
      bedInstance.dispose = () => {
        try {
          source.stop();
        } catch {
          // already stopped
        }
        source.disconnect();
      };
    } else {
      const handle = MUSIC_SYNTHS[key](ctx, bedGain);
      bedInstance.dispose = () => handle.dispose();
    }

    fadeGainTo(ctx, bedGain.gain, bedGain.gain.value, 1, fadeMs);
  });

  if (previousBed) {
    fadeOutAndDispose(ctx, previousBed, fadeMs);
  }
}

export interface StopMusicOptions {
  fadeMs?: number;
}

/** Fades out and stops the currently playing music bed, if any. */
export function stopMusic(options: StopMusicOptions = {}): void {
  const ctx = state.ctx;
  if (!ctx) {
    return;
  }
  const bed = state.currentBed;
  if (!bed) {
    return;
  }
  state.currentBed = null;
  fadeOutAndDispose(ctx, bed, options.fadeMs ?? DEFAULT_MUSIC_FADE_MS);
}

export interface PlaySfxOptions {
  /** Playback rate / pitch multiplier. Also used by the caller-controlled
   * spike-beep to create an accelerating feel across repeated calls. */
  rate?: number;
  volume?: number;
}

/** Plays a one-shot sound effect. Safe to call rapidly; each call gets its
 * own voice bus that is cleaned up once the sound finishes. */
export function playSfx(key: SfxKey, options: PlaySfxOptions = {}): void {
  const ctx = state.ctx;
  const sfxGain = state.sfxGain;
  if (!ctx || !sfxGain) {
    return;
  }

  const rate = options.rate ?? 1;
  const volume = clamp01(options.volume ?? 1);

  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 1;
  voiceGain.connect(sfxGain);

  void resolveKey(key).then((resolution) => {
    if (resolution.type === 'file') {
      const source = ctx.createBufferSource();
      source.buffer = resolution.buffer;
      source.playbackRate.value = rate;

      const fileGain = ctx.createGain();
      fileGain.gain.value = volume;
      source.connect(fileGain);
      fileGain.connect(voiceGain);

      source.start();
      source.onended = () => {
        source.disconnect();
        fileGain.disconnect();
        voiceGain.disconnect();
      };
    } else {
      const durationMs = SFX_SYNTHS[key](ctx, voiceGain, { rate, volume });
      setTimeout(() => {
        try {
          voiceGain.disconnect();
        } catch {
          // already disconnected
        }
      }, durationMs + SFX_CLEANUP_SLACK_MS);
    }
  });
}

export interface PlayViolinNoteOptions {
  volume?: number;
}

/** Plays a single sustained, warm violin-ish note at an arbitrary frequency
 * through the SFX bus. Used by "the piece on the stand" activity so each pitch
 * ____ hears and echoes rings out cleanly. Safe before init / without audio
 * support (no-op). Falls through to the synthesized tone in `audioSynth.ts`;
 * there is no per-note file (the drop-in `sfx-violin-*` recordings cover the
 * miss and the final swell instead). */
export function playViolinNote(
  frequency: number,
  durationMs: number,
  options: PlayViolinNoteOptions = {},
): void {
  const ctx = state.ctx;
  const sfxGain = state.sfxGain;
  if (!ctx || !sfxGain) {
    return;
  }

  const voiceGain = ctx.createGain();
  voiceGain.gain.value = clamp01(options.volume ?? 1);
  voiceGain.connect(sfxGain);

  const durationEstimateMs = playViolinTone(ctx, voiceGain, { frequency, durationMs });
  setTimeout(() => {
    try {
      voiceGain.disconnect();
    } catch {
      // already disconnected
    }
  }, durationEstimateMs + SFX_CLEANUP_SLACK_MS);
}

/** Whether audio is currently muted. Reflects the persisted preference even
 * before `initAudio()` has run. */
export function isMuted(): boolean {
  return state.muted;
}

/** Sets the mute state and persists it to localStorage. Safe to call
 * before init or without WebAudio support — it just won't have an audible
 * effect until audio is available. */
export function setMuted(muted: boolean): void {
  state.muted = muted;
  writeStoredMuted(muted);

  if (state.ctx && state.masterGain) {
    fadeGainTo(state.ctx, state.masterGain.gain, state.masterGain.gain.value, muted ? 0 : 1, MUTE_FADE_MS);
  }
}

export function toggleMuted(): boolean {
  setMuted(!state.muted);
  return state.muted;
}

// ---------------------------------------------------------------------------
// File-first resolution
// ---------------------------------------------------------------------------

function resolveKey(key: AudioKey): Promise<Resolution> {
  const cached = state.resolutionCache.get(key);
  if (cached) {
    return cached;
  }
  const promise = resolveKeyUncached(key);
  state.resolutionCache.set(key, promise);
  return promise;
}

async function resolveKeyUncached(key: AudioKey): Promise<Resolution> {
  const ctx = state.ctx;
  if (!ctx) {
    return { type: 'synth' };
  }

  for (const extension of FILE_EXTENSIONS) {
    try {
      const response = await fetch(`${AUDIO_FILE_BASE_PATH}/${key}.${extension}`);
      if (!response || !response.ok) {
        continue;
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      debugLog(`loaded audio file for "${key}" (${extension})`);
      return { type: 'file', buffer };
    } catch {
      // Try the next extension; if none work, fall back to synth below.
    }
  }

  debugLog(`using synth fallback for "${key}"`);
  return { type: 'synth' };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function resolveAudioContextCtor(): (new () => AudioContext) | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const w = window as typeof window & { webkitAudioContext?: new () => AudioContext };
  return w.AudioContext ?? w.webkitAudioContext;
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function fadeGainTo(ctx: AudioContext, param: AudioParam, from: number, to: number, ms: number): void {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(from, now);
  param.linearRampToValueAtTime(to, now + Math.max(ms, 0) / 1000);
}

function disposeBed(bed: MusicBedInstance): void {
  if (bed.disposed) {
    return;
  }
  bed.disposed = true;
  bed.dispose();
  bed.bedGain.disconnect();
}

function fadeOutAndDispose(ctx: AudioContext, bed: MusicBedInstance, fadeMs: number): void {
  fadeGainTo(ctx, bed.bedGain.gain, bed.bedGain.gain.value, 0, fadeMs);
  setTimeout(() => disposeBed(bed), Math.max(fadeMs, 0));
}

function readStoredMuted(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredMuted(muted: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
    }
  } catch {
    // Ignore storage failures (private browsing, quota, etc.) — mute still
    // works for the current session via in-memory state.
  }
}

function debugLog(message: string): void {
  console.debug(`[audio] ${message}`);
}
