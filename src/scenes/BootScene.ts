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
import {
  EXTERIOR_ASSET_NAMES,
  EXTERIOR_SOURCE_HEIGHT,
  EXTERIOR_SOURCE_WIDTH,
  exteriorTextureKey,
} from '../content/outdoorScenery';
import { isImageUrl } from '../game/assetProbe';

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
    // Resolve house exteriors (PNG-preferred, SVG fallback) before entering the
    // world, so an outdoor scene always has its textures ready.
    void this.loadExteriors().then(() => this.startWorld());
  }

  // House exteriors: prefer a Codex-generated PNG, fall back to the hand-authored
  // placeholder SVG. Probing existence up front (rather than letting a missing
  // PNG error in the loader) keeps the console clean; dropping a <name>.png into
  // public/assets/exteriors/ later is picked up with zero code changes.
  private async loadExteriors(): Promise<void> {
    const resolved = await Promise.all(
      EXTERIOR_ASSET_NAMES.map(async (name) => {
        const png = `/assets/exteriors/${name}.png`;
        const usePng = await isImageUrl(png);
        return { name, url: usePng ? png : `/assets/exteriors/${name}.svg` };
      }),
    );

    await new Promise<void>((resolve) => {
      for (const { name, url } of resolved) {
        const key = exteriorTextureKey(name);
        if (url.endsWith('.svg')) {
          this.load.svg(key, url, {
            width: EXTERIOR_SOURCE_WIDTH,
            height: EXTERIOR_SOURCE_HEIGHT,
          });
        } else {
          this.load.image(key, url);
        }
      }
      this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      this.load.start();
    });
  }

  private startWorld(): void {
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
