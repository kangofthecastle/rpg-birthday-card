import type { DialogueLine } from './types';

/*
 * ============================================================================
 *  FRIEND_TWO: rewrite these lines in your own words — this is you talking to ____.
 * ============================================================================
 *
 *  This is the conversation on the galaxy water at the very end: ____ walks up
 *  to you (you're just a sprite standing by the warm glow) and presses E. You
 *  two talk, and the last line hands off to the letters everyone wrote her.
 *
 *  Keep your voice — casual, steady, warm under the banter. The draft below is
 *  only scaffolding for the shape and pacing (alternating beats, you open and
 *  you close, the last line gestures at the letters). Overwrite the `text` of
 *  each line freely; add or cut beats. Speakers must stay '____' / '____'
 *  and the portraitIds must stay as they are so the right face shows.
 *
 *  Touchstones from the journey, in case they're useful: the fishing afternoon
 *  with ____, the retake round at your place, the piece she finally played all
 *  the way through, and the little paper boat that carried her out here.
 * ============================================================================
 */
export const FINALE_CONVERSATION: readonly DialogueLine[] = [
  {
    speaker: '____',
    text: 'Hey! Took you a minute, huh?',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: '____!',
    portraitId: 'portrait-recipient',
  },
  {
    speaker: '____',
    text: 'Did you digitally kidnap me?',
    portraitId: 'portrait-recipient',
  },
  {
    speaker: '____',
    text: 'Uhhhh...',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'Happy birthday?',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'Also yeah I totally did.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'But why?',
    portraitId: 'portrait-recipient',
  },
  {
    speaker: '____',
    text: 'I know you went through a lot this year.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'You’re one of my favorite people on the planet, y’know?',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'And I just wanted to do something that’d make you smile today…',
    portraitId: 'portrait-friend-b',
  },
  {
    text: '…and hopefully for a few more days after that.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'But I’m not the only one who wanted to say something. Here, take this.',
    portraitId: 'portrait-friend-b',
  },
];
