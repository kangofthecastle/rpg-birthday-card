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
    text: 'I knew you would make it—you always do.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: '____? It was you?',
    portraitId: 'portrait-recipient',
  },
  {
    speaker: '____',
    text: 'I wanted to make sure there was always a place waiting for you. Same as always.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'Did you make all of this? The roads, the houses… the whole world?',
    portraitId: 'portrait-recipient',
  },
  {
    speaker: '____',
    text: 'Everything, even down to the blades of grass. ____ helped a bit too.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'Figured if I built you a whole world, you’d have to take a moment…',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: '…and reflect on how much people care about you.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'This wasn’t just a game, though. Some of this year was… a lot.',
    portraitId: 'portrait-recipient',
  },
  {
    speaker: '____',
    text: 'I know. As we grow older, life blurs by. It gets harder to notice the little things. Just for a moment, I wanted to create the illusion that…',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: '…we had all the time in the world.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'Anyway — I’m not the only one who wanted to say something. Everyone did. Go on — read what they wrote you.',
    portraitId: 'portrait-friend-b',
  },
];
