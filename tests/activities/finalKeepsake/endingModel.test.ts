import { describe, expect, it } from 'vitest';
import {
  allLettersRead,
  createLettersRead,
  ENDING_KEEPSAKE_ID,
  FINAL_ENDING_LETTERS,
  HAPPY_BIRTHDAY_LINE,
  isLetterRead,
  markLetterRead,
  unreadCount,
} from '../../../src/activities/finalKeepsake/endingModel';

describe('ending copy', () => {
  it('keeps the ending identity token stable', () => {
    expect(ENDING_KEEPSAKE_ID).toBe('ending-light');
  });

  it('keeps the two final letters short and in ____-then-____ order', () => {
    expect(FINAL_ENDING_LETTERS).toHaveLength(2);
    expect(FINAL_ENDING_LETTERS[0][0].speaker).toBe('____');
    expect(FINAL_ENDING_LETTERS[1][0].speaker).toBe('____');
    // Restraint: neither letter runs long.
    for (const letter of FINAL_ENDING_LETTERS) {
      expect(letter.length).toBeLessThanOrEqual(2);
      for (const line of letter) {
        expect(line.text.length).toBeLessThan(160);
      }
    }
  });

  it('answers the quiet question in ____’s letter', () => {
    const friendtwo = FINAL_ENDING_LETTERS[1].map((line) => line.text).join(' ');
    expect(friendtwo.toLowerCase()).toContain('washes away');
    expect(friendtwo.toLowerCase()).toContain('going to be okay');
  });

  it('keeps the happy-birthday line lowercase and quiet', () => {
    expect(HAPPY_BIRTHDAY_LINE).toBe('happy birthday, recipient.');
  });
});

describe('letters read-tracking', () => {
  it('tracks read letters and ignores duplicates and out-of-range', () => {
    let model = createLettersRead(2);
    expect(unreadCount(model)).toBe(2);
    expect(allLettersRead(model)).toBe(false);

    model = markLetterRead(model, 0);
    expect(isLetterRead(model, 0)).toBe(true);
    expect(unreadCount(model)).toBe(1);

    // Duplicate + out of range do not change the model.
    model = markLetterRead(model, 0);
    model = markLetterRead(model, 5);
    model = markLetterRead(model, -1);
    expect(model.read).toEqual([0]);
  });

  it('triggers happy-birthday only after the last unread letter closes', () => {
    let model = createLettersRead(2);
    model = markLetterRead(model, 0);
    expect(allLettersRead(model)).toBe(false);

    model = markLetterRead(model, 1);
    expect(allLettersRead(model)).toBe(true);
  });

  it('never triggers happy-birthday for an empty screen', () => {
    expect(allLettersRead(createLettersRead(0))).toBe(false);
  });
});
