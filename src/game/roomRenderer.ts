import Phaser from 'phaser';
import { RECIPIENT_SPRITE } from '../assets/recipientSpriteConfig';
import { projectToIso, type IsoOrigin, type IsoPoint } from './isometricProjection';
import { fnv1a, mulberry32 } from './rng';
import {
  beamTrapezoid,
  resolveWindowBeamSource,
} from './windowBeamGeometry';
import {
  getPropColliders,
  propOverrideTextureKey,
  type PropColliderRect,
  type PropPlacement,
  type RoomDressing,
} from '../content/roomDressing';

export type { PropColliderRect } from '../content/roomDressing';

// Render depths sit far below the player/prop billboards (which depth-sort by
// projected screen Y, i.e. hundreds of px) so the floor and walls always draw
// underneath everyone in the room.
const FLOOR_DEPTH = -60;
const WALL_DEPTH = -58;
const FLOOR_SKIRT_DEPTH = -59;
// Doormat sits just above the floor/rug but below every billboard, so the
// player visibly stands ON it. Its glow pulses beneath the mat.
const DOORMAT_DEPTH = -26;
const DOORMAT_GLOW_DEPTH = -27;

// The post-violin "awakening" overlay (golden window shafts + doormat shine)
// draws as one group above the floor/rug/wall props but below every y-sorted
// billboard (the player and floor-standing props all depth-sort by their
// projected screen Y, hundreds of px positive), so warm light passes BEHIND
// ____ and the furniture rather than washing over her face.
const AWAKENING_DEPTH = -18;

/** Texture key for an optional drop-in doormat PNG (loaded by BootScene). When
 * present it is used as the warp source in place of the procedural weave. */
export const DOORMAT_DROP_KEY = 'doormat-drop';

// The player yardstick: how tall ____'s sprite actually reads on screen. Her
// 256px frame is drawn at RECIPIENT_SPRITE.scale, and the visible character fills
// ~0.88 of that frame height (measured in-scene: ~102px of the 115px frame).
// Prop heightRatios are multiples of this, so props stay sized to the player.
const RECIPIENT_VISIBLE_FRACTION = 0.88;
const PLAYER_VISUAL_HEIGHT_PX =
  RECIPIENT_SPRITE.frameHeight * RECIPIENT_SPRITE.scale * RECIPIENT_VISIBLE_FRACTION;

/** Screen-space extent union of rendered content, for deriving camera bounds. */
export interface ScreenBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The dressed room's floor rectangle in *map* pixels (inset from the map
 * edges), used to locate the open front edge for the doorway light spill. */
export interface FloorMapRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A placed prop paired with its billboard Image, so a dev tool (the dressEdit
 * editor) can re-position/re-scale the exact image the renderer created. */
export interface PropHandle {
  readonly placement: PropPlacement;
  readonly image: Phaser.GameObjects.Image;
}

export interface RoomRenderResult {
  readonly objects: readonly Phaser.GameObjects.GameObject[];
  /** Floor colliders for solid props, in map coordinates. */
  readonly colliders: readonly PropColliderRect[];
  /** Screen-space bounding box of everything rendered (may be negative). */
  readonly contentBounds: ScreenBounds;
  /** One handle per dressed prop, in `dressing.props` order. */
  readonly propHandles: readonly PropHandle[];
}

function emptyBounds(): ScreenBounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function growBounds(bounds: ScreenBounds, x: number, y: number): void {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

/** Unions a Phaser display object's world bounds into a ScreenBounds. */
export function growBoundsFromObject(
  bounds: ScreenBounds,
  object: Phaser.GameObjects.GameObject & { getBounds?: () => Phaser.Geom.Rectangle },
): void {
  if (typeof object.getBounds !== 'function') {
    return;
  }
  const rect = object.getBounds();
  growBounds(bounds, rect.x, rect.y);
  growBounds(bounds, rect.x + rect.width, rect.y + rect.height);
}

/**
 * Renders a dressed room: tiled wood floor over the walkable area, a cream
 * back-wall band along the two rear edges, and positioned prop billboards.
 * Props depth-sort against the player by their projected screen Y so the player
 * can walk in front of or behind them, matching the existing depth logic.
 */
export function renderRoomDressing(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  tilemap: Phaser.Tilemaps.Tilemap,
  origin: IsoOrigin,
  propDepthOverrides: Readonly<Record<string, number>> = {},
): RoomRenderResult {
  registerPropFrames(scene, dressing);

  const objects: Phaser.GameObjects.GameObject[] = [];

  const inset = dressing.floorInsetTiles;
  const mapX0 = inset * tilemap.tileWidth;
  const mapY0 = inset * tilemap.tileHeight;
  const mapX1 = tilemap.widthInPixels - inset * tilemap.tileWidth;
  const mapY1 = tilemap.heightInPixels - inset * tilemap.tileHeight;

  // Floor diamond corners (screen space).
  const top = projectToIso(mapX0, mapY0, origin);
  const right = projectToIso(mapX1, mapY0, origin);
  const bottom = projectToIso(mapX1, mapY1, origin);
  const left = projectToIso(mapX0, mapY1, origin);

  objects.push(...renderWalls(scene, dressing, top, right, left));
  objects.push(...renderFloorSkirt(scene, left, bottom, right));
  objects.push(renderFloor(scene, dressing, [top, right, bottom, left]));
  const propHandles = renderProps(scene, dressing, origin, propDepthOverrides);
  const propImages = propHandles.map((handle) => handle.image);
  objects.push(...propImages);

  // Content bounds: floor diamond + wall tops (negative Y) + skirt bottom, then
  // union each placed prop's real bounds. Drives content-derived camera limits.
  const bounds = emptyBounds();
  for (const corner of [top, right, bottom, left]) {
    growBounds(bounds, corner.x, corner.y);
  }
  growBounds(bounds, left.x, top.y - dressing.wallHeight); // back-left wall top
  growBounds(bounds, right.x, top.y - dressing.wallHeight); // back-right wall top
  growBounds(bounds, bottom.x, bottom.y + 18); // skirt depth
  for (const image of propImages) {
    growBoundsFromObject(bounds, image);
  }

  return { objects, colliders: getPropColliders(dressing), contentBounds: bounds, propHandles };
}

/**
 * Renders a warm woven doormat plus a soft pulsing glow at an exit rect, so a
 * dressed room (which hides the debug rects) still shows the way out. The mat
 * lays flat on the floor, scaled to the exit rect's projected footprint.
 */
export function renderExitDoormat(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  exit: PropColliderRect,
  origin: IsoOrigin,
): RoomRenderResult {
  const matSrc = buildDoormatTexture(scene, dressing);
  const glowSrc = buildDoormatGlowTexture(scene, dressing);
  const idSuffix = `${Math.round(exit.x)}-${Math.round(exit.y)}`;

  // The mat lies IN the floor plane: warp its texture onto the exit rect's
  // projected parallelogram so it foreshortens and aligns to the door edge
  // (rather than reading as an axis-aligned sticker). The glow uses a slightly
  // expanded quad so it pools softly around the mat.
  const glow = warpTextureToFloorQuad(scene, glowSrc, `${glowSrc}-${idSuffix}`, exit, origin, 0.35);
  const mat = warpTextureToFloorQuad(scene, matSrc, `${matSrc}-${idSuffix}`, exit, origin, 0);

  const objects: Phaser.GameObjects.GameObject[] = [];
  const bounds = emptyBounds();

  if (glow) {
    glow.setDepth(DOORMAT_GLOW_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.65);
    scene.tweens.add({
      targets: glow,
      alpha: { from: 0.4, to: 0.8 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    objects.push(glow);
    growBoundsFromObject(bounds, glow);
  }
  if (mat) {
    mat.setDepth(DOORMAT_DEPTH);
    objects.push(mat);
    growBoundsFromObject(bounds, mat);
  }

  return { objects, colliders: [], contentBounds: bounds, propHandles: [] };
}

/**
 * Renders the post-violin "awakening" for a dressed interior: golden light
 * shafts streaming from the room's window onto the floor (with drifting dust
 * motes and a gentle breathing pulse) plus an awakened shine on every exit
 * doormat (a sweeping highlight glint + a stronger steady glow). The whole
 * overlay lives in one container so the caller can fade it in as a single unit
 * — instantly on room entry, or over `fadeInMs` at the moment the violin
 * completes (the emotional beat landing while ____ stands at the stand).
 *
 * Depth-flat by design: everything sits at AWAKENING_DEPTH, above the floor/rug
 * and wall-mounted props but behind the y-sorted player and furniture.
 */
export function renderInteriorAwakening(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  exits: readonly PropColliderRect[],
  origin: IsoOrigin,
  options: { readonly fadeInMs?: number; readonly floorMapRect?: FloorMapRect } = {},
): RoomRenderResult {
  const container = scene.add.container(0, 0).setDepth(AWAKENING_DEPTH);

  addWindowShafts(scene, dressing, origin, container);
  for (const exit of exits) {
    addDoormatAwakening(scene, dressing, exit, origin, container);
  }
  // Whisper of outside light spilling in over the open (wall-less) front edge
  // where the doormat sits — much quieter than the window beams.
  if (options.floorMapRect) {
    addDoorwayEdgeSpill(scene, dressing, options.floorMapRect, origin, container);
  }

  const fadeInMs = options.fadeInMs ?? 0;
  if (fadeInMs > 0) {
    container.setAlpha(0);
    scene.tweens.add({
      targets: container,
      alpha: 1,
      duration: fadeInMs,
      ease: 'Sine.easeInOut',
    });
  }

  const bounds = emptyBounds();
  return { objects: [container], colliders: [], contentBounds: bounds, propHandles: [] };
}

// Golden shafts falling into the room from EVERY window (each a back-wall prop).
// Generalized over all 'window' placements so extra windows each throw their own
// beam set, cast along their wall's inward axis (see addWindowShaftSet).
function addWindowShafts(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  origin: IsoOrigin,
  container: Phaser.GameObjects.Container,
): void {
  const windows = dressing.props.filter((placement) => placement.frame === 'window');
  if (windows.length === 0) {
    return;
  }

  const moteKey = buildInteriorMoteTexture(scene, dressing);
  windows.forEach((windowProp, index) => {
    addWindowShaftSet(scene, dressing, windowProp, index, origin, container, moteKey);
  });
}

// One window's beams: screen-space trapezoids (narrow at the window opening,
// splaying onto the floor) of layered additive fills for soft edges, each capped
// by a bright landing pool, with a few seeded dust motes drifting along its
// length. Beams cast along the wall's inward axis — a west/left window (negative
// shear) throws them east (+map-x) into the room; a north/right window (positive
// shear) throws them south (+map-y) — with a little spread ALONG the wall.
function addWindowShaftSet(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  windowProp: PropPlacement,
  index: number,
  origin: IsoOrigin,
  container: Phaser.GameObjects.Container,
  moteKey: string,
): void {
  const { center: source, slope: sourceSlope } = resolveWindowBeamSource(
    windowProp,
    dressing.wallHeight,
    origin,
  );
  const rng = mulberry32(
    fnv1a(`${dressing.tilesTextureKey}:window-shafts:${index}:${windowProp.mapX},${windowProp.mapY}`),
  );

  // Positive shear ⇒ north/right wall: beams reach deeper south (map-y), spread
  // along map-x. Otherwise west/left wall: deeper east (map-x), spread map-y.
  const northWall = (windowProp.wallShear ?? 0) > 0;
  const landMap = (dist: number, off: number): { x: number; y: number } =>
    northWall
      ? { x: windowProp.mapX + off, y: windowProp.mapY + dist }
      : { x: windowProp.mapX + dist, y: windowProp.mapY + off };

  // Beams reach progressively deeper into the room, with a little cross-spread
  // along the wall for variety.
  const beams = [
    { dist: 210, off: 24, topHW: 26, botHW: 66 },
    { dist: 360, off: -14, topHW: 30, botHW: 82 },
    { dist: 520, off: 58, topHW: 22, botHW: 58 },
  ];

  for (const beam of beams) {
    const landPoint = landMap(beam.dist, beam.off);
    const land = projectToIso(landPoint.x, landPoint.y, origin);

    const shaft = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    shaft.fillStyle(0xffd27a, 0.05);
    shaft.fillPoints(toPhaserPoints(beamTrapezoid(source, land, beam.topHW * 1.5, beam.botHW * 1.4, sourceSlope)), true);
    shaft.fillStyle(0xffd98a, 0.08);
    shaft.fillPoints(toPhaserPoints(beamTrapezoid(source, land, beam.topHW, beam.botHW, sourceSlope)), true);
    shaft.fillStyle(0xffecbe, 0.1);
    shaft.fillPoints(toPhaserPoints(beamTrapezoid(source, land, beam.topHW * 0.5, beam.botHW * 0.55, sourceSlope)), true);
    container.add(shaft);
    // Slow "breathing" so the light feels alive, not a static decal.
    scene.tweens.add({
      targets: shaft,
      alpha: { from: 0.72, to: 1 },
      duration: 3200 + rng() * 1200,
      delay: rng() * 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const pool = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    pool.fillStyle(0xffe6a8, 0.16);
    pool.fillEllipse(land.x, land.y, beam.botHW * 2.6, beam.botHW * 1.1);
    pool.fillStyle(0xfff2cf, 0.12);
    pool.fillEllipse(land.x, land.y, beam.botHW * 1.5, beam.botHW * 0.6);
    container.add(pool);
    scene.tweens.add({
      targets: pool,
      alpha: { from: 0.7, to: 1 },
      duration: 3400 + rng() * 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const dx = land.x - source.x;
    const dy = land.y - source.y;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < 4; i += 1) {
      const t = 0.15 + rng() * 0.8;
      const mx = source.x + dx * t + (rng() - 0.5) * beam.botHW * 0.9;
      const my = source.y + dy * t;
      const mote = scene.add
        .image(mx, my, moteKey)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.4 + rng() * 0.7)
        .setAlpha(0);
      container.add(mote);
      const driftMag = 28 + rng() * 42;
      scene.tweens.add({
        targets: mote,
        x: mx + (dx / len) * driftMag + (rng() - 0.5) * 14,
        y: my + (dy / len) * driftMag,
        duration: 6000 + rng() * 4000,
        delay: rng() * 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      scene.tweens.add({
        targets: mote,
        alpha: { from: 0.12, to: 0.55 + rng() * 0.2 },
        duration: 1600 + rng() * 1400,
        hold: 300 + rng() * 700,
        delay: rng() * 1800,
        repeatDelay: rng() * 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }
}

// Awakened doormat shine: a stronger steady additive glow warped onto the mat's
// floor quad, plus a highlight glint that sweeps across the mat and repeats —
// an unmistakable "go this way" without shouting.
function addDoormatAwakening(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  exit: PropColliderRect,
  origin: IsoOrigin,
  container: Phaser.GameObjects.Container,
): void {
  const idSuffix = `awaken-${Math.round(exit.x)}-${Math.round(exit.y)}`;
  const glowSrc = buildDoormatGlowTexture(scene, dressing);
  const glow = warpTextureToFloorQuad(scene, glowSrc, `${glowSrc}-${idSuffix}`, exit, origin, 0.45);
  if (glow) {
    glow.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);
    scene.tweens.add({
      targets: glow,
      alpha: { from: 0.42, to: 0.85 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    container.add(glow);
  }

  const shimmerKey = buildDoormatShimmerTexture(scene, dressing);
  const cy = exit.y + exit.height / 2;
  const from = projectToIso(exit.x + exit.width * 0.08, cy, origin);
  const to = projectToIso(exit.x + exit.width * 0.92, cy, origin);
  const shimmer = scene.add
    .image(from.x, from.y, shimmerKey)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(0);
  container.add(shimmer);
  // Sweep the glint across; alpha rises then falls (yoyo) so it fades in at one
  // edge and out at the other. Position resets on each repeat.
  scene.tweens.add({
    targets: shimmer,
    x: to.x,
    y: to.y,
    duration: 1700,
    repeat: -1,
    repeatDelay: 1500,
    ease: 'Sine.easeInOut',
    onRepeat: () => shimmer.setPosition(from.x, from.y),
  });
  scene.tweens.add({
    targets: shimmer,
    alpha: 0.75,
    duration: 850,
    yoyo: true,
    repeat: -1,
    repeatDelay: 1500,
    ease: 'Sine.easeInOut',
  });
}

// Warm outside light pouring in over the room's OPEN front edge (the wall-less
// south side the doormat sits on): a gold band hugging that edge and reaching
// well into the floor, a row of low light shafts bouncing up off the threshold
// (short, soft, angled slightly inward — like light kicking up from a bright
// outside), and drifting motes. Reads clearly as light through the open doorway,
// but still sits below the window beams in the hierarchy: it has no direct sun
// source, so no bright landing pools, and its shafts stay low and diffuse.
function addDoorwayEdgeSpill(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  floor: FloorMapRect,
  origin: IsoOrigin,
  container: Phaser.GameObjects.Container,
): void {
  const depth = 250; // how far the glow reaches into the room from the edge (map px)
  const band: PropColliderRect = {
    x: floor.x0,
    y: floor.y1 - depth,
    width: floor.x1 - floor.x0,
    height: depth,
  };

  const rng = mulberry32(fnv1a(`${dressing.tilesTextureKey}:doorway-spill`));

  const spillSrc = buildDoorwaySpillTexture(scene, dressing);
  const spill = warpTextureToFloorQuad(scene, spillSrc, `${spillSrc}-band`, band, origin, 0);
  if (spill) {
    spill.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.46);
    scene.tweens.add({
      targets: spill,
      alpha: { from: 0.34, to: 0.56 },
      duration: 4200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    container.add(spill);
  }

  // Soft light spilling IN over the open threshold: each beam enters narrow at
  // the front edge and fans wider as it reaches across the floor INTO the room,
  // cast along the floor's inward axis (−mapY, i.e. up-and-to-the-right in
  // screen). This reads as daylight reaching in over the open sill from the
  // bottom edge — NOT a window shaft standing upright off it. Short and soft (no
  // bright core pool) so they stay under the window beams.
  const spanX = floor.x1 - floor.x0;
  const shaftCount = 5;
  for (let i = 0; i < shaftCount; i += 1) {
    const t = (i + 0.5) / shaftCount;
    const fx = floor.x0 + spanX * t + (rng() - 0.5) * 40;
    const source = projectToIso(fx, floor.y1 - 6, origin); // narrow, at the sill
    const reach = 170 + rng() * 130; // how far into the room the beam spills (map px)
    const drift = (rng() - 0.5) * 90; // slight along-edge fan of the inward end
    const land = projectToIso(fx + drift, floor.y1 - 6 - reach, origin); // wide, inward
    const wideHW = 30 + rng() * 16; // widening as it reaches into the room
    const narrowHW = 8 + rng() * 8; // narrow where it enters at the sill

    const shaft = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    shaft.fillStyle(0xffdf9c, 0.05);
    shaft.fillPoints(toPhaserPoints(beamTrapezoid(source, land, narrowHW * 1.5, wideHW * 1.4)), true);
    shaft.fillStyle(0xffe7b0, 0.08);
    shaft.fillPoints(toPhaserPoints(beamTrapezoid(source, land, narrowHW, wideHW)), true);
    shaft.fillStyle(0xfff1cf, 0.07);
    shaft.fillPoints(toPhaserPoints(beamTrapezoid(source, land, narrowHW * 0.5, wideHW * 0.55)), true);
    container.add(shaft);
    scene.tweens.add({
      targets: shaft,
      alpha: { from: 0.68, to: 1 },
      duration: 3400 + rng() * 1400,
      delay: rng() * 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // Motes drifting up off the threshold, brighter and more numerous than before.
  const moteKey = buildInteriorMoteTexture(scene, dressing);
  for (let i = 0; i < 7; i += 1) {
    const fx = floor.x0 + (floor.x1 - floor.x0) * (0.18 + rng() * 0.64);
    const fy = floor.y1 - 12 - rng() * 44;
    const point = projectToIso(fx, fy, origin);
    const mote = scene.add
      .image(point.x, point.y, moteKey)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.34 + rng() * 0.45)
      .setAlpha(0);
    container.add(mote);
    scene.tweens.add({
      targets: mote,
      y: point.y - (26 + rng() * 34),
      duration: 7000 + rng() * 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    scene.tweens.add({
      targets: mote,
      alpha: { from: 0.08, to: 0.3 + rng() * 0.16 },
      duration: 2200 + rng() * 1500,
      hold: 400 + rng() * 600,
      delay: rng() * 2500,
      repeatDelay: rng() * 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}

// A vertical warm gradient (transparent inward → gold at the edge) with soft
// horizontal end-fades so the band melts into the corners rather than hard-
// cutting. Warped onto the front-edge floor band by addDoorwayEdgeSpill.
function buildDoorwaySpillTexture(scene: Phaser.Scene, dressing: RoomDressing): string {
  const key = `${dressing.tilesTextureKey}-doorway-spill`;
  if (scene.textures.exists(key)) {
    return key;
  }

  const w = 256;
  const h = 96;
  const canvasTexture = scene.textures.createCanvas(key, w, h);
  if (!canvasTexture) {
    return key;
  }
  const ctx = canvasTexture.getContext();

  // Top of the texture maps to the inner edge (into the room), bottom to the
  // open front edge — so brighten toward the bottom.
  const vertical = ctx.createLinearGradient(0, 0, 0, h);
  vertical.addColorStop(0, 'rgba(255,221,154,0)');
  vertical.addColorStop(0.45, 'rgba(255,224,164,0.42)');
  vertical.addColorStop(1, 'rgba(255,238,196,1)');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, w, h);

  // Carve soft transparent margins at both ends.
  const ends = ctx.createLinearGradient(0, 0, w, 0);
  ends.addColorStop(0, 'rgba(0,0,0,1)');
  ends.addColorStop(0.14, 'rgba(0,0,0,0)');
  ends.addColorStop(0.86, 'rgba(0,0,0,0)');
  ends.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = ends;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  canvasTexture.refresh();
  return key;
}

function buildInteriorMoteTexture(scene: Phaser.Scene, dressing: RoomDressing): string {
  const key = `${dressing.tilesTextureKey}-interior-mote`;
  if (scene.textures.exists(key)) {
    return key;
  }

  const graphics = scene.make.graphics({}, false);
  graphics.fillStyle(0xfff2c8, 0.9);
  graphics.fillCircle(8, 8, 3);
  graphics.fillStyle(0xffe1a1, 0.35);
  graphics.fillCircle(8, 8, 7);
  graphics.generateTexture(key, 16, 16);
  graphics.destroy();

  return key;
}

function buildDoormatShimmerTexture(scene: Phaser.Scene, dressing: RoomDressing): string {
  const key = `${dressing.tilesTextureKey}-doormat-shimmer`;
  if (scene.textures.exists(key)) {
    return key;
  }

  const w = 48;
  const h = 72;
  const graphics = scene.make.graphics({}, false);
  const cx = w / 2;
  const cy = h / 2;
  const rings = 8;
  // Soft vertical gold streak: stacked translucent ellipses fake a blurred band.
  for (let i = rings; i >= 1; i -= 1) {
    const t = i / rings;
    graphics.fillStyle(0xfff3d0, 0.1);
    graphics.fillEllipse(cx, cy, w * t * 0.7, h * t);
  }
  graphics.generateTexture(key, w, h);
  graphics.destroy();

  return key;
}

/**
 * Renders `srcKey`'s texture warped onto the floor parallelogram of `rect`
 * (map space) — i.e. the exact iso projection of the rect — so the result lies
 * flat in the floor plane. `expand` inflates the rect (fraction of its size) for
 * a soft surrounding glow. Returns the placed image (origin top-left).
 */
function warpTextureToFloorQuad(
  scene: Phaser.Scene,
  srcKey: string,
  destKey: string,
  rect: PropColliderRect,
  origin: IsoOrigin,
  expand: number,
): Phaser.GameObjects.Image | undefined {
  const ex = rect.x - rect.width * expand;
  const ey = rect.y - rect.height * expand;
  const ew = rect.width * (1 + expand * 2);
  const eh = rect.height * (1 + expand * 2);

  // Floor-plane corners of the (expanded) rect.
  const p00 = projectToIso(ex, ey, origin);
  const p10 = projectToIso(ex + ew, ey, origin);
  const p01 = projectToIso(ex, ey + eh, origin);
  const p11 = projectToIso(ex + ew, ey + eh, origin);
  const corners = [p00, p10, p01, p11];
  const minX = Math.min(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxX = Math.max(...corners.map((c) => c.x));
  const maxY = Math.max(...corners.map((c) => c.y));

  const src = scene.textures.get(srcKey);
  const srcImage = src.getSourceImage() as CanvasImageSource;
  const srcFrame = src.get();
  const srcW = srcFrame.width;
  const srcH = srcFrame.height;

  const canvasW = Math.max(1, Math.ceil(maxX - minX));
  const canvasH = Math.max(1, Math.ceil(maxY - minY));

  if (!scene.textures.exists(destKey)) {
    const canvasTexture = scene.textures.createCanvas(destKey, canvasW, canvasH);
    if (!canvasTexture) {
      return undefined;
    }
    const ctx = canvasTexture.getContext();
    // Map texture space [0,srcW]x[0,srcH] onto the parallelogram (local coords):
    //   local = (p00 - min) + (sx/srcW)*A + (sy/srcH)*B
    // with A = p10 - p00 (map +x edge), B = p01 - p00 (map +y edge).
    const ax = (p10.x - p00.x) / srcW;
    const ay = (p10.y - p00.y) / srcW;
    const bx = (p01.x - p00.x) / srcH;
    const by = (p01.y - p00.y) / srcH;
    ctx.setTransform(ax, ay, bx, by, p00.x - minX, p00.y - minY);
    ctx.drawImage(srcImage, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    canvasTexture.refresh();
  }

  const center = projectToIso(ex + ew / 2, ey + eh / 2, origin);
  return scene.add.image(center.x, center.y, destKey).setOrigin(
    (center.x - minX) / canvasW,
    (center.y - minY) / canvasH,
  );
}

function buildDoormatTexture(scene: Phaser.Scene, dressing: RoomDressing): string {
  // File-first: a dropped-in doormat PNG (probed + loaded in BootScene) replaces
  // the procedural weave as the warp source, using the same warp + glow + shimmer
  // pipeline. Falls back to the procedural texture when absent.
  if (scene.textures.exists(DOORMAT_DROP_KEY)) {
    return DOORMAT_DROP_KEY;
  }

  const key = `${dressing.tilesTextureKey}-doormat`;

  if (scene.textures.exists(key)) {
    return key;
  }

  const w = 132;
  const h = 76;
  const radius = 20;
  const graphics = scene.make.graphics({}, false);

  // Dark wicker border, then the warm mat body, then a lighter inner panel.
  graphics.fillStyle(0x4a3324, 1);
  graphics.fillRoundedRect(0, 0, w, h, radius);
  graphics.fillStyle(0x8a6a4f, 1);
  graphics.fillRoundedRect(5, 5, w - 10, h - 10, radius - 5);
  graphics.fillStyle(0xb0865a, 1);
  graphics.fillRoundedRect(14, 14, w - 28, h - 28, radius - 10);

  // Woven cross-hatch for a wicker/doormat read.
  graphics.lineStyle(2, 0x6f5237, 0.55);
  for (let x = 18; x < w - 14; x += 9) {
    graphics.lineBetween(x, 16, x, h - 16);
  }
  graphics.lineStyle(2, 0x6f5237, 0.35);
  for (let y = 18; y < h - 14; y += 9) {
    graphics.lineBetween(16, y, w - 16, y);
  }

  graphics.generateTexture(key, w, h);
  graphics.destroy();

  return key;
}

function buildDoormatGlowTexture(scene: Phaser.Scene, dressing: RoomDressing): string {
  const key = `${dressing.tilesTextureKey}-doormat-glow`;

  if (scene.textures.exists(key)) {
    return key;
  }

  const w = 180;
  const h = 108;
  const graphics = scene.make.graphics({}, false);
  const cx = w / 2;
  const cy = h / 2;
  const rings = 10;

  // Stacked translucent ellipses fake a soft radial falloff (no blur in canvas).
  for (let i = rings; i >= 1; i -= 1) {
    const t = i / rings;
    graphics.fillStyle(0xffca74, 0.08);
    graphics.fillEllipse(cx, cy, w * t, h * t);
  }

  graphics.generateTexture(key, w, h);
  graphics.destroy();

  return key;
}

function registerPropFrames(scene: Phaser.Scene, dressing: RoomDressing): void {
  const texture = scene.textures.get(dressing.propsTextureKey);

  for (const [name, frame] of Object.entries(dressing.frames)) {
    if (!texture.has(name)) {
      texture.add(name, 0, frame.x, frame.y, frame.w, frame.h);
    }
  }
}

function renderFloor(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  diamond: readonly IsoPoint[],
): Phaser.GameObjects.TileSprite {
  const xs = diamond.map((point) => point.x);
  const ys = diamond.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;

  const floor = scene.add
    .tileSprite(minX, minY, width, height, dressing.tilesTextureKey, dressing.floorFrame)
    .setOrigin(0, 0)
    .setDepth(FLOOR_DEPTH);

  const maskShape = scene.make.graphics({}, false);
  maskShape.fillStyle(0xffffff, 1);
  maskShape.fillPoints(toPhaserPoints(diamond), true);
  floor.setMask(maskShape.createGeometryMask());

  return floor;
}

// Two rear walls rise from the back-left (left->top) and back-right (top->right)
// floor edges, meeting at the top corner. The front edges stay open (viewer
// side) so we see into the room, just like the dev backdrop's side faces.
//
// Each wall is a parallelogram whose base follows the sloped floor edge. A
// TileSprite cannot shear its pattern, so we pre-compose each wall into a
// canvas texture with a shear transform: the tile rows (and the baseboard at
// the bottom of the wall tile) then run parallel to the floor edge.
function renderWalls(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  top: IsoPoint,
  right: IsoPoint,
  left: IsoPoint,
): Phaser.GameObjects.Image[] {
  const leftKey = `${dressing.tilesTextureKey}-wall-left`;
  const rightKey = `${dressing.tilesTextureKey}-wall-right`;
  const leftSlope = (top.y - left.y) / (top.x - left.x);
  const rightSlope = (right.y - top.y) / (right.x - top.x);

  buildShearedWallTexture(scene, dressing, leftKey, top.x - left.x, leftSlope);
  buildShearedWallTexture(scene, dressing, rightKey, right.x - top.x, rightSlope);

  return [
    scene.add
      .image(left.x, top.y - dressing.wallHeight, leftKey)
      .setOrigin(0, 0)
      .setDepth(WALL_DEPTH),
    scene.add
      .image(top.x, top.y - dressing.wallHeight, rightKey)
      .setOrigin(0, 0)
      .setDepth(WALL_DEPTH),
  ];
}

function buildShearedWallTexture(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  key: string,
  runLength: number,
  slope: number,
): void {
  if (scene.textures.exists(key)) {
    return;
  }

  const frame = scene.textures.getFrame(dressing.tilesTextureKey, dressing.wallFrame);
  const source = frame.source.image as CanvasImageSource;
  const tile = frame.width;
  const bandHeight = dressing.wallHeight;
  const drop = Math.abs(slope) * runLength;
  const canvasTexture = scene.textures.createCanvas(
    key,
    Math.ceil(runLength),
    Math.ceil(bandHeight + drop),
  );

  if (!canvasTexture) {
    return;
  }

  const ctx = canvasTexture.getContext();
  // Shear so a column drawn at x is shifted vertically to follow the floor
  // edge; the vertical offset keeps the band inside the canvas for down-left
  // slopes (the left wall descends toward x=0).
  ctx.setTransform(1, slope, 0, 1, 0, slope < 0 ? drop : 0);

  // How much of the tile's top is plain material (above the baseboard strip);
  // upper filler rows stretch this region so the baseboard appears only once.
  const plainHeight = Math.max(1, Math.round(tile * 0.7));

  for (let x = 0; x < runLength; x += tile) {
    // Bottom row: full tile, baseboard resting on the floor edge.
    ctx.drawImage(
      source,
      frame.cutX,
      frame.cutY,
      tile,
      tile,
      x,
      bandHeight - tile,
      tile,
      tile,
    );

    // Fill upward with the plain top part of the tile.
    for (let y = bandHeight - tile; y > 0; y -= tile) {
      const rowHeight = Math.min(tile, y);
      ctx.drawImage(
        source,
        frame.cutX,
        frame.cutY,
        tile,
        plainHeight,
        x,
        y - rowHeight,
        tile,
        rowHeight,
      );
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  canvasTexture.refresh();
}

// A thin darker skirt under the two front floor edges to sell floor thickness,
// mirroring the dev backdrop's side faces.
function renderFloorSkirt(
  scene: Phaser.Scene,
  left: IsoPoint,
  bottom: IsoPoint,
  right: IsoPoint,
): Phaser.GameObjects.Graphics[] {
  const depth = 18;
  const graphics = scene.add.graphics().setDepth(FLOOR_SKIRT_DEPTH);

  graphics.fillStyle(0x3a2a1c, 1);
  graphics.fillPoints(
    toPhaserPoints([
      left,
      bottom,
      { x: bottom.x, y: bottom.y + depth },
      { x: left.x, y: left.y + depth },
    ]),
    true,
  );
  graphics.fillStyle(0x2e2116, 1);
  graphics.fillPoints(
    toPhaserPoints([
      bottom,
      right,
      { x: right.x, y: right.y + depth },
      { x: bottom.x, y: bottom.y + depth },
    ]),
    true,
  );

  return [graphics];
}

function renderProps(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  origin: IsoOrigin,
  propDepthOverrides: Readonly<Record<string, number>>,
): PropHandle[] {
  const handles: PropHandle[] = [];
  for (const placement of dressing.props) {
    const image = renderProp(scene, dressing, placement, origin, propDepthOverrides[placement.frame]);
    // A singles-only prop whose standalone art is absent renders nothing (and so
    // never enters propHandles / the dressEdit list).
    if (image) {
      handles.push({ placement, image });
    }
  }
  return handles;
}

function renderProp(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  placement: PropPlacement,
  origin: IsoOrigin,
  depthOverride?: number,
): Phaser.GameObjects.Image | undefined {
  const overrideKey = propOverrideTextureKey(dressing.locationId, placement.frame);
  const hasOverride = scene.textures.exists(overrideKey);
  const hasSheetCrop = dressing.frames[placement.frame] !== undefined;

  // Singles-only prop with no drop-in file: nothing to draw.
  if (!hasSheetCrop && !hasOverride) {
    return undefined;
  }

  // Origin/flip are placement-fixed; position, scale, texture and depth are
  // applied by positionPropImage so the dressEdit editor can re-run the exact
  // same transform when a prop is dragged or resized. Create against whichever
  // source will be used so positionPropImage never has to swap textures.
  const image = scene.add
    .image(
      0,
      0,
      hasOverride ? overrideKey : dressing.propsTextureKey,
      hasOverride ? undefined : placement.frame,
    )
    .setOrigin(placement.originX ?? 0.5, placement.originY ?? 1)
    .setFlipX(placement.flipX ?? false);

  positionPropImage(scene, dressing, placement, image, origin, depthOverride);

  return image;
}

/**
 * Applies a placement's position, scale, (sheared) texture and depth to an
 * already-created prop billboard. The single source of truth for where a
 * dressed prop lands, shared by the renderer and the dev dressEdit editor (which
 * calls it every frame while dragging/resizing so the live image tracks the
 * edited mapX/mapY/heightRatio).
 */
export function positionPropImage(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  placement: PropPlacement,
  image: Phaser.GameObjects.Image,
  origin: IsoOrigin,
  depthOverride?: number,
): void {
  const point = projectToIso(placement.mapX, placement.mapY, origin);

  // A standalone override (or singles-only) prop draws from its own full-frame
  // texture; otherwise the prop's crop on the room sheet. Sizing/anchor/depth
  // math is identical either way — only the effective source width/height differ.
  const overrideKey = propOverrideTextureKey(dressing.locationId, placement.frame);
  const hasOverride = scene.textures.exists(overrideKey);
  const sheetCrop = dressing.frames[placement.frame];
  const overrideFrame = hasOverride ? scene.textures.getFrame(overrideKey) : undefined;
  const srcW = overrideFrame?.width ?? sheetCrop?.w ?? 1;
  const srcH = overrideFrame?.height ?? sheetCrop?.h ?? 1;

  const scale = resolvePropScale(placement, srcH);
  let textureKey = hasOverride ? overrideKey : dressing.propsTextureKey;
  let frameName: string | undefined = hasOverride ? undefined : placement.frame;
  let screenY = point.y - (placement.screenYRaise ?? 0);

  if (placement.wallShear) {
    // Wall-hung props shear to follow the sloped wall band. The sheared
    // content's bottom-center sits |slope|*w/2 above the canvas bottom, so
    // compensate to keep the configured raise measured from the wall base.
    const sourceKey = hasOverride ? overrideKey : dressing.propsTextureKey;
    const sourceFrame = hasOverride ? undefined : placement.frame;
    const shearedKey = buildShearedPropTexture(scene, placement.wallShear, sourceKey, sourceFrame);

    if (shearedKey !== sourceKey) {
      textureKey = shearedKey;
      frameName = undefined;
      screenY += (scale * Math.abs(placement.wallShear) * srcW) / 2;
    }
  }

  image.setTexture(textureKey, frameName);
  image.setPosition(point.x, screenY);
  image.setScale(scale);

  // Depth-sort by the prop's floor-contact line. A depthMapY override (from the
  // zones JSON or the placement) moves that line off the anchor so the player
  // can pass behind visually tall props.
  const depthMapY = depthOverride ?? placement.depthMapY ?? placement.mapY;
  const depthY = projectToIso(placement.mapX, depthMapY, origin).y;
  image.setDepth(placement.fixedDepth ?? depthY);
}

/**
 * Sizes a prop against the player yardstick: heightRatio (a multiple of the
 * player's on-screen height) is converted to a sprite scale from the frame's
 * height, so props read at a consistent size relative to ____ regardless of
 * their sheet crop. Flat/wall props fall back to an explicit `scale`.
 */
function resolvePropScale(placement: PropPlacement, frameHeight: number): number {
  if (placement.heightRatio !== undefined) {
    return (PLAYER_VISUAL_HEIGHT_PX * placement.heightRatio) / frameHeight;
  }

  return placement.scale ?? 1;
}

// Pre-shears a prop's art onto a canvas following a wall slope. Works from any
// source texture + frame (the room sheet crop, or a standalone override's full
// frame), keyed on both so the sheet and override variants never collide.
function buildShearedPropTexture(
  scene: Phaser.Scene,
  slope: number,
  sourceKey: string,
  sourceFrame: string | undefined,
): string {
  const key = `${sourceKey}-${sourceFrame ?? 'full'}-sheared`;

  if (scene.textures.exists(key)) {
    return key;
  }

  const frame = scene.textures.getFrame(sourceKey, sourceFrame);
  const source = frame.source.image as CanvasImageSource;
  const drop = Math.abs(slope) * frame.width;
  const canvasTexture = scene.textures.createCanvas(
    key,
    frame.width,
    Math.ceil(frame.height + drop),
  );

  if (!canvasTexture) {
    return sourceKey;
  }

  const ctx = canvasTexture.getContext();
  ctx.setTransform(1, slope, 0, 1, 0, slope < 0 ? drop : 0);
  ctx.drawImage(
    source,
    frame.cutX,
    frame.cutY,
    frame.width,
    frame.height,
    0,
    0,
    frame.width,
    frame.height,
  );
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  canvasTexture.refresh();

  return key;
}

function toPhaserPoints(points: readonly IsoPoint[]): Phaser.Geom.Point[] {
  return points.map((point) => new Phaser.Geom.Point(point.x, point.y));
}
