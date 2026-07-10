import Phaser from 'phaser';
import {
  projectScreenDirectionToIsoVelocity,
  type IsoOrigin,
} from './isometricProjection';
import type { PlayerFacing } from '../assets/recipientSpriteConfig';

type Direction = 'up' | 'down' | 'left' | 'right';

interface PlayerControllerOptions {
  readonly movementProjection?: IsoOrigin;
  readonly speed?: number;
}

// Bumped ~14% (220 -> 250) as part of the outdoor-pacing pass: the smaller
// connected outdoor pockets read best with a slightly brisker walk, and the
// modest bump still feels right in the (smaller) iso interiors.
const DEFAULT_PLAYER_SPEED = 250;
const MIN_FACING_MOVEMENT_LENGTH_SQ = 1;
const EIGHT_WAY_FACING_SECTORS: readonly PlayerFacing[] = [
  'right',
  'down-right',
  'down',
  'down-left',
  'left',
  'up-left',
  'up',
  'up-right',
];

interface ScreenMovement {
  readonly x: number;
  readonly y: number;
}

export function getPlayerFacingFromScreenMovement(
  movement: ScreenMovement,
  previousFacing: PlayerFacing = 'down',
): PlayerFacing {
  if (movement.x * movement.x + movement.y * movement.y < MIN_FACING_MOVEMENT_LENGTH_SQ) {
    return previousFacing;
  }

  const radians = Math.atan2(movement.y, movement.x);
  const normalizedDegrees = ((radians * 180) / Math.PI + 360) % 360;
  const sectorIndex = Math.round(normalizedDegrees / 45) % EIGHT_WAY_FACING_SECTORS.length;

  return EIGHT_WAY_FACING_SECTORS[sectorIndex];
}

export class PlayerController {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly wasd: Record<Direction, Phaser.Input.Keyboard.Key>;

  constructor(
    scene: Phaser.Scene,
    private readonly sprite: Phaser.Physics.Arcade.Sprite,
    private readonly options: PlayerControllerOptions = {},
  ) {
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
    const speed = this.options.speed ?? DEFAULT_PLAYER_SPEED;

    if (velocity.lengthSq() === 0) {
      this.sprite.setVelocity(0, 0);
      return;
    }

    if (this.options.movementProjection) {
      const projectedVelocity = projectScreenDirectionToIsoVelocity(
        velocity,
        this.options.movementProjection,
        speed,
      );
      this.sprite.setVelocity(projectedVelocity.x, projectedVelocity.y);
      return;
    }

    velocity.normalize().scale(speed);
    this.sprite.setVelocity(velocity.x, velocity.y);
  }

  private isDown(direction: Direction): boolean {
    return Boolean(this.cursors[direction]?.isDown || this.wasd[direction].isDown);
  }
}
