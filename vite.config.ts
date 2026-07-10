import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

const SAVE_ROUTE = '/__dev/save-collision-zones';
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

export default defineConfig({
  plugins: [collisionZoneSaverPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
