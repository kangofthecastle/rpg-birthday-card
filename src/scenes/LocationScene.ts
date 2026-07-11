import Phaser from 'phaser';
import { getActivity } from '../activities/activityRegistry';
import {
  ENDING_KEEPSAKE_ID,
  FINAL_ENDING_LETTERS,
} from '../activities/finalKeepsake/endingModel';
import {
  ENDING_SKY_KEY,
  ENDING_WATER_KEY,
  GALAXY_GROUND_KEY,
  SHORE_WATER_KEY,
  FRIEND_TWO_SPRITE,
} from '../content/galaxyScene';
import {
  RECIPIENT_ANIMATION_SOURCE_FACING,
  RECIPIENT_FLIP_X_BY_FACING,
  RECIPIENT_IDLE_ANIMATIONS,
  RECIPIENT_IDLE_FRAME_COUNTS,
  RECIPIENT_IDLE_ROW_START_FRAME,
  RECIPIENT_SPRITE,
  RECIPIENT_TAP_STEP_FRAME_OFFSETS,
  RECIPIENT_TAP_STEP_HOLD_MS,
  RECIPIENT_WALK_DUST,
  RECIPIENT_WALK_FRAME_COUNTS,
  RECIPIENT_WALK_ROW_START_FRAME,
  RECIPIENT_WALK_ANIMATIONS,
  PLAYER_FACINGS,
  type PlayerFacing,
} from '../assets/recipientSpriteConfig';
import { getLocation } from '../content/locations';
import { getRoomDressing, type RoomDressing } from '../content/roomDressing';
import {
  renderExitDoormat,
  renderInteriorAwakening,
  renderRoomDressing,
  growBoundsFromObject,
  type PropColliderRect,
  type ScreenBounds,
} from '../game/roomRenderer';
import { getCollisionZones, type CollisionZonesFile } from '../content/collisionZones';
import { rasterizePolygonsToRects, type Polygon } from '../game/collisionGeometry';
import type {
  DialogueLine,
  LocationDefinition,
  LocationEdgeExit,
  LocationInteraction,
} from '../content/types';
import {
  EDGE_ARRIVAL_COOLDOWN_MS,
  edgeProportion,
  edgeSpawnPoint,
  isBodyAtEdge,
  type BodyRect,
  type MapDims,
} from '../game/edgeTransitions';
import {
  getExteriors,
  getOutdoorPalette,
  exteriorTextureKey,
  GROUND_TILESET_KEY,
  GROUND_TILES,
  type ExteriorPlacement,
  type OutdoorPalette,
} from '../content/outdoorScenery';
import {
  completeLocation,
  createInitialRunState,
  hasAllFriendKeepsakes,
  isBoatFolded,
  isFinalSpotUnlocked,
  markBeatSeen,
  markEndingCompleted,
  setCurrentLocation,
  type RunState,
} from '../game/runState';
import { isInteractionLocked, shouldPlayEnterBeat } from '../game/interactionState';
import { type IsoOrigin, type IsoPoint } from '../game/isometricProjection';
import { createProjection, type Projection } from '../game/projection';
import { playMusic, playSfx, type MusicKey } from '../game/audio';
import { getPointObject, getRectObjects, type RectObject, type TiledMapJson } from '../game/mapHelpers';
import { getPlayerFacingFromScreenMovement, PlayerController } from '../game/playerController';
import { renderCollectionPanel } from '../ui/collectionPanel';
import { showDialogue } from '../ui/dialogueBox';
import { clearUiRoot, getUiRoot } from '../ui/domRoot';
import { showLetterModal } from '../ui/letterModal';
import { showLettersScreen } from '../ui/lettersScreen';
import { showPhotoWall } from '../ui/photoWall';
import { fnv1a, mulberry32 } from '../game/rng';
import { SceneKeys } from './sceneKeys';

interface LocationSceneData {
  readonly locationId: string;
  readonly spawnId?: string;
  /** Explicit map-space spawn coords (edge arrivals), overriding spawnId. */
  readonly spawnX?: number;
  readonly spawnY?: number;
  /** True when arriving via an edge transition, so a re-trigger grace applies. */
  readonly arrivedViaEdge?: boolean;
  readonly state?: RunState;
  /**
   * When set, the scene auto-starts this activity on arrival after a brief settle
   * (the boat sailing straight into the ending). Consumed once in create().
   */
  readonly autoStartActivityId?: string;
}

// Shown when the player reaches a final-unlock-gated way forward too early.
const FINAL_LOCKED_LINE =
  'The clearing feels close, but some keepsakes are still missing.';

// Shown at the gated south edge once every letter is held but the boat hasn't
// been folded yet — the ritual, not the edge, is the way across.
const FINAL_WAITING_LINE = 'not like this. the water is waiting for something.';

// Player yardstick (mirrors roomRenderer): ____ reads ~0.88 of her frame.
const PLAYER_VISUAL_HEIGHT_PX = RECIPIENT_SPRITE.frameHeight * RECIPIENT_SPRITE.scale * 0.88;

function colorToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Linear blend of two 0xRRGGBB colours (t=0 -> a, t=1 -> b). */
function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

interface TilePiece {
  readonly frame: number;
  /** Clockwise 90° turns to apply to the base tile orientation. */
  readonly quarter: number;
}

// Picks the ground path tile(s) for a cell from its 4-neighbour connectivity.
// Base tile orientations (from the tileset): straight = N–S, curve = {E,S},
// T = {E,S,W} (missing N), fade (dead-end) = open at S. Rotations are clockwise
// quarter turns (N→E→S→W). The dusk set has only straight + fade, so its corners
// degrade to a straight/cross stamp.
function choosePathTile(
  n: boolean,
  e: boolean,
  s: boolean,
  w: boolean,
  dusk: boolean,
): readonly TilePiece[] {
  const count = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);
  // Quarter turns to rotate a base direction into a target (base→target).
  const fadeQuarter = { S: 0, W: 1, N: 2, E: 3 } as const;

  if (dusk) {
    const straight = GROUND_TILES.duskPathStraight;
    if (count <= 1) {
      const target = n ? 'N' : e ? 'E' : w ? 'W' : 'S';
      return [{ frame: GROUND_TILES.duskPathFade, quarter: fadeQuarter[target] }];
    }
    const horizontal = e || w;
    const vertical = n || s;
    if (horizontal && vertical) {
      return [
        { frame: straight, quarter: 0 },
        { frame: straight, quarter: 1 },
      ];
    }
    return [{ frame: straight, quarter: horizontal ? 1 : 0 }];
  }

  if (count === 0) {
    return [{ frame: GROUND_TILES.pathStraight, quarter: 0 }];
  }
  if (count === 1) {
    const target = n ? 'N' : e ? 'E' : w ? 'W' : 'S';
    return [{ frame: GROUND_TILES.pathFade, quarter: fadeQuarter[target] }];
  }
  if (count === 2) {
    if (n && s) return [{ frame: GROUND_TILES.pathStraight, quarter: 0 }];
    if (e && w) return [{ frame: GROUND_TILES.pathStraight, quarter: 1 }];
    // Corner: curve base is {E,S}. Rotate to the actual open pair.
    let quarter = 0;
    if (s && w) quarter = 1;
    else if (w && n) quarter = 2;
    else if (n && e) quarter = 3;
    return [{ frame: GROUND_TILES.pathCurve, quarter }];
  }
  if (count === 3) {
    // T base misses N; rotate so the missing side matches (N→0,E→1,S→2,W→3).
    const missingQuarter = !n ? 0 : !e ? 1 : !s ? 2 : 3;
    return [{ frame: GROUND_TILES.pathT, quarter: missingQuarter }];
  }
  // 4-way cross: overlay two straights.
  return [
    { frame: GROUND_TILES.pathStraight, quarter: 0 },
    { frame: GROUND_TILES.pathStraight, quarter: 1 },
  ];
}

// Ambient bed per location; activities layer their own bed on top and the
// location bed resumes when they end. The ending swaps beds itself.
const MUSIC_BY_LOCATION_ID: Readonly<Record<string, MusicKey>> = {
  'recipient-house': 'music-home',
  'main-outside': 'music-path',
  'friendtwo-yard': 'music-path',
  'friendone-yard': 'music-path',
  clearing: 'music-home',
  'friend-a': 'music-home',
  'friend-b': 'music-home',
  'final-spot': 'music-ending',
};

const ACTIVITY_MUSIC_BY_ID: Readonly<Record<string, MusicKey | undefined>> = {
  'friendone-pc-fishing': 'music-friendone',
  'valorant-split': 'music-split',
};

function locationMusicKey(locationId: string): MusicKey {
  return MUSIC_BY_LOCATION_ID[locationId] ?? 'music-path';
}

export class LocationScene extends Phaser.Scene {
  private location!: LocationDefinition;
  private state: RunState = createInitialRunState('recipient-house');
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerVisual?: Phaser.GameObjects.Sprite;
  private playerFacing: PlayerFacing = 'down';
  private wasPlayerMoving = false;
  private tapStepHoldUntil = 0;
  private tapStepFrameByFacing = Object.fromEntries(
    PLAYER_FACINGS.map((facing) => [facing, 0]),
  ) as Record<PlayerFacing, number>;
  private lastWalkDustAt = 0;
  private walkDustFootSide = -1;
  private controller!: PlayerController;
  private canMove = true;
  private exits: RectObject[] = [];
  private interactions: RectObject[] = [];
  private interactKey?: Phaser.Input.Keyboard.Key;
  private promptText?: Phaser.GameObjects.Text;
  private activeObject?: RectObject;
  private walls?: Phaser.Tilemaps.TilemapLayer;
  private projection?: Projection;
  private dressing?: RoomDressing;
  private propColliders: PropColliderRect[] = [];
  private propColliderBodies: Phaser.GameObjects.Rectangle[] = [];
  private zonesFile?: CollisionZonesFile;
  private showColliderDebug = false;
  private debugMarkers = false;
  // Per-map static camera zoom picked in applyCameraBounds so every map covers
  // the fixed 1280x720 logical frame (no dead-space corner pinning). 1 for maps
  // already >= the frame in both axes.
  private cameraZoom = 1;
  private mapDims: MapDims = { width: 0, height: 0, tileSize: 64 };
  private spawnOverride?: { x: number; y: number };
  private autoStartActivityId?: string;
  private arrivedViaEdge = false;
  private edgeCooldownUntil = 0;
  private edgeTriggerBusy = false;
  private interiorAwakened = false;

  // 8px grid for rasterising polygon collision zones into strip rectangles.
  private static readonly ZONE_CELL_SIZE = 8;

  constructor() {
    super(SceneKeys.Location);
  }

  init(data: LocationSceneData): void {
    this.location = getLocation(data.locationId);
    this.state = setCurrentLocation(
      data.state ?? createInitialRunState('recipient-house'),
      data.locationId,
    );
    this.registry.set('runState', this.state);
    this.registry.set('spawnId', data.spawnId ?? this.location.defaultSpawnId);
    this.spawnOverride =
      data.spawnX !== undefined && data.spawnY !== undefined
        ? { x: data.spawnX, y: data.spawnY }
        : undefined;
    this.arrivedViaEdge = data.arrivedViaEdge ?? false;
    this.autoStartActivityId = data.autoStartActivityId;
    this.edgeTriggerBusy = false;
    this.edgeCooldownUntil = 0;
    // scene.restart() reuses this instance, so reset the awakening guard here;
    // create() re-applies it statically when the room is entered already awakened.
    this.interiorAwakened = false;
    // scene.restart() reuses this instance, so class field initializers (like
    // `canMove = true`) do NOT re-run. Reset control on every (re)start here, so
    // a scene entered via a travelTo restart — which restarts while canMove is
    // still false from startActivity() and returns before the normal
    // `canMove = true` — comes up controllable rather than frozen.
    this.canMove = true;
  }

  create(): void {
    clearUiRoot();
    const params = new URLSearchParams(window.location.search);
    // The zone editor forces the collider/zone debug overlay on so the author
    // always sees current collision truth while editing.
    this.showColliderDebug =
      params.has('dressDebug') || (import.meta.env.DEV && params.has('editZones'));
    this.debugMarkers = this.showColliderDebug;
    // Mirror the current location onto the DOM so the on-screen location label
    // change is observable to smoke tests (Phaser canvas text is not queryable).
    document.body.dataset.locationId = this.location.id;
    delete document.body.dataset.interiorAwakened;
    this.createMap();
    this.createPlayer();
    this.createHud();
    this.createLocationLabel();
    this.applyWarmLightingTint();
    this.applyOutdoorAwakening();
    this.createGalaxyScenery();
    // Statically awaken a dressed interior already entered post-violin (later
    // room entries); the completion seam applies it dynamically the first time.
    this.applyInteriorAwakening({ animate: false });
    playMusic(locationMusicKey(this.location.id), { fadeMs: 1200 });

    this.interactKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.promptText = this.add
      .text(this.fixedScreenX(24), this.fixedScreenY(this.scale.height - 64), '', {
        color: '#fff7e8',
        backgroundColor: '#1b1f1f',
        padding: { x: 12, y: 8 },
        fontSize: '18px',
      })
      .setScrollFactor(0)
      .setScale(1 / this.cameraZoom)
      .setDepth(1000);

    if (this.arrivedViaEdge) {
      this.edgeCooldownUntil = this.time.now + EDGE_ARRIVAL_COOLDOWN_MS;
    }

    void this.runEnterBeats();
    this.maybeStartZoneEditor();
    this.maybeAutoStartActivity();
  }

  // The boat sails straight into the ending: when the scene was entered with an
  // auto-start activity (via the origami ritual's travelTo), hold the player on
  // the arrival shot for a brief settle, then open the activity — no interim walk
  // or E-press. Consumed once; a later restart of this scene won't re-trigger.
  private maybeAutoStartActivity(): void {
    const activityId = this.autoStartActivityId;
    if (!activityId) {
      return;
    }
    this.autoStartActivityId = undefined;
    // Freeze control during the settle so the player rests at the arrival spot.
    this.canMove = false;
    this.promptText?.setText('');
    const testMode =
      new URLSearchParams(window.location.search).get('testMode') === '1';
    // The ending auto-start (final-keepsake-reveal) is covered by the persistent
    // sail-away key-art bridge, so the live scene must NOT be exposed for a settle
    // beat: collapse the settle to a minimal tick that just lets create() finish.
    // Other auto-starts still hold on the arrival shot.
    const endingAutoStart = activityId === 'final-keepsake-reveal';
    const settleMs = testMode ? 60 : endingAutoStart ? 50 : 1000;
    this.time.delayedCall(settleMs, () => {
      void this.startActivity(activityId);
    });
  }

  // Dev-only in-game polygon editor, lazily imported so it is excluded from
  // production bundles. Keeps the player controllable but detaches strict camera
  // follow (the editor manages pan/zoom).
  private maybeStartZoneEditor(): void {
    if (!import.meta.env.DEV) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (!params.has('editZones') || !this.projection || !this.playerVisual) {
      return;
    }

    const projection = this.projection;
    const playerVisual = this.playerVisual;
    void import('../game/zoneEditor').then(({ startZoneEditor }) => {
      startZoneEditor(this, {
        locationId: this.location.id,
        projection,
        playerVisual,
        dressing: this.dressing,
        initial: this.zonesFile,
      });
    });
  }

  private applyWarmLightingTint(): void {
    if (
      !this.location.warmLightingRequiresAllFriendKeepsakes ||
      !hasAllFriendKeepsakes(this.state)
    ) {
      return;
    }

    this.add
      .rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0xffb454, 0.16)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(900);
  }

  private async runEnterBeats(): Promise<void> {
    for (const beat of this.location.enterBeats ?? []) {
      if (!shouldPlayEnterBeat(beat, this.state)) {
        continue;
      }

      if (beat.once !== false) {
        this.state = markBeatSeen(this.state, beat.id);
        this.registry.set('runState', this.state);
      }

      await this.pauseForDialogue(beat.dialogue);
    }
  }

  update(): void {
    this.controller.update(this.canMove);
    this.syncPlayerVisual();

    if (this.debugMarkers) {
      document.body.dataset.playerPos = `${Math.round(this.player.x)},${Math.round(this.player.y)}`;
    }

    if (!this.canMove) {
      this.activeObject = undefined;
      this.promptText?.setText('');
      return;
    }

    if (this.checkEdgeTransitions()) {
      this.activeObject = undefined;
      this.promptText?.setText('');
      return;
    }

    this.activeObject = this.findActiveObject();
    this.promptText?.setText(this.activeObject ? `E - ${this.getObjectLabel(this.activeObject)}` : '');

    if (this.activeObject && this.interactKey && Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      void this.activateObject(this.activeObject);
    }
  }

  // Auto edge-to-edge transitions: when the player's body reaches an open world
  // edge that carries an edge exit, swap areas (or, for the gated final edge,
  // show the blocked line and nudge them back). Returns true when an edge is
  // being handled this frame, so the caller suppresses the interact prompt.
  private checkEdgeTransitions(): boolean {
    if (this.edgeTriggerBusy) {
      return true;
    }
    const edgeExits = this.location.edgeExits;
    if (!edgeExits || edgeExits.length === 0 || this.time.now < this.edgeCooldownUntil) {
      return false;
    }

    const body = this.player.body;
    if (!body) {
      return false;
    }

    const rect: BodyRect = { x: body.x, y: body.y, width: body.width, height: body.height };
    for (const edgeExit of edgeExits) {
      if (isBodyAtEdge(edgeExit.edge, rect, this.mapDims)) {
        void this.activateEdgeExit(edgeExit, rect);
        return true;
      }
    }

    return false;
  }

  private async activateEdgeExit(edgeExit: LocationEdgeExit, body: BodyRect): Promise<void> {
    this.edgeTriggerBusy = true;

    // The gated south edge opens only once the boat is folded (the ritual is the
    // real way across). Before that: if the letters aren't all held yet, the old
    // "still missing" line; if they are, the water is waiting for the ritual.
    if (edgeExit.requiresFinalUnlock && !isBoatFolded(this.state)) {
      this.nudgeAwayFromEdge(edgeExit.edge);
      const line = isFinalSpotUnlocked(this.state) ? FINAL_WAITING_LINE : FINAL_LOCKED_LINE;
      await this.pauseForDialogue([{ text: line }]);
      this.edgeCooldownUntil = this.time.now + EDGE_ARRIVAL_COOLDOWN_MS;
      this.edgeTriggerBusy = false;
      return;
    }

    const destination = getLocation(edgeExit.destinationLocationId);
    const destDims = this.readMapDims(destination.mapKey);
    const proportion = edgeProportion(edgeExit.edge, body, this.mapDims);
    const spawn = edgeSpawnPoint(edgeExit.destinationEdge, proportion, destDims);

    this.scene.restart({
      locationId: destination.id,
      spawnX: spawn.x,
      spawnY: spawn.y,
      arrivedViaEdge: true,
      state: this.state,
    } satisfies LocationSceneData);
  }

  // Push the player one tile back from a blocked edge so they end up clear of it
  // after the dialogue (and so the cooldown isn't racing an on-edge body).
  private nudgeAwayFromEdge(edge: LocationEdgeExit['edge']): void {
    const tile = this.mapDims.tileSize;
    let { x, y } = this.player;

    switch (edge) {
      case 'south':
        y -= tile;
        break;
      case 'north':
        y += tile;
        break;
      case 'east':
        x -= tile;
        break;
      case 'west':
        x += tile;
        break;
    }

    this.player.setPosition(x, y);
    this.player.body?.reset(x, y);
  }

  private readMapDims(mapKey: string): MapDims {
    const data = this.cache.tilemap.get(mapKey)?.data as TiledMapJson | undefined;
    if (!data) {
      throw new Error(`Missing cached tilemap for ${mapKey}`);
    }
    return {
      width: data.width * data.tilewidth,
      height: data.height * data.tileheight,
      tileSize: data.tilewidth,
    };
  }

  private createMap(): void {
    const tilemap = this.make.tilemap({ key: this.location.mapKey });
    const floorTileset = tilemap.addTilesetImage('temp-floor', 'tile-floor');
    const wallTileset = tilemap.addTilesetImage('temp-wall', 'tile-wall');

    if (!floorTileset || !wallTileset) {
      throw new Error(`Missing tileset for ${this.location.id}`);
    }

    this.projection = createProjection(this.location.projection, this.createIsoOrigin(tilemap));
    this.mapDims = {
      width: tilemap.widthInPixels,
      height: tilemap.heightInPixels,
      tileSize: tilemap.tileWidth,
    };
    this.dressing = getRoomDressing(this.location.id);
    this.zonesFile = getCollisionZones(this.location.id);

    this.propColliders = [];
    this.propColliderBodies = [];
    let contentBounds: ScreenBounds | undefined;

    if (this.dressing) {
      this.cameras.main.setBackgroundColor(this.dressing.backgroundColor);
      const rendered = renderRoomDressing(
        this,
        this.dressing,
        tilemap,
        this.getProjection().movementOrigin ?? this.createIsoOrigin(tilemap),
        this.zonesFile?.propDepthOverrides ?? {},
      );
      contentBounds = { ...rendered.contentBounds };
      // Polygon zones, when present, REPLACE the footprint-based prop colliders;
      // otherwise fall back to the roomDressing footprints.
      this.propColliders = this.zonesFile
        ? this.rasterizeZones(this.zonesFile)
        : [...rendered.colliders];
    } else if (this.location.id === 'final-spot') {
      // The galaxy place: no grass, no hedges — the ground IS the ocean-galaxy
      // reflection, with soft darkness closing every edge.
      this.cameras.main.setBackgroundColor('#070512');
      this.createGalaxyGround(tilemap);
    } else if (this.getProjection().mode === 'flat') {
      const palette = getOutdoorPalette(this.location.id);
      // Full-bleed grass: let any overscan blend with the ground rather than a
      // dark void, since flat camera bounds are the exact map rect.
      this.cameras.main.setBackgroundColor(colorToHex(palette?.floorB ?? 0x7fa46b));
      this.createFlatGround(tilemap, palette);
      this.propColliders = [...this.propColliders, ...this.renderOutdoorExteriors()];
    } else {
      const palette = getOutdoorPalette(this.location.id);
      this.cameras.main.setBackgroundColor(
        palette ? colorToHex(palette.background) : '#17211b',
      );
      this.createDevBackdrop(tilemap, palette);
      this.propColliders = [...this.propColliders, ...this.renderOutdoorExteriors()];
    }

    const ground = tilemap.createLayer('Ground', [floorTileset, wallTileset], 0, 0);
    ground?.setDepth(-10);
    ground?.setVisible(false);

    const walls = tilemap.createLayer('Collision', [floorTileset, wallTileset], 0, 0);
    walls?.setDepth(-9);
    walls?.setVisible(false);
    walls?.setCollisionByExclusion([-1, 0]);
    this.walls = walls ?? undefined;

    const mapJson = this.getMapJson();
    this.exits = getRectObjects(mapJson, 'Exits');
    this.interactions = getRectObjects(mapJson, 'Interactables');
    this.physics.world.setBounds(0, 0, tilemap.widthInPixels, tilemap.heightInPixels);

    this.createWorldMarkers();
    this.createDressedExitMarkers(contentBounds);
    this.createOutdoorDoorMarkers();
    this.createPropColliderBodies();
    this.applyCameraBounds(tilemap, contentBounds);
  }

  // Camera bounds from real content extents (dressed rooms), so the room art is
  // never clipped at the bottom and the back-wall tops (at negative screen Y)
  // stay reachable. Undressed rooms keep the legacy constant padding.
  private applyCameraBounds(
    tilemap: Phaser.Tilemaps.Tilemap,
    contentBounds: ScreenBounds | undefined,
  ): void {
    let x = 0;
    let y = 0;
    let width = tilemap.widthInPixels;
    let height = tilemap.heightInPixels;

    if (contentBounds && Number.isFinite(contentBounds.minX)) {
      const margin = 32;
      x = Math.floor(contentBounds.minX - margin);
      y = Math.floor(contentBounds.minY - margin);
      width = Math.ceil(contentBounds.maxX - contentBounds.minX + margin * 2);
      height = Math.ceil(contentBounds.maxY - contentBounds.minY + margin * 2);
    } else if (this.getProjection().mode === 'flat') {
      // Flat top-down: bounds are EXACTLY the map rect, so the ground fills the
      // view edge-to-edge with no iso padding void when the camera hits a side.
      // x/y/width/height already default to the map rect.
    } else {
      const isoBounds = this.getProjection().bounds(
        tilemap.widthInPixels,
        tilemap.heightInPixels,
      );
      width = isoBounds.maxX + 192;
      height = isoBounds.maxY + 224;
    }

    this.applyCoverBounds(x, y, width, height);
  }

  // Chooses a static zoom so the bounds cover the fixed logical frame, then sets
  // both. Zoom = max(1, frameW/boundsW, frameH/boundsH) snapped UP to the nearest
  // 0.25 (clean pixel scaling). With zoom >= cover, the on-screen world size
  // (frame / zoom) is <= the bounds in the constraining axis, so Phaser's clamp
  // scrolls/centers instead of pinning a small map to the top-left corner. Maps
  // already >= the frame in both axes stay at zoom 1 and just scroll.
  private applyCoverBounds(x: number, y: number, width: number, height: number): void {
    const camera = this.cameras.main;
    const frameWidth = camera.width;
    const frameHeight = camera.height;

    const needed = Math.max(1, frameWidth / width, frameHeight / height);
    const zoom = Math.ceil(needed * 4) / 4;

    // Safety centering: if a bound is still smaller than the on-screen world in
    // some axis (rounding), pad it symmetrically so it centers rather than pins.
    const viewWidth = frameWidth / zoom;
    const viewHeight = frameHeight / zoom;
    if (width < viewWidth) {
      x -= Math.ceil((viewWidth - width) / 2);
      width = Math.ceil(viewWidth);
    }
    if (height < viewHeight) {
      y -= Math.ceil((viewHeight - height) / 2);
      height = Math.ceil(viewHeight);
    }

    camera.setZoom(zoom);
    camera.setBounds(x, y, width, height);
    this.cameraZoom = zoom;
  }

  // Maps a desired on-screen (camera-fixed) coordinate to the world coordinate a
  // scrollFactor(0) object must sit at so that, after the camera's zoom-about-
  // origin transform, its origin lands exactly at that screen point. Pair with
  // setScale(1 / cameraZoom) to keep the object at its native pixel size.
  private fixedScreenX(screenX: number): number {
    const camera = this.cameras.main;
    const anchor = camera.width * camera.originX;
    return anchor + (screenX - anchor) / this.cameraZoom;
  }

  private fixedScreenY(screenY: number): number {
    const camera = this.cameras.main;
    const anchor = camera.height * camera.originY;
    return anchor + (screenY - anchor) / this.cameraZoom;
  }

  // Dressed rooms hide the debug rects, so render a diegetic doormat + glow at
  // each exit as the visible "way out". Undressed rooms keep the dev markers.
  // Unions each doormat's bounds into contentBounds so the camera includes them.
  private createDressedExitMarkers(contentBounds?: ScreenBounds): void {
    if (!this.dressing || !this.projection?.movementOrigin) {
      return;
    }

    for (const exit of this.exits) {
      const result = renderExitDoormat(
        this,
        this.dressing,
        { x: exit.x, y: exit.y, width: exit.width, height: exit.height },
        this.projection.movementOrigin,
      );
      if (contentBounds) {
        for (const object of result.objects) {
          growBoundsFromObject(
            contentBounds,
            object as Phaser.GameObjects.GameObject & { getBounds?: () => Phaser.Geom.Rectangle },
          );
        }
      }
    }
  }

  // Rasterises polygon collision zones into map-space strip rectangles.
  private rasterizeZones(zonesFile: CollisionZonesFile): PropColliderRect[] {
    const polygons: Polygon[] = zonesFile.zones
      .filter((zone) => zone.points.length >= 3)
      .map((zone) => zone.points);
    const rects = rasterizePolygonsToRects(polygons, LocationScene.ZONE_CELL_SIZE);
    return rects.map((rect) => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }));
  }

  // Static physics bodies (map space) for solid props' floor footprints. The
  // bodies are invisible; ?dressDebug=1 overlays their projected outlines.
  private createPropColliderBodies(): void {
    const debug = this.showColliderDebug;
    const projection = this.getProjection();

    // With debug on, also outline the authored zone polygons (map->screen) so
    // the author sees source polygons alongside the rasterised collision rects.
    if (debug && this.zonesFile) {
      for (const zone of this.zonesFile.zones) {
        if (zone.points.length < 3) {
          continue;
        }
        const outline = this.add.graphics().setDepth(7);
        const polygon = this.toPhaserPoints(
          zone.points.map(([x, y]) => projection.project(x, y)),
        );
        outline.lineStyle(2, 0x8b5cf6, 0.95);
        outline.strokePoints(polygon, true);
      }
    }

    for (const collider of this.propColliders) {
      const body = this.add
        .rectangle(
          collider.x + collider.width / 2,
          collider.y + collider.height / 2,
          collider.width,
          collider.height,
        )
        .setVisible(false);
      this.physics.add.existing(body, true);
      this.propColliderBodies.push(body);

      if (debug) {
        const outline = this.add.graphics().setDepth(6);
        const polygon = this.toPhaserPoints(
          projection.rectCorners(collider.x, collider.y, collider.width, collider.height),
        );
        outline.fillStyle(0xff3366, 0.18);
        outline.fillPoints(polygon, true);
        outline.lineStyle(2, 0xff3366, 0.9);
        outline.strokePoints(polygon, true);
      }
    }
  }

  private createDevBackdrop(
    tilemap: Phaser.Tilemaps.Tilemap,
    palette?: OutdoorPalette,
  ): void {
    const projection = this.getProjection();
    const width = tilemap.widthInPixels;
    const height = tilemap.heightInPixels;
    const isoBounds = projection.bounds(width, height);
    const graphics = this.add.graphics().setDepth(-20);

    const pal: OutdoorPalette = palette ?? {
      background: 0x17211b,
      floorA: 0x88ad70,
      floorB: 0x7fa46b,
      stroke: 0x5f8050,
      border: 0x8a6a4f,
      borderStroke: 0x5d4334,
      path: 0xb9a06b,
    };
    // Which border sides are walkable openings (drawn as floor, not framing).
    const openEdges = new Set((this.location.edgeExits ?? []).map((exit) => exit.edge));

    graphics.fillStyle(pal.background, 1);
    graphics.fillRect(0, 0, isoBounds.maxX + 192, isoBounds.maxY + 224);

    this.drawIsoSideFace(
      graphics,
      [projection.project(0, height), projection.project(width, height)],
      48,
      0x5d4a36,
    );
    this.drawIsoSideFace(
      graphics,
      [projection.project(width, 0), projection.project(width, height)],
      48,
      0x6b523c,
    );

    for (let row = 0; row < tilemap.height; row += 1) {
      for (let column = 0; column < tilemap.width; column += 1) {
        const onCorner =
          (column === 0 || column === tilemap.width - 1) &&
          (row === 0 || row === tilemap.height - 1);
        const isFramedBorder =
          !onCorner &&
          ((column === 0 && !openEdges.has('west')) ||
            (column === tilemap.width - 1 && !openEdges.has('east')) ||
            (row === 0 && !openEdges.has('north')) ||
            (row === tilemap.height - 1 && !openEdges.has('south'))) ||
          onCorner;
        const isAlternate = (row + column) % 2 === 0;
        const color = isFramedBorder ? pal.border : isAlternate ? pal.floorA : pal.floorB;
        const strokeColor = isFramedBorder ? pal.borderStroke : pal.stroke;
        const polygon = this.toPhaserPoints(
          projection.tileCorners(
            column * tilemap.tileWidth,
            row * tilemap.tileHeight,
            tilemap.tileWidth,
          ),
        );

        graphics.fillStyle(color, 1);
        graphics.fillPoints(polygon, true);
        graphics.lineStyle(1, strokeColor, isFramedBorder ? 0.85 : 0.45);
        graphics.strokePoints(polygon, true);
      }
    }
  }

  // Top-down full-bleed ground for a flat outdoor area. Covers the whole map
  // rect exactly: tinted grass with a soft organic checker + scattered tufts,
  // worn dirt paths from the centre toward each open edge and each door, and a
  // ~1-tile hedge/tree band on every CLOSED edge (matching the border collision).
  // Procedural + seeded, so it is stable across reloads/screenshots.
  private createFlatGround(tilemap: Phaser.Tilemaps.Tilemap, palette?: OutdoorPalette): void {
    const width = tilemap.widthInPixels;
    const height = tilemap.heightInPixels;
    const tile = tilemap.tileWidth;
    const cols = tilemap.width;
    const rows = tilemap.height;
    const pal: OutdoorPalette = palette ?? {
      background: 0x17211b,
      floorA: 0x88ad70,
      floorB: 0x7fa46b,
      stroke: 0x5f8050,
      border: 0x6f8f58,
      borderStroke: 0x4e6a40,
      path: 0xb9a06b,
    };
    const openEdges = new Set((this.location.edgeExits ?? []).map((exit) => exit.edge));

    // File-first: when the ground tileset dropped in, tile the ground from it
    // (grass scatter + auto-tiled paths + hedge band + dusk set for the
    // clearing) instead of the procedural fills. The procedural path below stays
    // the fallback when the tileset is absent. Per-area palette tinting is kept
    // as a subtle overlay in both paths so areas stay distinguishable.
    if (this.textures.exists(GROUND_TILESET_KEY)) {
      this.buildTilesetGround(tilemap, pal, openEdges);
      if (this.location.id === 'clearing') {
        this.drawClearingShore(width, height, tile);
      }
      return;
    }

    const rng = mulberry32(fnv1a(this.location.id));

    // 1. Grass base + subtle per-tile checker + scattered darker tufts.
    //    This is ~800+ primitive fills. Baking it once and drawing a single
    //    textured quad instead of re-tessellating a retained Graphics EVERY
    //    frame is the win. We bake into a GPU RenderTexture rather than
    //    Graphics.generateTexture: generateTexture does a synchronous
    //    gl.readPixels back to the CPU (a visible startup stall), whereas
    //    RenderTexture.draw stays entirely GPU-side. The off-display-list stamp
    //    Graphics is drawn once then destroyed; the tuft/checker rng draws still
    //    run every create() so the downstream hedge PRNG stream (which shares
    //    `rng`) is unchanged.
    const ground = this.make.graphics({}, false);
    ground.fillStyle(pal.floorA, 1);
    ground.fillRect(0, 0, width, height);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < cols; column += 1) {
        const checker = (row + column) % 2 === 0;
        // Occasionally flip a tile so the grid reads organic, not a hard board.
        if (checker !== (rng() < 0.18)) {
          ground.fillStyle(pal.floorB, 0.55);
          ground.fillRect(column * tile, row * tile, tile, tile);
        }
      }
    }
    const tuftCount = Math.round(cols * rows * 0.6);
    for (let i = 0; i < tuftCount; i += 1) {
      const x = rng() * width;
      const y = rng() * height;
      const r = 2 + rng() * 3;
      ground.fillStyle(pal.stroke, 0.18 + rng() * 0.16);
      ground.fillEllipse(x, y, r * 2.4, r * 1.4);
      ground.fillEllipse(x + r, y - r * 0.4, r * 1.6, r);
    }
    const groundTexture = this.add
      .renderTexture(0, 0, width, height)
      .setOrigin(0, 0)
      .setDepth(-20);
    groundTexture.draw(ground);
    ground.destroy();

    // 2. Worn paths from the map centre toward each open edge and each door.
    const paths = this.add.graphics().setDepth(-19);
    const center = { x: width / 2, y: height / 2 };
    const targets: Array<{ x: number; y: number }> = [];
    if (openEdges.has('west')) targets.push({ x: 0, y: height / 2 });
    if (openEdges.has('east')) targets.push({ x: width, y: height / 2 });
    if (openEdges.has('north')) targets.push({ x: width / 2, y: 0 });
    if (openEdges.has('south')) targets.push({ x: width / 2, y: height });
    for (const exit of this.exits) {
      targets.push({ x: exit.x + exit.width / 2, y: exit.y + exit.height / 2 });
    }
    const pathEdge = mixColor(pal.path, 0x000000, 0.28);
    for (const target of targets) {
      this.stampPath(paths, center, target, pathEdge, tile * 0.44);
      this.stampPath(paths, center, target, pal.path, tile * 0.27);
    }
    paths.setAlpha(0.72);

    // 3. Boundary read: hedge/tree band ~1 tile thick on each CLOSED edge.
    const hedges = this.add.graphics().setDepth(-18);
    for (const edge of ['north', 'south', 'east', 'west'] as const) {
      if (openEdges.has(edge)) {
        continue;
      }
      this.drawHedgeBand(hedges, edge, width, height, tile, pal, rng);
    }

    // 4. The clearing's southern boundary is a SHORE: a dark-water band that
    // always reads as water, and glows with light from beyond once the world
    // has awakened (every letter collected).
    if (this.location.id === 'clearing') {
      this.drawClearingShore(width, height, tile);
    }
  }

  // Tileset-driven flat ground: grass base with seeded variant scatter, worn
  // dirt paths auto-tiled (straight/curve/T/fade) along the same centre→edge/door
  // routes, and a 1-tile hedge band on every CLOSED edge. The clearing uses the
  // dusk-tinted tile set. Everything bakes into one GPU RenderTexture; a subtle
  // per-area palette rect is overlaid so areas stay distinguishable.
  private buildTilesetGround(
    tilemap: Phaser.Tilemaps.Tilemap,
    pal: OutdoorPalette,
    openEdges: Set<string>,
  ): void {
    const tile = tilemap.tileWidth;
    const cols = tilemap.width;
    const rows = tilemap.height;
    const width = tilemap.widthInPixels;
    const height = tilemap.heightInPixels;
    const dusk = this.location.id === 'clearing';
    const rng = mulberry32(fnv1a(`${this.location.id}:tiles`));

    const rt = this.add
      .renderTexture(0, 0, width, height)
      .setOrigin(0, 0)
      .setDepth(-20);

    // 1. Grass base — mostly the plain variant, occasional bright/textured, rare
    //    tufted accent. The clearing uses the two dusk grass tiles.
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < cols; column += 1) {
        const roll = rng();
        let frame: number;
        if (dusk) {
          frame = roll < 0.26 ? GROUND_TILES.duskGrass[1] : GROUND_TILES.duskGrass[0];
        } else if (roll < 0.06) {
          frame = GROUND_TILES.grass[3];
        } else if (roll < 0.13) {
          frame = GROUND_TILES.grass[1];
        } else if (roll < 0.32) {
          frame = GROUND_TILES.grass[2];
        } else {
          frame = GROUND_TILES.grass[0];
        }
        this.stampGroundTile(rt, frame, 0, column * tile, row * tile, tile);
      }
    }

    // 2. Worn paths: rasterize centre→(open edge / door) routes into a 1-tile-wide
    //    cell mask, then auto-tile each cell from its 4-neighbour connectivity.
    const path = this.rasterizePathCells(cols, rows, tile, width, height, openEdges);
    for (let index = 0; index < path.length; index += 1) {
      if (!path[index]) {
        continue;
      }
      const column = index % cols;
      const row = Math.floor(index / cols);
      const n = row > 0 && path[index - cols];
      const s = row < rows - 1 && path[index + cols];
      const w = column > 0 && path[index - 1];
      const e = column < cols - 1 && path[index + 1];
      for (const piece of choosePathTile(n, e, s, w, dusk)) {
        this.stampGroundTile(rt, piece.frame, piece.quarter, column * tile, row * tile, tile);
      }
    }

    // 3. Hedge band ~1 tile thick on each CLOSED edge (dusk areas have no hedge
    //    tile set — the shore reads the boundary there, so skip when dusk).
    if (!dusk) {
      const hedge = GROUND_TILES.hedgeStraight;
      for (let column = 0; column < cols; column += 1) {
        if (!openEdges.has('north')) this.stampGroundTile(rt, hedge, 0, column * tile, 0, tile);
        if (!openEdges.has('south')) {
          this.stampGroundTile(rt, hedge, 0, column * tile, (rows - 1) * tile, tile);
        }
      }
      for (let row = 0; row < rows; row += 1) {
        if (!openEdges.has('west')) this.stampGroundTile(rt, hedge, 1, 0, row * tile, tile);
        if (!openEdges.has('east')) {
          this.stampGroundTile(rt, hedge, 1, (cols - 1) * tile, row * tile, tile);
        }
      }
    }

    // 4. Subtle per-area palette overlay so shared grass tiles still read as
    //    distinct places (cool ____ yard, warm ____ yard, dusk clearing).
    const tint = this.add.graphics().setDepth(-19).setAlpha(dusk ? 0.22 : 0.16);
    tint.fillStyle(pal.floorA, 1);
    tint.fillRect(0, 0, width, height);
  }

  // Stamps one 64px tileset frame (optionally rotated by `quarter` clockwise
  // 90° turns) into the ground RenderTexture at map px (x, y). Rotated variants
  // are baked once into cached canvas textures so no per-draw rotation is needed.
  private stampGroundTile(
    rt: Phaser.GameObjects.RenderTexture,
    frame: number,
    quarter: number,
    x: number,
    y: number,
    size: number,
  ): void {
    rt.drawFrame(this.rotatedTileKey(frame, quarter, size), undefined, x, y);
  }

  private rotatedTileKey(frame: number, quarter: number, size: number): string {
    const key = `gt-${frame}-${quarter}-${size}`;
    if (this.textures.exists(key)) {
      return key;
    }
    const source = this.textures.get(GROUND_TILESET_KEY);
    const cut = source.get(frame);
    const canvasTexture = this.textures.createCanvas(key, size, size);
    if (!canvasTexture) {
      return GROUND_TILESET_KEY;
    }
    const ctx = canvasTexture.getContext();
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((quarter * Math.PI) / 2);
    ctx.translate(-size / 2, -size / 2);
    ctx.drawImage(
      source.getSourceImage() as CanvasImageSource,
      cut.cutX,
      cut.cutY,
      cut.cutWidth,
      cut.cutHeight,
      0,
      0,
      size,
      size,
    );
    ctx.restore();
    canvasTexture.refresh();
    return key;
  }

  // Rasterizes the worn-path routes (map centre → each open edge and each door
  // exit) into a boolean cell mask, ~1 tile wide, matching the procedural routes.
  private rasterizePathCells(
    cols: number,
    rows: number,
    tile: number,
    width: number,
    height: number,
    openEdges: Set<string>,
  ): boolean[] {
    const mask = new Array<boolean>(cols * rows).fill(false);
    const center = { x: width / 2, y: height / 2 };
    const targets: Array<{ x: number; y: number }> = [];
    if (openEdges.has('west')) targets.push({ x: 0, y: height / 2 });
    if (openEdges.has('east')) targets.push({ x: width, y: height / 2 });
    if (openEdges.has('north')) targets.push({ x: width / 2, y: 0 });
    if (openEdges.has('south')) targets.push({ x: width / 2, y: height });
    for (const exit of this.exits) {
      targets.push({ x: exit.x + exit.width / 2, y: exit.y + exit.height / 2 });
    }
    const mark = (px: number, py: number): void => {
      const c = Math.min(cols - 1, Math.max(0, Math.floor(px / tile)));
      const r = Math.min(rows - 1, Math.max(0, Math.floor(py / tile)));
      mask[r * cols + c] = true;
    };
    for (const target of targets) {
      const distance = Math.hypot(target.x - center.x, target.y - center.y);
      const steps = Math.max(2, Math.round(distance / (tile * 0.4)));
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        mark(center.x + (target.x - center.x) * t, center.y + (target.y - center.y) * t);
      }
    }
    return mask;
  }

  // A dark-water band along the clearing's south edge (~2 tiles). Always present;
  // once the world awakens (all letters held), a warm-cool light blooms from
  // beneath and beyond the water — the ending, close now.
  private drawClearingShore(width: number, height: number, tile: number): void {
    const awakened = isFinalSpotUnlocked(this.state);
    const bandHeight = tile * 2;
    const top = height - bandHeight;

    // File-first: when the tileable shore-water band art (512×128) dropped in,
    // tile it across the band (its 128px height matches the 2-tile band exactly),
    // with the awakened-glow effects layered on top. Procedural water otherwise.
    if (this.textures.exists(SHORE_WATER_KEY)) {
      this.add
        .tileSprite(0, top, width, bandHeight, SHORE_WATER_KEY)
        .setOrigin(0, 0)
        .setDepth(-17);
    } else {
      const water = this.add.graphics().setDepth(-17);
      // Wet sand / shoreline seam.
      water.fillStyle(0x2e2f3a, 1);
      water.fillRect(0, top - tile * 0.35, width, tile * 0.4);
      // Deep water, darkening toward the edge.
      water.fillStyle(0x12233a, 1);
      water.fillRect(0, top, width, bandHeight);
      water.fillStyle(0x0b1626, 1);
      water.fillRect(0, top + bandHeight * 0.55, width, bandHeight * 0.45);

      // Gentle ripple striations.
      const rippleColor = awakened ? 0x8fd0e6 : 0x35506a;
      water.lineStyle(2, rippleColor, awakened ? 0.5 : 0.32);
      for (let i = 0; i < 5; i += 1) {
        const y = top + (bandHeight * (i + 0.5)) / 5;
        water.beginPath();
        water.moveTo(0, y);
        for (let x = 0; x <= width; x += tile) {
          water.lineTo(x, y + Math.sin((x / width) * Math.PI * 6 + i) * 3);
        }
        water.strokePath();
      }
    }

    if (!awakened) {
      return;
    }

    // Awakened: a bloom of light along the shore and beneath the water.
    const glow = this.add.graphics().setDepth(-16);
    glow.fillStyle(0xffe1a1, 0.22);
    glow.fillRect(0, top - tile * 0.5, width, tile * 0.8);
    glow.fillStyle(0x7fd8ff, 0.14);
    glow.fillRect(0, top + tile * 0.6, width, bandHeight);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.7, to: 1 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // The galaxy place's ground: the painted ocean-galaxy you stand ON. A file-first
  // painted override (galaxy-ground.png) replaces it whole; otherwise it is
  // COMPOSED from the SAME paintings as the ending's terminal CSS frame — the
  // galaxy sky pinned across the top down to a horizon, the starlit water below,
  // with an alpha-gradient blend band fading the water's top edge over the sky so
  // there is no hard horizon seam. No vignette and no procedural stars/light-pools:
  // the paintings already carry the stars, and the finale wants full even
  // brightness (matching the ending frame it cross-fades from).
  private createGalaxyGround(tilemap: Phaser.Tilemaps.Tilemap): void {
    const width = tilemap.widthInPixels;
    const height = tilemap.heightInPixels;

    if (this.textures.exists(GALAXY_GROUND_KEY)) {
      this.add
        .image(0, 0, GALAXY_GROUND_KEY)
        .setOrigin(0, 0)
        .setDepth(-20)
        .setDisplaySize(width, height);
      return;
    }

    this.composeGalaxyGround(width, height);
  }

  // Bakes the painted galaxy backdrop into a single canvas texture and lays it at
  // depth -20. Mirrors `.ending-ocean__sky` / `.ending-ocean__water` from the CSS
  // frame: the sky is cover-scaled across the top down to the horizon; the water is
  // cover-scaled from the horizon to the bottom and masked with a linear alpha
  // gradient so its top edge fades over the sky through the blend band. The horizon
  // sits ABOVE the walkable area — ____ (feet y≈464) and both spawns (y=640, 768)
  // land clearly on the water — so it is pushed up from the CSS frame's ~48–60%
  // band to ~30–43% of the map height (see galaxy-restore note). Cover-scaling the
  // water into the tall water box fills it edge-to-edge with no tiling seams even
  // though the map is taller than the art's aspect.
  private composeGalaxyGround(width: number, height: number): void {
    const key = 'galaxy-backdrop';
    if (!this.textures.exists(key)) {
      const canvas = this.textures.createCanvas(key, width, height);
      const ctx = canvas?.getContext();
      if (canvas && ctx) {
        // Deep base so any fully-transparent edge of the art never shows through.
        ctx.fillStyle = '#0a1226';
        ctx.fillRect(0, 0, width, height);

        // Blend band: sky fully visible above blendTop; water fully opaque below
        // blendBottom; the water's top edge ramps 0→1 across the band, over the sky.
        const blendTop = height * 0.3;
        const blendBottom = height * 0.43;

        if (this.textures.exists(ENDING_SKY_KEY)) {
          const sky = this.textures.get(ENDING_SKY_KEY).getSourceImage() as CanvasImageSource & {
            width: number;
            height: number;
          };
          // Sky covers the top of the map down through the blend band so the water
          // fades over painted sky (not the flat base) inside the band.
          this.drawCover(ctx, sky, 0, 0, width, blendBottom);
        }

        if (this.textures.exists(ENDING_WATER_KEY)) {
          const water = this.textures.get(ENDING_WATER_KEY).getSourceImage() as CanvasImageSource & {
            width: number;
            height: number;
          };
          // Paint the water onto its own layer so the vertical alpha gradient masks
          // ONLY the water (leaving the sky above untouched), then composite it.
          const layer = document.createElement('canvas');
          layer.width = width;
          layer.height = height;
          const lctx = layer.getContext('2d');
          if (lctx) {
            this.drawCover(lctx, water, 0, blendTop, width, height - blendTop);
            lctx.globalCompositeOperation = 'destination-in';
            const mask = lctx.createLinearGradient(0, blendTop, 0, blendBottom);
            mask.addColorStop(0, 'rgba(0,0,0,0)');
            mask.addColorStop(1, 'rgba(0,0,0,1)');
            lctx.fillStyle = mask;
            lctx.fillRect(0, blendTop, width, height - blendTop);
            ctx.drawImage(layer, 0, 0);
          }
        }

        canvas.refresh();
      }
    }
    this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-20);
  }

  // Draws a source image into the target rect using CSS `background-size: cover`
  // semantics: scale to fill the box (preserving aspect), centred, cropping the
  // overflow. Clipped to the box so it never bleeds past its region.
  private drawCover(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource & { width: number; height: number },
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    const sw = source.width;
    const sh = source.height;
    const scale = Math.max(dw / sw, dh / sh);
    const drawW = sw * scale;
    const drawH = sh * scale;
    const offsetX = dx + (dw - drawW) / 2;
    const offsetY = dy + (dh - drawH) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
    ctx.drawImage(source, offsetX, offsetY, drawW, drawH);
    ctx.restore();
  }

  // ____, waiting at the warm glow in the centre of the galaxy water for the
  // final conversation. He idles in place (facing down, toward the path ____
  // climbs). A soft warm pool marks him — the one warm point in the dark.
  private createGalaxyScenery(): void {
    if (this.location.id !== 'final-spot') {
      return;
    }
    this.createMoteTexture();
    const pos = { x: 704, y: 464 };

    const glow = this.add
      .image(pos.x, pos.y + 6, 'awaken-mote')
      .setDepth(pos.y - 2)
      .setScale(11)
      .setTint(0xffcf8a)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.38, to: 0.6 },
      scale: { from: 10.4, to: 11.6 },
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.createFriendTwoAnimation();
    const friendtwo = this.add
      .sprite(pos.x, pos.y, FRIEND_TWO_SPRITE.key, FRIEND_TWO_SPRITE.idleDownStartFrame)
      .setOrigin(FRIEND_TWO_SPRITE.origin.x, FRIEND_TWO_SPRITE.origin.y)
      .setScale(FRIEND_TWO_SPRITE.scale)
      .setDepth(pos.y + 4);
    if (this.anims.exists(FRIEND_TWO_SPRITE.idleAnimationKey)) {
      friendtwo.play(FRIEND_TWO_SPRITE.idleAnimationKey);
    }
  }

  private createFriendTwoAnimation(): void {
    if (
      this.anims.exists(FRIEND_TWO_SPRITE.idleAnimationKey) ||
      !this.textures.exists(FRIEND_TWO_SPRITE.key)
    ) {
      return;
    }
    this.anims.create({
      key: FRIEND_TWO_SPRITE.idleAnimationKey,
      frames: this.anims.generateFrameNumbers(FRIEND_TWO_SPRITE.key, {
        start: FRIEND_TWO_SPRITE.idleDownStartFrame,
        end: FRIEND_TWO_SPRITE.idleDownStartFrame + FRIEND_TWO_SPRITE.idleDownFrameCount - 1,
      }),
      frameRate: FRIEND_TWO_SPRITE.idleFrameRate,
      repeat: -1,
    });
  }

  // Once every letter is held the outdoor world subtly awakens: a warm golden
  // wash pulls over the scene and drifting light-motes rise across the area.
  // Gentle by design — a change in the air, not a filter slammed on top.
  private applyOutdoorAwakening(): void {
    if (!this.isOutdoor() || this.getProjection().mode !== 'flat') {
      return;
    }
    if (!isFinalSpotUnlocked(this.state)) {
      return;
    }

    // Warm tint pull, camera-fixed and low, layered under the HUD.
    const tint = this.add
      .rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0xffcf7a, 0.1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(895);
    this.tweens.add({
      targets: tint,
      alpha: { from: 0.06, to: 0.13 },
      duration: 4200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.spawnLightMotes();
  }

  // Post-violin awakening for a dressed interior (recipient-house): golden light
  // shafts stream through the window and the exit doormat shines, once every
  // keepsake is held. Applied statically on entry (animate:false) and
  // dynamically the instant the violin completes (animate:true, a ~1.5s fade-in
  // so the beat lands while ____ is still at the stand). Idempotent per scene
  // life via `interiorAwakened`; scoped to dressed rooms and the final unlock.
  private applyInteriorAwakening(options: { animate: boolean }): void {
    if (this.interiorAwakened) {
      return;
    }
    if (!this.dressing || !this.projection?.movementOrigin) {
      return;
    }
    if (!isFinalSpotUnlocked(this.state)) {
      return;
    }

    this.interiorAwakened = true;
    // Floor rect in map px (inset from the map edges, mirroring renderRoomDressing)
    // so the awakening can locate the open front edge for the doorway light spill.
    const inset = this.dressing.floorInsetTiles;
    const tile = this.mapDims.tileSize;
    const floorMapRect = {
      x0: inset * tile,
      y0: inset * tile,
      x1: this.mapDims.width - inset * tile,
      y1: this.mapDims.height - inset * tile,
    };
    renderInteriorAwakening(
      this,
      this.dressing,
      this.exits.map((exit) => ({
        x: exit.x,
        y: exit.y,
        width: exit.width,
        height: exit.height,
      })),
      this.projection.movementOrigin,
      { fadeInMs: options.animate ? 1500 : 0, floorMapRect },
    );
    // Mirror onto the DOM so smoke tests can assert the awakening appeared
    // (Phaser objects are not queryable from Playwright).
    document.body.dataset.interiorAwakened = 'true';
  }

  private spawnLightMotes(): void {
    this.createMoteTexture();
    // Seeded like the outdoor ground so the mote field is stable across reloads.
    const rng = mulberry32(fnv1a(`${this.location.id}:motes`));
    const count = 16;
    for (let i = 0; i < count; i += 1) {
      const x = rng() * this.mapDims.width;
      const y = rng() * this.mapDims.height;
      const mote = this.add
        .image(x, y, 'awaken-mote')
        .setDepth(y + 6)
        .setAlpha(0)
        .setScale(0.5 + rng() * 0.9);
      const drift = 24 + rng() * 40;
      this.tweens.add({
        targets: mote,
        alpha: { from: 0, to: 0.5 + rng() * 0.3 },
        duration: 1400 + rng() * 1200,
        yoyo: true,
        hold: 400 + rng() * 800,
        repeat: -1,
        repeatDelay: rng() * 1600,
        delay: rng() * 2400,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: mote,
        y: y - drift,
        x: x + (rng() - 0.5) * drift,
        duration: 5000 + rng() * 4000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private createMoteTexture(): void {
    if (this.textures.exists('awaken-mote')) {
      return;
    }
    const graphics = this.add.graphics();
    graphics.fillStyle(0xfff2c8, 0.9);
    graphics.fillCircle(8, 8, 3);
    graphics.fillStyle(0xffe1a1, 0.35);
    graphics.fillCircle(8, 8, 7);
    graphics.generateTexture('awaken-mote', 16, 16);
    graphics.destroy();
  }

  // Stamps overlapping circles from `from` to `to` — a soft, round-capped worn
  // trail. All fills use alpha 1 (the caller sets the graphics' overall alpha),
  // so overlaps never darken unevenly.
  private stampPath(
    graphics: Phaser.GameObjects.Graphics,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: number,
    halfWidth: number,
  ): void {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(2, Math.round(distance / (halfWidth * 0.7)));
    graphics.fillStyle(color, 1);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      graphics.fillCircle(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, halfWidth);
    }
  }

  private drawHedgeBand(
    graphics: Phaser.GameObjects.Graphics,
    edge: 'north' | 'south' | 'east' | 'west',
    width: number,
    height: number,
    tile: number,
    pal: OutdoorPalette,
    rng: () => number,
  ): void {
    const horizontal = edge === 'north' || edge === 'south';
    let x = 0;
    let y = 0;
    let w = width;
    let h = height;
    if (edge === 'north') h = tile;
    if (edge === 'south') {
      y = height - tile;
      h = tile;
    }
    if (edge === 'west') w = tile;
    if (edge === 'east') {
      x = width - tile;
      w = tile;
    }

    graphics.fillStyle(pal.border, 1);
    graphics.fillRect(x, y, w, h);

    const span = horizontal ? width : height;
    const blobs = Math.max(3, Math.round(span / (tile * 0.55)));
    for (let i = 0; i < blobs; i += 1) {
      const along = ((i + 0.5) / blobs) * span;
      const jitter = (rng() - 0.5) * tile * 0.3;
      const bx = horizontal ? along + jitter : x + tile * 0.5;
      const by = horizontal ? y + tile * 0.5 : along + jitter;
      const r = tile * (0.34 + rng() * 0.14);
      graphics.fillStyle(pal.borderStroke, 1);
      graphics.fillCircle(bx, by, r);
      graphics.fillStyle(pal.border, 1);
      graphics.fillCircle(bx - 2, by - 2, r * 0.68);
    }
  }

  private createPlayer(): void {
    const mapJson = this.getMapJson();
    // Edge arrivals pass explicit map-space coords; doors/testMode use a named
    // spawn point on the destination map's Spawns layer.
    const spawn =
      this.spawnOverride ??
      getPointObject(mapJson, 'Spawns', this.registry.get('spawnId') as string);

    this.createRecipientAnimations();
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'player-temp');
    this.player.setVisible(false);
    this.player.setDepth(10);
    this.player.setCollideWorldBounds(true);
    this.player.body?.setSize(36, 32);
    this.player.body?.setOffset(30, 86);
    this.playerVisual = this.add
      .sprite(0, 0, RECIPIENT_SPRITE.key, RECIPIENT_IDLE_ROW_START_FRAME.down)
      .setOrigin(RECIPIENT_SPRITE.origin.x, RECIPIENT_SPRITE.origin.y)
      .setScale(RECIPIENT_SPRITE.scale)
      .setDepth(10);
    this.syncPlayerVisual();

    if (this.walls) {
      this.physics.add.collider(this.player, this.walls);
    }

    if (this.propColliderBodies.length > 0) {
      this.physics.add.collider(this.player, this.propColliderBodies);
    }

    this.controller = new PlayerController(this, this.player, {
      // Flat locations have no movement origin, so input drives the body straight
      // along map axes; iso locations skew it into the diamond plane.
      movementProjection: this.getProjection().movementOrigin,
    });
    this.cameras.main.startFollow(this.playerVisual, true, 0.12, 0.12);
    // Deadzone is world px; divide by zoom so it keeps its designed ON-SCREEN
    // size (240x180) on zoomed-in small maps instead of feeling oversized.
    this.cameras.main.setDeadzone(240 / this.cameraZoom, 180 / this.cameraZoom);
  }

  private createHud(): void {
    getUiRoot().insertAdjacentHTML('beforeend', renderCollectionPanel(this.state));
  }

  private createLocationLabel(): void {
    this.add
      .text(this.fixedScreenX(24), this.fixedScreenY(24), this.location.title, {
        color: '#fff7e8',
        backgroundColor: '#1b1f1f',
        padding: { x: 14, y: 10 },
        fontSize: '20px',
        fontStyle: '700',
      })
      .setScrollFactor(0)
      .setScale(1 / this.cameraZoom)
      .setDepth(1000);
  }

  private createWorldMarkers(): void {
    // Dressed rooms show art props instead of the debug interact rects. Pass
    // ?dressDebug=1 (or ?editZones=1) to overlay the rects again for alignment.
    // The galaxy final-spot is likewise "dressed": ____'s sprite IS the marker.
    if ((this.dressing || this.location.id === 'final-spot') && !this.showColliderDebug) {
      return;
    }

    // Outdoor door exits are shown as a glowing doormat (createOutdoorDoorMarkers)
    // instead of a debug rect, unless the collider debug overlay is on.
    if (!this.isOutdoor() || this.showColliderDebug) {
      for (const exit of this.exits) {
        this.createWorldMarker(exit, 0x74c7ec, this.getObjectLabel(exit));
      }
    }

    for (const interaction of this.interactions) {
      this.createWorldMarker(interaction, 0xf1d79a, this.getObjectLabel(interaction));
    }
  }

  private isOutdoor(): boolean {
    return this.location.kind === 'outdoor';
  }

  // Renders house-exterior billboards for an outdoor area: bottom-center
  // anchored at their map position, y-sorted against the player so ____ can
  // walk behind them. Returns solid base footprints (map px) to collide.
  private renderOutdoorExteriors(): PropColliderRect[] {
    const colliders: PropColliderRect[] = [];

    for (const exterior of getExteriors(this.location.id)) {
      this.renderExterior(exterior);
      colliders.push({
        x: exterior.mapX - exterior.footprint.w / 2,
        y: exterior.mapY - exterior.footprint.d,
        width: exterior.footprint.w,
        height: exterior.footprint.d,
      });
    }

    return colliders;
  }

  private renderExterior(exterior: ExteriorPlacement): void {
    const key = exteriorTextureKey(exterior.asset);
    const anchor = this.getProjection().project(exterior.mapX, exterior.mapY);
    const texture = this.textures.get(key);
    const sourceHeight = texture.getSourceImage().height || 360;
    const scale = (PLAYER_VISUAL_HEIGHT_PX * exterior.heightRatio) / sourceHeight;

    this.add
      .image(anchor.x, anchor.y, key)
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(anchor.y);
  }

  // A soft pulsing glow doormat, laid flat in the floor plane at each door exit
  // rect, so doorways on the (undressed) outdoor maps are findable.
  private createOutdoorDoorMarkers(): void {
    if (!this.isOutdoor()) {
      return;
    }

    const projection = this.getProjection();
    for (const exit of this.exits) {
      const polygon = this.toPhaserPoints(
        projection.rectCorners(exit.x, exit.y, exit.width, exit.height),
      );
      const glow = this.add.graphics().setDepth(-8);
      glow.fillStyle(0xffca74, 0.3);
      glow.fillPoints(polygon, true);
      glow.lineStyle(3, 0xffe1a1, 0.85);
      glow.strokePoints(polygon, true);

      this.tweens.add({
        targets: glow,
        alpha: { from: 0.55, to: 1 },
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private createWorldMarker(object: RectObject, color: number, label: string): void {
    const projection = this.getProjection();
    const center = projection.project(object.x + object.width / 2, object.y + object.height / 2);
    const marker = this.add.graphics().setDepth(4);
    const polygon = this.toPhaserPoints(
      projection.rectCorners(object.x, object.y, object.width, object.height),
    );

    marker.fillStyle(color, 0.28);
    marker.fillPoints(polygon, true);
    marker.lineStyle(3, color, 0.9);
    marker.strokePoints(polygon, true);

    this.add
      .text(center.x, center.y - 10, label, {
        color: '#1b1f1f',
        backgroundColor: '#fff7e8',
        padding: { x: 8, y: 5 },
        fontSize: '14px',
        fontStyle: '700',
        wordWrap: { width: Math.max(112, Math.min(192, object.width + 72)) },
      })
      .setOrigin(0.5, 1)
      .setDepth(5);
  }

  private createIsoOrigin(tilemap: Phaser.Tilemaps.Tilemap): IsoOrigin {
    return {
      x: tilemap.heightInPixels / 2 + tilemap.tileWidth * 2,
      y: tilemap.tileHeight * 1.5,
      verticalScale: 0.5,
    };
  }

  private drawIsoSideFace(
    graphics: Phaser.GameObjects.Graphics,
    edge: readonly [IsoPoint, IsoPoint],
    depth: number,
    color: number,
  ): void {
    graphics.fillStyle(color, 1);
    graphics.fillPoints(
      this.toPhaserPoints([
        edge[0],
        edge[1],
        { x: edge[1].x, y: edge[1].y + depth },
        { x: edge[0].x, y: edge[0].y + depth },
      ]),
      true,
    );
  }

  private syncPlayerVisual(): void {
    if (!this.playerVisual) {
      return;
    }

    const position = this.getProjection().project(this.player.x, this.player.y);
    const idleOffset = this.getIdleOffset();
    this.playerVisual.setPosition(position.x, position.y + idleOffset);
    this.playerVisual.setDepth(position.y + 10);
    this.maybeSpawnWalkDust(position);
    this.updatePlayerVisualAnimation();
  }

  private createRecipientAnimations(): void {
    this.createWalkDustTexture();

    for (const facing of PLAYER_FACINGS) {
      const walkKey = RECIPIENT_WALK_ANIMATIONS[facing];
      const idleKey = RECIPIENT_IDLE_ANIMATIONS[facing];
      const sourceFacing = RECIPIENT_ANIMATION_SOURCE_FACING[facing];
      const walkStart = RECIPIENT_WALK_ROW_START_FRAME[sourceFacing];
      const walkFrameCount = RECIPIENT_WALK_FRAME_COUNTS[facing];
      const idleStart = RECIPIENT_IDLE_ROW_START_FRAME[sourceFacing];
      const idleFrameCount = RECIPIENT_IDLE_FRAME_COUNTS[facing];

      if (!this.anims.exists(walkKey)) {
        this.anims.create({
          key: walkKey,
          frames: this.anims.generateFrameNumbers(RECIPIENT_SPRITE.key, {
            start: walkStart,
            end: walkStart + walkFrameCount - 1,
          }),
          frameRate: RECIPIENT_SPRITE.walkFrameRate,
          repeat: -1,
        });
      }

      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: this.anims.generateFrameNumbers(RECIPIENT_SPRITE.key, {
            start: idleStart,
            end: idleStart + idleFrameCount - 1,
          }),
          frameRate: RECIPIENT_SPRITE.idleFrameRate,
          repeat: -1,
        });
      }
    }
  }

  private createWalkDustTexture(): void {
    if (this.textures.exists(RECIPIENT_WALK_DUST.key)) {
      return;
    }

    const graphics = this.add.graphics();
    graphics.fillStyle(RECIPIENT_WALK_DUST.color, 1);
    graphics.fillEllipse(11, 7, 20, 9);
    graphics.fillEllipse(21, 8, 12, 6);
    graphics.generateTexture(RECIPIENT_WALK_DUST.key, 30, 16);
    graphics.destroy();
  }

  private updatePlayerVisualAnimation(): void {
    const visual = this.playerVisual;

    if (!visual) {
      return;
    }

    const velocity = this.player.body?.velocity;

    if (!velocity || velocity.lengthSq() < 1) {
      this.syncPlayerVisualFlip();

      if (this.time.now < this.tapStepHoldUntil) {
        visual.stop();
        visual.setFrame(this.getCurrentTapStepFrame());
        this.wasPlayerMoving = false;
        return;
      }

      visual.play(RECIPIENT_IDLE_ANIMATIONS[this.playerFacing], true);
      this.wasPlayerMoving = false;
      return;
    }

    const previousFacing = this.playerFacing;
    const screenVelocity = this.getProjection().mapVelocityToScreen(velocity.x, velocity.y);
    this.playerFacing = getPlayerFacingFromScreenMovement(screenVelocity, this.playerFacing);
    this.syncPlayerVisualFlip();

    visual.play(RECIPIENT_WALK_ANIMATIONS[this.playerFacing], true);

    if (!this.wasPlayerMoving || previousFacing !== this.playerFacing) {
      visual.setFrame(this.advanceTapStepFrame(this.playerFacing));
      this.tapStepHoldUntil = this.time.now + RECIPIENT_TAP_STEP_HOLD_MS;
    }

    this.wasPlayerMoving = true;
  }

  private maybeSpawnWalkDust(position: IsoPoint): void {
    const velocity = this.player.body?.velocity;

    if (
      !velocity ||
      velocity.lengthSq() < 1 ||
      this.time.now - this.lastWalkDustAt < RECIPIENT_WALK_DUST.intervalMs
    ) {
      return;
    }

    this.lastWalkDustAt = this.time.now;
    this.walkDustFootSide *= -1;

    const screenVelocity = this.getProjection().mapVelocityToScreen(velocity.x, velocity.y);
    const screenDirection = new Phaser.Math.Vector2(screenVelocity.x, screenVelocity.y).normalize();
    const sideOffset = this.walkDustFootSide * RECIPIENT_WALK_DUST.sideOffsetPixels;
    const trailingOffsetX = -screenDirection.x * 7;
    const trailingOffsetY = -screenDirection.y * 4;
    const jitter = Phaser.Math.Between(-RECIPIENT_WALK_DUST.jitterPixels, RECIPIENT_WALK_DUST.jitterPixels);
    const dust = this.add
      .image(
        position.x + sideOffset + trailingOffsetX + jitter,
        position.y + RECIPIENT_WALK_DUST.footYOffset + trailingOffsetY,
        RECIPIENT_WALK_DUST.key,
      )
      .setOrigin(0.5)
      .setAlpha(RECIPIENT_WALK_DUST.alpha)
      .setScale(RECIPIENT_WALK_DUST.startScale)
      .setDepth(position.y + 8);

    this.tweens.add({
      targets: dust,
      alpha: 0,
      scaleX: RECIPIENT_WALK_DUST.endScale,
      scaleY: RECIPIENT_WALK_DUST.endScale,
      y: dust.y + 2,
      duration: RECIPIENT_WALK_DUST.lifespanMs,
      ease: 'Quad.easeOut',
      onComplete: () => dust.destroy(),
    });
  }

  private advanceTapStepFrame(facing: PlayerFacing): number {
    const offsets = RECIPIENT_TAP_STEP_FRAME_OFFSETS[facing];
    const index = this.tapStepFrameByFacing[facing] % offsets.length;
    const sourceFacing = RECIPIENT_ANIMATION_SOURCE_FACING[facing];

    this.tapStepFrameByFacing[facing] = index + 1;
    return RECIPIENT_WALK_ROW_START_FRAME[sourceFacing] + offsets[index];
  }

  private getCurrentTapStepFrame(): number {
    const offsets = RECIPIENT_TAP_STEP_FRAME_OFFSETS[this.playerFacing];
    const nextIndex = this.tapStepFrameByFacing[this.playerFacing] % offsets.length;
    const currentIndex = (nextIndex - 1 + offsets.length) % offsets.length;
    const sourceFacing = RECIPIENT_ANIMATION_SOURCE_FACING[this.playerFacing];

    return RECIPIENT_WALK_ROW_START_FRAME[sourceFacing] + offsets[currentIndex];
  }

  private syncPlayerVisualFlip(): void {
    this.playerVisual?.setFlipX(RECIPIENT_FLIP_X_BY_FACING[this.playerFacing]);
  }

  private getIdleOffset(): number {
    const velocity = this.player.body?.velocity;

    if (velocity && velocity.lengthSq() >= 1) {
      return 0;
    }

    if (this.time.now < this.tapStepHoldUntil) {
      return 0;
    }

    return (
      Math.sin((this.time.now / RECIPIENT_SPRITE.idleBobDurationMs) * Math.PI * 2) *
      RECIPIENT_SPRITE.idleBobPixels
    );
  }

  private getProjection(): Projection {
    if (!this.projection) {
      throw new Error('Projection is unavailable before map creation');
    }

    return this.projection;
  }

  private toPhaserPoints(points: readonly IsoPoint[]): Phaser.Geom.Point[] {
    return points.map((point) => new Phaser.Geom.Point(point.x, point.y));
  }

  private refreshCollectionPanel(): void {
    getUiRoot().querySelector('.collection-panel')?.remove();
    this.createHud();
  }

  private getMapJson(): TiledMapJson {
    return this.cache.tilemap.get(this.location.mapKey).data as TiledMapJson;
  }

  private findActiveObject(): RectObject | undefined {
    // Exits win when the player is actually standing on one, tested against the
    // compact physics body (feet) rather than the tall sprite bounds. This lets
    // an exit sit under a taller interactable's rect (e.g. the doormat below the
    // desk PC) and still be usable — the player's full bounds always overlap the
    // PC rect, so a bounds test could never surface the exit there.
    const body = this.player.body;

    if (body) {
      const feet = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
      const onExit = this.exits.find((exit) =>
        Phaser.Geom.Intersects.RectangleToRectangle(feet, this.toRectangle(exit)),
      );

      if (onExit) {
        return onExit;
      }
    }

    const playerBounds = this.player.getBounds();
    const objects = [...this.interactions, ...this.exits];

    return objects.find((object) =>
      Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, this.toRectangle(object)),
    );
  }

  private toRectangle(object: RectObject): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(object.x, object.y, object.width, object.height);
  }

  private getObjectLabel(object: RectObject): string {
    const matchingExit = this.location.exits.find((exit) => exit.id === object.id);

    if (matchingExit) {
      return matchingExit.label;
    }

    const matchingInteraction = this.location.interactions.find(
      (interaction) => interaction.id === object.id,
    );

    return matchingInteraction?.label ?? object.id;
  }

  private async activateObject(object: RectObject): Promise<void> {
    const exit = this.location.exits.find((candidate) => candidate.id === object.id);

    if (exit) {
      if (exit.requiresFinalUnlock && !isFinalSpotUnlocked(this.state)) {
        await this.pauseForDialogue([{ text: FINAL_LOCKED_LINE }]);
        return;
      }

      this.scene.restart({
        locationId: exit.destinationLocationId,
        spawnId: exit.destinationSpawnId,
        state: this.state,
      } satisfies LocationSceneData);
      return;
    }

    const interaction = this.location.interactions.find(
      (candidate) => candidate.id === object.id,
    );

    if (interaction) {
      await this.activateInteraction(interaction);
    }
  }

  private async activateInteraction(interaction: LocationInteraction): Promise<void> {
    playSfx('sfx-interact');
    if (isInteractionLocked(interaction, this.state)) {
      if (interaction.lockedDialogue) {
        await this.pauseForDialogue(interaction.lockedDialogue);
      }
      return;
    }

    // After the ending, the photo wall opens as a full-screen collage instead of
    // its ordinary dialogue.
    if (interaction.photoWallAfterEnding && this.state.endingCompleted) {
      this.canMove = false;
      await showPhotoWall();
      this.canMove = true;
      return;
    }

    if (interaction.dialogue) {
      await this.pauseForDialogue(interaction.dialogue);
    }

    // The terminal ending beat: the conversation just closed → the two short
    // final letters, then the persistent letters screen. The ending completes here.
    if (interaction.endingConversation) {
      await this.runTerminalEnding();
      return;
    }

    if (interaction.kind === 'activity') {
      await this.startActivity(interaction.activityId);
    }
  }

  // The ending's tail, once the galaxy conversation with ____ closes. Freezes
  // the live scene and releases key capture so keys held under the (non-capturing)
  // overlays can't drive the player, shows the two short final letters over the
  // galaxy, marks the ending complete, then sleeps the scene beneath the
  // persistent letters screen (whose "go home" restarts the world).
  private async runTerminalEnding(): Promise<void> {
    this.canMove = false;
    this.input.keyboard?.disableGlobalCapture();

    for (const letter of FINAL_ENDING_LETTERS) {
      await showLetterModal(letter as readonly DialogueLine[]);
    }

    this.state = markEndingCompleted(this.state);
    this.registry.set('runState', this.state);

    this.scene.sleep();
    showLettersScreen({ host: getUiRoot(), fadeIn: true, onGoHome: () => this.goHome() });
  }

  // Cross-fades the ending transition's held galaxy frame out to reveal the live,
  // playable galaxy scene beneath, then hands ____ control. Movement is frozen
  // until the frame is fully gone, so no input reaches the scene mid-reveal.
  private async revealGalaxyArrival(overlayMount: HTMLElement): Promise<void> {
    const testMode = new URLSearchParams(window.location.search).get('testMode') === '1';
    const fadeMs = testMode ? 40 : 1500;
    overlayMount.style.pointerEvents = 'none';
    overlayMount.style.transition = `opacity ${fadeMs}ms ease`;
    void overlayMount.offsetWidth;
    overlayMount.style.opacity = '0';
    await new Promise<void>((resolve) => window.setTimeout(resolve, fadeMs));
    overlayMount.remove();
    this.canMove = true;
  }

  private async pauseForDialogue(lines: readonly DialogueLine[]): Promise<void> {
    this.canMove = false;
    await showDialogue(lines);
    this.canMove = true;
  }

  private async startActivity(activityId: string): Promise<void> {
    this.canMove = false;
    // Activities are full-screen modals running in their OWN Phaser game. Put
    // this heavy room scene to sleep (no update, no render) while one is mounted,
    // so only one WebGL scene draws at a time — this roughly halves the render
    // load for EVERY activity (and lets the activity's own game hit frame). The
    // completion/cancel callbacks are DOM/other-game driven and wake it again.
    this.scene.sleep();
    // Release this game's global key-capture while the modal is up. The activity
    // runs in a SEPARATE Phaser game; once THIS game's window keydown listener
    // preventDefaults a captured key (e.g. A/S/D from WASD movement), the other
    // game's listener bails on `event.defaultPrevented` and never sees the key.
    // Dropping preventDefault here lets the activity read shared keys (the room
    // is asleep and needs none). Re-enabled on wake.
    this.input.keyboard?.disableGlobalCapture();
    const wakeScene = () => {
      this.input.keyboard?.enableGlobalCapture();
      if (this.scene.isSleeping()) {
        this.scene.wake();
      }
    };
    const activity = getActivity(activityId);
    const root = getUiRoot();
    const activityMount = document.createElement('div');
    root.append(activityMount);

    const activityMusic = ACTIVITY_MUSIC_BY_ID[activityId];
    if (activityMusic) {
      playMusic(activityMusic, { fadeMs: 900 });
    }
    const resumeLocationMusic = () => {
      if (activityMusic) {
        playMusic(locationMusicKey(this.location.id), { fadeMs: 1200 });
      }
    };

    await activity.start({
      state: this.state,
      mount: activityMount,
      onGoHome: () => this.goHome(),
      onCancel: () => {
        activityMount.remove();
        wakeScene();
        resumeLocationMusic();
        this.canMove = true;
      },
      onComplete: async (completion) => {
        // The ending's frame-sequence transition hands off to the live, playable
        // galaxy scene. Wake this scene so it renders beneath the held galaxy
        // frame (still up in the activity mount), record the activity, then
        // cross-fade that frame out and hand ____ control on the galaxy water.
        // Movement stays frozen through the fade so no input leaks to the scene.
        if (completion.endingArrival) {
          wakeScene();
          this.state = completeLocation(this.state, completion);
          this.registry.set('runState', this.state);
          await this.revealGalaxyArrival(activityMount);
          return;
        }

        activityMount.remove();

        // The terminal ending is the ONLY completion that mounts the persistent
        // letters screen and must leave the scene asleep with input released. Key
        // that on the ending activity's OWN identity (its 'ending-light'
        // keepsake), NOT on locationId 'final-spot' — otherwise any activity that
        // merely wants to travel INTO final-spot (the origami ritual's travelTo)
        // would be mistaken for the ending and stranded asleep.
        const isEndingCompletion = completion.keepsakeId === ENDING_KEEPSAKE_ID;

        // The ending is terminal: the final activity mounts the persistent
        // letters screen over everything and this room is never returned to.
        // Keep the scene ASLEEP with global key-capture released and movement
        // disabled so keys held under the (non-capturing) letters overlay can't
        // drive the still-live player into a north edge transition — which would
        // reload into 'clearing' and stomp the ending's 'music-ending' bed. Only
        // the normal completion path restores control.
        if (!isEndingCompletion) {
          wakeScene();
          resumeLocationMusic();
        }
        if (this.location.keepsake) {
          playSfx('sfx-keepsake');
        }
        this.state = completeLocation(this.state, completion);

        if (isEndingCompletion) {
          this.state = markEndingCompleted(this.state);
          this.registry.set('runState', this.state);
          // Terminal: do not wake, do not restore control. Scene stays asleep.
          return;
        }

        this.registry.set('runState', this.state);

        // The awakening is the emotional beat: apply it the instant the violin
        // completes (the scene woke without re-running create()), fading the
        // golden shafts + doormat shine in over ~1.5s while ____ is still at
        // the stand — before the reward letter and any travel. Gated internally
        // on the final unlock, so only the run-completing keepsake triggers it.
        this.applyInteriorAwakening({ animate: true });

        if (this.location.rewardMessage && this.location.rewardPresentation === 'letter') {
          await showLetterModal(this.location.rewardMessage);
        } else if (this.location.rewardMessage) {
          await this.pauseForDialogue(this.location.rewardMessage);
        }

        // Some activities deliver the player elsewhere on completion (the origami
        // ritual carries her INTO the lantern clearing). Restart into that
        // destination instead of resuming the current location.
        if (completion.travelTo) {
          this.scene.restart({
            locationId: completion.travelTo.locationId,
            spawnId: completion.travelTo.spawnId,
            autoStartActivityId: completion.travelTo.autoStartActivityId,
            state: this.state,
          } satisfies LocationSceneData);
          return;
        }

        this.refreshCollectionPanel();
        this.canMove = true;
      },
    });
  }

  /**
   * The quiet return from the ending's terminal letters screen. Dismisses the
   * persistent overlay and restarts the world into ____'s awakened room with
   * control restored — the game's soft landing. `endingCompleted` is already set,
   * so the room comes up in its golden state and the photo wall reveals.
   */
  private goHome(): void {
    // Re-arm this game's key capture (released while the terminal activity ran)
    // and clear the persistent letters overlay before we leave.
    this.input.keyboard?.enableGlobalCapture();
    if (this.scene.isSleeping()) {
      this.scene.wake();
    }
    clearUiRoot();
    this.scene.restart({
      locationId: 'recipient-house',
      spawnId: 'near-pc',
      state: this.state,
    } satisfies LocationSceneData);
  }
}
