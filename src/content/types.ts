export type LocationKind = 'entry' | 'friend' | 'final';
export type InteractionKind = 'dialogue' | 'activity' | 'easterEgg' | 'lockedExit';

export interface DialogueLine {
  readonly speaker?: string;
  readonly text: string;
  readonly portraitId?: string;
}

export interface KeepsakeDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly iconAssetId: string;
}

export interface LocationExit {
  readonly id: string;
  readonly label: string;
  readonly destinationLocationId: string;
  readonly destinationSpawnId: string;
  readonly requiresFinalUnlock?: boolean;
}

interface BaseLocationInteraction {
  readonly id: string;
  readonly label: string;
}

export interface ActivityLocationInteraction extends BaseLocationInteraction {
  readonly kind: 'activity';
  readonly activityId: string;
  readonly dialogue?: readonly DialogueLine[];
}

export interface DialogueLocationInteraction extends BaseLocationInteraction {
  readonly kind: Exclude<InteractionKind, 'activity'>;
  readonly dialogue: readonly DialogueLine[];
  readonly activityId?: never;
}

export type LocationInteraction = ActivityLocationInteraction | DialogueLocationInteraction;

export interface LocationDefinition {
  readonly id: string;
  readonly kind: LocationKind;
  readonly title: string;
  readonly mapKey: string;
  readonly mapUrl: string;
  readonly defaultSpawnId: string;
  readonly activityId?: string;
  readonly rewardMessage?: readonly DialogueLine[];
  readonly keepsake?: KeepsakeDefinition;
  readonly exits: readonly LocationExit[];
  readonly interactions: readonly LocationInteraction[];
}
