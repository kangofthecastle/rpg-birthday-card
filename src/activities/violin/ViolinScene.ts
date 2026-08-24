import Phaser from 'phaser';
import { playSfx, playViolinNote } from '../../game/audio';
import { isImageUrl } from '../../game/assetProbe';
import { fnv1a, mulberry32 } from '../../game/rng';
import {
  VIOLIN_FINALE_PHRASES,
  VIOLIN_PHRASES,
  VIOLIN_PITCHES,
  getPitch,
  getPitchByKey,
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
import { createViolinModes, type ViolinModes } from './violinModes';

// Re-exported so existing importers of ViolinScene keep working.
export { createViolinModes, type ViolinModes };

export interface ViolinSceneCallbacks {
  readonly onComplete: () => void;
  readonly onCancel: () => void;
}

const DEFAULT_CALLBACKS: ViolinSceneCallbacks = {
  onComplete: () => undefined,
  onCancel: () => undefined,
};

const DEFAULT_MODES: ViolinModes = createViolinModes();

/** One freely-played note in the practice-mode scrolling graph. */
interface PracticeHit {
  readonly step: number;
  readonly t: number;
}

// The scene is authored in this 640x360 logical space (16:9); the whole world is
// rendered into a RENDER_SCALE-times larger backing buffer for crisp upscaling
// (see violinActivity's game config + the camera zoom in create()). Every layout
// constant below stays in this logical space — only the render is scaled.
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 360;

// Backing buffer is 2x the logical scene, so text is authored at RENDER_SCALE
// resolution to stay sharp under the matching camera zoom.
const RENDER_SCALE = 2;

// Optional drop-in backdrop art (a warm room / music-stand view). File-first:
// if present it is used, otherwise a rich procedural dusk room is drawn.
const BACKDROP_KEY = 'violin-room-backdrop';
const BACKDROP_URL = '/assets/activities/violin/room-backdrop.png';

// Optional drop-in treble-clef art. File-first: if present it replaces the
// hand-drawn vector clef flourish in the left margin, otherwise the procedural
// clef (drawVectorClef) is used. Authored to match the warm-ink / cream-paper
// look — see public/assets/activities/violin/README.md for the asset spec.
const CLEF_KEY = 'violin-treble-clef';
const CLEF_URL = '/assets/activities/violin/treble-clef.png';
// Paper-local placement for the clef glyph. It sits in the left margin, centred
// on the staff, sized to this target height (~120px ≈ the vector flourish's
// span, reaching a touch above the top line and below the bottom line). The
// image is scaled UNIFORMLY to this height so any source aspect (~1:2.8 for the
// incoming hand-inked art) keeps its true proportions — width follows.
const CLEF_DISPLAY_HEIGHT = 120;

// Authored flat accidental. The source is a white alpha mask so the live staff
// can tint it with the same ink/amber palette as each note's current state.
const FLAT_ACCIDENTAL_KEY = 'violin-flat-accidental';
const FLAT_ACCIDENTAL_URL = '/assets/activities/violin/flat-accidental.png';
const FLAT_ACCIDENTAL_DISPLAY_HEIGHT = 22;

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
const SHEET_TILT = 0; // Upright — the sheet reads straight on the stand.

const STAFF_GAP = 16;
const STAFF_STEP_PX = STAFF_GAP / 2;
// Staff lines in paper-local Y (centre = 0). Bottom line carries E4 (step 0).
const STAFF_BOTTOM_LOCAL = 34;
const STAFF_LEFT_LOCAL = -196;
const STAFF_RIGHT_LOCAL = 196;
const CLEF_LOCAL_X = -176;
const NOTE_LEFT_LOCAL = -150;
const NOTE_RIGHT_LOCAL = 198;

// ---------------------------------------------------------------------------
// Advanced/practice "sound graph" geometry (paper-local). The graph reuses the
// same parchment sheet as the staff, but drops the five staff lines, the clef
// and every note letter: pitch is read purely as HEIGHT on the page. Higher
// pitch sits higher; a faint time axis runs along the bottom. Steps span the
// selected passage's chromatic range A3(0)..C5(10).
const GRAPH_TOP_LOCAL = -52; // paper-local Y of the highest pitch (C5).
const GRAPH_BOTTOM_LOCAL = 30; // paper-local Y of the lowest pitch (A3).
const GRAPH_AXIS_LOCAL = 52; // the time axis, just below the lowest pitch.
const GRAPH_STEP_MIN = 0;
const GRAPH_STEP_MAX = 10;
// Practice scroll speed (paper-local px per ms) and how long a played note
// lingers before it scrolls off the left edge and fades out.
const PRACTICE_SCROLL_PX_PER_MS = 0.075;
const PRACTICE_TRAIL_MS =
  (NOTE_RIGHT_LOCAL - NOTE_LEFT_LOCAL + 24) / PRACTICE_SCROLL_PX_PER_MS;

// Window in the left margin — the dusk sky, and the source of the finale flood.
const WINDOW = { x: 14, y: 52, w: 66, h: 150 } as const;
const WINDOW_LIGHT = { x: WINDOW.x + WINDOW.w / 2, y: WINDOW.y + WINDOW.h * 0.62 };

// Warm base wall colours. The sixteen short echo phrases are projected across
// these five visual rungs so the room keeps warming through the whole passage.
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
  private readonly modes: ViolinModes;
  private modelState: ViolinState = createViolinState();

  // Mirror of the mode flags as the scene last saw them, so it can react to a
  // change (enter/exit practice, swap the visualization) exactly once.
  private prevPractice = false;
  private prevGraphView = false;
  // Freely-played notes for the practice-mode scrolling graph, timestamped on a
  // clamped clock so a stalled frame can't teleport them off the graph.
  private practiceHits: PracticeHit[] = [];
  private practiceClock = 0;
  // Gentle amber pulse when a forgiven slip is being recovered (mistakes-allowed).
  private recoverFlash = 0;

  private roomBase!: Phaser.GameObjects.Graphics; // baked once, warm dusk room
  private windowFallback?: Phaser.GameObjects.Graphics; // vector dusk window, hidden if backdrop art loads
  private standLegsFallback?: Phaser.GameObjects.Graphics; // vector tripod legs, hidden if backdrop art loads
  private roomLight!: Phaser.GameObjects.Graphics; // per-frame dim / warmth / vignette
  private beamFx!: Phaser.GameObjects.Graphics; // additive finale flood
  private sheet!: Phaser.GameObjects.Container; // tilted paper + staff + notes
  private staff!: Phaser.GameObjects.Graphics; // (child of sheet) live note/graph layer
  private flatAccidentalLayer!: Phaser.GameObjects.Container; // tintable authored flat glyphs
  private flatAccidentalImages: Phaser.GameObjects.Image[] = [];
  private staffRuling!: Phaser.GameObjects.Graphics; // static 5-line ruling + bars (staff view only)
  private clefFallback?: Phaser.GameObjects.Graphics; // vector clef, hidden if art loads
  private clefArt?: Phaser.GameObjects.Image; // drop-in clef image, when present
  private legendGfx!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private helperText!: Phaser.GameObjects.Text;
  private legendLetters: Phaser.GameObjects.Text[] = [];
  private legendNames: Phaser.GameObjects.Text[] = [];

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

  constructor(
    callbacks: ViolinSceneCallbacks = DEFAULT_CALLBACKS,
    modes: ViolinModes = DEFAULT_MODES,
  ) {
    super('ViolinScene');
    this.callbacks = callbacks;
    this.modes = modes;
  }

  preload(): void {
    this.load.image(FLAT_ACCIDENTAL_KEY, FLAT_ACCIDENTAL_URL);
    // The optional drop-in backdrop art is probed + loaded in create() via a
    // content-type check, so a missing file never logs a red loader error.
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#161019');

    // The game buffer is RENDER_SCALE times the logical scene. Zoom the camera to
    // match and re-centre on the logical world's centre so the full 640x360 scene
    // fills the sharper buffer — every per-frame Graphics pass then redraws at 2x.
    this.cameras.main.setZoom(RENDER_SCALE);
    this.cameras.main.centerOn(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

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

    // The painted backdrop has its own window + curtain in the left margin, so
    // the vector fallback window would only ghost through as a second frame.
    // Drop it entirely. (The finale light still floods from WINDOW_LIGHT, which
    // now reads as pouring from the painted window.)
    this.windowFallback?.setVisible(false);

    // The painted backdrop already depicts the stand's legs/tripod, so the
    // vector tripod would only ghost through the 0.6-alpha art as a doubled,
    // misaligned set of legs. Drop it too (same treatment as windowFallback).
    this.standLegsFallback?.setVisible(false);
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

    // React to any mode/setting change the DOM cluster made since last frame.
    this.syncModes();

    // Drive the model from real elapsed wall-clock time, not Phaser's smoothed
    // per-frame delta — so playback tempo is right even when the render loop is
    // running slow (e.g. a heavy scene drawing behind the modal). Clamped so a
    // resumed background tab can't jump the model forward.
    const modelDelta = Math.min(MAX_MODEL_STEP_MS, this.game.loop.rawDelta);
    // Monotonic clamped clock for the practice scroll (same guard as the model).
    this.practiceClock += modelDelta;

    const practice = this.modes.practice;
    const graphView = this.modes.advanced || practice;

    if (practice) {
      // Free play: no song, no scoring, no progression — just sound + draw the
      // keys as they are pressed. The model is frozen.
      this.handlePracticeInput();
    } else if (!this.isFinalizing) {
      this.handleKeyPresses();
      const before = this.modelState;
      const after = advanceViolin(before, modelDelta);
      this.modelState = after;
      this.reactToTransitions(before, after);
    }

    // Ease transient effects.
    this.glowStrength = Math.max(0, this.glowStrength - modelDelta / 320);
    this.wrongFlash = Math.max(0, this.wrongFlash - modelDelta / 260);
    this.recoverFlash = Math.max(0, this.recoverFlash - modelDelta / 300);
    for (let i = 0; i < this.emberLevels.length; i += 1) {
      this.emberLevels[i] = Math.max(0, this.emberLevels[i] - modelDelta / 1100);
    }
    if (this.finaleStarted && !practice) {
      this.goldenPour = Math.min(1, this.goldenPour + modelDelta / 2400);
    }
    // Ease the room's focus toward the current phase's target. Practice keeps the
    // page bright and centred (it IS the whole activity there).
    const focusTarget = practice
      ? 1
      : this.isFinalizing
        ? 0
        : this.modelState.phase === 'echo'
          ? 0.4
          : this.modelState.phase === 'finale'
            ? 0
            : 1;
    this.sheetFocus += (focusTarget - this.sheetFocus) * Math.min(1, modelDelta / 240);

    this.drawRoomLight();
    this.updateHud();
    if (graphView) {
      this.drawGraph(time);
    } else {
      this.drawStaff(time);
    }
    this.updateLegend(time);
    this.updateObservability();
  }

  // ------------------------------------------------------------------
  // Mode cluster reactions (advanced graph / practice / mistakes-allowed)
  // ------------------------------------------------------------------

  private syncModes(): void {
    const practice = this.modes.practice;
    if (practice !== this.prevPractice) {
      // Entering OR leaving practice restarts the song from the top — the
      // simplest sensible reset (per spec).
      this.resetSong();
      this.practiceHits = [];
      this.prevPractice = practice;
    }
    const graphView = this.modes.advanced || practice;
    if (graphView !== this.prevGraphView) {
      this.applyViewMode(graphView);
      this.prevGraphView = graphView;
    }
  }

  // Re-initialise the song + all transient choreography to a fresh start. Used
  // when toggling practice on/off. Leaves finalize/completion latches alone.
  private resetSong(): void {
    this.modelState = createViolinState();
    this.prevLitCount = 0;
    this.litShown = 0;
    this.emberLevels = [];
    this.warmStage = 0;
    this.glowStrength = 0;
    this.wrongFlash = 0;
    this.recoverFlash = 0;
    this.goldenPour = 0;
    this.finaleStarted = false;
    this.sheetFocus = 1;
  }

  // Swap the sheet between the notation staff and the pitch-over-time graph.
  // The graph drops the ruled lines, the clef and every note letter — pitch is
  // read as height. The live layer (this.staff) is redrawn per-frame either way.
  private applyViewMode(graph: boolean): void {
    this.staffRuling?.setVisible(!graph);
    this.flatAccidentalLayer?.setVisible(!graph);
    this.clefArt?.setVisible(!graph);
    this.clefFallback?.setVisible(!graph && !this.clefArt);
    if (graph) {
      this.noteKeyLabels.forEach((label) => label.setVisible(false));
    }
  }

  private graphY(step: number): number {
    const t = (step - GRAPH_STEP_MIN) / (GRAPH_STEP_MAX - GRAPH_STEP_MIN);
    return GRAPH_BOTTOM_LOCAL + t * (GRAPH_TOP_LOCAL - GRAPH_BOTTOM_LOCAL);
  }

  private handlePracticeInput(): void {
    if (!this.input.keyboard) {
      return;
    }
    for (const [keyName, key] of this.noteKeys) {
      if (Phaser.Input.Keyboard.JustDown(key)) {
        const pitch = getPitchByKey(keyName);
        if (pitch) {
          playViolinNote(pitch.frequency, 640);
          this.glowStrength = 1;
          // Timestamp on the clamped practice clock so the scroll math matches.
          this.practiceHits.push({ step: pitch.graphStep, t: this.practiceClock });
          if (this.practiceHits.length > 240) {
            this.practiceHits.shift();
          }
        }
      }
    }
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
        const keyCode =
          Phaser.Input.Keyboard.KeyCodes[
            pitch.inputCode as keyof typeof Phaser.Input.Keyboard.KeyCodes
          ];
        const key = keyboard.addKey(keyCode, false);
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
    const after = pressViolinKey(before, keyName, this.modes.mistakesAllowed);
    this.modelState = after;

    if (after.lastResult === 'ring') {
      const phrase = getPhrase(before);
      const note = phrase?.notes[echoedIndex];
      const pitch = note ? getPitch(note.pitchId) : undefined;
      if (pitch && note) {
        playViolinNote(pitch.frequency, note.durationMs, { connected: echoedIndex > 0 });
      }
      this.glowStrength = 1;
    } else if (after.lastResult === 'waver') {
      playSfx('sfx-violin-waver');
      // A forgiven slip (mistakes-allowed) keeps the phrase — a gentle amber
      // pulse and a wait for the right note. A real miss flushes the page red.
      if (after.recovering && after.phase === 'echo') {
        this.recoverFlash = 1;
      } else {
        this.wrongFlash = 1;
      }
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
              playViolinNote(pitch.frequency, phrase.notes[i].durationMs, { connected: i > 0 });
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
      const passageProgress = after.phraseIndex / Math.max(1, VIOLIN_PHRASES.length - 1);
      this.warmStage = Math.round(passageProgress * (WARM_STAGES.length - 1));
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

    // The opening she just played blooms into the complete passage as one
    // continuous line. Every note is scheduled on the finale clock; the model
    // (driven in update) pages the staff and lights each mark to match. The
    // richer swell blooms underneath — retriggered at phrase boundaries so the
    // warm layer carries the entire replay, never thinning out.
    const timeline = finaleTimeline();
    playSfx('sfx-violin-swell');

    let lastSwellAt = 0;
    for (const note of timeline) {
      if (note.noteIndex === 0 && note.startMs - lastSwellAt >= 4000) {
        // The echo phrases are intentionally short; refresh the bed roughly
        // once per swell instead of stacking a new layer at all 16 boundaries.
        lastSwellAt = note.startMs;
        this.time.delayedCall(note.startMs, () => playSfx('sfx-violin-swell'));
      }
    }

    for (const [timelineIndex, note] of timeline.entries()) {
      const pitch = getPitch(note.pitchId);
      if (!pitch) {
        continue;
      }
      const frequency = pitch.frequency;
      const durationMs = note.durationMs;
      this.time.delayedCall(note.startMs, () => {
        playViolinNote(frequency, durationMs + 160, { connected: timelineIndex > 0 });
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

    this.completeActivity();
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

    // The vector dusk window belongs to the no-art fallback ambience. It lives
    // on its own layer (not baked into roomBase) so that when the painted
    // room-backdrop loads — which carries its own window + curtain in this same
    // left margin — this one is hidden (placeBackdropImage) rather than bleeding
    // through the 0.6-alpha backdrop as a ghosted, doubled frame. Sits above the
    // wall (-5) but below the backdrop (-3) for the fallback case.
    this.windowFallback?.destroy();
    this.windowFallback = this.add.graphics().setDepth(-4);
    this.drawWindow(this.windowFallback);

    this.drawStand(g);

    // The tripod legs are likewise fallback-only ambience: the painted
    // room-backdrop draws its own stand legs, so these vector legs live on their
    // own layer (hidden in placeBackdropImage) rather than baked into roomBase,
    // exactly like windowFallback. Sits above the wall (-5), below the backdrop.
    this.standLegsFallback?.destroy();
    this.standLegsFallback = this.add.graphics().setDepth(-4);
    this.drawStandLegs(this.standLegsFallback);

    // Baked vignette in the corners so the panel edges settle into shadow.
    this.strokeVignette(g);
  }

  private drawWindow(g: Phaser.GameObjects.Graphics): void {
    const { x, y, w, h } = WINDOW;

    // (No painted sill-glow halo here: the drop-in backdrop renders at 0.6 alpha
    // OVER this baked room, so any bright baked shape beneath it bleeds through as
    // a flat translucent oval — a "white disc" washing over the window. The window
    // reads as lit from its own sky gradient + gold horizon below, and from the
    // backdrop art's own glow, with no stamped ellipse.)

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
    // A suggestion of a wooden music stand under the sheet: only the tray ledge
    // the paper rests on. The painted room backdrop supplies the stand below it;
    // drawing another central post here left a doubled pole over that art.
    const cx = SHEET_CX;
    const dark = 0x2c1d12;
    const wood = 0x4a3120;
    const lit = 0x6b4a2e;

    // Tray ledge that the sheet leans against.
    g.fillStyle(dark, 1);
    g.fillRoundedRect(cx - 70, 232, 140, 14, 4);
    g.fillStyle(wood, 1);
    g.fillRoundedRect(cx - 68, 231, 136, 9, 3);
    g.fillStyle(lit, 0.6);
    g.fillRect(cx - 66, 231, 132, 2);
  }

  // The splayed tripod legs fading into shadow beneath the tray. Kept on their
  // own fallback layer so the drop-in backdrop art (which paints its own legs)
  // hides them, avoiding a doubled, ghosted tripod through the 0.6-alpha art.
  private drawStandLegs(g: Phaser.GameObjects.Graphics): void {
    const cx = SHEET_CX;
    const dark = 0x2c1d12;
    const wood = 0x4a3120;

    g.lineStyle(6, dark, 1);
    g.lineBetween(cx, 292, cx - 40, 322);
    g.lineBetween(cx, 292, cx + 40, 322);
    g.lineBetween(cx, 292, cx, 326);
    g.lineStyle(2, wood, 0.9);
    g.lineBetween(cx, 292, cx - 40, 322);
    g.lineBetween(cx, 292, cx + 40, 322);
    g.lineBetween(cx, 292, cx, 326);
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
      // A soft bloom at the window source. Built as layered low-alpha ellipses
      // (additive) so it falls off smoothly like a radial gradient — never the
      // flat, hard-edged white disc a single high-alpha fillEllipse stamps over
      // the backdrop art (that stamped oval was the "white oval" regression).
      for (let i = 5; i >= 1; i -= 1) {
        const t = i / 5;
        this.beamFx.fillStyle(0xfff2cf, 0.05 * p * (1.1 - t * 0.6));
        this.beamFx.fillEllipse(src.x, src.y, 150 * t, 230 * t);
      }
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

    // Static staff ruling + time-signature + heading, drawn once into the sheet.
    // Hidden in the graph (advanced/practice) view — pitch is read as height,
    // not from ruled lines.
    const ruling = this.add.graphics();
    this.drawStaffRuling(ruling);
    this.sheet.add(ruling);
    this.staffRuling = ruling;

    // The treble clef lives in its own layer so a drop-in art asset can replace
    // it. Draw the vector fallback now; maybeLoadClef swaps in the PNG if present.
    const clef = this.add.graphics();
    this.drawVectorClef(clef);
    this.sheet.add(clef);
    this.clefFallback = clef;
    void this.maybeLoadClef();

    // Authored accidentals sit immediately under the live Graphics layer so
    // note glows still bloom over them as the phrase plays.
    this.flatAccidentalLayer = this.add.container(0, 0);
    this.sheet.add(this.flatAccidentalLayer);

    // Live note layer (redrawn each frame).
    this.staff = this.add.graphics();
    this.sheet.add(this.staff);
  }

  // The treble clef is optional drop-in art. Probe with a content-type check
  // first (mirrors maybeLoadBackdrop) so a missing PNG stays silent, then load
  // it, hide the vector fallback and drop the image into the clef's margin slot.
  private async maybeLoadClef(): Promise<void> {
    if (this.textures.exists(CLEF_KEY)) {
      this.placeClefImage();
      return;
    }
    if (!(await isImageUrl(CLEF_URL))) {
      return;
    }
    if (!this.scene.isActive()) {
      return;
    }
    this.load.image(CLEF_KEY, CLEF_URL);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (this.scene.isActive() && this.textures.exists(CLEF_KEY)) {
        this.placeClefImage();
      }
    });
    this.load.start();
  }

  private placeClefImage(): void {
    this.clefFallback?.setVisible(false);
    // Same margin slot + vertical span as the vector clef: centred on the staff,
    // reaching a touch above the top line and below the bottom line. Scale
    // uniformly to the target height so the art keeps its own aspect ratio.
    const midY = this.staffLineLocalY(2);
    const clef = this.add.image(CLEF_LOCAL_X + 2, midY + 6, CLEF_KEY).setOrigin(0.5);
    if (clef.height > 0) {
      clef.setScale(CLEF_DISPLAY_HEIGHT / clef.height);
    }
    // The graph view has no clef; keep it hidden if we swapped in while there.
    clef.setVisible(!(this.modes.advanced || this.modes.practice));
    this.sheet.add(clef);
    this.clefArt = clef;
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

    // A light opening bar frames the left edge. The right barline is drawn on
    // the live layer because it is normally a single bar and becomes the
    // thin+thick final bar only on the full replay's actual last page.
    const barTop = this.staffLineLocalY(0);
    const barBottom = this.staffLineLocalY(4);
    g.lineStyle(1.6, INK, 0.55);
    g.lineBetween(STAFF_LEFT_LOCAL, barTop, STAFF_LEFT_LOCAL, barBottom);
  }

  private drawRightBarline(g: Phaser.GameObjects.Graphics): void {
    const barTop = this.staffLineLocalY(0);
    const barBottom = this.staffLineLocalY(4);
    const isActualFinalPage =
      (this.modelState.phase === 'finale' || this.modelState.phase === 'complete') &&
      this.modelState.phraseIndex === VIOLIN_FINALE_PHRASES.length - 1;

    if (isActualFinalPage) {
      g.lineStyle(1.6, INK, 0.55);
      g.lineBetween(STAFF_RIGHT_LOCAL - 6, barTop, STAFF_RIGHT_LOCAL - 6, barBottom);
      g.lineStyle(3, INK, 0.7);
      g.lineBetween(STAFF_RIGHT_LOCAL - 1.5, barTop, STAFF_RIGHT_LOCAL - 1.5, barBottom);
      return;
    }

    g.lineStyle(1.6, INK, 0.55);
    g.lineBetween(STAFF_RIGHT_LOCAL - 1.5, barTop, STAFF_RIGHT_LOCAL - 1.5, barBottom);
  }

  // Hand-drawn treble-clef flourish (a spiral-ish stroke + vertical stem), the
  // fallback used when no treble-clef.png drop-in art is present. Authored to
  // the same margin slot the image occupies (CLEF_LOCAL_X, centred on the staff).
  private drawVectorClef(g: Phaser.GameObjects.Graphics): void {
    g.lineStyle(3, INK, 0.85);
    const cx = CLEF_LOCAL_X;
    const midY = this.staffLineLocalY(2);
    g.strokeCircle(cx, midY + 3, 8);
    g.beginPath();
    g.arc(cx, midY - 6, 11, Phaser.Math.DegToRad(60), Phaser.Math.DegToRad(300), false);
    g.strokePath();
    g.lineBetween(cx + 8, this.staffLineLocalY(0) - 8, cx + 8, this.staffLineLocalY(4) + 10);
  }

  /** Compact hand-inked sharp sign for a chromatic pitch in the supplied
   * passage. Kept in Graphics with the noteheads so it lights and fades as one
   * mark instead of introducing a separately managed text object per note. */
  private drawSharpAccidental(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    isLit: boolean,
  ): void {
    const color = isLit ? mixHex(NOTE_LIT, 0xffe6a6, 0.3) : INK;
    g.lineStyle(1.35, color, isLit ? 0.95 : 0.65);
    g.lineBetween(x - 2.5, y - 8, x - 2.5, y + 8);
    g.lineBetween(x + 2.5, y - 9, x + 2.5, y + 7);
    g.lineBetween(x - 6, y - 2, x + 6, y - 4);
    g.lineBetween(x - 6, y + 4, x + 6, y + 2);
  }

  /** Authored flat sign pooled as tintable images so staff redraws stay cheap. */
  private drawFlatAccidental(
    x: number,
    y: number,
    isLit: boolean,
    imageIndex: number,
  ): void {
    const color = isLit ? mixHex(NOTE_LIT, 0xffe6a6, 0.3) : INK;
    let image = this.flatAccidentalImages[imageIndex];
    if (!image) {
      image = this.add
        .image(0, 0, FLAT_ACCIDENTAL_KEY)
        // The note centre sits roughly two-thirds down a conventional flat:
        // its stem reaches farther above the note than its bowl falls below.
        .setOrigin(0.5, 0.66)
        .setScale(FLAT_ACCIDENTAL_DISPLAY_HEIGHT / 256);
      this.flatAccidentalLayer.add(image);
      this.flatAccidentalImages.push(image);
    }
    image
      .setPosition(x, y)
      .setTint(color)
      .setAlpha(isLit ? 0.95 : 0.65)
      .setVisible(true);
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
    this.flatAccidentalImages.forEach((image) => image.setVisible(false));

    const phrase = getPhrase(this.modelState);
    if (!phrase) {
      return;
    }
    const marks = this.currentNoteMarks(phrase);
    const lit = litNoteCount(this.modelState);
    const echoing = this.modelState.phase === 'echo';

    this.drawRightBarline(g);

    // Track newly lit notes → one-shot ember bloom that lingers and decays.
    if (lit < this.litShown) {
      this.emberLevels = [];
      this.litShown = 0;
    }
    for (let i = this.litShown; i < lit; i += 1) {
      this.emberLevels[i] = 1;
    }
    this.litShown = lit;

    let flatAccidentalIndex = 0;
    marks.forEach((mark, index) => {
      const pitch = getPitch(phrase.notes[index].pitchId);
      const isLit = index < lit;
      const isExpected = echoing && index === this.modelState.echoIndex;

      // Ledger lines below the treble staff: C4 (step -2), then A3 (-4).
      // Notes in the intervening spaces still retain the ledger above them.
      if (pitch && pitch.staffStep <= -2) {
        g.lineStyle(1.4, INK, 0.55);
        for (let ledgerStep = -2; ledgerStep >= pitch.staffStep; ledgerStep -= 2) {
          const ledgerY = this.stepToLocalY(ledgerStep);
          g.lineBetween(mark.x - 11, ledgerY, mark.x + 11, ledgerY);
        }
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

      if (pitch?.accidental === 'sharp') {
        this.drawSharpAccidental(g, cx - 14, cy, isLit);
      } else if (pitch?.accidental === 'flat') {
        this.drawFlatAccidental(cx - 14, cy, isLit, flatAccidentalIndex);
        flatAccidentalIndex += 1;
      }

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

    this.drawSheetOverlays(g);
  }

  // Shared page-edge feedback washes, drawn on top of either the staff or the
  // graph: a soft warm-red flush on a real miss, a gentler amber pulse while a
  // forgiven slip waits to be recovered, and the fresh-ring glow on a landed note.
  private drawSheetOverlays(g: Phaser.GameObjects.Graphics): void {
    const l = -SHEET_WIDTH / 2;
    const t = -SHEET_HEIGHT / 2;

    if (this.wrongFlash > 0) {
      g.fillStyle(0xc9603e, 0.16 * this.wrongFlash);
      g.fillRoundedRect(l, t, SHEET_WIDTH, SHEET_HEIGHT, 12);
      g.lineStyle(3, 0xd06a4a, 0.5 * this.wrongFlash);
      g.strokeRoundedRect(l, t, SHEET_WIDTH, SHEET_HEIGHT, 12);
    }

    if (this.recoverFlash > 0) {
      g.fillStyle(0xe0a94a, 0.08 * this.recoverFlash);
      g.fillRoundedRect(l, t, SHEET_WIDTH, SHEET_HEIGHT, 12);
      g.lineStyle(2.5, 0xdca24a, 0.45 * this.recoverFlash);
      g.strokeRoundedRect(l, t, SHEET_WIDTH, SHEET_HEIGHT, 12);
    }

    if (this.glowStrength > 0) {
      g.lineStyle(3, 0xffedbe, 0.35 * this.glowStrength);
      g.strokeRoundedRect(l, t, SHEET_WIDTH, SHEET_HEIGHT, 12);
    }
  }

  // ==================================================================
  // The "sound graph" — advanced + practice views. Pitch is read as HEIGHT on
  // the parchment (higher note = higher mark); a faint time axis runs along the
  // bottom. No staff lines, no clef, no note letters — that IS the challenge.
  // ==================================================================

  private drawGraph(time: number): void {
    const g = this.staff;
    g.clear();
    if (this.modes.practice) {
      this.drawPracticeGraph(g);
    } else {
      this.drawSongGraph(g, time);
    }
    this.drawSheetOverlays(g);
  }

  private diamondPoints(x: number, y: number, r: number): Phaser.Geom.Point[] {
    return [
      new Phaser.Geom.Point(x, y - r),
      new Phaser.Geom.Point(x + r, y),
      new Phaser.Geom.Point(x, y + r),
      new Phaser.Geom.Point(x - r, y),
    ];
  }

  private fillDiamond(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    g.fillPoints(this.diamondPoints(x, y, r), true);
  }

  // A faint time axis + end caps, shared by both graph views.
  private drawGraphAxis(g: Phaser.GameObjects.Graphics): void {
    g.lineStyle(1.4, INK, 0.28);
    g.lineBetween(
      NOTE_LEFT_LOCAL - 10,
      GRAPH_AXIS_LOCAL,
      NOTE_RIGHT_LOCAL + 10,
      GRAPH_AXIS_LOCAL,
    );
    g.lineStyle(1.2, INK, 0.22);
    g.lineBetween(NOTE_LEFT_LOCAL - 10, GRAPH_AXIS_LOCAL - 4, NOTE_LEFT_LOCAL - 10, GRAPH_AXIS_LOCAL + 4);
    g.lineBetween(NOTE_RIGHT_LOCAL + 10, GRAPH_AXIS_LOCAL - 4, NOTE_RIGHT_LOCAL + 10, GRAPH_AXIS_LOCAL + 4);
  }

  private drawGraphMark(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    time: number,
    seed: number,
    isLit: boolean,
    isExpected: boolean,
    recovering: boolean,
  ): void {
    if (isLit) {
      const pulse = 0.5 + Math.sin(time / 230 + seed) * 0.18;
      g.fillStyle(NOTE_HALO, 0.12);
      g.fillCircle(x, y, 16);
      g.fillStyle(NOTE_GLOW, 0.22 + pulse * 0.14);
      g.fillCircle(x, y, 9);
      g.fillStyle(NOTE_LIT, 1);
      this.fillDiamond(g, x, y, 7);
      g.lineStyle(1.4, 0xfff0c6, 0.9);
      g.strokePoints(this.diamondPoints(x, y, 7), true, true);
      return;
    }

    const col = isExpected ? mixHex(0xc98a2f, NOTE_GLOW, 0.4) : INK;
    g.fillStyle(col, isExpected ? 0.85 : 0.5);
    this.fillDiamond(g, x, y, 6);
    if (isExpected) {
      const ring = 11 + Math.sin(time / 200) * 2.4;
      const breathe = 0.75 + Math.sin(time / 260) * 0.25;
      const ringCol = recovering ? 0xe0a94a : mixHex(0xc98a2f, NOTE_GLOW, 0.5);
      g.lineStyle(2, ringCol, 0.85 * breathe);
      g.strokeCircle(x, y, ring);
    }
  }

  private drawSongGraph(g: Phaser.GameObjects.Graphics, time: number): void {
    const phrase = getPhrase(this.modelState);
    if (!phrase) {
      return;
    }
    const count = phrase.notes.length;
    const span = NOTE_RIGHT_LOCAL - NOTE_LEFT_LOCAL;
    const lit = litNoteCount(this.modelState);

    const pts = phrase.notes.map((note, i) => {
      const pitch = getPitch(note.pitchId);
      const x = NOTE_LEFT_LOCAL + (span * (i + 0.5)) / count;
      return { x, y: this.graphY(pitch ? pitch.graphStep : GRAPH_STEP_MIN) };
    });

    this.drawGraphAxis(g);

    // Advanced mode is performed, not previewed: only the notes that have
    // actually sounded during playback or been played during echo exist yet.
    const visiblePts = pts.slice(0, lit);

    // Drop lines appear with their points instead of revealing the phrase ahead.
    visiblePts.forEach((p) => {
      g.lineStyle(1, INK, 0.12);
      g.lineBetween(p.x, GRAPH_AXIS_LOCAL, p.x, p.y + 4);
    });

    // The contour grows one segment at a time as the music is heard or echoed.
    for (let i = 0; i < visiblePts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      g.lineStyle(2.4, mixHex(NOTE_LIT, 0xffe6a6, 0.3), 0.9);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    visiblePts.forEach((p, i) => {
      this.drawGraphMark(g, p.x, p.y, time, i, true, false, false);
    });
  }

  private drawPracticeGraph(g: Phaser.GameObjects.Graphics): void {
    // Scroll is driven by the CLAMPED practice clock, not raw loop time, so a
    // stalled / backgrounded frame can't teleport the played notes off the left
    // edge (mirrors the model's MAX_MODEL_STEP_MS guard).
    const now = this.practiceClock;
    // Age off notes that have scrolled past the left edge.
    const cutoff = now - PRACTICE_TRAIL_MS;
    while (this.practiceHits.length > 0 && this.practiceHits[0].t < cutoff) {
      this.practiceHits.shift();
    }

    this.drawGraphAxis(g);

    const nowX = NOTE_RIGHT_LOCAL;
    // The "now" playhead the freshly played notes emerge from, at the right edge.
    g.lineStyle(1.4, mixHex(INK, NOTE_GLOW, 0.4), 0.5);
    g.lineBetween(nowX, GRAPH_TOP_LOCAL - 6, nowX, GRAPH_AXIS_LOCAL);

    const pts = this.practiceHits.map((hit) => ({
      x: nowX - (now - hit.t) * PRACTICE_SCROLL_PX_PER_MS,
      y: this.graphY(hit.step),
      age: now - hit.t,
    }));

    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const alpha = Math.max(0, 1 - b.age / PRACTICE_TRAIL_MS);
      g.lineStyle(2.2, mixHex(NOTE_LIT, 0xffe6a6, 0.25), 0.7 * alpha);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    pts.forEach((p) => {
      const alpha = Math.max(0, 1 - p.age / PRACTICE_TRAIL_MS);
      const fresh = p.age < 180;
      g.fillStyle(NOTE_HALO, 0.12 * alpha);
      g.fillCircle(p.x, p.y, fresh ? 15 : 12);
      g.fillStyle(NOTE_GLOW, 0.4 * alpha);
      g.fillCircle(p.x, p.y, fresh ? 6 : 4.5);
      g.fillStyle(NOTE_LIT, alpha);
      this.fillDiamond(g, p.x, p.y, fresh ? 6.5 : 5);
    });
  }

  // A small pool of key-letter labels, one shown under each staff mark so the
  // player reads the key directly on the note. The longest phrase has six notes,
  // so six labels cover every phrase. They live inside the tilted sheet.
  private createNoteLabels(): void {
    const max = [...VIOLIN_PHRASES, ...VIOLIN_FINALE_PHRASES].reduce(
      (n, phrase) => Math.max(n, phrase.notes.length),
      0,
    );
    this.noteKeyLabels = Array.from({ length: max }, () => {
      const label = this.add
        .text(0, 0, '', {
          align: 'center',
          color: '#7a5a2f',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: '700',
          fontSize: '13px',
          resolution: RENDER_SCALE,
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
        resolution: RENDER_SCALE,
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
        resolution: RENDER_SCALE,
        stroke: '#160f18',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(50);

  }

  // Rounded key caps along the bottom; the expected key glows and any held
  // key depresses subtly. Caps are drawn each frame; letters/names are Text.
  // LEGEND_CAP_Y keeps the WHOLE row inside the 360-logical canvas: socket
  // shadow bottom = CAP_Y + 3 + capH(34) = 357 < 360. At the old 332 it ran to
  // 369, so the key bottoms and sub-labels were clipped at the canvas edge.
  // The cap top (320) stays clear of the helper line centred at y=306.
  private static readonly LEGEND_CAP_Y = 320;

  private legendCapWidth(): number {
    return VIOLIN_PITCHES.length > 8 ? 38 : 46;
  }

  private legendCapGap(): number {
    return VIOLIN_PITCHES.length > 8 ? 6 : 10;
  }

  private legendCapX(index: number): number {
    const capW = this.legendCapWidth();
    const gap = this.legendCapGap();
    const total = VIOLIN_PITCHES.length * capW + (VIOLIN_PITCHES.length - 1) * gap;
    const start = CANVAS_WIDTH / 2 - total / 2;
    return start + index * (capW + gap) + capW / 2;
  }

  private createLegend(): void {
    this.legendGfx = this.add.graphics().setDepth(30);
    const capY = ViolinScene.LEGEND_CAP_Y;
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
          fontSize: VIOLIN_PITCHES.length > 8 ? '14px' : '16px',
          resolution: RENDER_SCALE,
        })
        .setOrigin(0.5)
        .setDepth(31);
      const name = this.add
        .text(x, capY + 27, pitch.name, {
          align: 'center',
          color: '#c9b28a',
          fontFamily: 'Georgia, serif',
          fontSize: VIOLIN_PITCHES.length > 8 ? '9px' : '10px',
          resolution: RENDER_SCALE,
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
    const capW = this.legendCapWidth();
    const capH = 34;
    const capY = ViolinScene.LEGEND_CAP_Y;
    // In practice there is no expected note — the caps just react to real key
    // presses (the held-key depress below), never a song cursor.
    const expected = this.modes.practice ? undefined : expectedPitchId(this.modelState);
    const echoing = !this.modes.practice && this.modelState.phase === 'echo';

    VIOLIN_PITCHES.forEach((pitch, index) => {
      const cx = this.legendCapX(index);
      const isExpected = this.modes.keyGuidance && echoing && expected === pitch.id;
      const held = this.noteKeys.get(pitch.key)?.isDown ?? false;
      const isActive = isExpected || held;
      const press = held ? 2 : 0; // depress offset
      const x = cx - capW / 2;
      const y = capY + press;

      // Cap shadow / socket.
      g.fillStyle(0x140d16, 0.7);
      g.fillRoundedRect(x, capY + 3, capW, capH, 7);

      // Cap face.
      const glow = held ? 0.95 : isExpected ? 0.65 + Math.sin(time / 220) * 0.2 : 0;
      const faceTop = isActive ? mixHex(0x6a4a24, 0xffd98a, glow) : 0x3c2f26;
      const faceBot = isActive ? mixHex(0x4a3218, 0xcf9a44, glow) : 0x271f19;
      g.fillStyle(faceBot, 1);
      g.fillRoundedRect(x, y, capW, capH, 7);
      g.fillStyle(faceTop, 1);
      g.fillRoundedRect(x, y, capW, capH - 4, 7);
      // Bevel highlight.
      g.fillStyle(isActive ? 0xfff0c6 : 0x6a584a, isActive ? 0.5 : 0.35);
      g.fillRoundedRect(x + 3, y + 2, capW - 6, 4, 3);
      // Rim.
      g.lineStyle(1.5, isActive ? 0xffe6a6 : 0x1c1512, isActive ? 0.9 : 0.8);
      g.strokeRoundedRect(x, y, capW, capH, 7);

      if (isActive) {
        g.fillStyle(0xffe6a6, 0.12 + glow * 0.1);
        g.fillCircle(cx, y + capH / 2, 30);
      }

      this.legendLetters[index]
        .setPosition(cx, y + 11)
        .setColor(isActive ? '#fff4d6' : '#e6d2ac');
      this.legendNames[index].setPosition(cx, y + 26);
    });
  }

  private updateHud(): void {
    if (this.isFinalizing) {
      return;
    }

    if (this.modes.practice) {
      this.titleText.setText('practice — play freely');
      this.helperText.setText('Press any key to sound a note · turn off Practice to return');
      return;
    }

    const phase = this.modelState.phase;
    if (phase === 'playback' || phase === 'handoff') {
      // Handoff flows straight into the next listen, so it wears the same prompt
      // — the beat reads as the piece drawing breath, not a pause.
      this.titleText.setText('listen...');
      this.helperText.setText('');
    } else if (phase === 'echo') {
      this.titleText.setText('now you — play it back');
      this.helperText.setText(
        this.modes.mistakesAllowed
          ? 'One slip is forgiven — play the right note to carry on.'
          : '',
      );
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
