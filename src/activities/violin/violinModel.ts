// The piece on the stand — deterministic rhythm-game state.
//
// Phaser and the DOM deliberately stay out of this file. The chart, timing
// windows, score, combo, and automatic misses can therefore be tested without a
// renderer and remain stable when the browser drops frames.

import { VIOLIN_PHRASES, getPitch } from './melody';

export type ViolinPhase = 'ready' | 'count-in' | 'playing' | 'finale' | 'complete';
export type ViolinJudgement = 'none' | 'perfect' | 'good' | 'miss';

export interface RhythmChartNote {
  readonly index: number;
  readonly phraseIndex: number;
  readonly noteIndex: number;
  readonly pitchId: string;
  readonly timeMs: number;
  readonly durationMs: number;
}

export interface RhythmLane {
  readonly key: string;
  readonly inputCode: string;
  readonly name: string;
}

export interface ViolinState {
  readonly phase: ViolinPhase;
  /** Milliseconds on one continuous clock, beginning at activity start. */
  readonly elapsedMs: number;
  /** First chart note that has not yet been judged. */
  readonly nextNoteIndex: number;
  readonly score: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly perfectCount: number;
  readonly goodCount: number;
  readonly missCount: number;
  readonly lastJudgement: ViolinJudgement;
  readonly lastJudgedNoteIndex: number;
  readonly lastJudgementAtMs: number;
  readonly finished: boolean;
}

/** Four broad pitch bands keep the chart readable and comfortable to play. */
export const RHYTHM_LANES: readonly RhythmLane[] = [
  { key: 'D', inputCode: 'D', name: 'Low' },
  { key: 'F', inputCode: 'F', name: 'Mid' },
  { key: 'J', inputCode: 'J', name: 'High' },
  { key: 'K', inputCode: 'K', name: 'Peak' },
] as const;
export const RHYTHM_KEY_HINT = RHYTHM_LANES.map((lane) => lane.key).join(' ');

/** The original 100 BPM passage is relaxed to 75 BPM for the playable chart. */
export const RHYTHM_TIME_SCALE = 4 / 3;
export const RHYTHM_BEAT_MS = 800;
export const RHYTHM_LEAD_IN_MS = RHYTHM_BEAT_MS * 3;
export const PERFECT_WINDOW_MS = 115;
export const GOOD_WINDOW_MS = 260;
/** A brief hold after the chart before the room opens into its golden finale. */
export const RHYTHM_OUTRO_MS = 700;
export const FINALE_HOLD_MS = 2600;
export const VIOLIN_FINALE_CAPTION = 'Follow the light';

export function rhythmLaneIndexForPitch(pitchId: string): number {
  const graphStep = getPitch(pitchId)?.graphStep ?? 0;
  return Math.min(RHYTHM_LANES.length - 1, Math.floor(graphStep / 3));
}

/** Builds one continuous chart from the piece's seven interactive measures. */
export function buildRhythmChart(): readonly RhythmChartNote[] {
  const chart: RhythmChartNote[] = [];
  let cursorMs = RHYTHM_LEAD_IN_MS;

  VIOLIN_PHRASES.forEach((phrase, phraseIndex) => {
    phrase.notes.forEach((note, noteIndex) => {
      cursorMs += Math.round((note.delayBeforeMs ?? 0) * RHYTHM_TIME_SCALE);
      chart.push({
        index: chart.length,
        phraseIndex,
        noteIndex,
        pitchId: note.pitchId,
        timeMs: cursorMs,
        durationMs: Math.round(note.durationMs * RHYTHM_TIME_SCALE),
      });
      cursorMs += Math.round(note.durationMs * RHYTHM_TIME_SCALE);
    });
  });

  return chart;
}

export const RHYTHM_CHART = buildRhythmChart();

export function createViolinState(): ViolinState {
  return {
    phase: 'ready',
    elapsedMs: 0,
    nextNoteIndex: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfectCount: 0,
    goodCount: 0,
    missCount: 0,
    lastJudgement: 'none',
    lastJudgedNoteIndex: -1,
    lastJudgementAtMs: -Infinity,
    finished: false,
  };
}

/** Opens the count-in only after the player has deliberately started the song. */
export function beginViolin(state: ViolinState): ViolinState {
  if (state.phase !== 'ready') {
    return state;
  }
  return { ...state, phase: 'count-in', elapsedMs: 0 };
}

function scoreFor(judgement: 'perfect' | 'good', combo: number): number {
  const base = judgement === 'perfect' ? 1000 : 600;
  return base + Math.min(combo, 25) * 20;
}

function judgeCurrentNote(
  state: ViolinState,
  judgement: Exclude<ViolinJudgement, 'none'>,
): ViolinState {
  const combo = judgement === 'miss' ? 0 : state.combo + 1;
  return {
    ...state,
    nextNoteIndex: state.nextNoteIndex + 1,
    score:
      judgement === 'miss'
        ? state.score
        : state.score + scoreFor(judgement, state.combo),
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
    perfectCount: state.perfectCount + (judgement === 'perfect' ? 1 : 0),
    goodCount: state.goodCount + (judgement === 'good' ? 1 : 0),
    missCount: state.missCount + (judgement === 'miss' ? 1 : 0),
    lastJudgement: judgement,
    lastJudgedNoteIndex: state.nextNoteIndex,
    lastJudgementAtMs: state.elapsedMs,
  };
}

/**
 * Advances the song clock and resolves any notes that have passed the Good
 * window. Large deltas can miss several notes without leaving the model stuck.
 */
export function advanceViolin(state: ViolinState, deltaMs: number): ViolinState {
  if (state.finished || state.phase === 'ready' || deltaMs <= 0) {
    return state;
  }

  let next: ViolinState = {
    ...state,
    elapsedMs: state.elapsedMs + deltaMs,
    phase:
      state.phase === 'count-in' && state.elapsedMs + deltaMs >= RHYTHM_LEAD_IN_MS
        ? 'playing'
        : state.phase,
  };

  if (next.phase === 'playing') {
    let note = RHYTHM_CHART[next.nextNoteIndex];
    while (note && next.elapsedMs - note.timeMs > GOOD_WINDOW_MS) {
      next = judgeCurrentNote(next, 'miss');
      note = RHYTHM_CHART[next.nextNoteIndex];
    }

    const last = RHYTHM_CHART.at(-1);
    if (
      !note &&
      last &&
      next.elapsedMs >= last.timeMs + last.durationMs + RHYTHM_OUTRO_MS
    ) {
      next = { ...next, phase: 'finale', lastJudgement: 'none' };
    }
  }

  if (next.phase === 'finale') {
    const last = RHYTHM_CHART.at(-1);
    const finaleStart = last
      ? last.timeMs + last.durationMs + RHYTHM_OUTRO_MS
      : RHYTHM_LEAD_IN_MS;
    if (next.elapsedMs >= finaleStart + FINALE_HOLD_MS) {
      next = { ...next, phase: 'complete', finished: true };
    }
  }

  return next;
}

/**
 * Judges one mapped keyboard/pointer lane. Early presses outside the timing
 * window are ignored; a wrong mapped lane inside the window spends the note as
 * a Miss so key-mashing cannot preserve a combo.
 */
export function pressViolinKey(state: ViolinState, keyName: string): ViolinState {
  if (state.phase !== 'playing' || state.finished) {
    return state;
  }

  const pressedLane = RHYTHM_LANES.find(
    (lane) => lane.key === keyName.trim().toUpperCase(),
  );
  const note = RHYTHM_CHART[state.nextNoteIndex];
  if (!pressedLane || !note) {
    return state;
  }

  const offsetMs = state.elapsedMs - note.timeMs;
  if (Math.abs(offsetMs) > GOOD_WINDOW_MS) {
    return state;
  }

  const expectedLane = RHYTHM_LANES[rhythmLaneIndexForPitch(note.pitchId)];
  if (pressedLane !== expectedLane) {
    return judgeCurrentNote(state, 'miss');
  }

  return judgeCurrentNote(
    state,
    Math.abs(offsetMs) <= PERFECT_WINDOW_MS ? 'perfect' : 'good',
  );
}

export function currentChartNote(state: ViolinState): RhythmChartNote | undefined {
  return RHYTHM_CHART[state.nextNoteIndex];
}

export function getPieceProgress(state: ViolinState): number {
  if (RHYTHM_CHART.length === 0) {
    return 1;
  }
  return Math.min(1, state.nextNoteIndex / RHYTHM_CHART.length);
}

export function isPieceComplete(state: ViolinState): boolean {
  return state.finished;
}

/** Chart end, including the authored duration of its final note. */
export function rhythmChartEndMs(): number {
  const last = RHYTHM_CHART.at(-1);
  return last ? last.timeMs + last.durationMs : RHYTHM_LEAD_IN_MS;
}
