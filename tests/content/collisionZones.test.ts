import { describe, expect, it } from 'vitest';
import { getCollisionZones, isValidZonesFile } from '../../src/content/collisionZones';

describe('getCollisionZones', () => {
  it('loads the recipient-house zones file with polygon zones', () => {
    const file = getCollisionZones('recipient-house');
    expect(file).toBeDefined();
    expect(file!.locationId).toBe('recipient-house');
    expect(file!.zones.length).toBeGreaterThan(0);

    for (const zone of file!.zones) {
      expect(typeof zone.id).toBe('string');
      expect(zone.points.length).toBeGreaterThanOrEqual(3);
      for (const point of zone.points) {
        expect(point).toHaveLength(2);
        expect(typeof point[0]).toBe('number');
        expect(typeof point[1]).toBe('number');
      }
    }
  });

  it('exposes a depth override for the desk so the player can pass behind it', () => {
    const file = getCollisionZones('recipient-house')!;
    expect(file.propDepthOverrides?.desk).toBeTypeOf('number');
  });

  it('returns undefined for locations without a zones file', () => {
    expect(getCollisionZones('main-outside')).toBeUndefined();
    expect(getCollisionZones('nope')).toBeUndefined();
  });
});

describe('isValidZonesFile', () => {
  it('accepts a well-formed payload', () => {
    expect(
      isValidZonesFile({
        locationId: 'recipient-house',
        zones: [{ id: 'a', points: [[0, 0], [1, 0], [1, 1]] }],
        propDepthOverrides: { desk: 800 },
      }),
    ).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(isValidZonesFile(null)).toBe(false);
    expect(isValidZonesFile({ locationId: 5, zones: [] })).toBe(false);
    expect(isValidZonesFile({ locationId: 'x', zones: 'nope' })).toBe(false);
    expect(isValidZonesFile({ locationId: 'x', zones: [{ id: 'a', points: [[0]] }] })).toBe(false);
    expect(
      isValidZonesFile({ locationId: 'x', zones: [], propDepthOverrides: { a: 'no' } }),
    ).toBe(false);
  });
});
