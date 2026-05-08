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
  readonly tilesets: readonly TiledTileset[];
}

const mapFiles = [
  'entry.tmj',
  'friend-a.tmj',
  'friend-b.tmj',
  'friend-c.tmj',
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
});
