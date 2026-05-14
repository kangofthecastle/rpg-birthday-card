export type FriendThreeStrategyDialogueEvent =
  | 'intro'
  | 'recipient-longest-road'
  | 'friendthree-settlement'
  | 'recipient-three-vp'
  | 'friendthree-bad-roll'
  | 'recipient-wins'
  | 'friendthree-wins';

const FRIEND_THREE_LINES: Record<FriendThreeStrategyDialogueEvent, string> = {
  intro: 'Tiny island, short game. I will try to play fast.',
  'recipient-longest-road': 'That road is getting suspiciously long.',
  'friendthree-settlement': 'I found a decent spot. Not the best spot. A decent one.',
  'recipient-three-vp': 'One more point and you take the island.',
  'friendthree-bad-roll': 'That roll gave me time to think, which is dangerous.',
  'recipient-wins': 'You got me. The island accepts your road-based argument.',
  'friendthree-wins': 'I won this one. That means you are legally owed a rematch.',
};

export function getFriendThreeStrategyLine(event: FriendThreeStrategyDialogueEvent): string {
  return FRIEND_THREE_LINES[event];
}
