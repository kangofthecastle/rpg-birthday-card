import Phaser from 'phaser';
import {
  CATCH_BAR_HEIGHT,
  FISHING_METER_HEIGHT,
  FISH_TARGET_HEIGHT,
  FRIEND_ONE_FISH_SEQUENCE,
  createFishingRound,
  getFishingCompletion,
  isFishInCatchBar,
  updateFishingRound,
  type FishConfig,
  type FishingRoundState,
} from './fishingModel';

export interface FriendOneFishingSceneCallbacks {
  readonly onComplete: () => void;
  readonly onCancel: () => void;
}

const DEFAULT_CALLBACKS: FriendOneFishingSceneCallbacks = {
  onComplete: () => undefined,
  onCancel: () => undefined,
};

const METER_TOP = 48;
const METER_HEIGHT = 238;
const METER_X = 518;
const METER_WIDTH = 48;
const PROGRESS_X = 586;
const PROGRESS_WIDTH = 16;
const COMPLETION_DELAY_MS = 900;
const NEXT_FISH_DELAY_MS = 850;

export class FriendOneFishingScene extends Phaser.Scene {
  private readonly callbacks: FriendOneFishingSceneCallbacks;
  private round: FishingRoundState = createFishingRound(FRIEND_ONE_FISH_SEQUENCE[0]);
  private currentFishIndex = 0;
  private caughtCount = 0;
  private pointerHeld = false;
  private isTransitioning = false;
  private isFinalizing = false;
  private callbackDelivered = false;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private enterKey?: Phaser.Input.Keyboard.Key;
  private escapeKey?: Phaser.Input.Keyboard.Key;
  private staticGraphics!: Phaser.GameObjects.Graphics;
  private motionGraphics!: Phaser.GameObjects.Graphics;
  private meterGraphics!: Phaser.GameObjects.Graphics;
  private fishNameText!: Phaser.GameObjects.Text;
  private counterText!: Phaser.GameObjects.Text;
  private helperText!: Phaser.GameObjects.Text;
  private transitionText!: Phaser.GameObjects.Text;

  constructor(callbacks: FriendOneFishingSceneCallbacks = DEFAULT_CALLBACKS) {
    super('FriendOneFishingScene');
    this.callbacks = callbacks;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#18333b');
    this.staticGraphics = this.add.graphics();
    this.motionGraphics = this.add.graphics();
    this.meterGraphics = this.add.graphics();

    this.createPondScene();
    this.createHud();
    this.createInput();
    this.updateHudText();
    this.drawDynamicElements(0, false);
  }

  update(time: number, delta: number): void {
    if (
      !this.isFinalizing &&
      this.escapeKey &&
      Phaser.Input.Keyboard.JustDown(this.escapeKey)
    ) {
      this.cancelActivity();
      return;
    }

    const holdActive = this.isHolding();

    if (!this.isTransitioning && !this.isFinalizing) {
      this.round = updateFishingRound(
        this.round,
        this.currentFish,
        { holdActive },
        delta,
      );

      if (getFishingCompletion(this.round)) {
        this.completeCurrentFish();
      }
    }

    this.updateHudText(holdActive);
    this.drawDynamicElements(time, holdActive);
  }

  private get currentFish(): FishConfig {
    return FRIEND_ONE_FISH_SEQUENCE[this.currentFishIndex];
  }

  private createPondScene(): void {
    const graphics = this.staticGraphics;

    graphics.fillStyle(0x203f3a, 1);
    graphics.fillRect(0, 0, 640, 360);

    graphics.fillStyle(0x34533f, 1);
    graphics.fillEllipse(214, 268, 520, 180);
    graphics.fillStyle(0x224f5a, 1);
    graphics.fillEllipse(270, 216, 430, 188);
    graphics.fillStyle(0x2f7581, 0.72);
    graphics.fillEllipse(276, 206, 364, 132);
    graphics.fillStyle(0x8fd1ba, 0.18);
    graphics.fillEllipse(228, 184, 150, 38);
    graphics.fillEllipse(344, 222, 122, 30);

    graphics.fillStyle(0x7b5b3a, 1);
    graphics.fillRoundedRect(104, 230, 240, 34, 6);
    graphics.fillStyle(0x9a7248, 1);
    for (let x = 112; x <= 320; x += 44) {
      graphics.fillRoundedRect(x, 226, 34, 42, 4);
    }
    graphics.lineStyle(2, 0x5d422b, 0.9);
    graphics.lineBetween(112, 244, 336, 244);

    this.drawReeds(graphics, 50, 216);
    this.drawReeds(graphics, 430, 214);
    this.drawLilyPad(graphics, 316, 184, 0.92);
    this.drawLilyPad(graphics, 386, 230, 0.72);
    this.drawLilyPad(graphics, 196, 214, 0.62);

    this.drawCharacter(graphics, 158, 214, 0x6b4535, 0xf1b36d, 'You');
    this.drawCharacter(graphics, 248, 214, 0x39353f, 0xf0d06a, '____');

    this.add
      .text(158, 276, 'You', {
        color: '#f8eed8',
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
      })
      .setOrigin(0.5);
    this.add
      .text(248, 276, '____', {
        color: '#f8eed8',
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
      })
      .setOrigin(0.5);
  }

  private createHud(): void {
    this.fishNameText = this.add.text(24, 18, '', {
      color: '#fff4d7',
      fontFamily: 'Arial, sans-serif',
      fontSize: '20px',
    });
    this.counterText = this.add.text(500, 18, '', {
      color: '#fff4d7',
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
    });
    this.helperText = this.add.text(24, 318, '', {
      color: '#eef8e9',
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      wordWrap: { width: 440 },
    });
    this.transitionText = this.add
      .text(298, 82, '', {
        align: 'center',
        color: '#ffe8a8',
        fontFamily: 'Arial, sans-serif',
        fontSize: '21px',
        stroke: '#16333a',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
  }

  private createInput(): void {
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escapeKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.input.on('pointerdown', () => {
      this.pointerHeld = true;
    });
    this.input.on('pointerup', () => {
      this.pointerHeld = false;
    });
    this.input.on('pointerupoutside', () => {
      this.pointerHeld = false;
    });
    this.input.on('gameout', () => {
      this.pointerHeld = false;
    });
  }

  private isHolding(): boolean {
    return Boolean(
      this.pointerHeld ||
        this.spaceKey?.isDown ||
        this.enterKey?.isDown,
    );
  }

  private updateHudText(holdActive = false): void {
    const fishNumber = this.currentFishIndex + 1;
    const holdLabel = holdActive ? 'Hold steady' : 'Hold to lift';
    const specialCue = this.currentFish.isSpecial
      ? 'The koi surges and glows when it bursts.'
      : 'Keep the fish inside the green catch bar.';

    this.fishNameText.setText(`Fish ${fishNumber}: ${this.currentFish.label}`);
    this.counterText.setText(`Caught ${this.caughtCount}/${FRIEND_ONE_FISH_SEQUENCE.length}`);

    if (this.isFinalizing) {
      this.helperText.setText('The glowing koi settles beside ____.');
      return;
    }

    if (this.isTransitioning) {
      this.helperText.setText('Nice catch. The next fish is circling closer.');
      return;
    }

    this.helperText.setText(
      `${holdLabel}: Space, Enter, or mouse. ${specialCue} Esc cancels.`,
    );
  }

  private drawDynamicElements(time: number, holdActive: boolean): void {
    this.motionGraphics.clear();
    this.drawFishingLines(time, holdActive);
    this.drawPondFish(time);
    this.drawMeter(time);
  }

  private drawFishingLines(time: number, holdActive: boolean): void {
    const bob = Math.sin(time / 340) * 4;
    const playerBobberY = 168 + bob;
    const friendoneBobberY = 192 - bob * 0.5;
    const lineColor = holdActive ? 0xfff2b0 : 0xe7d7a8;

    this.motionGraphics.lineStyle(2, 0x5b3d27, 1);
    this.motionGraphics.lineBetween(174, 218, 304, playerBobberY);
    this.motionGraphics.lineBetween(264, 218, 372, friendoneBobberY);
    this.motionGraphics.lineStyle(1, lineColor, 0.9);
    this.motionGraphics.lineBetween(304, playerBobberY, 314, playerBobberY + 28);
    this.motionGraphics.lineBetween(372, friendoneBobberY, 378, friendoneBobberY + 24);
    this.motionGraphics.fillStyle(0xfff0a7, 1);
    this.motionGraphics.fillCircle(304, playerBobberY, 4);
    this.motionGraphics.fillStyle(0xf1a6a6, 1);
    this.motionGraphics.fillCircle(372, friendoneBobberY, 4);
  }

  private drawPondFish(time: number): void {
    const fish = this.currentFish;
    const x = fish.isSpecial ? 330 + Math.sin(time / 480) * 18 : 286;
    const y = fish.isSpecial ? 206 + Math.cos(time / 520) * 10 : 204;

    if (fish.isSpecial) {
      const pulse = 0.55 + Math.sin(time / 160) * 0.2;
      this.motionGraphics.fillStyle(0xffc85a, 0.18 + pulse * 0.18);
      this.motionGraphics.fillCircle(x, y, 34 + pulse * 10);
      this.motionGraphics.fillStyle(0xfff0a3, 0.75);
      this.motionGraphics.fillCircle(x + 18, y - 16, 2.5);
      this.motionGraphics.fillCircle(x - 22, y + 12, 2);
    }

    this.motionGraphics.fillStyle(fish.isSpecial ? 0xffa13d : 0x7fd6d0, 0.86);
    this.motionGraphics.fillEllipse(x, y, 28, 12);
    this.motionGraphics.fillTriangle(x - 18, y, x - 30, y - 8, x - 30, y + 8);
  }

  private drawMeter(time: number): void {
    const graphics = this.meterGraphics;
    const meterScale = METER_HEIGHT / FISHING_METER_HEIGHT;
    const barY = METER_TOP + this.round.catchBarY * meterScale;
    const barHeight = CATCH_BAR_HEIGHT * meterScale;
    const fishY = METER_TOP + this.round.fishY * meterScale;
    const fishHeight = FISH_TARGET_HEIGHT * meterScale;
    const progressHeight = METER_HEIGHT * this.round.progress;
    const fishInBar = isFishInCatchBar(this.round, this.currentFish);

    graphics.clear();
    graphics.fillStyle(0x102831, 0.94);
    graphics.fillRoundedRect(496, 34, 122, 270, 8);
    graphics.lineStyle(2, 0x7ea38d, 0.8);
    graphics.strokeRoundedRect(496, 34, 122, 270, 8);

    graphics.fillStyle(0x1c4150, 1);
    graphics.fillRoundedRect(METER_X, METER_TOP, METER_WIDTH, METER_HEIGHT, 8);
    graphics.lineStyle(2, 0xd0e8df, 0.55);
    graphics.strokeRoundedRect(METER_X, METER_TOP, METER_WIDTH, METER_HEIGHT, 8);

    graphics.fillStyle(fishInBar ? 0x74efbc : 0x8fcfd7, fishInBar ? 0.68 : 0.46);
    graphics.fillRoundedRect(METER_X + 4, barY, METER_WIDTH - 8, barHeight, 6);
    graphics.lineStyle(2, fishInBar ? 0xd8ffe8 : 0xd6edf0, 0.82);
    graphics.strokeRoundedRect(METER_X + 4, barY, METER_WIDTH - 8, barHeight, 6);

    this.drawFishTarget(graphics, this.currentFish, fishY + fishHeight / 2, time);

    graphics.fillStyle(0x263238, 1);
    graphics.fillRoundedRect(PROGRESS_X, METER_TOP, PROGRESS_WIDTH, METER_HEIGHT, 6);
    graphics.fillStyle(this.currentFish.isSpecial ? 0xffbc58 : 0xa9e58e, 1);
    graphics.fillRoundedRect(
      PROGRESS_X,
      METER_TOP + METER_HEIGHT - progressHeight,
      PROGRESS_WIDTH,
      progressHeight,
      6,
    );
    graphics.lineStyle(2, 0xf4ead0, 0.55);
    graphics.strokeRoundedRect(PROGRESS_X, METER_TOP, PROGRESS_WIDTH, METER_HEIGHT, 6);
  }

  private drawFishTarget(
    graphics: Phaser.GameObjects.Graphics,
    fish: FishConfig,
    centerY: number,
    time: number,
  ): void {
    const centerX = METER_X + METER_WIDTH / 2;

    if (fish.isSpecial) {
      const pulse = 0.6 + Math.sin(time / 140) * 0.25;
      graphics.fillStyle(0xffd36d, 0.24 + pulse * 0.28);
      graphics.fillCircle(centerX, centerY, 24 + pulse * 5);
      graphics.lineStyle(2, 0xfff1a8, 0.72);
      graphics.strokeCircle(centerX, centerY, 23 + pulse * 3);
      graphics.fillStyle(0xfff3af, 0.88);
      graphics.fillCircle(centerX + 17, centerY - 10, 2.5);
      graphics.fillCircle(centerX - 18, centerY + 9, 2);
    }

    graphics.fillStyle(fish.isSpecial ? 0xffa044 : 0x54d8d0, 1);
    graphics.fillEllipse(centerX, centerY, 34, 18);
    graphics.fillTriangle(centerX - 18, centerY, centerX - 30, centerY - 10, centerX - 30, centerY + 10);
    graphics.fillStyle(0x173139, 1);
    graphics.fillCircle(centerX + 9, centerY - 3, 2);
  }

  private completeCurrentFish(): void {
    if (this.isTransitioning || this.isFinalizing) {
      return;
    }

    const caughtFish = this.currentFish;
    this.round = {
      ...this.round,
      progress: 1,
    };
    this.caughtCount += 1;
    this.pointerHeld = false;

    if (this.currentFishIndex === FRIEND_ONE_FISH_SEQUENCE.length - 1) {
      this.isFinalizing = true;
      this.transitionText.setText('Glowing Koi caught');
      this.time.delayedCall(COMPLETION_DELAY_MS, () => this.completeActivity());
      return;
    }

    this.isTransitioning = true;
    this.transitionText.setText(`${caughtFish.label} caught`);
    this.time.delayedCall(NEXT_FISH_DELAY_MS, () => this.startNextFish());
  }

  private startNextFish(): void {
    if (this.callbackDelivered || this.isFinalizing) {
      return;
    }

    this.currentFishIndex += 1;
    this.round = createFishingRound(this.currentFish, {
      catchBarY: 142,
      fishDirection: this.currentFishIndex % 2 === 0 ? 1 : -1,
      fishY: 124 + this.currentFishIndex * 24,
    });
    this.isTransitioning = false;
    this.transitionText.setText('');
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
    this.pointerHeld = false;
    this.callbacks.onCancel();
  }

  private drawCharacter(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    hairColor: number,
    shirtColor: number,
    label: string,
  ): void {
    graphics.fillStyle(0x2f2723, 0.35);
    graphics.fillEllipse(x, y + 44, 48, 14);
    graphics.fillStyle(shirtColor, 1);
    graphics.fillRoundedRect(x - 18, y + 18, 36, 42, 12);
    graphics.fillStyle(0xf4c89a, 1);
    graphics.fillCircle(x, y + 8, 18);
    graphics.fillStyle(hairColor, 1);
    graphics.fillEllipse(x, y - 2, 40, 24);
    graphics.fillStyle(0x473225, 1);
    graphics.fillCircle(x - 6, y + 7, 2);
    graphics.fillCircle(x + 7, y + 7, 2);

    if (label === '____') {
      graphics.fillStyle(0xffd7e4, 1);
      graphics.fillTriangle(x - 14, y + 22, x + 14, y + 22, x, y + 38);
    }
  }

  private drawReeds(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
  ): void {
    graphics.lineStyle(3, 0x71945f, 1);
    for (let index = 0; index < 5; index += 1) {
      const offset = index * 8;
      graphics.lineBetween(x + offset, y + 24, x + offset - 5, y - 20 + index * 3);
    }

    graphics.fillStyle(0xa36d45, 1);
    graphics.fillEllipse(x + 12, y - 12, 6, 20);
    graphics.fillEllipse(x + 28, y - 4, 6, 18);
  }

  private drawLilyPad(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    scale: number,
  ): void {
    graphics.fillStyle(0x78aa68, 0.92);
    graphics.fillEllipse(x, y, 42 * scale, 20 * scale);
    graphics.fillStyle(0x224f5a, 1);
    graphics.fillTriangle(x, y, x + 15 * scale, y - 7 * scale, x + 14 * scale, y + 4 * scale);
  }
}
