import type { SplitState, Vec2 } from './splitModel';

export type SplitIntroRole = 'viper' | 'omen';

export interface SplitIntroCombatant {
  readonly role: SplitIntroRole;
  readonly position: Vec2;
  readonly gunVisible: false;
  readonly cueColor: number;
}

/**
 * The scene creates sprites at (0, 0), but the story beat needs both agents to
 * already inhabit the loaded arena before its dialogue can begin. Keeping this
 * mapping pure makes the intro use the same authoritative positions as play.
 */
export function createSplitIntroPresentation(
  state: Pick<SplitState, 'player' | 'teammate'>,
): readonly SplitIntroCombatant[] {
  return [
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
  ];
}
