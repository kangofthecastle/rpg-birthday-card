import Phaser from 'phaser';
import {
  SPLIT_CONFIG,
  aliveEnemyCount,
  createSplitState,
  defuseProgress,
  enemyRect,
  isSplitWon,
  tickSplit,
  type EnemyState,
  type SplitEvent,
  type SplitInput,
  type SplitState,
} from './splitModel';

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

// ____-voice comms barks. Warm, personal, Valorant-flavored — the teammate is
// ____, the player is ____, and this is a birthday gift.
const BARKS = {
  roundStart: "Comms up. I've got B with you, ____ — like always.",
  firstBlood: "That's the one. Knew you'd pop off.",
  revive: "I've got you. Get up — we're not done.",
  spike: "I've got your back. Seven seconds. You've got this.",
  clutch: "That's my duelist. Clutch.",
} as const;

interface Tracer {
  readonly from: { x: number; y: number };
  readonly to: { x: number; y: number };
  readonly color: number;
  readonly bornAt: number;
}

export class SplitScene extends Phaser.Scene {
  private readonly callbacks: SplitSceneCallbacks;
  private state: SplitState = createSplitState(Date.now() % 1_000_000);
  private finalizing = false;
  private callbackDelivered = false;

  private keys?: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    e: Phaser.Input.Keyboard.Key;
    escape: Phaser.Input.Keyboard.Key;
  };

  private firePressed = false;
  private pointer = { x: ARENA.width / 2, y: ARENA.height / 2 };

  private dynamic!: Phaser.GameObjects.Graphics;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private crosshair!: Phaser.GameObjects.Image;
  private playerSprite!: Phaser.GameObjects.Image;
  private teammateSprite!: Phaser.GameObjects.Image;
  private spikeSprite!: Phaser.GameObjects.Image;
  private enemySprites = new Map<number, Phaser.GameObjects.Image>();
  private roundText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private barkText!: Phaser.GameObjects.Text;
  private popupText!: Phaser.GameObjects.Text;

  private tracers: Tracer[] = [];
  private muzzleUntil = 0;
  private nextBeepAt = 0;

  constructor(callbacks: SplitSceneCallbacks = DEFAULT_CALLBACKS) {
    super('SplitScene');
    this.callbacks = callbacks;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#14171d');
    this.generateTextures();
    this.drawStaticArena();

    this.playerSprite = this.add.image(0, 0, TEX.player).setDepth(20);
    this.teammateSprite = this.add.image(0, 0, TEX.teammate).setDepth(19);
    this.spikeSprite = this.add
      .image(SPLIT_CONFIG.spike.x, SPLIT_CONFIG.spike.y, TEX.spike)
      .setDepth(8)
      .setVisible(false);

    this.dynamic = this.add.graphics().setDepth(30);
    this.hudGraphics = this.add.graphics().setDepth(40).setScrollFactor(0);

    this.roundText = this.add
      .text(ARENA.width / 2, 16, '1', {
        color: '#ffd15c',
        fontFamily: 'Arial, sans-serif',
        fontSize: '30px',
        fontStyle: '700',
        stroke: '#141414',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0)
      .setDepth(41);
    this.statusText = this.add
      .text(ARENA.width / 2, ARENA.height - 34, '', {
        align: 'center',
        color: '#e6f2ff',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        stroke: '#141414',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(41);
    this.barkText = this.add
      .text(0, 0, '', {
        align: 'center',
        backgroundColor: '#20304aee',
        color: '#dfe9ff',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        padding: { x: 8, y: 5 },
        stroke: '#0c1220',
        strokeThickness: 2,
        wordWrap: { width: 220 },
      })
      .setOrigin(0.5, 1)
      .setDepth(45)
      .setVisible(false);
    this.popupText = this.add
      .text(ARENA.width / 2, ARENA.height / 2 - 40, '', {
        align: 'center',
        color: '#ff5470',
        fontFamily: 'Arial, sans-serif',
        fontSize: '40px',
        fontStyle: '800',
        stroke: '#141414',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(46)
      .setVisible(false);

    this.crosshair = this.add.image(this.pointer.x, this.pointer.y, TEX.crosshair).setDepth(50);

    this.createInput();
    this.showBark(BARKS.roundStart);
  }

  update(_time: number, delta: number): void {
    if (this.keys && Phaser.Input.Keyboard.JustDown(this.keys.escape) && !this.finalizing) {
      this.cancel();
      return;
    }

    const now = this.time.now;

    if (!this.finalizing) {
      const input = this.readInput();
      this.state = tickSplit(this.state, input, delta);
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
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.keys = {
        up: keyboard.addKey(K.UP),
        down: keyboard.addKey(K.DOWN),
        left: keyboard.addKey(K.LEFT),
        right: keyboard.addKey(K.RIGHT),
        w: keyboard.addKey(K.W),
        a: keyboard.addKey(K.A),
        s: keyboard.addKey(K.S),
        d: keyboard.addKey(K.D),
        e: keyboard.addKey(K.E, false),
        escape: keyboard.addKey(K.ESC),
      };
      keyboard.removeCapture([K.W, K.A, K.S, K.D, K.E]);
    }

    this.input.setDefaultCursor('none');
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.pointer = { x: pointer.worldX, y: pointer.worldY };
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointer = { x: pointer.worldX, y: pointer.worldY };
      this.firePressed = true;
    });
  }

  private readInput(): SplitInput {
    const keys = this.keys;
    let x = 0;
    let y = 0;

    if (keys) {
      if (keys.left.isDown || keys.a.isDown) x -= 1;
      if (keys.right.isDown || keys.d.isDown) x += 1;
      if (keys.up.isDown || keys.w.isDown) y -= 1;
      if (keys.down.isDown || keys.s.isDown) y += 1;
    }

    const player = this.state.player.pos;
    const aimAngle = Math.atan2(this.pointer.y - player.y, this.pointer.x - player.x);
    const holdDefuse = Boolean(keys?.e.isDown) && this.state.phase === 'defuse';

    return { move: { x, y }, aimAngle, fire: this.firePressed, holdDefuse };
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
          this.playSfx('shot');
          if (event.headshot) {
            this.showPopup('HEADSHOT', '#ff5470');
          }
          break;
        case 'teammate-shot':
          this.tracers.push({ from: event.from, to: event.to, color: 0x9a7bff, bornAt: now });
          break;
        case 'enemy-shot':
          this.tracers.push({ from: event.from, to: event.to, color: 0xff6b6b, bornAt: now });
          break;
        case 'heart-lost':
          this.playSfx('heart');
          this.cameras.main.shake(120, 0.006);
          break;
        case 'revive':
          this.showBark(BARKS.revive);
          this.cameras.main.flash(220, 120, 170, 255);
          break;
        case 'first-blood':
          this.showBark(BARKS.firstBlood);
          break;
        case 'spike-active':
          this.showBark(BARKS.spike);
          this.spikeSprite.setVisible(true);
          this.nextBeepAt = now;
          break;
        case 'defuse-complete':
          break;
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  private render(now: number): void {
    const { player, teammate } = this.state;

    this.playerSprite.setPosition(player.pos.x, player.pos.y);
    this.playerSprite.setAlpha(player.invulnMs > 0 ? 0.55 + Math.sin(now / 80) * 0.2 : 1);
    this.teammateSprite.setPosition(teammate.pos.x, teammate.pos.y);
    this.syncEnemySprites(now);

    this.dynamic.clear();
    this.drawAimLine(player.pos, now);
    this.drawTelegraphs(now);
    this.drawTracers(now);
    this.drawDefuse(now);
    this.drawHud();

    this.crosshair.setPosition(this.pointer.x, this.pointer.y);
    this.updateStatusText();
  }

  private syncEnemySprites(now: number): void {
    for (const enemy of this.state.enemies) {
      let sprite = this.enemySprites.get(enemy.id);

      if (!sprite) {
        sprite = this.add.image(enemy.pos.x, enemy.pos.y, TEX.enemy).setDepth(15);
        this.enemySprites.set(enemy.id, sprite);
      }

      if (!enemy.alive) {
        sprite.setVisible(false);
        continue;
      }

      const telegraphing = enemy.ai === 'telegraphing';
      sprite.setVisible(true);
      sprite.setPosition(enemy.pos.x, enemy.pos.y);
      sprite.setTint(telegraphing && Math.floor(now / 90) % 2 === 0 ? 0xffcaca : 0xffffff);
    }
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

  private drawDefuse(now: number): void {
    if (this.state.phase !== 'defuse' && this.state.phase !== 'won') {
      return;
    }

    // Accelerando beep: interval shrinks as the defuse nears completion.
    const progress = defuseProgress(this.state);
    if (this.state.phase === 'defuse' && now >= this.nextBeepAt) {
      this.playSfx('beep');
      this.nextBeepAt = now + Math.max(90, 520 - progress * 420);
    }

    const spikePulse = 0.5 + Math.abs(Math.sin(now / (this.state.phase === 'defuse' ? 130 : 400))) * 0.5;
    this.spikeSprite.setScale(1 + spikePulse * 0.25);
    this.dynamic.fillStyle(0x2ee6c4, 0.18 + spikePulse * 0.2);
    this.dynamic.fillCircle(SPLIT_CONFIG.spike.x, SPLIT_CONFIG.spike.y, 22 + spikePulse * 10);

    const barWidth = 220;
    const barHeight = 14;
    const barX = ARENA.width / 2 - barWidth / 2;
    const barY = ARENA.height / 2 + 40;

    this.dynamic.fillStyle(0x0c1220, 0.85);
    this.dynamic.fillRoundedRect(barX - 3, barY - 3, barWidth + 6, barHeight + 6, 4);
    this.dynamic.fillStyle(0x2ee6c4, 1);
    this.dynamic.fillRoundedRect(barX, barY, barWidth * progress, barHeight, 3);
    // Half-defuse checkpoint marker.
    this.dynamic.fillStyle(0xffd15c, 1);
    this.dynamic.fillRect(barX + barWidth / 2 - 1, barY - 3, 2, barHeight + 6);
    this.dynamic.lineStyle(1, 0x8fb7ff, 0.7);
    this.dynamic.strokeRoundedRect(barX, barY, barWidth, barHeight, 3);
  }

  private drawHud(): void {
    const graphics = this.hudGraphics;
    graphics.clear();

    const hearts = this.state.player.hearts;
    const max = SPLIT_CONFIG.player.maxHearts;

    for (let i = 0; i < max; i += 1) {
      const x = 20 + i * 26;
      const y = 22;
      const filled = i < hearts;
      graphics.fillStyle(filled ? 0xff5470 : 0x3a2530, 1);
      this.fillHeart(graphics, x, y, 9);
      graphics.lineStyle(2, 0x141414, 0.6);
    }
  }

  private fillHeart(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
    graphics.fillCircle(x - size / 3, y, size / 2);
    graphics.fillCircle(x + size / 3, y, size / 2);
    graphics.fillTriangle(x - size / 1.4, y, x + size / 1.4, y, x, y + size);
  }

  private updateStatusText(): void {
    if (this.finalizing) {
      this.statusText.setText('');
      return;
    }

    if (this.state.phase === 'defuse') {
      this.statusText.setText('THE SPIKE IS ACTIVE — hold E on the spike to defuse. Esc leaves.');
      this.roundText.setText('DEFUSE');
      return;
    }

    this.statusText.setText(
      `WASD to move, aim with the mouse, click to fire. ${aliveEnemyCount(this.state)} left. Esc leaves.`,
    );
  }

  // ------------------------------------------------------------------
  // Barks / popups
  // ------------------------------------------------------------------

  private showBark(text: string): void {
    const pos = this.state.teammate.pos;
    this.barkText.setText(text);
    this.barkText.setPosition(
      Phaser.Math.Clamp(pos.x, 120, ARENA.width - 120),
      Math.max(40, pos.y - 26),
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

  // Audio hooks are no-op stubs; a real audio manager swaps in later.
  private playSfx(_key: 'shot' | 'heart' | 'beep' | 'clutch'): void {
    // intentionally empty
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
    const floor = this.add.tileSprite(0, 0, ARENA.width, ARENA.height, TEX.floor).setOrigin(0).setDepth(-10);
    floor.setActive(true);

    const walls = this.add.graphics().setDepth(-5);
    const t = SPLIT_CONFIG.wallThickness;
    walls.fillStyle(0x2b3240, 1);
    walls.fillRect(0, 0, ARENA.width, t);
    walls.fillRect(0, ARENA.height - t, ARENA.width, t);
    walls.fillRect(0, 0, t, ARENA.height);
    walls.fillRect(ARENA.width - t, 0, t, ARENA.height);

    const cover = this.add.graphics().setDepth(5);
    for (const rect of SPLIT_CONFIG.cover) {
      cover.fillStyle(0x39424f, 1);
      cover.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 6);
      cover.lineStyle(2, 0x1d2530, 0.9);
      cover.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 6);
      cover.fillStyle(0x4a5563, 1);
      cover.fillRect(rect.x + 6, rect.y + 6, rect.width - 12, 6);
    }
  }
}

// Exposed for potential external rendering helpers/tests.
export function enemyBodyRect(enemy: EnemyState): { x: number; y: number; width: number; height: number } {
  return enemyRect(enemy);
}
