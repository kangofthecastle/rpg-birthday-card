import type { DialogueLine } from '../../content/types';

/**
 * Pure, framework-free model for the ending sequence. Holds the copy and the
 * small letters-read state machine that the post-ending letters screen animates.
 * Kept dependency-free so the two final letters and the "happy birthday" trigger
 * stay unit-testable in jsdom.
 */

/**
 * The ending's OWN identity token. Retained for downstream code that keys the
 * ending on a stable id; the new flow completes the ending in-scene (the ____
 * conversation → letters), so no activity reports this as a collected keepsake.
 */
export const ENDING_KEEPSAKE_ID = 'ending-light';

/**
 * The two short letters that arrive over the ocean-galaxy, in order. ____
 * first, then ____ answering the game's quiet question. Restraint is the
 * point — keep them short.
 */
export const FINAL_ENDING_LETTERS: readonly (readonly DialogueLine[])[] = [
  [
    {
      speaker: '____',
      text: 'However far you cast, I’m in the boat right beside you — for the quiet days most of all.',
    },
  ],
  [
    {
      speaker: '____',
      text: 'You wondered who made this place. I did — a whole small world, built just for you.',
    },
    {
      speaker: '____',
      text: 'Because when we’re together, the rest of it washes away, and everything is going to be okay.',
    },
  ],
];

/** The quiet line that fades in once every letter has been read. Lowercase. */
export const HAPPY_BIRTHDAY_LINE = 'happy birthday, recipient.';

// ---------------------------------------------------------------------------
// Letters read-tracking (post-ending screen)
// ---------------------------------------------------------------------------

export interface LettersReadModel {
  readonly total: number;
  readonly read: readonly number[];
}

export function createLettersRead(total: number): LettersReadModel {
  return { total, read: [] };
}

export function isLetterRead(model: LettersReadModel, index: number): boolean {
  return model.read.includes(index);
}

export function markLetterRead(
  model: LettersReadModel,
  index: number,
): LettersReadModel {
  if (index < 0 || index >= model.total || isLetterRead(model, index)) {
    return model;
  }
  return { ...model, read: [...model.read, index] };
}

/** How many letters remain unread. */
export function unreadCount(model: LettersReadModel): number {
  return model.total - model.read.length;
}

/**
 * True once every letter has been opened. Drives the "happy birthday, recipient."
 * line, which appears after the last unread letter closes. An empty screen
 * (no letters) never triggers it.
 */
export function allLettersRead(model: LettersReadModel): boolean {
  return model.total > 0 && model.read.length >= model.total;
}
