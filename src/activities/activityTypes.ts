import type { ActivityCompletionInput, RunState } from '../game/runState';

export interface ActivityContext {
  readonly state: RunState;
  readonly mount: HTMLElement;
  readonly onComplete: (completion: ActivityCompletionInput) => void;
  readonly onCancel: () => void;
  /**
   * Optional: return the player home. The ending's terminal letters screen uses
   * this for its quiet "go home" affordance — dismissing the overlay and
   * restarting the world into ____'s awakened room with control restored.
   */
  readonly onGoHome?: () => void;
}

export interface ActivityModule {
  readonly id: string;
  readonly title: string;
  start(context: ActivityContext): Promise<void> | void;
}
