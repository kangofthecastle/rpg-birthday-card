// Layered outdoor-ground renderer (v2). Draws the grass base, worn dirt paths,
// and boundary hedge as THREE independent layers, each of which prefers a
// dropped-in art texture but falls back to a procedural paint so the world never
// regresses before art lands (see outdoorScenery.ts for the slot rationale).
//
// The path layer is the important architectural change: instead of baked
// path-on-grass tiles from a packed sheet (which forced the grass under the path
// to match the grass base, and baked S-kinked corners), paths are TRANSPARENT
// overlay pieces composited over whatever grass is beneath. The engine rotates a
// small set of base pieces (straight / quarter-arc corner / T / dead-end cap) per
// path cell, so corners are smooth arcs and there is no grass to match.

import Phaser from 'phaser';
import { fnv1a, mulberry32 } from './rng';
import {
  GROUND_GRASS_KEY,
  GROUND_GRASS_DUSK_KEY,
  PATH_CAP_KEY,
  PATH_CORNER_KEY,
  PATH_STRAIGHT_KEY,
  PATH_TEE_KEY,
  type OutdoorPalette,
} from '../content/outdoorScenery';

/** Linear blend of two 0xRRGGBB colours (t=0 -> a, t=1 -> b). */
function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// Ground layer depths (below every sprite/prop, which start at 0+).
const DEPTH_GRASS = -20;
const DEPTH_TINT = -19.5; // over grass, under paths so the worn dirt keeps its true colour
const DEPTH_PATH = -19;

export interface OutdoorGroundOptions {
  readonly width: number;
  readonly height: number;
  readonly tile: number;
  readonly cols: number;
  readonly rows: number;
  readonly palette: OutdoorPalette;
  readonly openEdges: ReadonlySet<string>;
  /**
   * Edges the worn dirt PATH routes toward (defaults to openEdges). Split out so a
   * structurally-open edge can be left deliberately unpaved — e.g. Guildford's
   * south approach to the clearing is walked "off the path" through plain grass,
   * so its south edge is open (no hedge) yet carries no road. The hedge layer
   * still reads the full `openEdges`, so no framing is drawn across the gap.
   */
  readonly pathOpenEdges?: ReadonlySet<string>;
  /** Door/interaction exit rects (map px) worn paths route toward. */
  readonly exits: ReadonlyArray<{ x: number; y: number; width: number; height: number }>;
  /** 4-connected path cell mask (cols*rows, row-major) — see rasterizePathCells. */
  readonly pathMask: ReadonlyArray<boolean>;
  /** Twilight clearing: dusk grass, no hedge (the shore reads the boundary). */
  readonly dusk: boolean;
  /** Stable per-area seed for the procedural fallbacks. */
  readonly seed: string;
}

/**
 * Builds the outdoor ground into the scene as retained display objects at
 * negative depths. Safe to call once per scene create().
 */
export function buildOutdoorGround(
  scene: Phaser.Scene,
  opts: OutdoorGroundOptions,
): void {
  const rng = mulberry32(fnv1a(`${opts.seed}:ground`));
  buildGrassLayer(scene, opts, rng);
  buildTintLayer(scene, opts);
  buildPathLayer(scene, opts);
  // Boundary hedges were retired — closed edges read as plain grass (the map's
  // collision border still stops the player; the world just isn't walled).
}

// ── Grass ────────────────────────────────────────────────────────────────────
function buildGrassLayer(
  scene: Phaser.Scene,
  opts: OutdoorGroundOptions,
  rng: () => number,
): void {
  const { width, height, tile, cols, rows, palette, dusk } = opts;
  const artKey = dusk ? GROUND_GRASS_DUSK_KEY : GROUND_GRASS_KEY;
  if (scene.textures.exists(artKey)) {
    // Seamless texture tiled over the whole map — no cell grid, so no seams.
    scene.add
      .tileSprite(0, 0, width, height, artKey)
      .setOrigin(0, 0)
      .setDepth(DEPTH_GRASS);
    return;
  }

  // Procedural fallback: continuous full-canvas grass (drawn once into a GPU
  // RenderTexture) — floorA base, a soft organic checker, and scattered tufts.
  // Continuous paint = no seams, matching the pre-art look.
  const g = scene.make.graphics({}, false);
  g.fillStyle(palette.floorA, 1);
  g.fillRect(0, 0, width, height);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < cols; column += 1) {
      const checker = (row + column) % 2 === 0;
      if (checker !== (rng() < 0.18)) {
        g.fillStyle(palette.floorB, 0.55);
        g.fillRect(column * tile, row * tile, tile, tile);
      }
    }
  }
  const tuftCount = Math.round(cols * rows * 0.6);
  for (let i = 0; i < tuftCount; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const r = 2 + rng() * 3;
    g.fillStyle(palette.stroke, 0.18 + rng() * 0.16);
    g.fillEllipse(x, y, r * 2.4, r * 1.4);
    g.fillEllipse(x + r, y - r * 0.4, r * 1.6, r);
  }
  const rt = scene.add
    .renderTexture(0, 0, width, height)
    .setOrigin(0, 0)
    .setDepth(DEPTH_GRASS);
  rt.draw(g);
  g.destroy();
}

// ── Per-area tint ─────────────────────────────────────────────────────────────
// A subtle wash so shared grass still reads as distinct places. Sits over the
// grass but UNDER the paths/hedge, so dirt and hedge keep their own colour.
function buildTintLayer(scene: Phaser.Scene, opts: OutdoorGroundOptions): void {
  const tint = scene.add
    .graphics()
    .setDepth(DEPTH_TINT)
    .setAlpha(opts.dusk ? 0.22 : 0.16);
  tint.fillStyle(opts.palette.floorA, 1);
  tint.fillRect(0, 0, opts.width, opts.height);
}

// ── Paths ─────────────────────────────────────────────────────────────────────
interface OverlayPiece {
  readonly key: string;
  /** Clockwise 90° turns from the piece's base orientation. */
  readonly quarter: number;
}

// Picks the path overlay piece(s) for a cell from its 4-neighbour connectivity.
// Base orientations: straight = vertical (N–S); corner joins S & E; T is open at
// E,S,W (missing N); cap (dead-end) is open at S. Rotations are clockwise quarter
// turns (N→E→S→W). Any grass shows through the transparent piece, so the same
// pieces serve every area including the dusk clearing.
function choosePathOverlay(
  n: boolean,
  e: boolean,
  s: boolean,
  w: boolean,
): readonly OverlayPiece[] {
  const count = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);
  const capQuarter = { S: 0, W: 1, N: 2, E: 3 } as const;
  if (count === 0) {
    return [{ key: PATH_STRAIGHT_KEY, quarter: 0 }];
  }
  if (count === 1) {
    const target = n ? 'N' : e ? 'E' : w ? 'W' : 'S';
    return [{ key: PATH_CAP_KEY, quarter: capQuarter[target] }];
  }
  if (count === 2) {
    if (n && s) return [{ key: PATH_STRAIGHT_KEY, quarter: 0 }];
    if (e && w) return [{ key: PATH_STRAIGHT_KEY, quarter: 1 }];
    let quarter = 0; // base corner joins S & E
    if (s && w) quarter = 1;
    else if (w && n) quarter = 2;
    else if (n && e) quarter = 3;
    return [{ key: PATH_CORNER_KEY, quarter }];
  }
  if (count === 3) {
    const missingQuarter = !n ? 0 : !e ? 1 : !s ? 2 : 3;
    return [{ key: PATH_TEE_KEY, quarter: missingQuarter }];
  }
  return [
    { key: PATH_STRAIGHT_KEY, quarter: 0 },
    { key: PATH_STRAIGHT_KEY, quarter: 1 },
  ];
}

function hasAllPathArt(scene: Phaser.Scene): boolean {
  return (
    scene.textures.exists(PATH_STRAIGHT_KEY) &&
    scene.textures.exists(PATH_CORNER_KEY) &&
    scene.textures.exists(PATH_TEE_KEY) &&
    scene.textures.exists(PATH_CAP_KEY)
  );
}

function buildPathLayer(scene: Phaser.Scene, opts: OutdoorGroundOptions): void {
  const { width, height, tile, cols, rows, pathMask } = opts;
  const pathEdges = opts.pathOpenEdges ?? opts.openEdges;

  if (hasAllPathArt(scene)) {
    const rt = scene.add
      .renderTexture(0, 0, width, height)
      .setOrigin(0, 0)
      .setDepth(DEPTH_PATH);
    const draw = (key: string, quarter: number, px: number, py: number): void => {
      rt.drawFrame(rotatedScaledKey(scene, key, quarter, tile), undefined, px, py);
    };
    for (let index = 0; index < pathMask.length; index += 1) {
      if (!pathMask[index]) continue;
      const column = index % cols;
      const row = Math.floor(index / cols);
      const n = !!(row > 0 && pathMask[index - cols]);
      const s = !!(row < rows - 1 && pathMask[index + cols]);
      const w = !!(column > 0 && pathMask[index - 1]);
      const e = !!(column < cols - 1 && pathMask[index + 1]);
      const count = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);

      // World-edge exit mouth: a single-connection cell sitting on a map boundary
      // whose edge the road routes toward is NOT a dead-end — the road leaves the
      // area toward the next map. Render it as a straight running through the
      // boundary (band full-width to the edge) instead of a fade cap, so an exit
      // route reads as the road continuing off-screen.
      if (count === 1) {
        const mouth =
          (column === 0 && pathEdges.has('west')) ||
          (column === cols - 1 && pathEdges.has('east')) ||
          (row === 0 && pathEdges.has('north')) ||
          (row === rows - 1 && pathEdges.has('south'));
        if (mouth) {
          // Orient the straight along the single interior connection's axis.
          draw(PATH_STRAIGHT_KEY, e || w ? 1 : 0, column * tile, row * tile);
          continue;
        }
      }

      // Every path cell is tile-snapped, so a leg, its bend and its junction all
      // share exact grid-aligned band geometry: straights butt seamlessly, bends
      // get the quarter-arc corner and junctions the T — all continuous. (Door
      // approach legs were previously slid a sub-tile fraction to centre on the
      // door, but that half-tile shift met the on-grid junction/corner cell with a
      // visible step and disconnected the band; continuity wins over that centring,
      // so the leg now snaps to its tile column — up to ~half a tile off the door.)
      for (const piece of choosePathOverlay(n, e, s, w)) {
        draw(piece.key, piece.quarter, column * tile, row * tile);
      }
    }
    return;
  }

  // Procedural fallback: smooth worn dirt stamped from the map centre toward each
  // open edge and each door (a soft dark rim under a lighter core), matching the
  // pre-art look. Independent of the cell mask so it stays smooth.
  const paths = scene.add.graphics().setDepth(DEPTH_PATH);
  const center = { x: width / 2, y: height / 2 };
  const targets = routeTargets(opts);
  const pathEdge = mixColor(opts.palette.path, 0x000000, 0.28);
  for (const target of targets) {
    stampSmoothPath(paths, center, target, pathEdge, tile * 0.44);
    stampSmoothPath(paths, center, target, opts.palette.path, tile * 0.27);
  }
  paths.setAlpha(0.72);
}

function routeTargets(
  opts: OutdoorGroundOptions,
): Array<{ x: number; y: number }> {
  const { width, height, exits } = opts;
  const openEdges = opts.pathOpenEdges ?? opts.openEdges;
  const targets: Array<{ x: number; y: number }> = [];
  if (openEdges.has('west')) targets.push({ x: 0, y: height / 2 });
  if (openEdges.has('east')) targets.push({ x: width, y: height / 2 });
  if (openEdges.has('north')) targets.push({ x: width / 2, y: 0 });
  if (openEdges.has('south')) targets.push({ x: width / 2, y: height });
  for (const exit of exits) {
    targets.push({ x: exit.x + exit.width / 2, y: exit.y + exit.height / 2 });
  }
  return targets;
}

function stampSmoothPath(
  graphics: Phaser.GameObjects.Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: number,
  halfWidth: number,
): void {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(2, Math.round(distance / (halfWidth * 0.7)));
  graphics.fillStyle(color, 1);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    graphics.fillCircle(
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
      halfWidth,
    );
  }
}

// ── Rotation/scale cache ──────────────────────────────────────────────────────
// Bakes a source texture rotated by `quarter` 90° turns and scaled so its LONG
// axis fits `size` into a cached canvas texture, so the hot render loop never
// rotates per-draw. Square sources (path pieces) become size×size; a wide strip
// (hedge) rotated 90° becomes (size × scaledLength).
function rotatedScaledKey(
  scene: Phaser.Scene,
  sourceKey: string,
  quarter: number,
  size: number,
): string {
  const cacheKey = `og-${sourceKey}-${quarter}-${size}`;
  if (scene.textures.exists(cacheKey)) {
    return cacheKey;
  }
  const source = scene.textures.get(sourceKey);
  const image = source.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const srcW = image.width;
  const srcH = image.height;
  // Scale so the SHORT axis maps to `size` (path pieces: square → size×size;
  // hedge strip: 512×64 → thickness 64 becomes `size`, length scales with it).
  const scale = size / Math.min(srcW, srcH);
  const scaledW = Math.round(srcW * scale);
  const scaledH = Math.round(srcH * scale);
  const rotated = quarter % 2 === 1;
  const outW = rotated ? scaledH : scaledW;
  const outH = rotated ? scaledW : scaledH;

  const canvasTexture = scene.textures.createCanvas(cacheKey, outW, outH);
  if (!canvasTexture) {
    return sourceKey;
  }
  const ctx = canvasTexture.getContext();
  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((quarter * Math.PI) / 2);
  ctx.drawImage(image, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
  ctx.restore();
  canvasTexture.refresh();
  return cacheKey;
}
