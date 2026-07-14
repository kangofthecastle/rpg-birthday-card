import { describe, expect, it } from 'vitest';
import {
  advanceFinaleReveal,
  createFinaleReveal,
} from '../../src/game/finaleReveal';

describe('finaleReveal', () => {
  it('begins as Omen and reveals ____ exactly once', () => {
    const omen = createFinaleReveal(false);
    expect(omen.phase).toBe('omen');

    const transforming = advanceFinaleReveal(omen, 'ask-identity');
    expect(transforming.phase).toBe('transforming');

    const friendtwo = advanceFinaleReveal(transforming, 'transform-complete');
    expect(friendtwo.phase).toBe('friendtwo');
    expect(advanceFinaleReveal(friendtwo, 'ask-identity')).toBe(friendtwo);
  });

  it('is gone in the completed epilogue and cannot restart', () => {
    const gone = createFinaleReveal(true);
    expect(gone.phase).toBe('gone');
    expect(advanceFinaleReveal(gone, 'ask-identity')).toBe(gone);
  });
});
