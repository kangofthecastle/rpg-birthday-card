import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyRoomLayout,
  computeRemovedTombstones,
  getPropColliders,
  getRoomDressing,
  getRoomLayoutNpcs,
  getRoomLayoutRemoved,
  isSinglesOnlyProp,
  isValidRoomLayoutFile,
  listPropOverrideCandidates,
  propOverrideTextureKey,
  propOverrideUrl,
  type RoomDressing,
} from '../../src/content/roomDressing';
import { HOME_HOST_NPCS, resolveHomeNpcPosition } from '../../src/content/homeNpcs';

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

  it('places a real prop, inside the room, for every interactable-linked frame', () => {
    const dressing = getRoomDressing('recipient-house')!;
    const interactables = loadRecipientHouseInteractables();
    // Interactable id -> prop frame carrying its art. The story interactions
    // need both halves to EXIST — the map rect (trigger) and a placed prop (the
    // art the prompt reads on) — so pair existence is a real gameplay invariant.
    // Their RELATIVE positions are not: the owner rearranges furniture in
    // dressEdit first and re-wires the interact rect afterwards in M-mode, so a
    // transient prop<->rect drift is an expected mid-editing state. (An earlier
    // version pinned |dx| <= 64 / |dy| <= 96 proximity and failed the moment the
    // bed moved before its rect did — no distance canon here.)
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ['recipient-bed', 'bed'],
      ['recipient-pc', 'desk'],
      ['recipient-violin', 'violin'],
      ['recipient-mango-rice', 'kitchen'],
      ['recipient-photo-wall', 'photoWall'],
    ];

    // Room bounds in map px, read from the same map the scene renders.
    const raw = readFileSync(resolve(__dirname, '../../public/maps/recipient-house.tmj'), 'utf8');
    const map = JSON.parse(raw) as {
      width: number;
      height: number;
      tilewidth: number;
      tileheight: number;
    };
    const mapW = map.width * map.tilewidth;
    const mapH = map.height * map.tileheight;

    for (const [objectName, frameName] of pairs) {
      const rect = interactables.find((candidate) => candidate.name === objectName);
      expect(rect, objectName).toBeDefined();

      const placement = dressing.props.find((candidate) => candidate.frame === frameName);
      expect(placement, frameName).toBeDefined();

      // Structural only: the anchor is a real, finite point inside the room.
      expect(Number.isFinite(placement!.mapX), `${frameName} mapX finite`).toBe(true);
      expect(Number.isFinite(placement!.mapY), `${frameName} mapY finite`).toBe(true);
      expect(placement!.mapX, `${frameName} mapX`).toBeGreaterThanOrEqual(0);
      expect(placement!.mapX, `${frameName} mapX`).toBeLessThanOrEqual(mapW);
      expect(placement!.mapY, `${frameName} mapY`).toBeGreaterThanOrEqual(0);
      expect(placement!.mapY, `${frameName} mapY`).toBeLessThanOrEqual(mapH);
    }
  });

  it('hangs windows as wall decor sheared to a back wall', () => {
    // Don't pin how many windows exist or which wall each lands on — dressEdit
    // can add, remove, or re-hang them freely (an earlier version hard-asserted
    // exactly two windows, both on the back-left wall). Whatever windows exist,
    // across every dressed room, must be valid wall decor; zero is also fine.
    const windows = ['recipient-house', 'friend-a', 'friend-b'].flatMap((locationId) =>
      getRoomDressing(locationId)!.props.filter((p) => p.frame === 'window'),
    );

    for (const win of windows) {
      // Wall decor: no footprint/collider, and a fixed depth behind the
      // billboards (never depth-sorted against the player like a floor prop).
      expect(win.footprint, 'window footprint').toBeUndefined();
      expect(win.fixedDepth!, 'window fixedDepth').toBeLessThan(0);
      // Sized as flat art (scale), not player-relative height.
      expect(win.heightRatio, 'window heightRatio').toBeUndefined();
      // If sheared, it follows a back wall's screen slope (±0.5) — either wall,
      // not left-only.
      if (win.wallShear !== undefined) {
        expect(Math.abs(win.wallShear), 'window wallShear').toBeCloseTo(0.5, 5);
      }
    }
  });

  it('sizes props by exactly one mode — floor props by heightRatio, flat art by scale', () => {
    // Structural sizing invariants that hold for ANY authored layout. The owner
    // edits these rooms freely in-game via dressEdit, which never pins a prop to a
    // specific size or ranks props against each other (an earlier version of this
    // test asserted bed ≈ 1.5x and bed > desk > kitchen, and broke the moment a
    // dressEdit pass nudged the desk a hair past the bed). Two sizing modes exist
    // and are mutually exclusive: `heightRatio` (player-relative, for floor-
    // standing props) and `scale` (for flat/wall art where height is not the
    // measure). resolvePropScale in the renderer prefers heightRatio, and
    // dressEdit only ever edits whichever one a prop already carries — so assert
    // the *rules* every prop obeys, not the current taste of any one prop.
    for (const locationId of ['recipient-house', 'friend-a', 'friend-b']) {
      const dressing = getRoomDressing(locationId);
      expect(dressing, locationId).toBeDefined();

      for (const prop of dressing!.props) {
        const where = `${locationId} ${prop.frame}`;
        const hasHeight = prop.heightRatio !== undefined;
        const hasScale = prop.scale !== undefined;

        // A prop is sized by exactly one mode, never both (they would fight).
        expect(hasHeight && hasScale, `${where}: sized by both heightRatio and scale`).toBe(false);

        if (hasHeight) {
          // Player-relative height: a positive, finite multiple within a sane
          // band — never a fraction of a pixel, never many times the player.
          expect(Number.isFinite(prop.heightRatio), `${where} heightRatio finite`).toBe(true);
          expect(prop.heightRatio!, `${where} heightRatio`).toBeGreaterThan(0);
          expect(prop.heightRatio!, `${where} heightRatio`).toBeLessThan(6);
        }
        if (hasScale) {
          expect(Number.isFinite(prop.scale), `${where} scale finite`).toBe(true);
          expect(prop.scale!, `${where} scale`).toBeGreaterThan(0);
          expect(prop.scale!, `${where} scale`).toBeLessThan(10);
        }

        // A solid floor prop (one carrying a footprint/collider) is floor-
        // standing, so it is always sized player-relative by heightRatio — never
        // by an ad-hoc scale. Flat/wall art carries no footprint (see
        // getPropColliders below), so this pins the floor-vs-flat sizing rule
        // without naming a single specific prop.
        if (prop.footprint) {
          expect(hasHeight, `${where}: footprint prop must be sized by heightRatio`).toBe(true);
        }
      }
    }
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
    // The saved JSON props render verbatim as the leading run of the layout; any
    // prop merged in BEYOND them is a TS-declared singles-only slot the author
    // has not yet arranged + Saved (the auto-merge that makes newly-registered
    // standalone art appear without a Save first).
    //
    // This asserts the merge INVARIANT rather than a hardcoded roster of frame
    // ids: whatever those merged props turn out to be, they must be valid
    // standalone decor — singles-only, player-sized, and free of an authored
    // collider — and a frame the author has tombstoned must never be among them.
    // Deriving the set from the actual layout + tombstone list keeps this correct
    // across ANY future dressEdit Save (which freely changes which props are
    // saved vs. tombstoned vs. merged).
    for (const locationId of roomsWithLayouts) {
      const layout = loadLayout(locationId);
      const dressing = getRoomDressing(locationId)!;

      // Props merged in from TS = the tail past the saved layout's own props.
      const mergedIn = dressing.props.slice(layout.props.length);
      for (const prop of mergedIn) {
        expect(isSinglesOnlyProp(dressing, prop), `${locationId} ${prop.frame}`).toBe(true);
        expect(prop.heightRatio, `${locationId} ${prop.frame}`).toBeGreaterThan(0);
        // No footprint: placeholder decor, so an absent art file leaves no
        // invisible collider (and dressEdit cannot author footprints anyway).
        expect(prop.footprint, `${locationId} ${prop.frame}`).toBeUndefined();
      }

      // A tombstoned frame is a deliberate deletion: never re-merged into play.
      const mergedFrames = new Set(mergedIn.map((p) => p.frame));
      for (const frame of getRoomLayoutRemoved(locationId)) {
        expect(mergedFrames.has(frame), `${locationId} re-merged tombstoned ${frame}`).toBe(false);
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

describe('home NPC position overrides', () => {
  // dressEdit writes each home NPC's dragged feet position into the room layout's
  // optional `npcs` section (keyed by NPC id). LocationScene reads that override
  // when present, and falls back to the TS default when absent — the same
  // JSON-overrides-TS rule the props follow.

  it('accepts an optional `npcs` position map, rejecting bad shapes', () => {
    // A save carrying an npcs section round-trips through the validator...
    const payload = {
      locationId: 'friend-a',
      props: [{ frame: 'bed', mapX: 1, mapY: 2 }],
      npcs: { friendone: { x: 900, y: 540 } },
    };
    expect(isValidRoomLayoutFile(payload)).toBe(true);
    // ...and survives the JSON round-trip the dev endpoint persists/reloads.
    expect(isValidRoomLayoutFile(JSON.parse(JSON.stringify(payload)))).toBe(true);
    // Empty section and multiple residents are fine.
    expect(isValidRoomLayoutFile({ locationId: 'x', props: [], npcs: {} })).toBe(true);
    expect(
      isValidRoomLayoutFile({
        locationId: 'x',
        props: [],
        npcs: { friendone: { x: 1, y: 2 }, friendtwo: { x: 3, y: 4 } },
      }),
    ).toBe(true);
    // Bad shapes are rejected: array, non-object position, missing/non-number x/y.
    expect(isValidRoomLayoutFile({ locationId: 'x', props: [], npcs: [] })).toBe(false);
    expect(isValidRoomLayoutFile({ locationId: 'x', props: [], npcs: { friendone: 5 } })).toBe(false);
    expect(isValidRoomLayoutFile({ locationId: 'x', props: [], npcs: { friendone: null } })).toBe(false);
    expect(isValidRoomLayoutFile({ locationId: 'x', props: [], npcs: { friendone: { x: 1 } } })).toBe(
      false,
    );
    expect(
      isValidRoomLayoutFile({ locationId: 'x', props: [], npcs: { friendone: { x: 'no', y: 2 } } }),
    ).toBe(false);
  });

  it('applies an override position over the TS default, per NPC id', () => {
    const friendone = HOME_HOST_NPCS['friend-a'];
    const resolved = resolveHomeNpcPosition(friendone, { friendone: { x: 912, y: 544 } });
    expect(resolved).toEqual({ mapX: 912, mapY: 544 });
    // An override for a DIFFERENT id doesn't touch this NPC (falls back).
    const other = resolveHomeNpcPosition(friendone, { friendtwo: { x: 1, y: 2 } });
    expect(other).toEqual({ mapX: friendone.mapX, mapY: friendone.mapY });
  });

  it('falls back to the TS default when no override is present', () => {
    const friendtwo = HOME_HOST_NPCS['friend-b'];
    expect(resolveHomeNpcPosition(friendtwo, {})).toEqual({
      mapX: friendtwo.mapX,
      mapY: friendtwo.mapY,
    });
    // The shipped layouts carry no npcs section yet, so the loader returns {} and
    // every resident keeps its TS-default feet position.
    for (const [locationId, npc] of Object.entries(HOME_HOST_NPCS)) {
      const overrides = getRoomLayoutNpcs(locationId);
      expect(resolveHomeNpcPosition(npc, overrides)).toEqual({
        mapX: npc.mapX,
        mapY: npc.mapY,
      });
    }
  });
});

describe('singles-only tombstones', () => {
  // Exercise the merge/tombstone behavior against a small synthetic dressing so
  // the assertions test the INVARIANT — un-tombstoned singles re-merge, a
  // tombstoned single stays gone — rather than whichever specific props the
  // author currently has saved or tombstoned in the canon room JSONs (which he
  // edits freely in-game via dressEdit). A prop is singles-only when its `frame`
  // has no crop in `frames`; `sheetProp` has one, `single-a`/`single-b` do not.
  function makeFixture(): RoomDressing {
    return {
      locationId: 'test-room',
      tilesTextureKey: 'test-tiles',
      floorFrame: 0,
      wallFrame: 1,
      propsTextureKey: 'test-props',
      frames: { sheetProp: { x: 0, y: 0, w: 32, h: 32 } },
      floorInsetTiles: 1,
      wallHeight: 96,
      backgroundColor: '#000000',
      props: [
        { frame: 'sheetProp', mapX: 100, mapY: 100, heightRatio: 1 },
        { frame: 'single-a', mapX: 200, mapY: 200, heightRatio: 0.8 },
        { frame: 'single-b', mapX: 300, mapY: 300, heightRatio: 0.6 },
      ],
    };
  }

  it('re-merges singles-only props absent from the layout, but NOT tombstoned ones', () => {
    const dressing = makeFixture();
    // Sanity-check the fixture's singles-only classification the merge relies on.
    const bySheet = dressing.props.find((p) => p.frame === 'sheetProp')!;
    const bySingle = dressing.props.find((p) => p.frame === 'single-a')!;
    expect(isSinglesOnlyProp(dressing, bySheet)).toBe(false);
    expect(isSinglesOnlyProp(dressing, bySingle)).toBe(true);

    // With an empty saved layout and no tombstones, every singles-only prop is
    // re-appended (the auto-merge that makes newly-registered art appear). The
    // sheet-backed prop is NOT re-merged — sheet props must be explicitly saved.
    const merged = applyRoomLayout(dressing, { props: [], removed: [] });
    const frames = merged.props.map((p) => p.frame);
    expect(frames).toContain('single-a');
    expect(frames).toContain('single-b');
    expect(frames).not.toContain('sheetProp');

    // Tombstoning `single-a` keeps it gone across the reload (the bug fix): it is
    // not re-merged, while the untombstoned single-b still is.
    const withTombstone = applyRoomLayout(dressing, { props: [], removed: ['single-a'] });
    const tombstonedFrames = withTombstone.props.map((p) => p.frame);
    expect(tombstonedFrames).not.toContain('single-a');
    expect(tombstonedFrames).toContain('single-b');
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

  it('lists exactly one de-duplicated override candidate for every room prop', () => {
    const candidates = listPropOverrideCandidates();

    // Unique per (location, frame).
    const ids = candidates.map((c) => `${c.locationId}:${c.frame}`);
    expect(new Set(ids).size).toBe(ids.length);

    // Each candidate's key/url follows the convention.
    for (const c of candidates) {
      expect(c.key).toBe(propOverrideTextureKey(c.locationId, c.frame));
      expect(c.url).toBe(propOverrideUrl(c.locationId, c.frame));
    }

    // The real contract BootScene relies on: the candidate set is EXACTLY the
    // de-duplicated set of (location, frame) over every prop the dressed rooms
    // actually render — one probe slot per placed prop, none for a prop that
    // isn't there. Derived from the live dressings, so it holds for ANY authored
    // layout instead of pinning a hand-listed roster (beds, friend-b bookshelf,
    // ...) that a dressEdit tombstone could drop out from under the test.
    const expected = new Set<string>();
    for (const locationId of ['recipient-house', 'friend-a', 'friend-b']) {
      for (const prop of getRoomDressing(locationId)!.props) {
        expected.add(`${locationId}:${prop.frame}`);
      }
    }
    expect(new Set(ids)).toEqual(expected);
  });
});

describe('getPropColliders', () => {
  it('emits a collider only for solid props (footprint), never for flat/wall art', () => {
    // Rule-based, not roster-based (an earlier version name-checked rug/window/
    // photoWall/violin/camera, a list a dressEdit save could invalidate): a
    // prop pinned to a fixed render depth is flat/wall art (rug, window, wall
    // posters...) and must never carry a footprint/collider — checked across
    // every dressed room.
    for (const locationId of ['recipient-house', 'friend-a', 'friend-b']) {
      const dressing = getRoomDressing(locationId)!;
      const withFootprint = dressing.props.filter((p) => p.footprint).length;
      const colliders = getPropColliders(dressing);

      // Exactly one collider per footprint prop; flat/wall/pass-through props
      // contribute nothing.
      expect(colliders, locationId).toHaveLength(withFootprint);

      for (const prop of dressing.props) {
        const where = `${locationId} ${prop.frame}`;
        if (prop.fixedDepth !== undefined || prop.wallShear !== undefined) {
          expect(prop.footprint, `${where}: flat/wall art must not collide`).toBeUndefined();
        }
      }
    }
  });

  it('derives every collider from its prop footprint, extending back from the anchor', () => {
    // The full derivation contract of getPropColliders, for EVERY footprint prop
    // in every room (an earlier version spot-checked only the bed and desk):
    // rect = anchor - w/2 (+offsetX), anchor - d (+offsetY), size w x d, emitted
    // in prop order. Holds for any authored layout since it is derived from the
    // props themselves.
    for (const locationId of ['recipient-house', 'friend-a', 'friend-b']) {
      const dressing = getRoomDressing(locationId)!;
      const expected = dressing.props
        .filter((p) => p.footprint)
        .map((p) => ({
          x: p.mapX - p.footprint!.w / 2 + (p.colliderOffsetX ?? 0),
          y: p.mapY - p.footprint!.d + (p.colliderOffsetY ?? 0),
          width: p.footprint!.w,
          height: p.footprint!.d,
        }));
      expect(getPropColliders(dressing), locationId).toEqual(expected);
    }
  });

  it('keeps every prop collider clear of the spawns and the exit corridor', () => {
    const dressing = getRoomDressing('recipient-house')!;
    const colliders = getPropColliders(dressing);

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
    // NB: deliberately no per-prop coordinate pins (an earlier version asserted
    // the desk collider ended north of y=768) — any dressEdit rearrange that
    // keeps every collider off the spawns and the exit passes.
  });
});
