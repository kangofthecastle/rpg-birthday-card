import { isInteractionAvailable } from '../game/interactionState';
import { hasSeenBeat, type RunState } from '../game/runState';
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
    text: 'Nothing. It will not even turn on.',
    portraitId: 'portrait-recipient',
  },
  { text: '1 NEW MESSAGE', portraitTreatment: 'phone' },
  {
    speaker: '____',
    text: "hey!! you awake? come over when you can — I've got the pond game open and saved you a seat. we're catching another koi today 🐟",
    portraitId: 'portrait-friendone',
  },
];

const RECIPIENT_PC_STILL_DARK: readonly DialogueLine[] = [
  { speaker: '____', text: 'Still nothing. The PC is still dark.', portraitId: 'portrait-recipient' },
];

const ACTIVITY_COMPLETION_STORY: Readonly<Record<string, ActivityCompletionStory>> = {
  [FISHING_ACTIVITY_ID]: {
    worldDialogue: [
      { speaker: '____', text: 'There. Now they have company.', portraitId: 'portrait-friendone' },
      {
        speaker: '____',
        text: "____ said we should come over for a LAN party. Let's go!",
        portraitId: 'portrait-friendone',
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
