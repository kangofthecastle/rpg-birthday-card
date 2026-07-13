// The piece on the stand — pure, framework-free phrase state machine.
//
// No Phaser, no DOM: the whole mechanic is a deterministic function of the
// starting state, elapsed time, and key presses, so it unit-tests in isolation
// and drives the scene reproducibly. This is a perfect-pitch echo, not falling
// notes: each phrase PLAYS first (time-driven), then ____ ECHOES it back on
// the six mapped keys. There is no fail state — a wrong key gently wavers and
// the phrase simply plays itself again, a little slower each time (floor 70%),
// so it can never soft-lock. The song waits for her.

import {
  VIOLIN_PHRASES,
  getPitch,
  getPitchByKey,
  type ViolinPhrase,
} from './melody';

// Phase machine, in order of a phrase's life:
//   playback → the phrase plays itself (time-driven).
//   echo     → ____ plays it back on the mapped keys (input-driven).
//   handoff  → the instant she lands a phrase's LAST note: a short beat so that
//              last ring is heard, then straight into the next phrase's playback.
//              No dead air, no waiting state.
//   finale   → she has just echoed the whole piece; now it pours back through as
//              one continuous line (every phrase auto-played in sequence), a
//              richer swell underneath, golden light filling the room.
//   complete → done.
// There is no takeover: ____ plays every note of every phrase herself, the last
// phrase included. The finale is the reward, not an interruption.
export type ViolinPhase = 'playback' | 'echo' | 'handoff' | 'finale' | 'complete';
export type ViolinResult = 'none' | 'ring' | 'waver';

/** Miss slowdown floor: playback never stretches slower than 70% tempo. */
export const MIN_TEMPO_SCALE = 0.7;
/** Each miss multiplies the current phrase's tempo scale by this. */
export const MISS_SLOWDOWN_FACTOR = 0.9;
/** Quiet beat after a phrase finishes playing before the echo opens. */
export const PLAYBACK_TAIL_MS = 460;
/** Instant handoff: the beat after ____ lands a phrase's last note (so the ring
 * is heard) before the next phrase begins playing itself. Kept short so the
 * handoff feels immediate — well under the 700ms the playtest wants. */
export const HANDOFF_MS = 500;
/** Lead-in beat at the top of the finale before the whole-piece replay begins,
 * so her final note rings and the swell can bloom in first. */
export const FINALE_LEAD_IN_MS = 640;
/** Breath between phrases during the finale replay — enough to phrase the line,
 * short enough that the piece still reads as one continuous sweep. */
export const FINALE_PHRASE_GAP_MS = 240;
/** Hold after the finale's last note (swell ringing, golden light at full pour)
 * before the piece is marked complete. */
export const FINALE_HOLD_MS = 2600;

export interface ViolinState {
  /** Index of the phrase currently in play (0..phrases.length - 1). */
  readonly phraseIndex: number;
  readonly phase: ViolinPhase;
  /** Ms elapsed within the current playback (phase 'playback') or within the
   * final swell (phase 'finale'); unused while echoing. */
  readonly elapsedMs: number;
  /** How many notes of the current phrase ____ has correctly echoed. */
  readonly echoIndex: number;
  /** Playback speed for the current phrase; eases toward MIN_TEMPO_SCALE on
   * each miss so timing only ever gets gentler. */
  readonly tempoScale: number;
  /** Outcome of the most recent key press, for scene feedback. */
  readonly lastResult: ViolinResult;
  /** True once the piece is finished. */
  readonly finished: boolean;
  /** "Mistakes allowed" state: true once ONE wrong key has been pressed on the
   * CURRENT expected note and the song is now waiting for that same note to be
   * played correctly to recover. A second wrong press while recovering is a
   * normal miss. Always false when the "mistakes allowed" setting is off, since
   * the first wrong press is then handled as a normal miss immediately. */
  readonly recovering: boolean;
}

export function createViolinState(): ViolinState {
  return {
    phraseIndex: 0,
    phase: 'playback',
    elapsedMs: 0,
    echoIndex: 0,
    tempoScale: 1,
    lastResult: 'none',
    finished: false,
    recovering: false,
  };
}

export function getPhrase(state: ViolinState): ViolinPhrase | undefined {
  return VIOLIN_PHRASES[state.phraseIndex];
}

export function isFinalPhrase(state: ViolinState): boolean {
  return state.phraseIndex === VIOLIN_PHRASES.length - 1;
}

/** One note of the whole-piece finale replay, timed from the finale's start. */
export interface FinaleNote {
  /** Which phrase this note belongs to (drives the staff paging). */
  readonly phraseIndex: number;
  /** Note position within its phrase. */
  readonly noteIndex: number;
  readonly pitchId: string;
  readonly durationMs: number;
  /** When it begins sounding, ms from the start of the finale. */
  readonly startMs: number;
}

/** The finale plays the entire piece back as one continuous line: every phrase in
 * order, notes at their authored durations, a small breath between phrases. This
 * is the deterministic timeline both the swell scheduling and the staff lighting
 * read from. */
export function finaleTimeline(): FinaleNote[] {
  const out: FinaleNote[] = [];
  let t = FINALE_LEAD_IN_MS;
  VIOLIN_PHRASES.forEach((phrase, phraseIndex) => {
    phrase.notes.forEach((note, noteIndex) => {
      out.push({
        phraseIndex,
        noteIndex,
        pitchId: note.pitchId,
        durationMs: note.durationMs,
        startMs: t,
      });
      t += note.durationMs;
    });
    t += FINALE_PHRASE_GAP_MS;
  });
  return out;
}

/** Total finale length: the last note's start + its duration + the closing hold. */
export function finaleTotalMs(): number {
  const timeline = finaleTimeline();
  const last = timeline[timeline.length - 1];
  if (!last) {
    return FINALE_LEAD_IN_MS + FINALE_HOLD_MS;
  }
  return last.startMs + last.durationMs + FINALE_HOLD_MS;
}

/** The phrase the finale is sounding at `elapsedMs` (the last note to have begun),
 * so the staff pages through the piece as it replays. */
function finalePhraseAt(elapsedMs: number): number {
  let phraseIndex = 0;
  for (const note of finaleTimeline()) {
    if (note.startMs <= elapsedMs) {
      phraseIndex = note.phraseIndex;
    } else {
      break;
    }
  }
  return phraseIndex;
}

/** Cumulative start time (ms) of note `index` within a phrase at a given tempo
 * scale. `index === notes.length` yields the time the last note starts ringing
 * plus its own duration (i.e. the end of the played melody). */
export function noteStartMs(
  phrase: ViolinPhrase,
  index: number,
  tempoScale: number,
): number {
  let total = 0;
  for (let i = 0; i < index && i < phrase.notes.length; i += 1) {
    total += phrase.notes[i].durationMs / tempoScale;
  }
  return total;
}

/** Total playback time for a phrase (all notes + the trailing quiet beat). */
export function playbackDurationMs(
  phrase: ViolinPhrase,
  tempoScale: number,
): number {
  return noteStartMs(phrase, phrase.notes.length, tempoScale) + PLAYBACK_TAIL_MS;
}

/** How many notes have begun sounding by `elapsedMs` during playback. */
export function playbackLitCount(
  phrase: ViolinPhrase,
  elapsedMs: number,
  tempoScale: number,
): number {
  let count = 0;
  for (let i = 0; i < phrase.notes.length; i += 1) {
    if (noteStartMs(phrase, i, tempoScale) <= elapsedMs) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

/** How many marks of the current phrase are lit right now, unified across
 * phases so the scene has a single source of truth. */
export function litNoteCount(state: ViolinState): number {
  const phrase = getPhrase(state);
  if (!phrase) {
    return 0;
  }
  switch (state.phase) {
    case 'playback':
      return playbackLitCount(phrase, state.elapsedMs, state.tempoScale);
    case 'echo':
      return state.echoIndex;
    case 'handoff':
      // The phrase she just finished stays fully lit and glowing for the beat.
      return phrase.notes.length;
    case 'finale': {
      // The current phrase's notes ignite in sequence as the piece replays.
      let count = 0;
      for (const note of finaleTimeline()) {
        if (note.phraseIndex === state.phraseIndex && note.startMs <= state.elapsedMs) {
          count += 1;
        }
      }
      return count;
    }
    case 'complete':
      return phrase.notes.length;
    default:
      return 0;
  }
}

/** The pitch id the echo is currently waiting for, or undefined when not in an
 * echo (e.g. during playback, the swell, or once complete). */
export function expectedPitchId(state: ViolinState): string | undefined {
  if (state.phase !== 'echo') {
    return undefined;
  }
  const phrase = getPhrase(state);
  return phrase?.notes[state.echoIndex]?.pitchId;
}

/** Advances the time-driven phases (playback clock, final swell). Echo waits on
 * input and is untouched here; 'complete' is terminal. */
export function advanceViolin(state: ViolinState, deltaMs: number): ViolinState {
  if (state.finished || deltaMs <= 0) {
    return state;
  }

  if (state.phase === 'playback') {
    const phrase = getPhrase(state);
    if (!phrase) {
      return state;
    }
    const elapsedMs = state.elapsedMs + deltaMs;
    if (elapsedMs >= playbackDurationMs(phrase, state.tempoScale)) {
      // Playback finished; open the echo.
      return {
        ...state,
        phase: 'echo',
        elapsedMs: 0,
        echoIndex: 0,
        lastResult: 'none',
        recovering: false,
      };
    }
    return { ...state, elapsedMs };
  }

  if (state.phase === 'handoff') {
    const elapsedMs = state.elapsedMs + deltaMs;
    if (elapsedMs >= HANDOFF_MS) {
      // The beat is over — the next phrase begins playing itself, immediately.
      return {
        ...state,
        phraseIndex: state.phraseIndex + 1,
        phase: 'playback',
        elapsedMs: 0,
        echoIndex: 0,
        tempoScale: 1,
        lastResult: 'none',
        recovering: false,
      };
    }
    return { ...state, elapsedMs };
  }

  if (state.phase === 'finale') {
    const elapsedMs = state.elapsedMs + deltaMs;
    if (elapsedMs >= finaleTotalMs()) {
      return {
        ...state,
        phase: 'complete',
        elapsedMs: finaleTotalMs(),
        phraseIndex: VIOLIN_PHRASES.length - 1,
        finished: true,
      };
    }
    // Page the staff to whichever phrase is sounding now.
    return { ...state, elapsedMs, phraseIndex: finalePhraseAt(elapsedMs) };
  }

  return state;
}

/** Resolves a key press. Only meaningful during an echo:
 * - Unmapped key → ignored (returns the same state).
 * - Correct pitch → it rings; advance the echo (clearing any recovery). Landing a
 *   mid-song phrase's last note opens the handoff beat (then the next phrase plays
 *   itself); landing the FINAL phrase's last note opens the finale — the whole
 *   piece pours back.
 * - Wrong (but mapped) pitch → a gentle waver: reset the echo and replay the
 *   phrase a little slower.
 *
 * `mistakesAllowed` grants ONE forgiven slip per note: the first wrong press on a
 * note does NOT reset the phrase — it wavers and the song waits (`recovering`),
 * and playing the correct note once recovers and continues normally. A SECOND
 * wrong press while recovering is handled as a normal miss (phrase resets). With
 * the setting off (default) the first wrong press is a normal miss, exactly as
 * before. */
export function pressViolinKey(
  state: ViolinState,
  key: string,
  mistakesAllowed = false,
): ViolinState {
  if (state.phase !== 'echo' || state.finished) {
    return state;
  }
  const pressed = getPitchByKey(key);
  if (!pressed) {
    return state;
  }
  const phrase = getPhrase(state);
  if (!phrase) {
    return state;
  }

  const expected = phrase.notes[state.echoIndex];
  const expectedPitch = expected ? getPitch(expected.pitchId) : undefined;

  if (expectedPitch && pressed.id === expectedPitch.id) {
    const nextEcho = state.echoIndex + 1;

    if (nextEcho >= phrase.notes.length) {
      // She landed the phrase's last note herself.
      if (isFinalPhrase(state)) {
        // The whole piece pours back through as the finale.
        return {
          ...state,
          echoIndex: nextEcho,
          phase: 'finale',
          elapsedMs: 0,
          lastResult: 'ring',
          recovering: false,
        };
      }
      // A short beat (the ring), then the next phrase plays itself.
      return {
        ...state,
        echoIndex: nextEcho,
        phase: 'handoff',
        elapsedMs: 0,
        lastResult: 'ring',
        recovering: false,
      };
    }

    // A correct note always clears the note's forgiven-slip flag: the next note
    // gets its own fresh grace.
    return { ...state, echoIndex: nextEcho, lastResult: 'ring', recovering: false };
  }

  // Wrong (mapped) note. With mistakes allowed and no slip spent yet on this
  // note, the song simply waits — same phrase, same cursor — for the correct
  // note. Otherwise it's a normal miss: reset the phrase and replay slower.
  if (mistakesAllowed && !state.recovering) {
    return { ...state, recovering: true, lastResult: 'waver' };
  }

  return {
    ...state,
    phase: 'playback',
    elapsedMs: 0,
    echoIndex: 0,
    tempoScale: Math.max(MIN_TEMPO_SCALE, state.tempoScale * MISS_SLOWDOWN_FACTOR),
    lastResult: 'waver',
    recovering: false,
  };
}

export function isPieceComplete(state: ViolinState): boolean {
  return state.finished;
}

/** 0..1 fraction of the piece done, counting phrases and (roughly) the swell,
 * for warming the room art between phrases. */
export function getPieceProgress(state: ViolinState): number {
  const total = VIOLIN_PHRASES.length;
  const finaleBonus = state.phase === 'finale' || state.phase === 'complete' ? 1 : 0;
  return Math.min(1, (state.phraseIndex + finaleBonus) / total);
}
