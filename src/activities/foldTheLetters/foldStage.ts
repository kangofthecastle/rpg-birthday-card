// The keepsake ritual — canvas view for all three verbs.
//
// The stage renders whichever component is being worked and translates raw
// pointer motion into the semantic gesture the current verb expects:
//
//   FOLD  (hull)   — a drag ACROSS the pulsing crease → onFoldDrag(dx, dy).
//   HOIST (sail)   — upward drag along the mast → onHoist(upwardPx), with a
//                    wobble the player rides through the wind-catch windows.
//   ROLL  (lantern)— a circular drag around the page → onRoll(deltaAngle);
//   KINDLE(lantern)— press-and-hold → onKindleChange(held).
//
// No model logic lives here: the activity owns the RitualState, pushes the
// derived numbers back in (setHoist/setRoll/setKindle/…), and the stage only
// draws. The three finished pieces (hull, sail, lantern) are drawn file-first —
// each tries /assets/activities/fold-the-letters/<piece>.png and falls back to a
// procedural draw — and the assembled boat is their COMPOSITE, not one sprite.

import { isImageUrl } from '../../game/assetProbe';
import type { ComponentId, HullCrease, HullShape, Verb } from './foldModel';

const LOGICAL_WIDTH = 640;
const LOGICAL_HEIGHT = 400;
const FOLD_DURATION_MS = 440;

// Hull silhouette layout: the paper is centred in the stage and drawn as the
// real intermediate origami shape for the current step (normalized [-1,1] coords
// scaled by these half-extents), so a genuine paper boat forms fold by fold.
const HULL_CX = 320;
const HULL_CY = 176;
const HULL_HX = 150;
const HULL_HY = 120;

type NPoint = readonly [number, number];

// The traditional hat-to-boat silhouettes, in the order the hull creases produce
// them. Each is a closed outline in normalized coordinates.
const HULL_SHAPE_POLYS: Readonly<Record<HullShape, readonly NPoint[]>> = {
  sheet: [
    [-0.62, -0.95],
    [0.62, -0.95],
    [0.62, 0.95],
    [-0.62, 0.95],
  ],
  book: [
    [-0.92, -0.5],
    [0.92, -0.5],
    [0.92, 0.5],
    [-0.92, 0.5],
  ],
  peak: [
    [0, -0.95],
    [0.78, -0.15],
    [0.78, 0.5],
    [-0.78, 0.5],
    [-0.78, -0.15],
  ],
  hat: [
    [0, -0.9],
    [0.95, 0.55],
    [-0.95, 0.55],
  ],
  diamond: [
    [0, -0.95],
    [0.9, 0],
    [0, 0.95],
    [-0.9, 0],
  ],
  kite: [
    [0, -0.8],
    [0.72, 0.5],
    [-0.72, 0.5],
  ],
  boat: [
    [0, -0.95],
    [0.28, -0.12],
    [0.98, -0.12],
    [0.6, 0.72],
    [-0.6, 0.72],
    [-0.98, -0.12],
    [-0.28, -0.12],
  ],
};

// Faint interior fold marks that sell each shape as folded paper.
const HULL_SHAPE_CREASES: Readonly<Record<HullShape, readonly (readonly [NPoint, NPoint])[]>> = {
  sheet: [],
  book: [[[0, -0.5], [0, 0.5]]],
  peak: [
    [[0, -0.95], [0, 0.5]],
    [[-0.78, -0.15], [0.78, -0.15]],
  ],
  hat: [
    [[0, -0.9], [0, 0.55]],
    [[-0.62, 0.18], [0.62, 0.18]],
  ],
  diamond: [
    [[0, -0.95], [0, 0.95]],
    [[-0.9, 0], [0.9, 0]],
  ],
  kite: [
    [[0, -0.8], [0, 0.5]],
    [[-0.72, 0.12], [0.72, 0.12]],
  ],
  boat: [
    [[0, -0.95], [0, 0.72]],
    [[-0.6, 0.4], [0.6, 0.4]],
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

export interface FoldStageCallbacks {
  /** A drag across the paper — the activity decides if it's a valid fold. */
  readonly onFoldDrag: (dx: number, dy: number) => void;
  /** Incremental upward drag (px moved up this move) for hoisting. */
  readonly onHoist: (upwardPx: number) => void;
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
  private paper: Rect = { x: 176, y: 78, w: 300, h: 210 };
  private crease?: HullCrease;
  private textLines: string[] = [];
  private hoist = 0;
  private catching = false;
  private roll = 0;
  private kindle = 0;
  private kindleHeld = false;

  private animating = false;
  private foldFlip = 0;
  private foldGeo?: { a: Point; b: Point; flap: Point[]; next: Rect; toShape?: HullShape };
  private rafId?: number;
  private time = 0;
  private disposed = false;

  private pointerDown = false;
  private pointerStart?: Point;
  private pointerLast?: Point;

  private readonly images: Partial<Record<string, HTMLImageElement>> = {};

  constructor(
    private readonly canvas: HTMLCanvasElement,
    callbacks: FoldStageCallbacks,
  ) {
    canvas.width = LOGICAL_WIDTH;
    canvas.height = LOGICAL_HEIGHT;
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
    this.paper = { x: 176, y: 78, w: 300, h: 210 };
    this.hoist = 0;
    this.roll = 0;
    this.kindle = 0;
    this.kindleHeld = false;
    this.crease = undefined;
    this.animating = false;
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
      Object.entries(PIECE_FILES).map(async ([key, url]) => {
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
    this.pointerDown = true;
    const point = this.toCanvas(event);
    this.pointerStart = point;
    this.pointerLast = point;
    if (this.verb === 'kindle') {
      this.kindleHeld = true;
      this.callbacks.onKindleChange(true);
    }
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointerDown || this.animating) {
      return;
    }
    const now = this.toCanvas(event);
    const last = this.pointerLast ?? now;

    if (this.verb === 'hoist') {
      const upward = last.y - now.y; // moving up is positive
      if (upward > 0) {
        this.callbacks.onHoist(upward);
      }
    } else if (this.verb === 'roll') {
      const centre = this.rollCentre();
      const deltaAngle = signedAngle(last, now, centre);
      if (Number.isFinite(deltaAngle) && deltaAngle !== 0) {
        this.callbacks.onRoll(deltaAngle);
      }
    }
    this.pointerLast = now;
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const point = this.toCanvas(event);
    if (this.verb === 'fold' && this.pointerDown && this.pointerStart && !this.animating) {
      const dx = point.x - this.pointerStart.x;
      const dy = point.y - this.pointerStart.y;
      this.callbacks.onFoldDrag(dx, dy);
    }
    if (this.verb === 'kindle' && this.kindleHeld) {
      this.kindleHeld = false;
      this.callbacks.onKindleChange(false);
    }
    this.pointerDown = false;
    this.pointerStart = undefined;
    this.pointerLast = undefined;
  };

  private rollCentre(): Point {
    return { x: this.paper.x + this.paper.w / 2, y: this.paper.y + this.paper.h / 2 };
  }

  // --- fold animation (hull + sail crease) ---------------------------------

  /** Plays the flip for a crease the model has already accepted. */
  playFold(crease: HullCrease, onDone: () => void): void {
    const geo = crease.fromShape
      ? this.hullFoldGeometry(crease.fromShape, crease)
      : this.creaseGeometry(crease);
    if (!geo) {
      onDone();
      return;
    }
    this.animating = true;
    this.foldGeo = geo;
    const start = performance.now();
    const step = (ts: number): void => {
      if (this.disposed) {
        return;
      }
      const progress = Math.min(1, (ts - start) / FOLD_DURATION_MS);
      this.foldFlip = easeInOut(progress);
      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }
      // Sail folds carry a real `next` rect; hull folds settle by shape instead.
      if (geo.toShape === undefined) {
        this.paper = geo.next;
      }
      this.animating = false;
      this.foldGeo = undefined;
      this.crease = undefined;
      onDone();
    };
    requestAnimationFrame(step);
  }

  private creaseGeometry(
    crease: HullCrease,
  ): { a: Point; b: Point; flap: Point[]; next: Rect; toShape?: HullShape } | undefined {
    const { x, y, w, h } = this.paper;
    const cx = x + w / 2;
    const cy = y + h / 2;
    switch (crease.line) {
      case 'horizontal': {
        const a = { x, y: cy };
        const b = { x: x + w, y: cy };
        if (crease.toward === 'up') {
          return { a, b, flap: rectPoints({ x, y: cy, w, h: h / 2 }), next: { x, y, w, h: h / 2 } };
        }
        return { a, b, flap: rectPoints({ x, y, w, h: h / 2 }), next: { x, y: cy, w, h: h / 2 } };
      }
      case 'vertical': {
        const a = { x: cx, y };
        const b = { x: cx, y: y + h };
        if (crease.toward === 'left') {
          return { a, b, flap: rectPoints({ x: cx, y, w: w / 2, h }), next: { x, y, w: w / 2, h } };
        }
        return { a, b, flap: rectPoints({ x, y, w: w / 2, h }), next: { x: cx, y, w: w / 2, h } };
      }
      case 'diagonal':
      default: {
        const a = { x: x + w, y };
        const b = { x, y: y + h };
        const flap = [
          { x, y },
          { x: x + w, y },
          { x, y: y + h },
        ];
        const shrink = 0.74;
        const nextH = h * shrink;
        const nextY = crease.toward === 'down' ? y + (h - nextH) : y;
        return { a, b, flap, next: { x, y: nextY, w, h: nextH } };
      }
    }
  }

  // --- hull silhouette geometry (authentic paper-boat shapes) --------------

  private hullPolygon(shape: HullShape): Point[] {
    return HULL_SHAPE_POLYS[shape].map(([nx, ny]) => ({
      x: HULL_CX + nx * HULL_HX,
      y: HULL_CY + ny * HULL_HY,
    }));
  }

  /** The pending crease line drawn across the given hull shape. */
  private hullCreaseLine(shape: HullShape, crease: HullCrease): { a: Point; b: Point } {
    const poly = this.hullPolygon(shape);
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    switch (crease.line) {
      case 'horizontal':
        return { a: { x: minX, y: midY }, b: { x: maxX, y: midY } };
      case 'vertical':
        return { a: { x: midX, y: minY }, b: { x: midX, y: maxY } };
      case 'diagonal':
      default:
        return { a: { x: maxX, y: minY }, b: { x: minX, y: maxY } };
    }
  }

  /** Geometry for a hull crease: the flap (moving region of the from-shape,
   * clipped to the folding side) reflected across the crease line, and the shape
   * it settles into. */
  private hullFoldGeometry(
    shape: HullShape,
    crease: HullCrease,
  ): { a: Point; b: Point; flap: Point[]; next: Rect; toShape?: HullShape } {
    const { a, b } = this.hullCreaseLine(shape, crease);
    const poly = this.hullPolygon(shape);
    const keepSign = foldKeepSign(crease);
    const flap = clipToHalfPlane(poly, a, b, keepSign);
    // `next` is unused for hull folds (the shape drives redraw) but keeps the
    // shared foldGeo shape; a zero rect is harmless.
    return { a, b, flap, next: { x: 0, y: 0, w: 0, h: 0 }, toShape: crease.toShape };
  }

  // --- rendering -----------------------------------------------------------

  private startLoop(): void {
    const loop = (): void => {
      if (this.disposed) {
        return;
      }
      this.time += 0.05;
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    const table = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    table.addColorStop(0, '#241d2b');
    table.addColorStop(1, '#140e18');
    ctx.fillStyle = table;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    this.drawBoatTray();

    if (this.verb === 'fold') {
      this.drawFoldStage();
    } else if (this.verb === 'hoist') {
      this.drawHoistStage();
    } else {
      this.drawLanternStage();
    }
  }

  // FOLD: the hull renders as the real intermediate origami silhouette; the sail
  // crease keeps the plain-sheet look (____'s letter becoming a triangle).
  private drawFoldStage(): void {
    if (this.componentId === 'hull') {
      this.drawHullStage();
      return;
    }
    this.drawSailFoldStage();
  }

  // The hull: draw the current paper-boat silhouette (handwriting compressing
  // inside), animate the flap when a crease takes, then the pending crease.
  private drawHullStage(): void {
    const ctx = this.ctx;

    if (this.animating && this.foldGeo) {
      // The result shape underneath, then the moving flap folding across.
      const to = this.foldGeo.toShape;
      if (to) {
        this.drawHullPaper(this.hullPolygon(to), this.textLines, 0.9);
      }
      this.drawFoldingFlap(this.foldGeo, this.foldFlip);
      return;
    }

    const poly = this.hullPolygon(this.hullShape);
    this.drawHullPaper(poly, this.textLines, 1);
    this.drawHullCreaseMarks(this.hullShape);

    const crease = this.crease;
    if (!crease) {
      return;
    }
    const geo = this.hullCreaseLine(this.hullShape, crease);
    const glow = 0.55 + 0.35 * Math.sin(this.time);
    ctx.save();
    ctx.setLineDash([9, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = CREASE;
    ctx.globalAlpha = glow;
    ctx.beginPath();
    ctx.moveTo(geo.a.x, geo.a.y);
    ctx.lineTo(geo.b.x, geo.b.y);
    ctx.stroke();
    ctx.restore();

    this.drawDragHint(geo, crease);
  }

  // The sail's single triangle crease uses the original plain-sheet drawing.
  private drawSailFoldStage(): void {
    const ctx = this.ctx;
    this.drawPaper(this.paper, this.textLines);

    if (this.animating && this.foldGeo) {
      this.drawFoldingFlap(this.foldGeo, this.foldFlip);
      return;
    }
    const crease = this.crease;
    if (!crease) {
      return;
    }
    const geo = this.creaseGeometry(crease);
    if (!geo) {
      return;
    }
    const glow = 0.55 + 0.35 * Math.sin(this.time);
    ctx.save();
    ctx.setLineDash([9, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = CREASE;
    ctx.globalAlpha = glow;
    ctx.beginPath();
    ctx.moveTo(geo.a.x, geo.a.y);
    ctx.lineTo(geo.b.x, geo.b.y);
    ctx.stroke();
    ctx.restore();

    this.drawDragHint(geo, crease);
  }

  // Fills a hull silhouette polygon with paper, ____'s handwriting clipped
  // inside (so it visibly compresses as the boat forms), and an outline.
  private drawHullPaper(poly: Point[], lines: string[], alpha: number): void {
    if (poly.length < 3) {
      return;
    }
    const ctx = this.ctx;
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    ctx.save();
    ctx.globalAlpha = alpha;
    polygonPath(ctx, poly);
    const grad = ctx.createLinearGradient(minX, minY, maxX, maxY);
    grad.addColorStop(0, PAPER_LIGHT);
    grad.addColorStop(1, PAPER_MID);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 7;
    ctx.fill();
    ctx.restore();

    // Handwriting clipped to the shape.
    ctx.save();
    polygonPath(ctx, poly);
    ctx.clip();
    ctx.fillStyle = INK;
    ctx.font = 'italic 15px "Georgia", serif';
    const wrapped = wrapLines(ctx, lines, maxX - minX - 24);
    wrapped.forEach((line, i) => {
      ctx.fillText(line, minX + 14, minY + 26 + i * 21);
    });
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    polygonPath(ctx, poly);
    ctx.strokeStyle = 'rgba(120, 84, 48, 0.5)';
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
      ctx.moveTo(HULL_CX + a[0] * HULL_HX, HULL_CY + a[1] * HULL_HY);
      ctx.lineTo(HULL_CX + b[0] * HULL_HX, HULL_CY + b[1] * HULL_HY);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawDragHint(geo: { a: Point; b: Point }, crease: HullCrease): void {
    const ctx = this.ctx;
    const mx = (geo.a.x + geo.b.x) / 2;
    const my = (geo.a.y + geo.b.y) / 2;
    // Perpendicular to the crease line.
    const dxc = geo.b.x - geo.a.x;
    const dyc = geo.b.y - geo.a.y;
    const len = Math.hypot(dxc, dyc) || 1;
    let px = -dyc / len;
    let py = dxc / len;
    if (crease.toward === 'up' && py > 0) {
      px = -px;
      py = -py;
    }
    if (crease.toward === 'down' && py < 0) {
      px = -px;
      py = -py;
    }
    const pulse = 20 + 8 * Math.sin(this.time * 1.4);
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 1.4);
    ctx.strokeStyle = '#ffe1a1';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + px * pulse, my + py * pulse);
    ctx.stroke();
    // arrowhead
    ctx.beginPath();
    const hx = mx + px * pulse;
    const hy = my + py * pulse;
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - px * 8 - py * 6, hy - py * 8 + px * 6);
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - px * 8 + py * 6, hy - py * 8 - px * 6);
    ctx.stroke();
    ctx.restore();
  }

  // HOIST: a mast with the sail triangle riding up it, ____'s lines fluttering.
  private drawHoistStage(): void {
    const ctx = this.ctx;
    const mastX = LOGICAL_WIDTH / 2;
    const mastTop = 70;
    const mastBottom = LOGICAL_HEIGHT - 96;

    // Mast.
    ctx.save();
    ctx.strokeStyle = 'rgba(180, 150, 110, 0.9)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mastX, mastTop);
    ctx.lineTo(mastX, mastBottom);
    ctx.stroke();
    ctx.restore();

    // Sail rides from the bottom up as hoist progresses; wind-catch adds a sway.
    const travel = mastBottom - mastTop - 150;
    const wobble = this.catching ? Math.sin(this.time * 6) * 10 : Math.sin(this.time * 2) * 2.5;
    const topY = mastBottom - 60 - this.hoist * travel;
    const sailH = 150;
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

    // ____'s lines fluttering on the sail face.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(mastX + 2, topY);
    ctx.quadraticCurveTo(mastX + 72 + wobble, topY + sailH * 0.4, mastX + 42 + wobble * 0.6, foot);
    ctx.lineTo(mastX + 2, foot);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = INK;
    ctx.font = '13px "Georgia", serif';
    this.textLines.forEach((line, i) => {
      const ly = topY + 34 + i * 26;
      const flutter = Math.sin(this.time * 3 + i) * (this.catching ? 4 : 1.5);
      ctx.fillText(line, mastX + 12, ly + flutter);
    });
    ctx.restore();

    // A small pennant at the mast top that snaps taut as it tops out.
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

  // ROLL/KINDLE: the sheet music curls into a lantern, then glows through.
  private drawLanternStage(): void {
    const ctx = this.ctx;
    const cx = LOGICAL_WIDTH / 2;
    const cy = LOGICAL_HEIGHT / 2 - 8;
    const flat = 1 - this.roll; // 1 = fully flat page, 0 = rolled tube
    const pageW = 260;
    const pageH = 150;
    const tubeW = 64;
    const w = tubeW + (pageW - tubeW) * flat;

    // The rolling page.
    ctx.save();
    ctx.translate(cx, cy);
    const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    grad.addColorStop(0, PAPER_BACK);
    grad.addColorStop(0.5, PAPER_LIGHT);
    grad.addColorStop(1, PAPER_BACK);
    ctx.fillStyle = grad;
    roundRectPath(ctx, -w / 2, -pageH / 2, w, pageH, 8 + 22 * this.roll);
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 16;
    ctx.fill();

    // Staff lines wrapping around as it rolls (they compress with the width).
    ctx.save();
    roundRectPath(ctx, -w / 2, -pageH / 2, w, pageH, 8 + 22 * this.roll);
    ctx.clip();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    for (let s = 0; s < 5; s += 1) {
      const sy = -34 + s * 14;
      ctx.beginPath();
      for (let ix = -w / 2 + 8; ix <= w / 2 - 8; ix += 6) {
        const t = (ix + w / 2) / w;
        const curl = Math.sin(t * Math.PI) * this.roll * 6;
        const yy = sy + curl - 2;
        if (ix === -w / 2 + 8) ctx.moveTo(ix, yy);
        else ctx.lineTo(ix, yy);
      }
      ctx.stroke();
    }
    // A few note heads on the staves.
    ctx.fillStyle = 'rgba(60,42,24,0.85)';
    const notePositions = [0.2, 0.35, 0.5, 0.62, 0.78];
    notePositions.forEach((t, i) => {
      const nx = -w / 2 + 8 + t * (w - 16);
      const ny = -34 + (i % 5) * 14 - 2 + Math.sin(t * Math.PI) * this.roll * 6;
      ctx.beginPath();
      ctx.ellipse(nx, ny, 3.2, 2.4, -0.4, 0, Math.PI * 2);
      ctx.fill();
    });
    // Title of the piece near the top while still readable (fades as it rolls).
    if (this.roll < 0.6) {
      ctx.globalAlpha = 1 - this.roll / 0.6;
      ctx.fillStyle = INK;
      ctx.font = '15px "Georgia", serif';
      ctx.fillText(this.textLines[0] ?? '', -w / 2 + 14, -pageH / 2 + 22);
    }
    ctx.restore();
    ctx.restore();

    // KINDLE: glow blooms through the rolled tube; notes show as silhouettes.
    if (this.kindle > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 90);
      glow.addColorStop(0, `rgba(255, 226, 150, ${0.85 * this.kindle})`);
      glow.addColorStop(0.5, `rgba(255, 190, 100, ${0.5 * this.kindle})`);
      glow.addColorStop(1, 'rgba(255, 170, 80, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawPaper(rect: Rect, lines: string[]): void {
    const ctx = this.ctx;
    const { x, y, w, h } = rect;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, PAPER_LIGHT);
    grad.addColorStop(1, PAPER_MID);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    // The letter's REAL words, wrapped to the sheet, clipped so a shrinking
    // paper visibly compresses the handwriting into the hull.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = INK;
    ctx.font = 'italic 17px "Georgia", serif';
    const wrapped = wrapLines(ctx, lines, w - 28);
    wrapped.forEach((line, i) => {
      ctx.fillText(line, x + 14, y + 30 + i * 24);
    });
    ctx.restore();

    ctx.strokeStyle = 'rgba(120, 84, 48, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  private drawFoldingFlap(
    geo: { a: Point; b: Point; flap: Point[] },
    progress: number,
  ): void {
    const ctx = this.ctx;
    const angle = Math.atan2(geo.b.y - geo.a.y, geo.b.x - geo.a.x);
    const sy = 1 - 2 * progress;
    const backside = sy < 0;

    ctx.save();
    ctx.translate(geo.a.x, geo.a.y);
    ctx.rotate(angle);
    ctx.scale(1, sy);
    ctx.rotate(-angle);
    ctx.translate(-geo.a.x, -geo.a.y);
    ctx.beginPath();
    ctx.moveTo(geo.flap[0].x, geo.flap[0].y);
    for (let i = 1; i < geo.flap.length; i += 1) {
      ctx.lineTo(geo.flap[i].x, geo.flap[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = backside ? PAPER_BACK : PAPER_MID;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 84, 48, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
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

function polygonPath(ctx: CanvasRenderingContext2D, poly: Point[]): void {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i += 1) {
    ctx.lineTo(poly[i].x, poly[i].y);
  }
  ctx.closePath();
}

/** Which side of the crease line the moving flap lies on, as a sign for
 * `clipToHalfPlane` against the line a→b that `hullCreaseLine` produces. */
function foldKeepSign(crease: HullCrease): number {
  switch (crease.line) {
    case 'horizontal':
      // a→b runs left→right; side>0 is BELOW the crease.
      return crease.toward === 'up' ? 1 : -1;
    case 'vertical':
      // a→b runs top→bottom; side>0 is to the RIGHT... (cross is negative there),
      // so the right half has side<0. toward 'left' folds the right half over.
      return crease.toward === 'left' ? -1 : 1;
    case 'diagonal':
    default:
      // a=(maxX,minY) → b=(minX,maxY): the top-right flap has side<0.
      return -1;
  }
}

/** Sutherland–Hodgman clip of a convex/simple polygon to the half-plane on the
 * side of the infinite line a→b whose cross-product sign matches `keepSign`. */
function clipToHalfPlane(poly: Point[], a: Point, b: Point, keepSign: number): Point[] {
  const side = (p: Point): number =>
    (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const inside = (p: Point): boolean => side(p) * keepSign >= -1e-6;
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

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
