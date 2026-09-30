import { describe, expect, it } from 'vitest';
import { getFriendTwoRetakeLetter, mergeLetterArchive } from '../../src/content/letters';
import { buildPostEndingLetterArchive, GALAXY_ENDING_LETTERS } from '../../src/content/galaxyLetters';
import { getLocation } from '../../src/content/locations';

describe('template letter identities', () => {
  it('keeps different people distinct when every displayed name is blank', () => {
    const one = { id: 'friend-one', from: '____', text: 'First message' };
    const oldTwo = { id: 'friend-two', from: '____', text: 'Temporary message' };
    const newTwo = { id: 'friend-two', from: '____', text: 'Final message' };
    expect(mergeLetterArchive([one, oldTwo], [newTwo])).toEqual([one, newTwo]);
  });

  it('keeps both friend letters and all constellation placeholders in the archive', () => {
    const first = getLocation('friend-a').rewardLetter!;
    const second = getFriendTwoRetakeLetter();
    const archive = buildPostEndingLetterArchive([first, second]);
    expect(archive).toHaveLength(14);
    expect(new Set(archive.map(({ id }) => id)).size).toBe(14);
    expect(archive.slice(0, 2).map(({ id }) => id)).toEqual(['friend-two', 'friend-one']);
    expect(archive.every(({ from, photoSrc }) => from === '____' && !photoSrc)).toBe(true);
  });

  it('contains no original letters or photographs in template content', () => {
    expect(GALAXY_ENDING_LETTERS.every(({ text }) => text === '[Add a birthday message here.]')).toBe(true);
    expect(getLocation('friend-a').rewardLetter?.text).toBe('[Write your first friend’s birthday letter here.]');
  });
});
