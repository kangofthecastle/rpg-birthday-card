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
import { HOME_HOST_NPCS } from '../content/homeNpcs';
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
import { getRoomDressing, getRoomLayoutRemoved, type RoomDressing } from '../content/roomDressing';
import {
  renderExitDoormat,
  renderInteriorAwakening,
  renderRoomDressing,
  growBoundsFromObject,
  type PropColliderRect,
  type PropHandle,
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
  getOutdoorProps,
  getSignpost,
  exteriorTextureKey,
  propTextureKey,
  PROP_KINDS,
  GROUND_TILESET_KEY,
  GROUND_TILES,
  type ExteriorPlacement,
  type OutdoorPalette,
  type PropKind,
  type PropPlacement,
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
import {
  getObjectLayer,
  getPointObject,
  getRectObjects,
  type RectObject,
  type TiledMapJson,
} from '../game/mapHelpers';
import { getPlayerFacingFromScreenMovement, PlayerController } from '../game/playerController';
import { createCollectionPanel, type CollectionPanelHandle } from '../ui/collectionPanel';
import { showDialogue } from '../ui/dialogueBox';
import { clearUiRoot, getUiRoot } from '../ui/domRoot';
import { showLetterModal } from '../ui/letterModal';
import { showLettersScreen } from '../ui/lettersScreen';
import { showPhotoWall } from '../ui/photoWall';
import { fnv1a, mulberry32 } from '../game/rng';
import { SceneKeys } from './sceneKeys';

// --- Post-music-game outdoor awakening: tunable intensity --------------------
// When the player steps outside after the violin, the world should read as
// genuinely LIT UP — like walking into streaming daylight — carried by two
// headline knobs:
//   • additiveLift — peak alpha of a screen-wide warm ADDITIVE overlay that
//     raises the whole scene's exposure (the daylight itself, not a flat tint).
//   • the beckoning mote stream — `moteCount` bulbs flowing south toward the
//     clearing at `motePeakAlpha`, read as an unmistakable ribbon of light you
//     follow, not sparse ambient specks.
// MEDIUM is the shipped default. For the contact-sheet captures, set
// `window.__awakenTune` to 'before' | 'subtle' | 'medium' | 'strong' (or a
// partial object) before the outdoor scene builds; production never sets it.
interface OutdoorAwakenTune {
  /** Peak alpha of the screen-wide warm additive exposure lift (0 disables). */
  additiveLift: number;
  /** Number of glowing bulbs in the southward-streaming ribbon. */
  moteCount: number;
  /** Base peak alpha per bulb (a per-bulb +rng()*0.25 jitter rides on top). */
  motePeakAlpha: number;
  /**
   * When true, the beckoning motes form a concentrated, additive-glow RIBBON
   * down the central path toward the south exit — a continuous flow you'd follow.
   * When false (base look), they are a sparse, full-width, normal-blend field.
   */
  ribbon: boolean;
}
const OUTDOOR_AWAKEN_PRESETS: Record<string, OutdoorAwakenTune> = {
  // Faithful reproduction of base (36a55a2) outdoor behaviour: no exposure lift,
  // 16 sparse full-width motes, base peak alpha — used only for the BEFORE cap.
  before: { additiveLift: 0, moteCount: 16, motePeakAlpha: 0.4, ribbon: false },
  subtle: { additiveLift: 0.12, moteCount: 40, motePeakAlpha: 0.5, ribbon: true },
  medium: { additiveLift: 0.2, moteCount: 56, motePeakAlpha: 0.62, ribbon: true },
  strong: { additiveLift: 0.32, moteCount: 76, motePeakAlpha: 0.78, ribbon: true },
};
const OUTDOOR_AWAKEN_DEFAULT: OutdoorAwakenTune = OUTDOOR_AWAKEN_PRESETS.medium;

function resolveOutdoorAwakenTune(): OutdoorAwakenTune {
  const override = (globalThis as { __awakenTune?: unknown }).__awakenTune;
  if (typeof override === 'string' && OUTDOOR_AWAKEN_PRESETS[override]) {
    return OUTDOOR_AWAKEN_PRESETS[override];
  }
  if (override && typeof override === 'object') {
    return { ...OUTDOOR_AWAKEN_DEFAULT, ...(override as Partial<OutdoorAwakenTune>) };
  }
  return OUTDOOR_AWAKEN_DEFAULT;
}

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

// One paper crane drifting on the clearing's shore water. The image is the crane
// sprite; the ripple is a faint highlight ellipse tracked beneath it. Motion is
// integrated per frame from these tuning values (see spawnClearingCranes).
interface DriftingCrane {
  readonly image: Phaser.GameObjects.Image;
  readonly ripple: Phaser.GameObjects.Graphics;
  /** Un-varied display scale for this crane's texture (colour variants may drop
   * in at different resolutions), kept so wrap-around can re-vary from it. */
  readonly baseScale: number;
  /** Horizontal downstream drift, px/sec. */
  speed: number;
  /** Vertical bob amplitude (px) and its sine rate (rad/sec) + phase. */
  bobAmp: number;
  bobRate: number;
  bobPhase: number;
  /** Rotation wobble amplitude (rad), rate (rad/sec), phase, about a base heading. */
  rotBase: number;
  rotAmp: number;
  rotRate: number;
  rotPhase: number;
  /** Resting waterline Y (px) the bob oscillates around. */
  baseY: number;
  /** Display scale already applied (so respawn can re-vary it). */
  scale: number;
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

// ── Galaxy-vibe layer ────────────────────────────────────────────────────────
// A restrained cosmic-atmosphere layer laid OVER the painted final-spot backdrop
// (ending-sky.png + ending-water.png), so the water reads as "standing IN a
// galaxy" rather than "a sea at night" — WITHOUT burying the paintings the way
// the earlier rejected pass did (74 twinkle stars, heavy vignette, alpha-0.14+
// light pools). Everything here is deliberately low-alpha and slow. Every alpha
// and count is scaled by the single master INTENSITY knob so the author can dial
// the whole layer up or down from one number. Layout is keyed to the 1408×1024
// final-spot map: the painted horizon sits ~y307–440, so the "water region"
// (where all these effects live) is everything below ~y440. ____'s warm glow
// sits at (704, 464); the star field keeps a keep-out radius around it so the
// cool shimmer never fights the one warm point in the dark.
const GALAXY_VIBE = {
  // Master knob. 1.0 = shipped default. Scales alphas AND star/nebula counts.
  INTENSITY: 1.0,

  // ____'s warm glow centre (mirrors createGalaxyScenery's `pos`) — the star
  // field avoids clustering here so cool motes never crowd the warm point.
  warmGlow: { x: 704, y: 464, clearRadius: 190 },

  // Depths: all above the painted backdrop (−20) and below ____'s glow (~462)
  // and sprite (~468), so the layer reads as light ON the water, behind ____.
  depth: { grade: -19, nebula: -18, stars: -17 },

  // 1. Sparse star shimmer on the water: seeded twinkling motes, additive, LOW
  //    alpha (peak ~0.5× the rejected pass), slow gentle twinkle, water only.
  stars: {
    count: 30,
    minYFrac: 0.46, // fraction of map height — below the painted horizon
    peakAlphaMin: 0.16,
    peakAlphaMax: 0.24, // rejected pass peaked ~0.5; this is ~half
    scaleMin: 0.35,
    scaleMax: 0.85,
    tint: 0xbcd4ff, // cool starlight (awaken-mote is warm; tint cools it)
    twinkleMinMs: 2600,
    twinkleMaxMs: 4200,
    holdMinMs: 500,
    holdMaxMs: 1400,
  },

  // 2. Nebula drift: a few large, very soft violet/indigo additive pools crawling
  //    extremely slowly across the water — atmosphere, not spotlights.
  nebula: {
    count: 3,
    alphaMin: 0.06,
    alphaMax: 0.09,
    colors: [0x8b5cf6, 0x4c3f9e, 0x6d5ce0],
    radiusMin: 240,
    radiusMax: 420,
    driftPx: 90, // total crawl distance across a full (very long) cycle
    driftMinMs: 26000,
    driftMaxMs: 42000,
  },

  // 3. Cool grade with depth: a subtle indigo tint over the water that deepens
  //    toward the bottom/far edges so the expanse reads "cosmic void reflection."
  //    A COLOUR shift, not the old brightness-crushing vignette — only the
  //    extreme bottom edge takes a small genuine darkening.
  grade: {
    tint: 0x2a2160, // indigo
    bottomAlpha: 0.16, // strength at the very bottom of the map
    edgeAlpha: 0.08, // extra indigo drawn inward from the far left/right edges
    bottomEdgeDarken: 0x0a0716, // near-black indigo for the extreme bottom band
    bottomEdgeAlpha: 0.14, // small acceptable darkening at the very bottom
    bottomEdgeFrac: 0.14, // height fraction of the extreme-bottom darken band
  },
} as const;

export class LocationScene extends Phaser.Scene {
  private location!: LocationDefinition;
  private state: RunState = createInitialRunState('recipient-house');
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerVisual?: Phaser.GameObjects.Sprite;
  // The clearing's art-based shore water band (present only when shore-water.png
  // dropped in). Kept so update() can scroll its tilePositionX for a calm drift.
  private clearingShoreWater?: Phaser.GameObjects.TileSprite;
  // Paper cranes drifting on the clearing's shore water. Purely decorative (no
  // colliders); advanced every frame in update() so they keep breathing even
  // while the dressEdit editor is frozen. Reset on (re)start like the shore.
  private clearingCranes: DriftingCrane[] = [];
  private clearingCraneClock = 0;
  // PRNG kept from spawn so an off-edge crane can re-roll its look on
  // wrap-around with the same distribution.
  private craneWrapRng: () => number = Math.random;
  private playerFacing: PlayerFacing = 'down';
  private wasPlayerMoving = false;
  private tapStepHoldUntil = 0;
  private tapStepFrameByFacing = Object.fromEntries(
    PLAYER_FACINGS.map((facing) => [facing, 0]),
  ) as Record<PlayerFacing, number>;
  private lastWalkDustAt = 0;
  private walkDustFootSide = -1;
  private controller!: PlayerController;
  private _canMove = true;
  private collectionPanel?: CollectionPanelHandle;
  private get canMove(): boolean {
    return this._canMove;
  }
  // Freezing control (dialogue, activities, reward + re-read letters) also makes
  // the Letters HUD inert, so a stray hover/click can never fan or open a letter
  // over another overlay.
  private set canMove(value: boolean) {
    this._canMove = value;
    this.collectionPanel?.element.classList.toggle(
      'collection-panel--inert',
      !value,
    );
  }
  private exits: RectObject[] = [];
  private interactions: RectObject[] = [];
  private interactKey?: Phaser.Input.Keyboard.Key;
  private promptText?: Phaser.GameObjects.Text;
  private activeObject?: RectObject;
  private walls?: Phaser.Tilemaps.TilemapLayer;
  private projection?: Projection;
  private dressing?: RoomDressing;
  // Dressed-prop billboards + the iso origin they were placed with, kept for the
  // dev ?dressEdit=1 editor. When that editor is active the player is frozen so
  // movement/interactions/edges stay inert while arranging furniture.
  private propHandles: readonly PropHandle[] = [];
  private roomOrigin?: IsoOrigin;
  private dressEditFrozen = false;
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
    // scene.restart() reuses this instance and destroys the display list, so the
    // old shore tileSprite is gone but this reference isn't. Clear it so update()
    // never scrolls a destroyed object; drawClearingShore re-sets it if this area
    // is the clearing.
    this.clearingShoreWater = undefined;
    // Same story for the drifting cranes: the display list is gone, so drop the
    // stale references. spawnClearingCranes repopulates this for the clearing.
    this.clearingCranes = [];
    this.clearingCraneClock = 0;
  }

  create(): void {
    // Preserve the persistent sail-away bridge (data-ending-bridge) across this
    // restart: on the auto-start into final-spot it must keep covering the swap
    // until finalKeepsakeActivity mounts frame 0 and removes it. Every other
    // clearUiRoot (including the terminal goHome) still does a full wipe, so the
    // bridge can never survive past its one hand-off.
    clearUiRoot(true);
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
    this.createHomeHostNpc();
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
    this.maybeStartDressEditor();
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

  // Dev-only in-game prop-placement editor (?dressEdit=1), lazily imported so it
  // is excluded from production bundles. Freezes the player for its lifetime so
  // dragging/nudging props never triggers movement or interactions.
  private maybeStartDressEditor(): void {
    if (!import.meta.env.DEV) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (
      !params.has('dressEdit') ||
      !this.projection ||
      !this.dressing ||
      !this.roomOrigin
    ) {
      return;
    }

    const projection = this.projection;
    const dressing = this.dressing;
    const origin = this.roomOrigin;
    const propHandles = this.propHandles;
    const propDepthOverrides = this.zonesFile?.propDepthOverrides ?? {};
    void import('../game/dressEditor').then(({ startDressEditor }) => {
      startDressEditor(this, {
        locationId: this.location.id,
        projection,
        origin,
        dressing,
        propHandles,
        propDepthOverrides,
        mapJson: this.getMapJson(),
        mapUrl: this.location.mapUrl,
        removed: getRoomLayoutRemoved(this.location.id),
        setPlayerFrozen: (frozen: boolean) => {
          this.dressEditFrozen = frozen;
        },
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

  update(_time: number, delta: number): void {
    // Ambient: the clearing's painted shore water drifts sideways a few px/sec —
    // a calm, delta-timed scroll (not a current). Runs before the gameplay gates
    // so it keeps breathing even while the dressEdit editor is frozen.
    if (this.clearingShoreWater) {
      this.clearingShoreWater.tilePositionX += (8 * delta) / 1000;
    }
    // Same beat: nudge the drifting paper cranes downstream (also before the
    // gates, so they keep floating even while the dressEdit editor is frozen).
    this.advanceClearingCranes(delta);

    // The dressEdit editor freezes the whole scene: the player stands still and
    // no interactions/edges fire, so arranging props never triggers gameplay.
    if (this.dressEditFrozen) {
      this.controller.update(false);
      this.syncPlayerVisual();
      this.promptText?.setText('');
      return;
    }

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

    // Parse the map's object layers UP FRONT: the flat-ground path routing reads
    // this.exits to draw worn paths toward each door, so exits must be populated
    // before createFlatGround runs (previously set after, leaving yard door paths
    // undrawn and the lone edge road reading as a floating dead-end stub).
    const mapJson = this.getMapJson();
    this.exits = getRectObjects(mapJson, 'Exits');
    this.interactions = getRectObjects(mapJson, 'Interactables');

    this.propColliders = [];
    this.propColliderBodies = [];
    let contentBounds: ScreenBounds | undefined;

    if (this.dressing) {
      this.cameras.main.setBackgroundColor(this.dressing.backgroundColor);
      const origin = this.getProjection().movementOrigin ?? this.createIsoOrigin(tilemap);
      this.roomOrigin = origin;
      const rendered = renderRoomDressing(
        this,
        this.dressing,
        tilemap,
        origin,
        this.zonesFile?.propDepthOverrides ?? {},
      );
      this.propHandles = rendered.propHandles;
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
      this.propColliders = [...this.propColliders, ...this.renderOutdoorProps(tilemap)];
      this.propColliders = [...this.propColliders, ...this.renderSignpost(tilemap)];
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
        this.decorateClearing(width, height, tile);
        this.drawClearingShore(width, height, tile);
        this.spawnClearingCranes(width, height, tile);
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
      this.decorateClearing(width, height, tile);
      this.drawClearingShore(width, height, tile);
      this.spawnClearingCranes(width, height, tile);
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
        } else if (roll < 0.05) {
          // Rare tufted accent. The bright full-tile variant (grass[1]) is
          // dropped here: at tile scale it read as jarring checkerboard blobs.
          frame = GROUND_TILES.grass[3];
        } else if (roll < 0.34) {
          frame = GROUND_TILES.grass[2];
        } else {
          frame = GROUND_TILES.grass[0];
        }
        // Break the grid: rotate the base/textured grass in 90° steps so the
        // seams between identical tiles disappear.
        const gq = frame === GROUND_TILES.grass[3] ? 0 : Math.floor(rng() * 4);
        this.stampGroundTile(rt, frame, gq, column * tile, row * tile, tile);
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
      // Vary the hedge to kill the visible repeat + hard seam: alternate the
      // straight tile (frame 8) with the bushier canopy tile (frame 10, row 2 of
      // the tileset) and randomly flip each 180°, so no two neighbours match.
      const hedgeVariants = [
        GROUND_TILES.hedgeStraight,
        GROUND_TILES.hedgeStraight,
        GROUND_TILES.hedgeStraight + 2,
      ];
      const stampHedge = (col: number, row: number, baseQuarter: number): void => {
        const f = hedgeVariants[Math.floor(rng() * hedgeVariants.length)];
        const q = baseQuarter + (rng() < 0.5 ? 2 : 0);
        this.stampGroundTile(rt, f, q, col * tile, row * tile, tile);
      };
      for (let column = 0; column < cols; column += 1) {
        if (!openEdges.has('north')) stampHedge(column, 0, 0);
        if (!openEdges.has('south')) stampHedge(column, rows - 1, 0);
      }
      for (let row = 0; row < rows; row += 1) {
        if (!openEdges.has('west')) stampHedge(0, row, 1);
        if (!openEdges.has('east')) stampHedge(cols - 1, row, 1);
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
    const markCell = (c: number, r: number): void => {
      const cc = Math.min(cols - 1, Math.max(0, c));
      const rr = Math.min(rows - 1, Math.max(0, r));
      mask[rr * cols + cc] = true;
    };
    const cellOf = (px: number, py: number): { c: number; r: number } => ({
      c: Math.min(cols - 1, Math.max(0, Math.floor(px / tile))),
      r: Math.min(rows - 1, Math.max(0, Math.floor(py / tile))),
    });
    // Route each target from the centre as an orthogonal L (horizontal leg, then
    // vertical leg). Marking every cell along the two axis-aligned legs keeps the
    // path 4-connected — no diagonal staircase, so the auto-tiler never emits a
    // mid-route dead-end cap (the old floating-blob / abrupt-squiggle artifacts).
    const origin = cellOf(center.x, center.y);
    for (const target of targets) {
      const end = cellOf(target.x, target.y);
      const stepC = Math.sign(end.c - origin.c);
      for (let c = origin.c; c !== end.c; c += stepC) {
        markCell(c, origin.r);
      }
      const stepR = Math.sign(end.r - origin.r);
      for (let r = origin.r; r !== end.r; r += stepR) {
        markCell(end.c, r);
      }
      markCell(end.c, end.r);
    }
    markCell(origin.c, origin.r);
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
      const shore = this.add
        .tileSprite(0, top, width, bandHeight, SHORE_WATER_KEY)
        .setOrigin(0, 0)
        .setDepth(-17);
      // The procedural fallback warms its ripples once awakened; the art branch
      // bypasses that, so layer an equivalent subtle warm shift over the painted
      // band here — a gentle multiply tint (blue channel eased down) that warms
      // the whole band without recolouring it. The awakened glow blooms below
      // still pulse on top. Kept mild, per the texture's gentle-by-design intent.
      if (awakened) {
        shore.setTint(0xffe9c8);
      }
      // Held for update() to drift its tilePositionX — a calm scroll, not a
      // current.
      this.clearingShoreWater = shore;
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

  // A sparse trickle of origami paper cranes drifting along the clearing's shore
  // water — the in-game seed for why ____ later folds a boat: paper floats. Not
  // static props: one instance per `clearing-crane-N` colour variant (art or
  // procedural fallback; 1 = cream/blush, 2 = pale gold, 3 = lavender) is spawned
  // across the water band — a STABLE assignment, so all three colours are always
  // on screen — each with its own scale (±15%), heading, drift speed and
  // bob/rotation phase, then advanced every frame in advanceClearingCranes() and
  // wrapped back upstream on exit so the trickle never runs dry. Purely
  // decorative: no colliders, so they never touch the "Kneel at the water"
  // interaction. Depth sits above the water/glow but well below any standing
  // figure, so ____ draws in front when he kneels at the shore.
  private spawnClearingCranes(width: number, height: number, tile: number): void {
    const rng = mulberry32(fnv1a(`${this.location.id}:cranes`));
    this.craneWrapRng = rng;
    const bandTop = height - tile * 2;
    // Keep cranes on the near/upper surface of the band (the far edge stays open
    // water), and clear of the darkest deep-water lip.
    const yMin = bandTop + tile * 0.35;
    const yMax = bandTop + tile * 1.15;
    const count = 3;
    for (let i = 0; i < count; i += 1) {
      // Stable variant assignment: crane i carries colour variant i+1.
      const kind = PROP_KINDS[`clearing-crane-${i + 1}`];
      if (!kind) {
        continue;
      }
      const key = this.ensurePropTexture(kind);
      const source = this.textures.get(key).getSourceImage() as { width: number };
      // Base display size: shrink the sprite so the 3 cranes read as a
      // contemplative few, not a flock, on the 2-tile water band. Derived per
      // variant so dropped-in art of any resolution lands at the same size.
      const baseScale = (kind.w / (source.width || kind.w)) * 0.66;
      const ripple = this.add.graphics().setDepth(-15.5);
      const image = this.add
        .image(0, 0, key)
        .setOrigin(0.5, 0.5)
        .setDepth(-15);
      // Cranes warm with the shore once the world has awakened (see
      // drawClearingShore's tint) so they read correctly under the golden light.
      if (isFinalSpotUnlocked(this.state)) {
        image.setTint(0xffe9c8);
      }
      const crane: DriftingCrane = {
        image,
        ripple,
        baseScale,
        speed: 0,
        bobAmp: 0,
        bobRate: 0,
        bobPhase: 0,
        rotBase: 0,
        rotAmp: 0,
        rotRate: 0,
        rotPhase: 0,
        baseY: 0,
        scale: 0,
      };
      // Stagger the initial X so the three are spread across the water at start.
      const startX = width * ((i + 0.5) / count) + (rng() - 0.5) * tile;
      this.randomizeCrane(crane, rng, baseScale, yMin, yMax);
      crane.image.setX(startX).setY(crane.baseY);
      this.clearingCranes.push(crane);
    }
  }

  // (Re)rolls a crane's per-instance motion + look. Called at spawn and whenever a
  // crane drifts off the downstream (east) edge so it re-enters upstream fresh.
  private randomizeCrane(
    crane: DriftingCrane,
    rng: () => number,
    baseScale: number,
    yMin: number,
    yMax: number,
  ): void {
    crane.scale = baseScale * (0.85 + rng() * 0.3); // ±15%
    crane.image.setScale(crane.scale).setFlipX(rng() < 0.5);
    crane.speed = 5 + rng() * 4; // 5–9 px/sec: unhurried
    crane.bobAmp = 2 + rng() * 2.5; // 2–4.5 px
    crane.bobRate = 0.5 + rng() * 0.4; // slow
    crane.bobPhase = rng() * Math.PI * 2;
    crane.rotBase = (rng() - 0.5) * 0.5; // ±~0.25 rad resting heading
    crane.rotAmp = 0.05 + rng() * 0.05; // ±3–6° wobble
    crane.rotRate = 0.4 + rng() * 0.35;
    crane.rotPhase = rng() * Math.PI * 2;
    crane.baseY = yMin + rng() * (yMax - yMin);
  }

  // Integrates the drifting cranes one frame: downstream drift, a gentle vertical
  // bob and a slight rotation wobble, wrapping any crane that leaves the east edge
  // back to the west so the trickle loops. Driven from update() before the
  // gameplay gates, so the water keeps breathing even while dressEdit is frozen.
  private advanceClearingCranes(deltaMs: number): void {
    if (this.clearingCranes.length === 0) {
      return;
    }
    const dt = deltaMs / 1000;
    this.clearingCraneClock += dt;
    const t = this.clearingCraneClock;
    const width = this.mapDims.width;
    // Re-derive the band bounds for respawn (cheap; matches spawnClearingCranes).
    const tile = this.mapDims.tileSize;
    const bandTop = this.mapDims.height - tile * 2;
    const yMin = bandTop + tile * 0.35;
    const yMax = bandTop + tile * 1.15;
    const rng = this.craneWrapRng;
    for (const crane of this.clearingCranes) {
      const nextX = crane.image.x + crane.speed * dt;
      const halfW = (crane.image.width * crane.scale) / 2;
      if (nextX - halfW > width + tile) {
        // Off the downstream edge: re-roll and re-enter from upstream (the
        // texture — and so the colour variant — stays with the crane).
        this.randomizeCrane(crane, rng, crane.baseScale, yMin, yMax);
        crane.image.setX(-tile - halfW);
      } else {
        crane.image.setX(nextX);
      }
      const y = crane.baseY + Math.sin(t * crane.bobRate + crane.bobPhase) * crane.bobAmp;
      crane.image.setY(y);
      crane.image.setRotation(crane.rotBase + Math.sin(t * crane.rotRate + crane.rotPhase) * crane.rotAmp);
      // Faint reflected highlight tracking just beneath the fold.
      const r = crane.ripple;
      r.clear();
      const rw = halfW * 0.8;
      r.fillStyle(0xcdddf0, 0.1);
      r.fillEllipse(crane.image.x, y + halfW * 0.32, rw, rw * 0.22);
      r.lineStyle(1, 0xdfeaf6, 0.08);
      r.strokeEllipse(crane.image.x, y + halfW * 0.34, rw * 1.15, rw * 0.28);
    }
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
    } else {
      this.composeGalaxyGround(width, height);
    }

    // Restrained cosmic atmosphere over the painted backdrop (see GALAXY_VIBE).
    this.createGalaxyVibe(width, height);
  }

  // Lays the restrained galaxy-vibe layer (grade → nebula → stars) OVER the
  // painted final-spot backdrop. Additive, low-alpha, slow: the paintings stay
  // clearly the base. Everything scales off GALAXY_VIBE.INTENSITY. No-op if the
  // knob is dialled to (or below) zero — the "before" state the author compares.
  private createGalaxyVibe(width: number, height: number): void {
    const intensity = GALAXY_VIBE.INTENSITY;
    if (intensity <= 0) {
      return;
    }
    this.createGalaxyCoolGrade(width, height, intensity);
    this.createGalaxyNebula(width, height, intensity);
    this.createGalaxyStarShimmer(width, height, intensity);
  }

  // 3. Cool grade with depth. A single graphics: an indigo vertical wash over the
  // water region that is fully transparent at the painted horizon and reaches
  // GALAXY_VIBE.grade.bottomAlpha at the map's bottom (a colour shift, not a
  // darkener), plus faint indigo deepening drawn inward from the far left/right
  // edges, plus a small genuine darkening confined to the extreme bottom band.
  private createGalaxyCoolGrade(width: number, height: number, intensity: number): void {
    const g = GALAXY_VIBE.grade;
    const waterTop = height * GALAXY_VIBE.stars.minYFrac;
    const waterH = height - waterTop;
    const gfx = this.add.graphics().setDepth(GALAXY_VIBE.depth.grade);

    // Vertical indigo wash: 0 at the horizon, bottomAlpha at the bottom.
    const bottomA = Math.min(1, g.bottomAlpha * intensity);
    gfx.fillGradientStyle(g.tint, g.tint, g.tint, g.tint, 0, 0, bottomA, bottomA);
    gfx.fillRect(0, waterTop, width, waterH);

    // Far-edge deepening: indigo fading inward from each side over the water, so
    // the expanse falls off into void at its far reaches (not a full vignette).
    const edgeA = Math.min(1, g.edgeAlpha * intensity);
    const edgeW = width * 0.22;
    gfx.fillGradientStyle(g.tint, g.tint, g.tint, g.tint, edgeA, 0, edgeA, 0);
    gfx.fillRect(0, waterTop, edgeW, waterH);
    gfx.fillGradientStyle(g.tint, g.tint, g.tint, g.tint, 0, edgeA, 0, edgeA);
    gfx.fillRect(width - edgeW, waterTop, edgeW, waterH);

    // Extreme-bottom darken: the only genuine brightness drop, confined low.
    const bandH = height * g.bottomEdgeFrac;
    const darkA = Math.min(1, g.bottomEdgeAlpha * intensity);
    gfx.fillGradientStyle(
      g.bottomEdgeDarken,
      g.bottomEdgeDarken,
      g.bottomEdgeDarken,
      g.bottomEdgeDarken,
      0,
      0,
      darkA,
      darkA,
    );
    gfx.fillRect(0, height - bandH, width, bandH);
  }

  // 2. Nebula drift. A few large, very soft violet/indigo additive pools crawling
  // extremely slowly across the water. Seeded so the field is stable per reload;
  // biased into the water region and nudged clear of ____'s warm centre.
  private createGalaxyNebula(width: number, height: number, intensity: number): void {
    const n = GALAXY_VIBE.nebula;
    this.createNebulaTexture();
    const rng = mulberry32(fnv1a('final-spot:galaxy-nebula'));
    const count = Math.max(1, Math.round(n.count * intensity));
    const waterTop = height * GALAXY_VIBE.stars.minYFrac;
    for (let i = 0; i < count; i += 1) {
      const color = n.colors[Math.floor(rng() * n.colors.length)] ?? n.colors[0];
      const radius = n.radiusMin + rng() * (n.radiusMax - n.radiusMin);
      // Spread across the width; keep the centre a touch clearer of ____.
      let x = rng() * width;
      if (Math.abs(x - GALAXY_VIBE.warmGlow.x) < radius * 0.4) {
        x = x < GALAXY_VIBE.warmGlow.x ? x - radius * 0.4 : x + radius * 0.4;
      }
      const y = waterTop + rng() * (height - waterTop);
      const alpha = Math.min(1, (n.alphaMin + rng() * (n.alphaMax - n.alphaMin)) * intensity);
      const pool = this.add
        .image(x, y, 'galaxy-nebula')
        .setDepth(GALAXY_VIBE.depth.nebula)
        .setDisplaySize(radius * 2, radius * 2)
        .setTint(color)
        .setAlpha(alpha)
        .setBlendMode(Phaser.BlendModes.ADD);
      const drift = n.driftPx;
      const dur = n.driftMinMs + rng() * (n.driftMaxMs - n.driftMinMs);
      this.tweens.add({
        targets: pool,
        x: x + (rng() - 0.5) * drift * 2,
        y: y + (rng() - 0.5) * drift,
        duration: dur,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      // A very slow alpha breathe so the pools feel alive, never static.
      this.tweens.add({
        targets: pool,
        alpha: { from: alpha * 0.7, to: alpha },
        duration: dur * 0.6,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  // 1. Sparse star shimmer on the water. Seeded twinkling motes, additive, LOW
  // alpha, slow gentle twinkle — water region only, avoiding ____'s warm glow.
  private createGalaxyStarShimmer(width: number, height: number, intensity: number): void {
    const s = GALAXY_VIBE.stars;
    this.createMoteTexture();
    const rng = mulberry32(fnv1a('final-spot:galaxy-stars'));
    const count = Math.max(1, Math.round(s.count * intensity));
    const minY = height * s.minYFrac;
    const glow = GALAXY_VIBE.warmGlow;
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 12) {
      guard += 1;
      const x = rng() * width;
      const y = minY + rng() * (height - minY);
      // Keep the cool field clear of ____'s warm point.
      if (Math.hypot(x - glow.x, y - glow.y) < glow.clearRadius) {
        continue;
      }
      placed += 1;
      const peak = Math.min(
        1,
        (s.peakAlphaMin + rng() * (s.peakAlphaMax - s.peakAlphaMin)) * intensity,
      );
      const mote = this.add
        .image(x, y, 'awaken-mote')
        .setDepth(GALAXY_VIBE.depth.stars)
        .setScale(s.scaleMin + rng() * (s.scaleMax - s.scaleMin))
        .setTint(s.tint)
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: mote,
        alpha: { from: peak * 0.25, to: peak },
        duration: s.twinkleMinMs + rng() * (s.twinkleMaxMs - s.twinkleMinMs),
        yoyo: true,
        hold: s.holdMinMs + rng() * (s.holdMaxMs - s.holdMinMs),
        repeat: -1,
        repeatDelay: rng() * 1800,
        delay: rng() * 2600,
        ease: 'Sine.easeInOut',
      });
    }
  }

  // A soft round radial-gradient blob (transparent edges) for the nebula pools —
  // awaken-mote is too small/hard-cored to scale up into a diffuse cloud.
  private createNebulaTexture(): void {
    if (this.textures.exists('galaxy-nebula')) {
      return;
    }
    const size = 256;
    const canvas = this.textures.createCanvas('galaxy-nebula', size, size);
    const ctx = canvas?.getContext();
    if (canvas && ctx) {
      const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      canvas.refresh();
    }
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

  // The friend who lives here, standing idle at their host dialogue hotspot so
  // the person you talk to is actually visible in the room (____ in friend-a,
  // ____ in friend-b). Decorative only: no collider, no trigger. The existing
  // Interactables rect (friendone-host / friendtwo-host) still owns the interaction, so
  // the host dialogue fires exactly once — the character and the hotspot are the
  // same beat. Depth-sorts by projected feet Y like every other room billboard,
  // so props in front of the character (the tea table, the desk) occlude them.
  private createHomeHostNpc(): void {
    const npc = HOME_HOST_NPCS[this.location.id];
    if (!npc || !this.textures.exists(npc.sprite.key)) {
      return;
    }
    const cfg = npc.sprite;
    if (!this.anims.exists(cfg.idleAnimationKey)) {
      this.anims.create({
        key: cfg.idleAnimationKey,
        frames: this.anims.generateFrameNumbers(cfg.key, {
          start: cfg.idleDownStartFrame,
          end: cfg.idleDownStartFrame + cfg.idleDownFrameCount - 1,
        }),
        frameRate: cfg.idleFrameRate,
        repeat: -1,
      });
    }

    const point = this.getProjection().project(npc.mapX, npc.mapY);
    const sprite = this.add
      .sprite(point.x, point.y, cfg.key, cfg.idleDownStartFrame)
      .setOrigin(cfg.origin.x, cfg.origin.y)
      .setScale(cfg.scale)
      .setDepth(point.y);
    if (this.anims.exists(cfg.idleAnimationKey)) {
      sprite.play(cfg.idleAnimationKey);
    }
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

    const tune = resolveOutdoorAwakenTune();

    // Gentle warm ambient wash, camera-fixed and low, layered under the HUD — a
    // NORMAL-blend colour grade with a top→bottom lean toward the south (where the
    // clearing waits). Kept at its base character; the real "lit up" lift is the
    // additive daylight overlay below.
    const tint = this.add.graphics().setScrollFactor(0).setDepth(895);
    tint.fillGradientStyle(0xffcf7a, 0xffcf7a, 0xffd98c, 0xffd98c, 0.72, 0.72, 1, 1);
    tint.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
    tint.setAlpha(0.1);
    this.tweens.add({
      targets: tint,
      alpha: { from: 0.06, to: 0.13 },
      duration: 4200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Headline: a screen-fixed ADDITIVE warm overlay that genuinely lifts the
    // whole scene's exposure, so stepping outside reads as walking into streaming
    // daylight — not a faint tint but light actually flooding the world. Warmer,
    // gold-leaning toward the bottom (south). Peak alpha is the `additiveLift`
    // knob; a slow breathe keeps it alive. `before` sets it to 0 (base look).
    if (tune.additiveLift > 0) {
      const daylight = this.add
        .graphics()
        .setScrollFactor(0)
        .setDepth(896)
        .setBlendMode(Phaser.BlendModes.ADD);
      daylight.fillGradientStyle(0xffe9ba, 0xffe9ba, 0xffd992, 0xffd992, 1, 1, 1, 1);
      daylight.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
      daylight.setAlpha(tune.additiveLift);
      this.tweens.add({
        targets: daylight,
        alpha: { from: tune.additiveLift * 0.82, to: tune.additiveLift },
        duration: 4200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.spawnLightMotes(tune);
    this.createSouthThresholdGlow();
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

  private spawnLightMotes(tune: OutdoorAwakenTune): void {
    this.createMoteTexture();
    // Seeded like the outdoor ground so the mote field is stable across reloads.
    const rng = mulberry32(fnv1a(`${this.location.id}:motes`));
    // On the hub map, once the way south has opened, the motes stop drifting at
    // random and stream toward the clearing exit — the light itself beckoning
    // that way. Denser than the ambient field (tune.moteCount) so the flow reads
    // as an unmistakable ribbon of bulbs you'd follow, not sparse specks. Other
    // outdoor areas keep the ambient 16-mote aimless drift.
    const beckonSouth =
      this.location.id === 'main-outside' &&
      (this.location.edgeExits ?? []).some((exit) => exit.edge === 'south');
    const count = beckonSouth ? tune.moteCount : 16;
    for (let i = 0; i < count; i += 1) {
      if (beckonSouth) {
        this.spawnBeckoningMote(rng, tune);
        continue;
      }
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

  // One bulb in the southward-streaming ribbon. It rides a slow, continuous
  // downward drift (looping — a stream, not a one-shot). A synced alpha cycle
  // fades it up at the top of its run and back to zero at the bottom, so the
  // loop's snap-back never shows.
  //
  // In `ribbon` mode (post-boost) the bulbs concentrate into a loose vertical
  // band down the central path — where the signpost and the south exit sit — and
  // spawn across the full height, so the whole flow reads as an unmistakable
  // ribbon of light you'd follow toward the clearing. They glow ADDITIVELY so
  // they pop as warm bulbs even over the brightened ground. In base mode they
  // stay a sparse, full-width, normal-blend field (the original ambient look).
  private spawnBeckoningMote(rng: () => number, tune: OutdoorAwakenTune): void {
    const width = this.mapDims.width;
    const height = this.mapDims.height;
    let x: number;
    let startY: number;
    let travel: number;
    let scale: number;
    if (tune.ribbon) {
      // Loose central ribbon: clustered around mid-x (the path) with a soft
      // spread, flowing from just below the player all the way to the exit.
      const spread = (rng() + rng() - 1) * 0.26; // triangular ~[-0.26,0.26], centre-weighted
      x = width * (0.5 + spread);
      startY = height * (0.1 + rng() * 0.8);
      travel = height * (0.24 + rng() * 0.16);
      scale = 0.7 + rng() * 1.0;
    } else {
      x = rng() * width;
      startY = height * (0.3 + rng() * 0.55);
      travel = height * (0.22 + rng() * 0.16);
      scale = 0.5 + rng() * 0.9;
    }
    const sway = 12 + rng() * 20;
    const runMs = 6400 + rng() * 3600;
    const delay = rng() * runMs;
    const mote = this.add
      .image(x, startY, 'awaken-mote')
      .setDepth(startY + travel + 6)
      .setAlpha(0)
      .setScale(scale);
    if (tune.ribbon) {
      mote.setBlendMode(Phaser.BlendModes.ADD);
    }
    // Steady southward drift; on each loop the position snaps back up while the
    // alpha cycle (below) has it at zero, so the reset is invisible.
    this.tweens.add({
      targets: mote,
      y: startY + travel,
      duration: runMs,
      repeat: -1,
      delay,
      ease: 'Linear',
    });
    // Gentle side-to-side sway layered over the descent.
    this.tweens.add({
      targets: mote,
      x: x + (rng() - 0.5) * sway * 2,
      duration: runMs * 0.5,
      yoyo: true,
      repeat: -1,
      delay,
      ease: 'Sine.easeInOut',
    });
    // Alpha cycle synced to one descent: fade up, (in ribbon mode) HOLD near peak
    // so the bulb stays lit through most of its run, then fade back to zero before
    // the loop snaps back up. The hold is what makes the ribbon read as a solid,
    // sustained flow rather than a sparse twinkle — at any instant most bulbs are
    // near peak, so the stream is always dense. Base mode keeps the plain triangle.
    const peak = tune.motePeakAlpha + rng() * 0.25;
    if (tune.ribbon) {
      this.tweens.add({
        targets: mote,
        alpha: { from: 0, to: peak },
        duration: runMs * 0.32,
        hold: runMs * 0.36,
        yoyo: true,
        repeat: -1,
        delay,
        ease: 'Sine.easeInOut',
      });
    } else {
      this.tweens.add({
        targets: mote,
        alpha: { from: 0, to: peak },
        duration: runMs * 0.5,
        yoyo: true,
        repeat: -1,
        delay,
        ease: 'Sine.easeInOut',
      });
    }
  }

  // A soft, pulsing warm band across the south exit once the way has opened —
  // the same door-glow language players already know (createOutdoorDoorMarkers'
  // 0xffca74/0xffe1a1), read as "a way through" toward the clearing. The band's
  // rect is derived from the south edgeExit and the map dims, not hardcoded.
  // Gentle by design: a low glow on the ground, layered like the door markers.
  private createSouthThresholdGlow(): void {
    if (this.location.id !== 'main-outside') {
      return;
    }
    const southExit = (this.location.edgeExits ?? []).find((exit) => exit.edge === 'south');
    if (!southExit) {
      return;
    }
    const tile = this.mapDims.tileSize;
    const width = this.mapDims.width;
    const height = this.mapDims.height;
    // Band across the walkable span (one tile inset from each border corner),
    // rising a couple of tiles up from the very bottom edge.
    const x0 = tile;
    const x1 = width - tile;
    const bandHeight = tile * 2.5;
    const top = height - bandHeight;

    const glow = this.add.graphics().setDepth(-8);
    // Warm wash, transparent at the top of the band and strongest at the edge.
    glow.fillGradientStyle(0xffca74, 0xffca74, 0xffca74, 0xffca74, 0, 0, 0.34, 0.34);
    glow.fillRect(x0, top, x1 - x0, bandHeight);
    // A brighter threshold line low in the band — the door-marker stroke colour.
    glow.fillStyle(0xffe1a1, 0.5);
    glow.fillRect(x0, height - tile * 0.7, x1 - x0, tile * 0.28);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.55, to: 1 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
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
    const panel = createCollectionPanel(this.state, {
      canInteract: () => this._canMove,
      // Re-reading freezes the player (mirrors pauseForDialogue) so held movement
      // keys can't drive ____ behind the full-screen letter overlay.
      onOpenLetter: async (lines) => {
        this.canMove = false;
        await showLetterModal(lines);
        this.canMove = true;
      },
    });
    panel.element.classList.toggle('collection-panel--inert', !this._canMove);
    this.collectionPanel = panel;
    getUiRoot().append(panel.element);
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

    // The signpost hotspot now has a diegetic prop; its "E - Read the signpost"
    // proximity prompt is guidance enough, so skip the translucent debug rect
    // (unless the collider-debug overlay is on).
    const signpostId = getSignpost(this.location.id)?.interactionId;
    for (const interaction of this.interactions) {
      if (interaction.id === signpostId && !this.showColliderDebug) {
        continue;
      }
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

  // Renders the decoration prop pack for an outdoor area: painted cutouts placed
  // bottom-anchored and y-sorted so ____ walks behind standing props; flat props
  // (flower patches) bake below her; overhead pieces hang above. File-first
  // (prop-<name> PNG) with a painted procedural fallback so areas are dressed
  // before the art lands. Returns solid base footprints (map px) to collide.
  private renderOutdoorProps(tilemap: Phaser.Tilemaps.Tilemap): PropColliderRect[] {
    const openEdges = new Set((this.location.edgeExits ?? []).map((exit) => exit.edge));
    const corridor = this.buildCorridorMask(tilemap, openEdges);
    const colliders: PropColliderRect[] = [];
    for (const placement of getOutdoorProps(this.location.id)) {
      const kind = PROP_KINDS[placement.name];
      if (!kind) {
        continue;
      }
      const collider = this.renderProp(kind, placement, corridor);
      if (collider) {
        colliders.push(collider);
      }
    }
    return colliders;
  }

  // A boolean cell grid of every place the player must be able to walk: the worn
  // paths, a full row+column through each spawn (players walk any cardinal from a
  // spawn), a vertical approach to each door, and a band along every open edge.
  // Decoration colliders that fall on it are dropped (the sprite still draws), so
  // scenery never blocks a route the game or a smoke walk relies on.
  private buildCorridorMask(
    tilemap: Phaser.Tilemaps.Tilemap,
    openEdges: Set<string>,
  ): { grid: boolean[]; cols: number; rows: number; tile: number } {
    const cols = tilemap.width;
    const rows = tilemap.height;
    const tile = tilemap.tileWidth;
    const grid = this.rasterizePathCells(
      cols,
      rows,
      tile,
      tilemap.widthInPixels,
      tilemap.heightInPixels,
      openEdges,
    );
    const markRow = (yPx: number): void => {
      const r = Math.floor(yPx / tile);
      if (r >= 0 && r < rows) {
        for (let c = 0; c < cols; c += 1) grid[r * cols + c] = true;
      }
    };
    const markCol = (xPx: number): void => {
      const c = Math.floor(xPx / tile);
      if (c >= 0 && c < cols) {
        for (let r = 0; r < rows; r += 1) grid[r * cols + c] = true;
      }
    };
    for (const spawn of getObjectLayer(this.getMapJson(), 'Spawns')?.objects ?? []) {
      markRow(spawn.y);
      markCol(spawn.x);
    }
    for (const exit of this.exits) {
      markCol(exit.x + exit.width / 2);
    }
    // Two-cell approach band along each open edge.
    for (let c = 0; c < cols; c += 1) {
      if (openEdges.has('north')) grid[0 * cols + c] = grid[1 * cols + c] = true;
      if (openEdges.has('south'))
        grid[(rows - 1) * cols + c] = grid[(rows - 2) * cols + c] = true;
    }
    for (let r = 0; r < rows; r += 1) {
      if (openEdges.has('west')) grid[r * cols + 0] = grid[r * cols + 1] = true;
      if (openEdges.has('east'))
        grid[r * cols + (cols - 1)] = grid[r * cols + (cols - 2)] = true;
    }
    return { grid, cols, rows, tile };
  }

  private colliderHitsCorridor(
    rect: PropColliderRect,
    corridor: { grid: boolean[]; cols: number; rows: number; tile: number },
  ): boolean {
    const { grid, cols, rows, tile } = corridor;
    const c0 = Math.max(0, Math.floor(rect.x / tile));
    const c1 = Math.min(cols - 1, Math.floor((rect.x + rect.width) / tile));
    const r0 = Math.max(0, Math.floor(rect.y / tile));
    const r1 = Math.min(rows - 1, Math.floor((rect.y + rect.height) / tile));
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        if (grid[r * cols + c]) {
          return true;
        }
      }
    }
    return false;
  }

  private renderProp(
    kind: PropKind,
    placement: PropPlacement,
    corridor?: { grid: boolean[]; cols: number; rows: number; tile: number },
  ): PropColliderRect | undefined {
    const key = this.ensurePropTexture(kind);
    const anchor = this.getProjection().project(placement.mapX, placement.mapY);
    const source = this.textures.get(key).getSourceImage() as { width: number };
    const scale = kind.w / (source.width || kind.w);
    const image = this.add.image(anchor.x, anchor.y, key).setScale(scale);
    if (placement.flip) {
      image.setFlipX(true);
    }
    if (kind.flat) {
      image.setOrigin(0.5, 0.5).setDepth(-14);
    } else if (kind.overhead) {
      image.setOrigin(0.5, 0.5).setDepth(5000).setAlpha(0.95);
    } else {
      image.setOrigin(0.5, 1).setDepth(anchor.y);
    }

    if (kind.collider && !kind.flat && !kind.overhead) {
      const rect: PropColliderRect = {
        x: placement.mapX - kind.collider.w / 2,
        y: placement.mapY - kind.collider.h,
        width: kind.collider.w,
        height: kind.collider.h,
      };
      // Never let a decoration body sit on a walkable corridor.
      if (corridor && this.colliderHitsCorridor(rect, corridor)) {
        return undefined;
      }
      return rect;
    }
    return undefined;
  }

  // The visible signpost prop for a named area: the blank painted board with the
  // area name rendered ONTO it in-game (so a drop-in board art needs no baked
  // text). Bottom-anchored + y-sorted like the other standing props.
  private renderSignpost(tilemap: Phaser.Tilemaps.Tilemap): PropColliderRect[] {
    const sign = getSignpost(this.location.id);
    if (!sign) {
      return [];
    }
    const kind = PROP_KINDS.signpost;
    const key = this.ensurePropTexture(kind);
    const anchor = this.getProjection().project(sign.mapX, sign.mapY);
    const source = this.textures.get(key).getSourceImage() as { width: number };
    const scale = kind.w / (source.width || kind.w);
    const image = this.add
      .image(anchor.x, anchor.y, key)
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(anchor.y);
    if (sign.flip) {
      image.setFlipX(true);
    }
    // Caption centred on the board (upper ~72% of the sprite). Depth just above
    // the board so the player still occludes it when standing in front.
    const boardY = anchor.y - kind.h * scale * 0.72;
    this.add
      .text(anchor.x, boardY, sign.label, {
        color: '#3c2a17',
        fontSize: '16px',
        fontStyle: '800',
        fontFamily: 'Georgia, "Times New Roman", serif',
      })
      .setOrigin(0.5, 0.5)
      .setScale(scale)
      .setDepth(anchor.y + 0.1);

    if (!kind.collider) {
      return [];
    }
    const rect: PropColliderRect = {
      x: sign.mapX - kind.collider.w / 2,
      y: sign.mapY - kind.collider.h,
      width: kind.collider.w,
      height: kind.collider.h,
    };
    const openEdges = new Set((this.location.edgeExits ?? []).map((exit) => exit.edge));
    const corridor = this.buildCorridorMask(tilemap, openEdges);
    return this.colliderHitsCorridor(rect, corridor) ? [] : [rect];
  }

  // Resolves a prop's texture key: the loaded PNG when present, else a painted
  // procedural fallback baked once into a same-sized canvas texture.
  private ensurePropTexture(kind: PropKind): string {
    const loaded = propTextureKey(kind.name);
    if (this.textures.exists(loaded)) {
      return loaded;
    }
    const fallback = `${loaded}-fallback`;
    if (this.textures.exists(fallback)) {
      return fallback;
    }
    const canvas = this.textures.createCanvas(fallback, kind.w, kind.h);
    if (!canvas) {
      return this.textures.exists(fallback) ? fallback : loaded;
    }
    this.paintPropFallback(canvas.getContext(), kind);
    canvas.refresh();
    return fallback;
  }

  // Painterly storybook fallbacks (soft flat shapes, gentle shading) matching the
  // exterior/prop art style. Canvas is kind.w×kind.h, feet at bottom-centre.
  private paintPropFallback(ctx: CanvasRenderingContext2D, kind: PropKind): void {
    const w = kind.w;
    const h = kind.h;
    const cx = w / 2;
    ctx.clearRect(0, 0, w, h);
    const ell = (x: number, y: number, rx: number, ry: number, fill: string): void => {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    };
    const rrect = (x: number, y: number, rw: number, rh: number, r: number, fill: string): void => {
      const rad = Math.min(r, rw / 2, rh / 2);
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + rw, y, x + rw, y + rh, rad);
      ctx.arcTo(x + rw, y + rh, x, y + rh, rad);
      ctx.arcTo(x, y + rh, x, y, rad);
      ctx.arcTo(x, y, x + rw, y, rad);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    // Soft contact shadow under standing props.
    if (!kind.flat && !kind.overhead) {
      ell(cx, h - 6, w * 0.32, h * 0.03, 'rgba(20,24,18,0.28)');
    }

    switch (kind.style) {
      case 'tree-a':
      case 'tree-b': {
        const b = kind.style === 'tree-a'
          ? { trunk: '#6b4a2c', dark: '#31562f', mid: '#3f6f3a', light: '#5c9247' }
          : { trunk: '#5f4630', dark: '#2c4a3a', mid: '#3a6350', light: '#579072' };
        const trunkW = w * 0.16;
        rrect(cx - trunkW / 2, h * 0.55, trunkW, h * 0.45, trunkW * 0.4, b.trunk);
        ell(cx - trunkW * 0.18, h * 0.72, trunkW * 0.12, h * 0.18, 'rgba(0,0,0,0.15)');
        const cy = h * 0.36;
        ell(cx, cy + h * 0.1, w * 0.44, h * 0.3, b.dark);
        ell(cx - w * 0.2, cy, w * 0.3, h * 0.24, b.dark);
        ell(cx + w * 0.2, cy, w * 0.3, h * 0.24, b.mid);
        ell(cx, cy - h * 0.08, w * 0.34, h * 0.26, b.mid);
        ell(cx - w * 0.12, cy - h * 0.06, w * 0.2, h * 0.16, b.light);
        ell(cx + w * 0.14, cy - h * 0.02, w * 0.16, h * 0.13, b.light);
        break;
      }
      case 'bush': {
        ell(cx, h * 0.68, w * 0.46, h * 0.34, '#33562f');
        ell(cx - w * 0.22, h * 0.6, w * 0.24, h * 0.24, '#3c6a38');
        ell(cx + w * 0.2, h * 0.6, w * 0.24, h * 0.24, '#3c6a38');
        ell(cx, h * 0.5, w * 0.26, h * 0.24, '#508a45');
        ell(cx - w * 0.08, h * 0.46, w * 0.14, h * 0.12, '#6aa557');
        break;
      }
      case 'flowers-a':
      case 'flowers-b': {
        // Flat ground patch: low green base + scattered blooms.
        ell(cx, h * 0.62, w * 0.46, h * 0.34, 'rgba(60,104,54,0.55)');
        ell(cx, h * 0.66, w * 0.34, h * 0.24, 'rgba(80,132,66,0.5)');
        const petals = kind.style === 'flowers-a'
          ? ['#f4f1e4', '#f6d873', '#ffffff']
          : ['#eaa6c4', '#c98fd6', '#f4c4da'];
        const seed = kind.style === 'flowers-a' ? 11 : 29;
        const rng = mulberry32(fnv1a(`${kind.name}:${seed}`));
        for (let i = 0; i < 14; i += 1) {
          const px = w * 0.16 + rng() * w * 0.68;
          const py = h * 0.42 + rng() * h * 0.42;
          const col = petals[Math.floor(rng() * petals.length)];
          ell(px, py + 2, 4, 2.4, 'rgba(40,70,36,0.5)');
          for (let p = 0; p < 5; p += 1) {
            const a = (p / 5) * Math.PI * 2;
            ell(px + Math.cos(a) * 3.2, py + Math.sin(a) * 3.2, 2.4, 2.4, col);
          }
          ell(px, py, 1.8, 1.8, '#f7c948');
        }
        break;
      }
      case 'fence': {
        const railY1 = h * 0.42;
        const railY2 = h * 0.66;
        const railH = h * 0.12;
        rrect(0, railY1, w, railH, railH * 0.4, '#b98a52');
        rrect(0, railY2, w, railH, railH * 0.4, '#a97b45');
        const posts = 3;
        for (let i = 0; i < posts; i += 1) {
          const px = (i + 0.5) * (w / posts);
          rrect(px - w * 0.05, h * 0.3, w * 0.1, h * 0.62, w * 0.03, '#c99a60');
          ell(px, h * 0.3, w * 0.06, h * 0.03, '#d8ac72');
        }
        break;
      }
      case 'rock': {
        ell(cx, h * 0.62, w * 0.42, h * 0.32, '#7c7f86');
        ell(cx - w * 0.1, h * 0.52, w * 0.26, h * 0.22, '#95979d');
        ell(cx + w * 0.12, h * 0.58, w * 0.2, h * 0.16, '#6b6e75');
        ell(cx - w * 0.06, h * 0.44, w * 0.16, h * 0.06, '#6f9758');
        break;
      }
      case 'lamp':
      case 'lantern-post': {
        const dusk = kind.style === 'lantern-post';
        const post = dusk ? '#3b3350' : '#454b52';
        const glow = dusk ? '#ffd9a0' : '#ffe6a8';
        rrect(cx - w * 0.07, h * 0.16, w * 0.14, h * 0.82, w * 0.05, post);
        rrect(cx - w * 0.22, h * 0.94, w * 0.44, h * 0.05, w * 0.02, post);
        // Warm globe / paper lantern near the top.
        ell(cx, h * 0.2, w * 0.34, h * 0.09, 'rgba(255,225,150,0.28)');
        if (dusk) {
          rrect(cx - w * 0.16, h * 0.1, w * 0.32, h * 0.16, w * 0.06, glow);
          ctx.strokeStyle = 'rgba(120,80,40,0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx, h * 0.1);
          ctx.lineTo(cx, h * 0.26);
          ctx.stroke();
        } else {
          ell(cx, h * 0.17, w * 0.16, h * 0.06, glow);
          rrect(cx - w * 0.14, h * 0.12, w * 0.28, h * 0.1, w * 0.04, glow);
        }
        break;
      }
      case 'mailbox': {
        rrect(cx - w * 0.08, h * 0.45, w * 0.16, h * 0.55, w * 0.05, '#6b5638');
        rrect(cx - w * 0.36, h * 0.2, w * 0.72, h * 0.3, w * 0.14, '#5a86b0');
        ell(cx, h * 0.35, w * 0.3, h * 0.12, '#6f9bc4');
        rrect(cx + w * 0.24, h * 0.1, w * 0.06, h * 0.14, 2, '#c8503f');
        break;
      }
      case 'bench': {
        const seatY = h * 0.5;
        rrect(w * 0.08, seatY, w * 0.84, h * 0.12, 6, '#a9773f');
        rrect(w * 0.08, h * 0.24, w * 0.84, h * 0.1, 6, '#b98a52');
        rrect(w * 0.12, seatY, w * 0.06, h * 0.42, 3, '#8a6033');
        rrect(w * 0.82, seatY, w * 0.06, h * 0.42, 3, '#8a6033');
        rrect(w * 0.12, h * 0.24, w * 0.05, h * 0.28, 3, '#8a6033');
        rrect(w * 0.83, h * 0.24, w * 0.05, h * 0.28, 3, '#8a6033');
        break;
      }
      case 'signpost': {
        const postW = w * 0.14;
        rrect(cx - postW / 2, h * 0.4, postW, h * 0.6, postW * 0.35, '#7a5a34');
        // Blank board (light wood) — the area name is drawn over this in-game.
        rrect(w * 0.08, h * 0.14, w * 0.84, h * 0.34, 8, '#d8b57e');
        rrect(w * 0.08, h * 0.14, w * 0.84, h * 0.06, 8, '#e6c891');
        ctx.strokeStyle = 'rgba(90,64,34,0.55)';
        ctx.lineWidth = 3;
        ctx.strokeRect(w * 0.1, h * 0.16, w * 0.8, h * 0.3);
        // Little pointing arrow tip.
        ctx.beginPath();
        ctx.moveTo(w * 0.92, h * 0.2);
        ctx.lineTo(w * 1.0, h * 0.31);
        ctx.lineTo(w * 0.92, h * 0.42);
        ctx.closePath();
        ctx.fillStyle = '#c9a56e';
        ctx.fill();
        break;
      }
      case 'lantern-string': {
        // A swagged cord of warm paper lanterns, transparent elsewhere.
        ctx.strokeStyle = 'rgba(40,30,50,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.2);
        ctx.quadraticCurveTo(cx, h * 0.5, w, h * 0.2);
        ctx.stroke();
        const lamps = 7;
        for (let i = 0; i < lamps; i += 1) {
          const t = (i + 0.5) / lamps;
          const lx = t * w;
          const ly = h * 0.2 + Math.sin(t * Math.PI) * (h * 0.3);
          ell(lx, ly + h * 0.02, w * 0.02, h * 0.16, 'rgba(255,210,140,0.25)');
          rrect(lx - w * 0.022, ly, w * 0.044, h * 0.2, w * 0.02, i % 2 ? '#f4c98a' : '#f0b0c0');
        }
        break;
      }
      case 'crane-1':
      case 'crane-2':
      case 'crane-3': {
        // A single origami paper crane seen from a top-down 3/4, sitting on the
        // water: a folded body wing, an upswept lit-side wing catching the last
        // light, a lifted head/neck and a tail point. Centred in the canvas
        // (no ground contact — it floats); the engine drifts one crane per
        // colour variant across the shore water with per-instance
        // scale/rotation/phase. The three palettes harmonize with the clearing's
        // twilight indigo/rose/gold: 1 = cream with blush facets, 2 = pale warm
        // gold, 3 = soft lavender-lilac.
        const cranePalettes: Record<string, {
          body: string; lit: string; head: string; tail: string; crease: string;
        }> = {
          'crane-1': {
            body: '#efe4d2', lit: '#f3c6d6', head: '#ecdcc9', tail: '#e6d6c2',
            crease: 'rgba(120,104,72,0.4)',
          },
          'crane-2': {
            body: '#f2e5c2', lit: '#f6d492', head: '#eedcb2', tail: '#e9d2a0',
            crease: 'rgba(138,108,54,0.4)',
          },
          'crane-3': {
            body: '#e7dff2', lit: '#d3bfe8', head: '#dfd3ee', tail: '#d7c9e6',
            crease: 'rgba(96,82,128,0.45)',
          },
        };
        const pal = cranePalettes[kind.style] ?? cranePalettes['crane-1'];
        ctx.save();
        ctx.translate(cx, h * 0.52);
        // Faint reflection smear just beneath the fold, so it reads as floating.
        ell(0, h * 0.2, w * 0.26, h * 0.05, 'rgba(232,220,235,0.16)');
        // Lower/back wing fold (the paper body).
        ctx.beginPath();
        ctx.moveTo(-w * 0.06, -h * 0.02);
        ctx.lineTo(w * 0.3, -h * 0.16);
        ctx.lineTo(w * 0.14, h * 0.06);
        ctx.lineTo(w * 0.34, h * 0.2);
        ctx.lineTo(-w * 0.12, h * 0.14);
        ctx.closePath();
        ctx.fillStyle = pal.body;
        ctx.fill();
        // Upswept front wing (the lit side).
        ctx.beginPath();
        ctx.moveTo(-w * 0.04, -h * 0.01);
        ctx.lineTo(-w * 0.02, -h * 0.24);
        ctx.lineTo(w * 0.2, -h * 0.05);
        ctx.lineTo(w * 0.02, h * 0.05);
        ctx.closePath();
        ctx.fillStyle = pal.lit;
        ctx.fill();
        // Head + neck lifting to the left, and the tail point trailing right.
        ctx.beginPath();
        ctx.moveTo(-w * 0.04, h * 0.0);
        ctx.lineTo(-w * 0.28, -h * 0.14);
        ctx.lineTo(-w * 0.12, h * 0.06);
        ctx.closePath();
        ctx.fillStyle = pal.head;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(w * 0.14, h * 0.06);
        ctx.lineTo(w * 0.4, h * 0.02);
        ctx.lineTo(w * 0.18, h * 0.14);
        ctx.closePath();
        ctx.fillStyle = pal.tail;
        ctx.fill();
        // Soft centre crease.
        ctx.strokeStyle = pal.crease;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-w * 0.04, -h * 0.02);
        ctx.lineTo(w * 0.18, h * 0.1);
        ctx.stroke();
        ctx.restore();
        break;
      }
      default: {
        rrect(w * 0.2, h * 0.4, w * 0.6, h * 0.5, 8, '#7f8a6a');
      }
    }
  }

  // Brings the origami / fold-the-letters twilight into the clearing: an indigo→
  // rose sky wash, a faint star field, drifting sakura petals on the ground, and
  // distant pine silhouettes at the treeline — so it reads as the same dusk world
  // the letters sail out into. Layered under the shore band and props.
  private decorateClearing(width: number, height: number, tile: number): void {
    const rng = mulberry32(fnv1a(`${this.location.id}:origami`));

    // Sky wash: deep indigo up top warming to rose toward the water horizon.
    const grad = this.add.graphics().setDepth(-19.4).setAlpha(0.5);
    const top = 0x1a1440;
    const horizon = 0x743f5b;
    const strips = 40;
    for (let i = 0; i < strips; i += 1) {
      const t = i / (strips - 1);
      grad.fillStyle(mixColor(top, horizon, Math.pow(t, 1.25)), 1);
      grad.fillRect(0, (t * height) - 1, width, height / strips + 2);
    }

    // Star field across the upper reaches.
    const stars = this.add.graphics().setDepth(-19.2);
    for (let i = 0; i < 46; i += 1) {
      const sx = rng() * width;
      const sy = rng() * height * 0.52;
      stars.fillStyle(0xfdf3d6, 0.3 + rng() * 0.6);
      stars.fillCircle(sx, sy, 0.6 + rng() * 1.4);
    }

    // Distant pine silhouettes at the north corners (the fold-the-letters
    // treeline), fading into the dusk.
    const pines = this.add.graphics().setDepth(-19).setAlpha(0.85);
    const drawPine = (bx: number, by: number, ph: number): void => {
      pines.fillStyle(0x241d3c, 1);
      const pw = ph * 0.5;
      pines.beginPath();
      pines.moveTo(bx, by - ph);
      pines.lineTo(bx - pw / 2, by);
      pines.lineTo(bx + pw / 2, by);
      pines.closePath();
      pines.fillPath();
    };
    for (let i = 0; i < 6; i += 1) {
      drawPine(20 + i * 34 + rng() * 12, tile * (1.0 + rng() * 0.4), tile * (1.4 + rng() * 1.1));
      drawPine(width - 20 - i * 34 - rng() * 12, tile * (1.0 + rng() * 0.4), tile * (1.4 + rng() * 1.1));
    }

    // Sakura petals drifting over the grass (not on the path lane or the shore).
    const petals = this.add.graphics().setDepth(-18);
    const pinks = [0xf4c2d4, 0xecaac4, 0xf6ccdb, 0xd79ec8];
    const shoreTop = height - tile * 2;
    const pathXMin = width / 2 - tile * 0.7;
    const pathXMax = width / 2 + tile * 0.7;
    for (let i = 0; i < 90; i += 1) {
      const px = rng() * width;
      const py = tile * 0.6 + rng() * (shoreTop - tile * 0.6);
      if (px > pathXMin && px < pathXMax) {
        continue;
      }
      petals.fillStyle(pinks[Math.floor(rng() * pinks.length)], 0.55 + rng() * 0.35);
      const r = 1.6 + rng() * 2.4;
      petals.fillEllipse(px, py, r * 1.8, r);
    }
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
