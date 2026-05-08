import Phaser from 'phaser';
import { LOCATIONS } from '../content/locations';
import { createTempTextures } from '../game/createTempTextures';
import { SceneKeys } from './sceneKeys';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  preload(): void {
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
