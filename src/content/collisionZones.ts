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

/**
 * An authorable map-space depth boundary for one prop. `frontSide` is a sample
 * point on the side where ____ must render in front of the prop, making the
 * serialized front/behind intent explicit regardless of line rotation.
 */
export interface RotatedPropDepthLine {
  readonly kind: 'line';
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly frontSide: readonly [number, number];
}

export type PropDepthOverride = number | RotatedPropDepthLine;

export interface CollisionZonesFile {
  readonly locationId: string;
  readonly zones: readonly CollisionZone[];
  /**
   * Per-prop depth-line overrides, keyed by prop frame name. Existing numeric
   * values retain the horizontal map-y threshold. A line object supports a
   * rotated boundary and explicitly identifies the side where ____ is in front.
   */
  readonly propDepthOverrides?: Readonly<Record<string, PropDepthOverride>>;
}

function isFinitePoint(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  );
}

function lineSide(
  line: Pick<RotatedPropDepthLine, 'start' | 'end'>,
  point: readonly [number, number],
): number {
  const dx = line.end[0] - line.start[0];
  const dy = line.end[1] - line.start[1];
  return dx * (point[1] - line.start[1]) - dy * (point[0] - line.start[0]);
}

export function isRotatedPropDepthLine(value: unknown): value is RotatedPropDepthLine {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const line = value as Record<string, unknown>;
  if (
    line.kind !== 'line' ||
    !isFinitePoint(line.start) ||
    !isFinitePoint(line.end) ||
    !isFinitePoint(line.frontSide)
  ) {
    return false;
  }
  const typedLine = line as unknown as RotatedPropDepthLine;
  const lengthSquared =
    (typedLine.end[0] - typedLine.start[0]) ** 2 +
    (typedLine.end[1] - typedLine.start[1]) ** 2;
  return lengthSquared > 0 && Math.abs(lineSide(typedLine, typedLine.frontSide)) > 1e-6;
}

/** Returns whether ____'s map-space feet are on the authored front side. */
export function isPlayerInFrontOfDepthLine(
  line: RotatedPropDepthLine,
  playerMapX: number,
  playerMapY: number,
): boolean {
  const frontSide = lineSide(line, line.frontSide);
  const playerSide = lineSide(line, [playerMapX, playerMapY]);
  return frontSide * playerSide >= 0;
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

// Dev-only: the zone editor's Save writes src/content/collisionZones/<id>.json,
// which is eagerly globbed into the module graph above. Without an HMR boundary
// here, Vite responds to that write with a FULL PAGE RELOAD — snapping the player
// back to spawn and forcing the author to walk back to the zone (the exact
// iteration pain the live-rebuild path exists to remove). Self-accepting makes
// this module the update boundary, so the file change re-executes only this
// module (harmlessly rebuilding the lookup) instead of reloading the page; the
// running scene keeps the colliders the editor rebuilt in place from its
// in-memory polygons. A manual browser refresh still cold-loads the fresh file.
// import.meta.hot is undefined in production builds, so this compiles out.
if (import.meta.hot) {
  import.meta.hot.accept();
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
      if (!(typeof v === 'number' && Number.isFinite(v)) && !isRotatedPropDepthLine(v)) {
        return false;
      }
    }
  }
  return true;
}
