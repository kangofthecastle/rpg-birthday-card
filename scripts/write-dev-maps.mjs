import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mapsDir = join(root, 'public', 'maps');

mkdirSync(mapsDir, { recursive: true });

const ground = [
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2,
  2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2,
  2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2,
  2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2,
  2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2,
  2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
];

const collision = ground.map((tile) => (tile === 2 ? 2 : 0));

const maps = [
  {
    file: 'entry.tmj',
    spawns: [
      point(1, 'start', 384, 256),
      point(2, 'from-friend-a', 192, 256),
      point(3, 'from-friend-b', 384, 256),
      point(4, 'from-friend-c', 576, 256),
      point(5, 'from-final', 384, 384),
    ],
    exits: [
      rect(6, 'to-friend-a', 'exit', 128, 128, 96, 96),
      rect(7, 'to-friend-b', 'exit', 336, 128, 96, 96),
      rect(8, 'to-friend-c', 'exit', 544, 128, 96, 96),
      rect(9, 'to-final', 'exit', 336, 384, 96, 96),
    ],
    interactables: [rect(10, 'entry-sign', 'dialogue', 336, 288, 96, 64)],
  },
  {
    file: 'friend-a.tmj',
    spawns: [point(1, 'front-door', 384, 384)],
    exits: [rect(2, 'back-entry', 'exit', 336, 416, 96, 64)],
    interactables: [
      rect(3, 'friend-a-host', 'activity', 336, 192, 96, 96),
      rect(4, 'friend-a-easter-egg', 'easterEgg', 544, 192, 96, 96),
    ],
  },
  {
    file: 'friend-b.tmj',
    spawns: [point(1, 'front-door', 384, 384)],
    exits: [rect(2, 'back-entry', 'exit', 336, 416, 96, 64)],
    interactables: [
      rect(3, 'friend-b-host', 'activity', 336, 192, 96, 96),
      rect(4, 'friend-b-easter-egg', 'easterEgg', 544, 192, 96, 96),
    ],
  },
  {
    file: 'friend-c.tmj',
    spawns: [point(1, 'front-door', 384, 384)],
    exits: [rect(2, 'back-entry', 'exit', 336, 416, 96, 64)],
    interactables: [
      rect(3, 'friend-c-host', 'activity', 336, 192, 96, 96),
      rect(4, 'friend-c-easter-egg', 'easterEgg', 544, 192, 96, 96),
    ],
  },
  {
    file: 'final-spot.tmj',
    spawns: [point(1, 'clearing-path', 384, 384)],
    exits: [rect(2, 'back-entry', 'exit', 336, 416, 96, 64)],
    interactables: [rect(3, 'final-table', 'activity', 336, 192, 96, 96)],
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
    width: 12,
    height: 8,
    tilewidth: 64,
    tileheight: 64,
    infinite: false,
    tilesets: [
      {
        firstgid: 1,
        name: 'temp-floor',
        tilewidth: 64,
        tileheight: 64,
        tilecount: 1,
        columns: 1,
      },
      {
        firstgid: 2,
        name: 'temp-wall',
        tilewidth: 64,
        tileheight: 64,
        tilecount: 1,
        columns: 1,
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
    width: 12,
    height: 8,
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
