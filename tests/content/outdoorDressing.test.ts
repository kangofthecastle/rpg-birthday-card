import { describe, expect, it } from 'vitest';
import {
  applyOutdoorLayout,
  getOutdoorLayout,
  getOutdoorLayoutRemoved,
  getOutdoorProps,
  getOutdoorSignpost,
  getSignpost,
  isValidOutdoorLayoutFile,
  outdoorPlacementId,
  SIGNPOST_PLACEMENT_ID,
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

  it('excludes the signpost from the decoration props (it renders separately)', () => {
    for (const area of OUTDOOR_AREAS) {
      expect(getOutdoorProps(area).some((p) => p.name === 'signpost'), area).toBe(false);
    }
  });
});

describe('signpost placement override', () => {
  it('returns the TS signpost verbatim when no layout override exists', () => {
    for (const area of ['main-outside', 'friendtwo-yard', 'friendone-yard'] as const) {
      const base = getSignpost(area)!;
      const resolved = getOutdoorSignpost(area)!;
      // With no saved override the resolved signpost matches the TS definition.
      if (!getOutdoorLayout(area)) {
        expect(resolved.mapX, area).toBe(base.mapX);
        expect(resolved.mapY, area).toBe(base.mapY);
        expect(resolved.interactionId, area).toBe(base.interactionId);
        expect(resolved.label, area).toBe(base.label);
      }
    }
  });

  it('applies a saved signpost position override while keeping id/label from TS', () => {
    // Simulate the merge a saved layout would drive: the signpost entry is keyed
    // by SIGNPOST_PLACEMENT_ID and only carries position/flip/scale.
    const sign = getSignpost('main-outside')!;
    const override: PropPlacement = {
      id: SIGNPOST_PLACEMENT_ID,
      name: 'signpost',
      mapX: sign.mapX + 40,
      mapY: sign.mapY + 12,
      scale: 1.25,
    };
    // The merge helper keeps the override entry as a saved prop.
    const merged = applyOutdoorLayout(withOutdoorIds([]), { props: [override], removed: [] });
    const found = merged.find((p) => p.id === SIGNPOST_PLACEMENT_ID)!;
    expect(found.mapX).toBe(sign.mapX + 40);
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
