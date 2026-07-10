// Outdoor scenery data: house-exterior billboards and per-area ground palettes
// for the procedural backdrop. Kept out of LocationScene so placements and
// colours are easy to tweak. Exterior anchors are in *map* (orthogonal) pixels;
// LocationScene projects them to iso screen space like room-dressing props.

export const EXTERIOR_KEY_PREFIX = 'exterior-';

// Optional drop-in ground tileset (probed + loaded in BootScene as a 64×64
// spritesheet). When present, createFlatGround tiles the outdoor ground from it
// instead of the procedural grass/path/hedge fills. 4×4 grid (256×256):
//   row 0: grass variants (base / bright / textured / tufted)
//   row 1: worn dirt path — straight[N-S] / curve[E-S] / T[E-S-W] / fade[S]
//   row 2: hedge border — straight[E-W] / corner / canopy / corner
//   row 3: dusk-tinted set — grass / grass-variant / path[N-S] / path-fade
export const GROUND_TILESET_KEY = 'ground-tileset';
export const GROUND_TILESET_URL = '/assets/tiles/ground-tileset.png';
export const GROUND_TILE_SIZE = 64;
/** Frame indices into the 4×4 tileset (row-major). */
export const GROUND_TILES = {
  grass: [0, 1, 2, 3] as const,
  pathStraight: 4,
  pathCurve: 5,
  pathT: 6,
  pathFade: 7,
  hedgeStraight: 8,
  duskGrass: [12, 13] as const,
  duskPathStraight: 14,
  duskPathFade: 15,
} as const;
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

const CLEARING_DUSK: OutdoorPalette = {
  background: 0x1d1a2b,
  floorA: 0x6f6a8f,
  floorB: 0x635e82,
  stroke: 0x4a4666,
  border: 0x565073,
  borderStroke: 0x3a3652,
  path: 0x8a7f9c,
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
