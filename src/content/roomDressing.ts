// Data-driven room dressing. When a location has an entry here, LocationScene
// renders a tiled floor, back-wall band, and positioned props instead of the
// procedural dev checkerboard. Other locations keep the dev backdrop.
//
// Coordinate note: prop anchors are given in *map* (orthogonal Tiled) pixel
// coordinates. LocationScene projects them into its faked 2.5D screen space via
// projectToIso, so a prop anchored at a map point lands exactly where the same
// map point projects for the player and the interactable rects.

export interface PropFrame {
  /** Source crop on the prop sheet, in sheet pixels. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Floor footprint of a prop, in *map* pixels. Describes the rectangle the prop
 * actually occupies on the ground (NOT its full billboard height): `w` runs
 * along map-x, `d` (depth) along map-y. The rectangle is anchored under the
 * prop's placement anchor and extends back (north, toward smaller map-y) from
 * it, since the anchor is the sprite's front-center floor-contact point.
 *
 * Drives the static collider so the player is blocked at the prop's base but
 * can still pass behind tall props. For interactable-linked props, derive `w`/
 * `d` from the interact rect (e.g. recipient-bed is 180x150); for pure dressing,
 * use sensible values a touch smaller than the art so prompts stay reachable.
 */
export interface PropFootprint {
  readonly w: number;
  readonly d: number;
}

export interface PropPlacement {
  /** Named frame in RoomDressing.frames. */
  readonly frame: string;
  /** Anchor point in map coordinates (projected to screen for placement). */
  readonly mapX: number;
  readonly mapY: number;
  /**
   * Target on-screen display height as a multiple of the player visual's
   * display height (the yardstick), following cozy-RPG canon (Stardew): bed
   * ~2x, desk ~1.0-1.2x (plus monitor/lamp/chair headroom for the cluster),
   * chair ~0.8x, table ~0.9x, plants ~0.6-1.2x, shelf ~1.0x. The renderer
   * converts this to a sprite scale from the frame height, so props read at a
   * consistent size relative to the player regardless of their sheet crop.
   * Prefer this over `scale` for floor-standing props; `scale` still works for
   * flat/wall props (rug, window, photo wall) where height is not the measure.
   */
  readonly heightRatio?: number;
  /** Floor footprint for a static collider. Omit for flat/wall/pass-through props. */
  readonly footprint?: PropFootprint;
  /**
   * Shift the collider rect south (+, toward the viewer) in map px from its
   * default position (extending back from the anchor). Used for the desk, whose
   * base sits under the spawn point: the collider is pushed to the chair in
   * front so the player is never trapped at spawn but still can't walk through.
   */
  readonly colliderOffsetY?: number;
  /** Shift the collider rect east (+) / west (-) in map px. */
  readonly colliderOffsetX?: number;
  readonly scale?: number;
  /** Sprite origin; defaults to bottom-center so props stand on the floor. */
  readonly originX?: number;
  readonly originY?: number;
  readonly flipX?: boolean;
  /** Lift the sprite up the screen (negative Y) after projection, in px. */
  readonly screenYRaise?: number;
  /**
   * Vertical shear slope for wall-hung props so they follow the sloped wall
   * band (use the wall's screen slope: +0.5 back-right wall, -0.5 back-left).
   */
  readonly wallShear?: number;
  /**
   * Fixed render depth. Omit for floor-standing props, which depth-sort against
   * the player by their projected screen Y (so the player can pass in front of
   * or behind them). Use a small negative value for flat/rug/wall-mounted items.
   */
  readonly fixedDepth?: number;
  /** Optional label for maintainers; not rendered. */
  readonly note?: string;
}

export interface RoomDressing {
  /** Spritesheet key holding the two 64x64 tiles (frame 0 floor, 1 wall). */
  readonly tilesTextureKey: string;
  readonly floorFrame: number;
  readonly wallFrame: number;
  /** Image key holding the prop sheet. */
  readonly propsTextureKey: string;
  readonly frames: Readonly<Record<string, PropFrame>>;
  /** Border tiles (all wall) to skip when laying the floor region. */
  readonly floorInsetTiles: number;
  /** Height in screen px of the back-wall band rising from the floor edge. */
  readonly wallHeight: number;
  /** CSS color for the void behind the room. */
  readonly backgroundColor: string;
  readonly props: readonly PropPlacement[];
}

// Prop crops measured as tight alpha bounding boxes on the 1024x1024 sheet.
const RECIPIENT_PROP_FRAMES = {
  bed: { x: 27, y: 60, w: 283, h: 399 },
  desk: { x: 353, y: 71, w: 340, h: 352 },
  violin: { x: 725, y: 74, w: 120, h: 301 },
  musicStand: { x: 840, y: 104, w: 135, h: 271 },
  playbills: { x: 34, y: 500, w: 284, h: 174 },
  camera: { x: 389, y: 466, w: 116, h: 235 },
  photoWall: { x: 586, y: 445, w: 358, h: 228 },
  kitchen: { x: 26, y: 728, w: 219, h: 217 },
  rug: { x: 250, y: 782, w: 295, h: 143 },
  monstera: { x: 542, y: 719, w: 140, h: 219 },
  pothos: { x: 684, y: 720, w: 131, h: 229 },
  window: { x: 814, y: 710, w: 161, h: 240 },
} as const satisfies Record<string, PropFrame>;

const RECIPIENT_HOUSE_DRESSING: RoomDressing = {
  tilesTextureKey: 'recipient-room-tiles',
  floorFrame: 0,
  wallFrame: 1,
  propsTextureKey: 'recipient-room-props',
  frames: RECIPIENT_PROP_FRAMES,
  floorInsetTiles: 1,
  wallHeight: 144,
  backgroundColor: '#171015',
  props: [
    // --- Non-interactable dressing (drawn first / lowest) ---
    // Rug centered on the floor; flat, so the player walks over it. Stays broad
    // and flat (sized by scale, not height ratio); no collider.
    {
      frame: 'rug',
      mapX: 704,
      mapY: 512,
      scale: 0.82,
      originX: 0.5,
      originY: 0.5,
      fixedDepth: -30,
      note: 'round rug, room center',
    },
    // Window hung on the back-left wall, above the bed corner.
    {
      frame: 'window',
      mapX: 64,
      mapY: 640,
      scale: 0.52,
      originX: 0.5,
      originY: 1,
      screenYRaise: 14,
      wallShear: -0.5,
      fixedDepth: -22,
      note: 'window on the back-left wall (light source)',
    },
    // Potted plants tucked in the corners.
    {
      frame: 'monstera',
      mapX: 170,
      mapY: 170,
      heightRatio: 1.2,
      footprint: { w: 64, d: 48 },
      note: 'monstera, top corner where the walls meet',
    },
    {
      frame: 'pothos',
      mapX: 200,
      mapY: 860,
      heightRatio: 0.95,
      footprint: { w: 64, d: 48 },
      note: 'pothos in urn, left corner',
    },

    // --- Interactable-linked props (anchored to their map rects) ---
    // recipient-bed rect: 300,600 180x150 -> center 390,675
    {
      frame: 'bed',
      mapX: 372,
      mapY: 688,
      heightRatio: 2.0,
      footprint: { w: 168, d: 108 },
      note: 'bed -> recipient-bed',
    },
    // recipient-violin rect: 240,300 160x140 -> center 320,370
    {
      frame: 'violin',
      mapX: 296,
      mapY: 392,
      heightRatio: 1.15,
      note: 'violin on stand -> recipient-violin (thin; no collider)',
    },
    {
      frame: 'musicStand',
      mapX: 392,
      mapY: 388,
      heightRatio: 1.0,
      note: 'sheet-music stand (dressing beside violin; no collider)',
    },
    // recipient-playbills rect: 560,280 160x140 -> center 640,350
    {
      frame: 'playbills',
      mapX: 640,
      mapY: 372,
      heightRatio: 1.0,
      footprint: { w: 150, d: 36 },
      note: 'playbill shelf -> recipient-playbills',
    },
    // recipient-mango-rice rect: 960,300 160x140 -> center 1040,370
    {
      frame: 'kitchen',
      mapX: 1040,
      mapY: 392,
      heightRatio: 1.0,
      footprint: { w: 120, d: 64 },
      note: 'kitchenette table w/ mango sticky rice -> recipient-mango-rice',
    },
    // recipient-photo-wall rect: 1080,64 160x140 -> center 1160,134; the frame
    // cluster hangs on the back-right wall band above the rect.
    {
      frame: 'photoWall',
      mapX: 1140,
      mapY: 64,
      scale: 0.55,
      screenYRaise: 12,
      wallShear: 0.5,
      fixedDepth: -21,
      note: 'photo-wall cluster + empty frame -> recipient-photo-wall',
    },
    {
      frame: 'camera',
      mapX: 1240,
      mapY: 250,
      heightRatio: 1.3,
      note: 'camera on tripod (dressing under the photo wall; thin, no collider)',
    },
    // recipient-pc rect: 624,720 160x140 -> center 704,790. Spawn sits at 704,768
    // (just north of the desk base) so the collider is shallow and pushed south
    // of spawn: the player stands at spawn to use the PC, never trapped.
    {
      frame: 'desk',
      mapX: 704,
      mapY: 812,
      heightRatio: 1.55,
      // The desk base sits between the spawn and the exit doormat (both at map
      // x~704). Keep a compact collider under the chair/left of the desk, nudged
      // west and south of the spawn, so the player can't walk through the desk
      // yet the natural south-front approach to the doormat stays open and the
      // spawn is never trapped.
      footprint: { w: 54, d: 30 },
      colliderOffsetY: 46,
      colliderOffsetX: -34,
      note: 'desk + PC + chair -> recipient-pc',
    },
  ],
};

const ROOM_DRESSINGS: Readonly<Record<string, RoomDressing>> = {
  'recipient-house': RECIPIENT_HOUSE_DRESSING,
};

export function getRoomDressing(locationId: string): RoomDressing | undefined {
  return ROOM_DRESSINGS[locationId];
}

/** Axis-aligned collider footprint in *map* pixels (top-left origin). */
export interface PropColliderRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Static floor colliders for the dressing's solid props (those with a
 * footprint). Each rect extends back (north) from the anchor's front-center
 * floor point, then shifts by colliderOffsetX/Y, so the player is blocked at a
 * prop's base but can still pass behind it. Flat/wall/pass-through props (no
 * footprint) contribute nothing.
 */
export function getPropColliders(dressing: RoomDressing): PropColliderRect[] {
  const rects: PropColliderRect[] = [];

  for (const placement of dressing.props) {
    const { footprint } = placement;
    if (!footprint) {
      continue;
    }

    rects.push({
      x: placement.mapX - footprint.w / 2 + (placement.colliderOffsetX ?? 0),
      y: placement.mapY - footprint.d + (placement.colliderOffsetY ?? 0),
      width: footprint.w,
      height: footprint.d,
    });
  }

  return rects;
}
