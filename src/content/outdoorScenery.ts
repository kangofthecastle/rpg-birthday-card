// Outdoor scenery data: house-exterior billboards and per-area ground palettes
// for the procedural backdrop. Kept out of LocationScene so placements and
// colours are easy to tweak. Exterior anchors are in *map* (orthogonal) pixels;
// LocationScene projects them to iso screen space like room-dressing props.

export const EXTERIOR_KEY_PREFIX = 'exterior-';

// Outdoor ground art — LAYERED drop-in slots (v2). The packed 4×4 ground-tileset
// sheet was retired: a single generated sheet could never keep grass seamless,
// path corners clean, AND the hedge un-banded all at once. Each concern is now an
// independent optional file, so image-gen only has to get ONE seamless thing
// right per image. Every slot is probed in BootScene (isImageUrl) and loaded into
// its texture key when present; when absent, outdoorGround.ts paints a procedural
// fallback so the world never regresses before art lands.
//
//  • GRASS      — one large seamless tileable texture, engine tiles it (no cells,
//                 so no grid seams by construction). A separate dusk texture for
//                 the clearing's twilight.
//  • PATH       — four TRANSPARENT overlay pieces composited over the grass
//                 (straight / quarter-arc corner / T / dead-end cap). The engine
//                 rotates/flips them per path cell; because they are dirt-on-alpha
//                 there is no grass to match, and corners are smooth arcs.
//  • HEDGE      — one horizontally-seamless strip (NO baked lighting gradient),
//                 tiled along each closed edge (rotated for vertical edges).
export const GROUND_TILE_SIZE = 64;

/** Seamless grass texture (tiles on all four edges). */
export const GROUND_GRASS_KEY = 'ground-grass';
export const GROUND_GRASS_URL = '/assets/tiles/grass-tile.png';
/** Seamless dusk/twilight grass for the clearing. */
export const GROUND_GRASS_DUSK_KEY = 'ground-grass-dusk';
export const GROUND_GRASS_DUSK_URL = '/assets/tiles/grass-dusk-tile.png';

/** Transparent worn-dirt path overlay pieces (base orientations below). */
export const PATH_STRAIGHT_KEY = 'path-straight'; // base: vertical band (N–S)
export const PATH_STRAIGHT_URL = '/assets/tiles/path-straight.png';
export const PATH_CORNER_KEY = 'path-corner'; // base: quarter arc joining S & E
export const PATH_CORNER_URL = '/assets/tiles/path-corner.png';
export const PATH_TEE_KEY = 'path-tee'; // base: T open at E,S,W (missing N)
export const PATH_TEE_URL = '/assets/tiles/path-tee.png';
export const PATH_CAP_KEY = 'path-cap'; // base: dead-end open at S
export const PATH_CAP_URL = '/assets/tiles/path-cap.png';

/** Horizontally-seamless hedge/wall strip (tiled along closed edges). */
export const GROUND_HEDGE_KEY = 'ground-hedge';
export const GROUND_HEDGE_URL = '/assets/tiles/hedge-strip.png';

/** Every layered ground slot, for BootScene's probe-then-load loop. */
export const GROUND_ART_SLOTS: ReadonlyArray<{ key: string; url: string }> = [
  { key: GROUND_GRASS_KEY, url: GROUND_GRASS_URL },
  { key: GROUND_GRASS_DUSK_KEY, url: GROUND_GRASS_DUSK_URL },
  { key: PATH_STRAIGHT_KEY, url: PATH_STRAIGHT_URL },
  { key: PATH_CORNER_KEY, url: PATH_CORNER_URL },
  { key: PATH_TEE_KEY, url: PATH_TEE_URL },
  { key: PATH_CAP_KEY, url: PATH_CAP_URL },
  { key: GROUND_HEDGE_KEY, url: GROUND_HEDGE_URL },
];
/** Placeholder SVG source size; a drop-in PNG can be any size (scaled to fit). */
export const EXTERIOR_SOURCE_WIDTH = 320;
export const EXTERIOR_SOURCE_HEIGHT = 360;

export const EXTERIOR_ASSET_NAMES = ['recipient-home', 'friendtwo-house', 'friendone-house'] as const;
export type ExteriorAssetName = (typeof EXTERIOR_ASSET_NAMES)[number];

export function exteriorTextureKey(name: string): string {
  return `${EXTERIOR_KEY_PREFIX}${name}`;
}

/** Footprint (map px) of a house base, extending back (north) from the anchor. */
export interface ExteriorFootprint {
  readonly w: number;
  readonly d: number;
}

export interface ExteriorPlacement {
  readonly asset: ExteriorAssetName;
  /** Bottom-center floor-contact anchor, in map pixels (aligns to the door). */
  readonly mapX: number;
  readonly mapY: number;
  /** Display height as a multiple of the player visual height (yardstick). */
  readonly heightRatio: number;
  /** Solid base footprint, north of the door so the doorway stays reachable. */
  readonly footprint: ExteriorFootprint;
}

// Anchors match each map's door exit rect center (see write-dev-maps.mjs) so the
// door glow sits at the base of the house.
export const OUTDOOR_EXTERIORS: Readonly<Record<string, readonly ExteriorPlacement[]>> = {
  'main-outside': [
    { asset: 'recipient-home', mapX: 704, mapY: 192, heightRatio: 2.9, footprint: { w: 168, d: 84 } },
  ],
  'friendtwo-yard': [
    { asset: 'friendtwo-house', mapX: 512, mapY: 192, heightRatio: 2.9, footprint: { w: 168, d: 84 } },
  ],
  'friendone-yard': [
    { asset: 'friendone-house', mapX: 512, mapY: 192, heightRatio: 2.9, footprint: { w: 168, d: 84 } },
  ],
};

export function getExteriors(locationId: string): readonly ExteriorPlacement[] {
  return OUTDOOR_EXTERIORS[locationId] ?? [];
}

/** Per-area backdrop palette so outdoor areas read as distinct places. */
export interface OutdoorPalette {
  readonly background: number;
  readonly floorA: number;
  readonly floorB: number;
  readonly stroke: number;
  /** Border tiles that are NOT open edges (framing hedge/fence colour). */
  readonly border: number;
  readonly borderStroke: number;
  /** Worn-path colour for the top-down ground (trodden dirt toward doors/edges). */
  readonly path: number;
}

const NEIGHBOURHOOD_GRASS: OutdoorPalette = {
  background: 0x1b2a1c,
  floorA: 0x88ad70,
  floorB: 0x7fa46b,
  stroke: 0x5f8050,
  border: 0x6f8f58,
  borderStroke: 0x4e6a40,
  path: 0xb9a06b,
};

const FRIEND_TWO_COOL: OutdoorPalette = {
  background: 0x1a2430,
  floorA: 0x7f9c8e,
  floorB: 0x738f82,
  stroke: 0x536f62,
  border: 0x5f7a72,
  borderStroke: 0x415750,
  path: 0xa89e86,
};

const FRIEND_ONE_WARM: OutdoorPalette = {
  background: 0x2a2418,
  floorA: 0x9fb173,
  floorB: 0x94a86a,
  stroke: 0x6d7f4c,
  border: 0x7c8a52,
  borderStroke: 0x59632f,
  path: 0xc0a86a,
};

// Reworked to echo the fold-the-letters / origami stage: a deep indigo night
// warming to a rose horizon, so the clearing reads as the same twilight world
// the letters sail out into.
const CLEARING_DUSK: OutdoorPalette = {
  background: 0x161031,
  floorA: 0x574a72,
  floorB: 0x6d4a68,
  stroke: 0x342a4d,
  border: 0x3a3157,
  borderStroke: 0x241d3a,
  path: 0x8c6a7c,
};

const OUTDOOR_PALETTES: Readonly<Record<string, OutdoorPalette>> = {
  'main-outside': NEIGHBOURHOOD_GRASS,
  'friendtwo-yard': FRIEND_TWO_COOL,
  'friendone-yard': FRIEND_ONE_WARM,
  clearing: CLEARING_DUSK,
};

export function getOutdoorPalette(locationId: string): OutdoorPalette | undefined {
  return OUTDOOR_PALETTES[locationId];
}

// ── Outdoor decoration props ────────────────────────────────────────────────
// Asset-path-driven scenery. Each prop kind names a transparent painted cutout
// under /assets/props/<dir>/<name>.png. When the file is present (probed in
// BootScene) it renders as an image; when absent, LocationScene draws a painted
// procedural fallback into a same-sized canvas texture so the neighbourhood is
// never barren before the art pack lands. Dimensions below are the intended
// final display size in MAP PIXELS (tiles are 64px); art is authored to these so
// a drop-in needs zero code changes. Style tags select the fallback painter.
export const PROP_KEY_PREFIX = 'prop-';
export function propTextureKey(name: string): string {
  return `${PROP_KEY_PREFIX}${name}`;
}
export function propAssetUrl(dir: string, name: string): string {
  return `/assets/props/${dir}/${name}.png`;
}

export interface PropKind {
  readonly name: string;
  /** Sub-folder under /assets/props/. */
  readonly dir: 'outdoor' | 'clearing';
  /** Native display width in map px (== authored PNG width). */
  readonly w: number;
  /** Native display height in map px (== authored PNG height). */
  readonly h: number;
  /** Solid base footprint (map px) at the prop's feet; omit = fully walkable. */
  readonly collider?: { readonly w: number; readonly h: number };
  /** Baked into the ground below the player (ground scatter) instead of y-sorted. */
  readonly flat?: boolean;
  /** Drawn above the player (hung / floating overhead pieces). */
  readonly overhead?: boolean;
  /** Fallback painter selector (see LocationScene.paintPropFallback). */
  readonly style: string;
  /** Horizontal tile texture (fence): fallback repeats seamlessly. */
  readonly tileable?: boolean;
}

// The manifest, matched EXACTLY to the art being generated (paths + sizes).
export const PROP_KINDS: Readonly<Record<string, PropKind>> = {
  'tree-1': { name: 'tree-1', dir: 'outdoor', w: 320, h: 448, collider: { w: 96, h: 34 }, style: 'tree-a' },
  'tree-2': { name: 'tree-2', dir: 'outdoor', w: 320, h: 448, collider: { w: 96, h: 34 }, style: 'tree-b' },
  'bush-1': { name: 'bush-1', dir: 'outdoor', w: 192, h: 160, collider: { w: 132, h: 34 }, style: 'bush' },
  'flower-patch-1': { name: 'flower-patch-1', dir: 'outdoor', w: 160, h: 112, flat: true, style: 'flowers-a' },
  'flower-patch-2': { name: 'flower-patch-2', dir: 'outdoor', w: 160, h: 112, flat: true, style: 'flowers-b' },
  'fence-h': { name: 'fence-h', dir: 'outdoor', w: 256, h: 128, collider: { w: 256, h: 26 }, style: 'fence', tileable: true },
  'rock-1': { name: 'rock-1', dir: 'outdoor', w: 144, h: 112, collider: { w: 116, h: 40 }, style: 'rock' },
  'lamp-post': { name: 'lamp-post', dir: 'outdoor', w: 112, h: 288, collider: { w: 34, h: 22 }, style: 'lamp' },
  mailbox: { name: 'mailbox', dir: 'outdoor', w: 96, h: 176, collider: { w: 44, h: 22 }, style: 'mailbox' },
  bench: { name: 'bench', dir: 'outdoor', w: 224, h: 144, collider: { w: 196, h: 30 }, style: 'bench' },
  'signpost-arrow': { name: 'signpost-arrow', dir: 'outdoor', w: 192, h: 224, collider: { w: 40, h: 20 }, style: 'signpost-arrow' },
  'clearing-lantern-post': { name: 'clearing-lantern-post', dir: 'clearing', w: 128, h: 320, collider: { w: 34, h: 22 }, style: 'lantern-post' },
  'clearing-lantern-string': { name: 'clearing-lantern-string', dir: 'clearing', w: 512, h: 160, overhead: true, style: 'lantern-string' },
  // Three colour variants of a single origami crane sitting on the water
  // (top-down 3/4): 1 = cream/blush, 2 = pale warm gold, 3 = soft lavender.
  // Not placed via OUTDOOR_PROPS — the clearing scene instantiates one drifting
  // crane per variant along the shore water (LocationScene.spawnClearingCranes),
  // varying scale/rotation/phase per instance, so all three colours are always
  // on screen. `flat` so no ground shadow bakes.
  'clearing-crane-1': { name: 'clearing-crane-1', dir: 'clearing', w: 96, h: 80, flat: true, style: 'crane-1' },
  'clearing-crane-2': { name: 'clearing-crane-2', dir: 'clearing', w: 96, h: 80, flat: true, style: 'crane-2' },
  'clearing-crane-3': { name: 'clearing-crane-3', dir: 'clearing', w: 96, h: 80, flat: true, style: 'crane-3' },
};

export const ALL_PROP_KINDS: readonly PropKind[] = Object.values(PROP_KINDS);

export interface PropPlacement {
  readonly name: string;
  /** Bottom-centre floor-contact anchor in map px (feet). Flat/overhead: centre. */
  readonly mapX: number;
  readonly mapY: number;
  /** Mirror horizontally. */
  readonly flip?: boolean;
  /**
   * Per-placement display-scale multiplier applied on top of the prop kind's
   * native size (default 1). The dressEdit editor's wheel/± resize writes this;
   * the collider footprint scales with it so a shrunk prop blocks less ground.
   */
  readonly scale?: number;
  /**
   * Stable identity for the persisted-layout merge: `<name>#<occurrence>` within
   * the location's TS-declared list (see outdoorPlacementId). Stamped on load; a
   * saved layout carries it so a NEW TS placement (fresh id) still re-merges while
   * existing ones are matched by id. Absent on the hand-authored TS literals.
   */
  readonly id?: string;
}

// Hand-placed so nothing lands on a path, spawn, exit, hotspot or house — dense
// enough to read as a lived-in cozy neighbourhood, thicker near the paths and
// houses. Coordinates are map px; base anchors are the prop's feet.
export const OUTDOOR_PROPS: Readonly<Record<string, readonly PropPlacement[]>> = {
  'main-outside': [
    { name: 'tree-1', mapX: 150, mapY: 470 },
    { name: 'tree-2', mapX: 1268, mapY: 500, flip: true },
    { name: 'tree-1', mapX: 300, mapY: 726 },
    { name: 'tree-2', mapX: 1140, mapY: 726 },
    { name: 'fence-h', mapX: 470, mapY: 322 },
    { name: 'fence-h', mapX: 940, mapY: 322 },
    { name: 'lamp-post', mapX: 590, mapY: 470 },
    { name: 'mailbox', mapX: 812, mapY: 246 },
    { name: 'bench', mapX: 950, mapY: 636 },
    { name: 'bush-1', mapX: 432, mapY: 300 },
    { name: 'bush-1', mapX: 462, mapY: 604, flip: true },
    { name: 'bush-1', mapX: 356, mapY: 726 },
    { name: 'bush-1', mapX: 884, mapY: 254 },
    { name: 'bush-1', mapX: 986, mapY: 604 },
    { name: 'bush-1', mapX: 1056, mapY: 300, flip: true },
    { name: 'rock-1', mapX: 300, mapY: 500 },
    { name: 'rock-1', mapX: 1096, mapY: 560, flip: true },
    { name: 'rock-1', mapX: 520, mapY: 700 },
    { name: 'flower-patch-1', mapX: 380, mapY: 400 },
    { name: 'flower-patch-2', mapX: 1010, mapY: 420 },
    { name: 'flower-patch-1', mapX: 560, mapY: 250 },
    { name: 'flower-patch-2', mapX: 860, mapY: 250 },
    { name: 'flower-patch-2', mapX: 700, mapY: 700 },
    { name: 'flower-patch-1', mapX: 1130, mapY: 470 },
  ],
  'friendtwo-yard': [
    { name: 'tree-2', mapX: 140, mapY: 470 },
    { name: 'tree-1', mapX: 210, mapY: 664 },
    { name: 'tree-1', mapX: 872, mapY: 250, flip: true },
    { name: 'fence-h', mapX: 300, mapY: 300 },
    { name: 'fence-h', mapX: 760, mapY: 300 },
    { name: 'lamp-post', mapX: 620, mapY: 470 },
    { name: 'mailbox', mapX: 604, mapY: 250 },
    { name: 'bench', mapX: 764, mapY: 560, flip: true },
    { name: 'bush-1', mapX: 330, mapY: 300 },
    { name: 'bush-1', mapX: 300, mapY: 560 },
    { name: 'bush-1', mapX: 690, mapY: 560, flip: true },
    { name: 'bush-1', mapX: 838, mapY: 470 },
    { name: 'rock-1', mapX: 240, mapY: 400 },
    { name: 'rock-1', mapX: 900, mapY: 620, flip: true },
    { name: 'flower-patch-1', mapX: 400, mapY: 460 },
    { name: 'flower-patch-2', mapX: 700, mapY: 250 },
    { name: 'flower-patch-2', mapX: 230, mapY: 620 },
  ],
  'friendone-yard': [
    { name: 'tree-1', mapX: 884, mapY: 470, flip: true },
    { name: 'tree-2', mapX: 814, mapY: 664, flip: true },
    { name: 'tree-1', mapX: 160, mapY: 250 },
    { name: 'fence-h', mapX: 300, mapY: 300 },
    { name: 'fence-h', mapX: 760, mapY: 300 },
    { name: 'lamp-post', mapX: 420, mapY: 470 },
    { name: 'mailbox', mapX: 416, mapY: 250, flip: true },
    { name: 'bench', mapX: 268, mapY: 560 },
    { name: 'bush-1', mapX: 700, mapY: 300, flip: true },
    { name: 'bush-1', mapX: 724, mapY: 560, flip: true },
    { name: 'bush-1', mapX: 344, mapY: 560 },
    { name: 'bush-1', mapX: 210, mapY: 470 },
    { name: 'rock-1', mapX: 792, mapY: 400, flip: true },
    { name: 'rock-1', mapX: 300, mapY: 620 },
    { name: 'flower-patch-2', mapX: 624, mapY: 460 },
    { name: 'flower-patch-1', mapX: 330, mapY: 250 },
    { name: 'flower-patch-1', mapX: 790, mapY: 620 },
    { name: 'flower-patch-2', mapX: 560, mapY: 640 },
  ],
  clearing: [
    { name: 'clearing-lantern-post', mapX: 356, mapY: 476 },
    { name: 'clearing-lantern-post', mapX: 684, mapY: 476, flip: true },
    { name: 'clearing-lantern-string', mapX: 512, mapY: 96 },
    // The paper cranes are no longer static props here: they drift on the shore
    // water, spawned by LocationScene.spawnClearingCranes. (The paper boat was
    // removed entirely — narratively it doesn't exist until ____ folds it.)
  ],
};

// ── Authored outdoor layout overrides ───────────────────────────────────────
// Mirrors the room-dressing layout system (src/content/roomDressing.ts): the
// OUTDOOR_PROPS arrays above are the initial/fallback placements, kept in TS so
// their hand-placed rationale lives with the data. When an authored layout file
// exists at src/content/outdoorLayouts/<locationId>.json — written in-game by the
// ?dressEdit=1 editor's Save button — it REPLACES that area's props at module
// load. Prop kinds, palettes and collider logic always stay in TS. The glob is
// eager so lookups stay synchronous; an HMR reload after a Save re-picks the file.

/** Stable per-placement identity: name + its occurrence index within the
 * location's TS list. Deterministic from array order, so a NEW prop appended in
 * TS gets a fresh id (and thus re-merges into a saved layout) while existing
 * props keep theirs across saves. */
export function outdoorPlacementId(name: string, occurrence: number): string {
  return `${name}#${occurrence}`;
}

/** The prop-kind name shared by every directional fingerpost. Its placements are
 * persisted in the same layout file as the decoration props (so a hand-moved
 * fingerpost survives a reload) under ids `signpost-arrow#0`, `#1`, … — but they
 * are rendered separately by LocationScene.renderSignposts, not among OUTDOOR_PROPS. */
export const SIGNPOST_PROP_NAME = 'signpost-arrow';

/** Stamp deterministic ids onto a TS-declared placement list (see above). */
export function withOutdoorIds(placements: readonly PropPlacement[]): PropPlacement[] {
  const counts = new Map<string, number>();
  return placements.map((placement) => {
    const occurrence = counts.get(placement.name) ?? 0;
    counts.set(placement.name, occurrence + 1);
    return { ...placement, id: placement.id ?? outdoorPlacementId(placement.name, occurrence) };
  });
}

/** Persisted per-area outdoor layout (placements only; kinds/palette stay in TS). */
export interface OutdoorLayoutFile {
  readonly locationId: string;
  readonly props: readonly PropPlacement[];
  /**
   * Ids the author deliberately removed ("tombstones"). A TS placement absent
   * from the saved props is normally auto-merged back (so a newly-registered
   * placement appears without a Save) — but a tombstoned id is NOT re-merged, so
   * a deliberate deletion in dressEdit sticks across reloads. Same semantics as
   * the room layout `removed[]`.
   */
  readonly removed?: readonly string[];
}

const OUTDOOR_LAYOUT_MODULES = import.meta.glob<OutdoorLayoutFile>('./outdoorLayouts/*.json', {
  eager: true,
  import: 'default',
});

const OUTDOOR_LAYOUTS_BY_LOCATION: Readonly<Record<string, OutdoorLayoutFile>> = Object.fromEntries(
  Object.values(OUTDOOR_LAYOUT_MODULES)
    .filter((file): file is OutdoorLayoutFile => Boolean(file && file.locationId))
    .map((file) => [file.locationId, file]),
);

/**
 * Merge a persisted layout into a base placement list. The saved `props` replace
 * the TS fallback; any TS placement whose id the layout does not carry is
 * appended, so a newly-registered placement appears without a Save first — UNLESS
 * its id is tombstoned in `removed`, in which case it stays gone. Once the author
 * arranges and Saves, a kept placement is written into `props` (matched by id) and
 * this merge no longer re-adds it. Mirrors applyRoomLayout in roomDressing.ts.
 */
export function applyOutdoorLayout(
  base: readonly PropPlacement[],
  layout: Pick<OutdoorLayoutFile, 'props' | 'removed'>,
): PropPlacement[] {
  const savedIds = new Set(
    layout.props.map((prop) => prop.id).filter((id): id is string => id !== undefined),
  );
  const removed = new Set(layout.removed ?? []);
  const newFromTs = base.filter(
    (prop) => prop.id !== undefined && !savedIds.has(prop.id) && !removed.has(prop.id),
  );
  return [...layout.props, ...newFromTs];
}

/** The persisted layout for an area, if any (raw, pre-merge). */
export function getOutdoorLayout(locationId: string): OutdoorLayoutFile | undefined {
  return OUTDOOR_LAYOUTS_BY_LOCATION[locationId];
}

/** Ids the author has tombstoned (deliberately removed) for an area. */
export function getOutdoorLayoutRemoved(locationId: string): readonly string[] {
  return OUTDOOR_LAYOUTS_BY_LOCATION[locationId]?.removed ?? [];
}

/**
 * The decoration placements for an area: the TS fallback overridden by the
 * authored layout JSON (if present), id-stamped. Fingerposts are excluded — they
 * live in the same layout but are rendered separately (see getOutdoorSignposts).
 */
export function getOutdoorProps(locationId: string): readonly PropPlacement[] {
  const base = withOutdoorIds(OUTDOOR_PROPS[locationId] ?? []);
  const layout = OUTDOOR_LAYOUTS_BY_LOCATION[locationId];
  const merged = layout ? applyOutdoorLayout(base, layout) : base;
  return merged.filter((placement) => placement.name !== SIGNPOST_PROP_NAME);
}

/**
 * Validates an outdoor-layout payload shape (used by the dev save endpoint's
 * mirror and unit tests). Checks the locationId and that every prop carries at
 * least a string `name` and numeric `mapX`/`mapY`; optional id/scale/removed are
 * left to the type. Mirrors isValidRoomLayoutFile.
 */
export function isValidOutdoorLayoutFile(value: unknown): value is OutdoorLayoutFile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const file = value as Record<string, unknown>;
  if (typeof file.locationId !== 'string' || !Array.isArray(file.props)) {
    return false;
  }
  for (const prop of file.props) {
    if (typeof prop !== 'object' || prop === null) {
      return false;
    }
    const p = prop as Record<string, unknown>;
    if (typeof p.name !== 'string' || typeof p.mapX !== 'number' || typeof p.mapY !== 'number') {
      return false;
    }
    if (p.id !== undefined && typeof p.id !== 'string') {
      return false;
    }
  }
  if (file.removed !== undefined) {
    if (!Array.isArray(file.removed) || file.removed.some((id) => typeof id !== 'string')) {
      return false;
    }
  }
  return true;
}

// ── Directional fingerposts ─────────────────────────────────────────────────
// Flat, front-facing fingerposts: a straight-on post with ONE arrow-shaped board
// pointing the way to a named area. The board is blank art; the destination name
// is rendered onto its shaft in-game (SignpostPlacement.label). `flip` mirrors the
// sprite so the arrow points LEFT (west) instead of its native RIGHT (east); the
// caption is drawn separately and always stays upright/unflipped.
//
// They live only in Guildford (main-outside) now — the junction with ____'s
// house — one pointing west to Kerrisdale, one east to Aldergrove. Both share the
// single "main-signpost" dialogue rect (the "Arrows point every way" line reads as
// the whole junction, so one interaction covers both signs). Anchors flank the
// central junction just NORTH of the east/west corridor lanes (feet in the row
// above the road band, so the colliders stay out of the corridor mask), spread
// wide enough that the lamp-post's lantern head — which y-sorts in front at this
// height — never covers a caption; fine-tune in dressEdit.
export interface SignpostPlacement {
  /** Interaction / hotspot id this fingerpost's "read" dialogue belongs to. */
  readonly interactionId: string;
  /** Persisted-layout id (`signpost-arrow#<n>`) so a hand-moved post survives reload. */
  readonly id: string;
  /** Bottom-centre floor-contact anchor (feet), map px. */
  readonly mapX: number;
  readonly mapY: number;
  /** Caption drawn onto the arrow shaft in-game. */
  readonly label: string;
  /** Mirror the sprite so the arrow points LEFT/west (native art points right/east). */
  readonly flip?: boolean;
  /** Per-placement display-scale multiplier (default 1); set via dressEdit. */
  readonly scale?: number;
}

export const SIGNPOSTS: Readonly<Record<string, readonly SignpostPlacement[]>> = {
  'main-outside': [
    // Points WEST toward the west-edge road to Kerrisdale (____'s yard).
    { interactionId: 'main-signpost', id: 'signpost-arrow#0', mapX: 460, mapY: 364, label: 'KERRISDALE', flip: true },
    // Points EAST toward the east-edge road to Aldergrove (____'s yard).
    { interactionId: 'main-signpost', id: 'signpost-arrow#1', mapX: 948, mapY: 364, label: 'ALDERGROVE' },
  ],
};

export function getSignposts(locationId: string): readonly SignpostPlacement[] {
  return SIGNPOSTS[locationId] ?? [];
}

/**
 * The writable region of an arrow board — the rectangular SHAFT, excluding the
 * triangular arrowhead — as a fraction of the sprite width. The in-game caption
 * auto-fit measures the label against this (not the whole board), so text never
 * rides onto the arrowhead. Both the drop-in art and the procedural fallback are
 * authored so the shaft matches this width.
 */
export const SIGNPOST_ARROW_WRITABLE_FRACTION = 0.6;

/**
 * Horizontal centre of that shaft, as a fraction from the sprite's LEFT edge, for
 * the native (unflipped) art whose arrow points right — the head sits to the
 * right so the shaft's centre is left of the board's centre. Mirrored about 0.5
 * when the sprite is flipped (arrow pointing left). The caption is positioned here
 * so it sits centred on the shaft in either direction while staying upright.
 */
export const SIGNPOST_ARROW_SHAFT_CENTER_FRACTION = 0.44;

/**
 * The fingerpost placements for an area, each with its position/flip/scale
 * overridden by the authored outdoor layout when the author has hand-moved it in
 * dressEdit (matched by its stable `id`). The interactionId and label always stay
 * in TS. Used by LocationScene.renderSignposts so a board renders where it was
 * hand-placed (its dialogue rect is edited separately in Interactables mode).
 */
export function getOutdoorSignposts(locationId: string): SignpostPlacement[] {
  const signs = SIGNPOSTS[locationId];
  if (!signs) {
    return [];
  }
  const layout = OUTDOOR_LAYOUTS_BY_LOCATION[locationId];
  return signs.map((sign) => {
    const override = layout?.props.find((prop) => prop.id === sign.id);
    if (!override) {
      return sign;
    }
    return {
      ...sign,
      mapX: override.mapX,
      mapY: override.mapY,
      flip: override.flip ?? sign.flip,
      scale: override.scale ?? sign.scale,
    };
  });
}
