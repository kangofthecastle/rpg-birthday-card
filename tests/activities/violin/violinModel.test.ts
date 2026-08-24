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
  RHYTHM_FINAL_NOTE_DURATION_MS,
  RHYTHM_FINAL_BPM,
  RHYTHM_FINAL_TEMPO_NOTES,
  RHYTHM_LANES,
  RHYTHM_LEAD_IN_MS,
  RHYTHM_MID_HOLD_EXTENSION_MS,
  RHYTHM_MID_HOLD_NOTE_NUMBER,
  RHYTHM_NOTE_APPROACH_MS,
  RHYTHM_OUTRO_MS,
  RHYTHM_TIME_SCALE,
  RHYTHM_START_BPM,
  RHYTHM_TEMPO_RAMP_NOTES,
  VIOLIN_MISS_PENALTY,
  VIOLIN_HOLD_POINTS_PER_TICK,
  VIOLIN_PASS_SCORE,
  advanceViolin,
  awardViolinHoldTicks,
  beginViolin,
  buildRhythmChart,
  createViolinState,
  currentChartNote,
  getPieceProgress,
  isPieceComplete,
  isSustainedRhythmNote,
  pressViolinKey,
  rhythmChartEndMs,
  rhythmTempoBpmForNote,
  rhythmTimeScaleForNote,
  type ViolinState,
} from '../../../src/activities/violin/violinModel';

function advanceToFirstNote(): ViolinState {
  return advanceViolin(beginViolin(createViolinState()), RHYTHM_CHART[0].timeMs);
}

function keyForNote(note: (typeof RHYTHM_CHART)[number]): string {
  return RHYTHM_LANES[note.laneIndex].key;
}

function playPerfectRunToFinale(): ViolinState {
  let state = advanceToFirstNote();
  for (const note of RHYTHM_CHART) {
    state = advanceViolin(state, note.timeMs - state.elapsedMs);
    state = pressViolinKey(state, keyForNote(note));
  }
  return advanceViolin(
    state,
    rhythmChartEndMs() + RHYTHM_OUTRO_MS - state.elapsedMs,
  );
}

describe('melody data', () => {
  it('extends the rhythm chart through the previous game finale passage', () => {
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
    expect(RHYTHM_CHART).toHaveLength(59);
    expect(RHYTHM_CHART.map((note) => note.pitchId)).toEqual(
      VIOLIN_FINALE_PHRASES.flatMap((phrase) => phrase.notes.map((note) => note.pitchId)),
    );
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
  it('starts after the three-beat count-in and a full note approach', () => {
    const chart = buildRhythmChart();
    expect(chart[0].timeMs).toBe(RHYTHM_LEAD_IN_MS + RHYTHM_NOTE_APPROACH_MS);
    for (let index = 1; index < chart.length; index += 1) {
      const previous = chart[index - 1];
      const current = chart[index];
      const source = VIOLIN_FINALE_PHRASES[current.phraseIndex].notes[current.noteIndex];
      expect(current.timeMs).toBe(
          previous.timeMs +
          previous.durationMs +
          Math.round((source.delayBeforeMs ?? 0) * rhythmTimeScaleForNote(current.index)),
      );
    }
  });

  it('keeps every chart note tied to its source measure and pitch', () => {
    for (const chartNote of RHYTHM_CHART) {
      const source = VIOLIN_FINALE_PHRASES[chartNote.phraseIndex].notes[chartNote.noteIndex];
      expect(chartNote.pitchId).toBe(source.pitchId);
      expect(chartNote.laneIndex).toBeGreaterThanOrEqual(0);
      expect(chartNote.laneIndex).toBeLessThan(RHYTHM_LANES.length);
      expect(chartNote.durationMs).toBe(
        chartNote.index === RHYTHM_CHART.length - 1
          ? RHYTHM_FINAL_NOTE_DURATION_MS
          : Math.round(source.durationMs * rhythmTimeScaleForNote(chartNote.index)) +
            (chartNote.index === RHYTHM_MID_HOLD_NOTE_NUMBER - 1
              ? RHYTHM_MID_HOLD_EXTENSION_MS
              : 0),
      );
      expect(chartNote.index).toBeGreaterThanOrEqual(0);
    }
  });

  it('extends displayed note 31 by one second and marks only it and the finale sustained', () => {
    const note31 = RHYTHM_CHART[RHYTHM_MID_HOLD_NOTE_NUMBER - 1];
    const source = VIOLIN_FINALE_PHRASES[note31.phraseIndex].notes[note31.noteIndex];
    expect(note31.durationMs).toBe(
      Math.round(source.durationMs * rhythmTimeScaleForNote(note31.index)) +
        RHYTHM_MID_HOLD_EXTENSION_MS,
    );
    expect(isSustainedRhythmNote(note31.index)).toBe(true);
    expect(isSustainedRhythmNote(RHYTHM_CHART.length - 1)).toBe(true);
    expect(isSustainedRhythmNote(note31.index - 1)).toBe(false);
  });

  it('awards hold points in deterministic whole ticks', () => {
    const playing = advanceToFirstNote();
    const scored = awardViolinHoldTicks(playing, 3);
    expect(scored.score).toBe(playing.score + VIOLIN_HOLD_POINTS_PER_TICK * 3);
    expect(awardViolinHoldTicks(playing, 0)).toBe(playing);
    expect(awardViolinHoldTicks(playing, 0.8)).toBe(playing);
  });

  it('uses four broad lanes and begins the passage at 80 BPM', () => {
    expect(RHYTHM_LANES.map((lane) => lane.key)).toEqual(['D', 'F', 'J', 'K']);
    expect(RHYTHM_TIME_SCALE).toBeCloseTo(100 / RHYTHM_START_BPM);
    expect(new Set(RHYTHM_CHART.map((note) => note.laneIndex))).toEqual(
      new Set([0, 1, 2, 3]),
    );
  });

  it('ramps down smoothly before holding the final four notes at 75 BPM', () => {
    const finalStart = RHYTHM_CHART.length - RHYTHM_FINAL_TEMPO_NOTES;
    const rampStart = finalStart - RHYTHM_TEMPO_RAMP_NOTES;
    expect(rhythmTempoBpmForNote(0)).toBe(RHYTHM_START_BPM);

    const ramp = Array.from(
      { length: RHYTHM_TEMPO_RAMP_NOTES },
      (_, offset) => rhythmTempoBpmForNote(rampStart + offset),
    );
    expect(ramp[0]).toBeLessThan(RHYTHM_START_BPM);
    expect(ramp.at(-1)).toBe(RHYTHM_FINAL_BPM);
    for (let index = 1; index < ramp.length; index += 1) {
      expect(ramp[index]).toBeLessThanOrEqual(ramp[index - 1]);
    }

    for (let index = finalStart; index < RHYTHM_CHART.length; index += 1) {
      expect(rhythmTempoBpmForNote(index)).toBe(RHYTHM_FINAL_BPM);
    }
  });

  it('changes lanes for larger leaps while allowing two-step intervals to share', () => {
    let runLength = 1;
    let longestRun = 1;
    for (let index = 1; index < RHYTHM_CHART.length; index += 1) {
      const previous = RHYTHM_CHART[index - 1];
      const current = RHYTHM_CHART[index];
      const previousPitch = getPitch(previous.pitchId)!;
      const currentPitch = getPitch(current.pitchId)!;
      const pitchDelta = currentPitch.staffStep - previousPitch.staffStep;
      const laneDelta = current.laneIndex - previous.laneIndex;

      if (Math.abs(pitchDelta) > 2) {
        expect(laneDelta).not.toBe(0);
      }
      expect(pitchDelta * laneDelta).toBeGreaterThanOrEqual(0);

      runLength = laneDelta === 0 ? runLength + 1 : 1;
      longestRun = Math.max(longestRun, runLength);
    }
    expect(longestRun).toBeLessThanOrEqual(3);
  });

});

describe('violinModel — timing and scoring', () => {
  it('waits in a ready state until the player deliberately begins', () => {
    const ready = createViolinState();
    expect(ready.phase).toBe('ready');
    expect(advanceViolin(ready, 10_000)).toBe(ready);
    expect(beginViolin(ready).phase).toBe('count-in');
  });

  it('finishes the count-in before the first note approaches', () => {
    const almost = advanceViolin(beginViolin(createViolinState()), RHYTHM_LEAD_IN_MS - 1);
    expect(almost.phase).toBe('count-in');
    const ready = advanceViolin(almost, 1);
    expect(ready.phase).toBe('playing');
    expect(currentChartNote(ready)).toBe(RHYTHM_CHART[0]);
    expect(RHYTHM_CHART[0].timeMs - ready.elapsedMs).toBe(RHYTHM_NOTE_APPROACH_MS);
  });

  it('awards Perfect at the line and grows score and combo', () => {
    const ready = advanceToFirstNote();
    const hit = pressViolinKey(ready, keyForNote(RHYTHM_CHART[0]));
    expect(hit.lastJudgement).toBe('perfect');
    expect(hit.score).toBe(1000);
    expect(hit.combo).toBe(1);
    expect(hit.perfectCount).toBe(1);
    expect(hit.nextNoteIndex).toBe(1);
  });

  it('awards Good inside the outer window', () => {
    const late = advanceViolin(advanceToFirstNote(), PERFECT_WINDOW_MS + 1);
    const hit = pressViolinKey(late, keyForNote(RHYTHM_CHART[0]));
    expect(hit.lastJudgement).toBe('good');
    expect(hit.score).toBe(600);
    expect(hit.goodCount).toBe(1);
  });

  it('ignores an early lane press outside the timing window', () => {
    let state = advanceToFirstNote();
    state = pressViolinKey(state, keyForNote(RHYTHM_CHART[0]));
    const early = pressViolinKey(state, keyForNote(RHYTHM_CHART[1]));
    expect(early).toBe(state);
  });

  it('spends the current note as a Miss for a wrong mapped lane in-window', () => {
    const ready = advanceToFirstNote();
    const expected = keyForNote(RHYTHM_CHART[0]);
    const wrong = RHYTHM_LANES.find((lane) => lane.key !== expected)!.key;
    const miss = pressViolinKey(ready, wrong);
    expect(miss.lastJudgement).toBe('miss');
    expect(miss.missCount).toBe(1);
    expect(miss.score).toBe(0);
    expect(miss.nextNoteIndex).toBe(1);
    expect(miss.combo).toBe(0);
  });

  it('subtracts the miss penalty without letting the score fall below zero', () => {
    let state = advanceToFirstNote();
    state = pressViolinKey(state, keyForNote(RHYTHM_CHART[0]));
    expect(state.score).toBe(1_000);

    state = advanceViolin(state, RHYTHM_CHART[1].timeMs - state.elapsedMs);
    const expected = keyForNote(RHYTHM_CHART[1]);
    const wrong = RHYTHM_LANES.find((lane) => lane.key !== expected)!.key;
    state = pressViolinKey(state, wrong);
    expect(state.score).toBe(Math.max(0, 1_000 - VIOLIN_MISS_PENALTY));
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
    state = pressViolinKey(state, keyForNote(RHYTHM_CHART[0]));
    state = advanceViolin(state, RHYTHM_CHART[1].timeMs - state.elapsedMs);
    state = pressViolinKey(state, keyForNote(RHYTHM_CHART[1]));
    expect(state.combo).toBe(2);
    state = advanceViolin(state, RHYTHM_CHART[2].timeMs - state.elapsedMs);
    const expected = keyForNote(RHYTHM_CHART[2]);
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
    state = pressViolinKey(state, keyForNote(RHYTHM_CHART[0]));
    expect(getPieceProgress(state)).toBeCloseTo(1 / RHYTHM_CHART.length);
  });

  it('offers an unlimited retry when the run finishes below the pass score', () => {
    const state = advanceViolin(
      beginViolin(createViolinState()),
      rhythmChartEndMs() + RHYTHM_OUTRO_MS,
    );
    expect(state.nextNoteIndex).toBe(RHYTHM_CHART.length);
    expect(state.missCount).toBe(RHYTHM_CHART.length);
    expect(state.score).toBe(0);
    expect(state.score).toBeLessThan(VIOLIN_PASS_SCORE);
    expect(state.phase).toBe('retry');
    expect(state.finished).toBe(false);

    const restarted = beginViolin(state);
    expect(restarted.phase).toBe('count-in');
    expect(restarted.nextNoteIndex).toBe(0);
    expect(restarted.score).toBe(0);
    expect(restarted.missCount).toBe(0);
  });

  it('enters the finale only after earning the pass score', () => {
    const finale = playPerfectRunToFinale();
    expect(VIOLIN_PASS_SCORE).toBe(60_000);
    expect(finale.score).toBeGreaterThanOrEqual(VIOLIN_PASS_SCORE);
    expect(finale.phase).toBe('finale');
    expect(finale.finished).toBe(false);
  });

  it('completes a passing run after the golden finale hold', () => {
    const finale = playPerfectRunToFinale();
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
