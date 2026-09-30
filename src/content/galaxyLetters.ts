import { mergeLetterArchive, type Letter } from './letters';

/** Keep unique IDs when changing names or adding your own letters. */
export const GALAXY_ENDING_LETTERS: readonly Letter[] = Array.from(
  { length: 12 },
  (_, index) => ({
    id: `constellation-${index + 1}`,
    from: '____',
    text: '[Add a birthday message here.]',
  }),
);

export function buildPostEndingLetterArchive(
  collected: readonly Letter[],
): readonly Letter[] {
  const merged = mergeLetterArchive([...collected, ...GALAXY_ENDING_LETTERS]);
  const first = merged.find(({ id }) => id === 'friend-two');
  const second = merged.find(({ id }) => id === 'friend-one');
  const rest = merged.filter(({ id }) => id !== 'friend-two' && id !== 'friend-one');
  return [...(first ? [first] : []), ...(second ? [second] : []), ...rest];
}
