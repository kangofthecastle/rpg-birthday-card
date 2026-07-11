// Dev-only in-game prop-placement editor. Loaded lazily (dynamic import, guarded
// by import.meta.env.DEV + ?dressEdit=1 in LocationScene) so it never ships in a
// production bundle. Lets the author arrange a dressed room's furniture by hand:
// drag a prop to move it, arrow-nudge for pixel precision, scroll/±to resize,
// then Save the layout straight to disk (src/content/roomLayouts/<id>.json via
// the Vite dev endpoint; the HMR reload that follows shows the saved state).
// The E export (paste-ready TypeScript for the props[] array) is kept as a
// fallback for when the dev endpoint isn't available.
//
// The player is frozen for the editor's lifetime (LocationScene gates its whole
// update on the freeze flag) so movement, interactions and edge transitions stay
// inert while editing — a mouse drag can never trigger an interaction.
//
// Controls
//   drag a prop       move it (screen->map via the inverse iso projection)
//   arrow keys        nudge selected prop 1 map-px (Shift = 8)
//   wheel / + / -     resize selected prop (heightRatio, or scale for flat props)
//   wheel (no prop)   pan the camera (two-axis) — the room art (1408×1024) is
//                     larger than the 1280×720 frame, so pan to reach every corner
//   Space + drag      pan the camera (grab cursor); gated so it can't also start
//                     a prop drag
//   Delete/Backspace  remove the selected prop from the working layout (hidden +
//                     excluded from the E export)
//   Cmd/Ctrl + Z      undo the most recent removal
//   Save button       write the layout to roomLayouts/<id>.json (dev endpoint)
//   E                 export props[] to console + clipboard (fallback button too)
//   Esc               deselect

import Phaser from 'phaser';
import type { Projection } from './projection';
import type { IsoOrigin } from './isometricProjection';
import { positionPropImage, type PropHandle } from './roomRenderer';
import { getObjectLayer, type TiledMapJson } from './mapHelpers';
import type { TmjRectPatch } from './tmjRectPatch';
import {
  computeRemovedTombstones,
  type PropPlacement,
  type RoomDressing,
  type RoomLayoutFile,
} from '../content/roomDressing';

// Dev middleware (vite.config.ts) that writes the posted layout to
// src/content/roomLayouts/<locationId>.json. The glob in roomDressing.ts picks
// the file up, so the HMR reload that follows the write shows the saved state.
const SAVE_LAYOUT_ROUTE = '/__dev/save-room-layout';

// Dev middleware (vite.config.ts) that writes edited interactable hotspot rects
// back into the room's public/maps/<map>.tmj. Only x/y/width/height of the
// edited objects change; everything else round-trips faithfully.
const SAVE_MAP_OBJECTS_ROUTE = '/__dev/save-map-objects';

// Tiled object-group layer names in the room maps.
const INTERACTABLES_LAYER = 'Interactables';
const EXITS_LAYER = 'Exits';
const SPAWNS_LAYER = 'Spawns';

interface DressEditorOptions {
  readonly locationId: string;
  readonly projection: Projection;
  readonly origin: IsoOrigin;
  readonly dressing: RoomDressing;
  readonly propHandles: readonly PropHandle[];
  readonly propDepthOverrides: Readonly<Record<string, number>>;
  /**
   * Frame ids already tombstoned in the persisted layout (deliberately removed
   * in a prior session). Kept absent unless undone here, and re-persisted on
   * Save so singles-only deletions stay gone across reloads.
   */
  readonly removed?: readonly string[];
  /**
   * The room's parsed Tiled map. Used by the interactables mode to render and
   * edit the interactable hotspot rects (and show spawns/exits for reference).
   */
  readonly mapJson: TiledMapJson;
  /** Map file url (e.g. "/maps/recipient-house.tmj") — the tmj Save target. */
  readonly mapUrl: string;
  /** Freeze/unfreeze the player+interactions so editing stays inert. */
  readonly setPlayerFrozen: (frozen: boolean) => void;
}

type Writable<T> = { -readonly [K in keyof T]: T[K] };
type EditablePlacement = Writable<PropPlacement>;

interface PropEntry {
  placement: EditablePlacement;
  readonly image: Phaser.GameObjects.Image;
}

type EditorMode = 'props' | 'interactables';

// An editable interactable hotspot rect, in map coordinates. `id` is the Tiled
// object id, used to patch exactly this object back into the tmj on Save.
interface RectEntry {
  readonly id: number;
  readonly name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: Phaser.GameObjects.Text;
}

// A read-only reference marker parsed from the tmj (exit rect or spawn point).
interface RefRect {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: Phaser.GameObjects.Text;
}

interface RefPoint {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly label: Phaser.GameObjects.Text;
}

// Which corner of a rect a resize drag grabbed (map-space corner order matches
// getIsoRectCorners: 0=TL, 1=TR, 2=BR, 3=BL).
type Corner = 0 | 1 | 2 | 3;

const OVERLAY_DEPTH = 1_000_000;
const HEIGHT_STEP = 0.02;
const SCALE_STEP = 0.02;
const MIN_HEIGHT = 0.05;
const MIN_SCALE = 0.02;

// Interactables mode.
const MIN_RECT_SIZE = 8; // map px — never let a hotspot collapse to nothing
const RESIZE_STEP = 2; // map px per +/- keystroke / wheel notch
const HANDLE_HIT_RADIUS = 14; // screen px — how close a click must be to a corner
const COLOR_INTERACTABLE = 0xf1d79a; // gold — matches the in-game interact marker
const COLOR_SELECTED = 0x34d399; // green — matches the prop-selection highlight
const COLOR_EXIT = 0x74c7ec; // blue — matches the in-game exit marker
const COLOR_SPAWN = 0xff7ab6; // pink — distinct, read-only spawn points

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
  const editor = new DressEditor(scene, options);
  // Dev-only handle for tooling/tests driving the editor (e.g. locating a prop's
  // on-screen bounds to click it). Stripped from production builds.
  if (import.meta.env.DEV) {
    (window as unknown as { __dressEditor?: DressEditor }).__dressEditor = editor;
  }
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

  // --- interactables mode ---------------------------------------------------
  private mode: EditorMode = 'props';
  private rects: RectEntry[] = [];
  private exitRefs: RefRect[] = [];
  private spawnRefs: RefPoint[] = [];
  private selectedRect = -1;
  // Active rect drag: either a body move (grab offset in map px) or a corner
  // resize (which corner is being dragged).
  private rectDrag: { kind: 'move' } | { kind: 'resize'; corner: Corner } | null = null;
  private modeBtn?: HTMLButtonElement;

  // Camera panning (Space+drag / wheel-when-nothing-selected). Space gates the
  // drag so a pan can never simultaneously start a prop drag.
  private spaceDown = false;
  private panning = false;

  // Removed props, newest last, each with the entries[] index it was pulled
  // from so Cmd/Ctrl+Z can splice it back into place. Removed props are hidden
  // and excluded from the E export.
  private readonly removed: { index: number; entry: PropEntry }[] = [];

  // Frame ids tombstoned in the persisted layout before this session opened.
  // Folded into the Save payload (still-absent ones) and the removed-count
  // indicator so opening a room shows what's already deliberately absent.
  private readonly initialRemoved: readonly string[];

  private panel!: HTMLElement;
  private readoutEl!: HTMLElement;
  private removedCountEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private saveBtn!: HTMLButtonElement;
  private toastEl!: HTMLElement;

  constructor(scene: Phaser.Scene, options: DressEditorOptions) {
    this.scene = scene;
    this.options = options;
    this.projection = options.projection;
    this.initialRemoved = options.removed ?? [];

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

    // Detach camera follow so our panning isn't yanked back to the frozen
    // player each frame. Phaser still clamps scroll to the camera's setBounds().
    scene.cameras.main.stopFollow();

    options.setPlayerFrozen(true);

    this.buildPanel();
    this.registerInput();
    this.updateReadout();
    this.updateRemovedCount();

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

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // Space-drag pans instead of touching props (gate: no prop drag can start).
    if (this.spaceDown) {
      this.panning = true;
      this.updateCursor();
      return;
    }

    if (this.mode === 'interactables') {
      this.onRectPointerDown(pointer);
      return;
    }

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
    if (this.panning && pointer.isDown) {
      const cam = this.scene.cameras.main;
      cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom;
      cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom;
      return;
    }
    if (this.mode === 'interactables') {
      this.onRectPointerMove(pointer);
      return;
    }
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
    this.panning = false;
    this.rectDrag = null;
    this.updateCursor();
  }

  private onWheel(_pointer: Phaser.Input.Pointer, _over: unknown, dx: number, dy: number): void {
    // With a target selected, the wheel resizes it. With nothing selected it
    // pans the camera on both axes; Phaser clamps to setBounds().
    const hasSelection =
      this.mode === 'interactables' ? this.selectedRect >= 0 : this.selected >= 0;
    if (!hasSelection) {
      const cam = this.scene.cameras.main;
      cam.scrollX += dx / cam.zoom;
      cam.scrollY += dy / cam.zoom;
      return;
    }
    if (this.mode === 'interactables') {
      this.resizeSelectedRect(dy < 0 ? 1 : -1);
      return;
    }
    this.resizeSelected(dy < 0 ? 1 : -1);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      // Prevent the page from scrolling while Space is the pan modifier.
      event.preventDefault();
      this.spaceDown = true;
      this.updateCursor();
      return;
    }
    if (event.code === 'KeyM') {
      event.preventDefault();
      this.toggleMode();
      return;
    }
    if (event.code === 'Escape') {
      this.selected = -1;
      this.selectedRect = -1;
      this.updateReadout();
      return;
    }

    if (this.mode === 'interactables') {
      this.onRectKeyDown(event);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') {
      event.preventDefault();
      this.undoRemove();
      return;
    }
    if (event.code === 'KeyE') {
      void this.exportProps();
      return;
    }
    if (event.code === 'Delete' || event.code === 'Backspace') {
      event.preventDefault();
      this.removeSelected();
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

  private onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.spaceDown = false;
      this.panning = false;
      this.updateCursor();
    }
  }

  // --- editing helpers -----------------------------------------------------

  // Remove the selected prop: hide its sprite and pull it from entries[] so the
  // E export omits it. Pushed onto the undo stack with its index for Cmd/Ctrl+Z.
  private removeSelected(): void {
    if (this.selected < 0) {
      return;
    }
    const index = this.selected;
    const [entry] = this.entries.splice(index, 1);
    entry.image.setVisible(false);
    this.removed.push({ index, entry });
    this.selected = -1;
    this.updateRemovedCount();
    this.updateReadout();
    this.toast(`Removed ${entry.placement.frame} — Cmd/Ctrl+Z to undo`);
  }

  private undoRemove(): void {
    const last = this.removed.pop();
    if (!last) {
      this.toast('Nothing to undo');
      return;
    }
    const index = Math.min(last.index, this.entries.length);
    this.entries.splice(index, 0, last.entry);
    last.entry.image.setVisible(true);
    this.selected = index;
    this.updateRemovedCount();
    this.updateReadout();
    this.toast(`Restored ${last.entry.placement.frame}`);
  }

  private updateCursor(): void {
    const canvas = this.scene.game.canvas;
    if (!canvas) {
      return;
    }
    canvas.style.cursor = this.panning ? 'grabbing' : this.spaceDown ? 'grab' : '';
  }

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
    if (this.mode === 'interactables') {
      this.drawInteractables(g);
      return;
    }
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

  // --- interactables mode --------------------------------------------------

  // Toggle between the props layout editor and the interactable-hotspot editor.
  // Lazily builds the tmj-derived rects/markers the first time it's entered.
  private toggleMode(): void {
    this.mode = this.mode === 'props' ? 'interactables' : 'props';
    if (this.mode === 'interactables') {
      if (this.rects.length === 0 && this.exitRefs.length === 0 && this.spawnRefs.length === 0) {
        this.buildInteractables();
      }
      this.selected = -1;
      this.setInteractableLabelsVisible(true);
    } else {
      this.selectedRect = -1;
      this.rectDrag = null;
      this.setInteractableLabelsVisible(false);
    }
    this.updateModeButton();
    this.updateSaveButton();
    this.updateHint();
    this.updateReadout();
    this.toast(this.mode === 'interactables' ? 'Interactables mode' : 'Props mode');
  }

  // Parse the current room's tmj: editable interactable rects, plus read-only
  // exit rects and spawn points shown for reference while placing hotspots.
  private buildInteractables(): void {
    const map = this.options.mapJson;
    const depth = OVERLAY_DEPTH + 1;

    for (const object of getObjectLayer(map, INTERACTABLES_LAYER)?.objects ?? []) {
      this.rects.push({
        id: object.id,
        name: object.name,
        x: object.x,
        y: object.y,
        width: object.width ?? 0,
        height: object.height ?? 0,
        label: this.makeLabel(object.name, COLOR_INTERACTABLE, depth),
      });
    }
    for (const object of getObjectLayer(map, EXITS_LAYER)?.objects ?? []) {
      this.exitRefs.push({
        name: object.name,
        x: object.x,
        y: object.y,
        width: object.width ?? 0,
        height: object.height ?? 0,
        label: this.makeLabel(`exit: ${object.name}`, COLOR_EXIT, depth),
      });
    }
    for (const object of getObjectLayer(map, SPAWNS_LAYER)?.objects ?? []) {
      this.spawnRefs.push({
        name: object.name,
        x: object.x,
        y: object.y,
        label: this.makeLabel(`spawn: ${object.name}`, COLOR_SPAWN, depth),
      });
    }
    this.repositionAllLabels();
  }

  private makeLabel(text: string, color: number, depth: number): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, text, {
        color: colorToCss(color),
        backgroundColor: 'rgba(20,16,21,0.82)',
        padding: { x: 5, y: 2 },
        fontSize: '13px',
        fontStyle: '700',
      })
      .setOrigin(0.5, 1)
      .setDepth(depth)
      .setVisible(false);
  }

  private setInteractableLabelsVisible(visible: boolean): void {
    for (const rect of this.rects) rect.label.setVisible(visible);
    for (const ref of this.exitRefs) ref.label.setVisible(visible);
    for (const ref of this.spawnRefs) ref.label.setVisible(visible);
  }

  // Labels are placed in world space at each object's projected centre; the
  // camera handles scroll, so they only need repositioning when geometry moves.
  private repositionAllLabels(): void {
    for (const rect of this.rects) this.repositionRectLabel(rect);
    for (const ref of this.exitRefs) {
      const c = this.projection.project(ref.x + ref.width / 2, ref.y + ref.height / 2);
      ref.label.setPosition(c.x, c.y);
    }
    for (const ref of this.spawnRefs) {
      const c = this.projection.project(ref.x, ref.y);
      ref.label.setPosition(c.x, c.y - 6);
    }
  }

  private repositionRectLabel(rect: RectEntry): void {
    const c = this.projection.project(rect.x + rect.width / 2, rect.y + rect.height / 2);
    rect.label.setPosition(c.x, c.y);
  }

  // Map-space corners of a rect, in getIsoRectCorners order (TL, TR, BR, BL).
  private rectCornersMap(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): readonly { x: number; y: number }[] {
    return [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ];
  }

  private onRectPointerDown(pointer: Phaser.Input.Pointer): void {
    // If a rect is already selected, a click near one of its projected corners
    // starts a resize before any move/reselect.
    if (this.selectedRect >= 0) {
      const corner = this.hitHandle(this.rects[this.selectedRect], pointer.worldX, pointer.worldY);
      if (corner !== null) {
        this.rectDrag = { kind: 'resize', corner };
        return;
      }
    }

    const map = this.projection.unproject(pointer.worldX, pointer.worldY);
    const hit = this.hitRect(map.x, map.y);
    if (hit < 0) {
      this.selectedRect = -1;
      this.rectDrag = null;
      this.updateReadout();
      return;
    }

    this.selectedRect = hit;
    const rect = this.rects[hit];
    // Grab offset so the rect doesn't jump its corner to the cursor.
    this.grabDX = rect.x - map.x;
    this.grabDY = rect.y - map.y;
    this.rectDrag = { kind: 'move' };
    this.updateReadout();
  }

  private onRectPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.rectDrag || !pointer.isDown || this.selectedRect < 0) {
      return;
    }
    const rect = this.rects[this.selectedRect];
    const map = this.projection.unproject(pointer.worldX, pointer.worldY);
    if (this.rectDrag.kind === 'move') {
      rect.x = Math.round(map.x + this.grabDX);
      rect.y = Math.round(map.y + this.grabDY);
    } else {
      this.resizeRectCorner(rect, this.rectDrag.corner, Math.round(map.x), Math.round(map.y));
    }
    this.repositionRectLabel(rect);
    this.updateReadout();
  }

  // Drag one corner to `(mx, my)`, keeping the diagonally-opposite corner fixed
  // and enforcing a minimum size.
  private resizeRectCorner(rect: RectEntry, corner: Corner, mx: number, my: number): void {
    const left = rect.x;
    const top = rect.y;
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    switch (corner) {
      case 0: // TL — right/bottom fixed
        rect.x = Math.min(mx, right - MIN_RECT_SIZE);
        rect.y = Math.min(my, bottom - MIN_RECT_SIZE);
        rect.width = right - rect.x;
        rect.height = bottom - rect.y;
        break;
      case 1: // TR — left/bottom fixed
        rect.y = Math.min(my, bottom - MIN_RECT_SIZE);
        rect.width = Math.max(mx - left, MIN_RECT_SIZE);
        rect.height = bottom - rect.y;
        break;
      case 2: // BR — left/top fixed
        rect.width = Math.max(mx - left, MIN_RECT_SIZE);
        rect.height = Math.max(my - top, MIN_RECT_SIZE);
        break;
      case 3: // BL — right/top fixed
        rect.x = Math.min(mx, right - MIN_RECT_SIZE);
        rect.width = right - rect.x;
        rect.height = Math.max(my - top, MIN_RECT_SIZE);
        break;
    }
  }

  // Keyboard: arrows nudge position (Shift = 8), +/- resize keeping the top-left
  // corner fixed. Mirrors props-mode's arrow/± controls.
  private onRectKeyDown(event: KeyboardEvent): void {
    if (this.selectedRect < 0) {
      return;
    }
    const rect = this.rects[this.selectedRect];
    const step = event.shiftKey ? 8 : 1;
    switch (event.code) {
      case 'ArrowLeft':
        event.preventDefault();
        rect.x -= step;
        break;
      case 'ArrowRight':
        event.preventDefault();
        rect.x += step;
        break;
      case 'ArrowUp':
        event.preventDefault();
        rect.y -= step;
        break;
      case 'ArrowDown':
        event.preventDefault();
        rect.y += step;
        break;
      case 'Equal':
      case 'NumpadAdd':
        event.preventDefault();
        this.resizeSelectedRect(1);
        return;
      case 'Minus':
      case 'NumpadSubtract':
        event.preventDefault();
        this.resizeSelectedRect(-1);
        return;
      default:
        return;
    }
    this.repositionRectLabel(rect);
    this.updateReadout();
  }

  // Grow/shrink the selected rect uniformly, keeping its top-left fixed.
  private resizeSelectedRect(dir: number): void {
    if (this.selectedRect < 0) {
      return;
    }
    const rect = this.rects[this.selectedRect];
    rect.width = Math.max(MIN_RECT_SIZE, rect.width + dir * RESIZE_STEP);
    rect.height = Math.max(MIN_RECT_SIZE, rect.height + dir * RESIZE_STEP);
    this.repositionRectLabel(rect);
    this.updateReadout();
  }

  // Index of the first interactable rect whose map-space rect contains (mx, my).
  private hitRect(mx: number, my: number): number {
    for (let i = 0; i < this.rects.length; i += 1) {
      const r = this.rects[i];
      if (mx >= r.x && mx <= r.x + r.width && my >= r.y && my <= r.y + r.height) {
        return i;
      }
    }
    return -1;
  }

  // Which corner handle (if any) of `rect` is within grab range of the cursor,
  // tested in screen space so the hit target is uniform regardless of zoom/iso.
  private hitHandle(rect: RectEntry, worldX: number, worldY: number): Corner | null {
    const corners = this.rectCornersMap(rect);
    for (let i = 0; i < corners.length; i += 1) {
      const p = this.projection.project(corners[i].x, corners[i].y);
      if (Math.hypot(p.x - worldX, p.y - worldY) <= HANDLE_HIT_RADIUS) {
        return i as Corner;
      }
    }
    return null;
  }

  private drawInteractables(g: Phaser.GameObjects.Graphics): void {
    // Read-only reference markers first (drawn under the editable rects).
    for (const ref of this.exitRefs) {
      this.strokeRectMap(g, ref, COLOR_EXIT, 0.16);
    }
    for (const ref of this.spawnRefs) {
      const p = this.projection.project(ref.x, ref.y);
      g.fillStyle(COLOR_SPAWN, 0.85);
      g.fillCircle(p.x, p.y, 6);
      g.lineStyle(2, COLOR_SPAWN, 1);
      g.strokeCircle(p.x, p.y, 10);
      g.lineBetween(p.x - 13, p.y, p.x + 13, p.y);
      g.lineBetween(p.x, p.y - 13, p.x, p.y + 13);
    }

    // Editable interactable rects; the selected one gets a brighter outline and
    // draggable corner handles.
    for (let i = 0; i < this.rects.length; i += 1) {
      const rect = this.rects[i];
      const selected = i === this.selectedRect;
      const color = selected ? COLOR_SELECTED : COLOR_INTERACTABLE;
      this.strokeRectMap(g, rect, color, selected ? 0.3 : 0.2);
      if (selected) {
        g.fillStyle(COLOR_SELECTED, 1);
        g.lineStyle(2, 0x14261f, 1);
        for (const corner of this.rectCornersMap(rect)) {
          const p = this.projection.project(corner.x, corner.y);
          g.fillRect(p.x - 6, p.y - 6, 12, 12);
          g.strokeRect(p.x - 6, p.y - 6, 12, 12);
        }
      }
    }
  }

  private strokeRectMap(
    g: Phaser.GameObjects.Graphics,
    rect: { x: number; y: number; width: number; height: number },
    color: number,
    fillAlpha: number,
  ): void {
    const points = this.rectCornersMap(rect).map((c) => {
      const p = this.projection.project(c.x, c.y);
      return new Phaser.Geom.Point(p.x, p.y);
    });
    g.fillStyle(color, fillAlpha);
    g.fillPoints(points, true);
    g.lineStyle(2, color, 0.95);
    g.strokePoints(points, true);
  }

  // Build the tmj patch payload and persist it via the dev endpoint. Only the
  // editable interactable rects are saved; spawns/exits are reference-only.
  private async saveInteractables(): Promise<void> {
    const objects: TmjRectPatch[] = this.rects.map((rect) => ({
      layer: INTERACTABLES_LAYER,
      id: rect.id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }));
    const payload = { mapPath: mapBasename(this.options.mapUrl), objects };
    try {
      const res = await fetch(SAVE_MAP_OBJECTS_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        this.toast('Interactables saved ✓ reloading to apply');
      } else {
        this.toast(`Save failed (${res.status})`);
      }
    } catch (error) {
      this.toast(`Save error: ${String(error)}`);
    }
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
      .dress-editor-panel .dress-editor-removed{color:#fca5a5;font-weight:600;
        font-size:11px;margin:0 0 6px;min-height:0}
      .dress-editor-panel .dress-editor-removed:empty{display:none}
      .dress-editor-panel .dress-editor-hint{opacity:.7;font-weight:500;
        font-size:11px;max-width:240px}
      .dress-editor-panel button{font:inherit;cursor:pointer;color:#f5f3ff;
        background:#3730a3;border:1px solid #4f46e5;border-radius:6px;
        padding:5px 9px;margin-top:6px}
      .dress-editor-panel button:hover{background:#4f46e5}
      .dress-editor-panel button:disabled{opacity:.5;cursor:not-allowed}
      .dress-editor-panel button.dress-editor-save{background:#047857;
        border-color:#059669;margin-right:6px}
      .dress-editor-panel button.dress-editor-save:hover{background:#059669}
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

    this.removedCountEl = document.createElement('div');
    this.removedCountEl.className = 'dress-editor-removed';

    const hint = document.createElement('div');
    hint.className = 'dress-editor-hint';
    this.hintEl = hint;

    const modeBtn = document.createElement('button');
    modeBtn.type = 'button';
    modeBtn.title = 'Toggle between editing props and interactable hotspot rects (M)';
    modeBtn.addEventListener('click', () => this.toggleMode());
    this.modeBtn = modeBtn;

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'dress-editor-save';
    this.saveBtn = saveBtn;
    if (import.meta.env.DEV) {
      // Save routes to the current mode's dev endpoint (props → roomLayouts,
      // interactables → the room's tmj).
      saveBtn.addEventListener('click', () => {
        if (this.mode === 'interactables') {
          void this.saveInteractables();
        } else {
          void this.saveLayout();
        }
      });
    } else {
      saveBtn.disabled = true;
      saveBtn.title = 'Save is only available on the Vite dev server';
    }

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.textContent = 'Export props[] (E)';
    exportBtn.title = 'Copy the props[] as paste-ready TypeScript (fallback)';
    exportBtn.addEventListener('click', () => void this.exportProps());

    panel.append(title, this.readoutEl, this.removedCountEl, hint, modeBtn, saveBtn, exportBtn);
    document.body.appendChild(panel);
    this.panel = panel;

    this.updateModeButton();
    this.updateSaveButton();
    this.updateHint();

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'dress-editor-toast';
    document.body.appendChild(this.toastEl);
  }

  private updateReadout(): void {
    if (this.mode === 'interactables') {
      if (this.selectedRect < 0) {
        this.readoutEl.textContent = '(no interactable selected)';
        return;
      }
      const r = this.rects[this.selectedRect];
      this.readoutEl.textContent =
        `${r.name}\nx ${r.x}  y ${r.y}\nw ${r.width}  h ${r.height}`;
      return;
    }
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

  private updateModeButton(): void {
    if (!this.modeBtn) {
      return;
    }
    this.modeBtn.textContent =
      this.mode === 'interactables' ? 'Mode: Interactables → Props (M)' : 'Mode: Props → Interactables (M)';
  }

  private updateSaveButton(): void {
    if (!this.saveBtn || !import.meta.env.DEV) {
      return;
    }
    if (this.mode === 'interactables') {
      this.saveBtn.textContent = 'Save interactables';
      this.saveBtn.title = 'Write the edited hotspot rects back into public/maps/<map>.tmj (dev server)';
    } else {
      this.saveBtn.textContent = 'Save layout';
      this.saveBtn.title = 'Write this room’s layout to src/content/roomLayouts/<id>.json (dev server)';
    }
  }

  private updateHint(): void {
    this.hintEl.textContent =
      this.mode === 'interactables'
        ? 'M switches back to props · drag a rect to move · drag a corner handle to resize · ' +
          'arrows nudge 1px (Shift 8) · wheel or +/- resize · pan: Space-drag or wheel with nothing selected · ' +
          'exits (blue) and spawns (pink) are read-only reference · Save writes the tmj · Esc deselects'
        : 'Drag a prop to move · arrows nudge 1px (Shift 8) · wheel or +/- resize a selected prop · ' +
          'pan: Space-drag or wheel with nothing selected · Del/Backspace removes · Cmd/Ctrl+Z undo · ' +
          'M edits interactable rects · Save writes the layout · E exports · Esc deselects';
  }

  private updateRemovedCount(): void {
    if (!this.removedCountEl) {
      return;
    }
    const n = this.tombstonedFrames().length;
    this.removedCountEl.textContent =
      n > 0 ? `⚠ ${n} prop${n === 1 ? '' : 's'} removed (tombstoned on Save)` : '';
  }

  private toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    window.setTimeout(() => {
      this.toastEl.style.opacity = '0';
    }, 1600);
  }

  // --- persistence ---------------------------------------------------------

  // Frame ids to persist as tombstones: previously-tombstoned ids still absent
  // plus this session's removals, minus anything currently present (an undo puts
  // a prop back in entries[], clearing its tombstone).
  private tombstonedFrames(): string[] {
    return computeRemovedTombstones(
      this.entries.map((entry) => entry.placement.frame),
      this.initialRemoved,
      this.removed.map((r) => r.entry.placement.frame),
    );
  }

  // The working layout as a RoomLayoutFile. Removed props are already spliced
  // out of entries[], so they are naturally excluded from the saved file; the
  // `removed` tombstones stop singles-only props re-merging on the next reload.
  private buildLayoutFile(): RoomLayoutFile {
    const removed = this.tombstonedFrames();
    return {
      locationId: this.options.locationId,
      props: this.entries.map((entry) => entry.placement),
      ...(removed.length > 0 ? { removed } : {}),
    };
  }

  // Persist the working layout to disk via the dev endpoint. On success Vite
  // sees the new roomLayouts/<id>.json and full-reloads, showing the saved
  // state; no hand-paste needed. Falls back to a toast on any failure.
  private async saveLayout(): Promise<void> {
    const payload = this.buildLayoutFile();
    try {
      const res = await fetch(SAVE_LAYOUT_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        this.toast('Layout saved ✓ reloading to apply');
      } else {
        this.toast(`Save failed (${res.status}) — use Export as fallback`);
      }
    } catch (error) {
      this.toast(`Save error: ${String(error)} — use Export as fallback`);
    }
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
    this.scene.input.keyboard?.off('keyup', this.onKeyUp, this);
    if (this.scene.game.canvas) {
      this.scene.game.canvas.style.cursor = '';
    }
    this.graphics.destroy();
    for (const rect of this.rects) rect.label.destroy();
    for (const ref of this.exitRefs) ref.label.destroy();
    for (const ref of this.spawnRefs) ref.label.destroy();
    this.panel?.remove();
    this.toastEl?.remove();
    this.options.setPlayerFrozen(false);
  }
}

// --- module-local helpers --------------------------------------------------

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// 0xRRGGBB -> "#rrggbb" for Phaser text style colours.
function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

// "/maps/recipient-house.tmj" -> "recipient-house.tmj" (the tmj Save target basename).
function mapBasename(mapUrl: string): string {
  return mapUrl.split('/').pop() ?? mapUrl;
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
