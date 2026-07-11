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
//   ROLL  (lantern)     — a circular drag curls the page from its edge into a
//                         cylinder (onRoll(deltaAngle)).
//   KINDLE(lantern)     — press-and-hold (onKindleChange(held)).
//
// No model logic lives here: the activity owns the RitualState, pushes the derived
// numbers back in, and the stage only draws. The three finished pieces (hull,
// sail, lantern) are drawn file-first — each tries
// /assets/activities/fold-the-letters/<piece>.png and falls back to a procedural
// draw — and the assembled boat is their COMPOSITE, not one sprite.

import { isImageUrl } from '../../game/assetProbe';
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

// How far (logical px) an "open" pull drag travels to fully open the boat.
const PULL_SPAN = 130;
// Per-frame settle speed for the short ease home / fall-back-open after release.
const SETTLE_RATE = 0.14;

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
const CREASE = 'rgba(120, 84, 48, 0.9)';

const ASSET_BASE = '/assets/activities/fold-the-letters';
const PIECE_FILES: Readonly<Record<string, string>> = {
  hull: `${ASSET_BASE}/hull.png`,
  sail: `${ASSET_BASE}/sail.png`,
  lantern: `${ASSET_BASE}/lantern.png`,
  'recipient-boat': `${ASSET_BASE}/recipient-boat.png`,
};

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

// Composite anchors in the boat-tray's local frame (origin = waterline centre).
// Documented in public/assets/activities/fold-the-letters/README.md so real art
// slots in with zero code changes. Each piece is drawn centred on its anchor.
export const TRAY_ANCHORS = {
  /** Hull sits on the waterline. */
  hull: { x: 0, y: -16, w: 132, h: 44 },
  /** Sail mounts on the hull's mast point. */
  sail: { x: 2, y: -58, w: 76, h: 78 },
  /** Lantern hangs at the bow. */
  lantern: { x: -52, y: -26, w: 30, h: 40 },
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
  private readonly ctx: CanvasRenderingContext2D;
  private readonly callbacks: FoldStageCallbacks;

  private verb: Verb = 'fold';
  private componentId: ComponentId = 'hull';
  private hullShape: HullShape = 'sheet';
  private assembled = 0;
  private paper: Rect = { x: 176, y: 92, w: 288, h: 190 };
  private crease?: HullCrease;
  private textLines: string[] = [];
  private hoist = 0;
  private catching = false;
  private roll = 0;
  private kindle = 0;
  private kindleHeld = false;

  // Live fold gesture.
  private foldPlan?: FoldPlan;
  private foldProgress = 0;
  private foldGrabbed = false;
  private settle?: { target: number; onDone: () => void };

  private rafId?: number;
  private time = 0;
  private disposed = false;

  private pointerDown = false;
  private hoistGrabOffset = 0;
  private pointerLast?: Point;

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
    this.paper = { x: 176, y: 92, w: 288, h: 190 };
    this.hoist = 0;
    this.roll = 0;
    this.kindle = 0;
    this.kindleHeld = false;
    this.crease = undefined;
    this.foldPlan = undefined;
    this.foldProgress = 0;
    this.foldGrabbed = false;
    this.settle = undefined;
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
    this.assembled = count;
  }

  setHoist(progress: number, catching: boolean): void {
    this.hoist = progress;
    this.catching = catching;
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
      Object.entries({ ...PIECE_FILES, ...PIECE_PAPER_FILES }).map(async ([key, url]) => {
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
    if (this.settle) {
      return; // let the previous fold finish settling
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
    } else if (this.verb === 'kindle') {
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
    } else if (this.verb === 'roll') {
      const centre = this.rollCentre();
      const deltaAngle = signedAngle(last, now, centre);
      if (Number.isFinite(deltaAngle) && deltaAngle !== 0) {
        this.callbacks.onRoll(deltaAngle);
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
  };

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
    const mastTop = 48;
    const mastBottom = 300;
    const headLow = 226;
    const headHigh = 64;
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
      // Crease from top-right to bottom-left; the top-left triangle folds over.
      a = { x: b.x + b.w, y: b.y };
      bb = { x: b.x, y: b.y + b.h };
      f0 = { x: b.x, y: b.y }; // the folding corner
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
    const loop = (): void => {
      if (this.disposed) {
        return;
      }
      this.time += 0.05;
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

    const table = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    table.addColorStop(0, '#241d2b');
    table.addColorStop(1, '#140e18');
    ctx.fillStyle = table;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    this.drawBoatTray();

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
    const ctx = this.ctx;
    if (plan.kind === 'open') {
      // Two arrows pulling the sides outward.
      this.drawPullArrows();
      return;
    }
    for (const flap of plan.flaps ?? []) {
      // The pulsing crease line.
      ctx.save();
      ctx.setLineDash([9, 8]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = CREASE;
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(this.time);
      ctx.beginPath();
      ctx.moveTo(flap.a.x, flap.a.y);
      ctx.lineTo(flap.b.x, flap.b.y);
      ctx.stroke();
      ctx.restore();
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
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([9, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = CREASE;
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(this.time);
    ctx.beginPath();
    ctx.moveTo(flap.a.x, flap.a.y);
    ctx.lineTo(flap.b.x, flap.b.y);
    ctx.stroke();
    ctx.restore();
    this.drawTravelArrow(flap.f0, flap.f1);
  }

  private drawTravelArrow(f0: Point, f1: Point): void {
    const ctx = this.ctx;
    const dx = f1.x - f0.x;
    const dy = f1.y - f0.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const reach = 34 + 6 * Math.sin(this.time * 1.4);
    const sx = f0.x + ux * 6;
    const sy = f0.y + uy * 6;
    const ex = f0.x + ux * reach;
    const ey = f0.y + uy * reach;
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 1.4);
    ctx.strokeStyle = '#ffe1a1';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux * 9 - uy * 7, ey - uy * 9 + ux * 7);
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux * 9 + uy * 7, ey - uy * 9 - ux * 7);
    ctx.stroke();
    ctx.restore();
  }

  private drawPullArrows(): void {
    const ctx = this.ctx;
    const poly = this.hullPolygon('peak');
    const b = boundsRect(poly);
    const midY = b.y + b.h * 0.4;
    const reach = 26 + 6 * Math.sin(this.time * 1.4);
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 1.4);
    ctx.strokeStyle = '#ffe1a1';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const dir of [-1, 1]) {
      const sx = b.x + b.w / 2 + dir * b.w * 0.3;
      const ex = sx + dir * reach;
      ctx.beginPath();
      ctx.moveTo(sx, midY);
      ctx.lineTo(ex, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex, midY);
      ctx.lineTo(ex - dir * 9, midY - 7);
      ctx.moveTo(ex, midY);
      ctx.lineTo(ex - dir * 9, midY + 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  // HOIST: a mast with the sail triangle pinned to the pointer height as it rides.
  private drawHoistStage(): void {
    const ctx = this.ctx;
    const mastX = LOGICAL_WIDTH / 2;
    const { mastTop, mastBottom, headLow, travel } = this.hoistBounds();

    ctx.save();
    ctx.strokeStyle = 'rgba(180, 150, 110, 0.9)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mastX, mastTop);
    ctx.lineTo(mastX, mastBottom);
    ctx.stroke();
    ctx.restore();

    const wobble = this.catching ? Math.sin(this.time * 6) * 10 : Math.sin(this.time * 2) * 2.5;
    const topY = headLow - this.hoist * travel;
    const sailH = 128;
    const foot = topY + sailH;

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
      // The printed sail face rides up the mast with the sail as it hoists.
      ctx.drawImage(sailTex, mastX + 2, topY, 74, sailH);
    } else {
      ctx.fillStyle = INK;
      ctx.font = '13px "Georgia", serif';
      this.textLines.forEach((line, i) => {
        const ly = topY + 34 + i * 26;
        const flutter = Math.sin(this.time * 3 + i) * (this.catching ? 4 : 1.5);
        ctx.fillText(line, mastX + 12, ly + flutter);
      });
    }
    ctx.restore();

    // A grab handle at the sail's head while it's below the top, so it reads as a
    // thing to pull up.
    if (this.hoist < 0.985) {
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(this.time * 1.4);
      ctx.fillStyle = '#ffe1a1';
      ctx.beginPath();
      ctx.arc(mastX + 2, topY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = this.hoist > 0.98 ? '#ffd98a' : 'rgba(255,217,138,0.5)';
    ctx.beginPath();
    ctx.moveTo(mastX, mastTop);
    ctx.lineTo(mastX + 24 + wobble * 0.5, mastTop + 6);
    ctx.lineTo(mastX, mastTop + 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ROLL/KINDLE: the sheet music curls from its leading edge into a cylinder,
  // then glows through.
  private drawLanternStage(): void {
    const ctx = this.ctx;
    const centre = this.rollCentre();
    const cx = centre.x;
    const cy = centre.y;
    const roll = this.roll;
    const pageW = 260;
    const pageH = 150;
    const tubeR = 30; // radius of the fully rolled cylinder

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

    // The accumulating rolled cylinder on the leading (left) edge.
    if (rolled > 0.02) {
      const curW = tubeR * 2 * Math.min(1, rolled / 0.15 + 0.2);
      const gx = ctx.createLinearGradient(tubeCx - curW / 2, 0, tubeCx + curW / 2, 0);
      gx.addColorStop(0, PAPER_BACK);
      gx.addColorStop(0.4, PAPER_LIGHT);
      gx.addColorStop(0.6, PAPER_LIGHT);
      gx.addColorStop(1, '#c9b689');
      ctx.fillStyle = gx;
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 18;
      roundRectPath(ctx, tubeCx - curW / 2, -pageH / 2, curW, pageH, curW / 2);
      ctx.fill();
      // Spiral edge lines that sell the wrap — over the rolled sheet's leading
      // edge (the texture's left columns) when a drop-in texture is present.
      ctx.save();
      roundRectPath(ctx, tubeCx - curW / 2, -pageH / 2, curW, pageH, curW / 2);
      ctx.clip();
      const rollTex = this.paperTexture();
      if (rollTex) {
        ctx.drawImage(rollTex, leftX, -pageH / 2, pageW, pageH);
      }
      ctx.strokeStyle = 'rgba(120,84,48,0.5)';
      ctx.lineWidth = 1.2;
      for (let k = -2; k <= 2; k += 1) {
        const lx = tubeCx + (k / 3) * (curW / 2);
        ctx.beginPath();
        ctx.moveTo(lx, -pageH / 2);
        ctx.lineTo(lx, pageH / 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();

    // KINDLE: glow blooms through the rolled tube.
    if (this.kindle > 0) {
      ctx.save();
      ctx.translate(tubeCx + cx, cy);
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 80);
      glow.addColorStop(0, `rgba(255, 226, 150, ${0.9 * this.kindle})`);
      glow.addColorStop(0.5, `rgba(255, 190, 100, ${0.5 * this.kindle})`);
      glow.addColorStop(1, 'rgba(255, 170, 80, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // The boat coming together along the bottom — a COMPOSITE of the three pieces
  // (file-first images when present, else procedural), never one monolith.
  private drawBoatTray(): void {
    const ctx = this.ctx;
    const baseY = LOGICAL_HEIGHT - 30;
    const cx = LOGICAL_WIDTH / 2;

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#12233a';
    ctx.fillRect(0, baseY, LOGICAL_WIDTH, 30);
    ctx.restore();

    if (this.assembled <= 0) {
      return;
    }

    ctx.save();
    ctx.translate(cx, baseY);
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
