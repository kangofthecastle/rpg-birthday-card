export type LocationKind = 'entry' | 'friend' | 'final' | 'home';
export type InteractionKind = 'dialogue' | 'activity' | 'easterEgg' | 'lockedExit';
export type RewardPresentation = 'dialogue' | 'letter';

export interface DialogueLine {
  readonly speaker?: string;
  readonly text: string;
  readonly portraitId?: string;
}

/**
 * A one-time (by default) dialogue that plays when the player enters a location,
 * optionally gated on collected keepsakes. Used for ____'s cold-open intro beat
 * and the warm return-home beat once both friend keepsakes are in hand.
 */
export interface LocationEnterBeat {
  readonly id: string;
  readonly dialogue: readonly DialogueLine[];
  /** When true, the beat only fires once both friend keepsakes are collected. */
  readonly requiresAllFriendKeepsakes?: boolean;
  /** When false, the beat may replay on every entry. Defaults to true (once only). */
  readonly once?: boolean;
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
  /**
   * State-conditional gate. When true, the interaction only performs its normal
   * behaviour once both friend keepsakes are collected; until then it shows
   * `lockedDialogue`. Keeps conditional interactions data-driven (e.g. ____'s
   * PC is dark until both friend keepsakes are in hand).
   */
  readonly requiresAllFriendKeepsakes?: boolean;
  readonly lockedDialogue?: readonly DialogueLine[];
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
  readonly rewardPresentation?: RewardPresentation;
  readonly rewardMessage?: readonly DialogueLine[];
  readonly keepsake?: KeepsakeDefinition;
  readonly exits: readonly LocationExit[];
  readonly interactions: readonly LocationInteraction[];
  /** One-time entry dialogues (cold-open intro, warm return-home beat). */
  readonly enterBeats?: readonly LocationEnterBeat[];
  /** When both friend keepsakes are collected, the room takes on a warm lighting tint. */
  readonly warmLightingRequiresAllFriendKeepsakes?: boolean;
}
