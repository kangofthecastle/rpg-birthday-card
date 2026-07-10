export type LocationKind = 'outdoor' | 'friend' | 'final' | 'home';
/**
 * How a location's map space is drawn to the screen. `iso` is the 2.5D diamond
 * projection used by interiors; `flat` is a plain top-down orthogonal view
 * (screen coords == map coords) used by the outdoor areas. Defaults to `iso`.
 */
export type ProjectionMode = 'iso' | 'flat';
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

/** Which side of the map an edge exit lives on. */
export type MapEdge = 'north' | 'south' | 'east' | 'west';

/**
 * An edge-to-edge outdoor transition: walking off `edge` of this map arrives on
 * `destinationEdge` of the destination area, at the same proportional position
 * along that edge. No E-press; triggered automatically by proximity. When
 * `requiresFinalUnlock` is set the edge stays blocked (with a nudge back) until
 * every keepsake is collected.
 */
export interface LocationEdgeExit {
  readonly id: string;
  readonly edge: MapEdge;
  readonly destinationLocationId: string;
  readonly destinationEdge: MapEdge;
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
  /**
   * Gate on EVERY collected letter (both friends' plus ____'s own), not just
   * the two friend letters. Used by the clearing shore's origami ritual, which
   * needs all three letters in hand. Until then it shows `lockedDialogue`.
   */
  readonly requiresAllKeepsakes?: boolean;
  readonly lockedDialogue?: readonly DialogueLine[];
  /**
   * After the ending is complete, this interaction opens the full-screen photo
   * wall overlay instead of showing its dialogue. Before the ending it keeps its
   * ordinary dialogue behaviour. Used by ____'s room photo wall.
   */
  readonly photoWallAfterEnding?: boolean;
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
  /** Screen projection for this map. Defaults to 'iso' when omitted. */
  readonly projection?: ProjectionMode;
  readonly title: string;
  readonly mapKey: string;
  readonly mapUrl: string;
  readonly defaultSpawnId: string;
  readonly activityId?: string;
  readonly rewardPresentation?: RewardPresentation;
  readonly rewardMessage?: readonly DialogueLine[];
  readonly keepsake?: KeepsakeDefinition;
  readonly exits: readonly LocationExit[];
  /** Edge-to-edge transitions to adjacent outdoor areas (walk off the side). */
  readonly edgeExits?: readonly LocationEdgeExit[];
  readonly interactions: readonly LocationInteraction[];
  /** One-time entry dialogues (cold-open intro, warm return-home beat). */
  readonly enterBeats?: readonly LocationEnterBeat[];
  /** When both friend keepsakes are collected, the room takes on a warm lighting tint. */
  readonly warmLightingRequiresAllFriendKeepsakes?: boolean;
}
