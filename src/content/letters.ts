export interface Letter {
  /** Stable identity, separate from the displayed sender name. */
  readonly id?: string;
  readonly from: string;
  readonly text: string;
  readonly deliveryPreface?: string;
  readonly showAuthorHeading?: boolean;
  readonly photoSrc?: string;
  readonly photoAlt?: string;
  readonly photoCaption?: string;
  readonly photoCropTop?: number;
}

/** Replace this placeholder with your second friend's own message. */
export const FRIEND_TWO_BIRTHDAY_LETTER: Letter = {
  id: 'friend-two',
  from: '____',
  showAuthorHeading: false,
  text: '[Write your second friend’s birthday letter here.]',
};

export const LETTERS: readonly Letter[] = [FRIEND_TWO_BIRTHDAY_LETTER];

export function letterIdentity(letter: Letter): string {
  return letter.id ?? letter.from.trim().toLocaleLowerCase();
}

/** Authored entries replace collected copies with the same stable identity. */
export function mergeLetterArchive(
  collected: readonly Letter[],
  authored: readonly Letter[] = LETTERS,
): readonly Letter[] {
  const authoredIds = new Set(authored.map(letterIdentity).filter(Boolean));
  return [
    ...collected.filter((letter) => !authoredIds.has(letterIdentity(letter))),
    ...authored,
  ];
}

export const FRIEND_TWO_RETAKE_NOTE =
  'I’m finishing your gift. I’ll see you later.';

export function getFriendTwoRetakeLetter(
  letters: readonly Letter[] = LETTERS,
): Letter {
  const letter = letters.find((candidate) => candidate.id === 'friend-two') ?? letters[0];
  return {
    ...letter,
    id: 'friend-two',
    from: letter?.from ?? '____',
    deliveryPreface: FRIEND_TWO_RETAKE_NOTE,
    text: letter?.text.trim() || '[Write your second friend’s birthday letter here.]',
  };
}
