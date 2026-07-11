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
  /**
   * Depth-sort line override: sort this prop as if its floor-contact point were
   * at map-y = depthMapY (keeping its own map-x) instead of its anchor mapY.
   * Lets the player pass behind a visually tall prop whose base reads lower than
   * its anchor. Usually sourced from the zones JSON `propDepthOverrides`.
   */
  readonly depthMapY?: number;
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

// Prop crops measured as tight alpha bounding boxes (alpha>=16) on the
// 1024x1024 sheet. Several were re-measured to stop cropping through the art:
// the earlier rug/kitchen/violin/musicStand/photoWall/window rects ended mid-
// sprite (fringe, table legs, sheet-music page, hanging hook, window frame) and
// rendered a hard straight cut.
//
// The violin frame (725..848) once contained a bow leaning diagonally across
// the right side, whose frog tail spilled into the music stand's frame columns
// (849..865, below the paper). The bow was removed by scrubbing its pixels to
// transparent directly on the sheet (canvas surgery; the sheet is git-tracked,
// so history holds the original with-bow art) — NOT by shrinking the frame rect,
// so the violin body keeps its exact on-screen size and floor position and the
// heightRatio compensation below is unchanged. The stand still owns 849..997 for
// its full right page.
const RECIPIENT_PROP_FRAMES = {
  bed: { x: 27, y: 60, w: 283, h: 399 },
  desk: { x: 353, y: 71, w: 340, h: 352 },
  violin: { x: 725, y: 74, w: 124, h: 306 },
  musicStand: { x: 849, y: 104, w: 149, h: 271 },
  camera: { x: 389, y: 466, w: 116, h: 235 },
  photoWall: { x: 586, y: 433, w: 358, h: 240 },
  kitchen: { x: 26, y: 728, w: 227, h: 237 },
  rug: { x: 266, y: 782, w: 253, h: 161 },
  monstera: { x: 542, y: 719, w: 140, h: 219 },
  pothos: { x: 684, y: 720, w: 131, h: 229 },
  window: { x: 814, y: 709, w: 171, h: 243 },
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
    // Windows hung on the back-left (west) wall. Each is a light source: the
    // awakening renders a beam set streaming into the room from every 'window'
    // placement. Wall decor only — no footprint/collider, fixedDepth behind the
    // billboards. Both use the west wall's shear -0.5. (A back-right/north wall
    // window was tried at mapX 620 / shear +0.5 but never read right on that
    // wall despite correct shear math, so it was removed.)
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
      note: 'window on the back-left wall, low (above the bed corner)',
    },
    {
      frame: 'window',
      mapX: 64,
      mapY: 360,
      scale: 0.52,
      originX: 0.5,
      originY: 1,
      screenYRaise: 14,
      wallShear: -0.5,
      fixedDepth: -22,
      note: 'window on the back-left wall, high (between the corner plant and bed)',
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
      // Frame height is 306 (grew 301->306 in a prior audit when the violin
      // stand's feet were restored); hr scales from frame height, so it stays
      // 1.169 (1.15 * 306/301). Removing the bow pixels did not change the frame
      // rect, so the on-screen size/position is unchanged.
      heightRatio: 1.169,
      note: 'violin on stand -> recipient-violin (thin; no collider; bow removed)',
    },
    {
      frame: 'musicStand',
      mapX: 392,
      mapY: 388,
      heightRatio: 1.0,
      note: 'sheet-music stand (dressing beside violin; no collider)',
    },
    // recipient-mango-rice rect: 960,300 160x140 -> center 1040,370
    {
      frame: 'kitchen',
      mapX: 1040,
      mapY: 392,
      // Frame height grew 217->237 when the cut-off table legs were restored;
      // scale hr by 237/217 so the table renders the same size (1.0 * 237/217).
      heightRatio: 1.092,
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

// ____'s room (location `friend-a`): calm seafoam/teal. Crops are tight alpha
// bounding boxes measured on friendone-room-props.png (1024x1024, alpha>=16) via a
// connected-component scan. The hockey stick crop includes the puck below it,
// and the poster cluster crop spans the five taped prints as one hanging wall
// piece. Placement anchors follow friend-a.tmj: the desk sits on the friendone-pc
// (fishing) activity rect (768,384 128x96 -> center 832,432) and the tea table
// sits on the friendone-host dialogue rect (512,384 -> center 576,432), so the
// furniture matches where the player already interacts.
const FRIEND_ONE_PROP_FRAMES = {
  bed: { x: 5, y: 32, w: 320, h: 369 },
  desk: { x: 359, y: 53, w: 346, h: 342 },
  gachaShelf: { x: 733, y: 57, w: 261, h: 273 },
  hockeyStick: { x: 614, y: 352, w: 160, h: 355 },
  posterCluster: { x: 176, y: 426, w: 248, h: 253 },
  jersey: { x: 470, y: 402, w: 197, h: 259 },
  fishbowl: { x: 821, y: 376, w: 166, h: 149 },
  lightstick: { x: 50, y: 444, w: 79, h: 209 },
  hangingPlant: { x: 817, y: 549, w: 154, h: 243 },
  teaTable: { x: 203, y: 728, w: 220, h: 228 },
  cushion: { x: 0, y: 823, w: 191, h: 128 },
  rug: { x: 456, y: 777, w: 265, h: 192 },
  window: { x: 743, y: 811, w: 262, h: 200 },
} as const satisfies Record<string, PropFrame>;

const FRIEND_ONE_HOUSE_DRESSING: RoomDressing = {
  tilesTextureKey: 'friendone-room-tiles',
  floorFrame: 0,
  wallFrame: 1,
  propsTextureKey: 'friendone-room-props',
  frames: FRIEND_ONE_PROP_FRAMES,
  floorInsetTiles: 1,
  wallHeight: 144,
  backgroundColor: '#0d1a1c',
  props: [
    // --- Flat / wall dressing (drawn behind the billboards) ---
    {
      frame: 'rug',
      mapX: 704,
      mapY: 560,
      scale: 0.78,
      originX: 0.5,
      originY: 0.5,
      fixedDepth: -30,
      note: 'braided seafoam rug, room center',
    },
    // Windows with curtains on the back-left (west) wall; each casts a light beam.
    {
      frame: 'window',
      mapX: 64,
      mapY: 380,
      scale: 0.58,
      originX: 0.5,
      originY: 1,
      screenYRaise: 14,
      wallShear: -0.5,
      fixedDepth: -22,
      note: 'curtained window, west wall high',
    },
    {
      frame: 'window',
      mapX: 64,
      mapY: 640,
      scale: 0.58,
      originX: 0.5,
      originY: 1,
      screenYRaise: 14,
      wallShear: -0.5,
      fixedDepth: -22,
      note: 'curtained window, west wall low (above the bed)',
    },
    // Hockey jersey on a hook + poster cluster hung on the back-right (north) wall.
    {
      frame: 'jersey',
      mapX: 360,
      mapY: 64,
      scale: 0.62,
      originX: 0.5,
      originY: 1,
      screenYRaise: 12,
      wallShear: 0.5,
      fixedDepth: -21,
      note: 'hockey jersey on a hook, north wall west',
    },
    {
      frame: 'posterCluster',
      mapX: 660,
      mapY: 64,
      scale: 0.6,
      originX: 0.5,
      originY: 1,
      screenYRaise: 12,
      wallShear: 0.5,
      fixedDepth: -21,
      note: 'taped poster cluster (sky/ocean prints), north wall center',
    },
    // Hanging plant trailing from the north-east corner ceiling.
    {
      frame: 'hangingPlant',
      mapX: 1240,
      mapY: 150,
      scale: 0.6,
      originX: 0.5,
      originY: 1,
      screenYRaise: 96,
      fixedDepth: -19,
      note: 'hanging plant, north-east corner (ceiling-hung)',
    },

    // --- Floor-standing dressing ---
    {
      frame: 'bed',
      mapX: 270,
      mapY: 700,
      heightRatio: 2.0,
      footprint: { w: 168, d: 112 },
      note: 'bed with seal + penguin plushies, west-south corner',
    },
    {
      frame: 'gachaShelf',
      mapX: 1150,
      mapY: 220,
      heightRatio: 1.25,
      footprint: { w: 150, d: 56 },
      note: 'gacha figurine + capsule shelf, north-east against the wall',
    },
    {
      frame: 'lightstick',
      mapX: 1240,
      mapY: 360,
      heightRatio: 0.8,
      note: 'idol lightstick on its stand (thin; no collider)',
    },
    {
      frame: 'hockeyStick',
      mapX: 120,
      mapY: 600,
      heightRatio: 1.4,
      note: 'hockey stick + puck leaning on the west wall (thin; no collider)',
    },
    {
      frame: 'fishbowl',
      mapX: 1120,
      mapY: 470,
      heightRatio: 0.62,
      footprint: { w: 60, d: 44 },
      note: 'koi fishbowl on the floor, east side',
    },
    // Floor cushion + tea table on the friendone-host dialogue rect (512,384 -> 576,432).
    {
      frame: 'cushion',
      mapX: 512,
      mapY: 520,
      scale: 0.62,
      originX: 0.5,
      originY: 0.6,
      fixedDepth: -12,
      note: 'floor cushion (flat; walk-over), south of the tea table',
    },
    {
      frame: 'teaTable',
      mapX: 576,
      mapY: 448,
      heightRatio: 0.9,
      footprint: { w: 96, d: 56 },
      note: 'low tea table w/ teapot -> friendone-host dialogue zone',
    },
    // Desk + PC + chair on the friendone-pc (fishing) activity rect (768,384 -> 832,432).
    {
      frame: 'desk',
      mapX: 832,
      mapY: 452,
      heightRatio: 1.55,
      footprint: { w: 150, d: 68 },
      colliderOffsetY: -8,
      note: 'desk + PC + chair -> friendone-pc (fishing game)',
    },
  ],
};

// ____'s room (location `friend-b`): navy gamer-cozy. Crops are tight alpha
// bounding boxes on friendtwo-room-props.png (1024x1024). The four wall posters are
// cropped as one cluster. friend-b.tmj: the battlestation sits on the friend-b-
// host (valorant) activity rect (640,384 128x96 -> center 704,432); the second
// desk + the two gaming chairs pulled close sit on the friend-b-easter-egg rect
// (960,384 -> center 1024,432), matching the "two chairs pulled close, a second
// headset already waiting on the desk" inspect line (locations.ts).
const FRIEND_TWO_PROP_FRAMES = {
  battlestation: { x: 52, y: 38, w: 513, h: 301 },
  gamingChair: { x: 611, y: 48, w: 159, h: 297 },
  gamingChair2: { x: 782, y: 50, w: 144, h: 297 },
  bed: { x: 6, y: 376, w: 281, h: 331 },
  gameShelf: { x: 340, y: 374, w: 326, h: 114 },
  posterCluster: { x: 721, y: 381, w: 238, h: 275 },
  miniFridge: { x: 298, y: 517, w: 158, h: 219 },
  beanbag: { x: 485, y: 531, w: 217, h: 210 },
  secondDesk: { x: 726, y: 659, w: 204, h: 198 },
  snackTable: { x: 39, y: 732, w: 172, h: 227 },
  rug: { x: 236, y: 779, w: 448, h: 169 },
  window: { x: 743, y: 862, w: 101, h: 142 },
  cactus: { x: 871, y: 877, w: 56, h: 125 },
} as const satisfies Record<string, PropFrame>;

const FRIEND_TWO_HOUSE_DRESSING: RoomDressing = {
  tilesTextureKey: 'friendtwo-room-tiles',
  floorFrame: 0,
  wallFrame: 1,
  propsTextureKey: 'friendtwo-room-props',
  frames: FRIEND_TWO_PROP_FRAMES,
  floorInsetTiles: 1,
  wallHeight: 144,
  backgroundColor: '#0b1020',
  props: [
    // --- Flat / wall dressing ---
    {
      frame: 'rug',
      mapX: 704,
      mapY: 580,
      scale: 0.55,
      originX: 0.5,
      originY: 0.5,
      fixedDepth: -30,
      note: 'navy diamond rug, room center',
    },
    // Windows with blinds on the back-left (west) wall; each casts a light beam.
    {
      frame: 'window',
      mapX: 64,
      mapY: 420,
      scale: 0.85,
      originX: 0.5,
      originY: 1,
      screenYRaise: 14,
      wallShear: -0.5,
      fixedDepth: -22,
      note: 'blinds window, west wall high',
    },
    {
      frame: 'window',
      mapX: 64,
      mapY: 660,
      scale: 0.85,
      originX: 0.5,
      originY: 1,
      screenYRaise: 14,
      wallShear: -0.5,
      fixedDepth: -22,
      note: 'blinds window, west wall low (above the bed)',
    },
    // Floating game-box/figurine shelf + poster cluster on the north wall.
    {
      frame: 'gameShelf',
      mapX: 360,
      mapY: 64,
      scale: 0.6,
      originX: 0.5,
      originY: 1,
      screenYRaise: 12,
      wallShear: 0.5,
      fixedDepth: -21,
      note: 'floating shelf of game boxes + figurines, north wall west',
    },
    {
      frame: 'posterCluster',
      mapX: 780,
      mapY: 64,
      scale: 0.62,
      originX: 0.5,
      originY: 1,
      screenYRaise: 12,
      wallShear: 0.5,
      fixedDepth: -21,
      note: 'esports poster cluster (4 posters), north wall east',
    },

    // --- Floor-standing dressing ---
    {
      frame: 'bed',
      mapX: 250,
      mapY: 700,
      heightRatio: 2.0,
      footprint: { w: 158, d: 110 },
      note: 'plaid bed, west-south corner',
    },
    {
      frame: 'beanbag',
      mapX: 430,
      mapY: 560,
      heightRatio: 0.75,
      footprint: { w: 110, d: 70 },
      note: 'navy beanbag, west-center chill spot',
    },
    {
      frame: 'miniFridge',
      mapX: 1245,
      mapY: 560,
      heightRatio: 1.05,
      footprint: { w: 96, d: 60 },
      note: 'mini fridge stocked with cans, east side',
    },
    {
      frame: 'snackTable',
      mapX: 1150,
      mapY: 660,
      heightRatio: 0.72,
      footprint: { w: 84, d: 52 },
      note: 'snack side-table (cup noodle + chips), south-east (clear of the easter-egg approach)',
    },
    {
      frame: 'cactus',
      mapX: 150,
      mapY: 500,
      heightRatio: 0.6,
      footprint: { w: 44, d: 36 },
      note: 'potted cactus by the west windows',
    },
    // Battlestation (dual monitors + headset) on the friend-b-host valorant rect
    // (640,384 -> 704,432), with a gaming chair pulled up in front.
    {
      frame: 'battlestation',
      mapX: 704,
      mapY: 448,
      heightRatio: 1.55,
      footprint: { w: 200, d: 70 },
      colliderOffsetY: -8,
      note: 'dual-monitor battlestation + headset -> friend-b-host (RETAKE.EXE)',
    },
    {
      frame: 'gamingChair',
      mapX: 704,
      mapY: 512,
      heightRatio: 0.95,
      footprint: { w: 70, d: 44 },
      note: "gaming chair in front of the battlestation (player's seat)",
    },
    // The easter-egg vignette on the friend-b-easter-egg rect (960,384 -> 1024,
    // 432): a second desk with a waiting headset and two chairs pulled close.
    {
      frame: 'secondDesk',
      mapX: 1024,
      mapY: 400,
      heightRatio: 1.05,
      footprint: { w: 120, d: 52 },
      note: 'second desk w/ waiting headset -> friend-b-easter-egg (north of the zone)',
    },
    // The two chairs pulled close, side by side, in front of the second desk;
    // their colliders end at y~448 so a clear standing spot stays open in the
    // south of the easter-egg rect (y 448-480) for the inspect prompt.
    {
      frame: 'gamingChair2',
      mapX: 1000,
      mapY: 448,
      heightRatio: 0.95,
      footprint: { w: 60, d: 40 },
      note: 'second gaming chair, pulled close (easter egg)',
    },
    {
      frame: 'gamingChair',
      mapX: 1050,
      mapY: 450,
      heightRatio: 0.95,
      flipX: true,
      footprint: { w: 60, d: 40 },
      note: 'third gaming chair, pulled close facing the second (easter egg)',
    },
  ],
};

const ROOM_DRESSINGS: Readonly<Record<string, RoomDressing>> = {
  'recipient-house': RECIPIENT_HOUSE_DRESSING,
  'friend-a': FRIEND_ONE_HOUSE_DRESSING,
  'friend-b': FRIEND_TWO_HOUSE_DRESSING,
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
