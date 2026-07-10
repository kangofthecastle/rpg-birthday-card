import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mapsDir = join(root, 'public', 'maps');

mkdirSync(mapsDir, { recursive: true });

const TILE = 64;
const STD_W = 22;
const STD_H = 16;

// Per-map definitions. `openEdges` lists sides whose border wall is opened along
// its full walkable span (tiles 1..n-2), so the player can walk off that side
// and trigger an edge transition. Corners always stay solid.
const maps = [
  {
    file: 'main-outside.tmj',
    width: 30,
    height: 18,
    openEdges: ['west', 'east', 'south'],
    spawns: [
      point(1, 'start', 960, 900),
      point(2, 'from-recipient-house', 960, 470),
    ],
    exits: [rect(3, 'to-recipient-house', 'exit', 896, 320, 128, 88)],
    interactables: [rect(4, 'main-signpost', 'dialogue', 896, 720, 128, 88)],
  },
  {
    file: 'friendtwo-yard.tmj',
    width: STD_W,
    height: STD_H,
    openEdges: ['east'],
    spawns: [point(1, 'start', 704, 640), point(2, 'from-friend-b', 704, 500)],
    exits: [rect(3, 'to-friend-b', 'exit', 640, 344, 128, 84)],
    interactables: [],
  },
  {
    file: 'friendone-yard.tmj',
    width: STD_W,
    height: STD_H,
    openEdges: ['west'],
    spawns: [point(1, 'start', 704, 640), point(2, 'from-friend-a', 704, 500)],
    exits: [rect(3, 'to-friend-a', 'exit', 640, 344, 128, 84)],
    interactables: [],
  },
  {
    file: 'clearing.tmj',
    width: STD_W,
    height: STD_H,
    openEdges: ['north', 'south'],
    spawns: [point(1, 'start', 704, 512)],
    exits: [],
    // The origami ritual at the southern shore — a wide kneel-at-the-water zone
    // set a couple of tiles in from the south edge, so the player reaches it
    // before the (gated) edge transition.
    interactables: [rect(4, 'clearing-shore', 'activity', 512, 800, 384, 128)],
  },
  {
    file: 'recipient-house.tmj',
    width: STD_W,
    height: STD_H,
    openEdges: [],
    spawns: [point(1, 'front-door', 704, 768), point(2, 'near-pc', 704, 768)],
    exits: [rect(3, 'step-outside', 'exit', 640, 864, 128, 80)],
    interactables: [
      rect(4, 'recipient-violin', 'easterEgg', 240, 300, 160, 140),
      rect(6, 'recipient-mango-rice', 'easterEgg', 960, 300, 160, 140),
      rect(7, 'recipient-photo-wall', 'easterEgg', 1080, 64, 160, 140),
      rect(8, 'recipient-bed', 'easterEgg', 300, 600, 180, 150),
      rect(9, 'recipient-pc', 'activity', 624, 720, 160, 140),
    ],
  },
  {
    file: 'friend-a.tmj',
    width: STD_W,
    height: STD_H,
    openEdges: [],
    spawns: [point(1, 'front-door', 704, 768), point(5, 'near-friendone-pc', 800, 416)],
    exits: [rect(2, 'back-entry', 'exit', 640, 832, 128, 80)],
    interactables: [
      rect(3, 'friendone-host', 'dialogue', 512, 384, 128, 96),
      rect(4, 'friendone-pc', 'activity', 768, 384, 128, 96),
    ],
  },
  {
    file: 'friend-b.tmj',
    width: STD_W,
    height: STD_H,
    openEdges: [],
    spawns: [point(1, 'front-door', 704, 768), point(5, 'near-friendtwo-pc', 704, 432)],
    exits: [rect(2, 'back-entry', 'exit', 640, 832, 128, 80)],
    interactables: [
      rect(3, 'friend-b-host', 'activity', 640, 384, 128, 96),
      rect(4, 'friend-b-easter-egg', 'easterEgg', 960, 384, 128, 96),
      rect(6, 'friendtwo-host', 'dialogue', 464, 384, 128, 96),
    ],
  },
  {
    file: 'final-spot.tmj',
    width: STD_W,
    height: STD_H,
    openEdges: ['north'],
    spawns: [point(1, 'clearing-path', 704, 768), point(4, 'near-lantern', 704, 432)],
    exits: [],
    interactables: [rect(3, 'final-table', 'activity', 640, 384, 128, 96)],
  },
];

for (const map of maps) {
  writeFileSync(join(mapsDir, map.file), `${JSON.stringify(createMap(map), null, 2)}\n`);
}

// Builds the Ground/Collision tile arrays for a map. The border is a solid
// 1-tile wall everywhere except the walkable spans of `openEdges`, which are
// carved out (floor + no collision) so the player can walk off that side.
function buildTiles(width, height, openEdges) {
  const isOpen = new Set(openEdges);
  const ground = [];
  const collision = [];

  for (let index = 0; index < width * height; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    const onCorner =
      (x === 0 || x === width - 1) && (y === 0 || y === height - 1);

    let wall = onBorder;
    if (onBorder && !onCorner) {
      if (x === 0 && isOpen.has('west')) wall = false;
      if (x === width - 1 && isOpen.has('east')) wall = false;
      if (y === 0 && isOpen.has('north')) wall = false;
      if (y === height - 1 && isOpen.has('south')) wall = false;
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
