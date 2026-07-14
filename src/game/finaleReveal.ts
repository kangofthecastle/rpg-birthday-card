export type FinaleActorPhase = 'omen' | 'transforming' | 'friendtwo' | 'gone';
export type FinaleRevealEvent = 'ask-identity' | 'transform-complete' | 'ending-complete';

export interface FinaleRevealState {
  readonly phase: FinaleActorPhase;
}

export function createFinaleReveal(endingCompleted: boolean): FinaleRevealState {
  return { phase: endingCompleted ? 'gone' : 'omen' };
}

export function advanceFinaleReveal(
  state: FinaleRevealState,
  event: FinaleRevealEvent,
): FinaleRevealState {
  if (state.phase === 'omen' && event === 'ask-identity') {
    return { phase: 'transforming' };
  }
  if (state.phase === 'transforming' && event === 'transform-complete') {
    return { phase: 'friendtwo' };
  }
  if (state.phase === 'friendtwo' && event === 'ending-complete') {
    return { phase: 'gone' };
  }
  return state;
}
