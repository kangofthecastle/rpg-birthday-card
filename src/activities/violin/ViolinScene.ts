import Phaser from 'phaser';
import { playSfx, playViolinNote } from '../../game/audio';
import { isImageUrl } from '../../game/assetProbe';
import { fnv1a, mulberry32 } from '../../game/rng';
import {
  VIOLIN_PHRASES,
  VIOLIN_PITCHES,
  getPitch,
  type ViolinPhrase,
} from './melody';
import {
  advanceViolin,
  createViolinState,
  expectedPitchId,
  finaleTimeline,
  getPhrase,
  litNoteCount,
  pressViolinKey,
  type ViolinState,
} from './violinModel';

export interface ViolinSceneCallbacks {
  readonly onComplete: () => void;
  readonly onCancel: () => void;
}

const DEFAULT_CALLBACKS: ViolinSceneCallbacks = {
  onComplete: () => undefined,
  onCancel: () => undefined,
};

// Canvas matches the other activities (640x360, 16:9).
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 360;

// Optional drop-in backdrop art (a warm room / music-stand view). File-first:
// if present it is used, otherwise a rich procedural dusk room is drawn.
const BACKDROP_KEY = 'violin-room-backdrop';
const BACKDROP_URL = '/assets/activities/violin/room-backdrop.png';

// The model is driven by real elapsed wall-clock time (not Phaser's smoothed
// per-frame delta), so playback tempo is correct regardless of render FPS. A
// single step is clamped so a backgrounded tab resuming can't teleport the model.
const MAX_MODEL_STEP_MS = 250;

// ---------------------------------------------------------------------------
// Sheet geometry. The sheet lives inside a slightly tilted container centred on
// the stand, so notes, staff ruling and key labels are all authored in the
// paper's own local space (origin at its centre) and share the tilt for free.
// ---------------------------------------------------------------------------
const SHEET_WIDTH = 448;
const SHEET_HEIGHT = 176;
const SHEET_CX = 320;
const SHEET_CY = 150;
const SHEET_TILT = -0.017; // ~1° — the read of paper resting on a stand.

const STAFF_GAP = 16;
const STAFF_STEP_PX = STAFF_GAP / 2;
// Staff lines in paper-local Y (centre = 0). Bottom line carries E4 (step 0).
const STAFF_BOTTOM_LOCAL = 34;
const STAFF_LEFT_LOCAL = -196;
const STAFF_RIGHT_LOCAL = 196;
const CLEF_LOCAL_X = -176;
const NOTE_LEFT_LOCAL = -150;
const NOTE_RIGHT_LOCAL = 198;

// Window in the left margin — the dusk sky, and the source of the finale flood.
const WINDOW = { x: 14, y: 52, w: 66, h: 150 } as const;
const WINDOW_LIGHT = { x: WINDOW.x + WINDOW.w / 2, y: WINDOW.y + WINDOW.h * 0.62 };

const CAPTION_TEXT = 'she finally hears how it ends.';
const CAPTION_FADE_MS = 1400;
const CAPTION_HOLD_MS = 1800;

// Warm base wall colours, one rung per phrase advance (index 0 = first phrase).
// The wall is baked once at the coolest rung; this array's length also drives
// the warmStage clamp the transition logic keys off, so it stays 5 long.
const WARM_STAGES = [0x241c2b, 0x33232e, 0x45302f, 0x5a3a2e, 0x6f4529] as const;

// Warm ink / light palette for the note choreography.
const INK = 0x5a3f24;
const NOTE_LIT = 0xf6b23c;
const NOTE_GLOW = 0xffcf6b;
const NOTE_HALO = 0xffe6a6;

interface NoteMark {
  x: number;
  y: number;
}

/** Linear blend between two packed 0xRRGGBB colours. */
function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export class ViolinScene extends Phaser.Scene {
  private readonly callbacks: ViolinSceneCallbacks;
  private modelState: ViolinState = createViolinState();

  private roomBase!: Phaser.GameObjects.Graphics; // baked once, warm dusk room
  private roomLight!: Phaser.GameObjects.Graphics; // per-frame dim / warmth / vignette
  private beamFx!: Phaser.GameObjects.Graphics; // additive finale flood
  private sheet!: Phaser.GameObjects.Container; // tilted paper + staff + notes
  private staff!: Phaser.GameObjects.Graphics; // (child of sheet) live note layer
  private legendGfx!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private helperText!: Phaser.GameObjects.Text;
  private legendLetters: Phaser.GameObjects.Text[] = [];
  private legendNames: Phaser.GameObjects.Text[] = [];
  private captionText!: Phaser.GameObjects.Text;

  private noteKeys = new Map<string, Phaser.Input.Keyboard.Key>();
  private escapeKey?: Phaser.Input.Keyboard.Key;
  private noteKeyLabels: Phaser.GameObjects.Text[] = [];
  private panelEl: HTMLElement | null = null;

  private prevLitCount = 0;
  private warmStage = 0;
  private glowStrength = 0;
  private goldenPour = 0;
  private wrongFlash = 0;
  private finaleStarted = false;
  private isFinalizing = false;
  private callbackDelivered = false;

  // Eased focus: 1 = room dimmed, sheet is the bright centre (playback);
  // ~0.4 while echoing; 0 during the finale flood.
  private sheetFocus = 1;
  // Per-note lingering embers for the current phrase, and the count of marks
  // already flared so a freshly lit note gets a one-shot bloom.
  private emberLevels: number[] = [];
  private litShown = 0;

  constructor(callbacks: ViolinSceneCallbacks = DEFAULT_CALLBACKS) {
    super('ViolinScene');
    this.callbacks = callbacks;
  }

  preload(): void {
    // The optional drop-in backdrop art is probed + loaded in create() via a
    // content-type check, so a missing file never logs a red loader error.
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#161019');

    this.generatePaperTexture();
    this.generateMoteTexture();

    this.roomBase = this.add.graphics().setDepth(-5);
    this.roomLight = this.add.graphics().setDepth(-1);
    this.beamFx = this.add.graphics().setDepth(40).setBlendMode(Phaser.BlendModes.ADD);

    this.drawRoomBase();
    this.createSheet();
    this.createNoteLabels();
    this.createHud();
    this.createLegend();
    this.createInput();

    // Kick off the first phrase playing itself.
    this.modelState = createViolinState();
    this.prevLitCount = 0;
    this.litShown = 0;
    this.emberLevels = [];

    this.panelEl =
      (this.game.canvas.closest('.activity-panel') as HTMLElement | null) ??
      this.game.canvas.parentElement;

    this.drawRoomLight();
    this.updateHud();
    this.drawStaff(0);
    this.updateLegend(0);
    this.updateObservability();

    void this.maybeLoadBackdrop();
  }

  // The backdrop is optional drop-in art. Probe its existence with a content-type
  // check first (mirrors BootScene) so a missing PNG stays silent, then load it
  // and drop it in behind the sheet at zero code cost when it appears later.
  private async maybeLoadBackdrop(): Promise<void> {
    if (this.textures.exists(BACKDROP_KEY)) {
      this.placeBackdropImage();
      return;
    }
    if (!(await isImageUrl(BACKDROP_URL))) {
      return;
    }
    if (!this.scene.isActive()) {
      return;
    }
    this.load.image(BACKDROP_KEY, BACKDROP_URL);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (this.scene.isActive() && this.textures.exists(BACKDROP_KEY)) {
        this.placeBackdropImage();
      }
    });
    this.load.start();
  }

  private placeBackdropImage(): void {
    // Real art, when present, sits over the procedural room but under the warm
    // light pass and the sheet, so the dim/warmth/flood choreography still reads.
    this.add
      .image(0, 0, BACKDROP_KEY)
      .setOrigin(0)
      .setDisplaySize(CANVAS_WIDTH, CANVAS_HEIGHT)
      .setAlpha(0.6)
      .setDepth(-3);
  }

  update(time: number, _delta: number): void {
    if (
      !this.isFinalizing &&
      this.escapeKey &&
      Phaser.Input.Keyboard.JustDown(this.escapeKey)
    ) {
      this.cancelActivity();
      return;
    }

    // Drive the model from real elapsed wall-clock time, not Phaser's smoothed
    // per-frame delta — so playback tempo is right even when the render loop is
    // running slow (e.g. a heavy scene drawing behind the modal). Clamped so a
    // resumed background tab can't jump the model forward.
    const modelDelta = Math.min(MAX_MODEL_STEP_MS, this.game.loop.rawDelta);

    if (!this.isFinalizing) {
      this.handleKeyPresses();
      const before = this.modelState;
      const after = advanceViolin(before, modelDelta);
      this.modelState = after;
      this.reactToTransitions(before, after);
    }

    // Ease transient effects.
    this.glowStrength = Math.max(0, this.glowStrength - modelDelta / 320);
    this.wrongFlash = Math.max(0, this.wrongFlash - modelDelta / 260);
    for (let i = 0; i < this.emberLevels.length; i += 1) {
      this.emberLevels[i] = Math.max(0, this.emberLevels[i] - modelDelta / 1100);
    }
    if (this.finaleStarted) {
      this.goldenPour = Math.min(1, this.goldenPour + modelDelta / 2400);
    }
    // Ease the room's focus toward the current phase's target.
    const focusTarget = this.isFinalizing
      ? 0
      : this.modelState.phase === 'echo'
        ? 0.4
        : this.modelState.phase === 'finale'
          ? 0
          : 1;
    this.sheetFocus += (focusTarget - this.sheetFocus) * Math.min(1, modelDelta / 240);

    this.drawRoomLight();
    this.updateHud();
    this.drawStaff(time);
    this.updateLegend(time);
    this.updateObservability();
  }

  // Mirrors the scene's model state onto the panel DOM so smoke tests can wait on
  // real gameplay progress deterministically (Phaser canvas state is not
  // queryable). Cheap string writes, only when the value changes.
  private updateObservability(): void {
    const panel = this.panelEl;
    if (!panel) {
      return;
    }
    const phase = this.modelState.phase;
    const phrase = String(this.modelState.phraseIndex);
    const echo = String(this.modelState.echoIndex);
    if (panel.dataset.violinState !== phase) {
      panel.dataset.violinState = phase;
    }
    if (panel.dataset.violinPhrase !== phrase) {
      panel.dataset.violinPhrase = phrase;
    }
    if (panel.dataset.violinEcho !== echo) {
      panel.dataset.violinEcho = echo;
    }
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------

  private createInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard) {
      VIOLIN_PITCHES.forEach((pitch) => {
        const key = keyboard.addKey(pitch.key, false);
        this.noteKeys.set(pitch.key, key);
      });
      this.escapeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      // Note keys are added without capture so this (separate) game never
      // preventDefaults them. The real swallow was the UNDERLYING LocationScene's
      // global capture of A/S/D (WASD movement): once one game's window keydown
      // listener calls preventDefault, Phaser's other game bails on
      // `event.defaultPrevented`. LocationScene.startActivity now releases its
      // global capture while an activity is mounted, so the echo can read them.
    }
  }

  private handleKeyPresses(): void {
    if (this.modelState.phase !== 'echo') {
      return;
    }
    for (const [keyName, key] of this.noteKeys) {
      if (Phaser.Input.Keyboard.JustDown(key)) {
        this.resolvePress(keyName);
        // One resolved press per frame keeps feedback legible.
        return;
      }
    }
  }

  private resolvePress(keyName: string): void {
    const before = this.modelState;
    const echoedIndex = before.echoIndex;
    const after = pressViolinKey(before, keyName);
    this.modelState = after;

    if (after.lastResult === 'ring') {
      const phrase = getPhrase(before);
      const note = phrase?.notes[echoedIndex];
      const pitch = note ? getPitch(note.pitchId) : undefined;
      if (pitch) {
        playViolinNote(pitch.frequency, 640);
      }
      this.glowStrength = 1;
    } else if (after.lastResult === 'waver') {
      playSfx('sfx-violin-waver');
      this.wrongFlash = 1;
    }

    this.reactToTransitions(before, after);
  }

  // ------------------------------------------------------------------
  // Transitions between phases / phrases
  // ------------------------------------------------------------------

  private reactToTransitions(before: ViolinState, after: ViolinState): void {
    // New notes lighting during playback → sound each one.
    if (after.phase === 'playback') {
      // Any FRESH playback re-sounds from the top: a phrase advance (echo→
      // playback of the next phrase) AND a waver replay (echo→playback of the
      // SAME phrase, phraseIndex unchanged) both restart from note 0, so the
      // "listen again" always plays its opening notes. Only a continuing
      // same-phrase playback resumes from what has already sounded.
      const restarted = before.phase !== 'playback';
      if (restarted) {
        this.prevLitCount = 0;
      }
      const litNow = litNoteCount(after);
      const from = restarted ? 0 : this.prevLitCount;
      if (litNow > from) {
        const phrase = getPhrase(after);
        if (phrase) {
          for (let i = Math.max(0, from); i < litNow; i += 1) {
            const pitch = getPitch(phrase.notes[i].pitchId);
            if (pitch) {
              playViolinNote(pitch.frequency, phrase.notes[i].durationMs);
            }
          }
        }
      }
      this.prevLitCount = litNow;
    } else {
      this.prevLitCount = litNoteCount(after);
    }

    // Advanced to a new phrase → warm the room a step. Skipped during the finale,
    // whose phrase index pages back through the whole piece (0→last) as it
    // replays — the room is already at its warmest by then and must not cool.
    if (after.phase !== 'finale' && after.phraseIndex > before.phraseIndex) {
      this.warmStage = Math.min(WARM_STAGES.length - 1, after.phraseIndex);
    }

    // Handed off to the whole-piece finale replay.
    if (after.phase === 'finale' && before.phase !== 'finale' && !this.finaleStarted) {
      this.startFinale();
    }

    // The piece is finished.
    if (after.finished && !this.isFinalizing) {
      this.finish();
    }
  }

  private startFinale(): void {
    this.finaleStarted = true;
    this.warmStage = WARM_STAGES.length - 1;
    this.spawnFinaleMotes();

    // The whole piece she just played pours back through as one continuous line.
    // Every note of every phrase is scheduled on the finale clock; the model
    // (driven in update) pages the staff and lights each mark to match. The
    // richer swell blooms underneath — retriggered at each phrase boundary so the
    // warm D-major layer carries the entire replay, never thinning out.
    const timeline = finaleTimeline();
    playSfx('sfx-violin-swell');

    for (const note of timeline) {
      if (note.noteIndex === 0 && note.phraseIndex > 0) {
        // A fresh bloom at the top of each phrase keeps the bed continuous
        // (the swell rings ~5s; phrases run ~3s, so they always overlap).
        const at = note.startMs;
        this.time.delayedCall(at, () => playSfx('sfx-violin-swell'));
      }
    }

    for (const note of timeline) {
      const pitch = getPitch(note.pitchId);
      if (!pitch) {
        continue;
      }
      const frequency = pitch.frequency;
      const durationMs = note.durationMs;
      this.time.delayedCall(note.startMs, () => {
        playViolinNote(frequency, durationMs + 160);
        this.glowStrength = 1;
      });
    }
  }

  private finish(): void {
    if (this.isFinalizing) {
      return;
    }
    this.isFinalizing = true;
    this.helperText.setText('');
    this.titleText.setText('');

    this.captionText.setText(CAPTION_TEXT);
    this.tweens.add({
      targets: this.captionText,
      alpha: 1,
      duration: CAPTION_FADE_MS,
      ease: 'Sine.easeIn',
    });
    this.time.delayedCall(CAPTION_FADE_MS + CAPTION_HOLD_MS, () => this.completeActivity());
  }

  private completeActivity(): void {
    if (this.callbackDelivered) {
      return;
    }
    this.callbackDelivered = true;
    this.callbacks.onComplete();
  }

  private cancelActivity(): void {
    if (this.callbackDelivered) {
      return;
    }
    this.callbackDelivered = true;
    this.callbacks.onCancel();
  }

  // ==================================================================
  // The room — baked once (warm dusk wall, lamp, window, music stand).
  // ==================================================================

  private drawRoomBase(): void {
    const g = this.roomBase;
    g.clear();

    // Wall: a warm vertical wash from a cool plum ceiling down to a warmer skirt,
    // painted in bands. Baked at the coolest rung; the light pass adds warmth.
    const wallTop = 0x1a141f;
    const wallBottom = mixHex(WARM_STAGES[0], 0x2a2030, 0.5);
    const bands = 48;
    for (let i = 0; i < bands; i += 1) {
      const t = i / (bands - 1);
      g.fillStyle(mixHex(wallTop, wallBottom, t), 1);
      g.fillRect(0, (i * CANVAS_HEIGHT) / bands, CANVAS_WIDTH, CANVAS_HEIGHT / bands + 1);
    }

    // A soft lamp pool up-right — the warm interior light source. Layered
    // ellipses fading outward so it reads as spill, not a disc.
    const lamp = { x: CANVAS_WIDTH - 96, y: 96 };
    for (let i = 6; i >= 1; i -= 1) {
      const t = i / 6;
      g.fillStyle(mixHex(0x6f4529, 0xffcf7a, 1 - t * 0.7), 0.05 + (1 - t) * 0.05);
      g.fillEllipse(lamp.x, lamp.y, 300 * t, 240 * t);
    }

    // Deterministic wall grain so the plaster isn't a flat wash.
    const rng = mulberry32(fnv1a('violin:wall'));
    for (let i = 0; i < 220; i += 1) {
      const x = rng() * CANVAS_WIDTH;
      const y = rng() * CANVAS_HEIGHT;
      const warm = rng() > 0.5;
      g.fillStyle(warm ? 0x3a2c2e : 0x120d16, 0.05 + rng() * 0.06);
      g.fillRect(x, y, 1 + Math.round(rng()), 1 + Math.round(rng()));
    }

    this.drawWindow(g);
    this.drawStand(g);

    // Baked vignette in the corners so the panel edges settle into shadow.
    this.strokeVignette(g);
  }

  private drawWindow(g: Phaser.GameObjects.Graphics): void {
    const { x, y, w, h } = WINDOW;

    // Sill glow bleeding onto the wall around the frame.
    for (let i = 4; i >= 1; i -= 1) {
      g.fillStyle(0xffc98a, 0.03 + (4 - i) * 0.015);
      g.fillEllipse(x + w / 2, y + h * 0.6, w * (0.9 + i * 0.5), h * (0.7 + i * 0.28));
    }

    // Outer wooden frame.
    g.fillStyle(0x3a2718, 1);
    g.fillRoundedRect(x - 4, y - 4, w + 8, h + 8, 5);
    g.fillStyle(0x5a3d26, 1);
    g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 4);

    // Dusk sky inside the panes: deep indigo up top settling to the last gold of
    // evening near the horizon line, then a cooler ground band below.
    const skyTop = 0x241f3e;
    const skyMid = 0x4a3a55;
    const glow = 0xe8a15a;
    const gold = 0xffcf86;
    const ground = 0x2e2436;
    const horizon = y + h * 0.66;
    for (let i = 0; i < h; i += 2) {
      const yy = y + i;
      const t = i / h;
      let col: number;
      if (yy < horizon) {
        const tt = (yy - y) / (horizon - y);
        col = tt < 0.7 ? mixHex(skyTop, skyMid, tt / 0.7) : mixHex(skyMid, glow, (tt - 0.7) / 0.3);
      } else {
        const tt = (yy - horizon) / (y + h - horizon);
        col = mixHex(gold, ground, Math.min(1, tt * 1.4));
      }
      g.fillStyle(col, 1);
      g.fillRect(x, yy, w, 2);
      void t;
    }

    // The last gold sliver right on the horizon.
    g.fillStyle(0xffe6ad, 0.9);
    g.fillRect(x, horizon - 2, w, 3);
    g.fillStyle(0xffd089, 0.5);
    g.fillRect(x, horizon - 5, w, 3);

    // A couple of early stars up in the indigo (seeded).
    const rng = mulberry32(fnv1a('violin:stars'));
    for (let i = 0; i < 5; i += 1) {
      const sx = x + 6 + rng() * (w - 12);
      const sy = y + 8 + rng() * (h * 0.34);
      g.fillStyle(0xfff2d4, 0.5 + rng() * 0.4);
      g.fillRect(sx, sy, 1, 1);
    }

    // Muntins — the cross bars dividing the panes.
    g.fillStyle(0x4a3320, 1);
    g.fillRect(x + w / 2 - 2, y, 4, h);
    g.fillRect(x, y + h / 2 - 2, w, 4);
    g.fillStyle(0x6b4a2e, 0.8);
    g.fillRect(x + w / 2 - 2, y, 2, h);
    g.fillRect(x, y + h / 2 - 2, w, 2);
  }

  private drawStand(g: Phaser.GameObjects.Graphics): void {
    // A suggestion of a wooden music stand under the sheet: a tray ledge the
    // paper rests on, a central post, and splayed tripod legs fading into shadow.
    const cx = SHEET_CX;
    const dark = 0x2c1d12;
    const wood = 0x4a3120;
    const lit = 0x6b4a2e;

    // Tripod legs.
    g.lineStyle(6, dark, 1);
    g.lineBetween(cx, 292, cx - 40, 322);
    g.lineBetween(cx, 292, cx + 40, 322);
    g.lineBetween(cx, 292, cx, 326);
    g.lineStyle(2, wood, 0.9);
    g.lineBetween(cx, 292, cx - 40, 322);
    g.lineBetween(cx, 292, cx + 40, 322);
    g.lineBetween(cx, 292, cx, 326);

    // Central post.
    g.fillStyle(dark, 1);
    g.fillRect(cx - 5, 236, 10, 60);
    g.fillStyle(wood, 1);
    g.fillRect(cx - 4, 236, 6, 60);
    g.fillStyle(lit, 0.7);
    g.fillRect(cx - 4, 236, 2, 60);

    // Tray ledge that the sheet leans against.
    g.fillStyle(dark, 1);
    g.fillRoundedRect(cx - 70, 232, 140, 14, 4);
    g.fillStyle(wood, 1);
    g.fillRoundedRect(cx - 68, 231, 136, 9, 3);
    g.fillStyle(lit, 0.6);
    g.fillRect(cx - 66, 231, 132, 2);
  }

  private strokeVignette(g: Phaser.GameObjects.Graphics): void {
    const steps = 9;
    for (let i = 0; i < steps; i += 1) {
      const inset = i * 5;
      const a = 0.10 * (1 - i / steps);
      g.lineStyle(5, 0x0c0810, a);
      g.strokeRect(inset, inset, CANVAS_WIDTH - inset * 2, CANVAS_HEIGHT - inset * 2);
    }
  }

  // ==================================================================
  // Per-frame light pass — dim/warmth choreography + finale flood.
  // ==================================================================

  private drawRoomLight(): void {
    const g = this.roomLight;
    g.clear();

    const warmth = this.warmStage / (WARM_STAGES.length - 1);
    const st = this.modelState;
    const phrase = getPhrase(st);
    const echoWarm =
      st.phase === 'echo' && phrase ? st.echoIndex / phrase.notes.length : 0;

    // A cool veil drops over the room as the sheet becomes the focus (playback),
    // lifting while she echoes. The sheet is opaque and drawn above this, so the
    // veil only ever darkens the room around it — the page reads as lit.
    const veil = Math.max(0, 0.10 + this.sheetFocus * 0.24 - warmth * 0.05 - this.goldenPour * 0.4);
    g.fillStyle(0x0f0a14, veil);
    g.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Warm light gathering around the stand — the lamp pooling on the page,
    // richer with every phrase (warmth) and every correct echoed note (echoWarm).
    const pool = 0.05 + warmth * 0.16 + echoWarm * 0.14 + this.goldenPour * 0.2;
    for (let i = 5; i >= 1; i -= 1) {
      const t = i / 5;
      g.fillStyle(mixHex(0xffb85e, 0xfff0c4, 1 - t), pool * (0.5 + (1 - t) * 0.7) * 0.42);
      g.fillEllipse(SHEET_CX, SHEET_CY + 6, 460 * t, 250 * t);
    }

    // Finale: golden light floods from the window across the whole panel, in
    // layered additive beams that splay from the sill (echoing the room scene's
    // awakening — golden shafts + motes — without importing it).
    this.beamFx.clear();
    if (this.goldenPour > 0) {
      const p = this.goldenPour;
      const src = WINDOW_LIGHT;
      const beams = [
        { ang: 0.06, half: 26, len: 640, a: 0.05 },
        { ang: 0.24, half: 34, len: 660, a: 0.06 },
        { ang: 0.46, half: 30, len: 620, a: 0.05 },
      ];
      for (const b of beams) {
        const dx = Math.cos(b.ang);
        const dy = Math.sin(b.ang);
        const ex = src.x + dx * b.len;
        const ey = src.y + dy * b.len;
        // Perpendicular splay.
        const px = -dy;
        const py = dx;
        for (let layer = 0; layer < 3; layer += 1) {
          const spread = b.half * (1 + layer * 0.9);
          const col = layer === 0 ? 0xffecbe : layer === 1 ? 0xffd98a : 0xffd27a;
          this.beamFx.fillStyle(col, b.a * p * (1.2 - layer * 0.3));
          this.beamFx.fillPoints(
            [
              new Phaser.Geom.Point(src.x + px * 6, src.y + py * 6),
              new Phaser.Geom.Point(src.x - px * 6, src.y - py * 6),
              new Phaser.Geom.Point(ex - px * spread, ey - py * spread),
              new Phaser.Geom.Point(ex + px * spread, ey + py * spread),
            ],
            true,
          );
        }
      }
      // A broad golden wash over the whole panel at full pour.
      this.beamFx.fillStyle(0xffe6a6, 0.14 * p);
      this.beamFx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      // Bright bloom right at the window.
      this.beamFx.fillStyle(0xfff2cf, 0.28 * p);
      this.beamFx.fillEllipse(src.x, src.y, 120, 200);
    }
  }

  // ==================================================================
  // The sheet — tilted paper, staff ruling, note-heads, key letters.
  // ==================================================================

  private generatePaperTexture(): void {
    if (this.textures.exists('violin-paper')) {
      return;
    }
    const w = SHEET_WIDTH;
    const h = SHEET_HEIGHT;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // Warm paper with a soft top-lit gradient.
    g.fillStyle(0xf3ead3, 1);
    g.fillRoundedRect(0, 0, w, h, 12);
    for (let i = 0; i < h; i += 2) {
      const t = i / h;
      g.fillStyle(mixHex(0xfff6e2, 0xe4d3b0, t), 0.28 * (t * 0.7 + 0.15));
      g.fillRect(0, i, w, 2);
    }

    // Deterministic paper grain — speckle + a few faint fibre streaks.
    const rng = mulberry32(fnv1a('violin:paper'));
    for (let i = 0; i < 900; i += 1) {
      const x = rng() * w;
      const y = rng() * h;
      const dark = rng() > 0.45;
      g.fillStyle(dark ? 0xcbb891 : 0xfff8e6, 0.05 + rng() * 0.09);
      g.fillRect(x, y, 1, rng() > 0.85 ? 2 : 1);
    }

    // Inner edge shade — a printed page settles darker at its margins.
    for (let i = 0; i < 10; i += 1) {
      g.lineStyle(2, 0xbfa87e, 0.05 * (1 - i / 10));
      g.strokeRoundedRect(2 + i, 2 + i, w - 4 - i * 2, h - 4 - i * 2, 10);
    }
    // Warm rule at the very edge.
    g.lineStyle(2, 0x8a6a44, 0.7);
    g.strokeRoundedRect(1, 1, w - 2, h - 2, 12);

    g.generateTexture('violin-paper', w, h);
    g.destroy();
  }

  private generateMoteTexture(): void {
    if (this.textures.exists('violin-mote')) {
      return;
    }
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffe1a1, 0.35);
    g.fillCircle(8, 8, 7);
    g.fillStyle(0xfff2c8, 0.9);
    g.fillCircle(8, 8, 3);
    g.generateTexture('violin-mote', 16, 16);
    g.destroy();
  }

  private createSheet(): void {
    this.sheet = this.add.container(SHEET_CX, SHEET_CY).setDepth(10);
    this.sheet.setRotation(SHEET_TILT);

    // Soft drop shadow, offset down-right (paper local space).
    const shadow = this.add.graphics();
    for (let i = 3; i >= 1; i -= 1) {
      shadow.fillStyle(0x000000, 0.12);
      shadow.fillRoundedRect(
        -SHEET_WIDTH / 2 + 4 + i,
        -SHEET_HEIGHT / 2 + 8 + i,
        SHEET_WIDTH,
        SHEET_HEIGHT,
        12,
      );
    }
    this.sheet.add(shadow);

    const paper = this.add.image(0, 0, 'violin-paper').setOrigin(0.5);
    this.sheet.add(paper);

    // Static staff ruling + clef + a little heading, drawn once into the sheet.
    const ruling = this.add.graphics();
    this.drawStaffRuling(ruling);
    this.sheet.add(ruling);

    // Live note layer (redrawn each frame).
    this.staff = this.add.graphics();
    this.sheet.add(this.staff);
  }

  private staffLineLocalY(lineIndex: number): number {
    // lineIndex 0 = top line, 4 = bottom line.
    return STAFF_BOTTOM_LOCAL - (4 - lineIndex) * STAFF_GAP;
  }

  /** Paper-local Y for a diatonic step. Step 0 (E4) sits on the bottom line. */
  private stepToLocalY(step: number): number {
    return STAFF_BOTTOM_LOCAL - step * STAFF_STEP_PX;
  }

  private drawStaffRuling(g: Phaser.GameObjects.Graphics): void {
    // Five staff lines with generous margins.
    g.lineStyle(1.4, INK, 0.5);
    for (let i = 0; i < 5; i += 1) {
      const y = this.staffLineLocalY(i);
      g.lineBetween(STAFF_LEFT_LOCAL, y, STAFF_RIGHT_LOCAL, y);
    }

    // A treble-clef flourish: a spiral-ish stroke + vertical stem.
    g.lineStyle(3, INK, 0.85);
    const cx = CLEF_LOCAL_X;
    const midY = this.staffLineLocalY(2);
    g.strokeCircle(cx, midY + 3, 8);
    g.beginPath();
    g.arc(cx, midY - 6, 11, Phaser.Math.DegToRad(60), Phaser.Math.DegToRad(300), false);
    g.strokePath();
    g.lineBetween(cx + 8, this.staffLineLocalY(0) - 8, cx + 8, this.staffLineLocalY(4) + 10);

    // A small time-signature-ish marking and a soft tempo word in warm ink.
    const sigX = CLEF_LOCAL_X + 26;
    g.lineStyle(2.5, INK, 0.6);
    g.lineBetween(sigX, this.staffLineLocalY(0) + 2, sigX, this.staffLineLocalY(2) + 2);
    g.lineBetween(sigX, this.staffLineLocalY(2) + 6, sigX, this.staffLineLocalY(4));

    const tempo = this.add
      .text(0, -SHEET_HEIGHT / 2 + 18, 'dolce — for you', {
        color: '#8a6a3e',
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '12px',
        fontStyle: 'italic',
      })
      .setOrigin(0.5, 0.5)
      .setAlpha(0.7);
    this.sheet.add(tempo);
  }

  private currentNoteMarks(phrase: ViolinPhrase): NoteMark[] {
    const marks: NoteMark[] = [];
    const span = NOTE_RIGHT_LOCAL - NOTE_LEFT_LOCAL;
    const count = phrase.notes.length;
    for (let i = 0; i < count; i += 1) {
      const x = NOTE_LEFT_LOCAL + (span * (i + 0.5)) / count;
      const pitch = getPitch(phrase.notes[i].pitchId);
      const y = this.stepToLocalY(pitch ? pitch.staffStep : 0);
      marks.push({ x, y });
    }
    return marks;
  }

  private drawStaff(time: number): void {
    const g = this.staff;
    g.clear();

    const phrase = getPhrase(this.modelState);
    if (!phrase) {
      return;
    }
    const marks = this.currentNoteMarks(phrase);
    const lit = litNoteCount(this.modelState);
    const echoing = this.modelState.phase === 'echo';

    // Track newly lit notes → one-shot ember bloom that lingers and decays.
    if (lit < this.litShown) {
      this.emberLevels = [];
      this.litShown = 0;
    }
    for (let i = this.litShown; i < lit; i += 1) {
      this.emberLevels[i] = 1;
    }
    this.litShown = lit;

    marks.forEach((mark, index) => {
      const pitch = getPitch(phrase.notes[index].pitchId);
      const isLit = index < lit;
      const isExpected = echoing && index === this.modelState.echoIndex;

      // Ledger line for notes below the staff (D4, step -1).
      if (pitch && pitch.staffStep < 0) {
        g.lineStyle(1.4, INK, 0.55);
        g.lineBetween(mark.x - 11, mark.y, mark.x + 11, mark.y);
      }

      // Slight, deterministic hand-drawn jitter per note.
      const jr = mulberry32(fnv1a(`${phrase.id}:${index}`));
      const jx = (jr() - 0.5) * 1.2;
      const jy = (jr() - 0.5) * 1.2;
      const rx = 7.4 + (jr() - 0.5) * 0.8;
      const ry = 5.7 + (jr() - 0.5) * 0.6;
      const cx = mark.x + jx;
      const cy = mark.y + jy;

      const ember = this.emberLevels[index] ?? 0;

      if (isLit) {
        // Warm glow bloom + soft outer halo, richer with the fresh-ring pulse
        // and the lingering ember.
        const pulse = 0.5 + Math.sin(time / 230 + index) * 0.18;
        const bloom = 0.5 + ember * 0.5 + this.glowStrength * 0.2;
        g.fillStyle(NOTE_HALO, 0.1 * bloom);
        g.fillCircle(cx, cy, 20 + ember * 6);
        g.fillStyle(NOTE_GLOW, (0.22 + pulse * 0.14) * (0.7 + bloom * 0.5));
        g.fillCircle(cx, cy, 12);
        // The note-head itself.
        g.fillStyle(mixHex(NOTE_LIT, 0xffe6a6, ember * 0.4), 1);
        g.fillEllipse(cx, cy, rx * 2, ry * 2);
        g.lineStyle(1.6, 0xfff0c6, 0.9);
        g.strokeEllipse(cx, cy, rx * 2, ry * 2);
      } else {
        // Unlit ink note-head; the expected-next note breathes gently.
        const breathe = isExpected ? 0.75 + Math.sin(time / 260) * 0.25 : 0.55;
        g.fillStyle(INK, isExpected ? 0.7 : 0.5);
        g.fillEllipse(cx, cy, rx * 2, ry * 2);
        if (isExpected) {
          const ring = 12 + Math.sin(time / 200) * 2.4;
          g.lineStyle(2, mixHex(0xc98a2f, NOTE_GLOW, 0.5), 0.85 * breathe);
          g.strokeCircle(cx, cy, ring);
        }
      }

      // Stem — up-right from the note-head with a touch of jitter.
      const stemX = cx + rx - 0.6;
      g.lineStyle(1.8, isLit ? mixHex(NOTE_LIT, 0xffe6a6, 0.3) : INK, isLit ? 1 : 0.7);
      g.lineBetween(stemX, cy - 1, stemX + jx * 0.4, cy - 22 - jy);

      if (this.wrongFlash > 0 && isExpected) {
        g.lineStyle(2, 0xd06a4a, 0.7 * this.wrongFlash);
        g.strokeCircle(cx, cy, 13);
      }
    });

    this.updateNoteLabels(phrase, marks, lit, echoing);

    // A gentle waver wash on a wrong note: the whole page flushes softly warm-red
    // for a beat (the model has already flipped back to replay, so this is keyed
    // on the fading flash rather than the — now cleared — expected note).
    if (this.wrongFlash > 0) {
      g.fillStyle(0xc9603e, 0.16 * this.wrongFlash);
      g.fillRoundedRect(-SHEET_WIDTH / 2, -SHEET_HEIGHT / 2, SHEET_WIDTH, SHEET_HEIGHT, 12);
      g.lineStyle(3, 0xd06a4a, 0.5 * this.wrongFlash);
      g.strokeRoundedRect(-SHEET_WIDTH / 2, -SHEET_HEIGHT / 2, SHEET_WIDTH, SHEET_HEIGHT, 12);
    }

    // Fresh-ring glow tracing the page edge.
    if (this.glowStrength > 0) {
      g.lineStyle(3, 0xffedbe, 0.35 * this.glowStrength);
      g.strokeRoundedRect(-SHEET_WIDTH / 2, -SHEET_HEIGHT / 2, SHEET_WIDTH, SHEET_HEIGHT, 12);
    }
  }

  // A small pool of key-letter labels, one shown under each staff mark so the
  // player reads the key directly on the note. The longest phrase has six notes,
  // so six labels cover every phrase. They live inside the tilted sheet.
  private createNoteLabels(): void {
    const max = VIOLIN_PHRASES.reduce((n, phrase) => Math.max(n, phrase.notes.length), 0);
    this.noteKeyLabels = Array.from({ length: max }, () => {
      const label = this.add
        .text(0, 0, '', {
          align: 'center',
          color: '#7a5a2f',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: '700',
          fontSize: '13px',
        })
        .setOrigin(0.5)
        .setVisible(false);
      this.sheet.add(label);
      return label;
    });
  }

  private updateNoteLabels(
    phrase: ViolinPhrase,
    marks: NoteMark[],
    lit: number,
    echoing: boolean,
  ): void {
    this.noteKeyLabels.forEach((label, index) => {
      if (index >= marks.length) {
        label.setVisible(false);
        return;
      }
      const pitch = getPitch(phrase.notes[index].pitchId);
      const isExpected = echoing && index === this.modelState.echoIndex;
      const isLit = index < lit;
      label.setText((pitch?.key ?? '').toUpperCase());
      label.setPosition(marks[index].x, marks[index].y + 24);
      label.setColor(isExpected ? '#b7791f' : isLit ? '#9a6f2f' : '#a58a5f');
      label.setScale(isExpected ? 1.12 : 1);
      label.setVisible(true);
    });
  }

  // ==================================================================
  // HUD text + key legend strip.
  // ==================================================================

  private createHud(): void {
    this.titleText = this.add
      .text(CANVAS_WIDTH / 2, 26, '', {
        align: 'center',
        color: '#ffe6b0',
        fontFamily: 'Georgia, serif',
        fontSize: '21px',
        fontStyle: 'italic',
        stroke: '#160f18',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(50);

    this.helperText = this.add
      .text(CANVAS_WIDTH / 2, 306, '', {
        align: 'center',
        color: '#f0e2cf',
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        stroke: '#160f18',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(50);

    this.captionText = this.add
      .text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, '', {
        align: 'center',
        color: '#fff3d6',
        fontFamily: 'Georgia, serif',
        fontSize: '26px',
        fontStyle: 'italic',
        stroke: '#160f18',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(60);
  }

  // Six rounded key caps along the bottom; the expected key glows and any held
  // key depresses subtly. Caps are drawn each frame; letters/names are Text.
  private legendCapX(index: number): number {
    const capW = 46;
    const gap = 10;
    const total = VIOLIN_PITCHES.length * capW + (VIOLIN_PITCHES.length - 1) * gap;
    const start = CANVAS_WIDTH / 2 - total / 2;
    return start + index * (capW + gap) + capW / 2;
  }

  private createLegend(): void {
    this.legendGfx = this.add.graphics().setDepth(30);
    const capY = 332;
    this.legendLetters = [];
    this.legendNames = [];
    VIOLIN_PITCHES.forEach((pitch, index) => {
      const x = this.legendCapX(index);
      const letter = this.add
        .text(x, capY + 12, pitch.key, {
          align: 'center',
          color: '#f4e4c2',
          fontFamily: 'Georgia, serif',
          fontStyle: '700',
          fontSize: '16px',
        })
        .setOrigin(0.5)
        .setDepth(31);
      const name = this.add
        .text(x, capY + 27, pitch.name, {
          align: 'center',
          color: '#c9b28a',
          fontFamily: 'Georgia, serif',
          fontSize: '10px',
        })
        .setOrigin(0.5)
        .setDepth(31);
      this.legendLetters.push(letter);
      this.legendNames.push(name);
    });
  }

  private updateLegend(time: number): void {
    const g = this.legendGfx;
    g.clear();
    const capW = 46;
    const capH = 34;
    const capY = 332;
    const expected = expectedPitchId(this.modelState);
    const echoing = this.modelState.phase === 'echo';

    VIOLIN_PITCHES.forEach((pitch, index) => {
      const cx = this.legendCapX(index);
      const isExpected = echoing && expected === pitch.id;
      const held = this.noteKeys.get(pitch.key)?.isDown ?? false;
      const press = held ? 2 : 0; // depress offset
      const x = cx - capW / 2;
      const y = capY + press;

      // Cap shadow / socket.
      g.fillStyle(0x140d16, 0.7);
      g.fillRoundedRect(x, capY + 3, capW, capH, 7);

      // Cap face.
      const glow = isExpected ? 0.65 + Math.sin(time / 220) * 0.2 : 0;
      const faceTop = isExpected ? mixHex(0x6a4a24, 0xffd98a, glow) : 0x3c2f26;
      const faceBot = isExpected ? mixHex(0x4a3218, 0xcf9a44, glow) : 0x271f19;
      g.fillStyle(faceBot, 1);
      g.fillRoundedRect(x, y, capW, capH, 7);
      g.fillStyle(faceTop, 1);
      g.fillRoundedRect(x, y, capW, capH - 4, 7);
      // Bevel highlight.
      g.fillStyle(isExpected ? 0xfff0c6 : 0x6a584a, isExpected ? 0.5 : 0.35);
      g.fillRoundedRect(x + 3, y + 2, capW - 6, 4, 3);
      // Rim.
      g.lineStyle(1.5, isExpected ? 0xffe6a6 : 0x1c1512, isExpected ? 0.9 : 0.8);
      g.strokeRoundedRect(x, y, capW, capH, 7);

      if (isExpected) {
        g.fillStyle(0xffe6a6, 0.12 + glow * 0.1);
        g.fillCircle(cx, y + capH / 2, 30);
      }

      this.legendLetters[index]
        .setPosition(cx, y + 11)
        .setColor(isExpected ? '#fff4d6' : '#e6d2ac');
      this.legendNames[index].setPosition(cx, y + 26);
    });
  }

  private updateHud(): void {
    if (this.isFinalizing) {
      return;
    }

    const phase = this.modelState.phase;
    if (phase === 'playback' || phase === 'handoff') {
      // Handoff flows straight into the next listen, so it wears the same prompt
      // — the beat reads as the piece drawing breath, not a pause.
      this.titleText.setText('listen…');
      this.helperText.setText('The piece plays itself through. Esc to step away.');
    } else if (phase === 'echo') {
      this.titleText.setText('now you — play it back');
      this.helperText.setText('Echo the notes on A S D F G H. A wrong note just waits and plays again.');
    } else if (phase === 'finale') {
      this.titleText.setText('');
      this.helperText.setText('');
    }
  }

  private spawnFinaleMotes(): void {
    // Drifting light-motes rise across the panel as the room floods gold —
    // seeded so the field is stable across reloads (mirrors the room awakening).
    const rng = mulberry32(fnv1a('violin:finale-motes'));
    const count = 18;
    for (let i = 0; i < count; i += 1) {
      const x = rng() * CANVAS_WIDTH;
      const y = 60 + rng() * (CANVAS_HEIGHT - 80);
      const mote = this.add
        .image(x, y, 'violin-mote')
        .setDepth(45)
        .setAlpha(0)
        .setScale(0.4 + rng() * 0.9);
      const drift = 22 + rng() * 40;
      this.tweens.add({
        targets: mote,
        alpha: { from: 0, to: 0.4 + rng() * 0.3 },
        duration: 1300 + rng() * 1100,
        yoyo: true,
        hold: 400 + rng() * 800,
        repeat: -1,
        repeatDelay: rng() * 1500,
        delay: rng() * 2200,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: mote,
        y: y - drift,
        x: x + (rng() - 0.5) * drift,
        duration: 4600 + rng() * 3800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }
}
