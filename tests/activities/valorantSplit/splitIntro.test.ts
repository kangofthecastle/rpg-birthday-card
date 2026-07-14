import { describe, expect, it } from 'vitest';
import { createSplitState } from '../../../src/activities/valorantSplit/splitModel';
import { createSplitIntroPresentation } from '../../../src/activities/valorantSplit/splitIntro';

describe('createSplitIntroPresentation', () => {
  it('places Viper and Omen at their live model positions with weapons hidden', () => {
    const state = createSplitState(71);

    expect(createSplitIntroPresentation(state)).toEqual([
      {
        role: 'viper',
        position: state.player.pos,
        gunVisible: false,
        cueColor: 0x2fae6b,
      },
      {
        role: 'omen',
        position: state.teammate.pos,
        gunVisible: false,
        cueColor: 0x8c78ff,
      },
    ]);
  });

  it('never falls back to the Phaser image creation origin', () => {
    const presentation = createSplitIntroPresentation(createSplitState(72));

    expect(presentation.every(({ position }) => position.x !== 0 || position.y !== 0)).toBe(true);
  });
});
