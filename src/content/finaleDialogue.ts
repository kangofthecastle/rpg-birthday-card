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
    text: 'There you are. Knew you’d make it out this far — you always do, even when the map’s held together with tape.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: '____? You’re… out here? At the actual edge of everything?',
    portraitId: 'portrait-recipient',
  },
  {
    speaker: '____',
    text: 'Somebody had to hold the seat for you. Same as always.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'Did you make all of this? The roads, the houses… the whole little world?',
    portraitId: 'portrait-recipient',
  },
  {
    speaker: '____',
    text: 'Guilty. Every road, every dumb signpost. ____ helped — she’s better at the quiet parts than I am.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'Figured if I built you a whole world, you’d actually have to walk through it. And look at that — you cleared every round.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'It wasn’t really a game, though. Some of this year was… a lot.',
    portraitId: 'portrait-recipient',
  },
  {
    speaker: '____',
    text: 'Yeah. I know. You planted anyway. Retook the site anyway. Sat out on that dock with ____ like there was all the time in the world.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'And you played the piece — the whole thing, no stumbles, that last bar just ringing out into the quiet. A year you kept meaning to, and tonight you did.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'You heard that?',
    portraitId: 'portrait-recipient',
  },
  {
    speaker: '____',
    text: 'Course I did. I was in the boat the whole way. We both were.',
    portraitId: 'portrait-friend-b',
  },
  {
    speaker: '____',
    text: 'Anyway — I’m not the only one who wanted to say something tonight. Everyone did. Go on — read what they wrote you.',
    portraitId: 'portrait-friend-b',
  },
];
