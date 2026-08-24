import { describe, expect, it } from 'vitest';
import {
  applyOutdoorLayout,
  getOutdoorLayout,
  getOutdoorLayoutRemoved,
  getOutdoorProps,
  getOutdoorSignposts,
  getSignposts,
  isValidOutdoorLayoutFile,
  outdoorPlacementId,
  PROP_KINDS,
  SIGNPOST_PROP_NAME,
  withOutdoorIds,
  type PropPlacement,
} from '../../src/content/outdoorScenery';

// The outdoor areas whose OUTDOOR_PROPS the ?dressEdit=1 editor arranges. Mirrors
// the room-dressing layout system: a saved JSON at outdoorLayouts/<id>.json
// REPLACES these placements, with removed[] tombstones + re-merge of TS additions.
const OUTDOOR_AREAS = ['main-outside', 'friendtwo-yard', 'friendone-yard', 'clearing'] as const;

describe('outdoor prop id stamping', () => {
  it('stamps a stable `<name>#<occurrence>` id per placement, per name', () => {
    const stamped = withOutdoorIds([
      { name: 'tree-1', mapX: 0, mapY: 0 },
      { name: 'bush-1', mapX: 0, mapY: 0 },
      { name: 'tree-1', mapX: 0, mapY: 0 },
      { name: 'tree-1', mapX: 0, mapY: 0 },
    ]);
    expect(stamped.map((p) => p.id)).toEqual([
      outdoorPlacementId('tree-1', 0),
      outdoorPlacementId('bush-1', 0),
      outdoorPlacementId('tree-1', 1),
      outdoorPlacementId('tree-1', 2),
    ]);
  });

  it('preserves an already-present id (e.g. from a saved layout)', () => {
    const stamped = withOutdoorIds([{ id: 'custom#7', name: 'tree-1', mapX: 1, mapY: 2 }]);
    expect(stamped[0].id).toBe('custom#7');
  });

  it('gives every real area prop a unique, stable id', () => {
    for (const area of OUTDOOR_AREAS) {
      const props = getOutdoorProps(area);
      const ids = props.map((p) => p.id);
      expect(ids.every((id) => typeof id === 'string'), area).toBe(true);
      expect(new Set(ids).size, area).toBe(ids.length);
    }
  });
});

describe('applyOutdoorLayout merge + tombstones', () => {
  // Synthetic base so the assertions test the INVARIANT (un-tombstoned TS props
  // re-merge; a tombstoned one stays gone) rather than a specific saved roster.
  function base(): PropPlacement[] {
    return withOutdoorIds([
      { name: 'tree-1', mapX: 100, mapY: 100 },
      { name: 'bush-1', mapX: 200, mapY: 200 },
      { name: 'rock-1', mapX: 300, mapY: 300 },
    ]);
  }

  it('replaces props with the saved layout, moved positions winning', () => {
    const saved: PropPlacement[] = [
      { id: outdoorPlacementId('tree-1', 0), name: 'tree-1', mapX: 111, mapY: 222 },
      { id: outdoorPlacementId('bush-1', 0), name: 'bush-1', mapX: 200, mapY: 200 },
      { id: outdoorPlacementId('rock-1', 0), name: 'rock-1', mapX: 300, mapY: 300 },
    ];
    const merged = applyOutdoorLayout(base(), { props: saved, removed: [] });
    // The moved tree's saved position renders (override wins over the TS default).
    const tree = merged.find((p) => p.id === outdoorPlacementId('tree-1', 0))!;
    expect(tree.mapX).toBe(111);
    expect(tree.mapY).toBe(222);
    expect(merged).toHaveLength(3);
  });

  it('re-merges a NEW TS placement absent from the saved layout, but NOT a tombstoned one', () => {
    // Saved layout only carries the tree; the bush + rock are "new" relative to it.
    const saved: PropPlacement[] = [
      { id: outdoorPlacementId('tree-1', 0), name: 'tree-1', mapX: 111, mapY: 222 },
    ];

    // No tombstones: both absent TS props re-merge (newly-registered art appears).
    const merged = applyOutdoorLayout(base(), { props: saved, removed: [] });
    const ids = merged.map((p) => p.id);
    expect(ids).toContain(outdoorPlacementId('bush-1', 0));
    expect(ids).toContain(outdoorPlacementId('rock-1', 0));

    // Tombstoning the bush keeps it gone across the reload; the rock still re-merges.
    const withTombstone = applyOutdoorLayout(base(), {
      props: saved,
      removed: [outdoorPlacementId('bush-1', 0)],
    });
    const tombstonedIds = withTombstone.map((p) => p.id);
    expect(tombstonedIds).not.toContain(outdoorPlacementId('bush-1', 0));
    expect(tombstonedIds).toContain(outdoorPlacementId('rock-1', 0));
  });

  it('never re-merges a TS placement the saved layout already carries', () => {
    const saved: PropPlacement[] = base(); // all three saved, verbatim
    const merged = applyOutdoorLayout(base(), { props: saved, removed: [] });
    // Exactly the three saved props — no duplicates appended.
    expect(merged).toHaveLength(3);
    expect(merged.filter((p) => p.name === 'tree-1')).toHaveLength(1);
  });
});

describe('real area layout overrides', () => {
  // Ships with no authored outdoor layouts (OUTDOOR_PROPS is authoritative until
  // the author Saves in-game); getOutdoorProps then equals the TS base + ids.
  it('returns the TS-declared props when no layout JSON exists yet', () => {
    for (const area of OUTDOOR_AREAS) {
      const props = getOutdoorProps(area);
      expect(props.length, area).toBeGreaterThan(0);
      // If no layout is present, tombstones are empty and nothing is dropped.
      if (!getOutdoorLayout(area)) {
        expect(getOutdoorLayoutRemoved(area), area).toEqual([]);
      }
    }
  });

  it('excludes fingerposts from the decoration props (they render separately)', () => {
    for (const area of OUTDOOR_AREAS) {
      expect(getOutdoorProps(area).some((p) => p.name === SIGNPOST_PROP_NAME), area).toBe(false);
    }
  });
});

describe('clearing framing pines', () => {
  // Locked art dims + fallback style tags for the two generated dusk pines.
  it('registers two distinct clearing pine kinds at their locked sizes', () => {
    const tall = PROP_KINDS['clearing-pine-1'];
    const broad = PROP_KINDS['clearing-pine-2'];
    expect(tall).toMatchObject({ dir: 'clearing', w: 256, h: 416, style: 'pine-a' });
    expect(broad).toMatchObject({ dir: 'clearing', w: 240, h: 336, style: 'pine-b' });
    // Standing props: modest trunk colliders, not flat/overhead.
    expect(tall.collider).toBeDefined();
    expect(broad.collider).toBeDefined();
    expect(tall.flat ?? false).toBe(false);
    expect(tall.overhead ?? false).toBe(false);
    // The tall spire is narrower in aspect than the broader pine.
    expect(tall.w / tall.h).toBeLessThan(broad.w / broad.h);
  });

  it('frames the clearing with pines clear of the water band, spawn and kneel zone', () => {
    const pines = getOutdoorProps('clearing').filter((p) => p.name.startsWith('clearing-pine-'));
    // A modest framing set (both shapes present, both edges used).
    expect(pines.length).toBeGreaterThanOrEqual(4);
    expect(pines.some((p) => p.name === 'clearing-pine-1')).toBe(true);
    expect(pines.some((p) => p.name === 'clearing-pine-2')).toBe(true);
    expect(pines.some((p) => p.mapX < 512)).toBe(true); // west
    expect(pines.some((p) => p.mapX > 512)).toBe(true); // east
    for (const pine of pines) {
      // Feet above the 2-tile shore water band (map is 640px tall, tile 64).
      expect(pine.mapY, `${pine.name} above shore`).toBeLessThan(512);
      // Off the central path lane / spawn column (x≈512).
      expect(Math.abs(pine.mapX - 512), `${pine.name} off centre lane`).toBeGreaterThan(64);
      // Clear of the "Look over the water" rect (x 320–704, y 440–568): a pine that
      // sits in that y-band must be outside its x-range.
      if (pine.mapY > 440) {
        expect(pine.mapX < 320 || pine.mapX > 704, `${pine.name} off kneel rect`).toBe(true);
      }
    }
  });
});

describe('directional fingerposts', () => {
  it('gives Guildford two fingerposts (west→Kerrisdale, east→Aldergrove), yards none', () => {
    const guildford = getSignposts('main-outside');
    expect(guildford.map((s) => s.label)).toEqual(['KERRISDALE', 'ALDERGROVE']);
    // The Kerrisdale sign points west (flipped); Aldergrove points east (native).
    expect(guildford.find((s) => s.label === 'KERRISDALE')!.flip).toBe(true);
    expect(guildford.find((s) => s.label === 'ALDERGROVE')!.flip).toBeFalsy();
    // Both share the single main-signpost dialogue; ids are the persisted prop ids.
    expect(guildford.every((s) => s.interactionId === 'main-signpost')).toBe(true);
    expect(new Set(guildford.map((s) => s.id)).size).toBe(guildford.length);
    // The yards no longer carry any signs.
    expect(getSignposts('friendtwo-yard')).toEqual([]);
    expect(getSignposts('friendone-yard')).toEqual([]);
  });

  it('returns the TS fingerposts verbatim when no layout override exists', () => {
    if (getOutdoorLayout('main-outside')) {
      return; // A saved layout would legitimately move them; nothing to assert.
    }
    const base = getSignposts('main-outside');
    const resolved = getOutdoorSignposts('main-outside');
    expect(resolved.map((s) => ({ x: s.mapX, y: s.mapY, id: s.id, label: s.label }))).toEqual(
      base.map((s) => ({ x: s.mapX, y: s.mapY, id: s.id, label: s.label })),
    );
  });

  it('applies a saved fingerpost position override while keeping id/label from TS', () => {
    // Simulate the merge a saved layout would drive: a fingerpost entry is keyed
    // by its stable id and only carries position/flip/scale.
    const [kerrisdale] = getSignposts('main-outside');
    const override: PropPlacement = {
      id: kerrisdale.id,
      name: SIGNPOST_PROP_NAME,
      mapX: kerrisdale.mapX + 40,
      mapY: kerrisdale.mapY + 12,
      scale: 1.25,
    };
    const merged = applyOutdoorLayout(withOutdoorIds([]), { props: [override], removed: [] });
    const found = merged.find((p) => p.id === kerrisdale.id)!;
    expect(found.mapX).toBe(kerrisdale.mapX + 40);
    expect(found.scale).toBe(1.25);
  });
});

describe('outdoor layout payload validation', () => {
  it('accepts a well-formed payload (name-keyed props, optional id/scale/removed)', () => {
    expect(
      isValidOutdoorLayoutFile({
        locationId: 'main-outside',
        props: [{ id: 'tree-1#0', name: 'tree-1', mapX: 1, mapY: 2, scale: 1.2 }],
        removed: ['bush-1#3'],
      }),
    ).toBe(true);
    // Minimal: name + mapX/mapY only.
    expect(
      isValidOutdoorLayoutFile({ locationId: 'x', props: [{ name: 'rock-1', mapX: 0, mapY: 0 }] }),
    ).toBe(true);
    expect(isValidOutdoorLayoutFile({ locationId: 'x', props: [], removed: [] })).toBe(true);
  });

  it('rejects bad shapes', () => {
    expect(isValidOutdoorLayoutFile(null)).toBe(false);
    expect(isValidOutdoorLayoutFile({ locationId: 'x' })).toBe(false);
    // Missing name (outdoor props are name-keyed, not frame-keyed).
    expect(isValidOutdoorLayoutFile({ locationId: 'x', props: [{ mapX: 1, mapY: 2 }] })).toBe(false);
    expect(
      isValidOutdoorLayoutFile({ locationId: 'x', props: [{ name: 't', mapX: 'no', mapY: 2 }] }),
    ).toBe(false);
    expect(
      isValidOutdoorLayoutFile({ locationId: 'x', props: [{ name: 't', mapX: 1, mapY: 2, id: 9 }] }),
    ).toBe(false);
    expect(isValidOutdoorLayoutFile({ locationId: 'x', props: [], removed: 'nope' })).toBe(false);
    expect(isValidOutdoorLayoutFile({ locationId: 'x', props: [], removed: [1] })).toBe(false);
  });

  it('survives a JSON round-trip (what the dev endpoint persists/reloads)', () => {
    const payload = {
      locationId: 'clearing',
      props: [{ id: 'clearing-lantern-post#0', name: 'clearing-lantern-post', mapX: 356, mapY: 476 }],
      removed: ['clearing-lantern-string#0'],
    };
    expect(isValidOutdoorLayoutFile(JSON.parse(JSON.stringify(payload)))).toBe(true);
  });
});
