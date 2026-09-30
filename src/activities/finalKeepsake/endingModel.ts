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

/** Optional short terminal letters. Empty until authored copy is supplied. */
export const FINAL_ENDING_LETTERS: readonly (readonly DialogueLine[])[] = [];

/** The quiet line that fades in once every letter has been read. Lowercase. */
export const HAPPY_BIRTHDAY_LINE = 'happy birthday, ____.';

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
 * True once every letter has been opened. Drives the "happy birthday, ____."
 * line, which appears after the last unread letter closes. An empty screen
 * (no letters) never triggers it.
 */
export function allLettersRead(model: LettersReadModel): boolean {
  return model.total > 0 && model.read.length >= model.total;
}
