// A-Game Electron wrapper. Serves the vite `dist/` bundle over a privileged
// app:// scheme so the game's absolute-path fetch()es (/maps/*.tmj, /audio/*)
// work exactly as they do against the dev server. No preload, no IPC.
const { app, protocol, BrowserWindow, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// dist/ sits next to electron/ in both dev (repo root) and packaged (asar root).
const DIST = path.join(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.tmj': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm',
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    // Resolve within DIST and reject traversal that escapes it.
    const filePath = path.join(DIST, pathname);
    const rel = path.relative(DIST, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return new Response('Forbidden', { status: 403 });
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      // The game probes optional audio and treats 404 as "use synth fallback".
      return new Response('Not Found', { status: 404 });
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    return net.fetch(pathToFileURL(filePath).toString()).then((res) => {
      return new Response(res.body, { status: 200, headers: { 'Content-Type': type } });
    });
  });

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    resizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'icon.png'),
    title: 'A-Game',
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });

  win.loadURL('app://bundle/index.html');
});

app.on('window-all-closed', () => app.quit());
