import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPropColliders, getRoomDressing } from '../../src/content/roomDressing';

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

  it('sizes floor props against the player via heightRatio, keeping bed largest', () => {
    const dressing = getRoomDressing('recipient-house')!;
    const byFrame = (frame: string) => dressing.props.find((p) => p.frame === frame)!;

    // Solid floor props are sized by heightRatio (player-relative), not by an
    // ad-hoc scale, so they read consistently against ____.
    for (const frame of ['bed', 'desk', 'kitchen', 'playbills', 'monstera', 'pothos']) {
      expect(byFrame(frame).heightRatio, frame).toBeGreaterThan(0);
      expect(byFrame(frame).scale, frame).toBeUndefined();
    }

    // Cozy-RPG canon: the bed towers over everything; the desk cluster is next.
    expect(byFrame('bed').heightRatio!).toBeGreaterThan(byFrame('desk').heightRatio!);
    expect(byFrame('bed').heightRatio!).toBeCloseTo(2.0, 1);
    expect(byFrame('desk').heightRatio!).toBeGreaterThan(byFrame('playbills').heightRatio!);

    // The flat rug is not height-sized; it keeps an explicit scale.
    expect(byFrame('rug').scale).toBeGreaterThan(0);
    expect(byFrame('rug').heightRatio).toBeUndefined();
  });
});

describe('getPropColliders', () => {
  it('emits a collider only for solid props (footprint), skipping flat/wall art', () => {
    const dressing = getRoomDressing('recipient-house')!;
    const withFootprint = dressing.props.filter((p) => p.footprint).length;
    const colliders = getPropColliders(dressing);

    expect(colliders).toHaveLength(withFootprint);
    // The rug, window and photo wall (flat/wall) never collide.
    for (const frame of ['rug', 'window', 'photoWall', 'violin', 'camera']) {
      expect(dressing.props.find((p) => p.frame === frame)?.footprint, frame).toBeUndefined();
    }
  });

  it('derives the bed collider from its footprint, extending back from the anchor', () => {
    const dressing = getRoomDressing('recipient-house')!;
    const bed = dressing.props.find((p) => p.frame === 'bed')!;
    const colliders = getPropColliders(dressing);

    // Index colliders by matching the bed's expected rect.
    const bedRect = colliders.find(
      (c) => c.width === bed.footprint!.w && c.height === bed.footprint!.d,
    )!;
    expect(bedRect.x).toBe(bed.mapX - bed.footprint!.w / 2);
    expect(bedRect.y).toBe(bed.mapY - bed.footprint!.d);
  });

  it('applies the desk collider offsets so it clears the spawn and the exit', () => {
    const dressing = getRoomDressing('recipient-house')!;
    const desk = dressing.props.find((p) => p.frame === 'desk')!;
    const colliders = getPropColliders(dressing);

    const deskRect = colliders.find(
      (c) =>
        c.width === desk.footprint!.w &&
        c.height === desk.footprint!.d &&
        c.y === desk.mapY - desk.footprint!.d + (desk.colliderOffsetY ?? 0),
    )!;
    expect(deskRect.x).toBe(
      desk.mapX - desk.footprint!.w / 2 + (desk.colliderOffsetX ?? 0),
    );
    // The recipient-pc spawn is at map (704, 768); the collider sits south of it so
    // the player is never trapped, and north of the exit rect (y 864).
    expect(deskRect.y).toBeGreaterThan(768);
    expect(deskRect.y + deskRect.height).toBeLessThan(864);
  });
});
