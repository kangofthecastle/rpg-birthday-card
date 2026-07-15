import { describe, expect, it } from 'vitest';
import {
  BED_DEPTH_LAYER_SPECS,
  bedDepthOverrideKey,
  getBedDepthLines,
  getBedDepthMask,
  getBedDepthOverride,
  getDefaultBedDepthOverrides,
  isPlayerInFrontOfBedDepthLines,
} from '../../src/content/bedDepth';

const placement = {
  frame: 'bed',
  mapX: 250,
  mapY: 700,
  footprint: { w: 158, d: 110 },
};

describe('bed depth layers', () => {
  it('defines back and front layers with stable override keys', () => {
    expect(BED_DEPTH_LAYER_SPECS.map(({ id }) => id)).toEqual(['back', 'front']);
    expect(bedDepthOverrideKey('bed', 'back')).toBe('bed:back');
    expect(bedDepthOverrideKey('bed', 'front')).toBe('bed:front');
  });

  it('uses diagonal, location-specific front masks for all three beds', () => {
    for (const locationId of ['recipient-house', 'friend-a', 'friend-b']) {
      const mask = getBedDepthMask(locationId);
      expect(mask.frontPolygon.length).toBeGreaterThanOrEqual(4);
      expect(mask.frontPolygon.some(([, y]) => y < 0.5)).toBe(true);
      expect(mask.frontPolygon.some(([, y]) => y === 1)).toBe(true);
    }
    expect(getBedDepthMask('unknown').id).toBe(getBedDepthMask('recipient-house').id);
    expect(getBedDepthMask('friend-a').id).not.toBe(getBedDepthMask('friend-b').id);
  });

  it('derives an L-shaped side and foot boundary from the bed footprint', () => {
    const defaults = getDefaultBedDepthOverrides(placement);
    expect(defaults['bed:back'].start).toEqual([329, 590]);
    expect(defaults['bed:back'].end).toEqual([329, 700]);
    expect(defaults['bed:front'].start).toEqual([171, 700]);
    expect(defaults['bed:front'].end).toEqual([329, 700]);
    expect(defaults['bed:back'].frontSide[0]).toBeGreaterThan(329);
    expect(defaults['bed:front'].frontSide[1]).toBeGreaterThan(700);
  });

  it('combines the side and foot segments into one bed boundary', () => {
    const lines = getBedDepthLines(getDefaultBedDepthOverrides(placement), 'bed');

    expect(lines).toHaveLength(2);
    expect(isPlayerInFrontOfBedDepthLines(lines, 250, 590)).toBe(false);
    expect(isPlayerInFrontOfBedDepthLines(lines, 370, 640)).toBe(true);
    expect(isPlayerInFrontOfBedDepthLines(lines, 250, 750)).toBe(true);
  });

  it('prefers a layered override and falls back to the legacy frame key', () => {
    const legacy = {
      bed: { kind: 'line' as const, start: [0, 10] as [number, number], end: [20, 10] as [number, number], frontSide: [10, 20] as [number, number] },
    };
    const layered = {
      ...legacy,
      'bed:front': { kind: 'line' as const, start: [2, 30] as [number, number], end: [22, 30] as [number, number], frontSide: [12, 40] as [number, number] },
    };

    expect(getBedDepthOverride(legacy, 'bed', 'back')).toBe(legacy.bed);
    expect(getBedDepthOverride(layered, 'bed', 'front')).toBe(layered['bed:front']);
    expect(getBedDepthLines(legacy, 'bed')).toEqual([legacy.bed]);
    expect(getBedDepthLines(layered, 'bed')).toEqual([layered['bed:front']]);
  });
});
