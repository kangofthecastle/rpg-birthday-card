// Polygon collision zones per location. Authored as JSON under
// `src/content/collisionZones/<locationId>.json` (map-space pixel points) and
// edited in-game via the `?editZones=1` dev editor. When a location has a zones
// file it REPLACES the footprint-based prop colliders (roomDressing) — see
// LocationScene. Locations without a file fall back to footprint colliders.

export interface CollisionZone {
  /** Stable id (used by the editor and for readability). */
  readonly id: string;
  /** Simple polygon, map-space pixels, >= 3 vertices. */
  readonly points: ReadonlyArray<readonly [number, number]>;
}

export interface CollisionZonesFile {
  readonly locationId: string;
  readonly zones: readonly CollisionZone[];
  /**
   * Per-prop depth-line overrides, keyed by prop frame name. The prop depth-
   * sorts as if its floor-contact point were at map-y = override (with the
   * prop's own map-x), letting the player pass behind visually tall props.
   */
  readonly propDepthOverrides?: Readonly<Record<string, number>>;
}

// Eagerly glob every zones file so lookups are synchronous and the set is known
// at build time. Vite inlines the JSON; the map is keyed by locationId.
const ZONE_MODULES = import.meta.glob<CollisionZonesFile>('./collisionZones/*.json', {
  eager: true,
  import: 'default',
});

const ZONES_BY_LOCATION: Readonly<Record<string, CollisionZonesFile>> = Object.fromEntries(
  Object.values(ZONE_MODULES)
    .filter((file): file is CollisionZonesFile => Boolean(file && file.locationId))
    .map((file) => [file.locationId, file]),
);

export function getCollisionZones(locationId: string): CollisionZonesFile | undefined {
  return ZONES_BY_LOCATION[locationId];
}

/** Validates the shape of a zones payload (used by the dev save endpoint). */
export function isValidZonesFile(value: unknown): value is CollisionZonesFile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const file = value as Record<string, unknown>;
  if (typeof file.locationId !== 'string' || !Array.isArray(file.zones)) {
    return false;
  }
  for (const zone of file.zones) {
    if (typeof zone !== 'object' || zone === null) {
      return false;
    }
    const z = zone as Record<string, unknown>;
    if (typeof z.id !== 'string' || !Array.isArray(z.points)) {
      return false;
    }
    for (const pt of z.points) {
      if (
        !Array.isArray(pt) ||
        pt.length !== 2 ||
        typeof pt[0] !== 'number' ||
        typeof pt[1] !== 'number'
      ) {
        return false;
      }
    }
  }
  if (file.propDepthOverrides !== undefined) {
    if (typeof file.propDepthOverrides !== 'object' || file.propDepthOverrides === null) {
      return false;
    }
    for (const v of Object.values(file.propDepthOverrides as Record<string, unknown>)) {
      if (typeof v !== 'number') {
        return false;
      }
    }
  }
  return true;
}
