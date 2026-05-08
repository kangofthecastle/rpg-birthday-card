import Phaser from 'phaser';
import { RECIPIENT_SPRITE } from '../assets/recipientSpriteConfig';
import { LOCATIONS } from '../content/locations';
import { createTempTextures } from '../game/createTempTextures';
import { SceneKeys } from './sceneKeys';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  preload(): void {
    this.load.spritesheet(
      RECIPIENT_SPRITE.key,
      RECIPIENT_SPRITE.url,
      {
        frameWidth: RECIPIENT_SPRITE.frameWidth,
        frameHeight: RECIPIENT_SPRITE.frameHeight,
      },
    );

    for (const location of LOCATIONS) {
      this.load.tilemapTiledJSON(location.mapKey, location.mapUrl);
    }
  }

  create(): void {
    createTempTextures(this);
    this.scene.start(SceneKeys.Location, {
      locationId: 'entry',
      spawnId: 'start',
    });
  }
}
