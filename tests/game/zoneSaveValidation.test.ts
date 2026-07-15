import { describe, expect, it } from 'vitest';
import { isValidZoneSavePayload } from '../../src/game/zoneSaveValidation';

describe('collision-zone save payload validation', () => {
  it('accepts rotated depth-line overrides sent by the editor', () => {
    expect(
      isValidZoneSavePayload({
        locationId: 'recipient-house',
        zones: [],
        propDepthOverrides: {
          desk: {
            kind: 'line',
            start: [590, 560],
            end: [820, 640],
            frontSide: [700, 700],
          },
        },
      }),
    ).toBe(true);
  });

  it('keeps accepting legacy horizontal numeric depth overrides', () => {
    expect(
      isValidZoneSavePayload({
        locationId: 'recipient-house',
        zones: [],
        propDepthOverrides: { desk: 560 },
      }),
    ).toBe(true);
  });

  it('rejects malformed depth-line overrides', () => {
    expect(
      isValidZoneSavePayload({
        locationId: 'recipient-house',
        zones: [],
        propDepthOverrides: {
          desk: {
            kind: 'line',
            start: [590, 560],
            end: [820, 640],
            frontSide: [820, 640],
          },
        },
      }),
    ).toBe(false);
  });
});
