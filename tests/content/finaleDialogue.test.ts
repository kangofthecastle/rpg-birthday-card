import { describe, expect, it } from 'vitest';
import { FINALE_CONVERSATION } from '../../src/content/finaleDialogue';

describe('finale dialogue', () => {
  it('uses the edited ____ reveal in display order', () => {
    expect(FINALE_CONVERSATION.map(({ speaker, text }) => ({ speaker, text }))).toEqual([
      { speaker: '____', text: 'Hey! Took you a minute, huh?' },
      { speaker: '____', text: '____!' },
      { speaker: '____', text: 'Did you digitally kidnap me?' },
      { speaker: '____', text: 'Uhhhh...' },
      { speaker: '____', text: 'Happy birthday?' },
      { speaker: '____', text: 'Also yeah I totally did.' },
      { speaker: '____', text: 'But why?' },
      { speaker: '____', text: 'I know you went through a lot this year.' },
      {
        speaker: '____',
        text: 'I just wanted to do something that’d make you smile today.',
      },
      {
        speaker: '____',
        text: 'But I’m not the only one who wanted to say something. Here, take this.',
      },
    ]);
  });

  it('keeps the portrait assignment aligned with each speaker', () => {
    for (const line of FINALE_CONVERSATION) {
      expect(line.portraitId).toBe(line.speaker === '____' ? 'portrait-recipient' : 'portrait-friend-b');
    }
  });
});
