import { FINALE_CONVERSATION } from './finaleDialogue';
import { getFriendTwoRetakeLetter } from './letters';
import type { LocationDefinition } from './types';

const FRIEND_TWO_RETAKE_LETTER = getFriendTwoRetakeLetter();

export const LOCATIONS: readonly LocationDefinition[] = [
  {
    id: 'main-outside',
    kind: 'outdoor',
    projection: 'flat',
    title: 'Guildford',
    mapKey: 'map-main-outside',
    mapUrl: '/maps/main-outside.tmj',
    defaultSpawnId: 'start',
    exits: [
      {
        id: 'to-recipient-house',
        label: 'Go inside',
        destinationLocationId: 'recipient-house',
        destinationSpawnId: 'front-door',
      },
    ],
    edgeExits: [
      {
        id: 'edge-west-friendtwo',
        edge: 'west',
        destinationLocationId: 'friendtwo-yard',
        destinationEdge: 'east',
      },
      {
        id: 'edge-east-friendone',
        edge: 'east',
        destinationLocationId: 'friendone-yard',
        destinationEdge: 'west',
      },
      {
        id: 'edge-south-clearing',
        edge: 'south',
        destinationLocationId: 'clearing',
        destinationEdge: 'north',
      },
    ],
    // The Guildford fingerpost stays in the scenery, but is no longer inspectable.
    interactions: [],
  },
  {
    id: 'friendtwo-yard',
    kind: 'outdoor',
    projection: 'flat',
    title: 'Kerrisdale',
    mapKey: 'map-friendtwo-yard',
    mapUrl: '/maps/friendtwo-yard.tmj',
    defaultSpawnId: 'start',
    exits: [
      {
        id: 'to-friend-b',
        label: "Knock on ____'s door",
        destinationLocationId: 'friend-b',
        destinationSpawnId: 'front-door',
      },
    ],
    edgeExits: [
      {
        id: 'edge-east-main',
        edge: 'east',
        destinationLocationId: 'main-outside',
        destinationEdge: 'west',
      },
    ],
    // No signpost here — the directional fingerposts now stand only in Guildford.
    interactions: [],
  },
  {
    id: 'friendone-yard',
    kind: 'outdoor',
    projection: 'flat',
    title: 'Aldergrove',
    mapKey: 'map-friendone-yard',
    mapUrl: '/maps/friendone-yard.tmj',
    defaultSpawnId: 'start',
    exits: [
      {
        id: 'to-friend-a',
        label: "Knock on ____'s door",
        destinationLocationId: 'friend-a',
        destinationSpawnId: 'front-door',
      },
    ],
    edgeExits: [
      {
        id: 'edge-west-main',
        edge: 'west',
        destinationLocationId: 'main-outside',
        destinationEdge: 'east',
      },
    ],
    // No signpost here — the directional fingerposts now stand only in Guildford.
    interactions: [],
  },
  {
    id: 'clearing',
    kind: 'outdoor',
    projection: 'flat',
    title: 'A clearing',
    mapKey: 'map-clearing',
    mapUrl: '/maps/clearing.tmj',
    defaultSpawnId: 'start',
    activityId: 'fold-the-letters',
    exits: [],
    edgeExits: [
      {
        id: 'edge-north-main',
        edge: 'north',
        destinationLocationId: 'main-outside',
        destinationEdge: 'south',
      },
    ],
    interactions: [
      {
        id: 'clearing-shore',
        kind: 'activity',
        label: 'Look over the water',
        activityId: 'fold-the-letters',
        requiresAllKeepsakes: true,
        dialogue: [
          {
            speaker: '____',
            text: 'The lights are coming from the water... but how do I follow them?',
            portraitId: 'portrait-recipient',
          },
          {
            speaker: '____',
            text: 'The cranes...',
            portraitId: 'portrait-recipient',
          },
          {
            speaker: '____',
            text: 'Paper floats. The letters...',
            portraitId: 'portrait-recipient',
          },
        ],
        lockedDialogue: [
          {
            text: 'No way across the water.',
          },
        ],
      },
    ],
  },
  {
    id: 'friend-a',
    kind: 'friend',
    title: "____'s House",
    mapKey: 'map-friend-a',
    mapUrl: '/maps/friend-a.tmj',
    defaultSpawnId: 'front-door',
    activityId: 'friendone-pc-fishing',
    keepsake: {
      id: 'glowing-koi-scale',
      label: '____’s Letter',
      description:
        'A birthday letter from your first friend.',
      iconAssetId: 'keepsake-glowing-koi-scale',
    },
    rewardPresentation: 'letter',
    rewardLetter: {
      id: 'friend-one',
      from: '____',
      showAuthorHeading: false,
      text: '[Write your first friend’s birthday letter here.]',
    },
    exits: [
      {
        id: 'back-entry',
        label: 'Step outside',
        destinationLocationId: 'friendone-yard',
        destinationSpawnId: 'from-friend-a',
      },
    ],
    interactions: [
      {
        id: 'friendone-host',
        kind: 'dialogue',
        label: 'Talk to ____',
        requiresBeatId: 'friendone-text-read',
        hiddenAfterBeatId: 'friendone-pc-ready',
        marksBeatId: 'friendone-pc-ready',
        dialogue: [
          {
            speaker: '____',
            text: 'Your room looks a little different.',
            portraitId: 'portrait-recipient',
          },
          {
            speaker: '____',
            text: 'I like your fish! When did you get it?',
            portraitId: 'portrait-recipient',
          },
          {
            speaker: '____',
            text: 'I’ve always had it. His name is ____.',
            portraitId: 'portrait-friendone',
          },
          {
            speaker: '____',
            text: 'Doesn’t seem like something you’d name a fish.',
            portraitId: 'portrait-recipient',
          },
          {
            speaker: '____',
            text: '*~shrugs~* If you catch one with me you can name it yourself.',
            portraitId: 'portrait-friendone',
          },
          {
            speaker: '____',
            text: 'Catch one? Sure!',
            portraitId: 'portrait-recipient',
          },
          {
            speaker: '____',
            text: 'Like go fishing?',
            portraitId: 'portrait-recipient',
          },
          {
            speaker: '____',
            text: 'Yeah, take a seat.',
            portraitId: 'portrait-friendone',
          },
        ],
      },
      {
        id: 'friendone-pc',
        kind: 'activity',
        label: 'Enter the fishing game',
        activityId: 'friendone-pc-fishing',
        requiresBeatId: 'friendone-pc-ready',
        hiddenAfterActivityId: 'friendone-pc-fishing',
        dialogue: [
          {
            text: 'The PC monitor warms into a soft pond scene.',
            portraitId: 'inspect-friendone-pc',
          },
        ],
      },
    ],
  },
  {
    id: 'friend-b',
    kind: 'friend',
    title: "____'s House",
    mapKey: 'map-friend-b',
    mapUrl: '/maps/friend-b.tmj',
    defaultSpawnId: 'front-door',
    activityId: 'valorant-split',
    keepsake: {
      id: 'defused-spike-charm',
      label: '____’s Letter',
      description:
        'A birthday letter from your second friend.',
      iconAssetId: 'keepsake-defused-spike-charm',
    },
    rewardPresentation: 'letter',
    rewardLetter: FRIEND_TWO_RETAKE_LETTER,
    enterBeats: [
      {
        id: 'friendtwo-house-entered',
        requiresActivityId: 'friendone-pc-fishing',
        dialogue: [
          {
            speaker: '____',
            text: '____? You home?',
            portraitId: 'portrait-recipient',
          },
          {
            speaker: '____',
            text: "That's strange. He's not here!",
            portraitId: 'portrait-friendone',
          },
          {
            speaker: '____',
            text: 'There are two PCs set up though… Should we just play one while we wait for him?',
            portraitId: 'portrait-friendone',
          },
          {
            speaker: '____',
            text: 'The LAN party waits for no one!!!',
            portraitId: 'portrait-recipient',
          },
        ],
      },
    ],
    exits: [
      {
        id: 'back-entry',
        label: 'Step outside',
        destinationLocationId: 'friendtwo-yard',
        destinationSpawnId: 'from-friend-b',
      },
    ],
    interactions: [
      {
        id: 'friendtwo-host',
        kind: 'dialogue',
        label: 'Talk to ____',
        requiresEndingCompleted: true,
        dialogue: [
          {
            speaker: '____',
            text: "Hey, grab a seat — I'm already loaded in.",
            portraitId: 'portrait-friend-b',
          },
          {
            speaker: '____',
            text: 'One more retake before bedtime?',
            portraitId: 'portrait-friend-b',
          },
        ],
      },
      {
        id: 'friend-b-host',
        kind: 'activity',
        label: 'Boot up RETAKE.EXE',
        activityId: 'valorant-split',
        lockedUntilActivityId: 'friendone-pc-fishing',
        lockedDialogue: [
          {
            speaker: '____',
            text: "The lobby's empty. I should come back when everyone's actually here.",
            portraitId: 'portrait-recipient',
          },
        ],
        hiddenAfterActivityId: 'valorant-split',
        replayAfterEnding: true,
      },
      {
        id: 'friend-b-easter-egg',
        kind: 'easterEgg',
        label: 'Inspect the setup',
        requiresActivityId: 'friendone-pc-fishing',
        availableAfterEnding: true,
        dialogue: [
          {
            text: 'A spare chair, another headset already waiting on the desk. Someone kept a seat for you here.',
            portraitId: 'inspect-friendtwo-setup',
          },
        ],
      },
    ],
  },
  {
    id: 'final-spot',
    kind: 'final',
    // The galaxy place: a plain top-down view of the ocean-galaxy water, redressed
    // from the existing ending art. ____ walks on the reflection; ____ waits at
    // the warm glow in the centre. The frame-sequence transition (auto-started on
    // arrival via the origami boat) hands off INTO this scene.
    projection: 'flat',
    initialPlayerFacing: 'up',
    title: 'The End',
    mapKey: 'map-final-spot',
    mapUrl: '/maps/final-spot.tmj',
    defaultSpawnId: 'clearing-path',
    exits: [],
    // The boat crossing is one-way: once ____ reaches the edge of everything,
    // the only coherent path is forward to Omen/____ and the ending.
    edgeExits: [],
    interactions: [
      {
        // Omen, standing at the warm glow. E to talk — the final conversation,
        // then the letters everyone wrote her.
        id: 'friendtwo-finale',
        kind: 'dialogue',
        label: 'Talk to Omen',
        endingConversation: true,
        dialogue: FINALE_CONVERSATION,
      },
    ],
  },
  {
    id: 'recipient-house',
    kind: 'home',
    title: "____'s Room",
    mapKey: 'map-recipient-house',
    mapUrl: '/maps/recipient-house.tmj',
    defaultSpawnId: 'front-door',
    activityId: 'recipient-violin-piece',
    keepsake: {
      id: 'recipient-sheet-music',
      label: 'The piece on the stand',
      description: '____’s sheet music for “Do You Hear the People Sing?”',
      iconAssetId: 'keepsake-golden-hour-photo',
    },
    rewardPresentation: 'letter',
    rewardSheetMusic: {
      title: 'Do You Hear the People Sing?',
      imageSrc: '/assets/activities/fold-the-letters/paper-sheetmusic.png',
      imageAlt: '____’s handwritten sheet music for Do You Hear the People Sing?',
    },
    warmLightingRequiresAllFriendKeepsakes: true,
    enterBeats: [
      {
        id: 'recipient-intro',
        dialogue: [
          {
            speaker: '____',
            text: '...wait. Where am I?',
            portraitId: 'portrait-recipient',
          },
          {
            speaker: '____',
            text: 'Is this my room?',
            portraitId: 'portrait-recipient',
          },
          {
            speaker: '____',
            text: 'Or... somebody’s version of it.',
            portraitId: 'portrait-recipient',
          },
          {
            speaker: '____',
            text: 'Whoever put me here must know me pretty well.',
            portraitId: 'portrait-recipient',
          },
        ],
      },
      {
        id: 'recipient-return-home',
        requiresActivityId: 'valorant-split',
        dialogue: [],
      },
    ],
    exits: [
      {
        id: 'step-outside',
        label: 'Step outside',
        destinationLocationId: 'main-outside',
        destinationSpawnId: 'from-recipient-house',
      },
    ],
    interactions: [
      {
        id: 'recipient-violin',
        kind: 'activity',
        label: 'Inspect the violin',
        activityId: 'recipient-violin-piece',
        lockedUntilActivityId: 'valorant-split',
        dialogue: [
          {
            text: 'Your violin is, somehow, now tuned. A piece lies open on the stand, waiting to be played.',
            portraitId: 'inspect-violin',
          },
        ],
        lockedDialogue: [
          {
            text: "Your trusty violin rests on its stand, but it's out of tune.",
            portraitId: 'inspect-violin',
          },
        ],
      },
      {
        id: 'recipient-mango-rice',
        kind: 'easterEgg',
        label: 'Check the dining table',
        dialogue: [
          {
            text: 'Mango sticky rice, for some reason.',
            portraitId: 'inspect-mango-rice',
          },
        ],
      },
      {
        id: 'recipient-photo-wall',
        kind: 'easterEgg',
        label: 'Look at the photo wall',
        // Before the ending: the quiet dialogue below. After the ending: the wall
        // opens as a full-screen collage of framed photos.
        photoWallAfterEnding: true,
        dialogue: [
          {
            text: 'A wall of your photographs. One frame is left empty.',
            portraitId: 'inspect-photo-wall',
          },
        ],
      },
      {
        id: 'recipient-bed',
        kind: 'easterEgg',
        label: 'Sit on the bed',
        dialogue: [
          {
            text: 'Your bed, comfortably made. But you aren’t tired, you have a busy day ahead of you.',
            portraitId: 'inspect-bed',
          },
        ],
      },
      {
        id: 'recipient-pc',
        kind: 'easterEgg',
        label: 'Use the PC',
        dialogue: [
          {
            text: 'Still nothing. The screen is dark.',
            portraitId: 'inspect-recipient-pc',
          },
        ],
      },
    ],
  },
] as const;

export function getLocation(locationId: string): LocationDefinition {
  const location = LOCATIONS.find((candidate) => candidate.id === locationId);

  if (!location) {
    throw new Error(`Unknown location: ${locationId}`);
  }

  validateLocation(location);

  return location;
}

export function validateLocation(location: LocationDefinition): void {
  const activityInteractions = location.interactions.filter(
    (interaction) => interaction.kind === 'activity',
  );

  if (activityInteractions.length > 0 && !location.activityId) {
    throw new Error(
      `Location ${location.id} has an activity interaction but no activityId`,
    );
  }

  const primaryActivityInteraction = activityInteractions.find(
    (interaction) => interaction.activityId === location.activityId,
  );

  if (location.activityId && !primaryActivityInteraction) {
    throw new Error(
      `Location ${location.id} has activityId ${location.activityId} but no matching primary activity interaction`,
    );
  }
}
