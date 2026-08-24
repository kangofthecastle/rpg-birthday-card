// The piece on the stand — deterministic rhythm-game state.
//
// Phaser and the DOM deliberately stay out of this file. The chart, timing
// windows, score, combo, and automatic misses can therefore be tested without a
// renderer and remain stable when the browser drops frames.

import { VIOLIN_FINALE_PHRASES } from './melody';

export type ViolinPhase =
  | 'ready'
  | 'count-in'
  | 'playing'
  | 'retry'
  | 'finale'
  | 'complete';
export type ViolinJudgement = 'none' | 'perfect' | 'good' | 'miss';

export interface RhythmChartNote {
  readonly index: number;
  readonly phraseIndex: number;
  readonly noteIndex: number;
  readonly pitchId: string;
  readonly laneIndex: number;
  readonly timeMs: number;
  readonly durationMs: number;
}

export interface RhythmLane {
  readonly key: string;
  readonly inputCode: string;
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
  { key: 'D', inputCode: 'D' },
  { key: 'F', inputCode: 'F' },
  { key: 'J', inputCode: 'J' },
  { key: 'K', inputCode: 'K' },
] as const;
export const RHYTHM_KEY_HINT = RHYTHM_LANES.map((lane) => lane.key).join(' ');

/** The passage begins at 80 BPM, then eases into a 75 BPM closing phrase. */
export const RHYTHM_START_BPM = 80;
export const RHYTHM_FINAL_BPM = 75;
export const RHYTHM_FINAL_TEMPO_NOTES = 4;
export const RHYTHM_TEMPO_RAMP_NOTES = 8;
export const RHYTHM_TIME_SCALE = 100 / RHYTHM_START_BPM;
export const RHYTHM_BEAT_MS = 800;
export const RHYTHM_LEAD_IN_MS = RHYTHM_BEAT_MS * 3;
/** Travel time from the top of the runway to the timing line. */
export const RHYTHM_NOTE_APPROACH_MS = 2100;
/** The displayed note 31 has room to ring before the next phrase continues. */
export const RHYTHM_MID_HOLD_NOTE_NUMBER = 31;
export const RHYTHM_MID_HOLD_EXTENSION_MS = 500;
export const RHYTHM_FINAL_NOTE_DURATION_MS = 2000;
export const VIOLIN_HOLD_TICK_MS = 200;
export const VIOLIN_HOLD_POINTS_PER_TICK = 100;
export const PERFECT_WINDOW_MS = 115;
export const GOOD_WINDOW_MS = 260;
/** A strong run is required, but misses never consume an attempt. */
export const VIOLIN_PASS_SCORE = 60_000;
export const VIOLIN_MISS_PENALTY = 1_000;
/** A brief hold after the chart before the room opens into its golden finale. */
export const RHYTHM_OUTRO_MS = 700;
export const FINALE_HOLD_MS = 5000;

/** Hand-balanced four-lane contour for the complete passage. Notes within two
 * diatonic steps may share a key; larger leaps always change lanes, melodic
 * direction is preserved, and no lane repeats more than three times. */
const RHYTHM_LANE_PHRASES: readonly (readonly number[])[] = [
  [2, 2, 1, 2],
  [2, 3, 3, 2, 2, 1],
  [1, 0, 1, 1],
  [0, 1, 1, 0],
  [0, 0, 1, 2],
  [2, 1, 2, 1],
  [2, 1, 1, 1],
  [2, 3, 2, 1, 2, 2],
  [3, 3, 2, 2, 1],
  [1, 0, 1, 1],
  [0, 1, 1, 0],
  [0, 0, 1, 2, 2, 1],
  [2, 3, 1, 1],
] as const;

const RHYTHM_NOTE_COUNT = VIOLIN_FINALE_PHRASES.reduce(
  (total, phrase) => total + phrase.notes.length,
  0,
);

export function isSustainedRhythmNote(noteIndex: number): boolean {
  return (
    noteIndex === RHYTHM_MID_HOLD_NOTE_NUMBER - 1 ||
    noteIndex === RHYTHM_NOTE_COUNT - 1
  );
}

export function rhythmTempoBpmForNote(noteIndex: number): number {
  const finalStart = RHYTHM_NOTE_COUNT - RHYTHM_FINAL_TEMPO_NOTES;
  const rampStart = finalStart - RHYTHM_TEMPO_RAMP_NOTES;
  if (noteIndex >= finalStart) {
    return RHYTHM_FINAL_BPM;
  }
  if (noteIndex < rampStart) {
    return RHYTHM_START_BPM;
  }
  const rampProgress = (noteIndex - rampStart + 1) / RHYTHM_TEMPO_RAMP_NOTES;
  return RHYTHM_START_BPM + (RHYTHM_FINAL_BPM - RHYTHM_START_BPM) * rampProgress;
}

export function rhythmTimeScaleForNote(noteIndex: number): number {
  return 100 / rhythmTempoBpmForNote(noteIndex);
}

/** Builds one continuous chart through the complete passage that the previous
 * game iteration played during its automatic post-game finale. */
export function buildRhythmChart(): readonly RhythmChartNote[] {
  const chart: RhythmChartNote[] = [];
  let cursorMs = RHYTHM_LEAD_IN_MS + RHYTHM_NOTE_APPROACH_MS;

  VIOLIN_FINALE_PHRASES.forEach((phrase, phraseIndex) => {
    phrase.notes.forEach((note, noteIndex) => {
      const chartIndex = chart.length;
      const timeScale = rhythmTimeScaleForNote(chartIndex);
      const laneIndex = RHYTHM_LANE_PHRASES[phraseIndex]?.[noteIndex];
      if (laneIndex === undefined) {
        throw new Error(`Missing rhythm lane for phrase ${phraseIndex}, note ${noteIndex}`);
      }
      const isFinalNote =
        phraseIndex === VIOLIN_FINALE_PHRASES.length - 1 &&
        noteIndex === phrase.notes.length - 1;
      cursorMs += Math.round((note.delayBeforeMs ?? 0) * timeScale);
      const scaledDurationMs = Math.round(note.durationMs * timeScale);
      const durationMs = isFinalNote
        ? RHYTHM_FINAL_NOTE_DURATION_MS
        : scaledDurationMs +
          (chartIndex === RHYTHM_MID_HOLD_NOTE_NUMBER - 1
            ? RHYTHM_MID_HOLD_EXTENSION_MS
            : 0);
      chart.push({
        index: chartIndex,
        phraseIndex,
        noteIndex,
        pitchId: note.pitchId,
        laneIndex,
        timeMs: cursorMs,
        durationMs,
      });
      cursorMs += durationMs;
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
  if (state.phase === 'retry') {
    return { ...createViolinState(), phase: 'count-in' };
  }
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
        ? Math.max(0, state.score - VIOLIN_MISS_PENALTY)
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
  if (
    state.finished ||
    state.phase === 'ready' ||
    state.phase === 'retry' ||
    deltaMs <= 0
  ) {
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
      next = {
        ...next,
        phase: next.score >= VIOLIN_PASS_SCORE ? 'finale' : 'retry',
        lastJudgement: 'none',
      };
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

  const expectedLane = RHYTHM_LANES[note.laneIndex];
  if (pressedLane !== expectedLane) {
    return judgeCurrentNote(state, 'miss');
  }

  return judgeCurrentNote(
    state,
    Math.abs(offsetMs) <= PERFECT_WINDOW_MS ? 'perfect' : 'good',
  );
}

/** Adds deterministic score ticks while a sustained note is actively held. */
export function awardViolinHoldTicks(
  state: ViolinState,
  tickCount: number,
): ViolinState {
  const wholeTicks = Math.max(0, Math.floor(tickCount));
  if (state.phase !== 'playing' || state.finished || wholeTicks === 0) {
    return state;
  }
  return {
    ...state,
    score: state.score + wholeTicks * VIOLIN_HOLD_POINTS_PER_TICK,
  };
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
