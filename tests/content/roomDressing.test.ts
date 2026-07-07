import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getRoomDressing } from '../../src/content/roomDressing';

const SHEET_SIZE = 1024;

interface TiledObjectJson {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
}

interface TiledLayerJson {
  readonly name: string;
  readonly objects?: readonly TiledObjectJson[];
}

function loadRecipientHouseInteractables(): readonly TiledObjectJson[] {
  const raw = readFileSync(resolve(__dirname, '../../public/maps/recipient-house.tmj'), 'utf8');
  const map = JSON.parse(raw) as { layers: readonly TiledLayerJson[] };
  const layer = map.layers.find((candidate) => candidate.name === 'Interactables');
  return layer?.objects ?? [];
}

describe('getRoomDressing', () => {
  it('returns undefined for undressed locations', () => {
    expect(getRoomDressing('entry')).toBeUndefined();
    expect(getRoomDressing('friend-a')).toBeUndefined();
    expect(getRoomDressing('final-spot')).toBeUndefined();
  });

  it('provides an recipient-house dressing whose props reference defined frames', () => {
    const dressing = getRoomDressing('recipient-house');
    expect(dressing).toBeDefined();

    for (const placement of dressing!.props) {
      expect(dressing!.frames[placement.frame], `frame "${placement.frame}"`).toBeDefined();
    }
  });

  it('keeps every prop crop inside the 1024x1024 sheet', () => {
    const dressing = getRoomDressing('recipient-house')!;

    for (const [name, frame] of Object.entries(dressing.frames)) {
      expect(frame.x, name).toBeGreaterThanOrEqual(0);
      expect(frame.y, name).toBeGreaterThanOrEqual(0);
      expect(frame.w, name).toBeGreaterThan(0);
      expect(frame.h, name).toBeGreaterThan(0);
      expect(frame.x + frame.w, name).toBeLessThanOrEqual(SHEET_SIZE);
      expect(frame.y + frame.h, name).toBeLessThanOrEqual(SHEET_SIZE);
    }
  });

  it('anchors each interactable-linked prop near its map rect', () => {
    const dressing = getRoomDressing('recipient-house')!;
    const interactables = loadRecipientHouseInteractables();
    // Interactable id -> prop frame carrying its art.
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ['recipient-bed', 'bed'],
      ['recipient-pc', 'desk'],
      ['recipient-violin', 'violin'],
      ['recipient-playbills', 'playbills'],
      ['recipient-mango-rice', 'kitchen'],
      ['recipient-photo-wall', 'photoWall'],
    ];

    for (const [objectName, frameName] of pairs) {
      const rect = interactables.find((candidate) => candidate.name === objectName);
      expect(rect, objectName).toBeDefined();

      const placement = dressing.props.find((candidate) => candidate.frame === frameName);
      expect(placement, frameName).toBeDefined();

      const centerX = rect!.x + (rect!.width ?? 0) / 2;
      const centerY = rect!.y + (rect!.height ?? 0) / 2;
      // The visual anchor (bottom-center of the prop) may sit off the rect
      // center (wall-hung art anchors on the wall edge above its rect), but
      // must stay close so the interact prompt reads on-prop.
      expect(Math.abs(placement!.mapX - centerX), `${frameName} x`).toBeLessThanOrEqual(64);
      expect(Math.abs(placement!.mapY - centerY), `${frameName} y`).toBeLessThanOrEqual(96);
    }
  });
});
