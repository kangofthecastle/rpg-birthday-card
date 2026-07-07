import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mapsDir = join(root, 'public', 'maps');

mkdirSync(mapsDir, { recursive: true });

const mapWidth = 22;
const mapHeight = 16;

const ground = Array.from({ length: mapWidth * mapHeight }, (_, index) => {
  const x = index % mapWidth;
  const y = Math.floor(index / mapWidth);

  return x === 0 || y === 0 || x === mapWidth - 1 || y === mapHeight - 1 ? 2 : 1;
});

const collision = ground.map((tile) => (tile === 2 ? 2 : 0));

const maps = [
  {
    file: 'entry.tmj',
    spawns: [
      point(1, 'start', 704, 512),
      point(2, 'from-friend-a', 320, 512),
      point(3, 'from-friend-b', 704, 512),
      point(4, 'from-final', 704, 768),
      point(5, 'from-recipient-house', 320, 640),
    ],
    exits: [
      rect(6, 'to-friend-a', 'exit', 256, 256, 128, 96),
      rect(7, 'to-friend-b', 'exit', 640, 256, 128, 96),
      rect(8, 'to-final', 'exit', 640, 768, 128, 96),
      rect(9, 'to-recipient-house', 'exit', 256, 736, 128, 96),
    ],
    interactables: [rect(10, 'entry-sign', 'dialogue', 656, 544, 128, 80)],
  },
  {
    file: 'recipient-house.tmj',
    spawns: [
      point(1, 'front-door', 704, 768),
      point(2, 'near-pc', 704, 768),
    ],
    exits: [rect(3, 'step-outside', 'exit', 640, 864, 128, 80)],
    interactables: [
      rect(4, 'recipient-violin', 'easterEgg', 240, 300, 160, 140),
      rect(5, 'recipient-playbills', 'easterEgg', 560, 280, 160, 140),
      rect(6, 'recipient-mango-rice', 'easterEgg', 960, 300, 160, 140),
      rect(7, 'recipient-photo-wall', 'easterEgg', 1080, 64, 160, 140),
      rect(8, 'recipient-bed', 'easterEgg', 300, 600, 180, 150),
      rect(9, 'recipient-pc', 'activity', 624, 720, 160, 140),
    ],
  },
  {
    file: 'friend-a.tmj',
    spawns: [
      point(1, 'front-door', 704, 768),
      point(5, 'near-friendone-pc', 800, 416),
    ],
    exits: [rect(2, 'back-entry', 'exit', 640, 832, 128, 80)],
    interactables: [
      rect(3, 'friendone-host', 'dialogue', 512, 384, 128, 96),
      rect(4, 'friendone-pc', 'activity', 768, 384, 128, 96),
    ],
  },
  {
    file: 'friend-b.tmj',
    spawns: [
      point(1, 'front-door', 704, 768),
      point(5, 'near-friendtwo-pc', 704, 432),
    ],
    exits: [rect(2, 'back-entry', 'exit', 640, 832, 128, 80)],
    interactables: [
      rect(3, 'friend-b-host', 'activity', 640, 384, 128, 96),
      rect(4, 'friend-b-easter-egg', 'easterEgg', 960, 384, 128, 96),
      rect(6, 'friendtwo-host', 'dialogue', 464, 384, 128, 96),
    ],
  },
  {
    file: 'final-spot.tmj',
    spawns: [point(1, 'clearing-path', 704, 768), point(4, 'near-lantern', 704, 432)],
    exits: [rect(2, 'back-entry', 'exit', 640, 832, 128, 80)],
    interactables: [rect(3, 'final-table', 'activity', 640, 384, 128, 96)],
  },
];

for (const map of maps) {
  writeFileSync(join(mapsDir, map.file), `${JSON.stringify(createMap(map), null, 2)}\n`);
}

function createMap({ spawns, exits, interactables }) {
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: mapWidth,
    height: mapHeight,
    tilewidth: 64,
    tileheight: 64,
    infinite: false,
    tilesets: [
      {
        firstgid: 1,
        name: 'temp-floor',
        image: 'tile-floor.png',
        imagewidth: 64,
        imageheight: 64,
        tilewidth: 64,
        tileheight: 64,
        tilecount: 1,
        columns: 1,
        margin: 0,
        spacing: 0,
      },
      {
        firstgid: 2,
        name: 'temp-wall',
        image: 'tile-wall.png',
        imagewidth: 64,
        imageheight: 64,
        tilewidth: 64,
        tileheight: 64,
        tilecount: 1,
        columns: 1,
        margin: 0,
        spacing: 0,
      },
    ],
    layers: [
      tileLayer(1, 'Ground', ground),
      tileLayer(2, 'Collision', collision),
      objectLayer(3, 'Spawns', spawns),
      objectLayer(4, 'Exits', exits),
      objectLayer(5, 'Interactables', interactables),
    ],
  };
}

function tileLayer(id, name, data) {
  return {
    id,
    name,
    type: 'tilelayer',
    width: mapWidth,
    height: mapHeight,
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
