import Phaser from 'phaser';
import { playSfx, playViolinNote } from '../../game/audio';
import { VIOLIN_PITCHES, getPitch } from './melody';
import {
  GOOD_WINDOW_MS,
  RHYTHM_CHART,
  RHYTHM_LEAD_IN_MS,
  VIOLIN_FINALE_CAPTION,
  advanceViolin,
  beginViolin,
  createViolinState,
  getPieceProgress,
  pressViolinKey,
  type ViolinJudgement,
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

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 360;
const RENDER_SCALE = 2;
const BACKDROP_KEY = 'violin-room-backdrop';
const BACKDROP_URL = '/assets/activities/violin/room-backdrop.png';
const MAX_MODEL_STEP_MS = 250;

const BOARD = { x: 72, y: 38, width: 496, height: 286 } as const;
const RUNWAY_TOP = 48;
const HIT_LINE_Y = 270;
const KEY_CAP_Y = 286;
const KEY_CAP_HEIGHT = 31;
const NOTE_SPEED_PX_PER_MS = 0.155;
const NOTE_LOOKAHEAD_MS = (HIT_LINE_Y - RUNWAY_TOP) / NOTE_SPEED_PX_PER_MS;

const CREAM = 0xffedd0;
const GOLD = 0xf6b23c;
const BRIGHT_GOLD = 0xffd77b;
const INK = 0x2c1c1b;
const BURGUNDY = 0x5a2830;

function laneWidth(): number {
  return BOARD.width / VIOLIN_PITCHES.length;
}

function laneCentre(index: number): number {
  return BOARD.x + laneWidth() * (index + 0.5);
}

function pitchLane(pitchId: string): number {
  return Math.max(0, VIOLIN_PITCHES.findIndex((pitch) => pitch.id === pitchId));
}

function judgementLabel(judgement: ViolinJudgement): string {
  switch (judgement) {
    case 'perfect':
      return 'PERFECT';
    case 'good':
      return 'GOOD';
    case 'miss':
      return 'MISS';
    default:
      return '';
  }
}

export class ViolinScene extends Phaser.Scene {
  private readonly callbacks: ViolinSceneCallbacks;
  private modelState: ViolinState = createViolinState();
  private noteKeys = new Map<string, Phaser.Input.Keyboard.Key>();
  private escapeKey?: Phaser.Input.Keyboard.Key;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private enterKey?: Phaser.Input.Keyboard.Key;
  private panelEl: HTMLElement | null = null;
  private callbackDelivered = false;
  private lastWallTime = 0;

  private boardGfx!: Phaser.GameObjects.Graphics;
  private notesGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private finaleGfx!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private centreText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private judgementText!: Phaser.GameObjects.Text;
  private keyLabels: Phaser.GameObjects.Text[] = [];
  private noteLabels: Phaser.GameObjects.Text[] = [];

  private laneFlashes = new Map<number, number>();
  private judgementStrength = 0;
  private strikePulse = 0;
  private missPulse = 0;
  private finaleStrength = 0;

  constructor(callbacks: ViolinSceneCallbacks = DEFAULT_CALLBACKS) {
    super('ViolinScene');
    this.callbacks = callbacks;
  }

  preload(): void {
    this.load.image(BACKDROP_KEY, BACKDROP_URL);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#161019');
    this.cameras.main.setZoom(RENDER_SCALE);
    this.cameras.main.centerOn(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    this.add.image(0, 0, BACKDROP_KEY).setOrigin(0).setDepth(-10);

    const roomShade = this.add.graphics().setDepth(-9);
    roomShade.fillStyle(0x160f19, 0.5);
    roomShade.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.boardGfx = this.add.graphics().setDepth(0);
    this.notesGfx = this.add.graphics().setDepth(10);
    this.fxGfx = this.add.graphics().setDepth(20);
    this.finaleGfx = this.add.graphics().setDepth(40);

    this.createHud();
    this.createLaneLabels();
    this.createInput();

    this.modelState = createViolinState();
    this.lastWallTime = performance.now();
    this.panelEl =
      (this.game.canvas.closest('.activity-panel') as HTMLElement | null) ??
      this.game.canvas.parentElement;

    this.game.canvas.setAttribute(
      'aria-label',
      'Violin rhythm game. Play the labelled notes as they meet the golden line.',
    );

    this.drawFrame();
    this.drawNotes();
    this.updateHud();
    this.updateObservability();
  }

  update(): void {
    if (this.escapeKey && Phaser.Input.Keyboard.JustDown(this.escapeKey)) {
      this.deliverCancel();
      return;
    }

    this.handleKeyPresses();

    const now = performance.now();
    const delta = Math.min(MAX_MODEL_STEP_MS, Math.max(0, now - this.lastWallTime));
    this.lastWallTime = now;

    const before = this.modelState;
    const after = advanceViolin(before, delta);
    this.modelState = after;
    this.reactToAdvance(before, after);

    this.judgementStrength = Math.max(0, this.judgementStrength - delta / 520);
    this.strikePulse = Math.max(0, this.strikePulse - delta / 260);
    this.missPulse = Math.max(0, this.missPulse - delta / 360);
    this.laneFlashes.forEach((value, lane) => {
      const next = Math.max(0, value - delta / 220);
      if (next <= 0) {
        this.laneFlashes.delete(lane);
      } else {
        this.laneFlashes.set(lane, next);
      }
    });

    if (after.phase === 'finale' || after.phase === 'complete') {
      this.finaleStrength = Math.min(1, this.finaleStrength + delta / 1200);
    }

    this.drawFrame();
    this.drawNotes();
    this.drawEffects();
    this.updateHud();
    this.updateObservability();

    if (after.finished && !this.callbackDelivered) {
      this.callbackDelivered = true;
      this.time.delayedCall(160, this.callbacks.onComplete);
    }
  }

  private createHud(): void {
    const hudStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      color: '#f5dfbd',
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      fontStyle: 'italic',
      resolution: RENDER_SCALE,
      stroke: '#180f16',
      strokeThickness: 3,
    };

    this.scoreText = this.add.text(18, 13, 'Score 000000', hudStyle).setDepth(30);
    this.comboText = this.add
      .text(CANVAS_WIDTH - 18, 13, 'Combo 0', hudStyle)
      .setOrigin(1, 0)
      .setDepth(30);
    this.progressText = this.add
      .text(CANVAS_WIDTH / 2, 13, 'Measure 1 of 7', {
        ...hudStyle,
        color: '#d9b786',
        fontSize: '12px',
      })
      .setOrigin(0.5, 0)
      .setDepth(30);

    this.centreText = this.add
      .text(CANVAS_WIDTH / 2, 145, '', {
        align: 'center',
        color: '#fff0c7',
        fontFamily: 'Georgia, serif',
        fontSize: '42px',
        fontStyle: 'italic',
        resolution: RENDER_SCALE,
        stroke: '#24121a',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(31);

    this.subText = this.add
      .text(CANVAS_WIDTH / 2, 190, '', {
        align: 'center',
        color: '#e6c594',
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        fontStyle: 'italic',
        resolution: RENDER_SCALE,
        stroke: '#24121a',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(31);

    this.judgementText = this.add
      .text(CANVAS_WIDTH / 2, 222, '', {
        align: 'center',
        color: '#ffe6a6',
        fontFamily: 'Georgia, serif',
        fontSize: '24px',
        fontStyle: 'bold italic',
        resolution: RENDER_SCALE,
        stroke: '#24121a',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(32);
  }

  private createLaneLabels(): void {
    VIOLIN_PITCHES.forEach((pitch, index) => {
      const x = laneCentre(index);
      this.keyLabels.push(
        this.add
          .text(x, KEY_CAP_Y + 7, pitch.key, {
            align: 'center',
            color: '#fff0d4',
            fontFamily: 'Georgia, serif',
            fontSize: '14px',
            fontStyle: 'bold',
            resolution: RENDER_SCALE,
          })
          .setOrigin(0.5)
          .setDepth(22),
      );
      this.noteLabels.push(
        this.add
          .text(x, KEY_CAP_Y + 22, pitch.name, {
            align: 'center',
            color: '#c6a777',
            fontFamily: 'Georgia, serif',
            fontSize: '8px',
            resolution: RENDER_SCALE,
          })
          .setOrigin(0.5)
          .setDepth(22),
      );
    });
  }

  private createInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard) {
      VIOLIN_PITCHES.forEach((pitch) => {
        const keyCode =
          Phaser.Input.Keyboard.KeyCodes[
            pitch.inputCode as keyof typeof Phaser.Input.Keyboard.KeyCodes
          ];
        this.noteKeys.set(pitch.key, keyboard.addKey(keyCode, false));
      });
      this.escapeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC, false);
      this.spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
      this.enterKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER, false);
    }

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (
        pointer.x < BOARD.x ||
        pointer.x > BOARD.x + BOARD.width ||
        pointer.y < RUNWAY_TOP ||
        pointer.y > BOARD.y + BOARD.height
      ) {
        return;
      }
      if (this.modelState.phase === 'ready') {
        this.startSong();
        return;
      }
      const lane = Phaser.Math.Clamp(
        Math.floor((pointer.x - BOARD.x) / laneWidth()),
        0,
        VIOLIN_PITCHES.length - 1,
      );
      this.resolvePress(VIOLIN_PITCHES[lane].key);
    });
  }

  private handleKeyPresses(): void {
    if (
      this.modelState.phase === 'ready' &&
      ((this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) ||
        (this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey)))
    ) {
      this.startSong();
      return;
    }

    for (const [keyName, key] of this.noteKeys) {
      if (Phaser.Input.Keyboard.JustDown(key)) {
        if (this.modelState.phase === 'ready') {
          const lane = VIOLIN_PITCHES.findIndex((pitch) => pitch.key === keyName);
          if (lane >= 0) this.laneFlashes.set(lane, 1);
          this.startSong();
          return;
        }
        this.resolvePress(keyName);
        return;
      }
    }
  }

  private startSong(): void {
    this.modelState = beginViolin(this.modelState);
    this.lastWallTime = performance.now();
  }

  private resolvePress(keyName: string): void {
    const lane = VIOLIN_PITCHES.findIndex((pitch) => pitch.key === keyName);
    if (lane >= 0) {
      this.laneFlashes.set(lane, 1);
    }

    const before = this.modelState;
    const note = RHYTHM_CHART[before.nextNoteIndex];
    const after = pressViolinKey(before, keyName);
    if (after === before) {
      return;
    }

    this.modelState = after;
    this.judgementStrength = 1;
    if (after.lastJudgement === 'perfect' || after.lastJudgement === 'good') {
      const pitch = note ? getPitch(note.pitchId) : undefined;
      if (pitch && note) {
        playViolinNote(pitch.frequency, Math.max(260, note.durationMs), {
          connected: before.nextNoteIndex > 0,
        });
      }
      this.strikePulse = 1;
    } else {
      playSfx('sfx-violin-waver');
      this.missPulse = 1;
    }
  }

  private reactToAdvance(before: ViolinState, after: ViolinState): void {
    if (after.missCount > before.missCount) {
      this.judgementStrength = 1;
      this.missPulse = 1;
    }
    if (before.phase !== 'finale' && after.phase === 'finale') {
      playSfx('sfx-violin-swell');
    }
  }

  private drawFrame(): void {
    const g = this.boardGfx;
    g.clear();

    g.fillStyle(0x140f18, 0.86);
    g.fillRoundedRect(BOARD.x - 5, BOARD.y - 4, BOARD.width + 10, BOARD.height + 8, 10);
    g.lineStyle(1.5, 0xb97b45, 0.62);
    g.strokeRoundedRect(BOARD.x - 5, BOARD.y - 4, BOARD.width + 10, BOARD.height + 8, 10);

    const width = laneWidth();
    VIOLIN_PITCHES.forEach((_, index) => {
      const x = BOARD.x + index * width;
      const active = this.laneFlashes.get(index) ?? 0;
      g.fillStyle(index % 2 === 0 ? 0x2c1c25 : 0x221820, 0.68);
      g.fillRect(x, RUNWAY_TOP, width, KEY_CAP_Y - RUNWAY_TOP - 2);
      if (active > 0) {
        g.fillStyle(BRIGHT_GOLD, 0.08 + active * 0.2);
        g.fillRect(x + 1, RUNWAY_TOP, width - 2, KEY_CAP_Y - RUNWAY_TOP - 2);
      }
      if (index > 0) {
        g.lineStyle(1, 0xd6a066, 0.16);
        g.lineBetween(x, RUNWAY_TOP, x, KEY_CAP_Y - 2);
      }
    });

    const lineGlow = 0.36 + this.strikePulse * 0.5;
    g.fillStyle(BRIGHT_GOLD, 0.08 + this.strikePulse * 0.14);
    g.fillRect(BOARD.x, HIT_LINE_Y - 7, BOARD.width, 14);
    g.lineStyle(4, BRIGHT_GOLD, lineGlow);
    g.lineBetween(BOARD.x, HIT_LINE_Y, BOARD.x + BOARD.width, HIT_LINE_Y);
    g.lineStyle(1, CREAM, 0.9);
    g.lineBetween(BOARD.x, HIT_LINE_Y, BOARD.x + BOARD.width, HIT_LINE_Y);

    VIOLIN_PITCHES.forEach((_, index) => {
      const active = this.laneFlashes.get(index) ?? 0;
      const x = BOARD.x + index * width + 2;
      g.fillStyle(active > 0 ? 0x9f622d : 0x3a2825, 1);
      g.fillRoundedRect(x, KEY_CAP_Y, width - 4, KEY_CAP_HEIGHT, 5);
      g.fillStyle(active > 0 ? 0xffdf93 : 0x72513d, active > 0 ? 0.75 : 0.42);
      g.fillRoundedRect(x + 2, KEY_CAP_Y + 2, width - 8, 4, 2);
      g.lineStyle(1, active > 0 ? BRIGHT_GOLD : 0x171014, 0.9);
      g.strokeRoundedRect(x, KEY_CAP_Y, width - 4, KEY_CAP_HEIGHT, 5);
    });

    const progress = getPieceProgress(this.modelState);
    g.fillStyle(0x130d14, 0.8);
    g.fillRoundedRect(BOARD.x, BOARD.y - 1, BOARD.width, 4, 2);
    g.fillStyle(BRIGHT_GOLD, 0.9);
    g.fillRoundedRect(BOARD.x, BOARD.y - 1, BOARD.width * progress, 4, 2);
  }

  private drawNotes(): void {
    const g = this.notesGfx;
    g.clear();
    if (this.modelState.phase === 'finale' || this.modelState.phase === 'complete') {
      return;
    }

    for (let i = this.modelState.nextNoteIndex; i < RHYTHM_CHART.length; i += 1) {
      const note = RHYTHM_CHART[i];
      const untilHit = note.timeMs - this.modelState.elapsedMs;
      if (untilHit > NOTE_LOOKAHEAD_MS) {
        break;
      }
      if (untilHit < -GOOD_WINDOW_MS - 40) {
        continue;
      }

      const lane = pitchLane(note.pitchId);
      const cx = laneCentre(lane);
      const y = HIT_LINE_Y - untilHit * NOTE_SPEED_PX_PER_MS;
      const width = laneWidth() - 10;
      const sustain = Math.max(13, note.durationMs * NOTE_SPEED_PX_PER_MS);
      const tailHeight = Math.min(62, sustain);

      g.fillStyle(GOLD, 0.13);
      g.fillRoundedRect(cx - width * 0.35, y - tailHeight, width * 0.7, tailHeight, 6);
      g.fillStyle(BURGUNDY, 0.98);
      g.fillRoundedRect(cx - width / 2, y - 7, width, 14, 6);
      g.fillStyle(BRIGHT_GOLD, 0.9);
      g.fillRoundedRect(cx - width / 2 + 2, y - 5, width - 4, 5, 3);
      g.lineStyle(1.5, CREAM, 0.8);
      g.strokeRoundedRect(cx - width / 2, y - 7, width, 14, 6);
      g.fillStyle(INK, 0.75);
      g.fillCircle(cx, y, 2.5);
    }
  }

  private drawEffects(): void {
    const g = this.fxGfx;
    g.clear();

    if (this.strikePulse > 0) {
      const radius = 12 + (1 - this.strikePulse) * 24;
      const judged = RHYTHM_CHART[this.modelState.lastJudgedNoteIndex];
      if (judged) {
        g.lineStyle(3, BRIGHT_GOLD, this.strikePulse * 0.8);
        g.strokeCircle(laneCentre(pitchLane(judged.pitchId)), HIT_LINE_Y, radius);
      }
    }

    if (this.missPulse > 0) {
      g.fillStyle(0x7f2334, this.missPulse * 0.13);
      g.fillRect(BOARD.x, RUNWAY_TOP, BOARD.width, KEY_CAP_Y - RUNWAY_TOP);
    }

    const finale = this.finaleGfx;
    finale.clear();
    if (this.finaleStrength > 0) {
      finale.fillStyle(0xffc766, this.finaleStrength * 0.22);
      finale.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      finale.fillStyle(0xffe6a6, this.finaleStrength * 0.12);
      finale.fillTriangle(78, 30, 240, 360, 440, 360);
    }
  }

  private updateHud(): void {
    const state = this.modelState;
    this.scoreText.setText(`Score ${String(state.score).padStart(6, '0')}`);
    this.comboText.setText(state.combo > 1 ? `Combo ${state.combo}` : 'Combo 0');

    const current = RHYTHM_CHART[Math.min(state.nextNoteIndex, RHYTHM_CHART.length - 1)];
    this.progressText.setText(
      current ? `Measure ${current.phraseIndex + 1} of 7` : 'Piece complete',
    );

    if (state.phase === 'ready') {
      this.centreText.setText('Ready?').setAlpha(0.96);
      this.subText.setText('Press Space or tap to begin').setAlpha(0.9);
    } else if (state.phase === 'count-in') {
      const beatsLeft = Math.max(1, Math.ceil((RHYTHM_LEAD_IN_MS - state.elapsedMs) / 600));
      this.centreText.setText(String(beatsLeft)).setAlpha(0.96);
      this.subText.setText('Meet the notes at the golden line').setAlpha(0.9);
    } else if (state.phase === 'finale' || state.phase === 'complete') {
      this.centreText.setText(VIOLIN_FINALE_CAPTION).setAlpha(this.finaleStrength);
      this.subText
        .setText(
          `${state.score.toLocaleString()} points  ·  ${state.maxCombo} max combo  ·  ${state.perfectCount} perfect`,
        )
        .setAlpha(this.finaleStrength);
    } else {
      this.centreText.setText('').setAlpha(0);
      this.subText.setText('').setAlpha(0);
    }

    const label = judgementLabel(state.lastJudgement);
    const colour =
      state.lastJudgement === 'perfect'
        ? '#ffe6a6'
        : state.lastJudgement === 'good'
          ? '#e8bd76'
          : '#e18a8a';
    this.judgementText
      .setText(label)
      .setColor(colour)
      .setAlpha(this.judgementStrength)
      .setScale(0.92 + this.judgementStrength * 0.08);

    const hideBoard = state.phase === 'finale' || state.phase === 'complete';
    this.boardGfx.setAlpha(hideBoard ? 1 - this.finaleStrength : 1);
    this.notesGfx.setAlpha(hideBoard ? 0 : 1);
    this.keyLabels.forEach((labelText) => labelText.setAlpha(hideBoard ? 1 - this.finaleStrength : 1));
    this.noteLabels.forEach((labelText) => labelText.setAlpha(hideBoard ? 1 - this.finaleStrength : 1));
  }

  private updateObservability(): void {
    const panel = this.panelEl;
    if (!panel) {
      return;
    }
    panel.dataset.violinState = this.modelState.phase;
    panel.dataset.violinNote = String(this.modelState.nextNoteIndex);
    panel.dataset.violinScore = String(this.modelState.score);
    panel.dataset.violinCombo = String(this.modelState.combo);
    panel.dataset.violinMaxCombo = String(this.modelState.maxCombo);
    panel.dataset.violinJudgement = this.modelState.lastJudgement;
    const note = RHYTHM_CHART[this.modelState.nextNoteIndex];
    panel.dataset.violinWindow = String(
      this.modelState.phase === 'playing' &&
        Boolean(note) &&
        Math.abs(this.modelState.elapsedMs - note.timeMs) <= GOOD_WINDOW_MS,
    );
  }

  private deliverCancel(): void {
    if (this.callbackDelivered) {
      return;
    }
    this.callbackDelivered = true;
    this.callbacks.onCancel();
  }
}
