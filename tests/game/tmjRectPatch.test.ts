import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyTmjRectPatches,
  isValidTmjSavePayload,
  serializeTmj,
} from '../../src/game/tmjRectPatch';

const MAPS_DIR = join(__dirname, '../../public/maps');

function loadMap(name: string): { raw: string; json: unknown } {
  const raw = readFileSync(join(MAPS_DIR, name), 'utf8');
  return { raw, json: JSON.parse(raw) as unknown };
}

// recipient-house.tmj Interactables: recipient-bed is object id 8.
const RECIPIENT_BED_ID = 8;

describe('serializeTmj fidelity', () => {
  it('round-trips every room map byte-for-byte', () => {
    for (const name of [
      'recipient-house.tmj',
      'friend-a.tmj',
      'friend-b.tmj',
      'clearing.tmj',
      'main-outside.tmj',
      'friendtwo-yard.tmj',
      'friendone-yard.tmj',
      'final-spot.tmj',
    ]) {
      const { raw, json } = loadMap(name);
      expect(serializeTmj(json)).toBe(raw);
    }
  });
});

describe('applyTmjRectPatches', () => {
  it('changes only the targeted object rect and nothing else', () => {
    const { json } = loadMap('recipient-house.tmj');
    const patched = applyTmjRectPatches(json, [
      { layer: 'Interactables', id: RECIPIENT_BED_ID, x: 111, y: 222, width: 333, height: 444 },
    ]);

    // Build the expected result by deep-cloning the original and mutating the
    // one object by hand; a full deep-equal proves nothing else moved.
    const expected = structuredClone(json) as {
      layers: Array<{ name: string; type: string; objects?: Array<Record<string, unknown>> }>;
    };
    const bed = expected.layers
      .find((l) => l.type === 'objectgroup' && l.name === 'Interactables')!
      .objects!.find((o) => o.id === RECIPIENT_BED_ID)!;
    bed.x = 111;
    bed.y = 222;
    bed.width = 333;
    bed.height = 444;

    expect(patched).toEqual(expected);
  });

  it('does not mutate the input', () => {
    const { json } = loadMap('recipient-house.tmj');
    const before = structuredClone(json);
    applyTmjRectPatches(json, [
      { layer: 'Interactables', id: RECIPIENT_BED_ID, x: 5, y: 5, width: 5, height: 5 },
    ]);
    expect(json).toEqual(before);
  });

  it('ignores patches whose (layer, id) target does not exist', () => {
    const { json } = loadMap('recipient-house.tmj');
    const patched = applyTmjRectPatches(json, [
      { layer: 'Interactables', id: 99999, x: 1, y: 2, width: 3, height: 4 },
      { layer: 'NoSuchLayer', id: RECIPIENT_BED_ID, x: 1, y: 2, width: 3, height: 4 },
    ]);
    expect(patched).toEqual(json);
  });

  it('round-trips patched output through the disk serializer', () => {
    const { json } = loadMap('recipient-house.tmj');
    const patched = applyTmjRectPatches(json, [
      { layer: 'Interactables', id: RECIPIENT_BED_ID, x: 300, y: 760, width: 200, height: 160 },
    ]);
    const reparsed = JSON.parse(serializeTmj(patched)) as unknown;
    expect(reparsed).toEqual(patched);
  });
});

describe('isValidTmjSavePayload', () => {
  const good = {
    mapPath: 'recipient-house.tmj',
    objects: [{ layer: 'Interactables', id: 8, x: 1, y: 2, width: 3, height: 4 }],
  };

  it('accepts a well-formed payload', () => {
    expect(isValidTmjSavePayload(good)).toBe(true);
  });

  it('rejects path-traversal / non-tmj map paths', () => {
    for (const mapPath of [
      '../secret.tmj',
      'maps/recipient-house.tmj',
      'recipient-house.json',
      'recipient_house.tmj',
      '/etc/passwd',
      'recipient-house.tmj\n',
    ]) {
      expect(isValidTmjSavePayload({ ...good, mapPath })).toBe(false);
    }
  });

  it('rejects malformed objects', () => {
    expect(isValidTmjSavePayload({ ...good, objects: 'nope' })).toBe(false);
    expect(
      isValidTmjSavePayload({ ...good, objects: [{ layer: 'Interactables', id: 8, x: 1, y: 2 }] }),
    ).toBe(false);
    expect(
      isValidTmjSavePayload({
        ...good,
        objects: [{ layer: 'Interactables', id: 1.5, x: 1, y: 2, width: 3, height: 4 }],
      }),
    ).toBe(false);
    expect(
      isValidTmjSavePayload({
        ...good,
        objects: [{ layer: '../x', id: 8, x: 1, y: 2, width: 3, height: 4 }],
      }),
    ).toBe(false);
  });
});
