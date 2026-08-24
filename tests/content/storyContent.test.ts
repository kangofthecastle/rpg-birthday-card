import { describe, expect, it } from 'vitest';
import {
  getActivityCompletionStory,
  getAvailableLocationInteractions,
  resolveRecipientPcStory,
  resolveMangoRiceDialogue,
} from '../../src/content/storyContent';
import {
  applyActivityCompletion,
  createCardModeRunState,
  createInitialRunState,
  markBeatSeen,
} from '../../src/game/runState';
import { isInteractionLocked } from '../../src/game/interactionState';
import {
  FISHING_ACTIVITY_ID,
  FRIEND_ONE_PC_READY_BEAT_ID,
  FRIEND_ONE_TEXT_READ_BEAT_ID,
  RETAKE_ACTIVITY_ID,
  VIOLIN_ACTIVITY_ID,
} from '../../src/game/storyProgression';

describe('story content resolution', () => {
  it('uses the same mango sticky rice description after RETAKE', () => {
    const fresh = createInitialRunState('recipient-house');
    expect(resolveMangoRiceDialogue(fresh)).toBeUndefined();

    const afterRetake = applyActivityCompletion(fresh, {
      locationId: 'friend-b',
      activityId: RETAKE_ACTIVITY_ID,
    });
    expect(resolveMangoRiceDialogue(afterRetake)).toEqual([
      {
        text: 'Mango sticky rice, for some reason.',
        portraitId: 'inspect-mango-rice',
      },
    ]);
  });

  it('keeps ____ activities hidden until her text and hides fishing after completion', () => {
    const fresh = createInitialRunState('recipient-house');
    expect(getAvailableLocationInteractions('friend-a', fresh)).toEqual([]);

    const invited = markBeatSeen(fresh, FRIEND_ONE_TEXT_READ_BEAT_ID);
    expect(getAvailableLocationInteractions('friend-a', invited).map((item) => item.id)).toEqual([
      'friendone-host',
    ]);

    const pcReady = markBeatSeen(invited, FRIEND_ONE_PC_READY_BEAT_ID);
    expect(getAvailableLocationInteractions('friend-a', pcReady).map((item) => item.id)).toEqual([
      'friendone-pc',
    ]);

    const finished = applyActivityCompletion(pcReady, {
      locationId: 'friend-a',
      activityId: FISHING_ACTIVITY_ID,
    });
    expect(getAvailableLocationInteractions('friend-a', finished)).toEqual([]);
  });

  it('resolves ____ PC first-use text once while keeping later checks dark and quiet', () => {
    const first = resolveRecipientPcStory(createInitialRunState('recipient-house'));
    expect(first.mode).toBe('first-message');
    expect(first.playNotification).toBe(true);
    expect(first.marksBeatId).toBe(FRIEND_ONE_TEXT_READ_BEAT_ID);
    expect(first.dialogue.map((line) => line.text)).toEqual([
      'Come on...',
      'Nothing. It won’t even turn on.',
      '1 NEW MESSAGE',
      'Hey! Happy birthday! Still coming over today?',
      'I’m coming over today?',
      'I think I forgot ;-; I’ll head over now!',
    ]);
    expect(first.dialogue[2]).toMatchObject({
      text: '1 NEW MESSAGE',
      portraitTreatment: 'phone',
    });
    expect(first.dialogue[3]).toMatchObject({
      speaker: '____',
      portraitId: 'portrait-friendone',
    });
    expect(first.dialogue.at(-1)).toMatchObject({
      speaker: '____',
      portraitId: 'portrait-recipient',
    });
    expect(first.dialogue[3]?.portraitTreatment).toBeUndefined();

    const repeat = resolveRecipientPcStory(
      markBeatSeen(createInitialRunState('recipient-house'), FRIEND_ONE_TEXT_READ_BEAT_ID),
    );
    expect(repeat.mode).toBe('still-dark');
    expect(repeat.playNotification).toBe(false);
    expect(repeat.marksBeatId).toBeUndefined();
    expect(repeat.dialogue).toHaveLength(1);
    expect(repeat.dialogue[0]?.text).toBe('Still nothing. The screen is dark.');
    expect(repeat.dialogue[0]?.speaker).toBeUndefined();
  });

  it('provides world dialogue after fishing and after ____ disappears', () => {
    expect(getActivityCompletionStory(FISHING_ACTIVITY_ID)?.worldDialogue.map((line) => line.text)).toEqual([
      'There. Now they have company.',
      'How’d you do that?',
      'Don’t worry about it.',
      'We should go to ____’s, we’re going to be late.',
      'We’re going to ____’s??',
      'I need to use my calendar more.',
    ]);
    expect(getActivityCompletionStory(RETAKE_ACTIVITY_ID)?.worldDialogue.map((line) => line.text)).toEqual([
      '____?',
      '...she was just here.',
      'I should go home.',
    ]);
  });

  it('places violin recognition after its sheet-music reward', () => {
    expect(getActivityCompletionStory(VIOLIN_ACTIVITY_ID)?.worldDialogue).toEqual([
      {
        speaker: '____',
        text: '...wait. I know this song!',
        portraitId: 'portrait-recipient',
      },
    ]);
  });

  it('shows the RETAKE PC early but keeps it locked until fishing is complete', () => {
    const invited = markBeatSeen(createInitialRunState('friend-a'), FRIEND_ONE_TEXT_READ_BEAT_ID);
    const earlyInteractions = getAvailableLocationInteractions('friend-b', invited);
    expect(earlyInteractions.map((item) => item.id)).toEqual(['friend-b-host']);
    expect(isInteractionLocked(earlyInteractions[0], invited)).toBe(true);

    const fishingDone = applyActivityCompletion(invited, {
      locationId: 'friend-a',
      activityId: FISHING_ACTIVITY_ID,
    });
    expect(getAvailableLocationInteractions('friend-b', fishingDone).map((item) => item.id)).toEqual([
      'friend-b-host',
      'friend-b-easter-egg',
    ]);
    expect(isInteractionLocked(
      getAvailableLocationInteractions('friend-b', fishingDone)[0],
      fishingDone,
    )).toBe(false);
  });

  it('keeps the other ____-house desk inspectable in /password mode', () => {
    expect(
      getAvailableLocationInteractions('friend-b', createCardModeRunState()).map(
        (item) => item.id,
      ),
    ).toContain('friend-b-easter-egg');
  });
});
