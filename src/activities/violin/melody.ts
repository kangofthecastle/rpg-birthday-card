// The piece on ____'s music stand — melody data.
//
// A clean, swappable data file: the whole song is note/duration arrays plus a
// small pitch table, so the arrangement can be replaced without touching the
// model or scene. The phrases evoke the rallying, rising contour of "Do You
// Hear the People Sing?" from Les Misérables — a private personal gift — but
// are freshly composed close melodic phrases, not a transcription.
//
// Every pitch maps to a single home-row-ish key so ____ can echo it back by
// ear (perfect-pitch echo, not falling notes). Pitches sit in a comfortable
// violin register: a D-major hexachord, D4 → B4.

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
}

// D-major hexachord across the home row. Left-to-right rises in pitch, like a
// little keyboard under her fingers.
export const VIOLIN_PITCHES: readonly ViolinPitch[] = [
  { id: 'd4', key: 'A', name: 'D', frequency: 293.66, staffStep: -1 },
  { id: 'e4', key: 'S', name: 'E', frequency: 329.63, staffStep: 0 },
  { id: 'fs4', key: 'D', name: 'F♯', frequency: 369.99, staffStep: 1 },
  { id: 'g4', key: 'F', name: 'G', frequency: 392.0, staffStep: 2 },
  { id: 'a4', key: 'G', name: 'A', frequency: 440.0, staffStep: 3 },
  { id: 'b4', key: 'H', name: 'B', frequency: 493.88, staffStep: 4 },
] as const;

export interface ViolinNote {
  readonly pitchId: string;
  /** Base duration in ms at tempo scale 1 (misses stretch this, never shrink). */
  readonly durationMs: number;
}

export interface ViolinPhrase {
  readonly id: string;
  readonly notes: readonly ViolinNote[];
}

// Four phrases, each a full 5–6 notes so every one is a real line to echo (not a
// three-note fragment). Together they arch the way the anthem does: a rising
// call, a settling answer, a climb that reaches the top B, and a crest that
// resolves all the way home to D. ____ plays every note of every phrase herself,
// including the last — and when the final phrase lands, the whole piece she just
// played pours back through as one continuous line.
//
// Keys per phrase (revisits within a phrase are fine, six mapped keys):
//   call    D  E  F♯ G  A       → A S D F G
//   answer  A  G  F♯ G  E  D     → G F D F S A
//   lift    F♯ G  A  B  A  G     → D F G H G F
//   resolve A  B  A  G  F♯ D     → G H G F D A
export const VIOLIN_PHRASES: readonly ViolinPhrase[] = [
  {
    id: 'call',
    notes: [
      { pitchId: 'd4', durationMs: 440 },
      { pitchId: 'e4', durationMs: 440 },
      { pitchId: 'fs4', durationMs: 440 },
      { pitchId: 'g4', durationMs: 440 },
      { pitchId: 'a4', durationMs: 780 },
    ],
  },
  {
    id: 'answer',
    notes: [
      { pitchId: 'a4', durationMs: 400 },
      { pitchId: 'g4', durationMs: 400 },
      { pitchId: 'fs4', durationMs: 400 },
      { pitchId: 'g4', durationMs: 400 },
      { pitchId: 'e4', durationMs: 400 },
      { pitchId: 'd4', durationMs: 780 },
    ],
  },
  {
    id: 'lift',
    notes: [
      { pitchId: 'fs4', durationMs: 380 },
      { pitchId: 'g4', durationMs: 380 },
      { pitchId: 'a4', durationMs: 380 },
      { pitchId: 'b4', durationMs: 560 },
      { pitchId: 'a4', durationMs: 400 },
      { pitchId: 'g4', durationMs: 760 },
    ],
  },
  {
    id: 'resolve',
    notes: [
      { pitchId: 'a4', durationMs: 420 },
      { pitchId: 'b4', durationMs: 420 },
      { pitchId: 'a4', durationMs: 420 },
      { pitchId: 'g4', durationMs: 420 },
      { pitchId: 'fs4', durationMs: 480 },
      { pitchId: 'd4', durationMs: 980 },
    ],
  },
] as const;

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
