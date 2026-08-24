import Phaser from 'phaser';
import { playSfx, playViolinNote } from '../../game/audio';
import { getPitch } from './melody';
import {
  GOOD_WINDOW_MS,
  RHYTHM_CHART,
  RHYTHM_BEAT_MS,
  RHYTHM_LANES,
  RHYTHM_LEAD_IN_MS,
  RHYTHM_NOTE_APPROACH_MS,
  VIOLIN_HOLD_POINTS_PER_TICK,
  VIOLIN_HOLD_TICK_MS,
  VIOLIN_MISS_PENALTY,
  VIOLIN_PASS_SCORE,
  advanceViolin,
  awardViolinHoldTicks,
  beginViolin,
  createViolinState,
  getPieceProgress,
  isSustainedRhythmNote,
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
const HIT_LINE_GLOW_RADIUS = 7;
const KEY_CAP_Y = HIT_LINE_Y + HIT_LINE_GLOW_RADIUS;
const KEY_CAP_HEIGHT = 40;
const NOTE_SPEED_PX_PER_MS = (HIT_LINE_Y - RUNWAY_TOP) / RHYTHM_NOTE_APPROACH_MS;
const NOTE_LOOKAHEAD_MS = RHYTHM_NOTE_APPROACH_MS;

const CREAM = 0xffedd0;
const GOLD = 0xf6b23c;
const BRIGHT_GOLD = 0xffd77b;
const INK = 0x2c1c1b;
const BURGUNDY = 0x5a2830;
const WINDOW_LIGHT = { x: 110, y: 112 } as const;
const LATE_LIGHT_START = 0.68;
const HOLD_COMPLETION_RATIO = 0.9;

type HoldInputSource = 'keyboard' | 'pointer';

interface ActiveHold {
  readonly noteIndex: number;
  readonly laneIndex: number;
  readonly keyName: string;
  readonly source: HoldInputSource;
  readonly durationMs: number;
  readonly deadlineMs: number;
  readonly requiredHoldMs: number;
  heldMs: number;
  awardedTicks: number;
}

function laneWidth(): number {
  return BOARD.width / RHYTHM_LANES.length;
}

function laneCentre(index: number): number {
  return BOARD.x + laneWidth() * (index + 0.5);
}

function smoothstep(value: number): number {
  const t = Phaser.Math.Clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function seededUnit(index: number, salt: number): number {
  const value = Math.sin(index * 91.73 + salt * 47.19) * 43758.5453;
  return value - Math.floor(value);
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

  private laneFlashes = new Map<number, number>();
  private judgementStrength = 0;
  private strikePulse = 0;
  private missPulse = 0;
  private finaleStrength = 0;
  private lateLightStrength = 0;
  private activeHold: ActiveHold | null = null;
  private holdFeedback: 'held' | 'early' | null = null;
  private holdFeedbackStrength = 0;

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
    this.finaleGfx = this.add
      .graphics()
      .setDepth(5)
      .setBlendMode(Phaser.BlendModes.ADD);

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
      `Violin rhythm game. Play the labelled notes as they meet the line. Score ${VIOLIN_PASS_SCORE.toLocaleString()} points to pass.`,
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
    this.updateActiveHold(delta);

    this.judgementStrength = Math.max(0, this.judgementStrength - delta / 520);
    this.strikePulse = Math.max(0, this.strikePulse - delta / 260);
    this.missPulse = Math.max(0, this.missPulse - delta / 360);
    this.holdFeedbackStrength = Math.max(0, this.holdFeedbackStrength - delta / 700);
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
    const lightTarget = this.getLateLightTarget(after);
    if (lightTarget > this.lateLightStrength) {
      this.lateLightStrength = Math.min(lightTarget, this.lateLightStrength + delta / 1100);
    } else {
      this.lateLightStrength = Math.max(lightTarget, this.lateLightStrength - delta / 650);
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
      .text(CANVAS_WIDTH / 2, 13, `Note 1 of ${RHYTHM_CHART.length}`, {
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
    RHYTHM_LANES.forEach((lane, index) => {
      const x = laneCentre(index);
      this.keyLabels.push(
        this.add
          .text(x, KEY_CAP_Y + KEY_CAP_HEIGHT / 2, lane.key, {
            align: 'center',
            color: '#fff0d4',
            fontFamily: 'Georgia, serif',
            fontSize: '18px',
            fontStyle: 'bold',
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
      RHYTHM_LANES.forEach((lane) => {
        const keyCode =
          Phaser.Input.Keyboard.KeyCodes[
            lane.inputCode as keyof typeof Phaser.Input.Keyboard.KeyCodes
          ];
        this.noteKeys.set(lane.key, keyboard.addKey(keyCode, false));
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
      if (this.modelState.phase === 'ready' || this.modelState.phase === 'retry') {
        this.startSong();
        return;
      }
      const lane = Phaser.Math.Clamp(
        Math.floor((pointer.x - BOARD.x) / laneWidth()),
        0,
        RHYTHM_LANES.length - 1,
      );
      this.resolvePress(RHYTHM_LANES[lane].key, 'pointer');
    });
  }

  private handleKeyPresses(): void {
    if (
      (this.modelState.phase === 'ready' || this.modelState.phase === 'retry') &&
      ((this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) ||
        (this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey)))
    ) {
      this.startSong();
      return;
    }

    for (const [keyName, key] of this.noteKeys) {
      if (Phaser.Input.Keyboard.JustDown(key)) {
        if (this.modelState.phase === 'ready' || this.modelState.phase === 'retry') {
          const lane = RHYTHM_LANES.findIndex((rhythmLane) => rhythmLane.key === keyName);
          if (lane >= 0) this.laneFlashes.set(lane, 1);
          this.startSong();
          return;
        }
        this.resolvePress(keyName, 'keyboard');
        return;
      }
    }
  }

  private startSong(): void {
    this.modelState = beginViolin(this.modelState);
    this.finaleStrength = 0;
    this.lateLightStrength = 0;
    this.judgementStrength = 0;
    this.strikePulse = 0;
    this.missPulse = 0;
    this.activeHold = null;
    this.holdFeedback = null;
    this.holdFeedbackStrength = 0;
    this.laneFlashes.clear();
    this.lastWallTime = performance.now();
  }

  private resolvePress(
    keyName: string,
    inputSource: HoldInputSource = 'keyboard',
  ): void {
    const lane = RHYTHM_LANES.findIndex((rhythmLane) => rhythmLane.key === keyName);
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
      if (note && isSustainedRhythmNote(note.index)) {
        this.activeHold = {
          noteIndex: note.index,
          laneIndex: note.laneIndex,
          keyName,
          source: inputSource,
          durationMs: note.durationMs,
          deadlineMs: note.timeMs + note.durationMs,
          requiredHoldMs: Math.max(
            VIOLIN_HOLD_TICK_MS,
            Math.min(
              note.durationMs,
              note.timeMs + note.durationMs - before.elapsedMs,
            ),
          ),
          heldMs: 0,
          awardedTicks: 0,
        };
        this.holdFeedback = null;
        this.holdFeedbackStrength = 0;
      }
      if (lane >= 0) {
        this.showScorePopup(lane, after.score - before.score, after.lastJudgement);
      }
      this.strikePulse = 1;
    } else {
      if (lane >= 0) {
        this.showScorePopup(lane, -VIOLIN_MISS_PENALTY, 'miss');
      }
      playSfx('sfx-violin-waver');
      this.missPulse = 1;
    }
  }

  private updateActiveHold(deltaMs: number): void {
    const hold = this.activeHold;
    if (!hold) {
      return;
    }

    const frameEndMs = this.modelState.elapsedMs;
    const frameStartMs = frameEndMs - deltaMs;
    const eligibleDeltaMs = Math.max(
      0,
      Math.min(frameEndMs, hold.deadlineMs) - frameStartMs,
    );
    if (this.isHoldInputDown(hold) && eligibleDeltaMs > 0) {
      hold.heldMs = Math.min(hold.requiredHoldMs, hold.heldMs + eligibleDeltaMs);
      this.laneFlashes.set(hold.laneIndex, 1);

      const earnedTicks = Math.floor(hold.heldMs / VIOLIN_HOLD_TICK_MS);
      const newTicks = earnedTicks - hold.awardedTicks;
      if (newTicks > 0) {
        hold.awardedTicks = earnedTicks;
        this.modelState = awardViolinHoldTicks(this.modelState, newTicks);
        this.showScorePopup(
          hold.laneIndex,
          newTicks * VIOLIN_HOLD_POINTS_PER_TICK,
          'good',
        );
      }
    }

    if (this.modelState.elapsedMs < hold.deadlineMs) {
      return;
    }

    const completion = hold.heldMs / hold.requiredHoldMs;
    this.holdFeedback = completion >= HOLD_COMPLETION_RATIO ? 'held' : 'early';
    this.holdFeedbackStrength = 1;
    this.activeHold = null;
  }

  private isHoldInputDown(hold: ActiveHold): boolean {
    if (hold.source === 'keyboard') {
      return this.noteKeys.get(hold.keyName)?.isDown ?? false;
    }

    const pointer = this.input.activePointer;
    if (!pointer.isDown || pointer.x < BOARD.x || pointer.x > BOARD.x + BOARD.width) {
      return false;
    }
    const lane = Phaser.Math.Clamp(
      Math.floor((pointer.x - BOARD.x) / laneWidth()),
      0,
      RHYTHM_LANES.length - 1,
    );
    return lane === hold.laneIndex;
  }

  private showScorePopup(
    lane: number,
    points: number,
    judgement: 'perfect' | 'good' | 'miss',
  ): void {
    const pointLabel = points > 0
      ? `+${points.toLocaleString()}`
      : points.toLocaleString();
    const popup = this.add
      .text(laneCentre(lane), HIT_LINE_Y - 18, pointLabel, {
        align: 'center',
        color:
          judgement === 'perfect'
            ? '#fff1ae'
            : judgement === 'good'
              ? '#edc57d'
              : '#f09a9a',
        fontFamily: 'Georgia, serif',
        fontSize: judgement === 'perfect' ? '19px' : '17px',
        fontStyle: 'bold',
        resolution: RENDER_SCALE,
        stroke: '#24121a',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(35)
      .setScale(0.72);

    this.tweens.add({
      targets: popup,
      y: HIT_LINE_Y - 55,
      alpha: 0,
      scaleX: 1.18,
      scaleY: 1.18,
      duration: 720,
      ease: 'Cubic.Out',
      onComplete: () => popup.destroy(),
    });
  }

  private reactToAdvance(before: ViolinState, after: ViolinState): void {
    if (after.missCount > before.missCount) {
      for (let index = before.nextNoteIndex; index < after.nextNoteIndex; index += 1) {
        const missedNote = RHYTHM_CHART[index];
        if (missedNote) {
          this.showScorePopup(
            missedNote.laneIndex,
            -VIOLIN_MISS_PENALTY,
            'miss',
          );
        }
      }
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
    RHYTHM_LANES.forEach((_, index) => {
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
    g.fillRect(
      BOARD.x,
      HIT_LINE_Y - HIT_LINE_GLOW_RADIUS,
      BOARD.width,
      HIT_LINE_GLOW_RADIUS * 2,
    );
    g.lineStyle(4, BRIGHT_GOLD, lineGlow);
    g.lineBetween(BOARD.x, HIT_LINE_Y, BOARD.x + BOARD.width, HIT_LINE_Y);
    g.lineStyle(1, CREAM, 0.9);
    g.lineBetween(BOARD.x, HIT_LINE_Y, BOARD.x + BOARD.width, HIT_LINE_Y);

    RHYTHM_LANES.forEach((_, index) => {
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
    if (
      this.modelState.phase === 'ready' ||
      this.modelState.phase === 'count-in' ||
      this.modelState.phase === 'retry' ||
      this.modelState.phase === 'finale' ||
      this.modelState.phase === 'complete'
    ) {
      return;
    }

    const activeHold = this.activeHold;
    if (activeHold) {
      const cx = laneCentre(activeHold.laneIndex);
      const width = Math.min(78, laneWidth() - 16);
      const tailHeight = this.sustainTailHeight(activeHold.durationMs);
      const headY =
        HIT_LINE_Y +
        (this.modelState.elapsedMs - RHYTHM_CHART[activeHold.noteIndex].timeMs) *
          NOTE_SPEED_PX_PER_MS;
      this.drawSustainTail(
        g,
        cx,
        headY,
        width,
        tailHeight,
        this.isHoldInputDown(activeHold),
      );
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

      const lane = note.laneIndex;
      const cx = laneCentre(lane);
      const y = HIT_LINE_Y - untilHit * NOTE_SPEED_PX_PER_MS;
      const width = Math.min(78, laneWidth() - 16);
      const isSustainedNote = isSustainedRhythmNote(i);

      if (isSustainedNote) {
        this.drawSustainTail(
          g,
          cx,
          y,
          width,
          this.sustainTailHeight(note.durationMs),
          false,
        );
      }
      this.drawNoteHead(g, cx, y, width);
    }
  }

  private sustainTailHeight(durationMs: number): number {
    return Math.min(
      HIT_LINE_Y - RUNWAY_TOP,
      Math.max(34, durationMs * NOTE_SPEED_PX_PER_MS),
    );
  }

  private drawSustainTail(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    y: number,
    width: number,
    height: number,
    lit: boolean,
  ): void {
    const tailX = cx - width * 0.35;
    const tailWidth = width * 0.7;
    const visibleTop = Math.max(RUNWAY_TOP, y - height);
    const visibleBottom = Math.min(HIT_LINE_Y, y);
    const visibleHeight = visibleBottom - visibleTop;
    if (visibleHeight <= 0) {
      return;
    }
    g.fillStyle(lit ? BRIGHT_GOLD : 0x70432e, lit ? 0.72 : 0.88);
    g.fillRoundedRect(tailX, visibleTop, tailWidth, visibleHeight, 6);
    g.fillStyle(lit ? 0xffefb0 : GOLD, lit ? 0.52 : 0.28);
    g.fillRoundedRect(
      tailX + 3,
      visibleTop + 2,
      tailWidth - 6,
      Math.max(1, visibleHeight - 4),
      4,
    );
    g.lineStyle(1.5, lit ? 0xfff2bd : BRIGHT_GOLD, lit ? 0.95 : 0.7);
    g.strokeRoundedRect(tailX, visibleTop, tailWidth, visibleHeight, 6);
  }

  private drawNoteHead(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    y: number,
    width: number,
  ): void {
    g.fillStyle(BURGUNDY, 0.98);
    g.fillRoundedRect(cx - width / 2, y - 7, width, 14, 6);
    g.fillStyle(BRIGHT_GOLD, 0.9);
    g.fillRoundedRect(cx - width / 2 + 2, y - 5, width - 4, 5, 3);
    g.lineStyle(1.5, CREAM, 0.8);
    g.strokeRoundedRect(cx - width / 2, y - 7, width, 14, 6);
    g.fillStyle(INK, 0.75);
    g.fillCircle(cx, y, 2.5);
  }

  private drawEffects(): void {
    const g = this.fxGfx;
    g.clear();

    if (this.strikePulse > 0) {
      const radius = 12 + (1 - this.strikePulse) * 24;
      const judged = RHYTHM_CHART[this.modelState.lastJudgedNoteIndex];
      if (judged) {
        g.lineStyle(3, BRIGHT_GOLD, this.strikePulse * 0.8);
        g.strokeCircle(laneCentre(judged.laneIndex), HIT_LINE_Y, radius);
      }
    }

    if (this.missPulse > 0) {
      g.fillStyle(0x7f2334, this.missPulse * 0.13);
      g.fillRect(BOARD.x, RUNWAY_TOP, BOARD.width, KEY_CAP_Y - RUNWAY_TOP);
    }

    const finale = this.finaleGfx;
    finale.clear();
    const light = this.lateLightStrength;
    const resultBoost =
      this.modelState.phase === 'finale' || this.modelState.phase === 'complete'
        ? this.finaleStrength
        : 0;
    if (light > 0) {
      finale.fillStyle(0xffc766, light * (0.04 + resultBoost * 0.06));
      finale.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const beams = [
        { angle: 0.1, halfWidth: 20, length: 620, alpha: 0.018 },
        { angle: 0.28, halfWidth: 28, length: 650, alpha: 0.022 },
        { angle: 0.48, halfWidth: 24, length: 610, alpha: 0.016 },
      ];
      for (const beam of beams) {
        const dx = Math.cos(beam.angle);
        const dy = Math.sin(beam.angle);
        const endX = WINDOW_LIGHT.x + dx * beam.length;
        const endY = WINDOW_LIGHT.y + dy * beam.length;
        const perpendicularX = -dy;
        const perpendicularY = dx;
        for (let layer = 0; layer < 3; layer += 1) {
          const spread = beam.halfWidth * (1 + layer * 0.9);
          finale.fillStyle(
            layer === 0 ? 0xffefc8 : layer === 1 ? 0xffdc98 : 0xffcc72,
            beam.alpha * light * (1.15 - layer * 0.28),
          );
          finale.fillPoints(
            [
              new Phaser.Geom.Point(WINDOW_LIGHT.x + perpendicularX * 5, WINDOW_LIGHT.y + perpendicularY * 5),
              new Phaser.Geom.Point(WINDOW_LIGHT.x - perpendicularX * 5, WINDOW_LIGHT.y - perpendicularY * 5),
              new Phaser.Geom.Point(endX - perpendicularX * spread, endY - perpendicularY * spread),
              new Phaser.Geom.Point(endX + perpendicularX * spread, endY + perpendicularY * spread),
            ],
            true,
          );
        }
      }

      for (let layer = 5; layer >= 1; layer -= 1) {
        const t = layer / 5;
        finale.fillStyle(
          0xfff1c9,
          light * (0.015 + resultBoost * 0.02) * (1.1 - t * 0.55),
        );
        finale.fillEllipse(WINDOW_LIGHT.x, WINDOW_LIGHT.y, 150 * t, 210 * t);
      }

      const now = this.time.now;
      for (let index = 0; index < 32; index += 1) {
        const speed = 0.009 + seededUnit(index, 1) * 0.007;
        const travel = (now * speed + seededUnit(index, 2) * CANVAS_HEIGHT) % CANVAS_HEIGHT;
        const x = seededUnit(index, 3) * CANVAS_WIDTH + Math.sin(now / 1300 + index) * 10;
        const y = CANVAS_HEIGHT - travel;
        const twinkle = 0.45 + Math.sin(now / 420 + index * 1.7) * 0.35;
        finale.fillStyle(
          0xffefbd,
          light * (0.05 + twinkle * 0.1) * (1 + resultBoost * 0.65),
        );
        finale.fillCircle(x, y, 0.7 + seededUnit(index, 4) * 1.4);
      }
    }
  }

  private getLateLightTarget(state: ViolinState): number {
    if (state.phase === 'finale' || state.phase === 'complete') {
      return 1;
    }
    if (state.phase !== 'playing') {
      return 0;
    }
    const progress = getPieceProgress(state);
    return smoothstep((progress - LATE_LIGHT_START) / (1 - LATE_LIGHT_START));
  }

  private updateHud(): void {
    const state = this.modelState;
    this.scoreText.setText(`Score ${state.score.toLocaleString()}`);
    this.comboText.setText(state.combo > 1 ? `Combo ${state.combo}` : 'Combo 0');

    const nextNoteNumber = Math.min(state.nextNoteIndex + 1, RHYTHM_CHART.length);
    this.progressText.setText(
      state.phase === 'retry'
        ? `Pass score ${VIOLIN_PASS_SCORE.toLocaleString()}`
        : state.nextNoteIndex >= RHYTHM_CHART.length
        ? 'Piece complete'
        : `Note ${nextNoteNumber} of ${RHYTHM_CHART.length}`,
    );

    if (state.phase === 'ready') {
      this.centreText.setText('Ready?').setAlpha(0.96);
      this.subText.setText('Press Space or tap to begin').setAlpha(0.9);
    } else if (state.phase === 'count-in') {
      const beatsLeft = Math.max(
        1,
        Math.ceil((RHYTHM_LEAD_IN_MS - state.elapsedMs) / RHYTHM_BEAT_MS),
      );
      this.centreText.setText(String(beatsLeft)).setAlpha(0.96);
      this.subText.setText('Meet the notes at the line').setAlpha(0.9);
    } else if (state.phase === 'retry') {
      this.centreText.setText('Try again').setAlpha(0.96);
      this.subText
        .setText(
          `${state.score.toLocaleString()} / ${VIOLIN_PASS_SCORE.toLocaleString()} points  ·  Press Space or tap to retry`,
        )
        .setAlpha(0.94);
    } else if (state.phase === 'finale' || state.phase === 'complete') {
      this.centreText.setText('').setAlpha(0);
      this.subText
        .setText(
          `${state.score.toLocaleString()} points  ·  ${state.maxCombo} max combo  ·  ${state.perfectCount} perfect`,
        )
        .setAlpha(this.finaleStrength);
    } else {
      this.centreText.setText('').setAlpha(0);
      this.subText.setText('').setAlpha(0);
    }

    const holdActive = this.activeHold !== null;
    const holding = this.activeHold ? this.isHoldInputDown(this.activeHold) : false;
    const holdResultVisible = this.holdFeedbackStrength > 0 && this.holdFeedback !== null;
    const label = holdActive
      ? holding
        ? 'HOLD'
        : 'KEEP HOLDING'
      : holdResultVisible
        ? this.holdFeedback === 'held'
          ? 'HELD'
          : 'RELEASED EARLY'
        : judgementLabel(state.lastJudgement);
    const colour = holding || (holdResultVisible && this.holdFeedback === 'held')
      ? '#fff1ae'
      : holdActive || holdResultVisible
        ? '#e18a8a'
        : state.lastJudgement === 'perfect'
          ? '#ffe6a6'
          : state.lastJudgement === 'good'
            ? '#e8bd76'
            : '#e18a8a';
    const feedbackAlpha = holdActive
      ? 1
      : holdResultVisible
        ? this.holdFeedbackStrength
        : this.judgementStrength;
    this.judgementText
      .setText(label)
      .setColor(colour)
      .setAlpha(feedbackAlpha)
      .setScale(0.92 + feedbackAlpha * 0.08);

    const hideBoard = state.phase === 'finale' || state.phase === 'complete';
    this.boardGfx.setAlpha(hideBoard ? 1 - this.finaleStrength : 1);
    this.notesGfx.setAlpha(hideBoard ? 0 : 1);
    this.keyLabels.forEach((labelText) => labelText.setAlpha(hideBoard ? 1 - this.finaleStrength : 1));
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
    panel.dataset.violinPassScore = String(VIOLIN_PASS_SCORE);
    panel.dataset.violinHold = this.activeHold
      ? String(this.activeHold.heldMs / this.activeHold.requiredHoldMs)
      : 'none';
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
