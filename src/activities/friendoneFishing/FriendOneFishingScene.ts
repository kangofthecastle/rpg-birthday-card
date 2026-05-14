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
const POND_BACKGROUND_KEY = 'friendone-fishing-pond-dock';
const POND_BACKGROUND_URL = '/assets/activities/friendone-fishing/pond-dock-v2.png';

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

  preload(): void {
    this.load.image(POND_BACKGROUND_KEY, POND_BACKGROUND_URL);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#18333b');
    this.createPondScene();
    this.motionGraphics = this.add.graphics();
    this.meterGraphics = this.add.graphics();

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
    this.textures.get(POND_BACKGROUND_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.add
      .image(0, 0, POND_BACKGROUND_KEY)
      .setOrigin(0)
      .setDisplaySize(640, 360);
  }

  private createHud(): void {
    this.fishNameText = this.add.text(24, 18, '', {
      color: '#fff4d7',
      fontFamily: 'Arial, sans-serif',
      fontSize: '20px',
      stroke: '#14262a',
      strokeThickness: 4,
    });
    this.counterText = this.add.text(500, 18, '', {
      color: '#fff4d7',
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      stroke: '#14262a',
      strokeThickness: 4,
    });
    this.helperText = this.add.text(24, 318, '', {
      color: '#eef8e9',
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      stroke: '#14262a',
      strokeThickness: 4,
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
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
    this.enterKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER, false);
    this.escapeKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.input.keyboard?.removeCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    ]);

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
    this.drawWaterShimmer(time);
    this.drawFishingLines(time, holdActive);
    this.drawPondFish(time);
    this.drawMeter(time);
  }

  private drawWaterShimmer(time: number): void {
    const shimmerPhase = (time / 42) % 34;

    this.motionGraphics.lineStyle(2, 0x9fe9ff, 0.12);
    for (let index = 0; index < 9; index += 1) {
      const x = 286 + index * 34 - shimmerPhase;
      const y = 196 + Math.sin(time / 520 + index) * 18 + index * 13;
      this.motionGraphics.lineBetween(x, y, x + 18, y - 3);
    }
  }

  private drawFishingLines(time: number, holdActive: boolean): void {
    const bob = Math.sin(time / 340) * 4;
    const playerBobber = {
      x: 202,
      y: 246 + bob,
    };
    const friendoneBobber = {
      x: 265,
      y: 248 - bob * 0.5,
    };
    const lineColor = holdActive ? 0xfff2b0 : 0xe7d7a8;

    this.drawBobberRipple(playerBobber.x, playerBobber.y, time);
    this.drawBobberRipple(friendoneBobber.x, friendoneBobber.y, time + 220);

    this.motionGraphics.lineStyle(2, 0x4a2b18, 0.86);
    this.motionGraphics.lineBetween(180, 142, playerBobber.x, playerBobber.y);
    this.motionGraphics.lineBetween(264, 135, friendoneBobber.x, friendoneBobber.y);
    this.motionGraphics.lineStyle(1, lineColor, 0.96);
    this.motionGraphics.lineBetween(180, 141, playerBobber.x, playerBobber.y);
    this.motionGraphics.lineBetween(264, 134, friendoneBobber.x, friendoneBobber.y);

    this.drawLiveBobber(playerBobber.x, playerBobber.y, holdActive, 0xc94c32);
    this.drawLiveBobber(friendoneBobber.x, friendoneBobber.y, false, 0xf2d0d0);
  }

  private drawBobberRipple(x: number, y: number, time: number): void {
    const pulse = (time / 260) % 1;
    const radius = 8 + pulse * 13;

    this.motionGraphics.lineStyle(2, 0xdffbff, 0.45 * (1 - pulse));
    this.motionGraphics.strokeEllipse(x, y + 2, radius * 1.5, radius * 0.64);
    this.motionGraphics.lineStyle(1, 0x7bd8ef, 0.28 * (1 - pulse));
    this.motionGraphics.strokeEllipse(x, y + 2, radius * 2.1, radius * 0.9);
  }

  private drawLiveBobber(
    x: number,
    y: number,
    holdActive: boolean,
    capColor: number,
  ): void {
    this.motionGraphics.fillStyle(0xf8f3df, 1);
    this.motionGraphics.fillCircle(x, y, holdActive ? 5 : 4);
    this.motionGraphics.fillStyle(capColor, 1);
    this.motionGraphics.fillCircle(x, y - 2, holdActive ? 4 : 3);
    this.motionGraphics.lineStyle(1, 0x2d2c2b, 0.8);
    this.motionGraphics.strokeCircle(x, y, holdActive ? 5 : 4);
  }

  private drawPondFish(time: number): void {
    const fish = this.currentFish;
    const swim = Math.sin(time / 480);
    const x = fish.isSpecial ? 298 + swim * 34 : 330 + swim * 26;
    const y = fish.isSpecial ? 286 + Math.cos(time / 520) * 12 : 252 + Math.cos(time / 430) * 9;
    const tailFlick = Math.sin(time / 90) * 4;

    if (fish.isSpecial) {
      const pulse = 0.55 + Math.sin(time / 160) * 0.2;
      this.motionGraphics.fillStyle(0xffc85a, 0.22 + pulse * 0.22);
      this.motionGraphics.fillCircle(x, y, 28 + pulse * 14);
      this.motionGraphics.fillStyle(0xfff0a3, 0.75);
      this.motionGraphics.fillCircle(x + 18, y - 16, 2.5);
      this.motionGraphics.fillCircle(x - 22, y + 12, 2);
    }

    this.motionGraphics.fillStyle(fish.isSpecial ? 0xffa13d : 0x7fd6d0, 0.86);
    this.motionGraphics.fillEllipse(x, y, 28, 12);
    this.motionGraphics.fillTriangle(x - 18, y, x - 30, y - 8 + tailFlick, x - 30, y + 8 + tailFlick);
    this.motionGraphics.fillStyle(0xfff8cf, fish.isSpecial ? 0.7 : 0.42);
    this.motionGraphics.fillCircle(x + 6, y - 2, 2);
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

}
