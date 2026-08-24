import { isInteractionAvailable } from '../game/interactionState';
import { hasActivityCompleted, hasSeenBeat, type RunState } from '../game/runState';
import {
  FISHING_ACTIVITY_ID,
  FRIEND_ONE_TEXT_READ_BEAT_ID,
  RETAKE_ACTIVITY_ID,
  VIOLIN_ACTIVITY_ID,
} from '../game/storyProgression';
import { getLocation } from './locations';
import type { DialogueLine, LocationInteraction } from './types';

export interface ActivityCompletionStory {
  readonly worldDialogue: readonly DialogueLine[];
}

export interface RecipientPcStory {
  readonly mode: 'first-message' | 'still-dark';
  readonly dialogue: readonly DialogueLine[];
  readonly playNotification: boolean;
  readonly marksBeatId?: string;
}

const RECIPIENT_PC_FIRST_MESSAGE: readonly DialogueLine[] = [
  { speaker: '____', text: 'Come on...', portraitId: 'portrait-recipient' },
  {
    speaker: '____',
    text: 'Nothing. It won’t even turn on.',
    portraitId: 'portrait-recipient',
  },
  { text: '1 NEW MESSAGE', portraitTreatment: 'phone' },
  {
    speaker: '____',
    text: 'Hey! Happy birthday! Still coming over today?',
    portraitId: 'portrait-friendone',
  },
  {
    speaker: '____',
    text: 'I’m coming over today?',
    portraitId: 'portrait-recipient',
  },
  {
    speaker: '____',
    text: 'I think I forgot ;-; I’ll head over now!',
    portraitId: 'portrait-recipient',
  },
];

const RECIPIENT_PC_STILL_DARK: readonly DialogueLine[] = [
  { text: 'Still nothing. The screen is dark.', portraitId: 'inspect-recipient-pc' },
];

const MANGO_RICE_AFTER_RETAKE: readonly DialogueLine[] = [
  {
    text: 'Mango sticky rice, for some reason.',
    portraitId: 'inspect-mango-rice',
  },
];

const ACTIVITY_COMPLETION_STORY: Readonly<Record<string, ActivityCompletionStory>> = {
  [FISHING_ACTIVITY_ID]: {
    worldDialogue: [
      { speaker: '____', text: 'There. Now they have company.', portraitId: 'portrait-friendone' },
      { speaker: '____', text: 'How’d you do that?', portraitId: 'portrait-recipient' },
      { speaker: '____', text: 'Don’t worry about it.', portraitId: 'portrait-friendone' },
      {
        speaker: '____',
        text: 'We should go to ____’s, we’re going to be late.',
        portraitId: 'portrait-friendone',
      },
      { speaker: '____', text: 'We’re going to ____’s??', portraitId: 'portrait-recipient' },
      {
        speaker: '____',
        text: 'I need to use my calendar more.',
        portraitId: 'portrait-recipient',
      },
    ],
  },
  [RETAKE_ACTIVITY_ID]: {
    worldDialogue: [
      { speaker: '____', text: '____?', portraitId: 'portrait-recipient' },
      { speaker: '____', text: '...she was just here.', portraitId: 'portrait-recipient' },
      { speaker: '____', text: 'I should go home.', portraitId: 'portrait-recipient' },
    ],
  },
  [VIOLIN_ACTIVITY_ID]: {
    worldDialogue: [
      {
        speaker: '____',
        text: '...wait. I know this song!',
        portraitId: 'portrait-recipient',
      },
    ],
  },
};

export function resolveRecipientPcStory(state: RunState): RecipientPcStory {
  if (hasSeenBeat(state, FRIEND_ONE_TEXT_READ_BEAT_ID)) {
    return {
      mode: 'still-dark',
      dialogue: RECIPIENT_PC_STILL_DARK,
      playNotification: false,
    };
  }

  return {
    mode: 'first-message',
    dialogue: RECIPIENT_PC_FIRST_MESSAGE,
    playNotification: true,
    marksBeatId: FRIEND_ONE_TEXT_READ_BEAT_ID,
  };
}

export function resolveMangoRiceDialogue(
  state: RunState,
): readonly DialogueLine[] | undefined {
  return hasActivityCompleted(state, RETAKE_ACTIVITY_ID)
    ? MANGO_RICE_AFTER_RETAKE
    : undefined;
}

export function getActivityCompletionStory(
  activityId: string,
): ActivityCompletionStory | undefined {
  return ACTIVITY_COMPLETION_STORY[activityId];
}

export function getAvailableLocationInteractions(
  locationId: string,
  state: RunState,
): readonly LocationInteraction[] {
  return getLocation(locationId).interactions.filter((interaction) =>
    isInteractionAvailable(interaction, state),
  );
}
