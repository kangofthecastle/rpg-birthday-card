// The keepsake ritual — pure, framework-free model.
//
// No DOM, no canvas, no audio: the whole ritual is a deterministic state machine
// over three components, each with its OWN verb and feel:
//
//   1. ____'s letter  → the HULL   — FOLD:  three direct-manipulation folds. Each
//      fold is a CONTINUOUS gesture: the flap tracks the pointer, folding a little
//      more with every pixel of drag (setFoldProgress(t), 0→1). Release past the
//      commit threshold settles the fold home; release early falls back open — no
//      penalty, only patience.
//   2. ____'s letter → the SAIL  — HOIST: one continuous fold to make the
//      triangle, then the sail rides UP pinned to the pointer's height until it
//      reaches the masthead.
//   3. ____'s sheet music → the LANTERN — ROLL then LIGHT: a sideways (horizontal)
//      drag rolls the page across into a cylinder (staff lines wrapping, plucked
//      notes sounding one by one); then press-and-HOLD to kindle it until it glows
//      through.
//
// There is no fail state — every gesture only ever moves the ritual forward.
// Kept dependency-free so the sequence unit-tests in isolation and drives the
// canvas view reproducibly.

export type ComponentId = 'hull' | 'sail' | 'lantern';
export type Verb = 'fold' | 'hoist' | 'roll' | 'kindle';

/**
 * The intermediate silhouettes of the paper-boat fold, in order. Reduced to a
 * three-fold sequence, each shape derived as the EXACT folded silhouette of the
 * previous one (conservation of paper — half the height after the half-fold, the
 * corners tucked into the peak, the peak pulled open into the boat):
 *
 *   sheet — the flat letter, her handwriting face up
 *   book  — folded in half (top edge down to the bottom): same width, half height
 *   peak  — both top corners folded in to the centre: the book minus two corners
 *   boat  — the peak pulled open from the sides into the finished two-horned hull
 */
export type HullShape = 'sheet' | 'book' | 'peak' | 'boat';

/** Which axis the finger travels along for a fold (drives the view's pointer
 * math + the drag hint the player sees). Diagonal = a corner drag. */
export type DragAxis = 'horizontal' | 'vertical' | 'diagonal';

/** Which way the moving flap folds (drives the view's hint arrow direction). */
export type FoldToward = 'up' | 'down' | 'left' | 'right';

/** How the view renders the fold: a single reflected flap, two symmetric corner
 * flaps folded by one drag, or a continuous open-out morph between silhouettes. */
export type FoldKind = 'reflect' | 'corners' | 'open';

/** Orientation of the crease LINE the view draws (a fold is a reflection across
 * it); the required drag runs across it. */
export type CreaseLine = 'horizontal' | 'vertical' | 'diagonal';

export interface HullCrease {
  readonly id: string;
  /** One-line diegetic hint shown while the fold is pending. */
  readonly hint: string;
  /** A few of ____'s words that compress into the hull as this fold takes. */
  readonly snippet: string;
  /** Orientation of the crease line (view). */
  readonly line: CreaseLine;
  /** The finger-travel axis a fold drag moves along (view hint + pointer math). */
  readonly dragAxis: DragAxis;
  /** Which way the flap folds (view hint arrow). */
  readonly toward: FoldToward;
  /** How the view renders this fold. */
  readonly kind: FoldKind;
  /** Hull only: the silhouette resting on the table BEFORE this fold. */
  readonly fromShape?: HullShape;
  /** Hull only: the silhouette this fold folds the paper INTO. */
  readonly toShape?: HullShape;
}

export interface FoldComponent {
  readonly id: ComponentId;
  readonly verb: Verb;
  /** Warm label for the component being worked. */
  readonly label: string;
  /** The keepsake (letter or sheet music) this component is made from. */
  readonly letterKeepsakeId: string;
  /** The line spoken when this component clicks into place. */
  readonly assembledLine: string;
}

// --- content ---------------------------------------------------------------

/**
 * ____'s letter, folded into the hull in THREE continuous folds. Each fold's
 * `fromShape` is exactly the previous fold's `toShape`, and each silhouette is
 * the true folded outline of the one before it — so the paper never jumps in size
 * or proportion, it only ever gets folded. Snippets are pulled from her kept
 * letter, so you are folding the words themselves.
 */
export const HULL_CREASES: readonly HullCrease[] = [
  {
    id: 'hull-1',
    hint: 'Drag the top edge down onto the bottom',
    snippet: '',
    line: 'horizontal',
    dragAxis: 'vertical',
    toward: 'down',
    kind: 'reflect',
    fromShape: 'sheet',
    toShape: 'book',
  },
  {
    id: 'hull-2',
    hint: 'Fold the top corners into the centre',
    snippet: '',
    line: 'diagonal',
    dragAxis: 'horizontal',
    toward: 'down',
    kind: 'corners',
    fromShape: 'book',
    toShape: 'peak',
  },
  {
    id: 'hull-3',
    hint: 'Pull it open from the sides',
    snippet: '',
    line: 'vertical',
    dragAxis: 'horizontal',
    toward: 'right',
    kind: 'open',
    fromShape: 'peak',
    toShape: 'boat',
  },
];

/** ____'s letter — the single continuous fold that makes the sail triangle,
 * then the lines that flutter on the sail face as it is hoisted. */
export const SAIL_FOLD_CREASE: HullCrease = {
  id: 'sail-fold',
  hint: 'Fold a triangle',
  snippet: '',
  line: 'diagonal',
  dragAxis: 'diagonal',
  toward: 'up',
  kind: 'reflect',
};

/** Lines of ____'s letter that flutter across the sail face while hoisting. */
export const SAIL_FACE_LINES: readonly string[] = [
  '',
  '',
  '',
  '',
];

/** ____'s sheet music — the piece she just played. These are the note letters
 * that ring out (plucked) one by one as the page rolls into the lantern. */
export const LANTERN_STAVES: readonly string[] = [
  '𝄞 the piece, finally played',
  'played once, all the way through',
];

export const FOLD_COMPONENTS: readonly FoldComponent[] = [
  {
    id: 'hull',
    verb: 'fold',
    label: "____'s letter, the hull",
    letterKeepsakeId: 'glowing-koi-scale',
    assembledLine: 'The hull is complete',
  },
  {
    id: 'sail',
    verb: 'hoist',
    label: "____'s letter, the sail",
    letterKeepsakeId: 'defused-spike-charm',
    assembledLine: 'The sail catches wind.',
  },
  {
    id: 'lantern',
    verb: 'roll',
    label: 'Your sheet music, the lantern',
    letterKeepsakeId: 'recipient-sheet-music',
    assembledLine: 'The lantern casts a glow over the water.',
  },
];

// --- tunables (shared by model + view) -------------------------------------

/** A fold commits (settles home) when it is dragged at least this far. Release
 * before it and the flap falls back open — no penalty, try again. */
export const FOLD_COMMIT_THRESHOLD = 0.65;

/** The open-out fold (peak → boat) is a big, imprecise two-handed pull rather
 * than a crisp crease, so it commits on a SHORTER drag — a natural medium pull
 * registers reliably instead of stalling just short of the full span. */
export const FOLD_COMMIT_THRESHOLD_OPEN = 0.55;

/** The commit threshold for the fold currently pending — lower for the open-out
 * fold (see FOLD_COMMIT_THRESHOLD_OPEN), the standard threshold otherwise. */
export function foldCommitThreshold(state: RitualState): number {
  return currentFoldCrease(state)?.kind === 'open'
    ? FOLD_COMMIT_THRESHOLD_OPEN
    : FOLD_COMMIT_THRESHOLD;
}

/** Progress windows where the sail visibly catches wind and sways (view feel). */
export const SAIL_WOBBLE_WINDOWS: readonly (readonly [number, number])[] = [
  [0.36, 0.5],
  [0.66, 0.82],
];

/** Snap tolerance for the hoist reaching the masthead: a drag that lands this
 * close to the very top (a near-masthead release, ~0.9996 in practice) counts as
 * fully home, so the sail clicks into place instead of stalling a pixel short. */
export const HOIST_COMPLETE_THRESHOLD = 0.985;

/** Total swept angle (radians) that rolls the sheet fully into the lantern — one
 * full turn of the tube surface. The primary roll input is a LINEAR horizontal
 * drag (see foldStage's ROLL_SWIPE_SPAN), which the view converts into swept
 * angle; circular drag also contributes. Progress = rollAngle / ROLL_TARGET, so
 * this value cancels out of the linear-drag difficulty and only sets how far the
 * rendered surface rotates across a full roll. */
export const ROLL_TARGET = Math.PI * 2;
/** How many plucked notes sound across a full roll. */
export const ROLL_NOTE_COUNT = 6;

/** Hold time (ms) that kindles the lantern to full glow. */
export const KINDLE_TARGET_MS = 1500;
/** When released early the kindle bleeds off, but slower than it builds — so it
 * is unfailable, only patient. */
export const KINDLE_DECAY_RATE = 0.55;

export type RitualPhase = 'working' | 'assembled' | 'complete';

export interface RitualState {
  /** 0 = hull, 1 = sail, 2 = lantern. */
  readonly componentIndex: number;
  readonly phase: RitualPhase;
  /** hull: how many folds have settled. */
  readonly hullCreaseIndex: number;
  /** The live 0..1 progress of the fold currently under the pointer (hull folds
   * and the single sail fold). Reset to 0 whenever a fold settles or falls back. */
  readonly foldProgress: number;
  /** sail: whether the single triangle fold has settled yet. */
  readonly sailFolded: boolean;
  /** sail: 0..1 hoist progress (pinned to the pointer's height). */
  readonly hoistProgress: number;
  /** lantern: accumulated swept angle (radians), clamped to ROLL_TARGET. */
  readonly rollAngle: number;
  /** lantern: accumulated kindle hold (ms), clamped to KINDLE_TARGET_MS. */
  readonly kindleMs: number;
}

export function createRitualState(): RitualState {
  return {
    componentIndex: 0,
    phase: 'working',
    hullCreaseIndex: 0,
    foldProgress: 0,
    sailFolded: false,
    hoistProgress: 0,
    rollAngle: 0,
    kindleMs: 0,
  };
}

export function currentComponent(state: RitualState): FoldComponent | undefined {
  return FOLD_COMPONENTS[state.componentIndex];
}

export function currentVerb(state: RitualState): Verb | undefined {
  if (state.phase !== 'working') {
    return undefined;
  }
  const component = currentComponent(state);
  if (!component) {
    return undefined;
  }
  if (component.id === 'sail') {
    return state.sailFolded ? 'hoist' : 'fold';
  }
  if (component.id === 'lantern') {
    return state.rollAngle >= ROLL_TARGET ? 'kindle' : 'roll';
  }
  return 'fold';
}

/** The hull fold pending next (hull only), or undefined. */
export function currentHullCrease(state: RitualState): HullCrease | undefined {
  const component = currentComponent(state);
  if (state.phase !== 'working' || component?.id !== 'hull') {
    return undefined;
  }
  return HULL_CREASES[state.hullCreaseIndex];
}

/** The fold pending under the pointer right now (hull fold or the sail fold),
 * or undefined when the current verb isn't a fold. */
export function currentFoldCrease(state: RitualState): HullCrease | undefined {
  if (currentVerb(state) !== 'fold') {
    return undefined;
  }
  const component = currentComponent(state);
  if (component?.id === 'hull') {
    return HULL_CREASES[state.hullCreaseIndex];
  }
  if (component?.id === 'sail') {
    return SAIL_FOLD_CREASE;
  }
  return undefined;
}

/**
 * The silhouette the hull is resting in RIGHT NOW — the shape before the pending
 * fold, or 'boat' once every fold is settled. Drives the paper-boat rendering.
 */
export function currentHullShape(state: RitualState): HullShape {
  const crease = HULL_CREASES[state.hullCreaseIndex];
  return crease?.fromShape ?? 'boat';
}

export function isComplete(state: RitualState): boolean {
  return state.phase === 'complete';
}

export function isAssembled(state: RitualState): boolean {
  return state.phase === 'assembled';
}

// --- verb: FOLD — continuous direct manipulation ---------------------------

/**
 * Sets the live 0..1 progress of the fold currently under the pointer. The view
 * computes `t` from the pointer's position relative to the crease and calls this
 * every move, so the flap tracks the finger. A no-op unless a fold is pending.
 */
export function setFoldProgress(state: RitualState, t: number): RitualState {
  if (currentVerb(state) !== 'fold') {
    return state;
  }
  const clamped = clamp01(t);
  if (clamped === state.foldProgress) {
    return state;
  }
  return { ...state, foldProgress: clamped };
}

/** True if the current fold has been dragged far enough to settle on release. */
export function willCommitFold(state: RitualState): boolean {
  return currentVerb(state) === 'fold' && state.foldProgress >= foldCommitThreshold(state);
}

/**
 * Settles the current fold home: advances the hull one shape (or clicks the hull
 * together after the last fold), or makes the sail triangle. Resets the live fold
 * progress. A no-op unless a fold is pending.
 */
export function commitFold(state: RitualState): RitualState {
  if (currentVerb(state) !== 'fold') {
    return state;
  }
  const component = currentComponent(state);
  if (component?.id === 'hull') {
    const nextIndex = state.hullCreaseIndex + 1;
    if (nextIndex >= HULL_CREASES.length) {
      return { ...state, hullCreaseIndex: nextIndex, foldProgress: 0, phase: 'assembled' };
    }
    return { ...state, hullCreaseIndex: nextIndex, foldProgress: 0 };
  }
  if (component?.id === 'sail') {
    return { ...state, sailFolded: true, foldProgress: 0 };
  }
  return state;
}

/**
 * Ends a fold gesture: commits if it was dragged past the threshold, otherwise
 * falls the flap back open (progress → 0). Unfailable either way.
 */
export function releaseFold(state: RitualState): RitualState {
  if (currentVerb(state) !== 'fold') {
    return state;
  }
  if (state.foldProgress >= foldCommitThreshold(state)) {
    return commitFold(state);
  }
  return { ...state, foldProgress: 0 };
}

// --- verb: HOIST (sail) ----------------------------------------------------

/** True while the given hoist progress sits inside a wind-catch window (the
 * sail sways and the rope catches — purely a view/feel cue now). */
export function isCatchingWind(progress: number): boolean {
  return SAIL_WOBBLE_WINDOWS.some(([lo, hi]) => progress >= lo && progress < hi);
}

/**
 * Sets the sail's hoist to an absolute 0..1 — the view pins this to the pointer's
 * height, so the sail itself tracks the finger up the mast. When it reaches the
 * masthead the sail clicks into place (assembled).
 */
export function setHoistProgress(state: RitualState, progress: number): RitualState {
  if (currentVerb(state) !== 'hoist') {
    return state;
  }
  const next = clamp01(progress);
  // Snap the last sliver home: a release at the masthead lands a hair under 1
  // (e.g. 0.9996), so anything past the tolerance counts as fully hoisted.
  if (next >= HOIST_COMPLETE_THRESHOLD) {
    return { ...state, hoistProgress: 1, phase: 'assembled' };
  }
  if (next === state.hoistProgress) {
    return state;
  }
  return { ...state, hoistProgress: next };
}

// --- verb: ROLL then KINDLE (lantern) --------------------------------------

/** 0..1 fraction the sheet has rolled into the lantern. */
export function rollProgress(state: RitualState): number {
  return clamp01(state.rollAngle / ROLL_TARGET);
}

/** How many plucked notes should have sounded by the current roll angle. */
export function rollNoteIndex(state: RitualState): number {
  return Math.min(ROLL_NOTE_COUNT, Math.floor(rollProgress(state) * ROLL_NOTE_COUNT));
}

/** Applies swept angle (radians, magnitude) from a roll gesture — the view feeds
 * a radian-equivalent from a horizontal drag (primary) or a circular drag.
 * Rolling is direction-agnostic — any sideways sweep or turn wraps the page. */
export function applyRoll(state: RitualState, deltaAngle: number): RitualState {
  if (currentVerb(state) !== 'roll') {
    return state;
  }
  const rollAngle = Math.min(ROLL_TARGET, state.rollAngle + Math.abs(deltaAngle));
  return { ...state, rollAngle };
}

/** 0..1 kindle progress. */
export function kindleProgress(state: RitualState): number {
  return clamp01(state.kindleMs / KINDLE_TARGET_MS);
}

/**
 * Advances the kindle hold by `deltaMs`. While `held` the glow builds; when
 * released it bleeds off (slower than it builds, never below zero). When it
 * reaches full the lantern lights and the component clicks into place.
 */
export function applyKindle(state: RitualState, deltaMs: number, held: boolean): RitualState {
  if (currentVerb(state) !== 'kindle') {
    return state;
  }
  const delta = held ? deltaMs : -deltaMs * KINDLE_DECAY_RATE;
  const kindleMs = Math.max(0, Math.min(KINDLE_TARGET_MS, state.kindleMs + delta));
  if (kindleMs >= KINDLE_TARGET_MS) {
    return { ...state, kindleMs, phase: 'assembled' };
  }
  return { ...state, kindleMs };
}

// --- progression -----------------------------------------------------------

/**
 * Moves from an assembled component to the next one, or to 'complete' if that
 * was the last. A no-op unless a component is currently assembled.
 */
export function advanceComponent(state: RitualState): RitualState {
  if (state.phase !== 'assembled') {
    return state;
  }
  const nextIndex = state.componentIndex + 1;
  if (nextIndex >= FOLD_COMPONENTS.length) {
    return { ...state, phase: 'complete' };
  }
  return { ...state, componentIndex: nextIndex, phase: 'working' };
}

/** 0..1 progress within the current component's verb (continuous — includes the
 * live fold/hoist under the pointer). */
export function componentProgress(state: RitualState): number {
  if (state.phase === 'assembled' || state.phase === 'complete') {
    return 1;
  }
  const component = currentComponent(state);
  if (!component) {
    return 0;
  }
  switch (component.id) {
    case 'hull':
      return clamp01((state.hullCreaseIndex + state.foldProgress) / HULL_CREASES.length);
    case 'sail':
      return state.sailFolded
        ? 0.25 + state.hoistProgress * 0.75
        : state.foldProgress * 0.25;
    case 'lantern':
      return rollProgress(state) * 0.6 + kindleProgress(state) * 0.4;
    default:
      return 0;
  }
}

/** How many components have fully clicked together so far. */
export function assembledComponentCount(state: RitualState): number {
  if (state.phase === 'complete') {
    return FOLD_COMPONENTS.length;
  }
  if (state.phase === 'assembled') {
    return state.componentIndex + 1;
  }
  return state.componentIndex;
}

/** 0..1 across the whole ritual (all three components weighted equally). */
export function ritualProgress(state: RitualState): number {
  const done = assembledComponentCount(state);
  const within = state.phase === 'working' ? componentProgress(state) : 0;
  return clamp01((done + within) / FOLD_COMPONENTS.length);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
