import {
  VIOLIN_THEME_MOTIF,
  type ViolinNote,
} from '../activities/violin/melody';

export interface MotifNote {
  readonly pitchId: string;
  readonly delayMs: number;
  readonly durationMs: number;
}

export interface ScheduledMotifNote extends MotifNote {
  readonly atMs: number;
  readonly pass: 0 | 1;
}

function motifFrom(notes: readonly ViolinNote[]): MotifNote[] {
  let delayMs = 0;
  return notes.map((note) => {
    delayMs += note.delayBeforeMs ?? 0;
    const event = {
      pitchId: note.pitchId,
      delayMs,
      durationMs: note.durationMs,
    };
    delayMs += note.durationMs;
    return event;
  });
}

/** Three notes land with the room's post-piece awakening. */
export const AWAKENING_FRAGMENT: readonly MotifNote[] = motifFrom(
  VIOLIN_THEME_MOTIF.slice(0, 3),
);

/** The violin calls from the stand with the supplied refrain's opening figure. */
export const VIOLIN_INVITATION_FRAGMENT: readonly MotifNote[] = motifFrom(VIOLIN_THEME_MOTIF);

export const VIOLIN_INVITATION_DURATION_MS = VIOLIN_INVITATION_FRAGMENT.reduce(
  (endMs, note) => Math.max(endMs, note.delayMs + note.durationMs),
  0,
);

const REPEAT_AT_MS = 9000;

export function createViolinInvitationSchedule(
  options: { readonly cancelled?: boolean } = {},
): readonly ScheduledMotifNote[] {
  const first = schedulePass(0, 0);
  return options.cancelled ? first : [...first, ...schedulePass(1, REPEAT_AT_MS)];
}

function schedulePass(pass: 0 | 1, offsetMs: number): ScheduledMotifNote[] {
  return VIOLIN_INVITATION_FRAGMENT.map((note) => ({
    ...note,
    atMs: offsetMs + note.delayMs,
    pass,
  }));
}
