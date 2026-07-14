import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mapsDir = join(root, 'public', 'maps');

mkdirSync(mapsDir, { recursive: true });

const TILE = 64;
// Every outdoor portal is the central path tile plus two path-widths on either
// side. The rest of that border remains solid.
const EDGE_CORRIDOR_TILES = 5;
// Interiors keep the standard room size (iso rooms are dressed to this footprint
// and are NOT part of the outdoor-pacing pass).
const STD_W = 22;
const STD_H = 16;
// Outdoor areas are deliberately smaller "connected pockets" so crossing one is
// a few seconds of walking, not a trek across a field. Tuned against the player
// walk speed so a full main-outside edge-to-edge crossing is ~5-6s.
const MAIN_W = 22;
const MAIN_H = 13;
const YARD_W = 16;
const YARD_H = 11;
const CLEARING_W = 16;
const CLEARING_H = 10;

// Per-map definitions. `openEdges` lists sides whose border wall has a centred
// five-tile opening, aligned to the path cell, for edge transitions.
const maps = [
  {
    file: 'main-outside.tmj',
    width: MAIN_W,
    height: MAIN_H,
    openEdges: ['west', 'east', 'south'],
    // ____'s home sits at the north edge (door center 736,192 — nudged +32 from
    // the tile boundary so the door lands on the tile-column CENTRE the worn path
    // already runs up); the signpost and start spawn read down the middle toward
    // the open south road.
    spawns: [
      point(1, 'start', 704, 640),
      point(2, 'from-recipient-house', 736, 300),
    ],
    exits: [rect(3, 'to-recipient-house', 'exit', 672, 148, 128, 88)],
    interactables: [rect(4, 'main-signpost', 'dialogue', 640, 430, 128, 88)],
  },
  {
    file: 'friendtwo-yard.tmj',
    width: YARD_W,
    height: YARD_H,
    openEdges: ['east'],
    // House composed at the top-center of the yard (door center 480,192 — nudged
    // -32 onto the tile-column CENTRE of col 7, the door leg's new column: the
    // east road is drawn one tile LONGER at its interior end (see the col-7 path
    // origin in PATH_ORIGIN_COL_OFFSET), so the corner + door leg sit at col 7 and
    // the door lands dead-centre on that leg). The open east edge is the road back
    // to the neighbourhood. No signpost here — fingerposts live only in Guildford.
    spawns: [point(1, 'start', 512, 460), point(2, 'from-friend-b', 480, 320)],
    exits: [rect(3, 'to-friend-b', 'exit', 416, 150, 128, 84)],
    interactables: [],
  },
  {
    file: 'friendone-yard.tmj',
    width: YARD_W,
    height: YARD_H,
    openEdges: ['west'],
    // Mirror of ____'s yard: house top-center (door center 480,192 — nudged -32
    // onto the tile-column CENTRE of col 7, the door leg's new column). The west
    // road is drawn one tile SHORTER at its interior end (col-7 path origin in
    // PATH_ORIGIN_COL_OFFSET), so the corner + door leg sit at col 7 and the door
    // lands dead-centre on that leg. Open west edge back to the road. No signpost
    // here — the directional fingerposts live only in Guildford.
    spawns: [point(1, 'start', 512, 460), point(2, 'from-friend-a', 480, 320)],
    exits: [rect(3, 'to-friend-a', 'exit', 416, 150, 128, 84)],
    interactables: [],
  },
  {
    file: 'clearing.tmj',
    width: CLEARING_W,
    height: CLEARING_H,
    openEdges: ['north', 'south'],
    spawns: [point(1, 'start', 512, 300)],
    exits: [],
    // The origami ritual at the southern shore — a wide kneel-at-the-water zone
    // set a couple of tiles in from the south edge (the ~2-tile water band), so
    // the player reaches it before the (gated) edge transition.
    interactables: [rect(4, 'clearing-shore', 'activity', 320, 440, 384, 128)],
  },
  {
    file: 'recipient-house.tmj',
    width: STD_W,
    height: STD_H,
    openEdges: [],
    spawns: [point(1, 'front-door', 704, 768), point(2, 'near-pc', 704, 768)],
    exits: [rect(3, 'step-outside', 'exit', 640, 864, 128, 80)],
    interactables: [
      rect(4, 'recipient-violin', 'easterEgg', 236, 234, 174, 181),
      rect(6, 'recipient-mango-rice', 'easterEgg', 1092, 627, 164, 144),
      rect(7, 'recipient-photo-wall', 'easterEgg', 499, 61, 228, 98),
      rect(8, 'recipient-bed', 'easterEgg', 145, 555, 217, 296),
      rect(9, 'recipient-pc', 'activity', 636, 454, 176, 156),
    ],
  },
  {
    file: 'friend-a.tmj',
    width: STD_W,
    height: STD_H,
    openEdges: [],
    spawns: [point(1, 'front-door', 704, 768), point(5, 'near-friendone-pc', 561, 470)],
    exits: [rect(2, 'back-entry', 'exit', 640, 832, 128, 80)],
    interactables: [
      rect(3, 'friendone-host', 'dialogue', 951, 513, 128, 96),
      rect(4, 'friendone-pc', 'activity', 497, 388, 128, 96),
    ],
  },
  {
    file: 'friend-b.tmj',
    width: STD_W,
    height: STD_H,
    openEdges: [],
    spawns: [point(1, 'front-door', 704, 768), point(5, 'near-friendtwo-pc', 640, 470)],
    exits: [rect(2, 'back-entry', 'exit', 640, 832, 128, 80)],
    interactables: [
      rect(3, 'friend-b-host', 'activity', 576, 422, 128, 96),
      rect(4, 'friend-b-easter-egg', 'easterEgg', 1106, 380, 128, 96),
      rect(6, 'friendtwo-host', 'dialogue', 464, 384, 128, 96),
    ],
  },
  {
    file: 'final-spot.tmj',
    width: STD_W,
    height: STD_H,
    openEdges: [],
    spawns: [point(1, 'clearing-path', 704, 768), point(4, 'near-lantern', 704, 640)],
    exits: [],
    interactables: [rect(3, 'friendtwo-finale', 'dialogue', 624, 400, 160, 128)],
  },
];

for (const map of maps) {
  writeFileSync(join(mapsDir, map.file), `${JSON.stringify(createMap(map), null, 2)}\n`);
}

// Builds the Ground/Collision tile arrays for a map. The border is a solid
// 1-tile wall everywhere except the centred five-tile portals of `openEdges`.
function buildTiles(width, height, openEdges) {
  const isOpen = new Set(openEdges);
  const ground = [];
  const collision = [];

  const inCorridor = (index, tangentTiles) => {
    const count = Math.min(EDGE_CORRIDOR_TILES, tangentTiles);
    const center = Math.floor(tangentTiles / 2);
    const start = Math.max(0, Math.min(tangentTiles - count, center - Math.floor(count / 2)));
    return index >= start && index < start + count;
  };

  for (let index = 0; index < width * height; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    const onCorner =
      (x === 0 || x === width - 1) && (y === 0 || y === height - 1);

    let wall = onBorder;
    if (onBorder && !onCorner) {
      if (x === 0 && isOpen.has('west') && inCorridor(y, height)) wall = false;
      if (x === width - 1 && isOpen.has('east') && inCorridor(y, height)) wall = false;
      if (y === 0 && isOpen.has('north') && inCorridor(x, width)) wall = false;
      if (y === height - 1 && isOpen.has('south') && inCorridor(x, width)) wall = false;
    }

    ground.push(wall ? 2 : 1);
    collision.push(wall ? 2 : 0);
  }

  return { ground, collision };
}

function createMap({ width, height, openEdges = [], spawns, exits, interactables }) {
  const { ground, collision } = buildTiles(width, height, openEdges);

  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width,
    height,
    tilewidth: TILE,
    tileheight: TILE,
    infinite: false,
    tilesets: [
      {
        firstgid: 1,
        name: 'temp-floor',
        image: 'tile-floor.png',
        imagewidth: TILE,
        imageheight: TILE,
        tilewidth: TILE,
        tileheight: TILE,
        tilecount: 1,
        columns: 1,
        margin: 0,
        spacing: 0,
      },
      {
        firstgid: 2,
        name: 'temp-wall',
        image: 'tile-wall.png',
        imagewidth: TILE,
        imageheight: TILE,
        tilewidth: TILE,
        tileheight: TILE,
        tilecount: 1,
        columns: 1,
        margin: 0,
        spacing: 0,
      },
    ],
    layers: [
      tileLayer(1, 'Ground', ground, width, height),
      tileLayer(2, 'Collision', collision, width, height),
      objectLayer(3, 'Spawns', spawns),
      objectLayer(4, 'Exits', exits),
      objectLayer(5, 'Interactables', interactables),
    ],
  };
}

function tileLayer(id, name, data, width, height) {
  return {
    id,
    name,
    type: 'tilelayer',
    width,
    height,
    data,
  };
}

function objectLayer(id, name, objects) {
  return {
    id,
    name,
    type: 'objectgroup',
    objects,
  };
}

function point(id, name, x, y) {
  return {
    id,
    name,
    type: 'spawn',
    x,
    y,
    point: true,
  };
}

function rect(id, name, type, x, y, width, height) {
  return {
    id,
    name,
    type,
    x,
    y,
    width,
    height,
  };
}
