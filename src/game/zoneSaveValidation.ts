export interface RotatedPropDepthLinePayload {
  readonly kind: 'line';
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly frontSide: readonly [number, number];
}

export type PropDepthOverridePayload = number | RotatedPropDepthLinePayload;

export interface ZoneSavePayload {
  readonly locationId: string;
  readonly zones: ReadonlyArray<{
    readonly id: string;
    readonly points: ReadonlyArray<readonly [number, number]>;
  }>;
  readonly propDepthOverrides?: Readonly<Record<string, PropDepthOverridePayload>>;
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
  line: Pick<RotatedPropDepthLinePayload, 'start' | 'end'>,
  point: readonly [number, number],
): number {
  const dx = line.end[0] - line.start[0];
  const dy = line.end[1] - line.start[1];
  return dx * (point[1] - line.start[1]) - dy * (point[0] - line.start[0]);
}

function isRotatedPropDepthLine(value: unknown): value is RotatedPropDepthLinePayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
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
  const typedLine = line as unknown as RotatedPropDepthLinePayload;
  const lengthSquared =
    (typedLine.end[0] - typedLine.start[0]) ** 2 +
    (typedLine.end[1] - typedLine.start[1]) ** 2;
  return lengthSquared > 0 && Math.abs(lineSide(typedLine, typedLine.frontSide)) > 1e-6;
}

export function isValidZoneSavePayload(value: unknown): value is ZoneSavePayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const file = value as Record<string, unknown>;
  if (typeof file.locationId !== 'string' || !/^[a-z0-9-]+$/.test(file.locationId)) {
    return false;
  }
  if (!Array.isArray(file.zones)) return false;
  for (const zone of file.zones) {
    if (typeof zone !== 'object' || zone === null || Array.isArray(zone)) return false;
    const z = zone as Record<string, unknown>;
    if (typeof z.id !== 'string' || !Array.isArray(z.points)) return false;
    for (const point of z.points) {
      if (!isFinitePoint(point)) return false;
    }
  }
  if (file.propDepthOverrides !== undefined) {
    if (
      typeof file.propDepthOverrides !== 'object' ||
      file.propDepthOverrides === null ||
      Array.isArray(file.propDepthOverrides)
    ) {
      return false;
    }
    for (const override of Object.values(file.propDepthOverrides as Record<string, unknown>)) {
      if (
        !(typeof override === 'number' && Number.isFinite(override)) &&
        !isRotatedPropDepthLine(override)
      ) {
        return false;
      }
    }
  }
  return true;
}
