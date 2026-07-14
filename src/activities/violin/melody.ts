// The piece on ____'s music stand — melody data.
//
// Measures 10–13 of the user-supplied "Do You Hear the People Sing?" sheet are
// the playable refrain. They form four compact echo phrases and, conveniently,
// use exactly six pitches — so the original A S D F G H mechanic can carry the
// real tune without adding another input row. This file is the single source for
// the minigame, the autonomous invitation/awakening cues, and the sheet-roll
// plucks later in the ending.

export interface ViolinPitch {
  /** Stable id referenced by notes. */
  readonly id: string;
  /** The keyboard key that plays this pitch, uppercase single char. */
  readonly key: string;
  /** Display note name for the key legend. */
  readonly name: string;
  /** Frequency in Hz (for the synthesized violin tone). */
  readonly frequency: number;
  /** Diatonic step for vertical placement on the staff; higher = higher. */
  readonly staffStep: number;
  /** Chromatic ordering used by the advanced graph and practice trail. */
  readonly graphStep: number;
  /** Accidental drawn before the notehead in conventional staff mode. */
  readonly accidental?: 'sharp';
}

// Left-to-right rises chromatically through the supplied refrain's compact
// violin range. G-natural and G-sharp share a staff position but remain distinct
// in the graph and on the key legend; the sharp is drawn on the staff.
export const VIOLIN_PITCHES: readonly ViolinPitch[] = [
  { id: 'g4', key: 'A', name: 'G', frequency: 392.0, staffStep: 2, graphStep: 0 },
  {
    id: 'gs4',
    key: 'S',
    name: 'G♯',
    frequency: 415.3,
    staffStep: 2,
    graphStep: 1,
    accidental: 'sharp',
  },
  { id: 'a4', key: 'D', name: 'A', frequency: 440.0, staffStep: 3, graphStep: 2 },
  { id: 'b4', key: 'F', name: 'B', frequency: 493.88, staffStep: 4, graphStep: 3 },
  { id: 'c5', key: 'G', name: 'C', frequency: 523.25, staffStep: 5, graphStep: 4 },
  { id: 'd5', key: 'H', name: 'D', frequency: 587.33, staffStep: 6, graphStep: 5 },
] as const;

export interface ViolinNote {
  readonly pitchId: string;
  /** Base duration in ms at tempo scale 1 (misses stretch this, never shrink). */
  readonly durationMs: number;
  /** Silent time before this note, used for rests printed inside a phrase. */
  readonly delayBeforeMs?: number;
}

export interface ViolinPhrase {
  readonly id: string;
  readonly notes: readonly ViolinNote[];
}

// With quarter = 600ms this sits at a clear, march-like 100 BPM. The printed
// dotted-eighth/sixteenth figures remain exact; triplet eighths divide the beat
// into thirds. Phrase two keeps its printed triplet rest as delayBeforeMs. The
// final measure's two triplet rests and pickup back into the repeat are omitted:
// the one-pass minigame resolves on its quarter-note C5 instead of looping.
export const VIOLIN_RHYTHM_MS = {
  dottedEighth: 450,
  sixteenth: 150,
  quarter: 600,
  tripletEighth: 200,
} as const;

const { dottedEighth, sixteenth, quarter, tripletEighth } = VIOLIN_RHYTHM_MS;

const REFRAIN_OPENING_NOTES: readonly ViolinNote[] = [
  { pitchId: 'a4', durationMs: dottedEighth },
  { pitchId: 'gs4', durationMs: sixteenth },
  { pitchId: 'a4', durationMs: dottedEighth },
  { pitchId: 'b4', durationMs: sixteenth },
  { pitchId: 'c5', durationMs: dottedEighth },
  { pitchId: 'b4', durationMs: sixteenth },
  { pitchId: 'a4', durationMs: dottedEighth },
  { pitchId: 'c5', durationMs: sixteenth },
] as const;

export const VIOLIN_PHRASES: readonly ViolinPhrase[] = [
  {
    id: 'refrain-call',
    notes: REFRAIN_OPENING_NOTES,
  },
  {
    id: 'refrain-answer',
    notes: [
      { pitchId: 'b4', durationMs: dottedEighth },
      { pitchId: 'a4', durationMs: sixteenth },
      { pitchId: 'g4', durationMs: dottedEighth },
      { pitchId: 'a4', durationMs: sixteenth },
      { pitchId: 'b4', durationMs: quarter },
      { pitchId: 'b4', durationMs: tripletEighth, delayBeforeMs: tripletEighth },
      { pitchId: 'c5', durationMs: tripletEighth },
    ],
  },
  {
    id: 'refrain-lift',
    notes: [
      { pitchId: 'd5', durationMs: dottedEighth },
      { pitchId: 'c5', durationMs: sixteenth },
      { pitchId: 'b4', durationMs: dottedEighth },
      { pitchId: 'c5', durationMs: sixteenth },
      { pitchId: 'd5', durationMs: dottedEighth },
      { pitchId: 'c5', durationMs: sixteenth },
      { pitchId: 'b4', durationMs: dottedEighth },
      { pitchId: 'd5', durationMs: sixteenth },
    ],
  },
  {
    id: 'refrain-resolve',
    notes: [
      { pitchId: 'c5', durationMs: dottedEighth },
      { pitchId: 'b4', durationMs: sixteenth },
      { pitchId: 'a4', durationMs: dottedEighth },
      { pitchId: 'b4', durationMs: sixteenth },
      { pitchId: 'c5', durationMs: quarter },
    ],
  },
] as const;

/** The exact opening figure, shared by all short autonomous cues. */
export const VIOLIN_THEME_MOTIF: readonly ViolinNote[] = REFRAIN_OPENING_NOTES.slice(0, 4);

/** A slightly longer opening fragment for the six sheet-roll note thresholds. */
export const VIOLIN_SHEET_ROLL_MOTIF: readonly ViolinNote[] = REFRAIN_OPENING_NOTES.slice(0, 6);

const PITCH_BY_ID = new Map(VIOLIN_PITCHES.map((pitch) => [pitch.id, pitch]));
const PITCH_BY_KEY = new Map(VIOLIN_PITCHES.map((pitch) => [pitch.key, pitch]));

export function getPitch(pitchId: string): ViolinPitch | undefined {
  return PITCH_BY_ID.get(pitchId);
}

/** Case-insensitive lookup of the pitch bound to a keyboard key, or undefined
 * for any key not in the six-note legend. */
export function getPitchByKey(key: string): ViolinPitch | undefined {
  return PITCH_BY_KEY.get(key.trim().toUpperCase());
}
