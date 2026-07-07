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
  'entry.tmj',
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

  it('give the temporary prototype enough room to visibly move around', () => {
    for (const mapFile of mapFiles) {
      const map = JSON.parse(
        readFileSync(join(process.cwd(), 'public', 'maps', mapFile), 'utf8'),
      ) as DevMap;

      expect(map.width).toBeGreaterThanOrEqual(20);
      expect(map.height).toBeGreaterThanOrEqual(14);
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
});
