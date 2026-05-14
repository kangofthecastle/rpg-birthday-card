import { describe, expect, it } from 'vitest';
import { getFriendThreeStrategyLine } from '../../../src/activities/friendthreeStrategy/dialogue';

describe('friendthree strategy dialogue', () => {
  it('returns fixed lines for every dialogue event', () => {
    expect(getFriendThreeStrategyLine('intro')).toBe('Tiny island, short game. I will try to play fast.');
    expect(getFriendThreeStrategyLine('recipient-longest-road')).toBe('That road is getting suspiciously long.');
    expect(getFriendThreeStrategyLine('friendthree-settlement')).toBe(
      'I found a decent spot. Not the best spot. A decent one.',
    );
    expect(getFriendThreeStrategyLine('recipient-three-vp')).toBe('One more point and you take the island.');
    expect(getFriendThreeStrategyLine('friendthree-bad-roll')).toBe(
      'That roll gave me time to think, which is dangerous.',
    );
    expect(getFriendThreeStrategyLine('recipient-wins')).toBe(
      'You got me. The island accepts your road-based argument.',
    );
    expect(getFriendThreeStrategyLine('friendthree-wins')).toBe(
      'I won this one. That means you are legally owed a rematch.',
    );
  });
});
