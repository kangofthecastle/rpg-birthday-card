import Phaser from 'phaser';
import { RECIPIENT_SPRITE } from '../assets/recipientSpriteConfig';
import { LOCATIONS } from '../content/locations';
import { createTempTextures } from '../game/createTempTextures';
import {
  createSeededRunState,
  REQUIRED_FINAL_KEEPSAKE_IDS,
  type RunState,
} from '../game/runState';
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

    // Room-dressing art (floor/wall tiles + prop sheet) for dressed locations.
    this.load.spritesheet('recipient-room-tiles', '/assets/tiles/recipient-room-tiles.png', {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.image('recipient-room-props', '/assets/props/recipient-room-props.png');
  }

  create(): void {
    createTempTextures(this);

    const params = new URLSearchParams(window.location.search);
    const testMode = params.get('testMode') === '1';
    const locationId = testMode ? params.get('locationId') ?? 'recipient-house' : 'recipient-house';
    const spawnId = testMode ? params.get('spawnId') ?? 'front-door' : 'front-door';

    // testMode-only: seed collected keepsakes so a smoke can start from a
    // realistic mid/late-run state (e.g. the clearing already unlocked).
    const seedParam = testMode ? params.get('seedKeepsakes') : null;
    let state: RunState | undefined;
    if (seedParam) {
      const ids =
        seedParam === 'all'
          ? REQUIRED_FINAL_KEEPSAKE_IDS
          : seedParam.split(',').map((id) => id.trim()).filter(Boolean);
      state = createSeededRunState(locationId, ids);
    }

    this.scene.start(SceneKeys.Location, {
      locationId,
      spawnId,
      state,
    });
  }
}
