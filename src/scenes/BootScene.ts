import Phaser from 'phaser';
import { RECIPIENT_SPRITE } from '../assets/recipientSpriteConfig';
import { LOCATIONS } from '../content/locations';
import { createTempTextures } from '../game/createTempTextures';
import {
  createSeededRunState,
  markEndingCompleted,
  REQUIRED_FINAL_KEEPSAKE_IDS,
  type RunState,
} from '../game/runState';
import { SceneKeys } from './sceneKeys';
import {
  EXTERIOR_ASSET_NAMES,
  EXTERIOR_SOURCE_HEIGHT,
  EXTERIOR_SOURCE_WIDTH,
  exteriorTextureKey,
  GROUND_TILESET_KEY,
  GROUND_TILESET_URL,
  GROUND_TILE_SIZE,
} from '../content/outdoorScenery';
import { DOORMAT_DROP_KEY } from '../game/roomRenderer';
import { listPropOverrideCandidates } from '../content/roomDressing';
import { isImageUrl } from '../game/assetProbe';
import {
  FRIEND_TWO_SPRITE,
  ENDING_SKY_KEY,
  ENDING_SKY_URL,
  ENDING_WATER_KEY,
  ENDING_WATER_URL,
  GALAXY_GROUND_KEY,
  GALAXY_GROUND_URL,
  SHORE_WATER_KEY,
  SHORE_WATER_URL,
} from '../content/galaxyScene';

const DOORMAT_DROP_URL = '/assets/doormat.png';

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
    this.load.spritesheet('friendone-room-tiles', '/assets/tiles/friendone-room-tiles.png', {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.image('friendone-room-props', '/assets/props/friendone-room-props.png');
    this.load.spritesheet('friendtwo-room-tiles', '/assets/tiles/friendtwo-room-tiles.png', {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.image('friendtwo-room-props', '/assets/props/friendtwo-room-props.png');

    // ____, the NPC who waits at the galaxy water for the final conversation.
    this.load.spritesheet(FRIEND_TWO_SPRITE.key, FRIEND_TWO_SPRITE.url, {
      frameWidth: FRIEND_TWO_SPRITE.frameWidth,
      frameHeight: FRIEND_TWO_SPRITE.frameHeight,
    });

    // The galaxy sky + starlit water paintings, reused to compose the final-spot
    // ground (sky pinned to the top, water below with a blend band) exactly as the
    // ending's terminal CSS frame composites them.
    this.load.image(ENDING_SKY_KEY, ENDING_SKY_URL);
    this.load.image(ENDING_WATER_KEY, ENDING_WATER_URL);
  }

  create(): void {
    createTempTextures(this);
    // Resolve optional/generated art (house exteriors, ground tileset, interior
    // doormat) before entering the world, so scenes always have their textures
    // ready. Each is probed up front so a missing file never errors the loader.
    void this.loadExteriors()
      .then(() => this.loadOptionalDropIns())
      .then(() => this.startWorld());
  }

  // Optional Codex-generated drop-ins, probed then loaded into shared texture
  // keys. Absent files are silently skipped; downstream renderers fall back to
  // their procedural textures when a key is missing.
  private async loadOptionalDropIns(): Promise<void> {
    // Per-prop standalone art overrides: one optional PNG per (room, prop) at
    // /assets/props/singles/<locationId>-<frame>.png. Probed alongside the other
    // drop-ins so an absent slot never errors the loader; present ones load into
    // their override texture key and the renderer draws that prop from the
    // standalone image instead of its sheet crop (singles-only props render only
    // when their slot is present).
    const propOverrides = listPropOverrideCandidates();

    const [hasTileset, hasDoormat, hasGalaxyGround, hasShoreWater, propOverridePresence] =
      await Promise.all([
        isImageUrl(GROUND_TILESET_URL),
        isImageUrl(DOORMAT_DROP_URL),
        isImageUrl(GALAXY_GROUND_URL),
        isImageUrl(SHORE_WATER_URL),
        Promise.all(propOverrides.map((candidate) => isImageUrl(candidate.url))),
      ]);

    const presentOverrides = propOverrides.filter((_, index) => propOverridePresence[index]);

    if (
      !hasTileset &&
      !hasDoormat &&
      !hasGalaxyGround &&
      !hasShoreWater &&
      presentOverrides.length === 0
    ) {
      return;
    }
    await new Promise<void>((resolve) => {
      if (hasTileset) {
        this.load.spritesheet(GROUND_TILESET_KEY, GROUND_TILESET_URL, {
          frameWidth: GROUND_TILE_SIZE,
          frameHeight: GROUND_TILE_SIZE,
        });
      }
      if (hasDoormat) {
        this.load.image(DOORMAT_DROP_KEY, DOORMAT_DROP_URL);
      }
      // Optional full-bleed galaxy ground override (replaces the composed water).
      if (hasGalaxyGround) {
        this.load.image(GALAXY_GROUND_KEY, GALAXY_GROUND_URL);
      }
      // Optional tileable shore-water band texture for the clearing's shore.
      if (hasShoreWater) {
        this.load.image(SHORE_WATER_KEY, SHORE_WATER_URL);
      }
      for (const candidate of presentOverrides) {
        this.load.image(candidate.key, candidate.url);
      }
      this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      this.load.start();
    });
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

    // testMode-only: seed the ending as already completed, so a smoke can land in
    // the post-ending world (e.g. ____'s room with the photo wall live).
    if (testMode && params.get('seedEnding') === '1') {
      state = markEndingCompleted(state ?? createSeededRunState(locationId, []));
    }

    this.scene.start(SceneKeys.Location, {
      locationId,
      spawnId,
      state,
    });
  }
}
