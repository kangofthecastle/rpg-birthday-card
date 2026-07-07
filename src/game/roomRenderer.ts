import Phaser from 'phaser';
import { RECIPIENT_SPRITE } from '../assets/recipientSpriteConfig';
import { projectToIso, type IsoOrigin, type IsoPoint } from './isometricProjection';
import {
  getPropColliders,
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

// The player yardstick: how tall ____'s sprite actually reads on screen. Her
// 256px frame is drawn at RECIPIENT_SPRITE.scale, and the visible character fills
// ~0.88 of that frame height (measured in-scene: ~102px of the 115px frame).
// Prop heightRatios are multiples of this, so props stay sized to the player.
const RECIPIENT_VISIBLE_FRACTION = 0.88;
const PLAYER_VISUAL_HEIGHT_PX =
  RECIPIENT_SPRITE.frameHeight * RECIPIENT_SPRITE.scale * RECIPIENT_VISIBLE_FRACTION;

export interface RoomRenderResult {
  readonly objects: readonly Phaser.GameObjects.GameObject[];
  /** Floor colliders for solid props, in map coordinates. */
  readonly colliders: readonly PropColliderRect[];
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
  objects.push(...renderProps(scene, dressing, origin));

  return { objects, colliders: getPropColliders(dressing) };
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
  const matKey = buildDoormatTexture(scene, dressing);
  const glowKey = buildDoormatGlowTexture(scene, dressing);

  const center = projectToIso(exit.x + exit.width / 2, exit.y + exit.height / 2, origin);
  const verticalScale = origin.verticalScale ?? 0.5;
  const span = exit.width + exit.height;
  const projWidth = span / 2;
  const projHeight = (span * verticalScale) / 2;

  const glow = scene.add
    .image(center.x, center.y, glowKey)
    .setOrigin(0.5, 0.5)
    .setDepth(DOORMAT_GLOW_DEPTH)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDisplaySize(projWidth * 2.6, projHeight * 2.6);
  glow.setAlpha(0.7);

  scene.tweens.add({
    targets: glow,
    alpha: { from: 0.45, to: 0.95 },
    scaleX: { from: glow.scaleX * 0.88, to: glow.scaleX * 1.12 },
    scaleY: { from: glow.scaleY * 0.88, to: glow.scaleY * 1.12 },
    duration: 1100,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  const mat = scene.add
    .image(center.x, center.y, matKey)
    .setOrigin(0.5, 0.5)
    .setDepth(DOORMAT_DEPTH)
    .setDisplaySize(projWidth * 1.06, projHeight * 1.12);

  return { objects: [glow, mat], colliders: [] };
}

function buildDoormatTexture(scene: Phaser.Scene, dressing: RoomDressing): string {
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
): Phaser.GameObjects.Image[] {
  return dressing.props.map((placement) => renderProp(scene, dressing, placement, origin));
}

function renderProp(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  placement: PropPlacement,
  origin: IsoOrigin,
): Phaser.GameObjects.Image {
  const point = projectToIso(placement.mapX, placement.mapY, origin);
  const scale = resolvePropScale(dressing, placement);
  let textureKey = dressing.propsTextureKey;
  let frameName: string | undefined = placement.frame;
  let screenY = point.y - (placement.screenYRaise ?? 0);

  if (placement.wallShear) {
    // Wall-hung props shear to follow the sloped wall band. The sheared
    // content's bottom-center sits |slope|*w/2 above the canvas bottom, so
    // compensate to keep the configured raise measured from the wall base.
    const frame = dressing.frames[placement.frame];
    textureKey = buildShearedPropTexture(scene, dressing, placement.frame, placement.wallShear);

    if (textureKey !== dressing.propsTextureKey) {
      frameName = undefined;
      screenY += (scale * Math.abs(placement.wallShear) * frame.w) / 2;
    }
  }

  const image = scene.add
    .image(point.x, screenY, textureKey, frameName)
    .setOrigin(placement.originX ?? 0.5, placement.originY ?? 1)
    .setScale(scale)
    .setFlipX(placement.flipX ?? false);

  image.setDepth(placement.fixedDepth ?? point.y);

  return image;
}

/**
 * Sizes a prop against the player yardstick: heightRatio (a multiple of the
 * player's on-screen height) is converted to a sprite scale from the frame's
 * height, so props read at a consistent size relative to ____ regardless of
 * their sheet crop. Flat/wall props fall back to an explicit `scale`.
 */
function resolvePropScale(dressing: RoomDressing, placement: PropPlacement): number {
  if (placement.heightRatio !== undefined) {
    const frame = dressing.frames[placement.frame];
    return (PLAYER_VISUAL_HEIGHT_PX * placement.heightRatio) / frame.h;
  }

  return placement.scale ?? 1;
}

function buildShearedPropTexture(
  scene: Phaser.Scene,
  dressing: RoomDressing,
  frameName: string,
  slope: number,
): string {
  const key = `${dressing.propsTextureKey}-${frameName}-sheared`;

  if (scene.textures.exists(key)) {
    return key;
  }

  const frame = scene.textures.getFrame(dressing.propsTextureKey, frameName);
  const source = frame.source.image as CanvasImageSource;
  const drop = Math.abs(slope) * frame.width;
  const canvasTexture = scene.textures.createCanvas(
    key,
    frame.width,
    Math.ceil(frame.height + drop),
  );

  if (!canvasTexture) {
    return dressing.propsTextureKey;
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
