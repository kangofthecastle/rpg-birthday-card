export interface MotifNote {
  readonly pitchId: string;
  readonly delayMs: number;
  readonly durationMs: number;
}

export interface ScheduledMotifNote extends MotifNote {
  readonly atMs: number;
  readonly pass: 0 | 1;
}

export const AWAKENING_FRAGMENT: readonly MotifNote[] = [
  { pitchId: 'd4', delayMs: 0, durationMs: 420 },
  { pitchId: 'e4', delayMs: 520, durationMs: 520 },
] as const;

export const VIOLIN_INVITATION_FRAGMENT: readonly MotifNote[] = [
  { pitchId: 'd4', delayMs: 0, durationMs: 420 },
  { pitchId: 'e4', delayMs: 500, durationMs: 420 },
  { pitchId: 'fs4', delayMs: 1000, durationMs: 420 },
  { pitchId: 'g4', delayMs: 1500, durationMs: 650 },
] as const;

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
