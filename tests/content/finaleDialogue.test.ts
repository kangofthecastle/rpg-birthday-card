import { describe, expect, it } from 'vitest';
import { FINALE_CONVERSATION } from '../../src/content/finaleDialogue';

describe('finale dialogue', () => {
  it('uses the edited ____ reveal in display order', () => {
    expect(FINALE_CONVERSATION.map(({ speaker, text }) => ({ speaker, text }))).toEqual([
      { speaker: '____', text: 'I knew you would make it—you always do.' },
      { speaker: '____', text: '____? It was you?' },
      {
        speaker: '____',
        text: 'I wanted to make sure there was always a place waiting for you. Same as always.',
      },
      {
        speaker: '____',
        text: 'Did you make all of this? The roads, the houses... the whole world?',
      },
      {
        speaker: '____',
        text: 'Everything, even down to the blades of grass. ____ helped a bit too.',
      },
      {
        speaker: '____',
        text: 'Figured if I built you a whole world, you’d have to take a moment...',
      },
      {
        speaker: '____',
        text: '...and reflect on how much people care about you.',
      },
      {
        speaker: '____',
        text: 'This wasn’t just a game, though. Some of this year was... a lot.',
      },
      {
        speaker: '____',
        text: 'I know. As we grow older, life blurs by. It gets harder to notice the little things. Just for a moment, I wanted to create the illusion that...',
      },
      { speaker: '____', text: '...we had all the time in the world.' },
      {
        speaker: '____',
        text: 'Anyway — I’m not the only one who wanted to say something. Everyone did. Go on — read what they wrote you.',
      },
    ]);
  });

  it('keeps the portrait assignment aligned with each speaker', () => {
    for (const line of FINALE_CONVERSATION) {
      expect(line.portraitId).toBe(line.speaker === '____' ? 'portrait-recipient' : 'portrait-friend-b');
    }
  });
});
