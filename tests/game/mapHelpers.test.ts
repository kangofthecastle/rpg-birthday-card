import { describe, expect, it } from 'vitest';
import {
  getObjectLayer,
  getPointObject,
  getRectObjects,
  getStringProperty,
  type TiledMapJson,
} from '../../src/game/mapHelpers';

const map: TiledMapJson = {
  width: 10,
  height: 8,
  tilewidth: 64,
  tileheight: 64,
  layers: [
    {
      id: 1,
      name: 'Spawns',
      type: 'objectgroup',
      objects: [
        {
          id: 1,
          name: 'start',
          type: 'spawn',
          x: 128,
          y: 192,
          point: true,
        },
      ],
    },
    {
      id: 2,
      name: 'Exits',
      type: 'objectgroup',
      objects: [
        {
          id: 2,
          name: 'to-friend-a',
          type: 'exit',
          x: 320,
          y: 128,
          width: 64,
          height: 64,
          properties: [
            { name: 'destinationLocationId', type: 'string', value: 'friend-a' },
          ],
        },
      ],
    },
  ],
};

describe('mapHelpers', () => {
  it('finds object layers by name', () => {
    expect(getObjectLayer(map, 'Spawns')?.name).toBe('Spawns');
    expect(getObjectLayer(map, 'Missing')).toBeUndefined();
  });

  it('reads point objects', () => {
    const spawn = getPointObject(map, 'Spawns', 'start');

    expect(spawn).toEqual({ id: 'start', x: 128, y: 192 });
  });

  it('reads rectangle objects', () => {
    const exits = getRectObjects(map, 'Exits');

    expect(exits).toEqual([
      {
        id: 'to-friend-a',
        type: 'exit',
        x: 320,
        y: 128,
        width: 64,
        height: 64,
        properties: {
          destinationLocationId: 'friend-a',
        },
      },
    ]);
  });

  it('reads string properties from Tiled objects', () => {
    const exit = getObjectLayer(map, 'Exits')?.objects[0];

    expect(exit && getStringProperty(exit, 'destinationLocationId')).toBe('friend-a');
  });
});
