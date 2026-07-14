import { describe, expect, it } from 'vitest';
import {
  AWAKENING_FRAGMENT,
  VIOLIN_INVITATION_FRAGMENT,
  createViolinInvitationSchedule,
} from '../../src/game/violinInvitationCue';
import { getPitch } from '../../src/activities/violin/melody';

describe('violin invitation cue', () => {
  it('uses the supplied refrain opening as its short exact invitation motif', () => {
    expect(VIOLIN_INVITATION_FRAGMENT.length).toBeGreaterThanOrEqual(3);
    expect(VIOLIN_INVITATION_FRAGMENT.length).toBeLessThanOrEqual(5);
    expect(VIOLIN_INVITATION_FRAGMENT.every((note) => getPitch(note.pitchId))).toBe(true);
    expect(VIOLIN_INVITATION_FRAGMENT.map((note) => note.pitchId)).toEqual([
      'a4',
      'gs4',
      'a4',
      'b4',
    ]);
    expect(VIOLIN_INVITATION_FRAGMENT.map((note) => note.delayMs)).toEqual([0, 450, 600, 1050]);
  });

  it('keeps the awakening fragment shorter than the violin invitation', () => {
    expect(AWAKENING_FRAGMENT.length).toBeGreaterThanOrEqual(2);
    expect(AWAKENING_FRAGMENT.length).toBeLessThan(VIOLIN_INVITATION_FRAGMENT.length);
    expect(AWAKENING_FRAGMENT.map((note) => note.pitchId)).toEqual(['a4', 'gs4', 'a4']);
  });

  it('schedules at most one quiet repeat', () => {
    const schedule = createViolinInvitationSchedule();
    expect(new Set(schedule.map((event) => event.pass))).toEqual(new Set([0, 1]));
    expect(schedule.filter((event) => event.pass === 1)[0].atMs).toBeGreaterThan(6000);
  });

  it('omits the repeat when it has been cancelled by interaction', () => {
    const schedule = createViolinInvitationSchedule({ cancelled: true });
    expect(schedule.every((event) => event.pass === 0)).toBe(true);
  });
});
