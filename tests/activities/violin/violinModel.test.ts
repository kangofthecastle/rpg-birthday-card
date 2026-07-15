import { describe, expect, it } from 'vitest';
import {
  VIOLIN_FINALE_PHRASES,
  VIOLIN_PHRASES,
  VIOLIN_PITCHES,
  VIOLIN_RHYTHM_MS,
  getPitch,
  getPitchByKey,
} from '../../../src/activities/violin/melody';
import {
  FINALE_LEAD_IN_MS,
  FINALE_PHRASE_GAP_MS,
  HANDOFF_MS,
  MIN_TEMPO_SCALE,
  advanceViolin,
  createViolinState,
  expectedPitchId,
  finaleTimeline,
  finaleTotalMs,
  getPhrase,
  getPieceProgress,
  isFinalPhrase,
  isPieceComplete,
  litNoteCount,
  noteStartMs,
  playbackDurationMs,
  playbackLitCount,
  pressViolinKey,
  VIOLIN_FINALE_CAPTION,
  type ViolinState,
} from '../../../src/activities/violin/violinModel';

/** Advance far enough that the current phrase's playback completes and the echo
 * opens. */
function runPlaybackToEcho(state: ViolinState): ViolinState {
  const phrase = getPhrase(state);
  if (!phrase) {
    throw new Error('no phrase');
  }
  const total = playbackDurationMs(phrase, state.tempoScale);
  const advanced = advanceViolin(state, total + 1);
  if (advanced.phase !== 'echo') {
    throw new Error(`expected echo, got ${advanced.phase}`);
  }
  return advanced;
}

/** The keyboard key for the note the echo currently expects. */
function expectedKey(state: ViolinState): string {
  const pitchId = expectedPitchId(state);
  const pitch = pitchId ? getPitch(pitchId) : undefined;
  if (!pitch) {
    throw new Error('no expected key');
  }
  return pitch.key;
}

/** Echo the current phrase in full, one correct key at a time. Lands on 'handoff'
 * for a mid-song phrase, or 'finale' for the final phrase. */
function echoWholePhrase(state: ViolinState): ViolinState {
  const phrase = getPhrase(state);
  if (!phrase) {
    throw new Error('no phrase');
  }
  let next = state;
  for (let i = 0; i < phrase.notes.length; i += 1) {
    next = pressViolinKey(next, expectedKey(next));
  }
  return next;
}

/** From a mid-song 'handoff', let the beat elapse into the next phrase's playback
 * and run that playback to its echo. */
function handoffToNextEcho(state: ViolinState): ViolinState {
  const afterBeat = advanceViolin(state, HANDOFF_MS + 1);
  if (afterBeat.phase !== 'playback') {
    throw new Error(`expected playback after handoff, got ${afterBeat.phase}`);
  }
  return runPlaybackToEcho(afterBeat);
}

describe('melody data', () => {
  it('uses the edited story caption for the completed-piece finale', () => {
    expect(VIOLIN_FINALE_CAPTION).toBe('Follow the light');
  });

  it('uses compact musical pages and stops the interactive ending on its first K', () => {
    expect(VIOLIN_PHRASES.map((phrase) => phrase.notes.map((note) => note.pitchId))).toEqual([
      ['a4', 'g4', 'f4', 'g4'],
      ['a4', 'bb4', 'c5', 'a4', 'g4'],
      ['f4', 'e4', 'd4', 'e4', 'f4'],
      ['c4', 'd4', 'c4', 'bb3', 'a3'],
      ['c4', 'f4', 'a4', 'g4'],
      ['fs4', 'g4', 'd4', 'f4'],
      ['e4', 'e4', 'f4', 'g4'],
    ]);

    const { dottedEighth, eighth, sixteenth, quarter, tripletEighth } = VIOLIN_RHYTHM_MS;
    expect(VIOLIN_PHRASES.map((phrase) => phrase.notes.map((note) => note.durationMs))).toEqual([
      [dottedEighth, sixteenth, dottedEighth, sixteenth],
      [dottedEighth, sixteenth, quarter, tripletEighth, tripletEighth],
      [tripletEighth, dottedEighth, sixteenth, dottedEighth, sixteenth],
      [quarter, tripletEighth, tripletEighth, tripletEighth, dottedEighth],
      [eighth, dottedEighth, sixteenth, dottedEighth],
      [sixteenth, dottedEighth, sixteenth, dottedEighth],
      [sixteenth, dottedEighth, sixteenth, quarter],
    ]);
    expect(VIOLIN_PHRASES.every((phrase) => phrase.notes.length <= 5)).toBe(true);
    expect(VIOLIN_PHRASES.every((phrase) => phrase.notes.length >= 4)).toBe(true);
  });

  it('retains the complete measures 1–9 passage for the finale replay', () => {
    expect(
      VIOLIN_FINALE_PHRASES.map((phrase) => phrase.notes.map((note) => note.pitchId)),
    ).toEqual([
      ['a4', 'g4', 'f4', 'g4'],
      ['a4', 'bb4', 'c5', 'a4', 'g4', 'f4'],
      ['e4', 'd4', 'e4', 'f4'],
      ['c4', 'd4', 'c4', 'bb3'],
      ['a3', 'c4', 'f4', 'a4'],
      ['g4', 'fs4', 'g4', 'd4'],
      ['f4', 'e4', 'e4', 'f4'],
      ['g4', 'a4', 'g4', 'f4', 'g4', 'a4'],
      ['bb4', 'c5', 'a4', 'g4', 'f4'],
      ['e4', 'd4', 'e4', 'f4'],
      ['c4', 'd4', 'c4', 'bb3'],
      ['a3', 'c4', 'f4', 'a4', 'g4', 'fs4'],
      ['g4', 'bb4', 'e4', 'f4'],
    ]);

    const { dottedEighth, dottedHalf, sixteenth, quarter, tripletEighth } =
      VIOLIN_RHYTHM_MS;
    expect(
      VIOLIN_FINALE_PHRASES.map((phrase) => phrase.notes.map((note) => note.durationMs)),
    ).toEqual([
      [dottedEighth, sixteenth, dottedEighth, sixteenth],
      [dottedEighth, sixteenth, quarter, tripletEighth, tripletEighth, tripletEighth],
      [dottedEighth, sixteenth, dottedEighth, sixteenth],
      [quarter, tripletEighth, tripletEighth, tripletEighth],
      [dottedEighth, sixteenth, dottedEighth, sixteenth],
      [dottedEighth, sixteenth, dottedEighth, sixteenth],
      [dottedEighth, sixteenth, dottedEighth, sixteenth],
      [quarter, dottedEighth, sixteenth, dottedEighth, sixteenth, dottedEighth],
      [sixteenth, quarter, tripletEighth, tripletEighth, tripletEighth],
      [dottedEighth, sixteenth, dottedEighth, sixteenth],
      [quarter, tripletEighth, tripletEighth, tripletEighth],
      [dottedEighth, sixteenth, dottedEighth, sixteenth, tripletEighth, tripletEighth],
      [tripletEighth, dottedEighth, sixteenth, dottedHalf],
    ]);
    expect(VIOLIN_FINALE_PHRASES.flatMap((phrase) => phrase.notes)).toHaveLength(59);
    const interactiveNotes = VIOLIN_PHRASES.flatMap((phrase) => phrase.notes);
    expect(interactiveNotes.map((note) => note.pitchId)).toEqual(
      VIOLIN_FINALE_PHRASES.flatMap((phrase) => phrase.notes).slice(0, 31).map((note) => note.pitchId),
    );
    expect(getPitch(interactiveNotes.at(-1)?.pitchId ?? '')?.key).toBe('K');
  });

  it('maps every pitch to a unique key and every note to a known pitch', () => {
    const keys = VIOLIN_PITCHES.map((pitch) => pitch.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const phrase of VIOLIN_FINALE_PHRASES) {
      for (const note of phrase.notes) {
        expect(getPitch(note.pitchId)).toBeDefined();
      }
    }
  });

  it('looks pitches up by key case-insensitively and rejects unmapped keys', () => {
    expect(getPitchByKey('a')?.key).toBe('A');
    expect(getPitchByKey(" ' ")?.id).toBe('c5');
    expect(getPitchByKey('Z')).toBeUndefined();
  });

  it('distinguishes the passage\'s flats and F-sharp in notation and graph data', () => {
    const natural = getPitch('f4');
    const sharp = getPitch('fs4');
    expect(sharp?.staffStep).toBe(natural?.staffStep);
    expect(sharp?.graphStep).toBeGreaterThan(natural?.graphStep ?? -1);
    expect(sharp?.accidental).toBe('sharp');
    expect(getPitch('bb3')?.accidental).toBe('flat');
    expect(getPitch('bb4')?.accidental).toBe('flat');
  });
});

describe('violinModel — playback', () => {
  it('starts on the first phrase, playing itself', () => {
    const state = createViolinState();
    expect(state.phase).toBe('playback');
    expect(state.phraseIndex).toBe(0);
    // The first note sounds/lights immediately at t=0.
    expect(litNoteCount(state)).toBe(1);
    expect(expectedPitchId(state)).toBeUndefined();
  });

  it('lights notes one by one as playback time elapses', () => {
    const phrase = VIOLIN_PHRASES[1];
    // Between the second and third note's start times → first two lit.
    const midSecondNoteMs = phrase.notes[0].durationMs + 10;
    expect(playbackLitCount(phrase, midSecondNoteMs, 1)).toBe(2);
    // The first note lights at t=0; the third only once its start is reached.
    expect(playbackLitCount(phrase, 0, 1)).toBe(1);
    const thirdStart = phrase.notes[0].durationMs + phrase.notes[1].durationMs;
    expect(playbackLitCount(phrase, thirdStart, 1)).toBe(3);
  });

  it('preserves the printed dotted-half sustain in measure 9', () => {
    const phrase = VIOLIN_FINALE_PHRASES.at(-1)!;
    const resolveIndex = 3;
    const resolveStart = noteStartMs(phrase, resolveIndex, 1);
    expect(phrase.notes[resolveIndex].durationMs).toBe(VIOLIN_RHYTHM_MS.dottedHalf);
    expect(phrase.notes[resolveIndex].pitchId).toBe('f4');
    expect(noteStartMs(phrase, phrase.notes.length, 1) - resolveStart).toBe(
      VIOLIN_RHYTHM_MS.dottedHalf,
    );
  });

  it('opens the echo once playback (plus its tail) has elapsed', () => {
    const state = runPlaybackToEcho(createViolinState());
    expect(state.phase).toBe('echo');
    expect(state.echoIndex).toBe(0);
    expect(litNoteCount(state)).toBe(0);
    expect(expectedPitchId(state)).toBe(VIOLIN_PHRASES[0].notes[0].pitchId);
  });
});

describe('violinModel — echo resolution', () => {
  it('rings and advances on the correct key', () => {
    let state = runPlaybackToEcho(createViolinState());
    const key = expectedKey(state);
    state = pressViolinKey(state, key);
    expect(state.lastResult).toBe('ring');
    expect(state.echoIndex).toBe(1);
    expect(litNoteCount(state)).toBe(1);
  });

  it('ignores unmapped keys entirely (no miss)', () => {
    const state = runPlaybackToEcho(createViolinState());
    const after = pressViolinKey(state, 'Z');
    expect(after).toBe(state);
  });

  it('treats a wrong mapped note as a gentle waver: resets and replays slower', () => {
    const state = runPlaybackToEcho(createViolinState());
    const expected = expectedKey(state);
    const wrong = VIOLIN_PITCHES.find((pitch) => pitch.key !== expected)!.key;
    const after = pressViolinKey(state, wrong);
    expect(after.lastResult).toBe('waver');
    expect(after.phase).toBe('playback');
    expect(after.echoIndex).toBe(0);
    expect(after.tempoScale).toBeCloseTo(0.9, 5);
    expect(after.phraseIndex).toBe(0);
    expect(after.finished).toBe(false);
  });

  it('never slows past the tempo floor no matter how many misses', () => {
    let state = runPlaybackToEcho(createViolinState());
    for (let i = 0; i < 20; i += 1) {
      const expected = expectedKey(state);
      const wrong = VIOLIN_PITCHES.find((pitch) => pitch.key !== expected)!.key;
      state = pressViolinKey(state, wrong);
      state = runPlaybackToEcho(state);
    }
    expect(state.tempoScale).toBeGreaterThanOrEqual(MIN_TEMPO_SCALE);
    expect(state.tempoScale).toBeCloseTo(MIN_TEMPO_SCALE, 5);
  });

  it('a miss stretches playback duration (slower), never shortens it', () => {
    const phrase = VIOLIN_PHRASES[0];
    const atFull = playbackDurationMs(phrase, 1);
    const atSlow = playbackDurationMs(phrase, 0.8);
    expect(atSlow).toBeGreaterThan(atFull);
  });
});

describe('violinModel — instant handoff (no takeover)', () => {
  it('landing a mid-song phrase\'s last note opens the handoff beat, then the next phrase plays', () => {
    const start = runPlaybackToEcho(createViolinState());
    const phrase = getPhrase(start)!;
    const afterEcho = echoWholePhrase(start);

    // She played every note herself — the phrase holds, fully lit, for the beat.
    expect(afterEcho.phase).toBe('handoff');
    expect(afterEcho.lastResult).toBe('ring');
    expect(afterEcho.phraseIndex).toBe(0);
    expect(afterEcho.echoIndex).toBe(phrase.notes.length);
    expect(litNoteCount(afterEcho)).toBe(phrase.notes.length);
    expect(isFinalPhrase(afterEcho)).toBe(false);

    // The beat is brief; before it elapses we are still holding on phrase 0.
    const midBeat = advanceViolin(afterEcho, HANDOFF_MS - 1);
    expect(midBeat.phase).toBe('handoff');
    expect(midBeat.phraseIndex).toBe(0);

    // Once the beat is up, the NEXT phrase begins playing itself immediately.
    const afterBeat = advanceViolin(midBeat, 2);
    expect(afterBeat.phase).toBe('playback');
    expect(afterBeat.phraseIndex).toBe(1);
    expect(afterBeat.echoIndex).toBe(0);
    expect(afterBeat.tempoScale).toBe(1);
    // Playback starts from the top: the first note of phrase 2 is already lit.
    expect(litNoteCount(afterBeat)).toBe(1);
  });

  it('the handoff gap from last key to next playback stays under 700ms', () => {
    expect(HANDOFF_MS).toBeLessThanOrEqual(700);
  });

  it('never hands off mid-phrase: the final phrase is echoed entirely by the player', () => {
    let state = runPlaybackToEcho(createViolinState());
    for (let p = 0; p < VIOLIN_PHRASES.length - 1; p += 1) {
      state = handoffToNextEcho(echoWholePhrase(state));
    }
    expect(isFinalPhrase(state)).toBe(true);

    const phrase = getPhrase(state)!;
    // Every note but the last keeps us in the echo — no takeover anywhere.
    for (let i = 0; i < phrase.notes.length - 1; i += 1) {
      expect(state.phase).toBe('echo');
      state = pressViolinKey(state, expectedKey(state));
    }
    expect(state.phase).toBe('echo');
    // The player's own last note tips into the finale.
    state = pressViolinKey(state, expectedKey(state));
    expect(state.phase).toBe('finale');
    expect(state.echoIndex).toBe(phrase.notes.length);
    expect(state.finished).toBe(false);
  });
});

describe('violinModel — mistakes allowed (one forgiven slip per note)', () => {
  /** The key for some mapped note that is NOT the one currently expected. */
  function wrongKey(state: ViolinState): string {
    const expected = expectedKey(state);
    const pitch = VIOLIN_PITCHES.find((p) => p.key !== expected);
    if (!pitch) {
      throw new Error('no wrong key');
    }
    return pitch.key;
  }

  it('defaults to off: the first wrong press is a normal miss (unchanged behaviour)', () => {
    const state = runPlaybackToEcho(createViolinState());
    // No third argument → mistakes NOT allowed.
    const after = pressViolinKey(state, wrongKey(state));
    expect(after.phase).toBe('playback');
    expect(after.echoIndex).toBe(0);
    expect(after.recovering).toBe(false);
    expect(after.lastResult).toBe('waver');
  });

  it('a fresh state is not mid-recovery', () => {
    expect(createViolinState().recovering).toBe(false);
  });

  it('forgives the first wrong press: the phrase holds and waits for the right note', () => {
    const state = runPlaybackToEcho(createViolinState());
    const before = { phrase: state.phraseIndex, echo: state.echoIndex, tempo: state.tempoScale };

    const slipped = pressViolinKey(state, wrongKey(state), true);
    // No reset — same phrase, same cursor, still echoing, just flagged recovering.
    expect(slipped.phase).toBe('echo');
    expect(slipped.phraseIndex).toBe(before.phrase);
    expect(slipped.echoIndex).toBe(before.echo);
    expect(slipped.tempoScale).toBe(before.tempo);
    expect(slipped.recovering).toBe(true);
    expect(slipped.lastResult).toBe('waver');
  });

  it('recovers when the correct note is then played: it rings, advances, clears the flag', () => {
    let state = runPlaybackToEcho(createViolinState());
    const correct = expectedKey(state);
    state = pressViolinKey(state, wrongKey(state), true);
    expect(state.recovering).toBe(true);

    state = pressViolinKey(state, correct, true);
    expect(state.lastResult).toBe('ring');
    expect(state.echoIndex).toBe(1);
    expect(state.recovering).toBe(false);
    expect(state.phase).toBe('echo');
  });

  it('a SECOND wrong press while recovering is a normal miss (phrase resets, slower)', () => {
    let state = runPlaybackToEcho(createViolinState());
    state = pressViolinKey(state, wrongKey(state), true);
    expect(state.recovering).toBe(true);

    const second = pressViolinKey(state, wrongKey(state), true);
    expect(second.phase).toBe('playback');
    expect(second.echoIndex).toBe(0);
    expect(second.recovering).toBe(false);
    expect(second.tempoScale).toBeCloseTo(0.9, 5);
    expect(second.lastResult).toBe('waver');
  });

  it('grants a fresh slip on each note: recovery on note 0 does not spend note 1\'s grace', () => {
    let state = runPlaybackToEcho(createViolinState());
    // Slip + recover on the first note.
    state = pressViolinKey(state, wrongKey(state), true);
    state = pressViolinKey(state, expectedKey(state), true);
    expect(state.echoIndex).toBe(1);
    expect(state.recovering).toBe(false);
    // A wrong press on the SECOND note is again forgiven (its own grace).
    const slipped = pressViolinKey(state, wrongKey(state), true);
    expect(slipped.recovering).toBe(true);
    expect(slipped.phase).toBe('echo');
    expect(slipped.echoIndex).toBe(1);
  });

  it('a clean correct press (no prior slip) never enters recovery', () => {
    const state = runPlaybackToEcho(createViolinState());
    const after = pressViolinKey(state, expectedKey(state), true);
    expect(after.recovering).toBe(false);
    expect(after.lastResult).toBe('ring');
  });

  it('an unmapped key during recovery is ignored and keeps the recovering flag', () => {
    let state = runPlaybackToEcho(createViolinState());
    state = pressViolinKey(state, wrongKey(state), true);
    const after = pressViolinKey(state, 'Z', true);
    expect(after).toBe(state);
    expect(after.recovering).toBe(true);
  });
});

describe('violinModel — finale (whole-piece replay)', () => {
  function playToFinale(): ViolinState {
    let state = runPlaybackToEcho(createViolinState());
    for (let p = 0; p < VIOLIN_PHRASES.length - 1; p += 1) {
      state = handoffToNextEcho(echoWholePhrase(state));
    }
    expect(isFinalPhrase(state)).toBe(true);
    const inFinale = echoWholePhrase(state);
    expect(inFinale.phase).toBe('finale');
    expect(inFinale.phraseIndex).toBe(0);
    expect(getPhrase(inFinale)).toBe(VIOLIN_FINALE_PHRASES[0]);
    return inFinale;
  }

  it('builds a timeline that covers every note of the piece in order', () => {
    const timeline = finaleTimeline();
    const totalNotes = VIOLIN_FINALE_PHRASES.reduce((n, phrase) => n + phrase.notes.length, 0);
    expect(timeline).toHaveLength(totalNotes);
    // Start times are strictly increasing (one continuous line).
    for (let i = 1; i < timeline.length; i += 1) {
      expect(timeline[i].startMs).toBeGreaterThan(timeline[i - 1].startMs);
    }
    // Phrases appear in order, first note of the piece after the lead-in beat.
    expect(timeline[0].phraseIndex).toBe(0);
    expect(timeline[0].startMs).toBe(FINALE_LEAD_IN_MS);
    expect(timeline[timeline.length - 1].phraseIndex).toBe(
      VIOLIN_FINALE_PHRASES.length - 1,
    );
  });

  it('adds no silence at page boundaries during the whole-piece replay', () => {
    expect(FINALE_PHRASE_GAP_MS).toBe(0);
    const timeline = finaleTimeline();
    for (let i = 1; i < timeline.length; i += 1) {
      const previous = timeline[i - 1];
      const current = timeline[i];
      if (current.phraseIndex !== previous.phraseIndex) {
        expect(current.startMs).toBe(previous.startMs + previous.durationMs);
      }
    }
  });

  it('pages the staff through every phrase as the piece replays', () => {
    const state = playToFinale();
    // At the very top of the finale, nothing has replayed yet (lead-in beat).
    expect(litNoteCount(state)).toBe(0);

    // Just into phrase 0's replay: phrase 0 showing, its first note lit.
    const early = advanceViolin(state, FINALE_LEAD_IN_MS + 1);
    expect(early.phraseIndex).toBe(0);
    expect(litNoteCount(early)).toBe(1);

    // More notes of phrase 0 ignite in sequence.
    const phrase0 = VIOLIN_FINALE_PHRASES[0];
    const twoNotesIn = advanceViolin(early, phrase0.notes[0].durationMs + 5);
    expect(twoNotesIn.phraseIndex).toBe(0);
    expect(litNoteCount(twoNotesIn)).toBeGreaterThan(litNoteCount(early));

    // Near the very end the staff has paged all the way to the last phrase.
    const nearEnd = advanceViolin(state, finaleTotalMs() - 1);
    expect(nearEnd.phraseIndex).toBe(VIOLIN_FINALE_PHRASES.length - 1);
    expect(litNoteCount(nearEnd)).toBe(getPhrase(nearEnd)!.notes.length);
  });

  it('completes only after the whole replay (plus its closing hold) has run', () => {
    const state = playToFinale();
    expect(isPieceComplete(state)).toBe(false);

    const almost = advanceViolin(state, finaleTotalMs() - 1);
    expect(almost.finished).toBe(false);

    const done = advanceViolin(almost, 2);
    expect(done.phase).toBe('complete');
    expect(isPieceComplete(done)).toBe(true);
    expect(litNoteCount(done)).toBe(getPhrase(done)!.notes.length);
    expect(getPieceProgress(done)).toBe(1);
  });

  it('ignores further advances and presses once complete', () => {
    const state = advanceViolin(playToFinale(), finaleTotalMs() + 100);
    const afterAdvance = advanceViolin(state, 1000);
    const afterPress = pressViolinKey(afterAdvance, 'A');
    expect(afterAdvance).toBe(state);
    expect(afterPress).toBe(afterAdvance);
  });

  it('warms the room progressively as the piece advances', () => {
    const start = getPieceProgress(createViolinState());
    expect(start).toBe(0);
    // Progress increases monotonically toward 1 across phrases.
    expect(getPieceProgress({ ...createViolinState(), phraseIndex: 2 })).toBeGreaterThan(start);
  });
});
