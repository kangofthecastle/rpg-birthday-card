import type { DialogueLine } from '../../content/types';

/**
 * Pure, framework-free model for the ending sequence. Holds the copy and the
 * small state machines that the DOM controller (`finalKeepsakeActivity`) and
 * the post-ending letters screen animate. Kept dependency-free so the whole
 * emotional progression — keepsake placement, the two final letters, and the
 * "happy birthday" trigger — is unit-testable in jsdom.
 */

/**
 * The keepsake id the terminal ending activity reports on completion. It is the
 * ending's OWN identity — the scene seam keys the "ending finished, stay asleep"
 * branch on this so a mere travel-into-final-spot completion is never mistaken
 * for the ending itself.
 */
export const ENDING_KEEPSAKE_ID = 'ending-light';

export interface EndingKeepsake {
  readonly id: string;
  readonly label: string;
  readonly iconUrl: string;
}

/**
 * The three keepsakes that open around the lantern, in order: ____'s letter,
 * ____'s letter, and ____'s own sheet music — the piece she finally played.
 * Ordered so her music lands last, right before the lantern lights. (The icons
 * are the kept keepsake tokens.)
 */
export const FINAL_KEEPSAKES: readonly EndingKeepsake[] = [
  {
    id: 'glowing-koi-scale',
    label: '____’s Letter',
    iconUrl: '/assets/keepsakes/keepsake-glowing-koi-scale.png',
  },
  {
    id: 'defused-spike-charm',
    label: '____’s Letter',
    iconUrl: '/assets/keepsakes/keepsake-defused-spike-charm.png',
  },
  {
    id: 'golden-hour-photo',
    label: 'Your Sheet Music',
    iconUrl: '/assets/keepsakes/keepsake-golden-hour-photo.png',
  },
];

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
// Keepsake placement state machine
// ---------------------------------------------------------------------------

export interface PlacementModel {
  /** How many keepsakes have settled around the lantern so far. */
  readonly placed: number;
  /** Total keepsakes to place. */
  readonly total: number;
  /** Whether the lantern has caught light (only after all are placed). */
  readonly lit: boolean;
}

export function createPlacement(
  total: number = FINAL_KEEPSAKES.length,
): PlacementModel {
  return { placed: 0, total, lit: false };
}

/** Settles the next keepsake. No-op once all keepsakes are placed. */
export function placeNextKeepsake(model: PlacementModel): PlacementModel {
  if (model.placed >= model.total) {
    return model;
  }
  return { ...model, placed: model.placed + 1 };
}

export function isFullyPlaced(model: PlacementModel): boolean {
  return model.placed >= model.total;
}

/** Lights the lantern. Only takes effect once every keepsake is placed. */
export function lightLantern(model: PlacementModel): PlacementModel {
  if (!isFullyPlaced(model)) {
    return model;
  }
  return { ...model, lit: true };
}

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
