import Phaser from 'phaser';
import { LOCATIONS } from '../content/locations';
import { createTempTextures } from '../game/createTempTextures';
import { SceneKeys } from './sceneKeys';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  preload(): void {
    this.load.spritesheet(
      'recipient-walk-4dir',
      '/assets/sprites/characters/recipient-walk-4dir-v1-alpha.png',
      {
        frameWidth: 256,
        frameHeight: 256,
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
