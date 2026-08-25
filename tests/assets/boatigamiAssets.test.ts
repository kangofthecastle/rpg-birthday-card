import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readPngDimensions(relativePath: string): { width: number; height: number } {
  const image = readFileSync(resolve(process.cwd(), relativePath));

  expect(image.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);

  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  };
}

describe('Boatigami paper textures', () => {
  it.each([
    ['____ letter', 'public/assets/activities/fold-the-letters/paper-friendone.png', 512, 640],
    ['____ letter', 'public/assets/activities/fold-the-letters/paper-friendtwo.png', 512, 640],
    [
      'sheet music',
      'public/assets/activities/fold-the-letters/paper-sheetmusic-boatigami.png',
      832,
      480,
    ],
  ])('keeps the %s texture at its renderer-required dimensions', (_, path, width, height) => {
    expect(readPngDimensions(path)).toEqual({ width, height });
  });
});
