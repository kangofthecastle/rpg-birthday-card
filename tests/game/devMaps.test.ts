import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface TiledTileset {
  readonly name: string;
  readonly image?: string;
  readonly imagewidth?: number;
  readonly imageheight?: number;
  readonly tilewidth: number;
  readonly tileheight: number;
}

interface DevMap {
  readonly width: number;
  readonly height: number;
  readonly tilesets: readonly TiledTileset[];
  readonly layers: readonly TiledLayer[];
}

interface TiledObject {
  readonly name: string;
  readonly type: string;
}

interface TiledLayer {
  readonly name: string;
  readonly type: string;
  readonly objects?: readonly TiledObject[];
}

const mapFiles = [
  'main-outside.tmj',
  'friendtwo-yard.tmj',
  'friendone-yard.tmj',
  'clearing.tmj',
  'recipient-house.tmj',
  'friend-a.tmj',
  'friend-b.tmj',
  'final-spot.tmj',
] as const;

describe('dev maps', () => {
  it('include Phaser-compatible image metadata for generated runtime tilesets', () => {
    for (const mapFile of mapFiles) {
      const map = JSON.parse(
        readFileSync(join(process.cwd(), 'public', 'maps', mapFile), 'utf8'),
      ) as DevMap;

      expect(map.tilesets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'temp-floor',
            image: 'tile-floor.png',
            imagewidth: 64,
            imageheight: 64,
            tilewidth: 64,
            tileheight: 64,
          }),
          expect.objectContaining({
            name: 'temp-wall',
            image: 'tile-wall.png',
            imagewidth: 64,
            imageheight: 64,
            tilewidth: 64,
            tileheight: 64,
          }),
        ]),
      );
    }
  });

  // Interiors stay at the standard dressed-room footprint; outdoor areas are the
  // smaller "connected pockets" from the pacing pass, so they get their own
  // (smaller) floor — still big enough to walk around in, not a single screen.
  const interiorFiles = ['recipient-house.tmj', 'friend-a.tmj', 'friend-b.tmj', 'final-spot.tmj'];

  it('give interior rooms enough room to visibly move around', () => {
    for (const mapFile of interiorFiles) {
      const map = JSON.parse(
        readFileSync(join(process.cwd(), 'public', 'maps', mapFile), 'utf8'),
      ) as DevMap;

      expect(map.width).toBeGreaterThanOrEqual(20);
      expect(map.height).toBeGreaterThanOrEqual(14);
    }
  });

  it('keeps outdoor pockets compact but still walkable', () => {
    for (const mapFile of mapFiles.filter((file) => !interiorFiles.includes(file))) {
      const map = JSON.parse(
        readFileSync(join(process.cwd(), 'public', 'maps', mapFile), 'utf8'),
      ) as DevMap;

      expect(map.width).toBeGreaterThanOrEqual(16);
      expect(map.height).toBeGreaterThanOrEqual(10);
      // Small pockets, not fields.
      expect(map.width).toBeLessThanOrEqual(24);
      expect(map.height).toBeLessThanOrEqual(14);
    }
  });

  it('includes ____ host and PC fishing markers in ____ house', () => {
    const map = JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'maps', 'friend-a.tmj'), 'utf8'),
    ) as DevMap;
    const spawns = map.layers.find(
      (layer) => layer.type === 'objectgroup' && layer.name === 'Spawns',
    );
    const interactables = map.layers.find(
      (layer) => layer.type === 'objectgroup' && layer.name === 'Interactables',
    );

    expect(spawns?.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'near-friendone-pc', type: 'spawn' }),
      ]),
    );
    expect(interactables?.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'friendone-host', type: 'dialogue' }),
        expect.objectContaining({ name: 'friendone-pc', type: 'activity' }),
      ]),
    );
  });

  it('includes the front-door spawn, exit, and PC in ____’s room', () => {
    const map = JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'maps', 'recipient-house.tmj'), 'utf8'),
    ) as DevMap;
    const spawns = map.layers.find(
      (layer) => layer.type === 'objectgroup' && layer.name === 'Spawns',
    );
    const exits = map.layers.find(
      (layer) => layer.type === 'objectgroup' && layer.name === 'Exits',
    );
    const interactables = map.layers.find(
      (layer) => layer.type === 'objectgroup' && layer.name === 'Interactables',
    );

    expect(spawns?.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'front-door', type: 'spawn' }),
      ]),
    );
    expect(exits?.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'step-outside', type: 'exit' }),
      ]),
    );
    expect(interactables?.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'recipient-pc', type: 'activity' }),
        expect.objectContaining({ name: 'recipient-violin', type: 'easterEgg' }),
      ]),
    );
  });

  it('gives main-outside the ____ door, its return spawn, and the signpost', () => {
    const map = readMap('main-outside.tmj');
    const spawns = objectLayer(map, 'Spawns');
    const exits = objectLayer(map, 'Exits');
    const interactables = objectLayer(map, 'Interactables');

    expect(map.width).toBe(22);
    expect(map.height).toBe(13);
    expect(spawns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'start', type: 'spawn' }),
        expect.objectContaining({ name: 'from-recipient-house', type: 'spawn' }),
      ]),
    );
    expect(exits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'to-recipient-house', type: 'exit' }),
      ]),
    );
    expect(interactables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'main-signpost', type: 'dialogue' }),
      ]),
    );
  });

  it('carves exactly five centred border tiles for each open edge', () => {
    // main-outside opens west, east and south (not north).
    const map = readMap('main-outside.tmj');
    const collision = collisionLayer(map);
    const at = (x: number, y: number) => collision[y * map.width + x];
    const midY = Math.floor(map.height / 2);
    const midX = Math.floor(map.width / 2);
    const inFiveTileCorridor = (index: number, count: number): boolean =>
      index >= Math.floor(count / 2) - 2 && index <= Math.floor(count / 2) + 2;

    for (let y = 0; y < map.height; y += 1) {
      expect(at(0, y) === 0).toBe(inFiveTileCorridor(y, map.height));
      expect(at(map.width - 1, y) === 0).toBe(inFiveTileCorridor(y, map.height));
    }
    for (let x = 0; x < map.width; x += 1) {
      expect(at(x, map.height - 1) === 0).toBe(inFiveTileCorridor(x, map.width));
      expect(at(x, 0)).not.toBe(0); // north closed
    }
    expect(at(0, midY)).toBe(0);
    expect(at(map.width - 1, midY)).toBe(0);
    expect(at(midX, map.height - 1)).toBe(0);
    expect(at(0, 0)).not.toBe(0); // corner stays solid
  });

  it('opens the clearing entrance but seals both water rows along the south shore', () => {
    const map = readMap('clearing.tmj');
    const collision = collisionLayer(map);
    const at = (x: number, y: number) => collision[y * map.width + x];
    const midX = Math.floor(map.width / 2);

    expect(at(midX, 0)).toBe(0); // north open (to main-outside)
    for (let x = 0; x < map.width; x += 1) {
      expect(at(x, map.height - 2)).not.toBe(0);
      expect(at(x, map.height - 1)).not.toBe(0);
    }
    expect(at(midX - 3, 0)).not.toBe(0);
  });

  it('fully closes the final spot so the ending cannot return to the clearing', () => {
    const map = readMap('final-spot.tmj');
    const collision = collisionLayer(map);
    const at = (x: number, y: number) => collision[y * map.width + x];

    for (let x = 0; x < map.width; x += 1) {
      expect(at(x, 0)).not.toBe(0);
    }
  });
});

function readMap(file: string): DevMap {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'maps', file), 'utf8'),
  ) as DevMap;
}

function objectLayer(map: DevMap, name: string): readonly TiledObject[] | undefined {
  return map.layers.find((layer) => layer.type === 'objectgroup' && layer.name === name)
    ?.objects;
}

function collisionLayer(map: DevMap): readonly number[] {
  const layer = map.layers.find(
    (layer) => layer.type === 'tilelayer' && layer.name === 'Collision',
  ) as (TiledLayer & { data?: readonly number[] }) | undefined;
  if (!layer?.data) {
    throw new Error('Missing Collision layer');
  }
  return layer.data;
}
