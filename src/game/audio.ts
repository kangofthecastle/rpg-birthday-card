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
import {
  VIOLIN_SAMPLE_URLS,
  selectViolinSample,
  type SelectedViolinSample,
} from './violinSamples';

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
  'sfx-story-hum',
  'sfx-pc-fail',
  'sfx-pc-ready',
  'sfx-phone-notification',
  'sfx-koi-arrive',
  'sfx-fishing-cast',
  'sfx-fishing-nibble',
  'sfx-fishing-hit',
  'sfx-fishing-miss',
  'sfx-fishing-line-break',
  'sfx-fishing-catch',
  'sfx-omen-void',
  'sfx-photo-complete',
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
  'sfx-omen-teleport',
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

const MUSIC_FILE_GAIN_BY_KEY: Readonly<Partial<Record<MusicKey, number>>> = {
  'music-friendone': 0.25,
};

const DEFAULT_MUSIC_FADE_MS = 1200;
const MUTE_FADE_MS = 150;
const SFX_CLEANUP_SLACK_MS = 60;
const VIOLIN_VOICE_CROSSFADE_MS = 35;
/** Skip the recorded bow-on-string transient when a note continues a phrase. */
const CONNECTED_VIOLIN_SAMPLE_OFFSET_SECONDS = 0.11;

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
  musicLevel: number;
  currentBed: MusicBedInstance | null;
  resolutionCache: Map<AudioKey, Promise<Resolution>>;
  fileBufferCache: Map<string, Promise<AudioBuffer | null>>;
}

const state: AudioManagerState = {
  ctx: null,
  masterGain: null,
  musicGain: null,
  sfxGain: null,
  initialized: false,
  muted: readStoredMuted(),
  musicLevel: 1,
  currentBed: null,
  resolutionCache: new Map(),
  fileBufferCache: new Map(),
};

/** Decoded violin buffers that are ready for zero-latency note playback. The
 * Promise cache above prevents duplicate fetches; this resolved-only map keeps
 * a note from arriving late if its download is still in flight. */
const violinSampleBuffers = new Map<string, AudioBuffer>();
let violinSamplesReadyPromise: Promise<void> | null = null;
let activeViolinVoiceGain: GainNode | null = null;

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

    musicGain.gain.value = dbToGain(MUSIC_BUS_LEVEL_DB) * state.musicLevel;
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
    void preloadViolinSamples();
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

    const fileGain = resolution.type === 'file' ? (MUSIC_FILE_GAIN_BY_KEY[key] ?? 1) : 1;
    fadeGainTo(ctx, bedGain.gain, bedGain.gain.value, fileGain, fadeMs);
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

/** Pre-decodes a one-off audio asset at an explicit public URL. Activities with
 * bespoke recordings can warm their files during an intro without expanding the
 * global SFX key/synth registry. Safe before audio initialization (no-op). */
export function preloadAudioFile(url: string): void {
  if (!state.ctx) {
    return;
  }
  void resolveAudioFile(url);
}

/** Plays a one-off recording from an explicit public URL through the normal SFX
 * and master/mute buses. Missing or undecodable files fail silently. */
export function playAudioFile(url: string, options: PlaySfxOptions = {}): void {
  void playAudioFileAndWait(url, options);
}

/** Plays a one-off recording and resolves after its source has actually ended.
 * This lets authored sequences wait for a cue's full duration without duplicating
 * the recording length in gameplay code. Missing audio or an unavailable audio
 * context resolves immediately, preserving the audio manager's safe-no-op
 * contract. */
export async function playAudioFileAndWait(
  url: string,
  options: PlaySfxOptions = {},
): Promise<void> {
  const ctx = state.ctx;
  const sfxGain = state.sfxGain;
  if (!ctx || !sfxGain) {
    return;
  }

  const rate = options.rate ?? 1;
  const volume = clamp01(options.volume ?? 1);
  const buffer = await resolveAudioFile(url);
  if (!buffer) {
    return;
  }

  await new Promise<void>((resolve) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(sfxGain);
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      resolve();
    };
  });
}

export interface PlayViolinNoteOptions {
  volume?: number;
  /** True when this note follows another in the same musical line. Connected
   * notes enter after the sample's bow attack so the phrase sounds legato. */
  connected?: boolean;
}

/** Plays a single sampled violin note at an arbitrary frequency
 * through the SFX bus. Used by "the piece on the stand" activity so each pitch
 * ____ lands in the rhythm activity rings out cleanly. Safe before init / without audio
 * support (no-op), with an immediate synthesized fallback while samples load. */
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

  if (activeViolinVoiceGain) {
    const fadeEnd = ctx.currentTime + VIOLIN_VOICE_CROSSFADE_MS / 1000;
    activeViolinVoiceGain.gain.cancelScheduledValues(ctx.currentTime);
    activeViolinVoiceGain.gain.setValueAtTime(activeViolinVoiceGain.gain.value, ctx.currentTime);
    activeViolinVoiceGain.gain.linearRampToValueAtTime(0.0001, fadeEnd);
  }

  const voiceGain = ctx.createGain();
  voiceGain.gain.value = clamp01(options.volume ?? 1);
  voiceGain.connect(sfxGain);
  activeViolinVoiceGain = voiceGain;

  const selected = selectViolinSample(frequency, durationMs);
  const buffer = violinSampleBuffers.get(selected.url);
  const durationEstimateMs = buffer
    ? playSampledViolinNote(
        ctx,
        voiceGain,
        buffer,
        selected,
        durationMs,
        options.connected ?? false,
      )
    : playViolinTone(ctx, voiceGain, { frequency, durationMs });
  setTimeout(() => {
    if (activeViolinVoiceGain === voiceGain) {
      activeViolinVoiceGain = null;
    }
    try {
      voiceGain.disconnect();
    } catch {
      // already disconnected
    }
  }, durationEstimateMs + SFX_CLEANUP_SLACK_MS);
}

function playSampledViolinNote(
  ctx: AudioContext,
  output: AudioNode,
  buffer: AudioBuffer,
  selected: SelectedViolinSample,
  durationMs: number,
  connected: boolean,
): number {
  const startAt = ctx.currentTime;
  const isShort = selected.articulation === 'spiccato';
  const soundingMs = isShort ? Math.max(durationMs, 360) : Math.max(durationMs, 80);
  const attackMs = connected ? 5 : isShort ? 4 : 18;
  const releaseMs = isShort ? 90 : Math.min(180, Math.max(100, durationMs * 0.28));
  const sustainEnd = startAt + soundingMs / 1000;
  const releaseEnd = sustainEnd + releaseMs / 1000;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = selected.playbackRate;

  const envelope = ctx.createGain();
  envelope.gain.value = 0;
  source.connect(envelope);
  envelope.connect(output);
  envelope.gain.setValueAtTime(0, startAt);
  envelope.gain.linearRampToValueAtTime(isShort ? 0.5 : 0.55, startAt + attackMs / 1000);
  envelope.gain.setValueAtTime(isShort ? 0.5 : 0.55, sustainEnd);
  envelope.gain.linearRampToValueAtTime(0.0001, releaseEnd);

  if (connected) {
    source.start(startAt, CONNECTED_VIOLIN_SAMPLE_OFFSET_SECONDS);
  } else {
    source.start(startAt);
  }
  source.stop(releaseEnd + 0.02);
  source.onended = () => {
    source.disconnect();
    envelope.disconnect();
  };

  return (releaseEnd - startAt) * 1000;
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

export interface SetMusicLevelOptions {
  fadeMs?: number;
}

/** Temporarily scales the music bus without affecting SFX or mute state.
 * Passing 1 restores the normal mix. Safe before audio initialization. */
export function setMusicLevel(
  level: number,
  options: SetMusicLevelOptions = {},
): void {
  state.musicLevel = clamp01(level);
  if (typeof document !== 'undefined') {
    document.body.dataset.musicLevel = String(state.musicLevel);
  }
  if (!state.ctx || !state.musicGain) {
    return;
  }
  fadeGainTo(
    state.ctx,
    state.musicGain.gain,
    state.musicGain.gain.value,
    dbToGain(MUSIC_BUS_LEVEL_DB) * state.musicLevel,
    options.fadeMs ?? DEFAULT_MUSIC_FADE_MS,
  );
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

function resolveAudioFile(url: string): Promise<AudioBuffer | null> {
  const cached = state.fileBufferCache.get(url);
  if (cached) {
    return cached;
  }
  const promise = resolveAudioFileUncached(url);
  state.fileBufferCache.set(url, promise);
  return promise;
}

function preloadViolinSamples(): Promise<void> {
  if (violinSamplesReadyPromise) {
    return violinSamplesReadyPromise;
  }
  violinSamplesReadyPromise = Promise.all(
    VIOLIN_SAMPLE_URLS.map((url) => resolveAudioFile(url).then((buffer) => {
      if (buffer) {
        violinSampleBuffers.set(url, buffer);
      }
    })),
  ).then(() => undefined);
  return violinSamplesReadyPromise;
}

/** Ensures the local violin recordings are decoded before the music game starts,
 * preventing its temporary synthesized fallback from appearing mid-phrase. */
export function prepareViolinSamples(): Promise<void> {
  if (!state.ctx) {
    return Promise.resolve();
  }
  return preloadViolinSamples();
}

async function resolveAudioFileUncached(url: string): Promise<AudioBuffer | null> {
  const ctx = state.ctx;
  if (!ctx) {
    return null;
  }
  try {
    const response = await fetch(url);
    if (!response?.ok) {
      return null;
    }
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
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
