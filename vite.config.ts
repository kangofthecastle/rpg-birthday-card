import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import {
  applyTmjRectPatches,
  isValidTmjSavePayload,
  serializeTmj,
} from './src/game/tmjRectPatch';
import { isValidZoneSavePayload } from './src/game/zoneSaveValidation';

const SAVE_ROUTE = '/__dev/save-collision-zones';
const SAVE_LAYOUT_ROUTE = '/__dev/save-room-layout';
const SAVE_OUTDOOR_LAYOUT_ROUTE = '/__dev/save-outdoor-layout';
const SAVE_MAP_OBJECTS_ROUTE = '/__dev/save-map-objects';
const PHOTO_WALL_PHOTO_ROUTE = '/__dev/photo-wall-photo';
const PHOTO_WALL_PHOTO_URL = '/assets/photos/photo-wall-camera.jpg';
const LOCATION_ID = /^[a-z0-9-]+$/;

// The webcam keeps an in-browser draft first. These dev-only requests let the
// player deliberately promote that draft into one fixed, inspectable game
// asset, or remove that exact asset again. No request-supplied path is used.
function photoWallPhotoSaverPlugin(): Plugin {
  return {
    name: 'photo-wall-photo-saver',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(PHOTO_WALL_PHOTO_ROUTE, (req, res) => {
        const outPath = resolve(
          server.config.root,
          'public/assets/photos/photo-wall-camera.jpg',
        );
        const sendJson = (statusCode: number, payload: Record<string, unknown>): void => {
          res.statusCode = statusCode;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(payload));
        };

        if (req.method === 'GET') {
          if (!existsSync(outPath)) {
            sendJson(200, { exists: false });
            return;
          }
          sendJson(200, {
            exists: true,
            src: `${PHOTO_WALL_PHOTO_URL}?v=${statSync(outPath).mtimeMs}`,
          });
          return;
        }

        if (req.method === 'DELETE') {
          try {
            if (existsSync(outPath)) {
              unlinkSync(outPath);
            }
            sendJson(200, { ok: true });
          } catch (error) {
            sendJson(500, { ok: false, error: String(error) });
          }
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        let rejected = false;
        req.on('data', (chunk: Buffer) => {
          if (rejected) return;
          receivedBytes += chunk.length;
          if (receivedBytes > 12 * 1024 * 1024) {
            rejected = true;
            sendJson(413, { ok: false, error: 'Photo is too large' });
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on('end', () => {
          if (rejected) return;
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
            if (
              typeof parsed !== 'object' ||
              parsed === null ||
              typeof (parsed as Record<string, unknown>).dataUrl !== 'string'
            ) {
              sendJson(400, { ok: false, error: 'Invalid payload' });
              return;
            }
            const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
              (parsed as { dataUrl: string }).dataUrl,
            );
            if (!match) {
              sendJson(400, { ok: false, error: 'Expected a JPEG data URL' });
              return;
            }
            const bytes = Buffer.from(match[1], 'base64');
            if (
              bytes.length < 4 ||
              bytes.length > 10 * 1024 * 1024 ||
              bytes[0] !== 0xff ||
              bytes[1] !== 0xd8 ||
              bytes.at(-2) !== 0xff ||
              bytes.at(-1) !== 0xd9
            ) {
              sendJson(400, { ok: false, error: 'Invalid JPEG data' });
              return;
            }
            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, bytes);
            sendJson(200, {
              ok: true,
              src: `${PHOTO_WALL_PHOTO_URL}?v=${Date.now()}`,
            });
          } catch (error) {
            sendJson(500, { ok: false, error: String(error) });
          }
        });
      });
    },
  };
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
            if (!isValidZoneSavePayload(parsed)) {
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
  npcs?: Record<string, { x: number; y: number }>;
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
  // Optional home NPC position overrides, keyed by NPC id -> { x, y }. Written by
  // the dressEdit editor when a room's resident is dragged.
  if (file.npcs !== undefined) {
    if (typeof file.npcs !== 'object' || file.npcs === null || Array.isArray(file.npcs)) {
      return false;
    }
    for (const pos of Object.values(file.npcs as Record<string, unknown>)) {
      if (typeof pos !== 'object' || pos === null) return false;
      const p = pos as Record<string, unknown>;
      if (typeof p.x !== 'number' || typeof p.y !== 'number') return false;
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

interface OutdoorLayoutPayload {
  locationId: string;
  props: Array<Record<string, unknown>>;
  removed?: string[];
}

function isValidOutdoorLayoutPayload(value: unknown): value is OutdoorLayoutPayload {
  if (typeof value !== 'object' || value === null) return false;
  const file = value as Record<string, unknown>;
  if (typeof file.locationId !== 'string' || !LOCATION_ID.test(file.locationId)) return false;
  if (!Array.isArray(file.props)) return false;
  for (const prop of file.props) {
    if (typeof prop !== 'object' || prop === null) return false;
    const p = prop as Record<string, unknown>;
    // Outdoor placements are keyed by prop `name` (not a sheet `frame`); id is an
    // optional stable-merge key.
    if (typeof p.name !== 'string' || typeof p.mapX !== 'number' || typeof p.mapY !== 'number') {
      return false;
    }
    if (p.id !== undefined && typeof p.id !== 'string') return false;
  }
  if (file.removed !== undefined) {
    if (!Array.isArray(file.removed) || file.removed.some((id) => typeof id !== 'string')) {
      return false;
    }
  }
  return true;
}

// Dev-only endpoint used by the in-game dress editor (?dressEdit=1) in an OUTDOOR
// area to persist the authored decoration layout to
// src/content/outdoorLayouts/<locationId>.json. Same security posture as the
// room-layout saver: serve-only, path-restricted writes, id regex-validated.
function outdoorLayoutSaverPlugin(): Plugin {
  return {
    name: 'outdoor-layout-saver',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(SAVE_OUTDOOR_LAYOUT_ROUTE, (req, res) => {
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
            if (!isValidOutdoorLayoutPayload(parsed)) {
              res.statusCode = 400;
              res.end('Invalid payload');
              return;
            }
            // Sanitize the id defensively (already regex-validated) to block any
            // path traversal before it becomes a file path.
            const safeId = parsed.locationId.replace(/[^a-z0-9-]/g, '');
            const outPath = resolve(
              server.config.root,
              'src/content/outdoorLayouts',
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
  plugins: [
    collisionZoneSaverPlugin(),
    roomLayoutSaverPlugin(),
    outdoorLayoutSaverPlugin(),
    mapObjectSaverPlugin(),
    photoWallPhotoSaverPlugin(),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
