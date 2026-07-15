import type {
  PropDepthOverride,
  RotatedPropDepthLine,
} from './collisionZones';
import type { PropPlacement } from './roomDressing';

export type BedDepthLayerId = 'back' | 'front';

export interface BedDepthLayerSpec {
  readonly id: BedDepthLayerId;
}

/**
 * Source-space polygon containing the bed's viewer-facing/front artwork. The
 * points are normalized so the same mask works for the standalone 520x420
 * beds and the legacy room-sheet crop.
 */
export interface BedDepthMask {
  readonly id: string;
  readonly frontPolygon: readonly (readonly [number, number])[];
}

/**
 * All three bed illustrations share the same 520x420 framing. Keeping the
 * layer masks in normalized source space means both transparent textures retain
 * the exact same anchor and scale as the original full bed.
 */
export const BED_DEPTH_LAYER_SPECS: readonly BedDepthLayerSpec[] = [
  { id: 'back' },
  { id: 'front' },
];

/**
 * The blanket/mattress seams are diagonal in all three illustrations. A
 * horizontal cut leaves part of the quilt in the back texture, so changing a
 * depth line cannot reveal ____ cleanly. These masks follow each illustration
 * rather than assuming one universal seam.
 */
const BED_DEPTH_MASKS: Readonly<Record<string, BedDepthMask>> = {
  'recipient-house': {
    id: 'recipient-house-quilt-v2',
    frontPolygon: [
      [0.077, 0.619],
      [0.365, 0.357],
      [0.788, 0.607],
      [0.481, 1],
      [0.115, 1],
    ],
  },
  'friend-a': {
    id: 'friend-a-quilt-v2',
    frontPolygon: [
      [0.048, 0.714],
      [0.317, 0.452],
      [0.865, 0.655],
      [0.481, 1],
      [0.038, 1],
    ],
  },
  'friend-b': {
    id: 'friend-b-quilt-v2',
    frontPolygon: [
      [0.038, 0.524],
      [0.365, 0.381],
      [0.865, 0.619],
      [0.423, 1],
      [0.038, 1],
    ],
  },
};

const FALLBACK_BED_DEPTH_MASK = BED_DEPTH_MASKS['recipient-house'];

export function getBedDepthMask(locationId: string): BedDepthMask {
  return BED_DEPTH_MASKS[locationId] ?? FALLBACK_BED_DEPTH_MASK;
}

export function bedDepthOverrideKey(frame: string, layer: BedDepthLayerId): string {
  return `${frame}:${layer}`;
}

export function getBedDepthOverride(
  overrides: Readonly<Record<string, PropDepthOverride>>,
  frame: string,
  layer: BedDepthLayerId,
): PropDepthOverride | undefined {
  return overrides[bedDepthOverrideKey(frame, layer)] ?? overrides[frame];
}

/**
 * Supplies two sensible boundaries when a room has not authored explicit bed
 * lines yet. They follow the back and front edges of the solid footprint, with
 * increasing map-y marking the side where ____ is visually in front.
 */
export function getDefaultBedDepthOverrides(
  placement: Pick<PropPlacement, 'frame' | 'mapX' | 'mapY' | 'footprint'>,
): Readonly<Record<string, RotatedPropDepthLine>> {
  const footprint = placement.footprint ?? { w: 160, d: 110 };
  const left = placement.mapX - footprint.w / 2;
  const right = placement.mapX + footprint.w / 2;
  const backY = placement.mapY - footprint.d;
  const frontY = placement.mapY;
  const frontSideOffset = Math.max(32, Math.min(64, footprint.d * 0.45));
  const centerX = placement.mapX;

  return {
    [bedDepthOverrideKey(placement.frame, 'back')]: {
      kind: 'line',
      start: [left, backY],
      end: [right, backY],
      frontSide: [centerX, backY + frontSideOffset],
    },
    [bedDepthOverrideKey(placement.frame, 'front')]: {
      kind: 'line',
      start: [left, frontY],
      end: [right, frontY],
      frontSide: [centerX, frontY + frontSideOffset],
    },
  };
}
