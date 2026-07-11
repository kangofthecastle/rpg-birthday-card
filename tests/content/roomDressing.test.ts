import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyRoomLayout,
  computeRemovedTombstones,
  getPropColliders,
  getRoomDressing,
  isSinglesOnlyProp,
  isValidRoomLayoutFile,
  listPropOverrideCandidates,
  propOverrideTextureKey,
  propOverrideUrl,
} from '../../src/content/roomDressing';

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

function loadRecipientHouseObjects(layerName: string): readonly TiledObjectJson[] {
  const raw = readFileSync(resolve(__dirname, '../../public/maps/recipient-house.tmj'), 'utf8');
  const map = JSON.parse(raw) as { layers: readonly TiledLayerJson[] };
  const layer = map.layers.find((candidate) => candidate.name === layerName);
  return layer?.objects ?? [];
}

function loadRecipientHouseInteractables(): readonly TiledObjectJson[] {
  return loadRecipientHouseObjects('Interactables');
}

describe('getRoomDressing', () => {
  it('returns undefined for undressed locations', () => {
    expect(getRoomDressing('main-outside')).toBeUndefined();
    expect(getRoomDressing('final-spot')).toBeUndefined();
  });

  it('dresses ____, ____ (friend-a) and ____ (friend-b) with valid crops', () => {
    for (const locationId of ['recipient-house', 'friend-a', 'friend-b']) {
      const dressing = getRoomDressing(locationId);
      expect(dressing, locationId).toBeDefined();

      for (const placement of dressing!.props) {
        const frame = dressing!.frames[placement.frame];
        // Singles-only props (standalone art, no sheet crop) legitimately have
        // no frame entry — skip the crop-bounds checks for them.
        if (!frame) {
          expect(isSinglesOnlyProp(dressing!, placement), placement.frame).toBe(true);
          continue;
        }
        expect(frame.x, placement.frame).toBeGreaterThanOrEqual(0);
        expect(frame.y, placement.frame).toBeGreaterThanOrEqual(0);
        expect(frame.w, placement.frame).toBeGreaterThan(0);
        expect(frame.h, placement.frame).toBeGreaterThan(0);
        expect(frame.x + frame.w, placement.frame).toBeLessThanOrEqual(SHEET_SIZE);
        expect(frame.y + frame.h, placement.frame).toBeLessThanOrEqual(SHEET_SIZE);
      }
    }
  });

  it('provides an recipient-house dressing whose sheet props reference defined frames', () => {
    const dressing = getRoomDressing('recipient-house');
    expect(dressing).toBeDefined();

    for (const placement of dressing!.props) {
      // Every prop either has a real sheet crop or is singles-only.
      const hasFrame = dressing!.frames[placement.frame] !== undefined;
      expect(hasFrame || isSinglesOnlyProp(dressing!, placement), placement.frame).toBe(true);
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

  it('hangs both windows on the back-left wall, sheared to that wall', () => {
    const dressing = getRoomDressing('recipient-house')!;
    const windows = dressing.props.filter((p) => p.frame === 'window');

    // Two windows, both light sources (the owner asked for more light).
    expect(windows.length).toBe(2);

    // Both hang on the back-left (west) wall and share its shear -0.5. The
    // back-right/north wall window (shear +0.5) was removed — it never read
    // right on that wall — so no window carries a positive shear.
    const leftWall = windows.filter((w) => w.wallShear === -0.5);
    const rightWall = windows.filter((w) => (w.wallShear ?? 0) > 0);
    expect(leftWall.length).toBe(2);
    expect(rightWall.length).toBe(0);

    // Every window is wall decor: no footprint/collider, fixed depth behind the
    // billboards, matching the original window's non-awakened treatment.
    for (const win of windows) {
      expect(win.footprint).toBeUndefined();
      expect(win.fixedDepth).toBeLessThan(0);
    }
  });

  it('sizes floor props against the player via heightRatio, keeping bed largest', () => {
    const dressing = getRoomDressing('recipient-house')!;
    const byFrame = (frame: string) => dressing.props.find((p) => p.frame === frame)!;

    // Solid floor props are sized by heightRatio (player-relative), not by an
    // ad-hoc scale, so they read consistently against ____.
    for (const frame of ['bed', 'desk', 'kitchen', 'monstera', 'pothos']) {
      expect(byFrame(frame).heightRatio, frame).toBeGreaterThan(0);
      expect(byFrame(frame).scale, frame).toBeUndefined();
    }

    // Cozy-RPG canon: the bed is the largest floor prop, with the desk cluster a
    // hair behind it (the author's dressEdit pass resized the bed down to ~1.5x
    // the player — no longer a full 2x tower, but still the biggest thing in the
    // room, and still clearly above the kitchenette table).
    expect(byFrame('bed').heightRatio!).toBeGreaterThan(byFrame('desk').heightRatio!);
    expect(byFrame('bed').heightRatio!).toBeCloseTo(1.5, 1);
    expect(byFrame('desk').heightRatio!).toBeGreaterThan(byFrame('kitchen').heightRatio!);

    // The flat rug is not height-sized; it keeps an explicit scale.
    expect(byFrame('rug').scale).toBeGreaterThan(0);
    expect(byFrame('rug').heightRatio).toBeUndefined();
  });
});

describe('room layout overrides', () => {
  // The three dressed rooms ship an authored layout at
  // src/content/roomLayouts/<id>.json which REPLACES the in-code fallback props
  // at load time (the dressEdit Save button writes these). Verify the loaded
  // dressing reflects the JSON file so normal play renders the persisted layout.
  const roomsWithLayouts = ['recipient-house', 'friend-a', 'friend-b'] as const;

  function loadLayout(locationId: string): { locationId: string; props: unknown[] } {
    const raw = readFileSync(
      resolve(__dirname, `../../src/content/roomLayouts/${locationId}.json`),
      'utf8',
    );
    return JSON.parse(raw) as { locationId: string; props: unknown[] };
  }

  it('loads each room’s props from its authored layout JSON', () => {
    for (const locationId of roomsWithLayouts) {
      const layout = loadLayout(locationId);
      expect(layout.locationId, locationId).toBe(locationId);
      const dressing = getRoomDressing(locationId);
      expect(dressing, locationId).toBeDefined();
      // The saved JSON props render verbatim as the leading run of the layout
      // (deep equality proves the override path is what normal play renders)...
      expect(dressing!.props.slice(0, layout.props.length), locationId).toEqual(layout.props);
      // ...and any trailing props are singles-only slots merged in from TS (new
      // standalone-art props the author has not yet arranged + Saved).
      for (const extra of dressing!.props.slice(layout.props.length)) {
        expect(isSinglesOnlyProp(dressing!, extra), `${locationId} ${extra.frame}`).toBe(true);
      }
    }
  });

  it('merges TS-declared singles-only props not yet in the saved JSON layout', () => {
    // These new standalone-art props are registered in TS but absent from the
    // saved JSON; the merge appends them so they appear without a Save first.
    const expected: Record<string, readonly string[]> = {
      'recipient-house': ['bedside-table', 'armchair'],
      'friend-a': ['plant-1', 'plant-2', 'fishbowl-table'],
      'friend-b': ['plant-1', 'plant-2', 'bookshelf', 'floor-lamp', 'game-stack'],
    };
    for (const [locationId, frames] of Object.entries(expected)) {
      const dressing = getRoomDressing(locationId)!;
      for (const frame of frames) {
        const prop = dressing.props.find((p) => p.frame === frame);
        expect(prop, `${locationId} ${frame}`).toBeDefined();
        expect(isSinglesOnlyProp(dressing, prop!), `${locationId} ${frame}`).toBe(true);
        expect(prop!.heightRatio, `${locationId} ${frame}`).toBeGreaterThan(0);
        // No footprint: placeholder decor, so an absent art file leaves no
        // invisible collider (and dressEdit cannot author footprints anyway).
        expect(prop!.footprint, `${locationId} ${frame}`).toBeUndefined();
      }
    }
  });

  it('validates room-layout payloads for the dev save endpoint', () => {
    expect(isValidRoomLayoutFile(loadLayout('recipient-house'))).toBe(true);
    expect(
      isValidRoomLayoutFile({ locationId: 'x', props: [{ frame: 'a', mapX: 1, mapY: 2 }] }),
    ).toBe(true);
    expect(isValidRoomLayoutFile(null)).toBe(false);
    expect(isValidRoomLayoutFile({ locationId: 'x' })).toBe(false);
    expect(isValidRoomLayoutFile({ locationId: 'x', props: [{ mapX: 1, mapY: 2 }] })).toBe(false);
    expect(
      isValidRoomLayoutFile({ locationId: 'x', props: [{ frame: 'a', mapX: 'no', mapY: 2 }] }),
    ).toBe(false);
  });

  it('accepts an optional string[] `removed` tombstone list, rejecting bad shapes', () => {
    // A save carrying tombstones round-trips through the validator...
    const payload = {
      locationId: 'recipient-house',
      props: [{ frame: 'bed', mapX: 1, mapY: 2 }],
      removed: ['armchair'],
    };
    expect(isValidRoomLayoutFile(payload)).toBe(true);
    // ...and survives a JSON round-trip (what the dev endpoint persists/reloads).
    expect(isValidRoomLayoutFile(JSON.parse(JSON.stringify(payload)))).toBe(true);
    expect(isValidRoomLayoutFile({ locationId: 'x', props: [], removed: [] })).toBe(true);
    expect(isValidRoomLayoutFile({ locationId: 'x', props: [], removed: 'armchair' })).toBe(false);
    expect(isValidRoomLayoutFile({ locationId: 'x', props: [], removed: [1] })).toBe(false);
  });
});

describe('singles-only tombstones', () => {
  // The recipient dressing carries two singles-only props (armchair, bedside-table)
  // that the merge appends unless the saved layout deletes them.
  const dressing = getRoomDressing('recipient-house')!;

  it('re-merges singles-only props absent from the layout, but NOT tombstoned ones', () => {
    // With an empty saved layout and no tombstones, every singles-only prop is
    // re-appended (the auto-merge that makes newly-registered art appear).
    const merged = applyRoomLayout(dressing, { props: [], removed: [] });
    const frames = merged.props.map((p) => p.frame);
    expect(frames).toContain('armchair');
    expect(frames).toContain('bedside-table');

    // Tombstoning `armchair` keeps it gone across the reload (the bug fix): it is
    // not re-merged, while the untombstoned bedside-table still is.
    const withTombstone = applyRoomLayout(dressing, { props: [], removed: ['armchair'] });
    const tombstonedFrames = withTombstone.props.map((p) => p.frame);
    expect(tombstonedFrames).not.toContain('armchair');
    expect(tombstonedFrames).toContain('bedside-table');
  });

  it('computes the tombstone set from previous + session removals, minus present', () => {
    // Previously-tombstoned ids still absent, plus this session's removals.
    expect(computeRemovedTombstones(['bed', 'desk'], ['armchair'], ['pothos']).sort()).toEqual([
      'armchair',
      'pothos',
    ]);
    // A previously-tombstoned id with no props still present stays tombstoned.
    expect(computeRemovedTombstones(['bed'], ['armchair'], [])).toEqual(['armchair']);
    // De-duplicated across the two sources.
    expect(computeRemovedTombstones([], ['armchair'], ['armchair'])).toEqual(['armchair']);
    // A present frame is never tombstoned (a sheet prop with another placement,
    // or a kept prop), even if it appears in the previous set.
    expect(computeRemovedTombstones(['bed'], ['bed'], [])).toEqual([]);
  });

  it('clears a tombstone when the removal is undone (frame back among present)', () => {
    // Undo re-adds the prop to entries[], so its frame is "present" and drops out
    // of the tombstone set — Cmd/Z of a delete un-tombstones it.
    expect(computeRemovedTombstones(['armchair'], [], ['armchair'])).toEqual([]);
    // And an initially-tombstoned prop that gets restored is likewise cleared.
    expect(computeRemovedTombstones(['armchair'], ['armchair'], [])).toEqual([]);
  });
});

describe('per-prop standalone override slots', () => {
  it('builds the slot key/url convention as <locationId>-<frame>', () => {
    expect(propOverrideUrl('recipient-house', 'bed')).toBe('/assets/props/singles/recipient-house-bed.png');
    expect(propOverrideUrl('friend-a', 'bed')).toBe('/assets/props/singles/friend-a-bed.png');
    expect(propOverrideUrl('friend-b', 'bed')).toBe('/assets/props/singles/friend-b-bed.png');
    expect(propOverrideTextureKey('recipient-house', 'bed')).toBe('prop-override:recipient-house:bed');
  });

  it('lists a de-duplicated override candidate for every room prop, including the beds', () => {
    const candidates = listPropOverrideCandidates();

    // Unique per (location, frame).
    const ids = candidates.map((c) => `${c.locationId}:${c.frame}`);
    expect(new Set(ids).size).toBe(ids.length);

    // Each candidate's key/url follows the convention.
    for (const c of candidates) {
      expect(c.key).toBe(propOverrideTextureKey(c.locationId, c.frame));
      expect(c.url).toBe(propOverrideUrl(c.locationId, c.frame));
    }

    // The three beds each get a slot (the first expected real drop-ins).
    for (const locationId of ['recipient-house', 'friend-a', 'friend-b']) {
      expect(
        candidates.some((c) => c.locationId === locationId && c.frame === 'bed'),
        `${locationId} bed slot`,
      ).toBe(true);
    }

    // Singles-only props expose a slot too (their only art source).
    expect(candidates.some((c) => c.locationId === 'friend-b' && c.frame === 'bookshelf')).toBe(true);
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

  it('keeps every prop collider clear of the spawns and the exit corridor', () => {
    const dressing = getRoomDressing('recipient-house')!;
    const desk = dressing.props.find((p) => p.frame === 'desk')!;
    const colliders = getPropColliders(dressing);

    // The desk still applies its authored collider offsets (colliderOffsetX/Y
    // tuck the compact collider under the chair, west + south of the raw anchor).
    const deskRect = colliders.find(
      (c) =>
        c.width === desk.footprint!.w &&
        c.height === desk.footprint!.d &&
        c.y === desk.mapY - desk.footprint!.d + (desk.colliderOffsetY ?? 0),
    )!;
    expect(deskRect.x).toBe(
      desk.mapX - desk.footprint!.w / 2 + (desk.colliderOffsetX ?? 0),
    );

    // Real invariant: the player arrives on a spawn point and leaves through the
    // exit rect, so no static prop collider may sit on either — otherwise the
    // player is trapped on entry or the doorway is blocked. Read both from the
    // map (the same source the scene uses) rather than hard-coding coordinates.
    const spawns = loadRecipientHouseObjects('Spawns');
    const exits = loadRecipientHouseObjects('Exits');

    const overlaps = (
      rect: { x: number; y: number; width: number; height: number },
      x: number,
      y: number,
      w: number,
      h: number,
    ): boolean =>
      rect.x < x + w && rect.x + rect.width > x && rect.y < y + h && rect.y + rect.height > y;

    // Point spawns get a small standing footprint (the player is not a zero-size
    // point); the exit already carries its own rect.
    const SPAWN_HALF = 24;
    for (const collider of colliders) {
      for (const spawn of spawns) {
        expect(
          overlaps(
            collider,
            spawn.x - SPAWN_HALF,
            spawn.y - SPAWN_HALF,
            SPAWN_HALF * 2,
            SPAWN_HALF * 2,
          ),
          `collider overlaps spawn ${spawn.name}`,
        ).toBe(false);
      }
      for (const exit of exits) {
        expect(
          overlaps(collider, exit.x, exit.y, exit.width ?? 0, exit.height ?? 0),
          `collider overlaps exit ${exit.name}`,
        ).toBe(false);
      }
    }

    // The desk specifically now sits well north of the front-door/near-pc spawn
    // (704, 768) after the dressEdit rearrange, so its collider clears the whole
    // spawn->exit corridor. Guards against a regression that drops it back south.
    expect(deskRect.y + deskRect.height).toBeLessThan(768);
  });
});
