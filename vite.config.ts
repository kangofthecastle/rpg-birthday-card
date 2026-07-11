import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import {
  applyTmjRectPatches,
  isValidTmjSavePayload,
  serializeTmj,
} from './src/game/tmjRectPatch';

const SAVE_ROUTE = '/__dev/save-collision-zones';
const SAVE_LAYOUT_ROUTE = '/__dev/save-room-layout';
const SAVE_MAP_OBJECTS_ROUTE = '/__dev/save-map-objects';
const LOCATION_ID = /^[a-z0-9-]+$/;

interface ZonePayload {
  locationId: string;
  zones: Array<{ id: string; points: Array<[number, number]> }>;
  propDepthOverrides?: Record<string, number>;
}

function isValidPayload(value: unknown): value is ZonePayload {
  if (typeof value !== 'object' || value === null) return false;
  const file = value as Record<string, unknown>;
  if (typeof file.locationId !== 'string' || !LOCATION_ID.test(file.locationId)) return false;
  if (!Array.isArray(file.zones)) return false;
  for (const zone of file.zones) {
    if (typeof zone !== 'object' || zone === null) return false;
    const z = zone as Record<string, unknown>;
    if (typeof z.id !== 'string' || !Array.isArray(z.points)) return false;
    for (const pt of z.points) {
      if (!Array.isArray(pt) || pt.length !== 2 || typeof pt[0] !== 'number' || typeof pt[1] !== 'number') {
        return false;
      }
    }
  }
  if (file.propDepthOverrides !== undefined) {
    if (typeof file.propDepthOverrides !== 'object' || file.propDepthOverrides === null) return false;
    for (const v of Object.values(file.propDepthOverrides as Record<string, unknown>)) {
      if (typeof v !== 'number') return false;
    }
  }
  return true;
}

// Dev-only endpoint used by the in-game zone editor (?editZones=1) to persist
// authored polygons to src/content/collisionZones/<locationId>.json.
function collisionZoneSaverPlugin(): Plugin {
  return {
    name: 'collision-zone-saver',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(SAVE_ROUTE, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
            if (!isValidPayload(parsed)) {
              res.statusCode = 400;
              res.end('Invalid payload');
              return;
            }
            // Sanitize the id defensively (already regex-validated) to block any
            // path traversal before it becomes a file path.
            const safeId = parsed.locationId.replace(/[^a-z0-9-]/g, '');
            const outPath = resolve(
              server.config.root,
              'src/content/collisionZones',
              `${safeId}.json`,
            );
            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: `${safeId}.json` }));
          } catch (error) {
            res.statusCode = 500;
            res.end(`Error: ${String(error)}`);
          }
        });
      });
    },
  };
}

interface RoomLayoutPayload {
  locationId: string;
  props: Array<Record<string, unknown>>;
  removed?: string[];
}

function isValidLayoutPayload(value: unknown): value is RoomLayoutPayload {
  if (typeof value !== 'object' || value === null) return false;
  const file = value as Record<string, unknown>;
  if (typeof file.locationId !== 'string' || !LOCATION_ID.test(file.locationId)) return false;
  if (!Array.isArray(file.props)) return false;
  for (const prop of file.props) {
    if (typeof prop !== 'object' || prop === null) return false;
    const p = prop as Record<string, unknown>;
    if (typeof p.frame !== 'string' || typeof p.mapX !== 'number' || typeof p.mapY !== 'number') {
      return false;
    }
  }
  // Optional tombstone list: frame ids the author deliberately removed, so the
  // roomDressing merge won't resurrect singles-only props on the next reload.
  if (file.removed !== undefined) {
    if (!Array.isArray(file.removed) || file.removed.some((id) => typeof id !== 'string')) {
      return false;
    }
  }
  return true;
}

// Dev-only endpoint used by the in-game dress editor (?dressEdit=1) to persist
// the authored prop layout to src/content/roomLayouts/<locationId>.json. Same
// security posture as the zones saver: serve-only, path-restricted writes.
function roomLayoutSaverPlugin(): Plugin {
  return {
    name: 'room-layout-saver',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(SAVE_LAYOUT_ROUTE, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
            if (!isValidLayoutPayload(parsed)) {
              res.statusCode = 400;
              res.end('Invalid payload');
              return;
            }
            // Sanitize the id defensively (already regex-validated) to block any
            // path traversal before it becomes a file path.
            const safeId = parsed.locationId.replace(/[^a-z0-9-]/g, '');
            const outPath = resolve(
              server.config.root,
              'src/content/roomLayouts',
              `${safeId}.json`,
            );
            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: `${safeId}.json` }));
          } catch (error) {
            res.statusCode = 500;
            res.end(`Error: ${String(error)}`);
          }
        });
      });
    },
  };
}

// Dev-only endpoint used by the dress editor's "interactables" mode
// (?dressEdit=1, then toggle) to persist edited interactable hotspot rects back
// into the room's Tiled map (public/maps/<map>.tmj). Same security posture as
// the other savers: serve-only, and writes are confined to public/maps with a
// strictly validated basename (no path traversal). The original file is read
// from disk and only the edited objects' x/y/width/height are overwritten
// (applyTmjRectPatches), so every other object, layer, and property round-trips
// unchanged and the resulting diff stays minimal and reviewable.
function mapObjectSaverPlugin(): Plugin {
  return {
    name: 'map-object-saver',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(SAVE_MAP_OBJECTS_ROUTE, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
            if (!isValidTmjSavePayload(parsed)) {
              res.statusCode = 400;
              res.end('Invalid payload');
              return;
            }
            const mapsDir = resolve(server.config.root, 'public/maps');
            const outPath = resolve(mapsDir, parsed.mapPath);
            // Belt-and-suspenders: the basename regex already forbids '/' and
            // '.', but confirm the resolved path never escapes public/maps.
            if (outPath !== mapsDir && !outPath.startsWith(mapsDir + sep)) {
              res.statusCode = 400;
              res.end('Path outside public/maps');
              return;
            }
            const original = JSON.parse(readFileSync(outPath, 'utf8')) as unknown;
            const patched = applyTmjRectPatches(original, parsed.objects);
            writeFileSync(outPath, serializeTmj(patched), 'utf8');
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: parsed.mapPath }));
          } catch (error) {
            res.statusCode = 500;
            res.end(`Error: ${String(error)}`);
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [collisionZoneSaverPlugin(), roomLayoutSaverPlugin(), mapObjectSaverPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
