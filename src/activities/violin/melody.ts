// The piece on ____'s music stand — melody data.
//
// Measures 1–9 of the user-supplied “Do You Hear the People Sing?” score are
// transcribed here as one canonical passage. The interactive game uses measures
// 1–5 in 4–6-note pages; the finale replay expands into the complete measures
// 1–9 passage. This file remains the single pitch/rhythm source for both, plus
// the invitation and awakening cues and the ending's sheet-roll plucks.

export interface ViolinPitch {
  /** Stable id referenced by notes. */
  readonly id: string;
  /** Visible keyboard label used by the model and legend. */
  readonly key: string;
  /** Phaser KeyCodes property name used to register the physical key. */
  readonly inputCode: string;
  /** Display note name for the key legend. */
  readonly name: string;
  /** Frequency in Hz (for the synthesized violin tone). */
  readonly frequency: number;
  /** Diatonic step for vertical placement on the treble staff; E4 = 0. */
  readonly staffStep: number;
  /** Chromatic ordering used by the advanced graph and practice trail. */
  readonly graphStep: number;
  /** Accidental drawn before the notehead in conventional staff mode. */
  readonly accidental?: 'flat' | 'sharp';
}

// Low to high on one physical row. The passage spans A3–C5 and uses eleven
// distinct written pitches, so the home row continues through semicolon/quote.
export const VIOLIN_PITCHES: readonly ViolinPitch[] = [
  { id: 'a3', key: 'A', inputCode: 'A', name: 'A', frequency: 220, staffStep: -4, graphStep: 0 },
  {
    id: 'bb3',
    key: 'S',
    inputCode: 'S',
    name: 'B♭',
    frequency: 233.08,
    staffStep: -3,
    graphStep: 1,
    accidental: 'flat',
  },
  { id: 'c4', key: 'D', inputCode: 'D', name: 'C', frequency: 261.63, staffStep: -2, graphStep: 2 },
  { id: 'd4', key: 'F', inputCode: 'F', name: 'D', frequency: 293.66, staffStep: -1, graphStep: 3 },
  { id: 'e4', key: 'G', inputCode: 'G', name: 'E', frequency: 329.63, staffStep: 0, graphStep: 4 },
  { id: 'f4', key: 'H', inputCode: 'H', name: 'F', frequency: 349.23, staffStep: 1, graphStep: 5 },
  {
    id: 'fs4',
    key: 'J',
    inputCode: 'J',
    name: 'F♯',
    frequency: 369.99,
    staffStep: 1,
    graphStep: 6,
    accidental: 'sharp',
  },
  { id: 'g4', key: 'K', inputCode: 'K', name: 'G', frequency: 392, staffStep: 2, graphStep: 7 },
  { id: 'a4', key: 'L', inputCode: 'L', name: 'A', frequency: 440, staffStep: 3, graphStep: 8 },
  {
    id: 'bb4',
    key: ';',
    inputCode: 'SEMICOLON',
    name: 'B♭',
    frequency: 466.16,
    staffStep: 4,
    graphStep: 9,
    accidental: 'flat',
  },
  { id: 'c5', key: "'", inputCode: 'QUOTES', name: 'C', frequency: 523.25, staffStep: 5, graphStep: 10 },
] as const;

export const VIOLIN_KEY_HINT = VIOLIN_PITCHES.map((pitch) => pitch.key).join(' ');

export interface ViolinNote {
  readonly pitchId: string;
  /** Base duration in ms at tempo scale 1 (misses stretch this, never shrink). */
  readonly durationMs: number;
  /** Silent time before this note, retained for score fragments containing rests. */
  readonly delayBeforeMs?: number;
}

export interface ViolinPhrase {
  readonly id: string;
  readonly notes: readonly ViolinNote[];
}

// Quarter = 600ms: a clear, march-like 100 BPM. Dotted-eighth/sixteenth pairs
// and triplet eighths preserve the score's internal timing. Measure 1's three
// opening quarter rests are pre-song silence rather than an input turn.
export const VIOLIN_RHYTHM_MS = {
  dottedEighth: 450,
  sixteenth: 150,
  quarter: 600,
  tripletEighth: 200,
  dottedHalf: 1800,
} as const;

const { dottedEighth, dottedHalf, sixteenth, quarter, tripletEighth } =
  VIOLIN_RHYTHM_MS;

export const VIOLIN_FINALE_PHRASES: readonly ViolinPhrase[] = [
  {
    id: 'page-1-opening',
    notes: [
      { pitchId: 'a4', durationMs: dottedEighth },
      { pitchId: 'g4', durationMs: sixteenth },
      { pitchId: 'f4', durationMs: dottedEighth },
      { pitchId: 'g4', durationMs: sixteenth },
    ],
  },
  {
    id: 'page-2-rise-and-turn',
    notes: [
      { pitchId: 'a4', durationMs: dottedEighth },
      { pitchId: 'bb4', durationMs: sixteenth },
      { pitchId: 'c5', durationMs: quarter },
      { pitchId: 'a4', durationMs: tripletEighth },
      { pitchId: 'g4', durationMs: tripletEighth },
      { pitchId: 'f4', durationMs: tripletEighth },
    ],
  },
  {
    id: 'page-3-fall',
    notes: [
      { pitchId: 'e4', durationMs: dottedEighth },
      { pitchId: 'd4', durationMs: sixteenth },
      { pitchId: 'e4', durationMs: dottedEighth },
      { pitchId: 'f4', durationMs: sixteenth },
    ],
  },
  {
    id: 'page-4-turn',
    notes: [
      { pitchId: 'c4', durationMs: quarter },
      { pitchId: 'd4', durationMs: tripletEighth },
      { pitchId: 'c4', durationMs: tripletEighth },
      { pitchId: 'bb3', durationMs: tripletEighth },
    ],
  },
  {
    id: 'page-5-climb',
    notes: [
      { pitchId: 'a3', durationMs: dottedEighth },
      { pitchId: 'c4', durationMs: sixteenth },
      { pitchId: 'f4', durationMs: dottedEighth },
      { pitchId: 'a4', durationMs: sixteenth },
    ],
  },
  {
    id: 'page-6-chromatic-turn',
    notes: [
      { pitchId: 'g4', durationMs: dottedEighth },
      { pitchId: 'fs4', durationMs: sixteenth },
      { pitchId: 'g4', durationMs: dottedEighth },
      { pitchId: 'd4', durationMs: sixteenth },
    ],
  },
  {
    id: 'page-7-answer',
    notes: [
      { pitchId: 'f4', durationMs: dottedEighth },
      { pitchId: 'e4', durationMs: sixteenth },
      { pitchId: 'e4', durationMs: dottedEighth },
      { pitchId: 'f4', durationMs: sixteenth },
    ],
  },
  {
    id: 'page-8-lift-and-rise',
    notes: [
      { pitchId: 'g4', durationMs: quarter },
      { pitchId: 'a4', durationMs: dottedEighth },
      { pitchId: 'g4', durationMs: sixteenth },
      { pitchId: 'f4', durationMs: dottedEighth },
      { pitchId: 'g4', durationMs: sixteenth },
      { pitchId: 'a4', durationMs: dottedEighth },
    ],
  },
  {
    id: 'page-9-rise-and-turn',
    notes: [
      { pitchId: 'bb4', durationMs: sixteenth },
      { pitchId: 'c5', durationMs: quarter },
      { pitchId: 'a4', durationMs: tripletEighth },
      { pitchId: 'g4', durationMs: tripletEighth },
      { pitchId: 'f4', durationMs: tripletEighth },
    ],
  },
  {
    id: 'page-10-fall',
    notes: [
      { pitchId: 'e4', durationMs: dottedEighth },
      { pitchId: 'd4', durationMs: sixteenth },
      { pitchId: 'e4', durationMs: dottedEighth },
      { pitchId: 'f4', durationMs: sixteenth },
    ],
  },
  {
    id: 'page-11-turn',
    notes: [
      { pitchId: 'c4', durationMs: quarter },
      { pitchId: 'd4', durationMs: tripletEighth },
      { pitchId: 'c4', durationMs: tripletEighth },
      { pitchId: 'bb3', durationMs: tripletEighth },
    ],
  },
  {
    id: 'page-12-climb',
    notes: [
      { pitchId: 'a3', durationMs: dottedEighth },
      { pitchId: 'c4', durationMs: sixteenth },
      { pitchId: 'f4', durationMs: dottedEighth },
      { pitchId: 'a4', durationMs: sixteenth },
      { pitchId: 'g4', durationMs: tripletEighth },
      { pitchId: 'fs4', durationMs: tripletEighth },
    ],
  },
  {
    id: 'page-13-resolution',
    notes: [
      { pitchId: 'g4', durationMs: tripletEighth },
      { pitchId: 'bb4', durationMs: dottedEighth },
      { pitchId: 'e4', durationMs: sixteenth },
      { pitchId: 'f4', durationMs: dottedHalf },
      { pitchId: 'e4', durationMs: dottedEighth },
      { pitchId: 'e4', durationMs: sixteenth },
    ],
  },
] as const;

const FULL_NOTE_STREAM = VIOLIN_FINALE_PHRASES.flatMap((phrase) => phrase.notes);

/** Measures 1–5, regrouped for the listen-and-echo game. These pages are views
 * into the canonical full stream, so shortening the game cannot alter or
 * duplicate the finale's notes. Measure 5 ends at exclusive index 33. */
export const VIOLIN_PHRASES: readonly ViolinPhrase[] = [
  { id: 'game-page-1-opening', notes: FULL_NOTE_STREAM.slice(0, 4) },
  { id: 'game-page-2-rise-and-turn', notes: FULL_NOTE_STREAM.slice(4, 10) },
  { id: 'game-page-3-fall', notes: FULL_NOTE_STREAM.slice(10, 14) },
  { id: 'game-page-4-turn', notes: FULL_NOTE_STREAM.slice(14, 18) },
  { id: 'game-page-5-climb', notes: FULL_NOTE_STREAM.slice(18, 22) },
  { id: 'game-page-6-chromatic-answer', notes: FULL_NOTE_STREAM.slice(22, 27) },
  { id: 'game-page-7-lift', notes: FULL_NOTE_STREAM.slice(27, 33) },
] as const;

/** The score's first four sounded notes, shared by all autonomous cues. */
export const VIOLIN_THEME_MOTIF: readonly ViolinNote[] = FULL_NOTE_STREAM.slice(0, 4);

/** The first six sounded notes for the six sheet-roll note thresholds. */
export const VIOLIN_SHEET_ROLL_MOTIF: readonly ViolinNote[] = FULL_NOTE_STREAM.slice(0, 6);

const PITCH_BY_ID = new Map(VIOLIN_PITCHES.map((pitch) => [pitch.id, pitch]));
const PITCH_BY_KEY = new Map(VIOLIN_PITCHES.map((pitch) => [pitch.key, pitch]));

export function getPitch(pitchId: string): ViolinPitch | undefined {
  return PITCH_BY_ID.get(pitchId);
}

/** Case-insensitive lookup of the pitch bound to a visible keyboard label. */
export function getPitchByKey(key: string): ViolinPitch | undefined {
  return PITCH_BY_KEY.get(key.trim().toUpperCase());
}
