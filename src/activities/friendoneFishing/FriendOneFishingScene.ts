import Phaser from 'phaser';
import {
  FISHING_METER_HEIGHT,
  LINE_BREAK_MISSES,
  FRIEND_ONE_FISH_SEQUENCE,
  TIMING_MARKER_HEIGHT,
  TIMING_TARGET_COUNT,
  attemptFishingTarget,
  createFishingRound,
  getFishingCompletion,
  getTimingTarget,
  isMarkerInTarget,
  updateFishingRound,
  type FishConfig,
  type FishingRoundState,
} from './fishingModel';
import {
  createFishBehaviorParams,
  createFishBehaviorState,
  isFishBiting,
  spookFish,
  updateFishBehavior,
  type FishBehaviorParams,
  type FishBehaviorState,
} from './fishBehavior';
import { fishSpriteFacing, fishSpriteFor } from './fishSprites';
import { isImageUrl } from '../../game/assetProbe';

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
const REEL_X = 497;
const REEL_Y = METER_TOP + METER_HEIGHT / 2;
const REEL_RADIUS = 16;
const COMPLETION_DELAY_MS = 900;
const NEXT_FISH_DELAY_MS = 850;
const LINE_BREAK_RESET_DELAY_MS = 850;
const POND_BACKGROUND_KEY = 'friendone-fishing-pond-dock';
const POND_BACKGROUND_URL = '/assets/activities/friendone-fishing/pond-dock-v2.png';

// Matches the Fishing activity shell's serif treatment (see
// `.activity-shell--fishing` in styles.css) so the in-viewport Phaser text is
// the same family as the title / controls strip around it.
const FISHING_FONT = 'Georgia, "Times New Roman", serif';

// Rod-tip anchor points in the 640x360 scene, measured from the painted rods on
// the dock (both rods angle up-and-right, so the line hangs from a tip that
// sits ABOVE the hand — the previous origins sat on the forearm). The fishing
// line is drawn from these tips down to the bobber in every frame.
const PLAYER_ROD_TIP = { x: 182, y: 126 } as const;
const FRIEND_ONE_ROD_TIP = { x: 272, y: 119 } as const;

// The player's bobber rests here (in the open water just off the dock); the
// pond fish steers toward it. ____'s line is decorative company.
const PLAYER_BOBBER = { x: 202, y: 246 } as const;
const FRIEND_ONE_BOBBER = { x: 265, y: 248 } as const;

// Open-water rectangle the pond fish may roam within (avoids the dock/reeds).
const POND_BOUNDS = { minX: 196, maxX: 606, minY: 214, maxY: 332 } as const;
const FISH_SPAWN = { x: 560, y: 286 } as const;

// Depth layers. Fish and their effects sit LOW; the fishing line/bobbers sit
// above them; the catch meter and all HUD text sit above everything so gameplay
// UI is never occluded by a swimming fish.
const DEPTH_FISH_FX = 10; // koi glow, wake trail, vector-fish fallback
const DEPTH_FISH = 11; // the pond fish sprite itself
const DEPTH_MOTION = 20; // shimmer, fishing lines, bobbers, ripples
const DEPTH_METER = 30; // catch-meter panel + bars
const DEPTH_HUD = 40; // name / counter / helper / transition text

// Water-surface outline (scene 640x360 coords), sampled from the painted
// background: the pond's swimmable water bounded above by the dock's front edge
// (which dips to ~254 at the post base around x=340) and, past x≈378, by open
// water. Fish sprites AND their wakes are geometry-masked to this polygon so
// they only ever appear on water — never over the dock or the reed banks.
const WATER_MASK_POLYGON: ReadonlyArray<{ x: number; y: number }> = [
  { x: 196, y: 224 },
  { x: 226, y: 224 },
  { x: 262, y: 222 },
  { x: 300, y: 229 },
  { x: 322, y: 231 },
  { x: 334, y: 243 },
  { x: 340, y: 255 },
  { x: 352, y: 250 },
  { x: 360, y: 227 },
  { x: 376, y: 214 },
  { x: 382, y: 200 },
  { x: 610, y: 200 },
  { x: 610, y: 338 },
  { x: 196, y: 338 },
];

export class FriendOneFishingScene extends Phaser.Scene {
  private readonly callbacks: FriendOneFishingSceneCallbacks;
  private round: FishingRoundState = createFishingRound(FRIEND_ONE_FISH_SEQUENCE[0]);
  private currentFishIndex = 0;
  private caughtCount = 0;
  private pointerHeld = false;
  private pointerPressed = false;
  private isTransitioning = false;
  private isFinalizing = false;
  private callbackDelivered = false;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private enterKey?: Phaser.Input.Keyboard.Key;
  private escapeKey?: Phaser.Input.Keyboard.Key;
  private motionGraphics!: Phaser.GameObjects.Graphics;
  private fishGraphics!: Phaser.GameObjects.Graphics;
  private meterGraphics!: Phaser.GameObjects.Graphics;
  private waterMask?: Phaser.Display.Masks.GeometryMask;
  /** Recent fish positions for the subtle wake trail (newest last). */
  private wake: Array<{ x: number; y: number; ttl: number; heading: number }> = [];
  private counterText!: Phaser.GameObjects.Text;
  private transitionText!: Phaser.GameObjects.Text;
  private behavior: FishBehaviorState = createFishBehaviorState(FISH_SPAWN, 0x1a2b3c);
  private behaviorParams: FishBehaviorParams = createFishBehaviorParams(
    FRIEND_ONE_FISH_SEQUENCE[0].speedPerSecond,
    POND_BOUNDS,
  );
  private lastBobber: { x: number; y: number } = {
    x: PLAYER_BOBBER.x,
    y: PLAYER_BOBBER.y,
  };
  /** Fish ids whose sprite PNG was found and loaded; the rest render as vectors. */
  private readonly spriteReady = new Set<string>();
  private pondFishSprite?: Phaser.GameObjects.Image;

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
    // Fish + their wake draw on their own layer so it can be clipped to the
    // water without also clipping the fishing lines that hang over the dock.
    this.fishGraphics = this.add.graphics().setDepth(DEPTH_FISH_FX);
    this.motionGraphics = this.add.graphics().setDepth(DEPTH_MOTION);
    this.meterGraphics = this.add.graphics().setDepth(DEPTH_METER);
    this.waterMask = this.createWaterMask();
    this.fishGraphics.setMask(this.waterMask);

    this.createHud();
    this.createInput();
    this.resetBehaviorForCurrentFish();
    this.updateHudText();
    void this.loadFishSprites();
    this.drawDynamicElements(0, false);
  }

  // Probe the optional per-fish sprite PNGs and load any that exist, mirroring
  // BootScene's console-clean drop-in pattern. Absent files are skipped and the
  // renderer keeps using the vector fish.
  private async loadFishSprites(): Promise<void> {
    const configs = FRIEND_ONE_FISH_SEQUENCE.map((fish) => fishSpriteFor(fish.id));
    const presence = await Promise.all(configs.map((cfg) => isImageUrl(cfg.url)));
    const present = configs.filter((_, index) => presence[index]);
    if (present.length === 0 || !this.scene.isActive()) {
      return;
    }

    await new Promise<void>((resolve) => {
      for (const cfg of present) {
        if (!this.textures.exists(cfg.key)) {
          this.load.image(cfg.key, cfg.url);
        }
      }
      this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      this.load.start();
    });

    for (const fish of FRIEND_ONE_FISH_SEQUENCE) {
      if (this.textures.exists(fishSpriteFor(fish.id).key)) {
        this.textures.get(fishSpriteFor(fish.id).key).setFilter(
          Phaser.Textures.FilterMode.NEAREST,
        );
        this.spriteReady.add(fish.id);
      }
    }
  }

  private resetBehaviorForCurrentFish(): void {
    this.behaviorParams = createFishBehaviorParams(
      this.currentFish.speedPerSecond,
      POND_BOUNDS,
    );
    // Seed varies per fish so each round wanders differently but reproducibly.
    const seed = 0x1a2b3c + this.currentFishIndex * 0x9e3779b1;
    this.behavior = createFishBehaviorState(
      { x: FISH_SPAWN.x, y: FISH_SPAWN.y - this.currentFishIndex * 14 },
      seed | 0,
    );
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

    const holdActive = this.isHolding();
    const attemptActive = this.consumeAttempt();

    // Drive the model from real elapsed time (clamped) rather than Phaser's
    // smoothed per-frame delta, so difficulty is wall-clock consistent regardless
    // of render FPS.
    const modelDelta = Math.min(250, this.game.loop.rawDelta);

    if (!this.isTransitioning && !this.isFinalizing) {
      this.round = updateFishingRound(
        this.round,
        this.currentFish,
        modelDelta,
      );

      if (attemptActive) {
        const attempt = attemptFishingTarget(this.round, this.currentFish);
        this.round = attempt.state;

        if (attempt.outcome === 'line-break') {
          this.restartCurrentFishAfterLineBreak();
        }
      }

      if (getFishingCompletion(this.round)) {
        this.completeCurrentFish();
      }
    }

    // Drive the in-water fish steering toward the player's bobber every frame
    // (including during the catch/next-fish transition, so a caught fish darts
    // away). The bobber the fish targets is the live, dipping player bobber.
    this.behavior = updateFishBehavior(
      this.behavior,
      {
        x: this.lastBobber.x,
        y: this.lastBobber.y,
        active: !this.isFinalizing,
        reeling: this.round.progress,
      },
      this.behaviorParams,
      modelDelta,
    );

    this.updateWake(modelDelta);
    this.updateHudText();
    this.drawDynamicElements(time, holdActive);
  }

  // Maintain a short trail of fading wake marks behind a swimming fish. Kept
  // deliberately sparse and short-lived so the water reads as gently disturbed
  // rather than scarred with ripples.
  private updateWake(deltaMs: number): void {
    for (const mark of this.wake) {
      mark.ttl -= deltaMs;
    }
    this.wake = this.wake.filter((mark) => mark.ttl > 0);

    const { x, y } = this.behavior.position;
    const speed = Math.hypot(this.behavior.velocity.x, this.behavior.velocity.y);
    const last = this.wake[this.wake.length - 1];
    const movedFar = !last || Math.hypot(x - last.x, y - last.y) > 12;
    // Only lay a wake when actually gliding, and only every ~12px of travel.
    if (speed > 16 && movedFar) {
      this.wake.push({ x, y, ttl: 620, heading: this.behavior.heading });
      if (this.wake.length > 7) {
        this.wake.shift();
      }
    }
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

  // Geometry mask matching the painted water surface. Applied to the fish layer
  // and the fish sprite so a fish (and its wake) is clipped to the water even
  // when it swims up against the dock's front edge — it can never draw on land.
  private createWaterMask(): Phaser.Display.Masks.GeometryMask {
    const shape = this.make.graphics({}, false);
    shape.fillStyle(0xffffff, 1);
    shape.fillPoints(WATER_MASK_POLYGON as Phaser.Types.Math.Vector2Like[], true);
    return shape.createGeometryMask();
  }

  private createHud(): void {
    // In-viewport text matches the Fishing activity shell's serif treatment
    // (Georgia, per .activity-shell--fishing in styles.css) rather than a bare
    // sans, so the Phaser HUD reads as part of the same UI.
    // The catch counter sits in the top-right, right-aligned above the meter
    // panel (panel top = 34) with clear margin so it never clips the meter.
    this.counterText = this.add
      .text(614, 6, '', {
        color: '#e6f2ec',
        fontFamily: FISHING_FONT,
        fontSize: '16px',
        stroke: '#14262a',
        strokeThickness: 4,
      })
      .setOrigin(1, 0);
    this.transitionText = this.add
      .text(298, 82, '', {
        align: 'center',
        color: '#ffe8a8',
        fontFamily: FISHING_FONT,
        fontSize: '21px',
        stroke: '#16333a',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    // All HUD text sits above the fish and the meter.
    for (const text of [this.counterText, this.transitionText]) {
      text.setDepth(DEPTH_HUD);
    }
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
      this.pointerPressed = true;
    });
    this.input.on('pointerup', () => {
      this.pointerHeld = false;
    });
    this.input.on('pointerupoutside', () => {
      this.pointerHeld = false;
      this.pointerPressed = false;
    });
    this.input.on('gameout', () => {
      this.pointerHeld = false;
      this.pointerPressed = false;
    });
  }

  private isHolding(): boolean {
    return Boolean(
      this.pointerHeld ||
        this.spaceKey?.isDown ||
        this.enterKey?.isDown,
    );
  }

  private consumeAttempt(): boolean {
    const pressed = Boolean(
      this.pointerPressed ||
        (this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) ||
        (this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey)),
    );
    this.pointerPressed = false;
    return pressed;
  }

  private updateHudText(): void {
    // Only the catch counter lives in the viewport now. The fish label and the
    // drifting-hint line were removed at ____'s request; the timing and line
    // break guidance lives in the controls strip beneath the viewport (see
    // friendoneFishingActivity.ts).
    this.counterText.setText(`Caught ${this.caughtCount}/${FRIEND_ONE_FISH_SEQUENCE.length}`);
  }

  private drawDynamicElements(time: number, holdActive: boolean): void {
    this.motionGraphics.clear();
    this.fishGraphics.clear();
    this.drawWaterShimmer(time);
    // Fish and wake draw on the masked fish layer (below the lines/bobbers).
    this.drawWake();
    this.drawPondFish(time);
    this.drawFishingLines(time, holdActive);
    this.drawMeter(time);
  }

  // Soft, watery wake: each mark is a faint elongated ripple stretched along the
  // fish's heading that widens and fades as it ages. Low alpha and short life
  // keep it tasteful; the mask keeps every mark on the water.
  private drawWake(): void {
    const g = this.fishGraphics;
    for (const mark of this.wake) {
      const life = Math.max(0, Math.min(1, mark.ttl / 620));
      const alpha = 0.1 * life;
      if (alpha <= 0.005) continue;
      const spread = 5 + (1 - life) * 7;
      const cos = Math.cos(mark.heading);
      const sin = Math.sin(mark.heading);
      // Draw a thin ellipse aligned to travel by sampling a few points; Graphics
      // has no rotated-ellipse primitive, so approximate with two soft dots.
      const along = spread;
      const across = spread * 0.42;
      g.fillStyle(0xcdeefc, alpha);
      g.fillEllipse(mark.x - cos * 2, mark.y - sin * 2, along * 1.6, across * 1.6);
      g.fillStyle(0xe8f8ff, alpha * 0.7);
      g.fillEllipse(mark.x, mark.y, along, across);
    }
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
    // The fish's nibble/commit tug pulls the player's bobber down (and jitters
    // it sideways) — the visible "bite" tell tied to the water behavior.
    const dip = this.behavior.bobberDip;
    const biting = isFishBiting(this.behavior);
    const playerBobber = {
      x: PLAYER_BOBBER.x + (biting ? Math.sin(time / 55) * 1.6 : 0),
      y: PLAYER_BOBBER.y + bob + dip * 7,
    };
    const friendoneBobber = {
      x: FRIEND_ONE_BOBBER.x,
      y: FRIEND_ONE_BOBBER.y - bob * 0.5,
    };
    // Remember where the bobber actually sits so the fish targets it next frame.
    this.lastBobber = { x: playerBobber.x, y: playerBobber.y };

    const lineColor = holdActive ? 0xfff2b0 : 0xe7d7a8;

    this.drawBobberRipple(playerBobber.x, playerBobber.y, time);
    this.drawBobberRipple(friendoneBobber.x, friendoneBobber.y, time + 220);

    // Lines originate exactly at the painted rod tips, in every state.
    this.motionGraphics.lineStyle(2, 0x4a2b18, 0.86);
    this.motionGraphics.lineBetween(
      PLAYER_ROD_TIP.x,
      PLAYER_ROD_TIP.y,
      playerBobber.x,
      playerBobber.y,
    );
    this.motionGraphics.lineBetween(
      FRIEND_ONE_ROD_TIP.x,
      FRIEND_ONE_ROD_TIP.y,
      friendoneBobber.x,
      friendoneBobber.y,
    );
    this.motionGraphics.lineStyle(1, lineColor, 0.96);
    this.motionGraphics.lineBetween(
      PLAYER_ROD_TIP.x,
      PLAYER_ROD_TIP.y - 1,
      playerBobber.x,
      playerBobber.y,
    );
    this.motionGraphics.lineBetween(
      FRIEND_ONE_ROD_TIP.x,
      FRIEND_ONE_ROD_TIP.y - 1,
      friendoneBobber.x,
      friendoneBobber.y,
    );

    this.drawLiveBobber(playerBobber.x, playerBobber.y, holdActive || biting, 0xc94c32);
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
    const { x, y } = this.behavior.position;
    const heading = this.behavior.heading;

    // Koi glow trails the fish wherever it swims.
    if (fish.isSpecial) {
      const pulse = 0.55 + Math.sin(time / 160) * 0.2;
      this.fishGraphics.fillStyle(0xffc85a, 0.22 + pulse * 0.22);
      this.fishGraphics.fillCircle(x, y, 24 + pulse * 12);
    }

    if (this.spriteReady.has(fish.id)) {
      this.drawPondFishSprite(fish.id, x, y, heading);
      if (fish.isSpecial) {
        // Koi art ships without a baked glow — keep sparkles procedural on top.
        this.fishGraphics.fillStyle(0xfff0a3, 0.8);
        this.fishGraphics.fillCircle(x + Math.sin(time / 130) * 16, y - 14, 2.5);
        this.fishGraphics.fillCircle(x - Math.cos(time / 170) * 18, y + 12, 2);
      }
      return;
    }

    if (this.pondFishSprite) {
      this.pondFishSprite.setVisible(false);
    }
    this.drawPondFishVector(fish, x, y, heading, time);
  }

  private drawPondFishSprite(
    fishId: string,
    x: number,
    y: number,
    heading: number,
  ): void {
    const cfg = fishSpriteFor(fishId);
    if (!this.pondFishSprite) {
      this.pondFishSprite = this.add
        .image(x, y, cfg.key)
        .setOrigin(0.5)
        .setDepth(DEPTH_FISH);
      if (this.waterMask) {
        this.pondFishSprite.setMask(this.waterMask);
      }
    } else if (this.pondFishSprite.texture.key !== cfg.key) {
      this.pondFishSprite.setTexture(cfg.key);
    }

    const source = this.textures.get(cfg.key).getSourceImage();
    const scale = cfg.pondWidth / Math.max(1, source.width);
    // Side-view cutout (nose right): mirror it to the travel side and pitch it
    // gently toward the heading, so it always swims nose-first and upright —
    // rotating the whole sprite to the heading flipped it belly-up when it
    // headed right (the "moving backwards" bug).
    const facing = fishSpriteFacing(heading);
    this.pondFishSprite
      .setVisible(true)
      .setPosition(x, y)
      .setScale(scale)
      .setFlipX(facing.flipX)
      .setRotation(facing.rotation);
  }

  private drawPondFishVector(
    fish: FishConfig,
    x: number,
    y: number,
    heading: number,
    time: number,
  ): void {
    const dir = Math.cos(heading) >= 0 ? 1 : -1; // tail trails behind travel
    const tailFlick = Math.sin(time / 90) * 4;

    if (fish.isSpecial) {
      this.fishGraphics.fillStyle(0xfff0a3, 0.75);
      this.fishGraphics.fillCircle(x + 18 * dir, y - 16, 2.5);
      this.fishGraphics.fillCircle(x - 22 * dir, y + 12, 2);
    }

    this.fishGraphics.fillStyle(fish.isSpecial ? 0xffa13d : 0x7fd6d0, 0.86);
    this.fishGraphics.fillEllipse(x, y, 28, 12);
    this.fishGraphics.fillTriangle(
      x - 18 * dir,
      y,
      x - 30 * dir,
      y - 8 + tailFlick,
      x - 30 * dir,
      y + 8 + tailFlick,
    );
    this.fishGraphics.fillStyle(0xfff8cf, fish.isSpecial ? 0.7 : 0.42);
    this.fishGraphics.fillCircle(x + 6 * dir, y - 2, 2);
  }

  private drawMeter(time: number): void {
    const graphics = this.meterGraphics;
    const meterScale = METER_HEIGHT / FISHING_METER_HEIGHT;
    const markerY = METER_TOP + this.round.markerY * meterScale;
    const markerHeight = Math.max(6, TIMING_MARKER_HEIGHT * meterScale);
    const markerInTarget = isMarkerInTarget(this.round, this.currentFish);

    graphics.clear();
    graphics.fillStyle(0x102831, 0.94);
    graphics.fillRoundedRect(496, 34, 122, 270, 8);
    graphics.lineStyle(2, 0x7ea38d, 0.8);
    graphics.strokeRoundedRect(496, 34, 122, 270, 8);

    graphics.fillStyle(0x1c4150, 1);
    graphics.fillRoundedRect(METER_X, METER_TOP, METER_WIDTH, METER_HEIGHT, 8);
    graphics.lineStyle(2, 0xd0e8df, 0.55);
    graphics.strokeRoundedRect(METER_X, METER_TOP, METER_WIDTH, METER_HEIGHT, 8);

    for (let index = 0; index < TIMING_TARGET_COUNT; index += 1) {
      const target = getTimingTarget({ targetIndex: index }, this.currentFish);
      const targetY = METER_TOP + (target.centerY - target.height / 2) * meterScale;
      const targetHeight = target.height * meterScale;
      const completed = index < this.round.targetIndex;
      const active = index === this.round.targetIndex;

      graphics.fillStyle(
        completed ? 0x74c9ae : active ? 0xe7b85d : 0x315866,
        completed ? 0.48 : active ? 0.42 : 0.28,
      );
      graphics.fillRoundedRect(METER_X + 5, targetY, METER_WIDTH - 10, targetHeight, 5);
      graphics.lineStyle(
        active ? 2 : 1,
        completed ? 0xb9ead9 : active ? 0xffe09a : 0x82a8ad,
        active ? 0.92 : 0.52,
      );
      graphics.strokeRoundedRect(METER_X + 5, targetY, METER_WIDTH - 10, targetHeight, 5);

      if (completed) {
        const tickX = METER_X + METER_WIDTH - 12;
        const tickY = targetY + targetHeight / 2;
        graphics.lineStyle(2, 0xd8fff0, 0.9);
        graphics.lineBetween(tickX - 5, tickY, tickX - 2, tickY + 3);
        graphics.lineBetween(tickX - 2, tickY + 3, tickX + 4, tickY - 4);
      }
    }

    const markerColor =
      this.round.feedbackKind === 'line-break'
        ? 0xd86a59
        : this.round.feedbackKind === 'hit' || markerInTarget
          ? 0xffdf7a
          : 0xaeeef1;
    const markerGlow = this.round.feedbackKind === 'hit' ? 0.45 + Math.sin(time / 45) * 0.12 : 0.24;
    graphics.fillStyle(markerColor, markerGlow);
    graphics.fillRoundedRect(METER_X + 1, markerY - markerHeight, METER_WIDTH - 2, markerHeight * 2, 4);
    graphics.fillStyle(markerColor, 1);
    graphics.fillRoundedRect(METER_X + 2, markerY - markerHeight / 2, METER_WIDTH - 4, markerHeight, 3);
    graphics.lineStyle(1, 0xf4ffff, 0.75);
    graphics.strokeRoundedRect(METER_X + 2, markerY - markerHeight / 2, METER_WIDTH - 4, markerHeight, 3);

    graphics.fillStyle(0x263238, 1);
    graphics.fillRoundedRect(PROGRESS_X, METER_TOP, PROGRESS_WIDTH, METER_HEIGHT, 6);
    graphics.lineStyle(2, 0xf4ead0, 0.55);
    graphics.strokeRoundedRect(PROGRESS_X, METER_TOP, PROGRESS_WIDTH, METER_HEIGHT, 6);

    const segmentGap = 5;
    const segmentHeight = (METER_HEIGHT - 12 - segmentGap * (LINE_BREAK_MISSES - 1)) / LINE_BREAK_MISSES;
    for (let index = 0; index < LINE_BREAK_MISSES; index += 1) {
      const y = METER_TOP + 6 + index * (segmentHeight + segmentGap);
      const damaged = index < this.round.misses;
      const broken = this.round.feedbackKind === 'line-break';
      graphics.fillStyle(broken ? 0x6f3b3b : damaged ? 0xbc6651 : 0xb8ddd2, broken ? 0.45 : 0.9);
      graphics.fillRoundedRect(PROGRESS_X + 4, y, PROGRESS_WIDTH - 8, segmentHeight, 3);
      if (damaged || broken) {
        graphics.lineStyle(1, 0xffb08d, 0.9);
        graphics.lineBetween(PROGRESS_X + 3, y + segmentHeight * 0.38, PROGRESS_X + 12, y + segmentHeight * 0.55);
        graphics.lineBetween(PROGRESS_X + 12, y + segmentHeight * 0.55, PROGRESS_X + 5, y + segmentHeight * 0.72);
      }
    }

    this.drawReel(graphics);
  }

  private drawReel(graphics: Phaser.GameObjects.Graphics): void {
    const caught = this.round.feedbackKind === 'hit';
    const missed = this.round.feedbackKind === 'miss';
    const broken = this.round.feedbackKind === 'line-break';
    const angle = this.round.reelAngle;
    const outline = broken ? 0xc56e5f : caught ? 0xffd36d : missed ? 0xe39a68 : 0xc9e4dc;

    // A deliberately simple, flat 2D reel mounted on the meter's side.
    graphics.lineStyle(3, caught ? 0xffd36d : 0x789e99, caught ? 0.85 : 0.55);
    graphics.lineBetween(REEL_X + REEL_RADIUS - 1, REEL_Y, METER_X, REEL_Y);
    graphics.fillStyle(0x17343d, 1);
    graphics.fillCircle(REEL_X, REEL_Y, REEL_RADIUS + 2);
    graphics.lineStyle(caught ? 3 : 2, outline, 0.96);
    graphics.strokeCircle(REEL_X, REEL_Y, REEL_RADIUS);
    graphics.fillStyle(0x294f58, 1);
    graphics.fillCircle(REEL_X, REEL_Y, 11);
    graphics.lineStyle(1, 0x9bc3ba, 0.52);
    graphics.strokeCircle(REEL_X, REEL_Y, 8);
    graphics.strokeCircle(REEL_X, REEL_Y, 5);
    graphics.lineStyle(2, outline, 0.9);
    for (let spoke = 0; spoke < 4; spoke += 1) {
      const spokeAngle = angle + (Math.PI * 2 * spoke) / 4;
      graphics.lineBetween(
        REEL_X,
        REEL_Y,
        REEL_X + Math.cos(spokeAngle) * 10,
        REEL_Y + Math.sin(spokeAngle) * 10,
      );
    }
    const crankX = REEL_X + Math.cos(angle) * 14;
    const crankY = REEL_Y + Math.sin(angle) * 14;
    graphics.lineStyle(2, outline, 1);
    graphics.lineBetween(
      REEL_X + Math.cos(angle) * 7,
      REEL_Y + Math.sin(angle) * 7,
      crankX,
      crankY,
    );
    graphics.fillStyle(outline, 1);
    graphics.fillCircle(crankX, crankY, 3.5);
    graphics.fillStyle(0x102831, 1);
    graphics.fillCircle(REEL_X, REEL_Y, 3);

    if (caught) {
      // The pawl drops into the reel for the brief model-level lock interval.
      graphics.fillStyle(0xffd36d, 1);
      graphics.fillTriangle(
        REEL_X + 7,
        REEL_Y - 20,
        REEL_X + 15,
        REEL_Y - 14,
        REEL_X + 8,
        REEL_Y - 9,
      );
    }
  }

  private restartCurrentFishAfterLineBreak(): void {
    const fishIndex = this.currentFishIndex;
    this.pointerHeld = false;
    this.pointerPressed = false;
    this.behavior = spookFish(this.behavior);
    this.transitionText.setText('Line snapped');

    this.time.delayedCall(LINE_BREAK_RESET_DELAY_MS, () => {
      if (
        this.callbackDelivered ||
        this.isFinalizing ||
        this.isTransitioning ||
        this.currentFishIndex !== fishIndex
      ) {
        return;
      }

      this.wake = [];
      this.resetBehaviorForCurrentFish();
      this.transitionText.setText('');
    });
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
    this.pointerPressed = false;
    // The hooked fish is landed: it darts off the bobber.
    this.behavior = spookFish(this.behavior);

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
      markerDirection: this.currentFishIndex % 2 === 0 ? 1 : -1,
      markerY: 132 + this.currentFishIndex * 22,
    });
    this.resetBehaviorForCurrentFish();
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
    this.pointerPressed = false;
    this.callbacks.onCancel();
  }

}
