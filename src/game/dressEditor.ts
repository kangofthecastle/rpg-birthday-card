// Dev-only in-game prop-placement editor. Loaded lazily (dynamic import, guarded
// by import.meta.env.DEV + ?dressEdit=1 in LocationScene) so it never ships in a
// production bundle. Lets the author arrange a dressed room's furniture by hand:
// drag a prop to move it, arrow-nudge for pixel precision, scroll/±to resize,
// then export the COMPLETE updated `props` array as paste-ready TypeScript for
// src/content/roomDressing.ts.
//
// The player is frozen for the editor's lifetime (LocationScene gates its whole
// update on the freeze flag) so movement, interactions and edge transitions stay
// inert while editing — a mouse drag can never trigger an interaction.
//
// Controls
//   drag a prop       move it (screen->map via the inverse iso projection)
//   arrow keys        nudge selected prop 1 map-px (Shift = 8)
//   wheel / + / -     resize selected prop (heightRatio, or scale for flat props)
//   E                 export props[] to console + clipboard (toolbar has a button)
//   Esc               deselect

import Phaser from 'phaser';
import type { Projection } from './projection';
import type { IsoOrigin } from './isometricProjection';
import { positionPropImage, type PropHandle } from './roomRenderer';
import type { PropPlacement, RoomDressing } from '../content/roomDressing';

interface DressEditorOptions {
  readonly locationId: string;
  readonly projection: Projection;
  readonly origin: IsoOrigin;
  readonly dressing: RoomDressing;
  readonly propHandles: readonly PropHandle[];
  readonly propDepthOverrides: Readonly<Record<string, number>>;
  /** Freeze/unfreeze the player+interactions so editing stays inert. */
  readonly setPlayerFrozen: (frozen: boolean) => void;
}

type Writable<T> = { -readonly [K in keyof T]: T[K] };
type EditablePlacement = Writable<PropPlacement>;

interface PropEntry {
  placement: EditablePlacement;
  readonly image: Phaser.GameObjects.Image;
}

const OVERLAY_DEPTH = 1_000_000;
const HEIGHT_STEP = 0.02;
const SCALE_STEP = 0.02;
const MIN_HEIGHT = 0.05;
const MIN_SCALE = 0.02;

// Serialized field order, matching the interface/usage order in roomDressing.ts.
const FIELD_ORDER: readonly (keyof PropPlacement)[] = [
  'frame',
  'mapX',
  'mapY',
  'heightRatio',
  'footprint',
  'colliderOffsetY',
  'colliderOffsetX',
  'scale',
  'originX',
  'originY',
  'flipX',
  'screenYRaise',
  'wallShear',
  'fixedDepth',
  'depthMapY',
  'note',
];

export function startDressEditor(scene: Phaser.Scene, options: DressEditorOptions): void {
  new DressEditor(scene, options);
}

class DressEditor {
  private readonly scene: Phaser.Scene;
  private readonly options: DressEditorOptions;
  private readonly projection: Projection;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly entries: PropEntry[];

  private selected = -1;
  private dragging = false;
  private grabDX = 0;
  private grabDY = 0;

  private panel!: HTMLElement;
  private readoutEl!: HTMLElement;
  private toastEl!: HTMLElement;

  constructor(scene: Phaser.Scene, options: DressEditorOptions) {
    this.scene = scene;
    this.options = options;
    this.projection = options.projection;

    // Deep-enough clone: top-level fields are edited; footprint is copied so an
    // export round-trips even for props we never touch. The original dressing
    // data is never mutated.
    this.entries = options.propHandles.map((handle) => ({
      image: handle.image,
      placement: {
        ...handle.placement,
        ...(handle.placement.footprint ? { footprint: { ...handle.placement.footprint } } : {}),
      },
    }));

    this.graphics = scene.add.graphics().setDepth(OVERLAY_DEPTH);

    options.setPlayerFrozen(true);

    this.buildPanel();
    this.registerInput();
    this.updateReadout();

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
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const hit = this.hitProp(pointer.worldX, pointer.worldY);
    if (hit < 0) {
      this.selected = -1;
      this.updateReadout();
      return;
    }

    this.selected = hit;
    const map = this.projection.unproject(pointer.worldX, pointer.worldY);
    const placement = this.entries[hit].placement;
    // Grab offset so the prop doesn't jump its anchor to the cursor.
    this.grabDX = placement.mapX - map.x;
    this.grabDY = placement.mapY - map.y;
    this.dragging = true;
    this.updateReadout();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging || !pointer.isDown || this.selected < 0) {
      return;
    }
    const map = this.projection.unproject(pointer.worldX, pointer.worldY);
    const placement = this.entries[this.selected].placement;
    placement.mapX = Math.round(map.x + this.grabDX);
    placement.mapY = Math.round(map.y + this.grabDY);
    this.reposition(this.selected);
    this.updateReadout();
  }

  private onPointerUp(): void {
    this.dragging = false;
  }

  private onWheel(_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (this.selected < 0) {
      return;
    }
    this.resizeSelected(dy < 0 ? 1 : -1);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'KeyE') {
      void this.exportProps();
      return;
    }
    if (event.code === 'Escape') {
      this.selected = -1;
      this.updateReadout();
      return;
    }
    if (this.selected < 0) {
      return;
    }

    const step = event.shiftKey ? 8 : 1;
    const placement = this.entries[this.selected].placement;
    switch (event.code) {
      case 'ArrowLeft':
        event.preventDefault();
        placement.mapX -= step;
        break;
      case 'ArrowRight':
        event.preventDefault();
        placement.mapX += step;
        break;
      case 'ArrowUp':
        event.preventDefault();
        placement.mapY -= step;
        break;
      case 'ArrowDown':
        event.preventDefault();
        placement.mapY += step;
        break;
      case 'Equal':
      case 'NumpadAdd':
        event.preventDefault();
        this.resizeSelected(1);
        return;
      case 'Minus':
      case 'NumpadSubtract':
        event.preventDefault();
        this.resizeSelected(-1);
        return;
      default:
        return;
    }
    this.reposition(this.selected);
    this.updateReadout();
  }

  // --- editing helpers -----------------------------------------------------

  private resizeSelected(dir: number): void {
    const placement = this.entries[this.selected].placement;
    if (placement.heightRatio !== undefined) {
      placement.heightRatio = round3(Math.max(MIN_HEIGHT, placement.heightRatio + dir * HEIGHT_STEP));
    } else if (placement.scale !== undefined) {
      placement.scale = round3(Math.max(MIN_SCALE, placement.scale + dir * SCALE_STEP));
    } else {
      // Neither set (defaults to scale 1): start editing heightRatio from 1.
      placement.heightRatio = round3(Math.max(MIN_HEIGHT, 1 + dir * HEIGHT_STEP));
    }
    this.reposition(this.selected);
    this.updateReadout();
  }

  private reposition(index: number): void {
    const entry = this.entries[index];
    positionPropImage(
      this.scene,
      this.options.dressing,
      entry.placement,
      entry.image,
      this.options.origin,
      this.options.propDepthOverrides[entry.placement.frame],
    );
  }

  // Top-most (highest depth) prop whose billboard bounds contain the point.
  private hitProp(worldX: number, worldY: number): number {
    let best = -1;
    let bestDepth = -Infinity;
    for (let i = 0; i < this.entries.length; i += 1) {
      const image = this.entries[i].image;
      if (image.getBounds().contains(worldX, worldY) && image.depth >= bestDepth) {
        best = i;
        bestDepth = image.depth;
      }
    }
    return best;
  }

  // --- rendering -----------------------------------------------------------

  private redraw(): void {
    const g = this.graphics;
    g.clear();
    if (this.selected < 0) {
      return;
    }
    const entry = this.entries[this.selected];
    const b = entry.image.getBounds();
    g.lineStyle(2, 0x34d399, 1);
    g.strokeRect(b.x, b.y, b.width, b.height);

    // Anchor crosshair at the prop's projected floor point.
    const anchor = this.projection.project(entry.placement.mapX, entry.placement.mapY);
    g.lineStyle(2, 0xf59e0b, 1);
    g.lineBetween(anchor.x - 9, anchor.y, anchor.x + 9, anchor.y);
    g.lineBetween(anchor.x, anchor.y - 9, anchor.x, anchor.y + 9);
    g.fillStyle(0xf59e0b, 1);
    g.fillCircle(anchor.x, anchor.y, 3);
  }

  // --- DOM overlay ---------------------------------------------------------

  private buildPanel(): void {
    // Namespaced .dress-editor-* classes: avoids the generic .activity-panel
    // rule in styles.css out-specifying our styling.
    const style = document.createElement('style');
    style.textContent = `
      .dress-editor-panel{position:fixed;top:12px;left:12px;z-index:99999;
        min-width:220px;padding:10px 12px;background:rgba(20,16,21,.93);
        border:1px solid #3b3550;border-radius:10px;color:#f5f3ff;
        font:600 12px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4)}
      .dress-editor-panel h4{margin:0 0 6px;font-size:12px;letter-spacing:.03em}
      .dress-editor-panel .dress-editor-readout{font:500 12px/1.5 ui-monospace,
        Menlo,monospace;white-space:pre;color:#c7f9e5;margin:4px 0 8px}
      .dress-editor-panel .dress-editor-hint{opacity:.7;font-weight:500;
        font-size:11px;max-width:240px}
      .dress-editor-panel button{font:inherit;cursor:pointer;color:#f5f3ff;
        background:#3730a3;border:1px solid #4f46e5;border-radius:6px;
        padding:5px 9px;margin-top:6px}
      .dress-editor-panel button:hover{background:#4f46e5}
      .dress-editor-toast{position:fixed;bottom:24px;left:50%;
        transform:translateX(-50%);z-index:99999;padding:9px 16px;
        background:#065f46;color:#ecfdf5;border-radius:8px;
        font:600 13px system-ui,sans-serif;opacity:0;transition:opacity .2s;
        pointer-events:none}
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.className = 'dress-editor-panel';

    const title = document.createElement('h4');
    title.textContent = `Dress Editor — ${this.options.locationId}`;

    this.readoutEl = document.createElement('div');
    this.readoutEl.className = 'dress-editor-readout';

    const hint = document.createElement('div');
    hint.className = 'dress-editor-hint';
    hint.textContent =
      'Drag a prop to move · arrows nudge 1px (Shift 8) · wheel or +/- resize · E exports · Esc deselects';

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.textContent = 'Export props[] (E)';
    exportBtn.addEventListener('click', () => void this.exportProps());

    panel.append(title, this.readoutEl, hint, exportBtn);
    document.body.appendChild(panel);
    this.panel = panel;

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'dress-editor-toast';
    document.body.appendChild(this.toastEl);
  }

  private updateReadout(): void {
    if (this.selected < 0) {
      this.readoutEl.textContent = '(no prop selected)';
      return;
    }
    const p = this.entries[this.selected].placement;
    const size =
      p.heightRatio !== undefined
        ? `heightRatio ${p.heightRatio}`
        : `scale ${p.scale ?? 1}`;
    this.readoutEl.textContent = `${p.frame}\nmapX ${p.mapX}  mapY ${p.mapY}\n${size}`;
  }

  private toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    window.setTimeout(() => {
      this.toastEl.style.opacity = '0';
    }, 1600);
  }

  // --- export --------------------------------------------------------------

  private serializeProps(): string {
    const items = this.entries
      .map((entry) => serializePlacement(entry.placement))
      .join('\n');
    return `  props: [\n${items}\n  ],`;
  }

  private async exportProps(): Promise<void> {
    const text = this.serializeProps();
    // eslint-disable-next-line no-console
    console.log(`// dressEdit export — ${this.options.locationId}\n${text}`);
    try {
      await navigator.clipboard.writeText(text);
      this.toast('props[] copied to clipboard + console');
    } catch {
      this.toast('props[] logged to console (clipboard blocked)');
    }
  }

  private destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.redraw, this);
    const input = this.scene.input;
    input.off('pointerdown', this.onPointerDown, this);
    input.off('pointermove', this.onPointerMove, this);
    input.off('pointerup', this.onPointerUp, this);
    input.off('wheel', this.onWheel, this);
    this.scene.input.keyboard?.off('keydown', this.onKeyDown, this);
    this.graphics.destroy();
    this.panel?.remove();
    this.toastEl?.remove();
    this.options.setPlayerFrozen(false);
  }
}

// --- module-local helpers --------------------------------------------------

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function serializePlacement(placement: EditablePlacement): string {
  const lines: string[] = ['    {'];
  for (const key of FIELD_ORDER) {
    const value = placement[key];
    if (value === undefined) {
      continue;
    }
    lines.push(`      ${key}: ${serializeValue(key, value)},`);
  }
  lines.push('    },');
  return lines.join('\n');
}

function serializeValue(key: keyof PropPlacement, value: unknown): string {
  if (key === 'footprint' && value && typeof value === 'object') {
    const fp = value as { w: number; d: number };
    return `{ w: ${fp.w}, d: ${fp.d} }`;
  }
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "\\'")}'`;
  }
  return String(value);
}
