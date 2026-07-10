// The keepsake ritual — pure, framework-free model.
//
// No DOM, no canvas, no audio: the whole ritual is a deterministic state machine
// over three components, each with its OWN verb and feel:
//
//   1. ____'s letter  → the HULL   — FOLD:  direction-aware creases. A fold only
//      takes if you drag roughly perpendicular ACROSS the pulsing crease.
//   2. ____'s letter → the SAIL  — HOIST: one crease to make the triangle, then
//      drag UPWARD along the mast against resistance; the sail catches wind in
//      "wobble windows" partway up and tugs, and you ride it to the top.
//   3. ____'s sheet music → the LANTERN — ROLL then LIGHT: a circular drag rolls
//      the page into a cylinder (staff lines wrapping, plucked notes sounding one
//      by one); then press-and-HOLD to kindle it until it glows through.
//
// There is no fail state — every gesture only ever moves the ritual forward (the
// kindle hold decays gently when released, but never below zero, so it always
// completes with patience). Kept dependency-free so the sequence unit-tests in
// isolation and drives the canvas view reproducibly.

export type ComponentId = 'hull' | 'sail' | 'lantern';
export type Verb = 'fold' | 'hoist' | 'roll' | 'kindle';

/** Which axis the finger travels along for a hull fold (perpendicular to the
 * crease line it must cross). Diagonal creases accept either dominant axis. */
export type DragAxis = 'horizontal' | 'vertical' | 'diagonal';

/** Which half of the paper folds over the crease (drives the view's flip). */
export type FoldToward = 'up' | 'down' | 'left' | 'right';

/** Orientation of the crease LINE the view draws (a fold is a reflection across
 * it); the required drag is perpendicular to this. */
export type CreaseLine = 'horizontal' | 'vertical' | 'diagonal';

export interface HullCrease {
  readonly id: string;
  /** One-line diegetic hint shown while the crease is pending. */
  readonly hint: string;
  /** A few of ____'s words that compress into the hull as this crease takes. */
  readonly snippet: string;
  /** Orientation of the crease line (view). */
  readonly line: CreaseLine;
  /** The finger-travel axis a valid fold drag must move along. */
  readonly dragAxis: DragAxis;
  /** Which half flips over (view). */
  readonly toward: FoldToward;
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

/** ____'s letter, compressing into the hull crease by crease. Snippets are
 * pulled from her kept letter so you are folding the words themselves. */
export const HULL_CREASES: readonly HullCrease[] = [
  {
    id: 'hull-1',
    hint: 'drag down across the crease — fold the sheet in half',
    snippet: '',
    line: 'horizontal',
    dragAxis: 'vertical',
    toward: 'up',
  },
  {
    id: 'hull-2',
    hint: 'drag the corners inward — bring the top down to the centre',
    snippet: '',
    line: 'diagonal',
    dragAxis: 'diagonal',
    toward: 'down',
  },
  {
    id: 'hull-3',
    hint: 'drag up across the base — fold the flap up',
    snippet: 'it felt like we had',
    line: 'horizontal',
    dragAxis: 'vertical',
    toward: 'up',
  },
  {
    id: 'hull-4',
    hint: 'drag across — open it out and press the hull flat',
    snippet: 'all the time in the world.',
    line: 'vertical',
    dragAxis: 'horizontal',
    toward: 'left',
  },
];

/** ____'s letter — the single crease that makes the sail triangle, then the
 * lines that flutter on the sail face as it is hoisted. */
export const SAIL_FOLD_CREASE: HullCrease = {
  id: 'sail-fold',
  hint: 'drag corner to corner — fold the triangle of the sail',
  snippet: '',
  line: 'diagonal',
  dragAxis: 'diagonal',
  toward: 'up',
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
  '𝄞  the piece, finally played',
  'played once, all the way through',
];

export const FOLD_COMPONENTS: readonly FoldComponent[] = [
  {
    id: 'hull',
    verb: 'fold',
    label: "____'s letter — the hull",
    letterKeepsakeId: 'glowing-koi-scale',
    assembledLine: 'The hull holds its shape. Her words, pressed into something that floats.',
  },
  {
    id: 'sail',
    verb: 'hoist',
    label: "____'s letter — the sail",
    letterKeepsakeId: 'defused-spike-charm',
    assembledLine: 'The sail catches, and holds. It has your back the whole way.',
  },
  {
    id: 'lantern',
    verb: 'roll',
    label: 'your sheet music — the lantern',
    letterKeepsakeId: 'golden-hour-photo',
    assembledLine: 'The music curls into a lantern, and the light comes up through the notes.',
  },
];

// --- tunables (shared by model + view) -------------------------------------

/** Minimum drag length (logical px) for a hull fold to register. */
export const FOLD_DRAG_MIN = 22;

/** Progress gained per logical px of upward hoist drag (before resistance). */
export const HOIST_GAIN = 0.0075;
/** Progress windows where the sail catches wind and tugs (higher resistance). */
export const SAIL_WOBBLE_WINDOWS: readonly (readonly [number, number])[] = [
  [0.36, 0.5],
  [0.66, 0.82],
];
/** Resistance multiplier applied to hoist gain inside a wobble window. */
export const HOIST_CATCH_RESISTANCE = 0.4;

/** Total swept angle (radians) that rolls the sheet fully into the lantern. */
export const ROLL_TARGET = Math.PI * 3;
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
  /** hull: how many creases have folded. */
  readonly hullCreaseIndex: number;
  /** sail: whether the single triangle crease has folded yet. */
  readonly sailFolded: boolean;
  /** sail: 0..1 hoist progress. */
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

/** The hull crease pending next (hull only), or undefined. */
export function currentHullCrease(state: RitualState): HullCrease | undefined {
  const component = currentComponent(state);
  if (state.phase !== 'working' || component?.id !== 'hull') {
    return undefined;
  }
  return HULL_CREASES[state.hullCreaseIndex];
}

export function isComplete(state: RitualState): boolean {
  return state.phase === 'complete';
}

export function isAssembled(state: RitualState): boolean {
  return state.phase === 'assembled';
}

// --- verb: FOLD (hull creases + the one sail crease) -----------------------

/** True if a drag (dx, dy in logical px) is a valid fold for `crease`: long
 * enough and moving along the required perpendicular axis. */
export function isValidFoldDrag(crease: HullCrease, dx: number, dy: number): boolean {
  const length = Math.hypot(dx, dy);
  if (length < FOLD_DRAG_MIN) {
    return false;
  }
  if (crease.dragAxis === 'diagonal') {
    // A corner fold: accept a genuinely diagonal drag (both axes contribute).
    return Math.abs(dx) > FOLD_DRAG_MIN * 0.4 && Math.abs(dy) > FOLD_DRAG_MIN * 0.4;
  }
  const horizontal = Math.abs(dx) > Math.abs(dy);
  return crease.dragAxis === (horizontal ? 'horizontal' : 'vertical');
}

/**
 * Applies a fold drag to the current component. On the hull it advances one
 * crease if the drag direction matches; on the sail (pre-hoist) it makes the
 * triangle. Returns the same state (no-op) if the drag doesn't qualify or the
 * current verb isn't a fold. When the hull's last crease folds, the hull clicks
 * into place (phase → 'assembled').
 */
export function applyFoldDrag(state: RitualState, dx: number, dy: number): RitualState {
  if (currentVerb(state) !== 'fold') {
    return state;
  }
  const component = currentComponent(state);
  if (!component) {
    return state;
  }

  if (component.id === 'hull') {
    const crease = HULL_CREASES[state.hullCreaseIndex];
    if (!crease || !isValidFoldDrag(crease, dx, dy)) {
      return state;
    }
    const nextIndex = state.hullCreaseIndex + 1;
    if (nextIndex >= HULL_CREASES.length) {
      return { ...state, hullCreaseIndex: nextIndex, phase: 'assembled' };
    }
    return { ...state, hullCreaseIndex: nextIndex };
  }

  if (component.id === 'sail') {
    if (!isValidFoldDrag(SAIL_FOLD_CREASE, dx, dy)) {
      return state;
    }
    return { ...state, sailFolded: true };
  }

  return state;
}

// --- verb: HOIST (sail) ----------------------------------------------------

/** True while the given hoist progress sits inside a wind-catch window. */
export function isCatchingWind(progress: number): boolean {
  return SAIL_WOBBLE_WINDOWS.some(([lo, hi]) => progress >= lo && progress < hi);
}

/** Resistance factor at the given progress (lower = tugs harder). */
export function hoistResistance(progress: number): number {
  return isCatchingWind(progress) ? HOIST_CATCH_RESISTANCE : 1;
}

/**
 * Applies an upward hoist drag (upwardPx > 0 means the finger moved up). Only
 * upward motion raises the sail; inside a catch window it gains less (the sail
 * tugs). When progress reaches 1 the sail clicks into place (assembled).
 */
export function applyHoist(state: RitualState, upwardPx: number): RitualState {
  if (currentVerb(state) !== 'hoist' || upwardPx <= 0) {
    return state;
  }
  const gain = upwardPx * HOIST_GAIN * hoistResistance(state.hoistProgress);
  const next = clamp01(state.hoistProgress + gain);
  if (next >= 1) {
    return { ...state, hoistProgress: 1, phase: 'assembled' };
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

/** Applies swept angle (radians, magnitude) from a circular drag. Rolling is
 * direction-agnostic — any turning wraps the page. */
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

/** 0..1 progress within the current component's verb. */
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
      return state.hullCreaseIndex / HULL_CREASES.length;
    case 'sail':
      return (state.sailFolded ? 0.25 : 0) + (state.sailFolded ? state.hoistProgress * 0.75 : 0);
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
