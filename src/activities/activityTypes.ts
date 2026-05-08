import type { CompletionInput, RunState } from '../game/runState';

export interface ActivityContext {
  readonly state: RunState;
  readonly mount: HTMLElement;
  readonly onComplete: (completion: CompletionInput) => void;
  readonly onCancel: () => void;
}

export interface ActivityModule {
  readonly id: string;
  readonly title: string;
  start(context: ActivityContext): Promise<void> | void;
}
