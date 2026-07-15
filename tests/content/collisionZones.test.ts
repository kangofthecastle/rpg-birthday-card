import { describe, expect, it } from 'vitest';
import {
  getCollisionZones,
  isPlayerInFrontOfDepthLine,
  isRotatedPropDepthLine,
  isValidZonesFile,
  type RotatedPropDepthLine,
} from '../../src/content/collisionZones';
import {
  getBedDepthLines,
  isPlayerInFrontOfBedDepthLines,
} from '../../src/content/bedDepth';

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
    const deskDepth = file.propDepthOverrides?.desk;
    expect(typeof deskDepth === 'number' || isRotatedPropDepthLine(deskDepth)).toBe(true);
  });

  it('keeps the desk render-depth threshold at its south-side collision edge', () => {
    const file = getCollisionZones('recipient-house')!;
    const desk = file.zones.find((zone) => zone.id === 'desk')!;
    const deskSouthEdge = Math.max(...desk.points.map(([, y]) => y));
    const deskDepth = file.propDepthOverrides?.desk!;
    if (isRotatedPropDepthLine(deskDepth)) {
      expect(isPlayerInFrontOfDepthLine(deskDepth, deskDepth.frontSide[0], deskDepth.frontSide[1])).toBe(
        true,
      );
      return;
    }
    expect(deskDepth).toBeTypeOf('number');
    if (typeof deskDepth !== 'number') {
      throw new Error('Expected a numeric or rotated desk override');
    }

    // ____'s visual depth is projected from her feet plus a 10px billboard
    // bias. With the room's 0.5 vertical scale, that bias is equivalent to 40
    // map px, so the player should switch in front at (depthMapY - 40), no
    // farther south than the desk's blocking edge plus her 16px body half-size.
    expect(deskDepth - 40).toBeLessThanOrEqual(deskSouthEdge + 16);
  });

  it('keeps the ____ bed front depth override independently authorable', () => {
    const file = getCollisionZones('recipient-house')!;
    const bedFrontDepth = file.propDepthOverrides?.['bed:front'];
    expect(isRotatedPropDepthLine(bedFrontDepth)).toBe(true);
    if (!isRotatedPropDepthLine(bedFrontDepth)) {
      throw new Error('Expected a rotated bed:front override');
    }

    // The exact line is user-authored in the editor, so only its semantic
    // contract belongs in this fixture: the marker must identify a front side.
    expect(isPlayerInFrontOfDepthLine(
      bedFrontDepth,
      bedFrontDepth.frontSide[0],
      bedFrontDepth.frontSide[1],
    )).toBe(true);
  });

  it('combines ____ bed side and foot lines at reachable approaches', () => {
    const overrides = getCollisionZones('recipient-house')!.propDepthOverrides!;
    const lines = getBedDepthLines(overrides, 'bed');

    expect(lines).toHaveLength(2);
    // The screenshot position is south of the foot but west of the diagonal
    // side line. Either segment must be enough to put ____ in front.
    expect(isPlayerInFrontOfBedDepthLines(lines, 347, 918)).toBe(true);
    expect(isPlayerInFrontOfBedDepthLines(lines, 432, 741)).toBe(true);
    expect(isPlayerInFrontOfBedDepthLines(lines, 300, 580)).toBe(false);
  });

  it('returns undefined for an unknown location without a zones file', () => {
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

  it('accepts a rotated prop depth line while preserving numeric overrides', () => {
    expect(
      isValidZonesFile({
        locationId: 'recipient-house',
        zones: [],
        propDepthOverrides: {
          desk: 800,
          bed: {
            kind: 'line',
            start: [180, 620],
            end: [380, 820],
            frontSide: [420, 700],
          },
        },
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
    expect(
      isValidZonesFile({
        locationId: 'x',
        zones: [],
        propDepthOverrides: {
          a: { kind: 'line', start: [0, 0], end: [0, 0], frontSide: [1, 0] },
        },
      }),
    ).toBe(false);
    expect(
      isValidZonesFile({
        locationId: 'x',
        zones: [],
        propDepthOverrides: {
          a: { kind: 'line', start: [0, 0], end: [10, 0], frontSide: [5, 0] },
        },
      }),
    ).toBe(false);
  });
});

describe('isPlayerInFrontOfDepthLine', () => {
  it('uses the authored front-side point when ____ crosses a rotated line', () => {
    const line: RotatedPropDepthLine = {
      kind: 'line',
      start: [0, 0],
      end: [10, 10],
      frontSide: [10, 0],
    };

    expect(isPlayerInFrontOfDepthLine(line, 8, 2)).toBe(true);
    expect(isPlayerInFrontOfDepthLine(line, 2, 8)).toBe(false);
  });
});
