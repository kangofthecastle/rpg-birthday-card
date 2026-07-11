// The keepsake ritual — canvas view for all three verbs.
//
// The stage renders whichever component is being worked and translates raw
// pointer motion into CONTINUOUS, directly-manipulated gestures — the paper
// deforms under the finger every frame, never a canned tween triggered by a
// threshold:
//
//   FOLD  (hull + sail) — grab near the flap's free edge and drag; the flap folds
//                         about its crease in lock-step with the pointer
//                         (onFoldProgress(t)). Release → onFoldRelease(); the view
//                         settles the flap home (commit) or falls it back open.
//   HOIST (sail)        — the sail is pinned to the pointer's height and rides the
//                         mast (onHoistProgress(progress)).
//   ROLL  (lantern)     — a sideways (horizontal) drag rolls the page across into
//                         a cylinder, like rolling a scroll along a table; a
//                         circular drag also works (onRoll(deltaAngle)).
//   KINDLE(lantern)     — press-and-hold (onKindleChange(held)).
//
// No model logic lives here: the activity owns the RitualState, pushes the derived
// numbers back in, and the stage only draws. The three finished pieces (hull,
// sail, lantern) are drawn file-first — each tries
// /assets/activities/fold-the-letters/<piece>.png and falls back to a procedural
// draw — and the assembled boat is their COMPOSITE, not one sprite.

import { isImageUrl } from '../../game/assetProbe';
import { ROLL_NOTE_COUNT, ROLL_TARGET, SAIL_WOBBLE_WINDOWS } from './foldModel';
import type { ComponentId, HullCrease, HullShape, Verb } from './foldModel';

const LOGICAL_WIDTH = 640;
const LOGICAL_HEIGHT = 400;

// The stage is authored entirely in the LOGICAL 640x400 space, but the canvas
// backing store is RENDER_SCALE times larger so the near-fullscreen panel
// upscales a sharp buffer instead of a chunky 640-wide one. render() sets a base
// transform of this scale each frame; every draw + the pointer math below stay in
// logical coords, so nothing else changes.
const RENDER_SCALE = 2;

// Hull silhouette layout. The paper is drawn as the real intermediate origami
// shape for the current step, in ISOTROPIC normalized coords (same px per unit on
// both axes) so reflections/45° corner folds stay geometrically exact and each
// silhouette is the true folded outline of the previous one.
const HULL_CX = 320;
const HULL_CY = 182;
const HULL_H = 128; // shared half-extent (x and y) — keeps folds square-true.

// How far (logical px) an "open" pull drag travels to fully open the boat. Kept
// short (vs the old 130) so a natural medium pull reaches the open-fold commit
// threshold — the peak→boat pull is a broad two-sided tug, not a precise crease.
const PULL_SPAN = 95;
// Per-frame settle speed for the short ease home / fall-back-open after release.
const SETTLE_RATE = 0.14;

// Ambient-animation clock rate: the loop advances `this.time` by real elapsed
// milliseconds × this, so every wobble/hint sinusoid runs at a refresh-rate
// INDEPENDENT speed. Tuned so 60fps reproduces the old fixed +0.05/frame step
// (0.05 × 60 / 1000), i.e. all existing sin() frequencies are unchanged.
const TIME_RATE = 0.05 * 60 / 1000;
// Per-frame exponential smoothing for the RENDERED sail hoist trailing the raw
// (model) target — takes the teleport edge off direct manipulation without
// adding meaningful lag. Model progress stays raw; only the drawn sail smooths.
const HOIST_SMOOTH_K = 0.35;
// How far outside a wobble window the wind-catch factor ramps in/out (progress
// units), so the sail's sway swells across the boundary instead of snapping.
const WIND_RAMP = 0.07;
// The sail intro's arrival cross-fade: over the LAST (1 − this) fraction of the
// intro the flying flat triangle dissolves into the billowed sail on the mast, the
// belly swelling from flat — so the fold "catches wind and billows" rather than the
// sail popping in. A view-feel fraction; the DURATION is FoldTiming.sailIntroMs.
const SAIL_ARRIVE_START = 0.55;
// A plucked-note sparkle at the rolling tube lives this long (ms).
const ROLL_SPARKLE_MS = 420;
// Linear-roll feel: logical px of HORIZONTAL drag that completes the whole roll.
// The primary lantern gesture is a sideways sweep (a scroll rolled along a table),
// tuned so ~2–3 comfortable swipes across the 640-wide stage curl it fully. The
// view converts |dx|/ROLL_SWIPE_SPAN of the roll into swept angle each move, so
// this alone sets the linear difficulty (independent of ROLL_TARGET).
const ROLL_SWIPE_SPAN = 800;

type NPoint = readonly [number, number];

// The three-fold silhouettes, in the order the hull folds produce them. Each is
// derived from the previous by an exact fold:
//   sheet → book : fold in half about the horizontal centre (same width, half height)
//   book  → peak : both top corners folded to the centre (book minus two triangles)
//   peak  → boat : the peak pulled open from the sides into the two-horned hull
// `peak` and `boat` share a vertex order so the open-out is a clean index morph.
const HULL_SHAPE_POLYS: Readonly<Record<HullShape, readonly NPoint[]>> = {
  sheet: [
    [-0.75, -1.1],
    [0.75, -1.1],
    [0.75, 0.5],
    [-0.75, 0.5],
  ],
  book: [
    [-0.75, -0.3],
    [0.75, -0.3],
    [0.75, 0.5],
    [-0.75, 0.5],
  ],
  peak: [
    [0, -0.3], // apex (top centre)
    [0.75, 0.45], // right shoulder
    [0.75, 0.5], // bottom-right
    [-0.75, 0.5], // bottom-left
    [-0.75, 0.45], // left shoulder
  ],
  boat: [
    [0, 0.1], // centre dip  (← peak apex, dropped)
    [0.86, -0.3], // right horn (← right shoulder, risen out)
    [0.66, 0.5], // bottom-right
    [-0.66, 0.5], // bottom-left
    [-0.86, -0.3], // left horn (← left shoulder, risen out)
  ],
};

// Faint interior fold marks that sell each shape as folded paper.
const HULL_SHAPE_CREASES: Readonly<Record<HullShape, readonly (readonly [NPoint, NPoint])[]>> = {
  sheet: [],
  book: [[[-0.75, -0.3], [0.75, -0.3]]],
  peak: [
    [[0, -0.3], [0.75, 0.45]],
    [[0, -0.3], [-0.75, 0.45]],
  ],
  boat: [
    [[0, 0.1], [0, 0.5]],
    [[-0.86, -0.3], [0, 0.1]],
    [[0.86, -0.3], [0, 0.1]],
  ],
};

const PAPER_LIGHT = '#f6ecd2';
const PAPER_MID = '#eaddba';
const PAPER_BACK = '#d8c79c';
const INK = 'rgba(74, 52, 30, 0.72)';
// Guidance-hint palette. Tuned to read on ANY backdrop — the painted warm-horizon
// backdrop.png as well as the flat dark fallback — so each arrow / crease guide
// carries its OWN contrast instead of relying on a dark background: a light warm
// CREAM core stroked over a dark OUTLINE underlay, round-capped and modestly
// larger. A gentle alpha "breathe" (hintPulse) draws the eye without flashing.
const HINT_CREAM = '#fff4d6';
const HINT_OUTLINE = 'rgba(38, 24, 10, 0.9)';

const ASSET_BASE = '/assets/activities/fold-the-letters';
// Optional painted stage backdrop — a full-canvas 1280×800 (2×) painting of the
// twilight table + water, its waterline at pixel y=704 = logical y=352 =
// WATERLINE_Y, so the tray boat sits exactly on the painted water. File-first
// (isImageUrl probe, zero code changes): when present it is drawn covering the
// whole canvas UNDER everything, replacing the flat gradient; the gradient is the
// fallback when the file is absent. Keyed 'backdrop' in `this.images`.
const BACKDROP_URL = `${ASSET_BASE}/backdrop.png`;
const PIECE_FILES: Readonly<Record<string, string>> = {
  hull: `${ASSET_BASE}/hull.png`,
  sail: `${ASSET_BASE}/sail.png`,
  lantern: `${ASSET_BASE}/lantern.png`,
  'recipient-boat': `${ASSET_BASE}/recipient-boat.png`,
};

// Optional drop-in art used ONLY during the HOIST stage (the raising of the
// sail), probed file-first like the pieces above so they slot in with zero code
// changes and everything looks unchanged until they land:
//   sail-loose.png — the sail fabric ALONE (no pole), drawn as the hoisted cloth
//     with the same billow warp; fallback chain sail-loose → sail → procedural.
//   mast.png       — a proper painted mast/pole, drawn to the mast geometry
//     (mastTop..mastBottom) in place of the procedural #bd914f bar; else the bar.
// The assembled/tray/ending art stays sail.png (unchanged).
const HOIST_ART_FILES: Readonly<Record<string, string>> = {
  'sail-loose': `${ASSET_BASE}/sail-loose.png`,
  mast: `${ASSET_BASE}/mast.png`,
};

// Grab forgiveness for on-paper pickup (logical px): a pointerdown must land on
// the current paper silhouette or within this margin of its edge to start a
// gesture, so clicking empty background does nothing but imprecise grabs near an
// edge/corner still take. Modest by design.
const PICK_MARGIN = 24;

// The lantern sheet's footprint (roll/kindle) in logical coords — the flat page
// as drawn in drawLanternStage, centred on rollCentre(). Used for on-page pickup.
const LANTERN_PAGE_W = 260;
const LANTERN_PAGE_H = 150;

// Optional drop-in paper textures, one per piece — the flat unfolded sheet (each
// 512x640, straight-on, filling the frame edge-to-edge). When a file is present it
// becomes the paper's fill in EVERY fold state, drawn to the fixed sheet frame
// under the same clip + reflection transform as the handwriting, so it visibly
// folds/halves with the paper. Procedural paper + handwriting is the fallback.
// Piece → letter: hull = ____, sail = ____, lantern = ____'s sheet music.
const PIECE_PAPER_FILES: Readonly<Record<string, string>> = {
  'paper:hull': `${ASSET_BASE}/paper-friendone.png`,
  'paper:sail': `${ASSET_BASE}/paper-friendtwo.png`,
  'paper:lantern': `${ASSET_BASE}/paper-sheetmusic.png`,
};

// The assembled boat rides in the lower-CENTRE of the logical stage, not jammed
// against the very bottom. The whole 640x400 space maps to the visible stage
// (the canvas stretches to fill it — no letterbox crop), so anchoring the boat
// here keeps the full composite (sail top → hull base) comfortably on-canvas at
// every panel size, with a clear water margin below it. baseY was previously
// LOGICAL_HEIGHT - 30 (370) which sat the hull at ~94% down — essentially at the
// clipped edge on the near-fullscreen panel.
const BOAT_PIECE_COUNT = 3;
/** Top of the water band. The hull's base rests right on this line. */
const WATERLINE_Y = 352;
/** Boat-tray origin at rest (hull base sits on the waterline). */
const BOAT_REST_Y = 346;
/** How far above rest the finished boat floats down from. */
const BOAT_DROP_RISE = 55;
/** Gentle eased descent duration for the finished boat settling onto the water. */
const BOAT_DROP_MS = 1000;

// Composite anchors in the boat-tray's local frame (origin = waterline centre).
// Documented in public/assets/activities/fold-the-letters/README.md so real art
// slots in with zero code changes. Each piece is drawn centred on its anchor.
export const TRAY_ANCHORS = {
  /** Hull sits on the waterline. */
  hull: { x: 0, y: -16, w: 132, h: 44 },
  /** Sail mounts on the hull's mast point. Seated DEEP so the baked-in mast's foot
   * plants down INSIDE the hull's deck well (its opaque foot lands at local y≈-6,
   * well below the horn lip at y≈-24) — not perched at the deck's edge with a gap.
   * (Nudged 3px lower here so the base clearly reads as planted in the hull, not
   * balanced on its near rim.) */
  sail: { x: 2, y: -40, w: 76, h: 78 },
  /** Lantern hangs OFF the bow tip (left horn): positioned so the loop at the top
   * of lantern.png rests ON the bow point — as if the horn threads through the
   * handle — with the body hanging just below/outboard. Seated on the horn's
   * VISIBLE point (the tip tapers to a faint pixel, so the loop sits a touch inboard
   * of the geometric apex to read as threaded); no drawn hook arm. Nudged 4px
   * outboard (left) so the lantern hangs clear off the bow instead of crowding it. */
  lantern: { x: -47, y: -15, w: 30, h: 40 },
} as const;

interface Point {
  x: number;
  y: number;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A single reflected flap: its crease line a→b, its polygon (in the from-shape),
 * and its free-edge reference F0 (at rest) and F1 (fully folded) so the pointer
 * can be projected onto F0→F1 to drive fold progress. */
interface Flap {
  a: Point;
  b: Point;
  poly: Point[];
  f0: Point;
  f1: Point;
}

/** Everything the view needs to render + drive one fold gesture continuously. */
interface FoldPlan {
  kind: 'reflect' | 'corners' | 'open';
  /** The part that stays put (drawn as settled paper) — reflect/corners. */
  base?: Point[];
  /** One flap (reflect) or two symmetric flaps (corners). */
  flaps?: Flap[];
  /** Which flap the pointer's progress is read from (corners: the grabbed side). */
  active: number;
  /** open: the silhouettes to morph between (px). */
  fromPoly?: Point[];
  toPoly?: Point[];
  /** Where the pull started (open morph reference). */
  grab: Point;
  /** Text frame + lines to keep the handwriting continuous across the fold. */
  frame: Rect;
  lines: string[];
  fontPx: number;
}

/** The completion hand-down: the finished component captured at full size and
 * flown/shrunk into its tray anchor over `durationMs`. */
interface HandDown {
  phase: 'capture' | 'fly';
  start: number;
  durationMs: number;
  key: 'hull' | 'sail' | 'lantern';
  /** Logical-space bounds of the full-size finished component (capture source). */
  src: Rect;
  /** The tray-piece count this lands as (revealed on arrival). */
  target: number;
  snapshot?: HTMLCanvasElement;
}

/** The sail's fold → hoist bridge: after the diagonal fold commits, the folded
 * paper triangle is captured as a clean alpha sprite and flown/rotated/scaled from
 * where the fold finished to the sail's hoist-START seat at the mast foot, so the
 * hoist doesn't begin with a hard one-frame swap. */
interface SailIntro {
  phase: 'capture' | 'fly';
  start: number;
  durationMs: number;
  /** Folded-triangle silhouette (logical) captured to the flying buffer. */
  srcPoly: Point[];
  /** Padded bounds of srcPoly — the capture region. */
  src: Rect;
  /** The sail's hoist-start footprint at the mast (hoist = 0). */
  dst: Rect;
  snapshot?: HTMLCanvasElement;
  onDone?: () => void;
}

export interface FoldStageCallbacks {
  /** Live 0..1 fold progress as the pointer drags the flap across the crease. */
  readonly onFoldProgress: (t: number) => void;
  /** The fold gesture ended — the activity decides commit vs fall-back-open. */
  readonly onFoldRelease: () => void;
  /** Absolute 0..1 hoist, pinned to the pointer's height on the mast. */
  readonly onHoistProgress: (progress: number) => void;
  /** Incremental swept angle (radians) for rolling. */
  readonly onRoll: (deltaAngle: number) => void;
  /** Press / release for the kindle hold. */
  readonly onKindleChange: (held: boolean) => void;
}

export class FoldStage {
  // The active draw target. Normally the on-screen canvas' context; briefly
  // repointed at an offscreen buffer while rendering the transparent hand-down
  // sprite (renderPieceToBuffer), then restored — so the piece-draw methods,
  // which all draw to `this.ctx`, re-render the finished piece onto a clean,
  // background-free surface.
  private ctx: CanvasRenderingContext2D;
  private readonly callbacks: FoldStageCallbacks;

  private verb: Verb = 'fold';
  private componentId: ComponentId = 'hull';
  private hullShape: HullShape = 'sheet';
  private assembled = 0;
  private paper: Rect = { x: 176, y: 92, w: 288, h: 190 };
  private crease?: HullCrease;
  private textLines: string[] = [];
  private hoist = 0;
  // The rendered sail hoist trails `hoist` by exponential smoothing (feel only).
  private renderedHoist = 0;
  // Continuous wobble phase (accumulated at the wind-modulated rate) so changing
  // the sway frequency never jumps the sail — only its rate of sway changes.
  private wobblePhase = 0;
  private roll = 0;
  private kindle = 0;
  private kindleHeld = false;
  // How many plucked-note thresholds the roll has crossed (drives sparkles).
  private rollNoteShown = 0;
  // Live plucked-note sparkles at the tube (start timestamps).
  private rollSparkles: number[] = [];

  // Live fold gesture.
  private foldPlan?: FoldPlan;
  private foldProgress = 0;
  private foldGrabbed = false;
  private settle?: { target: number; onDone: () => void };

  private rafId?: number;
  private time = 0;
  private lastFrameTs?: number;
  private lastDtMs = 1000 / 60;
  private disposed = false;

  // The completion → tray hand-down: the just-finished full-size component
  // shrinking/moving into its tray anchor. While active the normal in-progress
  // stage stops drawing (no doubling) and the tray piece it lands as stays hidden
  // until the animation arrives.
  private handDown?: HandDown;
  // The sail's fold → hoist bridge (see SailIntro). While active the hoist stage
  // stops drawing and input is locked, so the folded triangle flies to the mast
  // and the sail arrives instead of snapping in.
  private sailIntro?: SailIntro;
  // Once a component's hand-down has LANDED in the tray, the big in-progress stage
  // must not redraw the finished piece behind/over the tray — otherwise the last
  // component (the lantern, plus its kindle glow) lingers full-size after it has
  // dropped in. Set true when a hand-down lands; cleared when the next component
  // is set. Suppresses the big verb-stage draw for the gap until then (and, for
  // the final piece, right through the sail-away).
  private componentSettledToTray = false;
  // Timestamp the finished boat began its float-down onto the water (undefined =
  // rest at BOAT_REST_Y, no descent in flight).
  private boatDropStart?: number;

  private pointerDown = false;
  private hoistGrabOffset = 0;
  private pointerLast?: Point;
  // Roll only starts when the pointerdown landed on the lantern page (with a
  // forgiveness margin); a sideways sweep begun over empty background is ignored.
  private rollGrabbed = false;

  private readonly images: Partial<Record<string, HTMLImageElement>> = {};

  constructor(
    private readonly canvas: HTMLCanvasElement,
    callbacks: FoldStageCallbacks,
  ) {
    canvas.width = LOGICAL_WIDTH * RENDER_SCALE;
    canvas.height = LOGICAL_HEIGHT * RENDER_SCALE;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to get a 2D context for the fold stage.');
    }
    this.ctx = context;
    this.callbacks = callbacks;

    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);

    void this.loadPieces();
    this.startLoop();
  }

  // --- setup pushed by the activity ----------------------------------------

  /** Lays a fresh letter/sheet out for the given component + verb. */
  setComponent(componentId: ComponentId, verb: Verb, assembled: number, textLines: string[]): void {
    this.verb = verb;
    this.componentId = componentId;
    this.hullShape = 'sheet';
    this.assembled = assembled;
    this.textLines = textLines;
    // The sail's sheet is PORTRAIT (tall) so its single diagonal fold lands an
    // upright right triangle — a vertical LEFT (luff/mast) edge, apex at the top —
    // the flat sail that then billows on the mast. The hull/lantern sheets stay
    // landscape. (paper-friendtwo.png is 512×640 portrait, so it maps here truer too.)
    this.paper =
      componentId === 'sail'
        ? { x: 220, y: 57, w: 200, h: 260 }
        : { x: 176, y: 92, w: 288, h: 190 };
    this.hoist = 0;
    this.renderedHoist = 0;
    this.roll = 0;
    this.kindle = 0;
    this.kindleHeld = false;
    this.rollNoteShown = 0;
    this.rollSparkles = [];
    this.crease = undefined;
    this.foldPlan = undefined;
    this.foldProgress = 0;
    this.foldGrabbed = false;
    this.settle = undefined;
    // A fresh component supersedes any in-flight hand-down; the caller has
    // already advanced the tray count (passed in `assembled`), so just drop it.
    this.handDown = undefined;
    this.sailIntro = undefined;
    // The new component's big stage draws again (the previous one has settled).
    this.componentSettledToTray = false;
  }

  setVerb(verb: Verb): void {
    this.verb = verb;
  }

  /** The hull's current intermediate origami silhouette. */
  setHullShape(shape: HullShape): void {
    this.hullShape = shape;
  }

  setCrease(crease: HullCrease | undefined): void {
    this.crease = crease;
  }

  setAssembled(count: number): void {
    const wasComplete = this.assembled >= BOAT_PIECE_COUNT;
    this.assembled = count;
    // The moment the boat is whole, animate it floating down onto the water.
    if (count >= BOAT_PIECE_COUNT && !wasComplete) {
      this.boatDropStart = performance.now();
    }
  }

  setHoist(progress: number, _catching: boolean): void {
    // The wind-catch sway is now derived from the (smoothed) rendered hoist inside
    // drawHoistStage, so the boolean the activity computes for the catch SFX is no
    // longer needed here — kept in the signature for that call site.
    this.hoist = progress;
  }

  setRoll(progress: number): void {
    this.roll = progress;
  }

  setKindle(progress: number): void {
    this.kindle = progress;
  }

  /**
   * Ends the current fold gesture with a short ease: `commit` folds the flap the
   * rest of the way home, otherwise it falls back open. `onDone` fires once the
   * ease lands (the activity commits / resets the model there).
   */
  settleFold(commit: boolean, onDone: () => void): void {
    this.foldGrabbed = false;
    if (!this.foldPlan) {
      onDone();
      return;
    }
    this.settle = { target: commit ? 1 : 0, onDone };
  }

  /** Runs a whole fold as an animation (keyboard assist / deterministic driving):
   * builds the plan for the current shape and eases it fully home. */
  playAutoFold(onDone: () => void): void {
    const plan = this.buildFoldPlan();
    if (!plan) {
      onDone();
      return;
    }
    this.foldPlan = plan;
    this.foldProgress = 0;
    this.foldGrabbed = false;
    this.settle = { target: 1, onDone };
  }

  /**
   * Hands the just-finished component DOWN into the boat tray: the full-size
   * completed view is captured next frame, then shrinks/moves from its stage
   * bounds to its TRAY_ANCHORS rect over `durationMs`, revealing the tray piece
   * only when it lands (no doubling, no stale silhouette). The caller must first
   * push the COMPLETED silhouette state (hull → 'boat', sail hoist 1, lantern
   * roll/kindle 1) so the captured frame shows the finished piece.
   *
   * `target` is the tray-piece count it lands as. For the final piece the whole
   * boat's settle-onto-water begins now so the pieces already in the tray drift
   * down together while this one flies into its (moving) anchor.
   */
  playHandDown(key: 'hull' | 'sail' | 'lantern', target: number, durationMs: number): void {
    if (target >= BOAT_PIECE_COUNT && this.boatDropStart === undefined) {
      this.boatDropStart = performance.now();
    }
    this.handDown = {
      phase: 'capture',
      start: performance.now(),
      durationMs: Math.max(1, durationMs),
      key,
      src: this.handDownSourceBounds(key),
      target,
    };
  }

  /**
   * Bridges the sail's diagonal FOLD into the HOIST: the just-committed folded
   * paper triangle is captured as a clean alpha sprite and flown/rotated/scaled
   * from where the fold finished to the sail's hoist-start seat at the mast foot,
   * over `durationMs`. While it runs the hoist stage doesn't draw and input is
   * locked; `onDone` fires when the sail has arrived so the activity can resume.
   * The caller pushes the hoist verb (hoist = 0) first, so drawHoistStage picks up
   * exactly where the triangle lands.
   */
  playSailHoistIntro(durationMs: number, onDone: () => void): void {
    const srcPoly = this.sailFoldedPoly();
    const b = boundsRect(srcPoly);
    const pad = 12; // room for the paper's soft shadow so it flies clean-edged
    this.sailIntro = {
      phase: 'capture',
      start: performance.now(),
      durationMs: Math.max(1, durationMs),
      srcPoly,
      src: { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 },
      dst: this.sailHoistStartBounds(),
      onDone,
    };
  }

  /** The folded sail triangle silhouette — the base half the diagonal reflect fold
   * lands on (identical to reflectPlan(diagonal).base for `this.paper`). */
  private sailFoldedPoly(): Point[] {
    const b = this.paper;
    const a = { x: b.x, y: b.y }; // top-left (apex / crease end)
    const bb = { x: b.x + b.w, y: b.y + b.h }; // bottom-right (crease end)
    const f0 = { x: b.x + b.w, y: b.y }; // the folding corner (top-right)
    return clipToHalfPlane(rectPoints(b), a, bb, -sideOf(f0, a, bb));
  }

  /** The sail's hoist-START footprint (hoist = 0): where drawHoistStage first
   * paints the sail cloth, so the flown triangle lands exactly where the sail
   * arrives. Matches the sail-art draw (drawW = 104, x0 = mastX − drawW·0.26,
   * top = headLow); the procedural fallback shares the same box. */
  private sailHoistStartBounds(): Rect {
    const mastX = LOGICAL_WIDTH / 2;
    const { headLow } = this.hoistBounds();
    const sailArt = this.images['sail-loose'] ?? this.images.sail;
    const drawW = 104;
    const drawH = sailArt ? drawW * (sailArt.height / sailArt.width) : 128;
    return { x: mastX - drawW * 0.26, y: headLow, w: drawW, h: drawH };
  }

  /** Logical-space bounds of the full-size finished component — the capture region
   * the hand-down flies from. */
  private handDownSourceBounds(key: 'hull' | 'sail' | 'lantern'): Rect {
    if (key === 'hull') {
      const b = boundsRect(this.hullPolygon('boat'));
      return { x: b.x - 8, y: b.y - 8, w: b.w + 16, h: b.h + 16 };
    }
    if (key === 'sail') {
      // Fly the SAME art the tray seats (sail.png), from a raised big size straight
      // down onto its seat — so the flight LANDS exactly on the final composite with
      // no size/aspect pop. The box is centred on the mast (x = mastX + 2, matching
      // the tray anchor's screen centre) and authored at the sail anchor's aspect
      // (w:h = TRAY_ANCHORS.sail), so fitting it into that anchor is an exact fill.
      const mastX = LOGICAL_WIDTH / 2;
      const a = TRAY_ANCHORS.sail;
      const w = 104; // ~the raised sail's drawn width, so the fly starts life-size
      const h = (w * a.h) / a.w;
      return { x: mastX + 2 - w / 2, y: 175 - h / 2, w, h };
    }
    // The rolled, kindled lantern tube with a little of its glow.
    return { x: 176, y: 88, w: 100, h: 168 };
  }

  /** Builds the flying sprite by RE-RENDERING just the finished piece onto a
   * TRANSPARENT offscreen buffer — no backdrop, no tray, no water — so the piece
   * flies with clean alpha edges over the painted backdrop instead of carrying a
   * stale background rectangle copied off the main canvas. Then switches the
   * hand-down into its flying phase. */
  private captureHandDown(hd: HandDown): void {
    hd.snapshot = this.renderPieceToBuffer(hd.key, hd.src);
    hd.phase = 'fly';
    hd.start = performance.now();
  }

  /** Renders ONLY the finished component (its silhouette + paper texture / sail
   * art / rolled lantern, with its own soft shadow but NO background fill) into a
   * transparent offscreen canvas covering `src` in logical space. The piece-draw
   * methods draw to `this.ctx`, so we briefly repoint that at the buffer's context
   * (transformed so `src`'s top-left maps to the buffer origin) and restore it. */
  private renderPieceToBuffer(
    key: 'hull' | 'sail' | 'lantern',
    src: Rect,
  ): HTMLCanvasElement | undefined {
    const s = RENDER_SCALE;
    const buf = document.createElement('canvas');
    buf.width = Math.max(1, Math.round(src.w * s));
    buf.height = Math.max(1, Math.round(src.h * s));
    const bctx = buf.getContext('2d');
    if (!bctx) {
      return undefined;
    }
    const prev = this.ctx;
    this.ctx = bctx;
    // Logical (lx,ly) → buffer px (s·(lx−src.x), s·(ly−src.y)); buffer starts fully
    // transparent, so only the piece's own pixels (+ its shadow) are ever drawn.
    bctx.setTransform(s, 0, 0, s, -src.x * s, -src.y * s);
    try {
      if (key === 'hull') {
        // At hand-down the hull is settled to 'boat' with no pending crease, so
        // this draws exactly the finished hull silhouette.
        this.drawHullStage();
      } else if (key === 'sail') {
        // Fly the SAME sail.png the tray seats (filling src, which is authored at
        // the anchor's aspect) so the landing coincides with the final composite —
        // no size/aspect pop at the swap. Fallback: the procedural hoist view.
        const sailArt = this.images.sail;
        if (sailArt) {
          bctx.drawImage(sailArt, src.x, src.y, src.w, src.h);
        } else {
          this.drawHoistStage();
        }
      } else {
        this.drawLanternStage();
      }
    } finally {
      this.ctx = prev;
    }
    return buf;
  }

  /** Draws the flying snapshot shrinking/moving from its stage bounds into the
   * tray anchor (ease-out-cubic + a small settle bob), and reveals the tray piece
   * when it lands. */
  private drawHandDown(hd: HandDown): void {
    if (!hd.snapshot) {
      // Capture failed (no context) — just reveal the piece.
      this.assembled = hd.target;
      this.handDown = undefined;
      this.componentSettledToTray = true;
      return;
    }
    const t = clamp01((performance.now() - hd.start) / hd.durationMs);
    const ease = 1 - Math.pow(1 - t, 3);
    const bob = Math.sin(t * Math.PI * 3) * (1 - t) * 5;

    const anchor = TRAY_ANCHORS[hd.key];
    const cx = LOGICAL_WIDTH / 2;
    const originY = this.boatOriginY();
    const srcCx = hd.src.x + hd.src.w / 2;
    const srcCy = hd.src.y + hd.src.h / 2;
    const dstCx = cx + anchor.x;
    const dstCy = originY + anchor.y;

    // Fit the finished silhouette into the anchor box, preserving its aspect.
    const dstScale = Math.min(anchor.w / hd.src.w, anchor.h / hd.src.h);
    const scale = 1 + (dstScale - 1) * ease;
    const w = hd.src.w * scale;
    const h = hd.src.h * scale;
    const curCx = srcCx + (dstCx - srcCx) * ease;
    const curCy = srcCy + (dstCy - srcCy) * ease + bob;

    const ctx = this.ctx;
    ctx.save();
    ctx.drawImage(hd.snapshot, curCx - w / 2, curCy - h / 2, w, h);
    ctx.restore();

    if (t >= 1) {
      // Landed exactly on the anchor: reveal the real tray piece (same place,
      // same size) and end the hand-down — the swap is seamless. The big
      // in-progress view is now suppressed until the next component is set, so
      // the finished piece (and any glow) never lingers over the tray.
      this.assembled = hd.target;
      this.handDown = undefined;
      this.componentSettledToTray = true;
    }
  }

  /** Captures the folded triangle to a clean transparent buffer, then flips the
   * sail intro into its flying phase (same technique as captureHandDown). */
  private captureSailIntro(intro: SailIntro): void {
    intro.snapshot = this.renderSailFoldToBuffer(intro.srcPoly, intro.src);
    intro.phase = 'fly';
    intro.start = performance.now();
  }

  /** Renders ONLY the folded sail triangle (paper + ____'s letter face, clipped
   * to the folded silhouette — the same fill the committed fold lands on) into a
   * transparent offscreen buffer covering `src`, so it flies with clean alpha
   * edges over the painted backdrop. */
  private renderSailFoldToBuffer(poly: Point[], src: Rect): HTMLCanvasElement | undefined {
    const s = RENDER_SCALE;
    const buf = document.createElement('canvas');
    buf.width = Math.max(1, Math.round(src.w * s));
    buf.height = Math.max(1, Math.round(src.h * s));
    const bctx = buf.getContext('2d');
    if (!bctx) {
      return undefined;
    }
    const prev = this.ctx;
    this.ctx = bctx;
    bctx.setTransform(s, 0, 0, s, -src.x * s, -src.y * s);
    try {
      this.fillPaperPoly(poly, this.paper, this.textLines, 14, 1);
    } finally {
      this.ctx = prev;
    }
    return buf;
  }

  /** Flies the folded triangle from where the fold finished to the sail's hoist
   * seat at the mast (ease-out-cubic + a small settle bob + a gentle unrotate into
   * upright), then hands off to the hoist stage. */
  private drawSailIntro(intro: SailIntro): void {
    if (!intro.snapshot) {
      this.finishSailIntro(intro);
      return;
    }
    const t = clamp01((performance.now() - intro.start) / intro.durationMs);
    const ease = 1 - Math.pow(1 - t, 3);
    const bob = Math.sin(t * Math.PI * 3) * (1 - t) * 4;
    const { src, dst } = intro;
    const srcCx = src.x + src.w / 2;
    const srcCy = src.y + src.h / 2;
    const dstScale = Math.min(dst.w / src.w, dst.h / src.h);
    const scale = 1 + (dstScale - 1) * ease;
    const w = src.w * scale;
    const h = src.h * scale;
    const dstCx = dst.x + dst.w / 2;
    const dstCy = dst.y + dst.h / 2;
    const curCx = srcCx + (dstCx - srcCx) * ease;
    const curCy = srcCy + (dstCy - srcCy) * ease + bob;
    const rot = (1 - ease) * 0.06; // the folded triangle is already upright — only a
    // whisper of settle, so it glides to the mast rather than rotating into place

    // Arrival cross-fade: in the tail the flat flying triangle dissolves into the
    // billowed sail on the mast, the belly swelling from flat — the fold catches
    // wind and billows instead of the sail popping in at the handoff.
    const arrive = clamp01((t - SAIL_ARRIVE_START) / (1 - SAIL_ARRIVE_START));
    const billow = arrive * arrive * (3 - 2 * arrive); // smoothstep

    const ctx = this.ctx;
    if (arrive > 0) {
      const buf = this.renderHoistToBuffer(billow);
      if (buf) {
        ctx.save();
        ctx.globalAlpha = billow;
        ctx.drawImage(buf, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalAlpha = 1 - arrive; // the flat triangle fades as the sail fills in
    ctx.translate(curCx, curCy);
    ctx.rotate(rot);
    ctx.drawImage(intro.snapshot, -w / 2, -h / 2, w, h);
    ctx.restore();

    if (t >= 1) {
      this.finishSailIntro(intro);
    }
  }

  /** Renders the mast + hoisted sail (at the current hoist) onto a transparent
   * full-canvas buffer, with `billowScale` swelling the sail's belly — so the sail
   * intro can cross-fade the billowed sail in over the flying flat triangle without
   * per-slice alpha seams. */
  private renderHoistToBuffer(billowScale: number): HTMLCanvasElement | undefined {
    const s = RENDER_SCALE;
    const buf = document.createElement('canvas');
    buf.width = LOGICAL_WIDTH * s;
    buf.height = LOGICAL_HEIGHT * s;
    const bctx = buf.getContext('2d');
    if (!bctx) {
      return undefined;
    }
    const prev = this.ctx;
    this.ctx = bctx;
    bctx.setTransform(s, 0, 0, s, 0, 0);
    try {
      this.drawHoistComposite(billowScale, false);
    } finally {
      this.ctx = prev;
    }
    return buf;
  }

  private finishSailIntro(intro: SailIntro): void {
    this.sailIntro = undefined;
    intro.onDone?.();
  }

  /** URLs of the piece art that actually loaded (file-first), so the sail-away
   * cinematic can composite the SAME pieces as <img> instead of CSS shapes. */
  getLoadedPieceUrls(): Partial<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const key of Object.keys(PIECE_FILES)) {
      if (this.images[key]) {
        out[key] = PIECE_FILES[key];
      }
    }
    return out;
  }

  dispose(): void {
    this.disposed = true;
    if (this.rafId !== undefined) {
      cancelAnimationFrame(this.rafId);
    }
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
  }

  private async loadPieces(): Promise<void> {
    await Promise.all(
      Object.entries({ ...PIECE_FILES, ...PIECE_PAPER_FILES, ...HOIST_ART_FILES, backdrop: BACKDROP_URL }).map(async ([key, url]) => {
        if (!(await isImageUrl(url))) {
          return;
        }
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            this.images[key] = img;
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        });
      }),
    );
  }

  // --- input routing -------------------------------------------------------

  private toCanvas(event: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * LOGICAL_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * LOGICAL_HEIGHT,
    };
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (this.settle || this.sailIntro) {
      return; // let the previous fold finish settling / the sail fly to the mast
    }
    const point = this.toCanvas(event);
    this.pointerDown = true;
    this.pointerLast = point;
    // Capture the pointer so a drag that strays past the canvas edge keeps
    // feeding the gesture (the panel can render taller than the viewport).
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* not all environments support capture; harmless */
    }

    if (this.verb === 'fold') {
      // A fold only starts when the finger actually lands ON the paper (the
      // current silhouette, plus a modest forgiveness margin) — clicking empty
      // background does nothing. The 'open' fold keeps its grab-anywhere-ON-the-
      // paper feel because the test is the whole silhouette, not an edge.
      if (!this.pointerOnFoldPaper(point)) {
        return;
      }
      const plan = this.buildFoldPlan();
      if (plan) {
        plan.active = this.pickActiveFlap(plan, point);
        // The open-out morph measures the pull from where the finger grabbed.
        plan.grab = point;
        this.foldPlan = plan;
        this.foldGrabbed = true;
        const t = this.progressFromPointer(plan, point);
        this.foldProgress = t;
        this.callbacks.onFoldProgress(t);
      }
    } else if (this.verb === 'hoist') {
      // Grab the sail wherever the pointer lands without a jump: remember the
      // offset between the pointer's implied hoist and the sail's real hoist.
      this.hoistGrabOffset = this.hoist - this.hoistFromPointer(point);
    } else if (this.verb === 'roll') {
      // Only begin a roll when the sweep starts on the page (with margin).
      this.rollGrabbed = this.pointerOnLanternPage(point);
    } else if (this.verb === 'kindle') {
      // Kindle only ignites when the press lands on the rolled page.
      if (!this.pointerOnLanternPage(point)) {
        return;
      }
      this.kindleHeld = true;
      this.callbacks.onKindleChange(true);
    }
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointerDown) {
      return;
    }
    const now = this.toCanvas(event);
    const last = this.pointerLast ?? now;

    if (this.verb === 'fold' && this.foldGrabbed && this.foldPlan) {
      const t = this.progressFromPointer(this.foldPlan, now);
      this.foldProgress = t;
      this.callbacks.onFoldProgress(t);
    } else if (this.verb === 'hoist') {
      const progress = clamp01(this.hoistFromPointer(now) + this.hoistGrabOffset);
      this.callbacks.onHoistProgress(progress);
    } else if (this.verb === 'roll' && this.rollGrabbed) {
      // Rolling is PRIMARILY a sideways sweep: horizontal drag rolls the tube like
      // a scroll pulled along a table. |dx| over ROLL_SWIPE_SPAN is the fraction of
      // the whole roll swept, converted to the model's radian metric. A circular
      // drag still contributes; take whichever swept MORE this move (both are
      // direction-agnostic magnitudes), so either gesture feels natural and they
      // never double-count.
      const linear = (Math.abs(now.x - last.x) / ROLL_SWIPE_SPAN) * ROLL_TARGET;
      const centre = this.rollCentre();
      const angular = Math.abs(signedAngle(last, now, centre));
      const swept = Math.max(linear, Number.isFinite(angular) ? angular : 0);
      if (swept > 0) {
        this.callbacks.onRoll(swept);
      }
    }
    this.pointerLast = now;
  };

  private handlePointerUp = (): void => {
    if (this.verb === 'fold' && this.foldGrabbed) {
      this.foldGrabbed = false;
      this.callbacks.onFoldRelease();
    }
    if (this.verb === 'kindle' && this.kindleHeld) {
      this.kindleHeld = false;
      this.callbacks.onKindleChange(false);
    }
    this.pointerDown = false;
    this.pointerLast = undefined;
    this.rollGrabbed = false;
  };

  /** True when `p` lands on the paper being FOLDED right now (the current
   * silhouette — the hull shape for hull folds, the sail sheet for the sail
   * fold), or within PICK_MARGIN of its edge. Gates fold pickup so empty
   * background never folds the paper. */
  private pointerOnFoldPaper(p: Point): boolean {
    const poly =
      this.componentId === 'hull' ? this.hullPolygon(this.hullShape) : rectPoints(this.paper);
    return pointNearPolygon(p, poly, PICK_MARGIN);
  }

  /** True when `p` lands on the lantern sheet (roll/kindle) or within PICK_MARGIN
   * of its edge. Gates roll/kindle pickup to the page. */
  private pointerOnLanternPage(p: Point): boolean {
    const c = this.rollCentre();
    const rect: Rect = {
      x: c.x - LANTERN_PAGE_W / 2,
      y: c.y - LANTERN_PAGE_H / 2,
      w: LANTERN_PAGE_W,
      h: LANTERN_PAGE_H,
    };
    return pointNearPolygon(p, rectPoints(rect), PICK_MARGIN);
  }

  private rollCentre(): Point {
    return { x: LOGICAL_WIDTH / 2, y: 170 };
  }

  // --- hoist pointer math (the sail is pinned to the pointer height) --------
  //
  // Everything the hoist touches lives in the upper/central band of the logical
  // stage so it stays within the visible, clickable canvas even when the panel
  // renders taller than the viewport. The sail HEAD rides between headLow (down)
  // and headHigh (near the masthead), and the pointer is pinned to it.

  private hoistBounds(): {
    mastTop: number;
    mastBottom: number;
    headLow: number;
    headHigh: number;
    travel: number;
  } {
    // A short, proportionate mast: its top sits just above the sail's fully-raised
    // head (headHigh) so a full hoist reads as reaching the masthead, and it runs
    // down only a little past the raised sail's foot — not the tall bare pole it
    // was (48 → 300). headLow/headHigh set the sail head's travel accordingly.
    const mastTop = 104;
    const mastBottom = 288;
    const headLow = 232;
    const headHigh = 120;
    return { mastTop, mastBottom, headLow, headHigh, travel: headLow - headHigh };
  }

  private hoistFromPointer(p: Point): number {
    const { headLow, travel } = this.hoistBounds();
    return (headLow - p.y) / travel;
  }

  // --- fold geometry (built once per gesture) ------------------------------

  private hullPolygon(shape: HullShape): Point[] {
    return HULL_SHAPE_POLYS[shape].map(([nx, ny]) => ({
      x: HULL_CX + nx * HULL_H,
      y: HULL_CY + ny * HULL_H,
    }));
  }

  /** Builds the plan for the fold pending on the current component/shape. */
  private buildFoldPlan(): FoldPlan | undefined {
    if (this.componentId === 'hull') {
      const crease = this.crease;
      if (!crease) {
        return undefined;
      }
      const frame = boundsRect(this.hullPolygon('sheet'));
      const lines = this.textLines;
      if (crease.kind === 'reflect') {
        return this.reflectPlan(this.hullPolygon('sheet'), frame, lines, 15);
      }
      if (crease.kind === 'corners') {
        return this.cornersPlan(this.hullPolygon('book'), frame, lines, 15);
      }
      // open: morph peak → boat.
      return {
        kind: 'open',
        fromPoly: this.hullPolygon('peak'),
        toPoly: this.hullPolygon('boat'),
        active: 0,
        grab: { x: HULL_CX, y: HULL_CY },
        frame,
        lines,
        fontPx: 15,
      };
    }
    // Sail: a single diagonal corner-to-corner fold on the plain sheet.
    return this.reflectPlan(rectPoints(this.paper), this.paper, this.textLines, 14, true);
  }

  /** A single-flap reflect fold: the top half (or a diagonal triangle) folds
   * across the centre crease onto the stationary base. */
  private reflectPlan(
    poly: Point[],
    frame: Rect,
    lines: string[],
    fontPx: number,
    diagonal = false,
  ): FoldPlan {
    const b = boundsRect(poly);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    let a: Point;
    let bb: Point;
    let f0: Point;
    if (diagonal) {
      // Crease from top-LEFT to bottom-RIGHT (the sail's hypotenuse); the top-right
      // corner folds over onto the tall base, leaving an upright right triangle: a
      // vertical LEFT (luff/mast) edge, the right angle at bottom-left, apex at top.
      a = { x: b.x, y: b.y };
      bb = { x: b.x + b.w, y: b.y + b.h };
      f0 = { x: b.x + b.w, y: b.y }; // the folding corner (top-right)
    } else {
      // Horizontal crease through the middle; the top half folds down.
      a = { x: b.x, y: cy };
      bb = { x: b.x + b.w, y: cy };
      f0 = { x: cx, y: b.y }; // midpoint of the free top edge
    }
    const flapPoly = clipToHalfPlane(poly, a, bb, sideOf(f0, a, bb));
    const basePoly = clipToHalfPlane(poly, a, bb, -sideOf(f0, a, bb));
    const f1 = reflectPoint(f0, a, bb);
    return {
      kind: 'reflect',
      base: basePoly,
      flaps: [{ a, b: bb, poly: flapPoly, f0, f1 }],
      active: 0,
      grab: f0,
      frame,
      lines,
      fontPx,
    };
  }

  /** The two-corner fold: both top corners of the book fold in to the centre in
   * one symmetric drag, leaving the peak. */
  private cornersPlan(poly: Point[], frame: Rect, lines: string[], fontPx: number): FoldPlan {
    const b = boundsRect(poly);
    const cx = b.x + b.w / 2;
    const halfW = b.w / 2;
    const apex = { x: cx, y: b.y };
    const leftEnd = { x: b.x, y: b.y + halfW };
    const rightEnd = { x: b.x + b.w, y: b.y + halfW };
    const tl = { x: b.x, y: b.y };
    const tr = { x: b.x + b.w, y: b.y };

    const leftFlap = clipToHalfPlane(poly, apex, leftEnd, sideOf(tl, apex, leftEnd));
    const rightFlap = clipToHalfPlane(poly, apex, rightEnd, sideOf(tr, apex, rightEnd));
    // Base = book with BOTH top corners removed = the peak.
    let base = clipToHalfPlane(poly, apex, leftEnd, -sideOf(tl, apex, leftEnd));
    base = clipToHalfPlane(base, apex, rightEnd, -sideOf(tr, apex, rightEnd));

    return {
      kind: 'corners',
      base,
      flaps: [
        { a: apex, b: leftEnd, poly: leftFlap, f0: tl, f1: reflectPoint(tl, apex, leftEnd) },
        { a: apex, b: rightEnd, poly: rightFlap, f0: tr, f1: reflectPoint(tr, apex, rightEnd) },
      ],
      active: 0,
      grab: apex,
      frame,
      lines,
      fontPx,
    };
  }

  private pickActiveFlap(plan: FoldPlan, p: Point): number {
    if (!plan.flaps || plan.flaps.length < 2) {
      return 0;
    }
    const d0 = dist2(p, plan.flaps[0].f0);
    const d1 = dist2(p, plan.flaps[1].f0);
    return d1 < d0 ? 1 : 0;
  }

  /** Maps the pointer to 0..1 fold progress. For reflect/corners the pointer is
   * projected onto the active flap's free-edge travel F0→F1 (so the flap edge
   * tracks the finger); for the open morph it's the pull distance from the grab. */
  private progressFromPointer(plan: FoldPlan, p: Point): number {
    if (plan.kind === 'open') {
      return clamp01(Math.hypot(p.x - plan.grab.x, p.y - plan.grab.y) / PULL_SPAN);
    }
    const flap = plan.flaps?.[plan.active];
    if (!flap) {
      return 0;
    }
    const vx = flap.f1.x - flap.f0.x;
    const vy = flap.f1.y - flap.f0.y;
    const len2 = vx * vx + vy * vy || 1;
    return clamp01(((p.x - flap.f0.x) * vx + (p.y - flap.f0.y) * vy) / len2);
  }

  // --- render loop ---------------------------------------------------------

  private startLoop(): void {
    const loop = (ts: number): void => {
      if (this.disposed) {
        return;
      }
      // Delta-time clock: clamp the step so a stalled/backgrounded tab doesn't
      // fling the animations forward, and so wobble/hint speed is the same at
      // 60/120/144Hz.
      const dtMs = this.lastFrameTs === undefined ? 1000 / 60 : Math.min(64, ts - this.lastFrameTs);
      this.lastFrameTs = ts;
      this.lastDtMs = dtMs;
      this.time += dtMs * TIME_RATE;
      // The rendered sail trails the raw target by a per-frame lerp (feel only).
      this.renderedHoist += (this.hoist - this.renderedHoist) * HOIST_SMOOTH_K;
      this.stepSettle();
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stepSettle(): void {
    if (!this.settle) {
      return;
    }
    const { target } = this.settle;
    const diff = target - this.foldProgress;
    if (Math.abs(diff) <= SETTLE_RATE) {
      this.foldProgress = target;
      const onDone = this.settle.onDone;
      this.settle = undefined;
      this.foldPlan = undefined;
      this.foldProgress = 0;
      onDone();
      return;
    }
    this.foldProgress += Math.sign(diff) * SETTLE_RATE;
  }

  private render(): void {
    const ctx = this.ctx;
    // Base transform: everything below draws in logical 640x400 coords, scaled up
    // into the larger backing store. All inner transforms are relative (balanced
    // save/restore), so this base scale holds for the whole frame.
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // File-first painted backdrop: when backdrop.png loaded, draw it covering the
    // whole canvas UNDER everything (its waterline is authored at logical y=352 =
    // WATERLINE_Y, so the tray boat sits on the painted water). The flat gradient
    // below is the fallback when the file is absent.
    const backdrop = this.images.backdrop;
    if (backdrop) {
      ctx.drawImage(backdrop, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    } else {
      const table = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
      table.addColorStop(0, '#241d2b');
      table.addColorStop(1, '#140e18');
      ctx.fillStyle = table;
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    }

    this.drawBoatTray();

    // While the hand-down is flying, the tray already drew the pieces landed so
    // far; draw ONLY the flying snapshot in place of the (finished) in-progress
    // stage, so the big view and the tray piece never render at once.
    if (this.handDown?.phase === 'fly') {
      this.drawHandDown(this.handDown);
      return;
    }

    // The just-finished component has dropped into the tray: the tray piece (drawn
    // above) is now the only view of it. Skip the big in-progress stage so the
    // finished silhouette + kindle glow don't redraw over the tray in the gap
    // before the next component (or, for the final piece, through the sail-away).
    if (this.componentSettledToTray) {
      return;
    }

    // The sail's fold → hoist bridge: fly the folded triangle to the mast instead
    // of drawing the hoist stage (which would hard-swap the sail in). Capture and
    // fly in the same frame — the buffer is rendered independently, so there's no
    // one-frame blank.
    if (this.sailIntro) {
      if (this.sailIntro.phase === 'capture') {
        this.captureSailIntro(this.sailIntro);
      }
      this.drawSailIntro(this.sailIntro);
      return;
    }

    if (this.verb === 'fold') {
      if (this.componentId === 'hull') {
        this.drawHullStage();
      } else {
        this.drawSailFoldStage();
      }
    } else if (this.verb === 'hoist') {
      this.drawHoistStage();
    } else {
      this.drawLanternStage();
    }

    // The capture frame renders the finished full-size component (above) once,
    // then grabs it as the hand-down source and begins the fly next frame.
    if (this.handDown?.phase === 'capture') {
      this.captureHandDown(this.handDown);
    }
  }

  // FOLD (hull): the live fold when a gesture is in flight, else the resting
  // silhouette with its pending-fold hint.
  private drawHullStage(): void {
    if (this.foldPlan) {
      this.drawFoldInProgress(this.foldPlan, this.foldProgress);
      return;
    }
    const poly = this.hullPolygon(this.hullShape);
    this.fillPaperPoly(poly, boundsRect(this.hullPolygon('sheet')), this.textLines, 15, 1);
    this.drawHullCreaseMarks(this.hullShape);
    if (this.crease) {
      this.drawFoldHint();
    }
  }

  // FOLD (sail): the single triangle fold on the plain sheet.
  private drawSailFoldStage(): void {
    if (this.foldPlan) {
      this.drawFoldInProgress(this.foldPlan, this.foldProgress);
      return;
    }
    this.fillPaperPoly(rectPoints(this.paper), this.paper, this.textLines, 14, 1);
    if (this.crease) {
      this.drawSailFoldHint();
    }
  }

  /** Draws a fold mid-gesture: the stationary base plus the flap(s) folding
   * across at progress `t` (or the open-out morph). At t=1 the union is exactly
   * the resulting silhouette, so the swap to the settled shape is seamless. */
  private drawFoldInProgress(plan: FoldPlan, t: number): void {
    if (plan.kind === 'open' && plan.fromPoly && plan.toPoly) {
      const poly = lerpPoly(plan.fromPoly, plan.toPoly, t);
      this.fillPaperPoly(poly, plan.frame, plan.lines, plan.fontPx, 1);
      return;
    }
    if (plan.base) {
      this.fillPaperPoly(plan.base, plan.frame, plan.lines, plan.fontPx, 1);
    }
    for (const flap of plan.flaps ?? []) {
      this.paintFlap(flap, t, plan.frame, plan.lines, plan.fontPx);
    }
  }

  /** The drop-in paper texture for the piece currently being worked, if its file
   * loaded — else undefined, so the procedural paper + handwriting is used. */
  private paperTexture(): HTMLImageElement | undefined {
    return this.images[`paper:${this.componentId}`];
  }

  /** Fills a silhouette polygon with paper + ____'s handwriting (laid out in the
   * fixed sheet frame and clipped to the shape, so the words are continuous and
   * only ever get covered as the paper folds) + an outline. When a drop-in paper
   * texture is present it replaces the handwriting as the sheet's printed face. */
  private fillPaperPoly(
    poly: Point[],
    frame: Rect,
    lines: string[],
    fontPx: number,
    alpha: number,
  ): void {
    if (poly.length < 3) {
      return;
    }
    const ctx = this.ctx;
    const b = boundsRect(poly);

    ctx.save();
    ctx.globalAlpha = alpha;
    polygonPath(ctx, poly);
    const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    grad.addColorStop(0, PAPER_LIGHT);
    grad.addColorStop(1, PAPER_MID);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 7;
    ctx.fill();
    ctx.restore();

    ctx.save();
    polygonPath(ctx, poly);
    ctx.clip();
    const tex = this.paperTexture();
    if (tex) {
      // The texture is the flat sheet mapped to the fixed frame, clipped to the
      // current silhouette — so it halves/reflects with the paper for free.
      ctx.globalAlpha = alpha;
      ctx.drawImage(tex, frame.x, frame.y, frame.w, frame.h);
    } else {
      this.drawLetter(frame, lines, fontPx, alpha);
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    polygonPath(ctx, poly);
    ctx.strokeStyle = 'rgba(120, 84, 48, 0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  /** Draws the letter's words at fixed positions in `frame` (clip is set by the
   * caller). Anchoring to the sheet frame keeps the handwriting continuous — the
   * same words sit in the same place across every folded state. */
  private drawLetter(frame: Rect, lines: string[], fontPx: number, alpha: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = INK;
    ctx.font = `italic ${fontPx}px "Georgia", serif`;
    const wrapped = wrapLines(ctx, lines, frame.w - 26);
    wrapped.forEach((line, i) => {
      ctx.fillText(line, frame.x + 14, frame.y + 26 + i * (fontPx + 6));
    });
  }

  /** Renders one flap folding across its crease: a vertical squash of the flap
   * toward the crease (sy: 1 → -1 across t), front-face (with its words) until it
   * passes edge-on, then the paper back with a travelling sheen. Because the
   * squash is a linear reflection, the flap's free edge lands exactly where the
   * pointer projects it — the paper feels attached to the finger. */
  private paintFlap(flap: Flap, t: number, frame: Rect, lines: string[], fontPx: number): void {
    const ctx = this.ctx;
    const angle = Math.atan2(flap.b.y - flap.a.y, flap.b.x - flap.a.x);
    const sy = 1 - 2 * t;
    const back = sy < 0;

    ctx.save();
    ctx.translate(flap.a.x, flap.a.y);
    ctx.rotate(angle);
    ctx.scale(1, sy);
    ctx.rotate(-angle);
    ctx.translate(-flap.a.x, -flap.a.y);

    polygonPath(ctx, flap.poly);
    ctx.save();
    ctx.clip();
    if (back) {
      const b = boundsRect(flap.poly);
      const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
      grad.addColorStop(0, PAPER_BACK);
      grad.addColorStop(1, PAPER_MID);
      ctx.fillStyle = grad;
      ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    } else {
      const b = boundsRect(flap.poly);
      const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
      grad.addColorStop(0, PAPER_LIGHT);
      grad.addColorStop(1, PAPER_MID);
      ctx.fillStyle = grad;
      ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      // Same frame-anchored texture as fillPaperPoly, but under the flap's live
      // reflection transform — so the printed face reflects/squashes with the fold.
      const tex = this.paperTexture();
      if (tex) {
        ctx.drawImage(tex, frame.x, frame.y, frame.w, frame.h);
      } else {
        this.drawLetter(frame, lines, fontPx, 1);
      }
    }
    ctx.restore();

    // A soft highlight band that brightens as the flap turns edge-on — reads as
    // light catching folding paper.
    const sheen = (1 - Math.abs(sy)) * 0.5;
    if (sheen > 0.02) {
      ctx.save();
      polygonPath(ctx, flap.poly);
      ctx.clip();
      ctx.globalAlpha = sheen;
      ctx.fillStyle = '#fff7e4';
      const b = boundsRect(flap.poly);
      ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      ctx.restore();
    }

    polygonPath(ctx, flap.poly);
    ctx.strokeStyle = 'rgba(120, 84, 48, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  private drawHullCreaseMarks(shape: HullShape): void {
    const marks = HULL_SHAPE_CREASES[shape];
    if (marks.length === 0) {
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(120, 84, 48, 0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    for (const [a, b] of marks) {
      ctx.beginPath();
      ctx.moveTo(HULL_CX + a[0] * HULL_H, HULL_CY + a[1] * HULL_H);
      ctx.lineTo(HULL_CX + b[0] * HULL_H, HULL_CY + b[1] * HULL_H);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- pending-fold hints (rest state) -------------------------------------

  private drawFoldHint(): void {
    const plan = this.buildFoldPlan();
    if (!plan) {
      return;
    }
    if (plan.kind === 'open') {
      // Two arrows pulling the sides outward.
      this.drawPullArrows();
      return;
    }
    for (const flap of plan.flaps ?? []) {
      // The pulsing crease line, now cream-over-dark so it reads on any backdrop.
      this.strokeHintCrease(flap.a, flap.b, this.hintPulse(1));
      // A grab-and-drag arrow from the free edge toward where it folds.
      this.drawTravelArrow(flap.f0, flap.f1);
    }
  }

  private drawSailFoldHint(): void {
    const plan = this.buildFoldPlan();
    if (!plan || !plan.flaps) {
      return;
    }
    const flap = plan.flaps[0];
    this.strokeHintCrease(flap.a, flap.b, this.hintPulse(1));
    this.drawTravelArrow(flap.f0, flap.f1);
  }

  /** A gentle attention "breathe", ~0.5..1, on the shared delta-timed hint clock
   * (this.time) — so every guidance affordance pulses softly, never flashes. */
  private hintPulse(speed = 1.4): number {
    return 0.75 + 0.25 * Math.sin(this.time * speed);
  }

  /** Strokes a guidance arrow (shaft + head) so it reads on ANY backdrop: a dark
   * outline underlay beneath a light cream core, round-capped, at `alpha`. */
  private strokeHintArrow(
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    ux: number,
    uy: number,
    alpha: number,
  ): void {
    const ctx = this.ctx;
    const head = 13;
    const wing = 8;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux * head - uy * wing, ey - uy * head + ux * wing);
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux * head + uy * wing, ey - uy * head - ux * wing);
    ctx.strokeStyle = HINT_OUTLINE;
    ctx.lineWidth = 7.5;
    ctx.stroke();
    ctx.strokeStyle = HINT_CREAM;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.restore();
  }

  /** Strokes the pulsing crease guide (dashed) with the same cream-over-dark
   * treatment so it stays legible over the painted backdrop. */
  private strokeHintCrease(a: Point, b: Point, alpha: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.setLineDash([9, 9]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = HINT_OUTLINE;
    ctx.lineWidth = 6.5;
    ctx.stroke();
    ctx.strokeStyle = HINT_CREAM;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  private drawTravelArrow(f0: Point, f1: Point): void {
    const dx = f1.x - f0.x;
    const dy = f1.y - f0.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Modestly larger than before (was 34 + 6·sin), so the pull reads clearly.
    const reach = 40 + 7 * Math.sin(this.time * 1.4);
    const sx = f0.x + ux * 8;
    const sy = f0.y + uy * 8;
    const ex = f0.x + ux * reach;
    const ey = f0.y + uy * reach;
    this.strokeHintArrow(sx, sy, ex, ey, ux, uy, this.hintPulse());
  }

  private drawPullArrows(): void {
    const poly = this.hullPolygon('peak');
    const b = boundsRect(poly);
    const midY = b.y + b.h * 0.4;
    const reach = 32 + 7 * Math.sin(this.time * 1.4);
    const alpha = this.hintPulse();
    for (const dir of [-1, 1]) {
      const sx = b.x + b.w / 2 + dir * b.w * 0.3;
      const ex = sx + dir * reach;
      this.strokeHintArrow(sx, midY, ex, midY, dir, 0, alpha);
    }
  }

  /** A smooth 0..1 "catching wind" factor for a given hoist progress: 1 inside a
   * wobble window, ramping to 0 across a WIND_RAMP margin on either side — so the
   * sail's sway swells and eases across the boundary instead of snapping. */
  private windCatchFactor(progress: number): number {
    let best = 0;
    for (const [lo, hi] of SAIL_WOBBLE_WINDOWS) {
      let f: number;
      if (progress < lo) {
        f = smoothstep((progress - (lo - WIND_RAMP)) / WIND_RAMP);
      } else if (progress > hi) {
        f = smoothstep(((hi + WIND_RAMP) - progress) / WIND_RAMP);
      } else {
        f = 1;
      }
      best = Math.max(best, f);
    }
    return best;
  }

  // HOIST: a mast with the sail triangle pinned to the pointer height as it rides.
  private drawHoistStage(): void {
    this.drawHoistComposite(1, true);
  }

  /**
   * Draws the mast + hoisted sail at the current hoist. `billowScale` multiplies the
   * sail's belly (1 = full billow; 0 = as flat as the cloth reads), used by the sail
   * intro's arrival cross-fade to swell the sail from flat. `showHandle` draws the
   * grab dot (skipped while the arrival is still dissolving in).
   */
  private drawHoistComposite(billowScale: number, showHandle: boolean): void {
    const ctx = this.ctx;
    const mastX = LOGICAL_WIDTH / 2;
    const { mastTop, mastBottom, headLow, travel } = this.hoistBounds();

    // A short mast running mastTop..mastBottom. If mast.png is present it is the
    // painted pole (authored tall/thin, e.g. 64×512), scaled to the mast height
    // and centred on the mast line; otherwise a warm-wood/bamboo bar. Its top sits
    // just above the fully-raised sail head so a full hoist reads as reaching the
    // masthead.
    const mastArt = this.images.mast;
    if (mastArt) {
      const mastH = mastBottom - mastTop;
      const drawW = mastH * (mastArt.width / mastArt.height);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.drawImage(mastArt, mastX - drawW / 2, mastTop, drawW, mastH);
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = '#bd914f';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mastX, mastTop);
      ctx.lineTo(mastX, mastBottom);
      ctx.stroke();
      ctx.restore();
    }

    const hoist = this.renderedHoist;
    // Wind swells smoothly across the wobble-window boundaries: amplitude 2.5→10,
    // frequency 2×→6×. The phase is accumulated at the wind-modulated rate so the
    // sway never jumps when the frequency changes.
    const wind = this.windCatchFactor(hoist);
    const amp = 2.5 + 7.5 * wind;
    const freq = 2 + 4 * wind;
    this.wobblePhase += this.lastDtMs * TIME_RATE * freq;
    const wobble = Math.sin(this.wobblePhase) * amp;
    const topY = headLow - hoist * travel;
    const sailH = 128;
    const foot = topY + sailH;

    // The hoisted fabric: sail-loose.png (the sail alone, no pole) when present,
    // else sail.png (current behaviour), else the procedural quad below.
    const sailArt = this.images['sail-loose'] ?? this.images.sail;
    if (sailArt) {
      // The painted sail rides UP the mast, warped by a gentle billow:
      // horizontal rows bow out toward the sail's belly and wave with the same
      // wind-catch wobble, so it reads as cloth catching air rather than a flat
      // decal. The head (apex) and foot stay pinned; only the middle bellies.
      const drawW = 104;
      const drawH = drawW * (sailArt.height / sailArt.width);
      const x0 = mastX - drawW * 0.26; // the painted luff/pole aligns to the mast
      const rows = 18;
      const rh = drawH / rows;
      const srh = sailArt.height / rows;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      for (let i = 0; i < rows; i += 1) {
        const v = i / (rows - 1); // 0 top → 1 bottom
        const belly = Math.sin(v * Math.PI); // 0 at ends, 1 mid — the sail's belly
        const off =
          (Math.sin(this.wobblePhase + v * 2.2) * amp + wobble * 0.2) * belly * billowScale;
        // +0.6 overlap hides seams between rows from sub-pixel rounding.
        ctx.drawImage(
          sailArt,
          0,
          i * srh,
          sailArt.width,
          srh,
          x0 + off,
          topY + i * rh,
          drawW,
          rh + 0.6,
        );
      }
      ctx.restore();
    } else {
      // Fallback (no sail.png): the procedural quad sail with the paper-friendtwo
      // texture, or the fluttering letter text.
      ctx.save();
      ctx.translate(mastX + 2, 0);
      ctx.beginPath();
      ctx.moveTo(0, topY);
      ctx.quadraticCurveTo(70 + wobble, topY + sailH * 0.4, 40 + wobble * 0.6, foot);
      ctx.lineTo(0, foot);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, topY, 60, foot);
      grad.addColorStop(0, PAPER_LIGHT);
      grad.addColorStop(1, PAPER_MID);
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(mastX + 2, topY);
      ctx.quadraticCurveTo(mastX + 72 + wobble, topY + sailH * 0.4, mastX + 42 + wobble * 0.6, foot);
      ctx.lineTo(mastX + 2, foot);
      ctx.closePath();
      ctx.clip();
      const sailTex = this.paperTexture();
      if (sailTex) {
        ctx.drawImage(sailTex, mastX + 2, topY, 74, sailH);
      } else {
        ctx.fillStyle = INK;
        ctx.font = '13px "Georgia", serif';
        const flutterAmp = 1.5 + 2.5 * wind;
        this.textLines.forEach((line, i) => {
          const ly = topY + 34 + i * 26;
          const flutter = Math.sin(this.time * 3 + i) * flutterAmp;
          ctx.fillText(line, mastX + 12, ly + flutter);
        });
      }
      ctx.restore();
    }

    // A grab handle at the sail's head while it's below the top, so it reads as a
    // thing to pull up.
    if (showHandle && hoist < 0.985) {
      ctx.save();
      ctx.globalAlpha = this.hintPulse();
      ctx.beginPath();
      ctx.arc(mastX + 2, topY, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = HINT_CREAM;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = HINT_OUTLINE;
      ctx.stroke();
      ctx.restore();
    }
  }

  // ROLL/KINDLE: the sheet music curls from its leading edge into a cylinder,
  // then glows through.
  private drawLanternStage(): void {
    const ctx = this.ctx;
    const centre = this.rollCentre();
    const cx = centre.x;
    const cy = centre.y;
    const roll = this.roll;
    const pageW = LANTERN_PAGE_W;
    const pageH = LANTERN_PAGE_H;
    const tubeR = 30; // radius of the fully rolled cylinder

    // The swept angle the model accumulated (up to ROLL_TARGET): the tube's
    // surface rotates by this, so a sideways drag reads as the tube rolling along
    // under the finger. rollProgress = angle / ROLL_TARGET, so angle = roll × ROLL_TARGET.
    const sweptAngle = roll * ROLL_TARGET;

    // A brief sparkle at each of the plucked-note crossings, derived from the roll
    // exactly as the activity fires the plucks — kept in sync with no extra wiring.
    const notesReached = Math.min(ROLL_NOTE_COUNT, Math.floor(roll * ROLL_NOTE_COUNT));
    if (notesReached > this.rollNoteShown) {
      for (let n = this.rollNoteShown; n < notesReached; n += 1) {
        this.rollSparkles.push(performance.now());
      }
      this.rollNoteShown = notesReached;
    }

    // The flat part shrinks from the RIGHT as the roll accumulates on the left.
    const rolled = roll; // 0..1
    const flatW = (pageW - tubeR * 2) * (1 - rolled);
    const leftX = -pageW / 2;
    const tubeCx = leftX + tubeR; // the rolled cylinder sits at the left edge
    const flatLeft = tubeCx; // flat sheet begins at the cylinder's right
    const flatRight = flatLeft + flatW;

    ctx.save();
    ctx.translate(cx, cy);

    // The remaining flat page.
    if (flatW > 1) {
      const grad = ctx.createLinearGradient(flatLeft, 0, flatRight, 0);
      grad.addColorStop(0, PAPER_MID);
      grad.addColorStop(0.5, PAPER_LIGHT);
      grad.addColorStop(1, PAPER_LIGHT);
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 16;
      ctx.fillRect(flatLeft, -pageH / 2, flatW, pageH);

      // Printed face on the flat part: the drop-in sheet-music texture (mapped to
      // the whole unrolled page, clipped to the shrinking flat rect so it is
      // visibly consumed into the roll) or the procedural staff + notes + words.
      ctx.save();
      ctx.beginPath();
      ctx.rect(flatLeft, -pageH / 2, flatW, pageH);
      ctx.clip();
      const flatTex = this.paperTexture();
      if (flatTex) {
        ctx.drawImage(flatTex, leftX, -pageH / 2, pageW, pageH);
      } else {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.3;
        for (let s = 0; s < 5; s += 1) {
          const sy = -34 + s * 14;
          ctx.beginPath();
          ctx.moveTo(flatLeft, sy);
          ctx.lineTo(flatRight, sy);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(60,42,24,0.85)';
        const notePositions = [0.2, 0.35, 0.5, 0.62, 0.78];
        notePositions.forEach((tp, i) => {
          const nx = flatLeft + tp * flatW;
          const ny = -34 + (i % 5) * 14 - 2;
          ctx.beginPath();
          ctx.ellipse(nx, ny, 3.2, 2.4, -0.4, 0, Math.PI * 2);
          ctx.fill();
        });
        if (roll < 0.5) {
          ctx.globalAlpha = 1 - roll / 0.5;
          ctx.fillStyle = INK;
          ctx.font = '15px "Georgia", serif';
          ctx.fillText(this.textLines[0] ?? '', flatLeft + 8, -pageH / 2 + 22);
        }
      }
      ctx.restore();
    }

    // The accumulating rolled cylinder on the leading (left) edge. Its width now
    // tracks `rolled` across the FULL 0→1 range (a small base so it reads as a
    // tube the moment it appears), so the roll's progress stays visible the whole
    // way instead of snapping to full by rolled≈0.15.
    if (rolled > 0.02) {
      const curW = tubeR * 2 * (0.2 + 0.8 * rolled);
      const halfW = curW / 2;
      const gx = ctx.createLinearGradient(tubeCx - halfW, 0, tubeCx + halfW, 0);
      gx.addColorStop(0, PAPER_BACK);
      gx.addColorStop(0.4, PAPER_LIGHT);
      gx.addColorStop(0.6, PAPER_LIGHT);
      gx.addColorStop(1, '#c9b689');
      ctx.fillStyle = gx;
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 18;
      roundRectPath(ctx, tubeCx - halfW, -pageH / 2, curW, pageH, halfW);
      ctx.fill();

      ctx.save();
      roundRectPath(ctx, tubeCx - halfW, -pageH / 2, curW, pageH, halfW);
      ctx.clip();
      const rollTex = this.paperTexture();
      if (rollTex) {
        ctx.drawImage(rollTex, leftX, -pageH / 2, pageW, pageH);
      }
      // Rolling seam lines: their horizontal offset is driven by the swept angle,
      // so the surface visibly turns as the pointer circles (each line sweeps
      // across the face and wraps, like a cylinder rotating under the finger).
      ctx.strokeStyle = 'rgba(120,84,48,0.5)';
      ctx.lineWidth = 1.2;
      const seams = 5;
      for (let k = 0; k < seams; k += 1) {
        // Position around the cylinder → projected onto the visible face via sin.
        // sweptAngle grows with the drag, so seams sweep across as the tube rolls.
        const theta = sweptAngle + (k / seams) * Math.PI * 2;
        const lx = tubeCx + Math.sin(theta) * (halfW - 1.5);
        // Fade lines as they round the far side (cos < 0), like a real surface.
        const face = 0.25 + 0.55 * Math.max(0, Math.cos(theta));
        ctx.globalAlpha = face;
        ctx.beginPath();
        ctx.moveTo(lx, -pageH / 2);
        ctx.lineTo(lx, pageH / 2);
        ctx.stroke();
      }
      // A travelling specular band that circles with the roll — the clearest read
      // of rotation, riding the leading face of the turning tube.
      const hlX = tubeCx + Math.sin(sweptAngle) * halfW * 0.7;
      const hlAlpha = 0.35 * Math.max(0, Math.cos(sweptAngle)) + 0.08;
      const hg = ctx.createLinearGradient(hlX - 10, 0, hlX + 10, 0);
      hg.addColorStop(0, 'rgba(255,247,228,0)');
      hg.addColorStop(0.5, `rgba(255,247,228,${hlAlpha})`);
      hg.addColorStop(1, 'rgba(255,247,228,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = hg;
      ctx.fillRect(hlX - 10, -pageH / 2, 20, pageH);
      ctx.restore();
    }

    // Plucked-note sparkles at the top of the tube, in tube-local coords.
    this.drawRollSparkles(ctx, tubeCx, -pageH / 2);
    ctx.restore();

    // KINDLE: glow blooms through the rolled tube — both radius and alpha ramp, so
    // the light visibly GROWS from an ember to a full bloom as it is held.
    if (this.kindle > 0) {
      ctx.save();
      ctx.translate(tubeCx + cx, cy);
      const glowR = 34 + 56 * this.kindle;
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, glowR);
      glow.addColorStop(0, `rgba(255, 226, 150, ${0.9 * this.kindle})`);
      glow.addColorStop(0.5, `rgba(255, 190, 100, ${0.5 * this.kindle})`);
      glow.addColorStop(1, 'rgba(255, 170, 80, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Draws the live plucked-note sparkles at the tube (caller is translated to the
   * lantern centre; x0,y0 is the tube's top in that local frame). Each is a brief
   * expanding, fading four-point twinkle — the module's gentle aesthetic. */
  private drawRollSparkles(ctx: CanvasRenderingContext2D, x0: number, y0: number): void {
    if (this.rollSparkles.length === 0) {
      return;
    }
    const now = performance.now();
    this.rollSparkles = this.rollSparkles.filter((t0) => now - t0 < ROLL_SPARKLE_MS);
    for (const t0 of this.rollSparkles) {
      const t = clamp01((now - t0) / ROLL_SPARKLE_MS);
      const alpha = (1 - t) * 0.9;
      const r = 3 + 9 * t;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#fff3c9';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0 - r, y0);
      ctx.lineTo(x0 + r, y0);
      ctx.moveTo(x0, y0 - r);
      ctx.lineTo(x0, y0 + r);
      ctx.stroke();
      ctx.restore();
    }
  }

  // The boat coming together along the bottom — a COMPOSITE of the three pieces
  // (file-first images when present, else procedural), never one monolith.
  /** The boat-tray's animated origin Y: rest at BOAT_REST_Y, or eased down onto
   * the water from BOAT_DROP_RISE above when the finished boat first assembles,
   * with a gentle decaying settle bob at the end (a boat easing onto water, not a
   * hard stop). */
  private boatOriginY(): number {
    if (this.boatDropStart === undefined) {
      return BOAT_REST_Y;
    }
    const t = clamp01((performance.now() - this.boatDropStart) / BOAT_DROP_MS);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic descent
    const bob = Math.sin(t * Math.PI * 3) * (1 - t) * 5; // small decaying settle
    return BOAT_REST_Y - BOAT_DROP_RISE * (1 - ease) + bob;
  }

  private drawBoatTray(): void {
    const ctx = this.ctx;
    const cx = LOGICAL_WIDTH / 2;

    // The water band. With the painted backdrop present, the painting already
    // carries the water below its waterline (WATERLINE_Y) — a full-strength navy
    // rect would only mud it out — so we skip it and let the paint read. Without
    // the backdrop (flat-gradient fallback) this translucent navy band IS the
    // water the boat floats on, so it stays.
    if (!this.images.backdrop) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#12233a';
      ctx.fillRect(0, WATERLINE_Y, LOGICAL_WIDTH, LOGICAL_HEIGHT - WATERLINE_Y);
      ctx.restore();
    }

    if (this.assembled <= 0) {
      return;
    }

    ctx.save();
    ctx.translate(cx, this.boatOriginY());
    this.drawPiece('hull', TRAY_ANCHORS.hull, () => {
      ctx.fillStyle = '#f2e8cf';
      ctx.strokeStyle = 'rgba(120, 84, 48, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-64, -2);
      ctx.lineTo(64, -2);
      ctx.lineTo(42, 22);
      ctx.lineTo(-42, 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    if (this.assembled >= 2) {
      this.drawPiece('sail', TRAY_ANCHORS.sail, () => {
        ctx.beginPath();
        ctx.moveTo(-4, 20);
        ctx.lineTo(-4, -40);
        ctx.lineTo(34, 14);
        ctx.closePath();
        ctx.fillStyle = '#f6ecd2';
        ctx.strokeStyle = 'rgba(120, 84, 48, 0.6)';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      });
    }

    if (this.assembled >= 3) {
      // The lantern hangs by its own handle loop threaded on the bow tip (see the
      // lantern anchor) — no drawn hook arm.
      this.drawPiece('lantern', TRAY_ANCHORS.lantern, () => {
        const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 22);
        glow.addColorStop(0, 'rgba(255, 226, 150, 0.95)');
        glow.addColorStop(1, 'rgba(255, 180, 90, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffcf7a';
        ctx.fillRect(-5, -7, 10, 14);
      });
    }
    ctx.restore();
  }

  private drawPiece(
    key: 'hull' | 'sail' | 'lantern',
    anchor: { x: number; y: number; w: number; h: number },
    procedural: () => void,
  ): void {
    const ctx = this.ctx;
    const img = this.images[key];
    if (img) {
      ctx.drawImage(img, anchor.x - anchor.w / 2, anchor.y - anchor.h / 2, anchor.w, anchor.h);
      return;
    }
    ctx.save();
    ctx.translate(anchor.x, anchor.y);
    procedural();
    ctx.restore();
  }
}

// --- geometry helpers ------------------------------------------------------

function rectPoints(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

function boundsRect(poly: Point[]): Rect {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

function polygonPath(ctx: CanvasRenderingContext2D, poly: Point[]): void {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i += 1) {
    ctx.lineTo(poly[i].x, poly[i].y);
  }
  ctx.closePath();
}

/** Index-wise linear interpolation between two equal-length polygons. */
function lerpPoly(from: Point[], to: Point[], t: number): Point[] {
  const n = Math.min(from.length, to.length);
  const out: Point[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push({ x: from[i].x + (to[i].x - from[i].x) * t, y: from[i].y + (to[i].y - from[i].y) * t });
  }
  return out;
}

/** Signed side of point p relative to the line a→b (>0 / <0). */
function sideOf(p: Point, a: Point, b: Point): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

/** Reflection of point p across the infinite line a→b. */
function reflectPoint(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return { x: 2 * projX - p.x, y: 2 * projY - p.y };
}

function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Ray-cast point-in-polygon test (boundary counts as inside within eps). */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance from point `p` to segment a→b. */
function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when `p` is inside `poly` OR within `margin` (logical px) of its edge —
 * the on-paper pickup test (a modest grab-forgiveness band around the shape). */
export function pointNearPolygon(p: Point, poly: Point[], margin: number): boolean {
  if (poly.length < 3) {
    return false;
  }
  if (pointInPolygon(p, poly)) {
    return true;
  }
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    if (distToSegment(p, poly[j], poly[i]) <= margin) {
      return true;
    }
  }
  return false;
}

/** Sutherland–Hodgman clip of a simple polygon to the half-plane on the side of
 * the infinite line a→b whose sign matches `keepSign`. */
function clipToHalfPlane(poly: Point[], a: Point, b: Point, keepSign: number): Point[] {
  const sign = keepSign >= 0 ? 1 : -1;
  const side = (p: Point): number => sideOf(p, a, b);
  const inside = (p: Point): boolean => side(p) * sign >= -1e-6;
  const intersect = (p: Point, q: Point): Point => {
    const sp = side(p);
    const sq = side(q);
    const t = sp / (sp - sq || 1e-9);
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  };
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) {
        out.push(intersect(prev, cur));
      }
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

function signedAngle(from: Point, to: Point, centre: Point): number {
  const a1 = Math.atan2(from.y - centre.y, from.x - centre.x);
  const a2 = Math.atan2(to.y - centre.y, to.x - centre.x);
  let d = a2 - a1;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function wrapLines(ctx: CanvasRenderingContext2D, lines: string[], maxWidth: number): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const words = raw.split(' ');
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        out.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) {
      out.push(current);
    }
  }
  return out;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Smoothstep of a raw 0..1 ramp (clamped), for eased boundary transitions. */
function smoothstep(x: number): number {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}
