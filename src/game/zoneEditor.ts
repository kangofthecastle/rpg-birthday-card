// Dev-only in-game polygon collision-zone editor. Loaded lazily (dynamic
// import, guarded by import.meta.env.DEV + ?editZones=1) so it never ships in a
// production bundle. Draws through a high-depth Phaser Graphics overlay in world
// space plus a small DOM toolbar, and POSTs the authored JSON to the Vite dev
// middleware at /__dev/save-collision-zones.
//
// Controls
//   Click            place a polygon vertex on the rendered art
//   Enter / click-1st close the in-progress polygon
//   Esc              cancel the in-progress polygon
//   N                start a new zone
//   drag handle      move a vertex
//   Backspace/Delete remove selected vertex (or the whole zone if none)
//   Tab              toggle depth-line mode
//   drag depth line  set that prop's depthMapY override
//   middle/space-drag pan camera   wheel zoom (0.5-2)   F re-follow player
//   S                save          (toolbar also has Save / Copy JSON)

import Phaser from 'phaser';
import type { Projection } from './projection';
import type { CollisionZone, CollisionZonesFile } from '../content/collisionZones';
import type { PropPlacement, RoomDressing } from '../content/roomDressing';

interface ZoneEditorOptions {
  readonly locationId: string;
  readonly projection: Projection;
  readonly playerVisual: Phaser.GameObjects.Sprite;
  readonly dressing?: RoomDressing;
  readonly initial?: CollisionZonesFile;
}

interface MutableZone {
  id: string;
  points: [number, number][];
}

/**
 * Structural view of the host LocationScene's dev-only live-rebuild hook. Kept as
 * a local structural type (rather than importing LocationScene) so the lazily
 * loaded editor stays decoupled from the scene module. Optional so the call is a
 * no-op if the host scene ever lacks the hook.
 */
interface ZoneColliderRebuildScene {
  rebuildZoneColliders?(zonesFile: CollisionZonesFile): void;
}

const HANDLE_RADIUS = 7;
const CLOSE_SNAP_PX = 14;
const OVERLAY_DEPTH = 1_000_000;

export function startZoneEditor(scene: Phaser.Scene, options: ZoneEditorOptions): void {
  new ZoneEditor(scene, options);
}

class ZoneEditor {
  private readonly scene: Phaser.Scene;
  private readonly projection: Projection;
  private readonly options: ZoneEditorOptions;
  private readonly graphics: Phaser.GameObjects.Graphics;

  private zones: MutableZone[];
  private depthOverrides: Record<string, number>;
  private inProgress: [number, number][] | null = null;
  private selectedZone = -1;
  private selectedVertex = -1;
  private draggingVertex = false;
  private draggingDepthFrame: string | null = null;
  private panning = false;
  private spaceDown = false;
  private mode: 'zones' | 'depth' = 'zones';

  private toolbar!: HTMLElement;
  private statusEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private autoId = 1;

  constructor(scene: Phaser.Scene, options: ZoneEditorOptions) {
    this.scene = scene;
    this.projection = options.projection;
    this.options = options;
    this.zones = (options.initial?.zones ?? []).map((z) => cloneZone(z));
    this.depthOverrides = { ...(options.initial?.propDepthOverrides ?? {}) };
    this.autoId = this.zones.length + 1;

    this.graphics = scene.add.graphics().setDepth(OVERLAY_DEPTH);

    // Detach strict camera follow; the editor manages panning/zoom itself.
    scene.cameras.main.stopFollow();

    this.buildToolbar();
    this.registerInput();

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.redraw, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  // --- input ---------------------------------------------------------------

  private registerInput(): void {
    const input = this.scene.input;
    input.on('pointerdown', this.onPointerDown, this);
    input.on('pointermove', this.onPointerMove, this);
    input.on('pointerup', this.onPointerUp, this);
    input.on('wheel', this.onWheel, this);

    const kb = this.scene.input.keyboard;
    if (kb) {
      kb.on('keydown', this.onKeyDown, this);
      kb.on('keyup', this.onKeyUp, this);
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    switch (event.code) {
      case 'Space':
        this.spaceDown = true;
        break;
      case 'Enter':
        this.closePolygon();
        break;
      case 'Escape':
        this.inProgress = null;
        break;
      case 'KeyN':
        this.inProgress = [];
        this.mode = 'zones';
        this.setStatus('New zone: click to place vertices, Enter/click-first to close.');
        break;
      case 'Tab':
        event.preventDefault();
        this.mode = this.mode === 'zones' ? 'depth' : 'zones';
        this.setStatus(`Mode: ${this.mode}`);
        break;
      case 'KeyF':
        this.scene.cameras.main.startFollow(this.options.playerVisual, true, 0.12, 0.12);
        this.setStatus('Following player.');
        break;
      case 'KeyS':
        void this.save();
        break;
      case 'Backspace':
      case 'Delete':
        this.deleteSelection();
        break;
      default:
        break;
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.spaceDown = false;
      this.panning = false;
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.middleButtonDown() || this.spaceDown) {
      this.panning = true;
      return;
    }

    if (this.mode === 'depth') {
      this.draggingDepthFrame = this.hitDepthLine(pointer.worldX, pointer.worldY);
      return;
    }

    // Placing a new polygon.
    if (this.inProgress) {
      if (this.inProgress.length >= 3 && this.nearFirstVertex(pointer)) {
        this.closePolygon();
        return;
      }
      this.inProgress.push(this.toMap(pointer.worldX, pointer.worldY));
      return;
    }

    // Try grabbing an existing vertex handle.
    const hit = this.hitVertex(pointer.worldX, pointer.worldY);
    if (hit) {
      this.selectedZone = hit.zone;
      this.selectedVertex = hit.vertex;
      this.draggingVertex = true;
      return;
    }

    // Otherwise select a zone under the cursor (or deselect).
    const zoneIndex = this.hitZone(pointer.worldX, pointer.worldY);
    this.selectedZone = zoneIndex;
    this.selectedVertex = -1;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.panning && pointer.isDown) {
      const cam = this.scene.cameras.main;
      cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom;
      cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom;
      return;
    }

    if (this.draggingVertex && this.selectedZone >= 0 && this.selectedVertex >= 0) {
      this.zones[this.selectedZone].points[this.selectedVertex] = this.toMap(
        pointer.worldX,
        pointer.worldY,
      );
      return;
    }

    if (this.draggingDepthFrame) {
      this.setDepthFromScreenY(this.draggingDepthFrame, pointer.worldY);
    }
  }

  private onPointerUp(): void {
    this.panning = false;
    this.draggingVertex = false;
    this.draggingDepthFrame = null;
  }

  private onWheel(
    _pointer: Phaser.Input.Pointer,
    _over: unknown,
    _dx: number,
    dy: number,
  ): void {
    const cam = this.scene.cameras.main;
    const next = Phaser.Math.Clamp(cam.zoom - Math.sign(dy) * 0.1, 0.5, 2);
    cam.setZoom(next);
  }

  // --- editing helpers -----------------------------------------------------

  private closePolygon(): void {
    if (this.inProgress && this.inProgress.length >= 3) {
      const id = window.prompt('Zone id?', `zone-${this.autoId}`) || `zone-${this.autoId}`;
      this.autoId += 1;
      this.zones.push({ id, points: this.inProgress.map((p) => [p[0], p[1]]) });
      this.selectedZone = this.zones.length - 1;
    }
    this.inProgress = null;
  }

  private deleteSelection(): void {
    if (this.selectedZone < 0) {
      return;
    }
    if (this.selectedVertex >= 0) {
      const points = this.zones[this.selectedZone].points;
      if (points.length > 3) {
        points.splice(this.selectedVertex, 1);
        this.selectedVertex = -1;
        return;
      }
    }
    this.zones.splice(this.selectedZone, 1);
    this.selectedZone = -1;
    this.selectedVertex = -1;
  }

  private toMap(worldX: number, worldY: number): [number, number] {
    const map = this.projection.unproject(worldX, worldY);
    return [Math.round(map.x), Math.round(map.y)];
  }

  private nearFirstVertex(pointer: Phaser.Input.Pointer): boolean {
    if (!this.inProgress || this.inProgress.length === 0) {
      return false;
    }
    const first = this.projection.project(this.inProgress[0][0], this.inProgress[0][1]);
    return Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, first.x, first.y) <=
      CLOSE_SNAP_PX;
  }

  private hitVertex(worldX: number, worldY: number): { zone: number; vertex: number } | undefined {
    for (let z = 0; z < this.zones.length; z += 1) {
      const points = this.zones[z].points;
      for (let v = 0; v < points.length; v += 1) {
        const p = this.projection.project(points[v][0], points[v][1]);
        if (Phaser.Math.Distance.Between(worldX, worldY, p.x, p.y) <= HANDLE_RADIUS + 3) {
          return { zone: z, vertex: v };
        }
      }
    }
    return undefined;
  }

  private hitZone(worldX: number, worldY: number): number {
    const map = this.projection.unproject(worldX, worldY);
    for (let z = this.zones.length - 1; z >= 0; z -= 1) {
      if (pointInPoly(map.x, map.y, this.zones[z].points)) {
        return z;
      }
    }
    return -1;
  }

  // --- depth lines ---------------------------------------------------------

  private floorProps(): PropPlacement[] {
    return (this.options.dressing?.props ?? []).filter(
      (p) => p.fixedDepth === undefined,
    );
  }

  private effectiveDepthMapY(prop: PropPlacement): number {
    return this.depthOverrides[prop.frame] ?? prop.depthMapY ?? prop.mapY;
  }

  private hitDepthLine(worldX: number, worldY: number): string | null {
    for (const prop of this.floorProps()) {
      const p = this.projection.project(prop.mapX, this.effectiveDepthMapY(prop));
      if (Math.abs(worldY - p.y) <= 8 && Math.abs(worldX - p.x) <= 90) {
        return prop.frame;
      }
    }
    return null;
  }

  private setDepthFromScreenY(frame: string, worldY: number): void {
    const prop = this.floorProps().find((p) => p.frame === frame);
    if (!prop) {
      return;
    }
    // The mapY (at this prop's mapX) whose projection lands at the dragged Y.
    const mapY = this.projection.mapYFromScreenY(prop.mapX, worldY);
    this.depthOverrides[frame] = Math.round(mapY);
  }

  // --- rendering -----------------------------------------------------------

  private redraw(): void {
    const g = this.graphics;
    g.clear();

    if (this.mode === 'depth') {
      this.drawDepthLines(g);
    }

    // Existing zones.
    for (let z = 0; z < this.zones.length; z += 1) {
      const zone = this.zones[z];
      const pts = zone.points.map(([x, y]) => this.projection.project(x, y));
      const phaserPts = pts.map((p) => new Phaser.Geom.Point(p.x, p.y));
      const selected = z === this.selectedZone;
      g.fillStyle(selected ? 0x34d399 : 0x60a5fa, selected ? 0.28 : 0.18);
      g.fillPoints(phaserPts, true);
      g.lineStyle(2, selected ? 0x34d399 : 0x60a5fa, 0.95);
      g.strokePoints(phaserPts, true);
      for (let v = 0; v < pts.length; v += 1) {
        const isSel = selected && v === this.selectedVertex;
        g.fillStyle(isSel ? 0xf59e0b : 0xffffff, 1);
        g.fillCircle(pts[v].x, pts[v].y, HANDLE_RADIUS);
        g.lineStyle(2, 0x1f2937, 1);
        g.strokeCircle(pts[v].x, pts[v].y, HANDLE_RADIUS);
      }
    }

    // In-progress polygon.
    if (this.inProgress && this.inProgress.length > 0) {
      const pts = this.inProgress.map(([x, y]) => this.projection.project(x, y));
      g.lineStyle(2, 0xf59e0b, 1);
      for (let i = 1; i < pts.length; i += 1) {
        g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      }
      const pointer = this.scene.input.activePointer;
      const last = pts[pts.length - 1];
      g.lineStyle(1, 0xf59e0b, 0.6);
      g.lineBetween(last.x, last.y, pointer.worldX, pointer.worldY);
      for (const p of pts) {
        g.fillStyle(0xf59e0b, 1);
        g.fillCircle(p.x, p.y, 5);
      }
    }
  }

  private drawDepthLines(g: Phaser.GameObjects.Graphics): void {
    for (const prop of this.floorProps()) {
      const p = this.projection.project(prop.mapX, this.effectiveDepthMapY(prop));
      const overridden = this.depthOverrides[prop.frame] !== undefined;
      g.lineStyle(3, overridden ? 0xf472b6 : 0x22d3ee, 0.9);
      g.lineBetween(p.x - 80, p.y, p.x + 80, p.y);
      g.fillStyle(overridden ? 0xf472b6 : 0x22d3ee, 1);
      g.fillCircle(p.x, p.y, 5);
    }
  }

  // --- DOM toolbar ---------------------------------------------------------

  private buildToolbar(): void {
    const style = document.createElement('style');
    style.textContent = `
      .zone-editor-toolbar{position:fixed;top:12px;left:50%;transform:translateX(-50%);
        z-index:99999;display:flex;gap:8px;align-items:center;padding:8px 12px;
        background:rgba(20,16,21,.92);border:1px solid #3b3550;border-radius:10px;
        font:600 12px/1.2 system-ui,sans-serif;color:#f5f3ff;box-shadow:0 6px 24px rgba(0,0,0,.4)}
      .zone-editor-toolbar button{font:inherit;cursor:pointer;color:#f5f3ff;
        background:#3730a3;border:1px solid #4f46e5;border-radius:6px;padding:5px 9px}
      .zone-editor-toolbar button:hover{background:#4f46e5}
      .zone-editor-status{max-width:320px;opacity:.85;font-weight:500}
      .zone-editor-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
        z-index:99999;padding:9px 16px;background:#065f46;color:#ecfdf5;border-radius:8px;
        font:600 13px system-ui,sans-serif;opacity:0;transition:opacity .2s;pointer-events:none}
    `;
    document.head.appendChild(style);

    const bar = document.createElement('div');
    bar.className = 'zone-editor-toolbar';
    bar.innerHTML = `<span>Zone Editor</span>`;

    const newBtn = button('New (N)', () => {
      this.inProgress = [];
      this.mode = 'zones';
    });
    const modeBtn = button('Depth (Tab)', () => {
      this.mode = this.mode === 'zones' ? 'depth' : 'zones';
      this.setStatus(`Mode: ${this.mode}`);
    });
    const saveBtn = button('Save (S)', () => void this.save());
    const copyBtn = button('Copy JSON', () => void this.copyJson());
    const followBtn = button('Follow (F)', () =>
      this.scene.cameras.main.startFollow(this.options.playerVisual, true, 0.12, 0.12),
    );

    this.statusEl = document.createElement('span');
    this.statusEl.className = 'zone-editor-status';
    this.statusEl.textContent = 'Click art to place vertices. Enter to close.';

    bar.append(newBtn, modeBtn, saveBtn, copyBtn, followBtn, this.statusEl);
    document.body.appendChild(bar);
    this.toolbar = bar;

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'zone-editor-toast';
    document.body.appendChild(this.toastEl);
  }

  private setStatus(text: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }

  private toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    window.setTimeout(() => {
      this.toastEl.style.opacity = '0';
    }, 1400);
  }

  // --- persistence ---------------------------------------------------------

  private buildFile(): CollisionZonesFile {
    return {
      locationId: this.options.locationId,
      zones: this.zones.map((z) => ({ id: z.id, points: z.points.map((p) => [p[0], p[1]]) })),
      ...(Object.keys(this.depthOverrides).length > 0
        ? { propDepthOverrides: { ...this.depthOverrides } }
        : {}),
    };
  }

  private async save(): Promise<void> {
    const payload = this.buildFile();
    try {
      const res = await fetch('/__dev/save-collision-zones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        // Apply the just-authored zones to the running scene immediately so the
        // author can test collision without a reload. The rebuild uses these
        // same in-memory polygons (no need to re-read the file we just wrote) and
        // mirrors createMap's semantics, so live == save-then-reload.
        const scene = this.scene as unknown as ZoneColliderRebuildScene;
        scene.rebuildZoneColliders?.(payload);
        this.toast('Saved ✓ applied live');
      } else {
        this.toast(`Save failed (${res.status})`);
      }
    } catch (error) {
      this.toast(`Save error: ${String(error)}`);
    }
  }

  private async copyJson(): Promise<void> {
    const text = JSON.stringify(this.buildFile(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      this.toast('JSON copied to clipboard');
    } catch {
      window.prompt('Copy the zones JSON:', text);
    }
  }

  private destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.redraw, this);
    this.graphics.destroy();
    this.toolbar?.remove();
    this.toastEl?.remove();
  }
}

// --- module-local helpers --------------------------------------------------

function cloneZone(zone: CollisionZone): MutableZone {
  return { id: zone.id, points: zone.points.map((p) => [p[0], p[1]]) };
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}

function pointInPoly(px: number, py: number, polygon: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
