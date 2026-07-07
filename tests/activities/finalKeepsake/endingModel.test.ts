import { describe, expect, it } from 'vitest';
import {
  allLettersRead,
  createLettersRead,
  createPlacement,
  FINAL_ENDING_LETTERS,
  FINAL_KEEPSAKES,
  HAPPY_BIRTHDAY_LINE,
  isFullyPlaced,
  isLetterRead,
  lightLantern,
  markLetterRead,
  placeNextKeepsake,
  unreadCount,
} from '../../../src/activities/finalKeepsake/endingModel';

describe('ending keepsakes and copy', () => {
  it('places the three keepsakes with the self-photo landing last', () => {
    expect(FINAL_KEEPSAKES.map((k) => k.id)).toEqual([
      'glowing-koi-scale',
      'defused-spike-charm',
      'golden-hour-photo',
    ]);
    for (const keepsake of FINAL_KEEPSAKES) {
      expect(keepsake.iconUrl).toContain('/assets/keepsakes/');
      expect(keepsake.label.length).toBeGreaterThan(0);
    }
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

describe('placement progression', () => {
  it('settles one keepsake at a time up to the total', () => {
    let model = createPlacement(3);
    expect(model.placed).toBe(0);
    expect(isFullyPlaced(model)).toBe(false);

    model = placeNextKeepsake(model);
    model = placeNextKeepsake(model);
    expect(model.placed).toBe(2);
    expect(isFullyPlaced(model)).toBe(false);

    model = placeNextKeepsake(model);
    expect(model.placed).toBe(3);
    expect(isFullyPlaced(model)).toBe(true);

    // Placing past the total is a no-op.
    model = placeNextKeepsake(model);
    expect(model.placed).toBe(3);
  });

  it('only lights the lantern once every keepsake is placed', () => {
    let model = createPlacement(3);
    model = lightLantern(model);
    expect(model.lit).toBe(false);

    model = placeNextKeepsake(placeNextKeepsake(placeNextKeepsake(model)));
    model = lightLantern(model);
    expect(model.lit).toBe(true);
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
