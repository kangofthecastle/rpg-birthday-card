// Faithful, minimal patcher for Tiled map (.tmj) object rects. Used by the
// dev-only dressEdit "interactables" mode: when the author drags/resizes an
// interactable hotspot, only that object's x/y/width/height must change on disk
// — every other object, layer, tileset, property, and the overall key order
// must round-trip byte-for-byte so the resulting diff stays reviewable.
//
// The serialization invariant the endpoint relies on: for every map in this
// repo, `JSON.stringify(parsed, null, 2) + "\n"` reproduces the source file
// exactly (verified in tests), so re-emitting a patched clone that way changes
// nothing but the edited numeric fields.
//
// Pure and dependency-free so both the Vite dev endpoint (node) and the unit
// tests can import it.

/** A single rect edit: overwrite x/y/width/height on (layer, id). */
export interface TmjRectPatch {
  readonly layer: string;
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface MutableTiledObject {
  id?: number;
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

interface MutableLayer {
  name?: string;
  type?: string;
  objects?: MutableTiledObject[];
  [key: string]: unknown;
}

interface MutableTmj {
  layers?: MutableLayer[];
  [key: string]: unknown;
}

/**
 * Returns a deep clone of `tmj` in which ONLY the x/y/width/height of the
 * objects named by each patch's (layer, id) are overwritten. Never creates or
 * removes objects/layers; patches whose target is missing are ignored. The
 * input is not mutated.
 */
export function applyTmjRectPatches(tmj: unknown, patches: readonly TmjRectPatch[]): unknown {
  const clone = structuredClone(tmj) as MutableTmj;
  const layers = Array.isArray(clone.layers) ? clone.layers : [];
  for (const patch of patches) {
    const layer = layers.find(
      (candidate) => candidate.type === 'objectgroup' && candidate.name === patch.layer,
    );
    const object = layer?.objects?.find((candidate) => candidate.id === patch.id);
    if (!object) {
      continue;
    }
    object.x = patch.x;
    object.y = patch.y;
    object.width = patch.width;
    object.height = patch.height;
  }
  return clone;
}

/** Serialize a patched tmj back to disk bytes (matches Tiled's 2-space form). */
export function serializeTmj(tmj: unknown): string {
  return `${JSON.stringify(tmj, null, 2)}\n`;
}

const MAP_PATH = /^[a-z0-9-]+\.tmj$/;
const LAYER_NAME = /^[A-Za-z][A-Za-z0-9 _-]*$/;

export interface TmjSavePayload {
  readonly mapPath: string;
  readonly objects: readonly TmjRectPatch[];
}

/** Structural validation for the dev save endpoint. Also guards path traversal. */
export function isValidTmjSavePayload(value: unknown): value is TmjSavePayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const file = value as Record<string, unknown>;
  if (typeof file.mapPath !== 'string' || !MAP_PATH.test(file.mapPath)) {
    return false;
  }
  if (!Array.isArray(file.objects)) {
    return false;
  }
  for (const object of file.objects) {
    if (typeof object !== 'object' || object === null) {
      return false;
    }
    const o = object as Record<string, unknown>;
    if (typeof o.layer !== 'string' || !LAYER_NAME.test(o.layer)) {
      return false;
    }
    if (typeof o.id !== 'number' || !Number.isInteger(o.id)) {
      return false;
    }
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      if (typeof o[key] !== 'number' || !Number.isFinite(o[key])) {
        return false;
      }
    }
  }
  return true;
}
