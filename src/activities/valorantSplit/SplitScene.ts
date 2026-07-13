import Phaser from 'phaser';
import {
  SPLIT_CONFIG,
  aliveEnemyCount,
  createSplitState,
  defuseProgress,
  enemyRect,
  isInDefuseRadius,
  isSplitWon,
  spikeTimeRemainingMs,
  tickSplit,
  type EnemyState,
  type SplitEvent,
  type SplitInput,
  type SplitState,
} from './splitModel';
import {
  ART_FILES,
  ART_KEYS,
  CHARACTER_ART,
  COVER_PROP_ORDER,
  CROSSHAIR_SCALE,
  HEART_SCALE,
  MEDAL_SCALE,
  PROP_FRAMES,
  SPIKE_BASE_SCALE,
  SPIKE_FRAMES,
  SPLIT_ART_BASE,
  UI_FRAMES,
  type ArtFrame,
} from './splitArt';
import { playSfx as playAudioSfx, type SfxKey } from '../../game/audio';
import { isImageUrl } from '../../game/assetProbe';

type SfxEvent =
  | 'shot'
  | 'heart'
  | 'beep'
  | 'tick'
  | 'checkpoint'
  | 'complete'
  | 'detonate'
  | 'clutch'
  | 'reload'
  | 'death'
  | 'dryfire';

const SFX_BY_EVENT: Readonly<Record<SfxEvent, SfxKey>> = {
  shot: 'sfx-shot',
  heart: 'sfx-heart-loss',
  beep: 'sfx-spike-beep',
  tick: 'sfx-defuse-tick',
  checkpoint: 'sfx-defuse-checkpoint',
  complete: 'sfx-defuse-complete',
  detonate: 'sfx-detonate',
  clutch: 'sfx-clutch',
  reload: 'sfx-reload',
  death: 'sfx-death',
  dryfire: 'sfx-dryfire',
};

export interface SplitSceneCallbacks {
  readonly onComplete: () => void;
  readonly onCancel: () => void;
}

const DEFAULT_CALLBACKS: SplitSceneCallbacks = {
  onComplete: () => undefined,
  onCancel: () => undefined,
};

const ARENA = SPLIT_CONFIG.arena;
const TEX = SPLIT_CONFIG.textures;
const CLUTCH_DELAY_MS = 1600;
const HIT_FLASH_MS = 90;
const DEATH_FADE_MS = 260;
const COVER_OVERHANG = 1.08;

// HUD geometry (arena is 960x540). The bottom bar carries health on the left and
// the ammo counter on the right; a slim top strip carries the fuse and the live
// enemy count. Colors reuse the game palette: teal 0x2ee6c4, gold 0xffd15c, red
// 0xff5470 on a near-black panel.
const HUD = {
  panel: 0x0c1220,
  teal: 0x2ee6c4,
  gold: 0xffd15c,
  red: 0xff5470,
  edge: 0x2b3a52,
  barBottomY: 486,
  barHeight: 54,
  topStripY: 6,
  topStripH: 40,
} as const;

// Every combatant carries a Vandal-silhouette rifle that rotates toward its
// aim/target. It's anchored in the character's hands (see gunHandY) and muzzle
// flashes pop at the barrel tip on each shot.
const GUN_TEX = 'split-gun';
// The generated rifle texture is ~34x14; scaled down it reads as a long gun
// held out toward the aim without dwarfing the ~27px-wide characters.
const GUN_SCALE = 0.74;
// A dropped-in gun.png (see ART_KEYS.gun) is displayed at this scale/pivot.
const GUN_ART_SCALE = 0.55;
const GUN_ART_ORIGIN_X = 0.34;
// Grip pivot along the generated texture: the hand sits ~a third from the rear
// so the barrel swings forward from the fist.
const GUN_GRIP_ORIGIN_X = 0.34;
// How far forward (along the aim) the grip is held from the body center.
const GUN_HAND_OFFSET = 5;
const MUZZLE_DIST = 24;
const MUZZLE_MS = 80;
const GUN_TINT = {
  player: 0xdff7ea,
  teammate: 0xd8ccff,
  enemy: 0xf3c4c4,
} as const;
const MUZZLE_COLOR = {
  player: 0xfff2a8,
  teammate: 0xcbb8ff,
  enemy: 0xff8a5c,
} as const;

// ____-voice comms barks. Warm, personal, Valorant-flavored — the teammate is
// ____, the player is ____, and this is a birthday gift.
const BARKS = {
  roundStart: "Site's lost, spike's down — we're taking it back. On me, ____.",
  firstBlood: "That's the one. Knew you'd pop off.",
  died: "You're down — but we reset and run it clean. From the top, ____.",
  reinforcement: "More inbound from Heaven. Hold the angle, I've got trades.",
  defuseWave: "You tapped it — they're collapsing! Two on the flank, hold!",
  onSite: "You're on it — plant your feet and hold 4. I've got the site.",
  interrupted: "They knocked you off it! Reset and get back on — go, go.",
  detonate: "Spike's gone. Shake it off — we run it back. Same as always.",
  runback: "Fresh round. Site's down again. Let's take it back.",
  clutch: "That's my Viper. Clutch.",
} as const;

interface Tracer {
  readonly from: { x: number; y: number };
  readonly to: { x: number; y: number };
  readonly color: number;
  readonly bornAt: number;
}

interface CharacterView {
  readonly img: Phaser.GameObjects.Image;
  readonly gun: Phaser.GameObjects.Image;
  readonly art: boolean;
  readonly offsetY: number;
  readonly originY: number;
  // Vertical hand/chest band as a fraction down from the top of the rendered
  // sprite; the gun and muzzle flash anchor here (see gunHandY).
  readonly handFraction: number;
}

interface MuzzleFlash {
  readonly x: number;
  readonly y: number;
  readonly color: number;
  readonly bornAt: number;
}

interface EnemyView extends CharacterView {
  deathPlayed: boolean;
}

export class SplitScene extends Phaser.Scene {
  private readonly callbacks: SplitSceneCallbacks;
  private state: SplitState = createSplitState(Date.now() % 1_000_000);
  private finalizing = false;
  private callbackDelivered = false;
  // The scene builds asynchronously (art is probed before loading so an absent
  // optional file never errors the loader); update() no-ops until it's ready.
  private ready = false;

  private keys?: {
    escape: Phaser.Input.Keyboard.Key;
  };

  // Movement/defuse keys are tracked with window-level listeners rather than
  // Phaser Key objects: the location scene's Phaser instance keeps running
  // beneath the activity modal and captures (preventDefaults) keys like E,
  // which makes this second Phaser instance drop those keydowns entirely.
  private heldCodes = new Set<string>();
  // Edge-triggered reload request, set on the R keydown and consumed by the
  // next readInput() so holding R doesn't machine-gun reload attempts.
  private reloadQueued = false;
  private readonly onWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyR' && !this.heldCodes.has('KeyR')) {
      this.reloadQueued = true;
    }
    this.heldCodes.add(event.code);
  };
  private readonly onWindowKeyUp = (event: KeyboardEvent): void => {
    this.heldCodes.delete(event.code);
  };
  private readonly onWindowBlur = (): void => {
    this.heldCodes.clear();
    this.pointerDown = false;
  };

  private firePressed = false;
  // The rifle is fully automatic: hold the mouse to keep firing (model cadence
  // gates the rate). Tracked here from pointer up/down.
  private pointerDown = false;
  private pointer = { x: ARENA.width / 2, y: ARENA.height / 2 };

  private dynamic!: Phaser.GameObjects.Graphics;
  private groundFx!: Phaser.GameObjects.Graphics;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private crosshair!: Phaser.GameObjects.Image;
  private playerView!: CharacterView;
  private teammateView!: CharacterView;
  private spikeSprite!: Phaser.GameObjects.Image;
  private spikeArt = false;
  private spikeBaseScale = 1;
  private enemyViews = new Map<number, EnemyView>();
  private heartImages: Phaser.GameObjects.Image[] = [];
  private medalImage?: Phaser.GameObjects.Image;
  // Bottom-bar + top-strip HUD (Valorant-flavored, drawn in-canvas so the
  // generic .activity-panel CSS can't out-specify it).
  private healthNumberText!: Phaser.GameObjects.Text;
  private ammoMagText!: Phaser.GameObjects.Text;
  private ammoReserveText!: Phaser.GameObjects.Text;
  private enemiesText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private barkText!: Phaser.GameObjects.Text;
  private popupText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private warnText!: Phaser.GameObjects.Text;

  private tracers: Tracer[] = [];
  private muzzles: MuzzleFlash[] = [];
  private muzzleUntil = 0;
  private nextBeepAt = 0;
  private nextDefuseTickAt = 0;
  private nextDefuseLoopAt = 0;
  private onSiteBarked = false;
  private playerFlashUntil = 0;
  private enemyFlashUntil = new Map<number, number>();
  private teammateFacingLeft = false;
  private teammatePrevX: number = SPLIT_CONFIG.teammateStart.x;

  constructor(callbacks: SplitSceneCallbacks = DEFAULT_CALLBACKS) {
    super('SplitScene');
    this.callbacks = callbacks;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#14171d');
    void this.boot();
  }

  // Probe each art file before loading it (isImageUrl rejects a 404 and the dev
  // SPA fallback that serves index.html for a missing path), so an absent
  // optional drop-in — notably gun.png by default — never errors the loader or
  // logs to the console. Missing keys cleanly fall back to generated textures.
  private async loadArt(): Promise<void> {
    const probed = await Promise.all(
      ART_FILES.map(async ({ key, file }) => {
        const url = `${SPLIT_ART_BASE}/${file}`;
        return { key, url, ok: await isImageUrl(url) };
      }),
    );

    const present = probed.filter((entry) => entry.ok);

    if (present.length === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      for (const { key, url } of present) {
        this.load.image(key, url);
      }
      this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      this.load.start();
    });
  }

  private async boot(): Promise<void> {
    await this.loadArt();

    // The scene may already be shutting down (activity closed) by the time the
    // async probe resolves; bail rather than build into a dead scene.
    if (!this.scene.isActive()) {
      return;
    }

    this.generateTextures();
    this.registerArtFrames();
    this.drawStaticArena();

    this.playerView = this.createCharacter('player', TEX.player);
    this.teammateView = this.createCharacter('teammate', TEX.teammate);
    this.createSpike();

    this.groundFx = this.add.graphics().setDepth(55);
    this.dynamic = this.add.graphics().setDepth(700);
    this.hudGraphics = this.add.graphics().setDepth(800).setScrollFactor(0);
    this.createHud();

    this.roundText = this.add
      .text(ARENA.width / 2, 16, '1', {
        color: '#ffd15c',
        fontFamily: 'Arial, sans-serif',
        fontSize: '38px',
        fontStyle: '700',
        stroke: '#141414',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 0)
      .setDepth(810);
    this.statusText = this.add
      .text(ARENA.width / 2, HUD.barBottomY - 16, '', {
        align: 'center',
        color: '#e6f2ff',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        stroke: '#141414',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 1)
      .setDepth(810);
    this.barkText = this.add
      .text(0, 0, '', {
        align: 'center',
        backgroundColor: '#20304aee',
        color: '#dfe9ff',
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        padding: { x: 10, y: 6 },
        stroke: '#0c1220',
        strokeThickness: 2,
        wordWrap: { width: 280 },
      })
      .setOrigin(0.5, 1)
      .setDepth(815)
      .setVisible(false);
    this.popupText = this.add
      .text(ARENA.width / 2, ARENA.height / 2 - 60, '', {
        align: 'center',
        color: '#ff5470',
        fontFamily: 'Arial, sans-serif',
        fontSize: '52px',
        fontStyle: '800',
        stroke: '#141414',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(820)
      .setVisible(false);
    this.promptText = this.add
      .text(SPLIT_CONFIG.spike.x, SPLIT_CONFIG.spike.y + 52, 'HOLD 4 TO DEFUSE', {
        align: 'center',
        color: '#2ee6c4',
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        fontStyle: '700',
        stroke: '#0c1220',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setDepth(816)
      .setVisible(false);
    this.warnText = this.add
      .text(ARENA.width / 2, 62, '', {
        align: 'center',
        color: '#ffb347',
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        fontStyle: '800',
        stroke: '#141414',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0)
      .setDepth(816)
      .setVisible(false);

    this.crosshair = this.hasArt(ART_KEYS.ui)
      ? this.add
          .image(this.pointer.x, this.pointer.y, ART_KEYS.ui, 'crosshair')
          .setScale(CROSSHAIR_SCALE)
      : this.add.image(this.pointer.x, this.pointer.y, TEX.crosshair);
    this.crosshair.setDepth(900);

    this.createInput();
    this.showBark(BARKS.roundStart);
    this.ready = true;
  }

  update(_time: number, _delta: number): void {
    if (!this.ready) {
      return;
    }

    if (this.keys && Phaser.Input.Keyboard.JustDown(this.keys.escape) && !this.finalizing) {
      this.cancel();
      return;
    }

    const now = this.time.now;

    // Drive the model from real elapsed time (clamped) rather than Phaser's
    // smoothed per-frame delta, so the shot clock and aim feel are wall-clock
    // consistent regardless of render FPS.
    const modelDelta = Math.min(250, this.game.loop.rawDelta);

    if (!this.finalizing) {
      const input = this.readInput();
      this.state = tickSplit(this.state, input, modelDelta);
      this.handleEvents(this.state.events, now);

      if (isSplitWon(this.state)) {
        this.finalize();
      }
    }

    this.firePressed = false;
    this.render(now);
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------

  private createInput(): void {
    const keyboard = this.input.keyboard;

    if (keyboard) {
      this.keys = {
        escape: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      };
    }

    window.addEventListener('keydown', this.onWindowKeyDown);
    window.addEventListener('keyup', this.onWindowKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeWindowKeyListeners());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.removeWindowKeyListeners());

    this.input.setDefaultCursor('none');
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.pointer = { x: pointer.worldX, y: pointer.worldY };
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointer = { x: pointer.worldX, y: pointer.worldY };
      this.firePressed = true;
      this.pointerDown = true;
    });
    this.input.on('pointerup', () => {
      this.pointerDown = false;
    });
  }

  private removeWindowKeyListeners(): void {
    window.removeEventListener('keydown', this.onWindowKeyDown);
    window.removeEventListener('keyup', this.onWindowKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.heldCodes.clear();
  }

  private readInput(): SplitInput {
    const held = this.heldCodes;
    let x = 0;
    let y = 0;

    if (held.has('ArrowLeft') || held.has('KeyA')) x -= 1;
    if (held.has('ArrowRight') || held.has('KeyD')) x += 1;
    if (held.has('ArrowUp') || held.has('KeyW')) y -= 1;
    if (held.has('ArrowDown') || held.has('KeyS')) y += 1;

    const player = this.state.player.pos;
    const aimAngle = Math.atan2(this.pointer.y - player.y, this.pointer.x - player.x);
    // Defuse is bound to the 4 key (top-row Digit4 or the numpad 4).
    const holdDefuse =
      (held.has('Digit4') || held.has('Numpad4')) && this.state.phase === 'retake';
    const reload = this.reloadQueued;
    this.reloadQueued = false;

    return {
      move: { x, y },
      aimAngle,
      fire: this.firePressed || this.pointerDown,
      holdDefuse,
      reload,
    };
  }

  // ------------------------------------------------------------------
  // Events -> effects and barks
  // ------------------------------------------------------------------

  private handleEvents(events: readonly SplitEvent[], now: number): void {
    for (const event of events) {
      switch (event.type) {
        case 'player-shot':
          this.tracers.push({ from: event.from, to: event.to, color: 0x8affc1, bornAt: now });
          this.muzzleUntil = now + 70;
          this.addMuzzle(this.playerView, event.from, event.to, MUZZLE_COLOR.player, now);
          this.playSfx('shot');
          if (event.hitEnemyId !== null) {
            this.enemyFlashUntil.set(event.hitEnemyId, now + HIT_FLASH_MS);
          }
          if (event.headshot) {
            playAudioSfx('sfx-headshot');
            this.showPopup('HEADSHOT', '#ff5470');
          }
          break;
        case 'teammate-shot':
          this.tracers.push({ from: event.from, to: event.to, color: 0x9a7bff, bornAt: now });
          this.addMuzzle(this.teammateView, event.from, event.to, MUZZLE_COLOR.teammate, now);
          if (event.hitEnemyId !== null) {
            this.enemyFlashUntil.set(event.hitEnemyId, now + HIT_FLASH_MS);
          }
          break;
        case 'enemy-shot':
          this.tracers.push({ from: event.from, to: event.to, color: 0xff6b6b, bornAt: now });
          this.addMuzzle(this.enemyViews.get(event.enemyId), event.from, event.to, MUZZLE_COLOR.enemy, now);
          break;
        case 'heart-lost':
          this.playSfx('heart');
          this.playerFlashUntil = now + HIT_FLASH_MS + 30;
          this.cameras.main.shake(120, 0.006);
          break;
        case 'player-died':
          this.playSfx('death');
          this.showBark(BARKS.died);
          this.showPopup('YOU DIED', '#ff5470');
          this.cameras.main.flash(400, 200, 20, 30);
          this.cameras.main.shake(500, 0.014);
          break;
        case 'reload-start':
          this.playSfx('reload');
          break;
        case 'reload-complete':
          this.showWarn('RELOADED');
          break;
        case 'dry-fire':
          this.playSfx('dryfire');
          break;
        case 'defuse-wave':
          this.showBark(BARKS.defuseWave);
          this.showWarn('CONTESTED — 2 INBOUND');
          break;
        case 'first-blood':
          this.showBark(BARKS.firstBlood);
          break;
        case 'enemy-killed':
          this.spawnSkull(event.enemyId);
          break;
        case 'reinforcement':
          this.showBark(BARKS.reinforcement);
          this.showWarn('MORE INBOUND');
          break;
        case 'defuse-interrupted':
          this.showBark(BARKS.interrupted);
          this.showPopup('OFF THE SPIKE', '#ff5470');
          break;
        case 'defuse-checkpoint':
          this.playSfx('checkpoint');
          break;
        case 'defuse-complete':
          this.playSfx('complete');
          break;
        case 'detonated':
          this.playSfx('detonate');
          this.showBark(BARKS.detonate);
          this.showPopup('RUN IT BACK.', '#ff5470');
          this.cameras.main.flash(500, 220, 70, 40);
          this.cameras.main.shake(600, 0.012);
          break;
        case 'round-reset':
          this.onRoundReset(now);
          break;
        default:
          break;
      }
    }
  }

  // Wipe per-round view state so a soft-reset starts clean: fade out any lingering
  // enemy sprites (ids restart at 0), reset the spike beep/defuse cadence, and
  // clear the big detonation popup.
  private onRoundReset(now: number): void {
    for (const view of this.enemyViews.values()) {
      view.gun.destroy();
      view.img.destroy();
    }
    this.enemyViews.clear();
    this.enemyFlashUntil.clear();
    this.tracers = [];
    this.muzzles = [];
    this.nextBeepAt = now;
    this.nextDefuseTickAt = now;
    this.nextDefuseLoopAt = now;
    this.onSiteBarked = false;
    this.popupText.setVisible(false);
    this.tweens.killTweensOf(this.popupText);
    this.showBark(BARKS.runback);
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  private render(now: number): void {
    const { player, teammate } = this.state;

    this.renderPlayer(now);
    this.renderTeammate(now, teammate.pos);
    this.syncEnemySprites(now);

    this.dynamic.clear();
    this.groundFx.clear();
    this.drawAimLine(player.pos, now);
    this.drawTelegraphs(now);
    this.drawTracers(now);
    this.drawMuzzles(now);
    this.drawSpikeAndDefuse(now);
    this.drawHud();

    this.crosshair.setPosition(this.pointer.x, this.pointer.y);
    this.updateStatusText();
    this.updateTimerText(now);
    this.updatePrompt();
  }

  private renderPlayer(now: number): void {
    const player = this.state.player;
    const bob = Math.sin(now / 320) * 1;

    this.positionCharacter(this.playerView, player.pos, SPLIT_CONFIG.player.height, bob);
    this.playerView.img.setFlipX(this.pointer.x < player.pos.x);
    this.playerView.img.setAlpha(player.invulnMs > 0 ? 0.55 + Math.sin(now / 80) * 0.2 : 1);

    if (now < this.playerFlashUntil) {
      this.playerView.img.setTintFill(0xffffff);
    } else {
      this.playerView.img.clearTint();
    }

    // The player's gun tracks the mouse crosshair angle exactly.
    const aimAngle = Math.atan2(this.pointer.y - player.pos.y, this.pointer.x - player.pos.x);
    this.aimGun(this.playerView, player.pos, aimAngle);
  }

  private renderTeammate(now: number, pos: { x: number; y: number }): void {
    const bob = Math.sin(now / 320 + 1.7) * 1;
    const dx = pos.x - this.teammatePrevX;

    if (Math.abs(dx) > 0.05) {
      this.teammateFacingLeft = dx < 0;
    }

    this.teammatePrevX = pos.x;
    this.positionCharacter(this.teammateView, pos, SPLIT_CONFIG.teammate.height, bob);
    this.teammateView.img.setFlipX(this.teammateFacingLeft);

    // Omen's gun tracks the nearest live bot (his auto-fire target); with none
    // in play it just rests along his facing direction.
    const target = this.nearestEnemyPos(pos);
    const aimAngle = target
      ? Math.atan2(target.y - pos.y, target.x - pos.x)
      : this.teammateFacingLeft
        ? Math.PI
        : 0;
    this.aimGun(this.teammateView, pos, aimAngle);
  }

  private nearestEnemyPos(from: { x: number; y: number }): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const enemy of this.state.enemies) {
      if (!enemy.alive) {
        continue;
      }
      const dist = Math.hypot(enemy.pos.x - from.x, enemy.pos.y - from.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = enemy.pos;
      }
    }

    return best;
  }

  // Characters are foot-planted: art sprites anchor to the bottom (or top for
  // the bot, keeping its sphere head on the headshot band) of the model rect.
  private positionCharacter(
    view: CharacterView,
    pos: { x: number; y: number },
    height: number,
    bob: number,
  ): void {
    const footY = pos.y + height / 2;
    const anchorY = view.originY === 1 ? footY : pos.y - height / 2;

    view.img.setPosition(pos.x, anchorY + view.offsetY + bob);
    view.img.setDepth(footY);
  }

  // World-space Y of a character's hand/chest band, derived from the sprite's
  // live rendered geometry (position, display height, and per-role anchor) so
  // the gun sits in the hands for both the bottom-anchored agents and the
  // top-anchored bots, at any character scale. positionCharacter() runs before
  // this each frame, so view.img is already placed for the current frame.
  private gunHandY(view: CharacterView): number {
    const dispH = view.img.displayHeight;
    // originY 1 → img.y is the sprite's bottom edge; originY 0 → its top edge.
    const spriteTop = view.originY === 1 ? view.img.y - dispH : view.img.y;
    return spriteTop + view.handFraction * dispH;
  }

  // Point a character's gun toward `angle`, holding it at hand height and
  // flipping it upright when it swings to the left half so it never appears
  // upside-down. Renders just above the body.
  private aimGun(view: CharacterView, pos: { x: number; y: number }, angle: number): void {
    const gun = view.gun;
    const handY = this.gunHandY(view);
    gun.setPosition(
      pos.x + Math.cos(angle) * GUN_HAND_OFFSET,
      handY + Math.sin(angle) * GUN_HAND_OFFSET,
    );
    gun.setRotation(angle);
    gun.setFlipY(Math.cos(angle) < 0);
    gun.setDepth(view.img.depth + 1);
    gun.setVisible(true);
  }

  // Queue a muzzle flash at the barrel tip, derived from a shot's from→to
  // direction so it lines up with whichever combatant fired. Anchored to the
  // firer's hand band (via its view) so the flash pops from the gun's muzzle,
  // not the hitbox center.
  private addMuzzle(
    view: CharacterView | undefined,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: number,
    now: number,
  ): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const handY = view ? this.gunHandY(view) : from.y;
    this.muzzles.push({
      x: from.x + (dx / dist) * MUZZLE_DIST,
      y: handY + (dy / dist) * MUZZLE_DIST,
      color,
      bornAt: now,
    });
  }

  private drawMuzzles(now: number): void {
    this.muzzles = this.muzzles.filter((flash) => now - flash.bornAt < MUZZLE_MS);

    for (const flash of this.muzzles) {
      const age = (now - flash.bornAt) / MUZZLE_MS;
      const fade = 1 - age;
      const radius = 2 + 6 * fade;
      this.dynamic.fillStyle(flash.color, 0.9 * fade);
      this.dynamic.fillCircle(flash.x, flash.y, radius);
      this.dynamic.lineStyle(1.5, flash.color, 0.85 * fade);
      this.dynamic.lineBetween(flash.x - radius, flash.y, flash.x + radius, flash.y);
      this.dynamic.lineBetween(flash.x, flash.y - radius, flash.x, flash.y + radius);
    }
  }

  private syncEnemySprites(now: number): void {
    for (const enemy of this.state.enemies) {
      let view = this.enemyViews.get(enemy.id);

      if (!view) {
        view = { ...this.createCharacter('enemy', TEX.enemy), deathPlayed: false };
        this.enemyViews.set(enemy.id, view);
      }

      if (!enemy.alive) {
        view.gun.setVisible(false);
        this.playDeath(view);
        continue;
      }

      const bob = Math.sin(now / 300 + enemy.id * 1.3) * 1;
      view.img.setVisible(true);
      this.positionCharacter(view, enemy.pos, SPLIT_CONFIG.enemy.height, bob);
      view.img.setFlipX(this.state.player.pos.x < enemy.pos.x);

      // Each bot levels its gun at ____.
      const aimAngle = Math.atan2(
        this.state.player.pos.y - enemy.pos.y,
        this.state.player.pos.x - enemy.pos.x,
      );
      this.aimGun(view, enemy.pos, aimAngle);

      const flashUntil = this.enemyFlashUntil.get(enemy.id) ?? 0;
      const telegraphing = enemy.ai === 'telegraphing';

      if (now < flashUntil) {
        view.img.setTintFill(0xffffff);
      } else if (telegraphing && Math.floor(now / 90) % 2 === 0) {
        view.img.setTint(0xffcaca);
      } else {
        view.img.clearTint();
      }
    }
  }

  private playDeath(view: EnemyView): void {
    if (view.deathPlayed) {
      return;
    }

    view.deathPlayed = true;
    view.img.clearTint();
    this.tweens.add({
      targets: view.img,
      alpha: 0,
      duration: DEATH_FADE_MS,
      scaleX: view.img.scaleX * 0.6,
      scaleY: view.img.scaleY * 0.6,
      y: view.img.y + 6,
      onComplete: () => view.img.setVisible(false),
    });
  }

  private spawnSkull(enemyId: number): void {
    const view = this.enemyViews.get(enemyId);

    if (!view || !this.hasArt(ART_KEYS.ui)) {
      return;
    }

    const skull = this.add
      .image(view.img.x, view.img.y - 8, ART_KEYS.ui, 'skull')
      .setDepth(650)
      .setAlpha(0.95);
    this.tweens.add({
      targets: skull,
      alpha: 0,
      duration: 600,
      y: skull.y - 20,
      onComplete: () => skull.destroy(),
    });
  }

  private drawAimLine(player: { x: number; y: number }, now: number): void {
    const angle = Math.atan2(this.pointer.y - player.y, this.pointer.x - player.x);
    const muzzleOn = now < this.muzzleUntil;
    const length = muzzleOn ? 26 : 18;

    this.dynamic.lineStyle(muzzleOn ? 4 : 2, muzzleOn ? 0xfff2a8 : 0x8affc1, muzzleOn ? 0.95 : 0.5);
    this.dynamic.lineBetween(
      player.x,
      player.y,
      player.x + Math.cos(angle) * length,
      player.y + Math.sin(angle) * length,
    );

    if (muzzleOn) {
      this.dynamic.fillStyle(0xfff2a8, 0.9);
      this.dynamic.fillCircle(player.x + Math.cos(angle) * length, player.y + Math.sin(angle) * length, 5);
    }
  }

  private drawTelegraphs(now: number): void {
    for (const enemy of this.state.enemies) {
      if (!enemy.alive || enemy.ai !== 'telegraphing') {
        continue;
      }

      const pulse = 0.4 + Math.abs(Math.sin(now / 120)) * 0.4;
      this.dynamic.lineStyle(2, 0xff6b6b, pulse);
      this.dynamic.lineBetween(enemy.pos.x, enemy.pos.y, this.state.player.pos.x, this.state.player.pos.y);
    }
  }

  private drawTracers(now: number): void {
    this.tracers = this.tracers.filter((tracer) => now - tracer.bornAt < 120);

    for (const tracer of this.tracers) {
      const alpha = 1 - (now - tracer.bornAt) / 120;
      this.dynamic.lineStyle(2, tracer.color, alpha);
      this.dynamic.lineBetween(tracer.from.x, tracer.from.y, tracer.to.x, tracer.to.y);
    }
  }

  private drawSpikeAndDefuse(now: number): void {
    const phase = this.state.phase;

    // Freeze the spike FX during the detonation / death overlays.
    if (phase === 'detonated' || phase === 'dead') {
      return;
    }

    const defusing = this.state.defuse.defusing;
    const progress = defuseProgress(this.state);

    if (phase === 'retake') {
      // Spike beep accelerates as the FUSE burns down (not the defuse): from a
      // slow pulse at full time to a frantic ~90ms near zero. Ducked while
      // defusing so the defuse bed reads clearly over it.
      if (now >= this.nextBeepAt) {
        const frac = spikeTimeRemainingMs(this.state) / SPLIT_CONFIG.spikeTimerMs;
        playAudioSfx('sfx-spike-beep', { volume: defusing ? 0.35 : 1 });
        this.nextBeepAt = now + Math.max(90, 90 + frac * 560);
      }

      if (defusing) {
        // Sustained rising hum, retriggered on a short interval so successive
        // (longer) voices overlap into one continuous bed; its pitch/brightness
        // climb with defuse progress.
        if (now >= this.nextDefuseLoopAt) {
          playAudioSfx('sfx-defuse-loop', { rate: 1 + progress * 0.7, volume: 1 });
          this.nextDefuseLoopAt = now + 300;
        }
        // Faster, louder, climbing ticks layered on top of the hum (was a lone
        // quiet tick every 450ms — that didn't read).
        if (now >= this.nextDefuseTickAt) {
          playAudioSfx('sfx-defuse-tick', { rate: 1 + progress * 0.5, volume: 1 });
          this.nextDefuseTickAt = now + 220;
        }
      } else {
        // Reset cadence so the next hold starts the bed immediately.
        this.nextDefuseLoopAt = now;
        this.nextDefuseTickAt = now;
      }
    }

    if (this.spikeArt) {
      this.spikeSprite.setFrame(defusing ? 'spike-defusing' : 'spike-armed');
    }

    // Pulsing ground glow under the spike: teal while armed, warning red while
    // the defuse is actively advancing.
    const spikePulse = 0.5 + Math.abs(Math.sin(now / (defusing ? 130 : 360))) * 0.5;
    this.spikeSprite.setScale(this.spikeBaseScale * (1 + spikePulse * 0.25));
    this.groundFx.fillStyle(defusing ? 0xff5470 : 0x2ee6c4, 0.18 + spikePulse * 0.2);
    this.groundFx.fillCircle(SPLIT_CONFIG.spike.x, SPLIT_CONFIG.spike.y, 24 + spikePulse * 10);

    // Faint defuse-radius ring so the "get on the spike" zone reads.
    if (phase === 'retake') {
      this.groundFx.lineStyle(1.5, 0x2ee6c4, isInDefuseRadius(this.state) ? 0.5 : 0.22);
      this.groundFx.strokeCircle(
        SPLIT_CONFIG.spike.x,
        SPLIT_CONFIG.spike.y,
        SPLIT_CONFIG.defuse.radius,
      );
    }

    const barWidth = 300;
    const barHeight = 16;
    const barX = ARENA.width / 2 - barWidth / 2;
    const barY = ARENA.height / 2 + 88;

    this.dynamic.fillStyle(0x0c1220, 0.85);
    this.dynamic.fillRoundedRect(barX - 3, barY - 3, barWidth + 6, barHeight + 6, 4);
    this.dynamic.fillStyle(defusing ? 0x8affc1 : 0x2ee6c4, 1);
    this.dynamic.fillRoundedRect(barX, barY, barWidth * progress, barHeight, 3);
    // Half-defuse checkpoint notch.
    this.dynamic.fillStyle(0xffd15c, 1);
    this.dynamic.fillRect(
      barX + barWidth * (SPLIT_CONFIG.defuse.checkpointMs / SPLIT_CONFIG.defuse.totalMs) - 1,
      barY - 3,
      2,
      barHeight + 6,
    );
    this.dynamic.lineStyle(1, 0x8fb7ff, 0.7);
    this.dynamic.strokeRoundedRect(barX, barY, barWidth, barHeight, 3);
  }

  private createHud(): void {
    const barTop = HUD.barBottomY;
    const midY = barTop + HUD.barHeight / 2;
    const uiArt = this.hasArt(ART_KEYS.ui);

    // --- Top strip: fuse medallion (center) + live enemy count (right) ---
    if (uiArt) {
      this.medalImage = this.add
        .image(ARENA.width / 2, 40, ART_KEYS.ui, 'medal')
        .setScale(MEDAL_SCALE)
        .setDepth(808)
        .setScrollFactor(0);
    }

    this.enemiesText = this.add
      .text(ARENA.width - 20, HUD.topStripY + HUD.topStripH / 2, '', {
        color: '#ff9aa8',
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '18px',
        fontStyle: '700',
        stroke: '#0c1220',
        strokeThickness: 4,
      })
      .setOrigin(1, 0.5)
      .setDepth(811)
      .setScrollFactor(0);

    // --- Bottom-left: health number + heart pips ---
    this.add
      .text(24, barTop + 8, 'HEALTH', {
        color: '#7fe9d6',
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '11px',
        fontStyle: '700',
      })
      .setOrigin(0, 0)
      .setDepth(811)
      .setScrollFactor(0);
    this.healthNumberText = this.add
      .text(22, midY + 4, '100', {
        color: '#e9fff8',
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '34px',
        fontStyle: '800',
        stroke: '#0c1220',
        strokeThickness: 5,
      })
      .setOrigin(0, 0.5)
      .setDepth(812)
      .setScrollFactor(0);

    if (uiArt) {
      const max = SPLIT_CONFIG.player.maxHearts;
      for (let i = 0; i < max; i += 1) {
        const heart = this.add
          .image(96 + i * 20, midY + 2, ART_KEYS.ui, 'heartFull')
          .setScale(HEART_SCALE * 0.62)
          .setDepth(812)
          .setScrollFactor(0);
        this.heartImages.push(heart);
      }
    }

    // --- Bottom-right: ammo counter (mag | reserve) + weapon label ---
    this.add
      .text(ARENA.width - 24, barTop + 8, 'PHANTOM', {
        color: '#ffe6a0',
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '11px',
        fontStyle: '700',
      })
      .setOrigin(1, 0)
      .setDepth(811)
      .setScrollFactor(0);
    this.ammoReserveText = this.add
      .text(ARENA.width - 24, midY + 6, '90', {
        color: '#c7b06a',
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '20px',
        fontStyle: '700',
        stroke: '#0c1220',
        strokeThickness: 4,
      })
      .setOrigin(1, 0.5)
      .setDepth(812)
      .setScrollFactor(0);
    this.ammoMagText = this.add
      .text(ARENA.width - 82, midY + 4, '30', {
        color: '#fff4d6',
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '34px',
        fontStyle: '800',
        stroke: '#0c1220',
        strokeThickness: 5,
      })
      .setOrigin(1, 0.5)
      .setDepth(812)
      .setScrollFactor(0);
  }

  private drawHud(): void {
    const player = this.state.player;
    const maxHearts = SPLIT_CONFIG.player.maxHearts;
    const hearts = Math.max(0, player.hearts);
    const graphics = this.hudGraphics;

    graphics.clear();

    // Bottom bar backing.
    const barY = HUD.barBottomY;
    const barH = HUD.barHeight;
    graphics.fillStyle(HUD.panel, 0.82);
    graphics.fillRect(0, barY, ARENA.width, barH);
    graphics.lineStyle(2, HUD.edge, 0.9);
    graphics.lineBetween(0, barY, ARENA.width, barY);
    // Teal accent under the health block, gold under the ammo block.
    graphics.fillStyle(HUD.teal, 0.9);
    graphics.fillRect(0, barY, 4, barH);
    graphics.fillStyle(HUD.gold, 0.9);
    graphics.fillRect(ARENA.width - 4, barY, 4, barH);

    // Top strip backing.
    graphics.fillStyle(HUD.panel, 0.55);
    graphics.fillRect(0, HUD.topStripY, ARENA.width, HUD.topStripH);

    // --- Health ---
    const low = hearts <= 1;
    this.healthNumberText.setText(String(hearts * 25));
    this.healthNumberText.setColor(low ? '#ff5470' : '#e9fff8');
    if (this.heartImages.length > 0) {
      this.heartImages.forEach((img, i) => {
        img.setFrame(i < hearts ? 'heartFull' : 'heartEmpty');
        img.setAlpha(i < hearts ? 1 : 0.4);
      });
    } else {
      // Fallback pips (no ui.png): four small squares by the number.
      for (let i = 0; i < maxHearts; i += 1) {
        graphics.fillStyle(i < hearts ? HUD.red : 0x3a2530, 1);
        graphics.fillRect(92 + i * 16, barY + barH / 2 - 4, 11, 9);
      }
    }

    // --- Ammo ---
    const { magSize } = SPLIT_CONFIG.player;
    const reloading = player.reloadingMs > 0;
    this.ammoMagText.setText(reloading ? '· ·' : String(player.ammoInMag));
    const magEmpty = player.ammoInMag <= 0 && !reloading;
    this.ammoMagText.setColor(magEmpty ? '#ff5470' : reloading ? '#ffd15c' : '#fff4d6');
    this.ammoReserveText.setText(`| ${player.reserveRounds}`);

    // Segmented magazine bar (fills left→right) above the numbers.
    const barW = 150;
    const bx = ARENA.width - 24 - barW;
    const by = barY + 8;
    const segH = 6;
    graphics.fillStyle(0x000000, 0.4);
    graphics.fillRect(bx - 2, by - 2, barW + 4, segH + 4);
    if (reloading) {
      const t = 1 - player.reloadingMs / SPLIT_CONFIG.player.reloadMs;
      graphics.fillStyle(HUD.gold, 0.95);
      graphics.fillRect(bx, by, barW * t, segH);
    } else {
      const frac = player.ammoInMag / magSize;
      const lowAmmo = player.ammoInMag <= magSize * 0.2;
      graphics.fillStyle(lowAmmo ? HUD.red : HUD.gold, 0.95);
      graphics.fillRect(bx, by, barW * frac, segH);
      // Tick marks every 5 rounds.
      graphics.fillStyle(HUD.panel, 0.9);
      for (let r = 5; r < magSize; r += 5) {
        graphics.fillRect(bx + (barW * r) / magSize - 1, by, 2, segH);
      }
    }
    graphics.lineStyle(1, HUD.edge, 0.8);
    graphics.strokeRect(bx, by, barW, segH);

    // --- Enemies remaining (top-right) ---
    this.enemiesText.setText(`ENEMIES ${aliveEnemyCount(this.state)}`);
  }

  private updateStatusText(): void {
    if (this.finalizing) {
      this.statusText.setText('');
      return;
    }

    if (this.state.phase === 'detonated') {
      this.statusText.setText('The spike went off — resetting. Run it back.');
      return;
    }

    if (this.state.phase === 'dead') {
      this.statusText.setText('You went down — restarting the retake from the top.');
      return;
    }

    // The input mapping lives in the standard controls strip beneath the
    // viewport; the in-arena line stays diegetic — just the live objective.
    const enemies = aliveEnemyCount(this.state);
    this.statusText.setText(
      enemies > 0
        ? `${enemies} ${enemies === 1 ? 'enemy' : 'enemies'} still up — clear the site, then take the spike.`
        : 'Site clear — get on the spike and hold it.',
    );
  }

  // The prominent top-center fuse countdown. Reuses the gold medallion as a
  // backdrop; turns red and blinks under 15s.
  private updateTimerText(now: number): void {
    if (this.finalizing || this.state.phase === 'won') {
      this.roundText.setText('');
      this.medalImage?.setVisible(false);
      return;
    }

    if (this.state.phase === 'detonated') {
      this.roundText.setText('0');
      this.roundText.setColor('#ff5470');
      this.medalImage?.setVisible(true);
      return;
    }

    if (this.state.phase === 'dead') {
      this.roundText.setText(String(Math.ceil(spikeTimeRemainingMs(this.state) / 1000)));
      this.roundText.setColor('#ff5470');
      this.medalImage?.setVisible(true);
      return;
    }

    const remaining = spikeTimeRemainingMs(this.state);
    this.roundText.setText(String(Math.ceil(remaining / 1000)));
    const low = remaining <= 15000;
    const blink = low && Math.floor(now / 300) % 2 === 0;
    this.roundText.setColor(low && !blink ? '#ff5470' : '#ffd15c');
    this.medalImage?.setVisible(true);
  }

  private updatePrompt(): void {
    const show = this.state.phase === 'retake' && !this.finalizing && isInDefuseRadius(this.state);
    this.promptText.setVisible(show);

    if (!show) {
      return;
    }

    this.promptText.setText(this.state.defuse.defusing ? 'DEFUSING…' : 'HOLD 4 TO DEFUSE');

    if (!this.onSiteBarked) {
      this.onSiteBarked = true;
      this.showBark(BARKS.onSite);
    }
  }

  private showWarn(text: string): void {
    this.warnText.setText(text).setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.warnText);
    this.tweens.add({
      targets: this.warnText,
      alpha: 0,
      delay: 1000,
      duration: 500,
      onComplete: () => this.warnText.setVisible(false),
    });
  }

  // ------------------------------------------------------------------
  // Barks / popups
  // ------------------------------------------------------------------

  private showBark(text: string): void {
    const pos = this.state.teammate.pos;
    this.barkText.setText(text);
    this.barkText.setPosition(
      Phaser.Math.Clamp(pos.x, 160, ARENA.width - 160),
      Math.max(52, pos.y - 30),
    );
    this.barkText.setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.barkText);
    this.tweens.add({
      targets: this.barkText,
      alpha: 0,
      delay: 2600,
      duration: 500,
      onComplete: () => this.barkText.setVisible(false),
    });
  }

  private showPopup(text: string, color: string): void {
    this.popupText.setText(text).setColor(color).setVisible(true).setAlpha(1).setScale(1);
    this.tweens.killTweensOf(this.popupText);
    this.tweens.add({
      targets: this.popupText,
      alpha: 0,
      scale: 1.3,
      delay: 500,
      duration: 500,
      onComplete: () => this.popupText.setVisible(false),
    });
  }

  // ------------------------------------------------------------------
  // Finale
  // ------------------------------------------------------------------

  private finalize(): void {
    if (this.finalizing) {
      return;
    }

    this.finalizing = true;
    this.input.setDefaultCursor('default');
    this.crosshair.setVisible(false);
    this.promptText.setVisible(false);
    this.warnText.setVisible(false);
    this.showBark(BARKS.clutch);
    this.showPopup('CLUTCH.', '#2ee6c4');
    this.cameras.main.flash(400, 46, 230, 196);
    this.playSfx('clutch');
    this.time.delayedCall(CLUTCH_DELAY_MS, () => this.complete());
  }

  private complete(): void {
    if (this.callbackDelivered) {
      return;
    }

    this.callbackDelivered = true;
    this.callbacks.onComplete();
  }

  private cancel(): void {
    if (this.callbackDelivered) {
      return;
    }

    this.callbackDelivered = true;
    this.input.setDefaultCursor('default');
    this.callbacks.onCancel();
  }

  private playSfx(key: SfxEvent): void {
    playAudioSfx(SFX_BY_EVENT[key]);
  }

  // ------------------------------------------------------------------
  // Real-art wiring. Frames are carved out of the loaded sheets; every art
  // consumer checks hasArt() and falls back to the generated placeholder
  // textures below when a file failed to load.
  // ------------------------------------------------------------------

  private hasArt(key: string): boolean {
    return this.textures.exists(key);
  }

  private registerArtFrames(): void {
    this.addFrames(ART_KEYS.props, PROP_FRAMES);
    this.addFrames(ART_KEYS.ui, UI_FRAMES);
    this.addFrames(ART_KEYS.spike, {
      'spike-armed': SPIKE_FRAMES.armed,
      'spike-defusing': SPIKE_FRAMES.defusing,
    });
  }

  private addFrames(key: string, frames: Readonly<Record<string, ArtFrame>>): void {
    if (!this.hasArt(key)) {
      return;
    }

    const texture = this.textures.get(key);

    for (const [name, frame] of Object.entries(frames)) {
      if (!texture.has(name)) {
        texture.add(name, 0, frame.x, frame.y, frame.width, frame.height);
      }
    }
  }

  private createCharacter(
    role: keyof typeof CHARACTER_ART,
    placeholderKey: string,
  ): CharacterView {
    const spec = CHARACTER_ART[role];
    const art = this.hasArt(spec.key);
    const img = this.add.image(0, 0, art ? spec.key : placeholderKey);

    img.setOrigin(0.5, spec.originY);

    if (art) {
      img.setScale(spec.scale);
    }

    // The held weapon: origin at the grip so it pivots around the hand and the
    // barrel swings out toward the aim direction. A dropped-in gun.png wins;
    // otherwise the generated Vandal-silhouette rifle is used. Either is team-
    // tinted via GUN_TINT.
    const gunArt = this.hasArt(ART_KEYS.gun);
    const gun = this.add
      .image(0, 0, gunArt ? ART_KEYS.gun : GUN_TEX)
      .setOrigin(gunArt ? GUN_ART_ORIGIN_X : GUN_GRIP_ORIGIN_X, 0.5)
      .setScale(gunArt ? GUN_ART_SCALE : GUN_SCALE)
      .setVisible(false);

    // Only the procedural silhouette is team-tinted; a dropped-in gun.png is
    // shown at its own colors (a full multiply tint would fight painted art).
    // Team identity is carried by the character sprite, not the weapon.
    if (!gunArt) {
      gun.setTint(GUN_TINT[role]);
    }

    return {
      img,
      gun,
      art,
      offsetY: art ? spec.offsetY : 0,
      originY: spec.originY,
      handFraction: spec.handFraction,
    };
  }

  private createSpike(): void {
    this.spikeArt = this.hasArt(ART_KEYS.spike);
    this.spikeBaseScale = this.spikeArt ? SPIKE_BASE_SCALE : 1;
    this.spikeSprite = this.add
      .image(
        SPLIT_CONFIG.spike.x,
        SPLIT_CONFIG.spike.y,
        this.spikeArt ? ART_KEYS.spike : TEX.spike,
        this.spikeArt ? 'spike-armed' : undefined,
      )
      .setScale(this.spikeBaseScale)
      .setDepth(60)
      .setVisible(true);
  }

  // ------------------------------------------------------------------
  // Placeholder textures (colored shapes, like createTempTextures.ts)
  // ------------------------------------------------------------------

  private generateTextures(): void {
    this.makeTexture(TEX.floor, 40, 40, (g) => {
      g.fillStyle(0x1b2029, 1);
      g.fillRect(0, 0, 40, 40);
      g.lineStyle(1, 0x252c38, 0.8);
      g.strokeRect(0, 0, 40, 40);
    });
    this.makeUprightBody(TEX.player, 0x2fae6b, 0x8affc1);
    this.makeUprightBody(TEX.teammate, 0x5a4fae, 0xb7a7ff);
    this.makeEnemy();
    this.makeGun();
    this.makeTexture(TEX.spike, 30, 30, (g) => {
      g.fillStyle(0x3a4250, 1);
      g.fillRoundedRect(2, 2, 26, 26, 5);
      g.fillStyle(0x2ee6c4, 1);
      g.fillCircle(15, 15, 7);
      g.fillStyle(0xd9fff6, 1);
      g.fillCircle(15, 15, 3);
    });
    this.makeTexture(TEX.crosshair, 26, 26, (g) => {
      g.lineStyle(2, 0x8affc1, 0.95);
      g.strokeCircle(13, 13, 8);
      g.lineBetween(13, 0, 13, 6);
      g.lineBetween(13, 20, 13, 26);
      g.lineBetween(0, 13, 6, 13);
      g.lineBetween(20, 13, 26, 13);
    });
    this.makeTexture(TEX.cover, 1, 1, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 1, 1);
    });
  }

  private makeUprightBody(key: string, body: number, accent: number): void {
    const { width, height } = SPLIT_CONFIG.player;
    this.makeTexture(key, width, height, (g) => {
      g.fillStyle(body, 1);
      g.fillRoundedRect(1, 1, width - 2, height - 2, 6);
      g.fillStyle(accent, 1);
      g.fillCircle(width / 2, height * 0.24, width * 0.28);
      g.lineStyle(2, 0x101418, 0.85);
      g.strokeRoundedRect(1, 1, width - 2, height - 2, 6);
    });
  }

  // A Vandal-silhouette rifle drawn barrel-right: rear stock, boxy receiver, an
  // angled trigger grip (the pivot/hand), a box magazine below mid-body, a
  // slim foregrip, a long barrel, front sight, and a bright muzzle tip. Sized
  // ~34x14 so it reads as a long gun at gameplay scale; tinted per team by the
  // character view. GUN_GRIP_ORIGIN_X pins the pivot on the grip.
  private makeGun(): void {
    const body = 0x3c424e;
    const metal = 0x2b3038;
    const dark = 0x24282f;
    const tip = 0xc8d0da;

    this.makeTexture(GUN_TEX, 34, 14, (g) => {
      // Rear stock.
      g.fillStyle(metal, 1);
      g.fillRect(0, 5, 8, 6);
      g.fillRect(1, 4, 6, 1);

      // Receiver / body.
      g.fillStyle(body, 1);
      g.fillRect(6, 4, 15, 5);

      // Trigger grip (angled down) — the hand / pivot.
      g.fillStyle(metal, 1);
      g.fillRect(9, 8, 4, 5);

      // Box magazine, leaning slightly forward.
      g.fillStyle(dark, 1);
      g.fillRect(13, 8, 5, 6);
      g.fillRect(15, 12, 4, 2);

      // Long barrel.
      g.fillStyle(body, 1);
      g.fillRect(20, 5, 11, 3);

      // Slim foregrip nub.
      g.fillStyle(metal, 1);
      g.fillRect(22, 8, 2, 3);

      // Front sight post.
      g.fillRect(27, 3, 2, 2);

      // Bright muzzle / flash hider so the barrel end reads.
      g.fillStyle(tip, 1);
      g.fillRect(31, 4, 3, 4);

      // Dark outline for the low-bit pop.
      g.lineStyle(1, 0x11151b, 0.9);
      g.strokeRect(6, 4, 15, 5);
      g.strokeRect(20, 5, 11, 3);
    });
  }

  private makeEnemy(): void {
    const { width, height, headFraction } = SPLIT_CONFIG.enemy;
    this.makeTexture(TEX.enemy, width, height, (g) => {
      g.fillStyle(0x6a707c, 1);
      g.fillRoundedRect(1, 1, width - 2, height - 2, 6);
      // Head band (top headFraction) painted red so the headshot zone reads.
      g.fillStyle(0xd6394f, 1);
      g.fillRect(1, 1, width - 2, Math.max(4, height * headFraction));
      g.lineStyle(2, 0x101418, 0.85);
      g.strokeRoundedRect(1, 1, width - 2, height - 2, 6);
    });
  }

  private makeTexture(
    key: string,
    width: number,
    height: number,
    draw: (graphics: Phaser.GameObjects.Graphics) => void,
  ): void {
    if (this.textures.exists(key)) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    draw(graphics);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }

  private drawStaticArena(): void {
    if (this.hasArt(ART_KEYS.floor)) {
      // 1280x720 art over a 960x540 arena: exact 0.75 uniform scale, so the
      // baked walls line up with the model's playable box (see SPLIT_CONFIG).
      this.add
        .image(0, 0, ART_KEYS.floor)
        .setOrigin(0)
        .setDisplaySize(ARENA.width, ARENA.height)
        .setDepth(-10);
    } else {
      this.add
        .tileSprite(0, 0, ARENA.width, ARENA.height, TEX.floor)
        .setOrigin(0)
        .setDepth(-10);

      // Wall bands drawn out to the playable box (asymmetric via arena.x/y).
      const t = SPLIT_CONFIG.wallThickness;
      const left = ARENA.x + t;
      const top = ARENA.y + t;
      const right = ARENA.x + ARENA.width - t;
      const bottom = ARENA.y + ARENA.height - t;
      const walls = this.add.graphics().setDepth(-5);
      walls.fillStyle(0x2b3240, 1);
      walls.fillRect(0, 0, ARENA.width, top);
      walls.fillRect(0, bottom, ARENA.width, ARENA.height - bottom);
      walls.fillRect(0, 0, left, ARENA.height);
      walls.fillRect(right, 0, ARENA.width - right, ARENA.height);
    }

    this.drawCoverProps();
  }

  private drawCoverProps(): void {
    const propsArt = this.hasArt(ART_KEYS.props);
    const fallback = propsArt ? null : this.add.graphics().setDepth(5);

    SPLIT_CONFIG.cover.forEach((rect, index) => {
      const frameName = COVER_PROP_ORDER[index % COVER_PROP_ORDER.length];
      const frame = PROP_FRAMES[frameName];

      if (propsArt && frame) {
        // The rect stays the collision truth; the prop sprite is bottom-
        // anchored on it with a small overhang past the sides and top.
        const scale = (rect.width * COVER_OVERHANG) / frame.width;
        this.add
          .image(rect.x + rect.width / 2, rect.y + rect.height + 3, ART_KEYS.props, frameName)
          .setOrigin(0.5, 1)
          .setScale(scale)
          .setDepth(rect.y + rect.height);
        return;
      }

      if (fallback) {
        fallback.fillStyle(0x39424f, 1);
        fallback.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 6);
        fallback.lineStyle(2, 0x1d2530, 0.9);
        fallback.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 6);
        fallback.fillStyle(0x4a5563, 1);
        fallback.fillRect(rect.x + 6, rect.y + 6, rect.width - 12, 6);
      }
    });
  }
}

// Exposed for potential external rendering helpers/tests.
export function enemyBodyRect(enemy: EnemyState): { x: number; y: number; width: number; height: number } {
  return enemyRect(enemy);
}
