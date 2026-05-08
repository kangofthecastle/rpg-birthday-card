import Phaser from 'phaser';

type Direction = 'up' | 'down' | 'left' | 'right';

export class PlayerController {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly wasd: Record<Direction, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene, private readonly sprite: Phaser.Physics.Arcade.Sprite) {
    const keyboard = scene.input.keyboard;

    if (!keyboard) {
      throw new Error('Keyboard input is unavailable');
    }

    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<Direction, Phaser.Input.Keyboard.Key>;
  }

  update(canMove: boolean): void {
    if (!canMove) {
      this.sprite.setVelocity(0, 0);
      return;
    }

    const x = Number(this.isDown('right')) - Number(this.isDown('left'));
    const y = Number(this.isDown('down')) - Number(this.isDown('up'));
    const velocity = new Phaser.Math.Vector2(x, y);

    if (velocity.lengthSq() > 0) {
      velocity.normalize().scale(220);
    }

    this.sprite.setVelocity(velocity.x, velocity.y);
  }

  private isDown(direction: Direction): boolean {
    return Boolean(this.cursors[direction]?.isDown || this.wasd[direction].isDown);
  }
}
