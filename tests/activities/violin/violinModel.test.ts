import { describe, expect, it } from 'vitest';
import {
  VIOLIN_FINALE_PHRASES,
  VIOLIN_PHRASES,
  VIOLIN_PITCHES,
  VIOLIN_RHYTHM_MS,
  VIOLIN_SHEET_KINDLE_MOTIF,
  VIOLIN_SHEET_ROLL_MOTIF,
  getPitch,
  getPitchByKey,
} from '../../../src/activities/violin/melody';
import {
  FINALE_HOLD_MS,
  GOOD_WINDOW_MS,
  PERFECT_WINDOW_MS,
  RHYTHM_CHART,
  RHYTHM_LANES,
  RHYTHM_LEAD_IN_MS,
  RHYTHM_OUTRO_MS,
  RHYTHM_TIME_SCALE,
  VIOLIN_FINALE_CAPTION,
  advanceViolin,
  beginViolin,
  buildRhythmChart,
  createViolinState,
  currentChartNote,
  getPieceProgress,
  isPieceComplete,
  pressViolinKey,
  rhythmLaneIndexForPitch,
  rhythmChartEndMs,
  type ViolinState,
} from '../../../src/activities/violin/violinModel';

function advanceToFirstNote(): ViolinState {
  return advanceViolin(beginViolin(createViolinState()), RHYTHM_LEAD_IN_MS);
}

function keyForPitch(pitchId: string): string {
  return RHYTHM_LANES[rhythmLaneIndexForPitch(pitchId)].key;
}

describe('melody data', () => {
  it('keeps the edited story caption for the completed-piece finale', () => {
    expect(VIOLIN_FINALE_CAPTION).toBe('Follow the light');
  });

  it('uses the existing seven interactive measures as the rhythm chart', () => {
    expect(VIOLIN_PHRASES.map((phrase) => phrase.notes.map((note) => note.pitchId))).toEqual([
      ['a4', 'g4', 'f4', 'g4'],
      ['a4', 'bb4', 'c5', 'a4', 'g4'],
      ['f4', 'e4', 'd4', 'e4', 'f4'],
      ['c4', 'd4', 'c4', 'bb3', 'a3'],
      ['c4', 'f4', 'a4', 'g4'],
      ['fs4', 'g4', 'd4', 'f4'],
      ['e4', 'e4', 'f4', 'g4'],
    ]);
    expect(VIOLIN_PHRASES.flatMap((phrase) => phrase.notes)).toHaveLength(31);
    expect(RHYTHM_CHART).toHaveLength(31);
  });

  it('retains the complete measures 1–9 passage for downstream story cues', () => {
    expect(VIOLIN_FINALE_PHRASES.flatMap((phrase) => phrase.notes)).toHaveLength(59);
    expect(VIOLIN_FINALE_PHRASES.at(-1)?.notes.at(-1)).toEqual({
      pitchId: 'f4',
      durationMs: VIOLIN_RHYTHM_MS.dottedHalf,
    });
  });

  it('continues the Boatigami lantern melody from rolling into kindling', () => {
    const passage = VIOLIN_FINALE_PHRASES.flatMap((phrase) => phrase.notes);
    expect([...VIOLIN_SHEET_ROLL_MOTIF, ...VIOLIN_SHEET_KINDLE_MOTIF]).toEqual(
      passage.slice(0, 10),
    );
  });

  it('maps every pitch to a unique key and every note to a known pitch', () => {
    const keys = VIOLIN_PITCHES.map((pitch) => pitch.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const note of VIOLIN_FINALE_PHRASES.flatMap((phrase) => phrase.notes)) {
      expect(getPitch(note.pitchId)).toBeDefined();
    }
    expect(getPitchByKey('a')?.key).toBe('A');
    expect(getPitchByKey(" ' ")?.id).toBe('c5');
    expect(getPitchByKey('Z')).toBeUndefined();
  });
});

describe('violinModel — chart', () => {
  it('starts after a three-beat lead-in and preserves authored note spacing', () => {
    const chart = buildRhythmChart();
    expect(chart[0].timeMs).toBe(RHYTHM_LEAD_IN_MS);
    for (let index = 1; index < chart.length; index += 1) {
      const previous = chart[index - 1];
      const current = chart[index];
      const source = VIOLIN_PHRASES[current.phraseIndex].notes[current.noteIndex];
      expect(current.timeMs).toBe(
        previous.timeMs +
          previous.durationMs +
          Math.round((source.delayBeforeMs ?? 0) * RHYTHM_TIME_SCALE),
      );
    }
  });

  it('keeps every chart note tied to its source measure and pitch', () => {
    for (const chartNote of RHYTHM_CHART) {
      const source = VIOLIN_PHRASES[chartNote.phraseIndex].notes[chartNote.noteIndex];
      expect(chartNote.pitchId).toBe(source.pitchId);
      expect(chartNote.durationMs).toBe(Math.round(source.durationMs * RHYTHM_TIME_SCALE));
      expect(chartNote.index).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses four broad lanes and slows the original passage to 75 BPM', () => {
    expect(RHYTHM_LANES.map((lane) => lane.key)).toEqual(['D', 'F', 'J', 'K']);
    expect(RHYTHM_TIME_SCALE).toBeCloseTo(4 / 3);
    expect(new Set(RHYTHM_CHART.map((note) => rhythmLaneIndexForPitch(note.pitchId))).size)
      .toBeLessThanOrEqual(4);
  });
});

describe('violinModel — timing and scoring', () => {
  it('waits in a ready state until the player deliberately begins', () => {
    const ready = createViolinState();
    expect(ready.phase).toBe('ready');
    expect(advanceViolin(ready, 10_000)).toBe(ready);
    expect(beginViolin(ready).phase).toBe('count-in');
  });

  it('counts in, then opens play exactly when the first note reaches the line', () => {
    const almost = advanceViolin(beginViolin(createViolinState()), RHYTHM_LEAD_IN_MS - 1);
    expect(almost.phase).toBe('count-in');
    const ready = advanceViolin(almost, 1);
    expect(ready.phase).toBe('playing');
    expect(currentChartNote(ready)).toBe(RHYTHM_CHART[0]);
  });

  it('awards Perfect at the line and grows score and combo', () => {
    const ready = advanceToFirstNote();
    const hit = pressViolinKey(ready, keyForPitch(RHYTHM_CHART[0].pitchId));
    expect(hit.lastJudgement).toBe('perfect');
    expect(hit.score).toBe(1000);
    expect(hit.combo).toBe(1);
    expect(hit.perfectCount).toBe(1);
    expect(hit.nextNoteIndex).toBe(1);
  });

  it('awards Good inside the outer window', () => {
    const late = advanceViolin(advanceToFirstNote(), PERFECT_WINDOW_MS + 1);
    const hit = pressViolinKey(late, keyForPitch(RHYTHM_CHART[0].pitchId));
    expect(hit.lastJudgement).toBe('good');
    expect(hit.score).toBe(600);
    expect(hit.goodCount).toBe(1);
  });

  it('ignores an early lane press outside the timing window', () => {
    let state = advanceToFirstNote();
    state = pressViolinKey(state, keyForPitch(RHYTHM_CHART[0].pitchId));
    const early = pressViolinKey(state, keyForPitch(RHYTHM_CHART[1].pitchId));
    expect(early).toBe(state);
  });

  it('spends the current note as a Miss for a wrong mapped lane in-window', () => {
    const ready = advanceToFirstNote();
    const expected = keyForPitch(RHYTHM_CHART[0].pitchId);
    const wrong = RHYTHM_LANES.find((lane) => lane.key !== expected)!.key;
    const miss = pressViolinKey(ready, wrong);
    expect(miss.lastJudgement).toBe('miss');
    expect(miss.missCount).toBe(1);
    expect(miss.nextNoteIndex).toBe(1);
    expect(miss.combo).toBe(0);
  });

  it('ignores unmapped keys and input outside play', () => {
    const counting = createViolinState();
    expect(pressViolinKey(counting, 'L')).toBe(counting);
    const ready = advanceToFirstNote();
    expect(pressViolinKey(ready, 'Z')).toBe(ready);
  });

  it('automatically misses overdue notes, including several after a long frame', () => {
    const state = advanceViolin(
      beginViolin(createViolinState()),
      RHYTHM_CHART[3].timeMs + GOOD_WINDOW_MS + 1,
    );
    expect(state.nextNoteIndex).toBe(4);
    expect(state.missCount).toBe(4);
    expect(state.phase).toBe('playing');
  });

  it('resets combo on a miss while preserving max combo', () => {
    let state = advanceToFirstNote();
    state = pressViolinKey(state, keyForPitch(RHYTHM_CHART[0].pitchId));
    state = advanceViolin(state, RHYTHM_CHART[1].timeMs - state.elapsedMs);
    state = pressViolinKey(state, keyForPitch(RHYTHM_CHART[1].pitchId));
    expect(state.combo).toBe(2);
    state = advanceViolin(state, RHYTHM_CHART[2].timeMs - state.elapsedMs);
    const expected = keyForPitch(RHYTHM_CHART[2].pitchId);
    const wrong = RHYTHM_LANES.find((lane) => lane.key !== expected)!.key;
    state = pressViolinKey(state, wrong);
    expect(state.combo).toBe(0);
    expect(state.maxCombo).toBe(2);
  });
});

describe('violinModel — completion', () => {
  it('reports progress from judged notes', () => {
    let state = advanceToFirstNote();
    expect(getPieceProgress(state)).toBe(0);
    state = pressViolinKey(state, keyForPitch(RHYTHM_CHART[0].pitchId));
    expect(getPieceProgress(state)).toBeCloseTo(1 / RHYTHM_CHART.length);
  });

  it('enters the finale after the chart even when every note was missed', () => {
    const state = advanceViolin(
      beginViolin(createViolinState()),
      rhythmChartEndMs() + RHYTHM_OUTRO_MS,
    );
    expect(state.nextNoteIndex).toBe(RHYTHM_CHART.length);
    expect(state.missCount).toBe(RHYTHM_CHART.length);
    expect(state.phase).toBe('finale');
    expect(state.finished).toBe(false);
  });

  it('completes after the golden finale hold', () => {
    const finale = advanceViolin(
      beginViolin(createViolinState()),
      rhythmChartEndMs() + RHYTHM_OUTRO_MS,
    );
    const complete = advanceViolin(finale, FINALE_HOLD_MS);
    expect(complete.phase).toBe('complete');
    expect(complete.finished).toBe(true);
    expect(isPieceComplete(complete)).toBe(true);
    expect(getPieceProgress(complete)).toBe(1);
  });

  it('uses non-overlapping timing windows', () => {
    expect(PERFECT_WINDOW_MS).toBeLessThan(GOOD_WINDOW_MS);
    expect(GOOD_WINDOW_MS).toBeLessThanOrEqual(300);
  });
});
