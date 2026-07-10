import Phaser from 'phaser';
import { playSfx, playViolinNote } from '../../game/audio';
import { isImageUrl } from '../../game/assetProbe';
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
// if present it is used, otherwise a simple procedural room is drawn.
const BACKDROP_KEY = 'violin-room-backdrop';
const BACKDROP_URL = '/assets/activities/violin/room-backdrop.png';

// The model is driven by real elapsed wall-clock time (not Phaser's smoothed
// per-frame delta), so playback tempo is correct regardless of render FPS. A
// single step is clamped so a backgrounded tab resuming can't teleport the model.
const MAX_MODEL_STEP_MS = 250;

// Sheet-music panel.
const SHEET_X = 96;
const SHEET_Y = 66;
const SHEET_WIDTH = CANVAS_WIDTH - SHEET_X * 2;
const SHEET_HEIGHT = 168;
const STAFF_TOP = SHEET_Y + 44;
const STAFF_LINE_GAP = 16;
const STAFF_LINES = 5;
// One diatonic step is half a line gap.
const STEP_PIXELS = STAFF_LINE_GAP / 2;

const CAPTION_TEXT = 'she finally hears how it ends.';
const CAPTION_FADE_MS = 1400;
const CAPTION_HOLD_MS = 1800;

// Warm backdrop tint stages, one per phrase advance (index 0 = first phrase).
const WARM_STAGES = [0x241c2b, 0x33232e, 0x45302f, 0x5a3a2e, 0x6f4529] as const;

interface NoteMark {
  x: number;
  y: number;
}

export class ViolinScene extends Phaser.Scene {
  private readonly callbacks: ViolinSceneCallbacks;
  private modelState: ViolinState = createViolinState();

  private backdrop!: Phaser.GameObjects.Graphics;
  private glow!: Phaser.GameObjects.Graphics;
  private staff!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private helperText!: Phaser.GameObjects.Text;
  private legendTexts: Phaser.GameObjects.Text[] = [];
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

  constructor(callbacks: ViolinSceneCallbacks = DEFAULT_CALLBACKS) {
    super('ViolinScene');
    this.callbacks = callbacks;
  }

  preload(): void {
    // The optional drop-in backdrop art is probed + loaded in create() via a
    // content-type check, so a missing file never logs a red loader error.
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1622');

    this.backdrop = this.add.graphics().setDepth(-3);
    this.glow = this.add.graphics().setDepth(-1);

    this.createSheet();
    this.staff = this.add.graphics();
    this.createHud();
    this.createLegend();
    this.createNoteLabels();
    this.createInput();

    // Kick off the first phrase playing itself.
    this.modelState = createViolinState();
    this.prevLitCount = 0;

    this.panelEl =
      (this.game.canvas.closest('.activity-panel') as HTMLElement | null) ??
      this.game.canvas.parentElement;

    this.drawBackdrop();
    this.updateHud();
    this.drawStaff(0);
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
    this.add
      .image(0, 0, BACKDROP_KEY)
      .setOrigin(0)
      .setDisplaySize(CANVAS_WIDTH, CANVAS_HEIGHT)
      .setAlpha(0.5)
      .setDepth(-2);
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
    if (this.finaleStarted) {
      this.goldenPour = Math.min(1, this.goldenPour + modelDelta / 2400);
    }

    this.drawBackdrop();
    this.updateHud();
    this.drawStaff(time);
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

  // ------------------------------------------------------------------
  // Drawing
  // ------------------------------------------------------------------

  private drawBackdrop(): void {
    const g = this.backdrop;
    g.clear();
    const base = WARM_STAGES[Math.min(this.warmStage, WARM_STAGES.length - 1)];
    g.fillStyle(base, 1);
    g.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // A warm glow along the right edge — the afternoon light source. Soft
    // layered bands that brighten toward the far edge, so it reads as light
    // spilling in, not a hard dark-framed bar.
    const warmth = 0.14 + this.warmStage * 0.1 + this.goldenPour * 0.45;
    const glowLeft = CANVAS_WIDTH - 128;
    const bands = 6;
    for (let i = 0; i < bands; i += 1) {
      const t = i / (bands - 1);
      const x = glowLeft + t * 108;
      const w = CANVAS_WIDTH - x;
      g.fillStyle(0xffd88a, Math.min(0.5, warmth * (0.35 + t * 0.75)));
      g.fillRect(x, 24, w, CANVAS_HEIGHT - 48);
    }

    // Golden light pouring in from the window edge at the finale.
    this.glow.clear();
    if (this.goldenPour > 0) {
      const steps = 6;
      for (let i = 0; i < steps; i += 1) {
        const t = i / steps;
        const alpha = this.goldenPour * 0.16 * (1 - t);
        const width = 90 + t * 360;
        this.glow.fillStyle(0xffe6a6, alpha);
        this.glow.fillRect(CANVAS_WIDTH - width, 20, width, CANVAS_HEIGHT - 40);
      }
    }
  }

  private createSheet(): void {
    const g = this.add.graphics();
    g.fillStyle(0xf3ead3, 0.96);
    g.fillRoundedRect(SHEET_X, SHEET_Y, SHEET_WIDTH, SHEET_HEIGHT, 10);
    g.lineStyle(2, 0x8a6a44, 0.8);
    g.strokeRoundedRect(SHEET_X, SHEET_Y, SHEET_WIDTH, SHEET_HEIGHT, 10);
  }

  private staffLineY(lineIndex: number): number {
    return STAFF_TOP + lineIndex * STAFF_LINE_GAP;
  }

  /** Y for a diatonic step. Step 0 (E4) sits on the bottom staff line. */
  private stepToY(step: number): number {
    const bottomLineY = this.staffLineY(STAFF_LINES - 1);
    return bottomLineY - step * STEP_PIXELS;
  }

  private currentNoteMarks(phrase: ViolinPhrase): NoteMark[] {
    const marks: NoteMark[] = [];
    const innerLeft = SHEET_X + 54;
    const innerRight = SHEET_X + SHEET_WIDTH - 28;
    const span = innerRight - innerLeft;
    const count = phrase.notes.length;
    for (let i = 0; i < count; i += 1) {
      const x = innerLeft + (span * (i + 0.5)) / count;
      const pitch = getPitch(phrase.notes[i].pitchId);
      const y = this.stepToY(pitch ? pitch.staffStep : 0);
      marks.push({ x, y });
    }
    return marks;
  }

  private drawStaff(time: number): void {
    const g = this.staff;
    g.clear();

    // Staff lines.
    g.lineStyle(1.5, 0x6f5636, 0.75);
    for (let i = 0; i < STAFF_LINES; i += 1) {
      const y = this.staffLineY(i);
      g.lineBetween(SHEET_X + 20, y, SHEET_X + SHEET_WIDTH - 20, y);
    }
    // A little clef flourish.
    g.lineStyle(3, 0x6f5636, 0.9);
    const clefX = SHEET_X + 34;
    g.strokeCircle(clefX, this.staffLineY(2), 9);
    g.lineBetween(clefX, this.staffLineY(0) - 6, clefX, this.staffLineY(4) + 6);

    const phrase = getPhrase(this.modelState);
    if (!phrase) {
      return;
    }
    const marks = this.currentNoteMarks(phrase);
    const lit = litNoteCount(this.modelState);
    const echoing = this.modelState.phase === 'echo';

    marks.forEach((mark, index) => {
      const isLit = index < lit;
      const isExpected =
        echoing && index === this.modelState.echoIndex;

      // Ledger line for notes below the staff (D4, step -1).
      const pitch = getPitch(phrase.notes[index].pitchId);
      if (pitch && pitch.staffStep < 0) {
        g.lineStyle(1.5, 0x6f5636, 0.7);
        g.lineBetween(mark.x - 10, mark.y, mark.x + 10, mark.y);
      }

      if (isLit) {
        const pulse = 0.6 + Math.sin(time / 220 + index) * 0.2;
        g.fillStyle(0xffcf6b, 0.28 + pulse * 0.18);
        g.fillCircle(mark.x, mark.y, 13);
        g.fillStyle(0xf6b23c, 1);
        g.fillCircle(mark.x, mark.y, 7);
        g.lineStyle(2, 0xfff0c6, 0.95);
        g.strokeCircle(mark.x, mark.y, 7);
      } else {
        g.fillStyle(0x4a3a24, isExpected ? 0.5 : 0.28);
        g.fillCircle(mark.x, mark.y, 6);
        if (isExpected) {
          const ring = 8 + Math.sin(time / 180) * 2;
          g.lineStyle(2, 0xc98a2f, 0.85);
          g.strokeCircle(mark.x, mark.y, ring);
        }
      }

      if (this.wrongFlash > 0 && isExpected) {
        g.lineStyle(2, 0xd06a4a, 0.7 * this.wrongFlash);
        g.strokeCircle(mark.x, mark.y, 11);
      }
    });

    this.updateNoteLabels(phrase, marks, lit, echoing);

    // Fresh-ring glow over the sheet.
    if (this.glowStrength > 0) {
      g.lineStyle(3, 0xffedbe, 0.4 * this.glowStrength);
      g.strokeRoundedRect(SHEET_X, SHEET_Y, SHEET_WIDTH, SHEET_HEIGHT, 10);
    }
  }

  // A small pool of key-letter labels, one shown under each staff mark so the
  // player reads the key directly on the note (no staff-height → note → key
  // mapping). The longest phrase has six notes, so six labels cover every phrase.
  private createNoteLabels(): void {
    const max = VIOLIN_PHRASES.reduce((n, phrase) => Math.max(n, phrase.notes.length), 0);
    this.noteKeyLabels = Array.from({ length: max }, () =>
      this.add
        .text(0, 0, '', {
          align: 'center',
          color: '#7a5a2f',
          fontFamily: 'Arial, sans-serif',
          fontStyle: '700',
          fontSize: '13px',
        })
        .setOrigin(0.5)
        .setVisible(false),
    );
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
      label.setText(pitch?.key ?? '');
      label.setPosition(marks[index].x, marks[index].y + 20);
      label.setColor(isExpected ? '#b7791f' : isLit ? '#8a6a30' : '#a08a63');
      label.setVisible(true);
    });
  }

  private createHud(): void {
    this.titleText = this.add
      .text(CANVAS_WIDTH / 2, 30, '', {
        align: 'center',
        color: '#ffe6b0',
        fontFamily: 'Georgia, serif',
        fontSize: '20px',
        fontStyle: 'italic',
        stroke: '#1a1018',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.helperText = this.add
      .text(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 66, '', {
        align: 'center',
        color: '#f0e2cf',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        stroke: '#1a1018',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.captionText = this.add
      .text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, '', {
        align: 'center',
        color: '#fff3d6',
        fontFamily: 'Georgia, serif',
        fontSize: '25px',
        fontStyle: 'italic',
        stroke: '#1a1018',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(50);
  }

  private createLegend(): void {
    const y = CANVAS_HEIGHT - 34;
    const innerLeft = SHEET_X + 40;
    const innerRight = SHEET_X + SHEET_WIDTH - 40;
    const span = innerRight - innerLeft;
    const count = VIOLIN_PITCHES.length;
    this.legendTexts = VIOLIN_PITCHES.map((pitch, index) => {
      const x = innerLeft + (span * index) / (count - 1);
      return this.add
        .text(x, y, `${pitch.key}\n${pitch.name}`, {
          align: 'center',
          color: '#d8c8ad',
          fontFamily: 'Arial, sans-serif',
          fontSize: '13px',
          stroke: '#1a1018',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
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

    const expected = expectedPitchId(this.modelState);
    this.legendTexts.forEach((text, index) => {
      const pitch = VIOLIN_PITCHES[index];
      const highlight = phase === 'echo' && expected === pitch.id;
      text.setColor(highlight ? '#ffdf9c' : '#d8c8ad');
      text.setScale(highlight ? 1.14 : 1);
    });
  }
}
