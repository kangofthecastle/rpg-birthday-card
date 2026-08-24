import Phaser from 'phaser';
import { getActivity } from '../activities/activityRegistry';
import {
  ENDING_SKY_KEY,
  ENDING_WATER_KEY,
  GALAXY_GROUND_KEY,
  GALAXY_VIOLIN_KEY,
  SHORE_WATER_KEY,
  FRIEND_TWO_SPRITE,
} from '../content/galaxyScene';
import { HOME_HOST_NPCS, FRIEND_ONE_SPRITE, resolveHomeNpcPosition } from '../content/homeNpcs';
import { GALAXY_ENDING_LETTERS } from '../content/galaxyLetters';
import { mergeLetterArchive, type Letter } from '../content/letters';
import {
  getActivityCompletionStory,
  resolveRecipientPcStory,
  resolveMangoRiceDialogue,
} from '../content/storyContent';
import {
  RECIPIENT_PC_MAIL_CUE,
  CLEARING_KOI_KEY,
  FINALE_OMEN_DISPLAY_SIZE,
  FINALE_OMEN_KEY,
  FRIEND_ONE_PC_GLASS_CUE,
  STORY_KOI_BOWL_ONE_KEY,
  STORY_KOI_BOWL_TWO_KEY,
} from '../content/storyAssets';
import {
  FRIEND_TWO_GENERATED_ROWS,
  FRIEND_TWO_PARTIAL_FRAMES,
  friendtwoRowAnimationKey,
  friendtwoRowTextureKey,
} from '../content/friendtwoPartialSprite';
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
import {
  getRoomDressing,
  getRoomLayoutNpcs,
  getRoomLayoutRemoved,
  type RoomDressing,
} from '../content/roomDressing';
import {
  renderExitDoormat,
  renderInteriorAwakening,
  renderRoomDressing,
  growBoundsFromObject,
  type PropColliderRect,
  type PropHandle,
  type ScreenBounds,
} from '../game/roomRenderer';
// Type-only: erased at runtime, so the dressEditor module stays lazily imported
// (its startDressEditor is loaded via dynamic import only under ?dressEdit=1).
import type { NpcEditHandle, OutdoorEditHandle } from '../game/dressEditor';
import {
  getCollisionZones,
  isPlayerInFrontOfDepthLine,
  isRotatedPropDepthLine,
  type CollisionZonesFile,
  type PropDepthOverride,
} from '../content/collisionZones';
import {
  getBedDepthLines,
  getDefaultBedDepthOverrides,
  isPlayerInFrontOfBedDepthLines,
} from '../content/bedDepth';
import {
  rasterizePolygonsToRects,
  resolveOutdoorColliders,
  type Polygon,
} from '../game/collisionGeometry';
import {
  clampDepthBehindLayers,
  getPlayerDepthSortingPoint,
  PLAYER_VISUAL_DEPTH_BIAS,
  resolvePropDepthRelativeToPlayer,
} from '../game/propDepth';
import type {
  DialogueLine,
  LocationDefinition,
  LocationEdgeExit,
  LocationInteraction,
} from '../content/types';
import {
  EDGE_ARRIVAL_COOLDOWN_MS,
  edgePortalSpan,
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
  getOutdoorLayoutRemoved,
  getOutdoorSignposts,
  getSignposts,
  exteriorTextureKey,
  propTextureKey,
  PROP_KINDS,
  PATH_ORIGIN_COL_OFFSET,
  SIGNPOST_PROP_NAME,
  type ExteriorPlacement,
  type OutdoorPalette,
  type PropKind,
  type PropPlacement,
} from '../content/outdoorScenery';
import { buildOutdoorGround } from '../game/outdoorGround';
import {
  completeLocation,
  createInitialRunState,
  hasAllFriendKeepsakes,
  hasActivityCompleted,
  hasKeepsake,
  hasSeenBeat,
  isCardMode,
  isBoatFolded,
  isFinalSpotUnlocked,
  markBeatSeen,
  markEndingCompleted,
  setCurrentLocation,
  type RunState,
} from '../game/runState';
import {
  isInteractionAvailable,
  isInteractionLocked,
  shouldPlayEnterBeat,
} from '../game/interactionState';
import {
  getStoryTravelBlock,
  isClearingAwakened,
  isFriendOneFollowing,
  RETAKE_ACTIVITY_ID,
  shouldShowHomeNpc,
  VIOLIN_ACTIVITY_ID,
  INTRO_COMPLETE_BEAT_ID,
  FINAL_SPOT_ARRIVAL_BEAT_ID,
  FRIEND_ONE_PC_READY_BEAT_ID,
  VIOLIN_CALLED_BEAT_ID,
} from '../game/storyProgression';
import {
  advanceFollowerTrail,
  createFollowerTrail,
  type FollowerFacing,
  type FollowerTrailState,
} from '../game/followerTrail';
import {
  advanceFollowerRoute,
  createFriendTwoRoomFriendOneRoute,
  facingForScreenDeltaWithHysteresis,
  type FollowerRouteState,
} from '../game/followerRoute';
import {
  advanceClearingCurrentItem,
  advanceClearingMote,
  createClearingCurrent,
  createClearingMotePath,
  sampleClearingMoteRibbon,
  type ClearingCurrentItem,
  type ClearingMote,
  type ClearingMotePath,
} from '../game/clearingCurrent';
import {
  VIOLIN_INVITATION_DURATION_MS,
  createViolinInvitationSchedule,
} from '../game/violinInvitationCue';
import { getPitch } from '../activities/violin/melody';
import {
  advanceFinaleReveal,
  createFinaleReveal,
  type FinaleRevealState,
} from '../game/finaleReveal';
import {
  areAllGalaxyLettersLit,
  areAllGalaxyLettersRead,
  canCollectGalaxyLetter,
  createGalaxyLetterState,
  layoutGalaxyLetterStars,
  lightAllGalaxyLetters,
  readGalaxyLetter,
  type GalaxyLetterState,
} from '../game/galaxyLetters';
import {
  EPILOGUE_WALL_SHEAR,
  resolveEpilogueRoomAnchors,
} from '../game/epilogueRoom';
import { type IsoOrigin, type IsoPoint } from '../game/isometricProjection';
import { createProjection, type Projection } from '../game/projection';
import {
  playMusic,
  playSfx,
  playViolinNote,
  stopMusic,
  type MusicKey,
} from '../game/audio';
import {
  getObjectLayer,
  getPointObject,
  getRectObjects,
  type RectObject,
  type TiledMapJson,
} from '../game/mapHelpers';
import { getPlayerFacingFromScreenMovement, PlayerController } from '../game/playerController';
import {
  createCollectionPanel,
  getCollectedFriendLetters,
  type CollectionPanelHandle,
} from '../ui/collectionPanel';
import { showDialogue, type ShowDialogueOptions } from '../ui/dialogueBox';
import { clearUiRoot, getUiRoot } from '../ui/domRoot';
import {
  showGalaxyLettersHud,
  type GalaxyLettersHudHandle,
} from '../ui/galaxyLettersHud';
import {
  showLetterModal,
  showPhotoLetterModal,
  showSheetMusicModal,
} from '../ui/letterModal';
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

// --- Guildford south dusk-threshold: tunable ---------------------------------
// A painterly foreshadow of the twilight clearing along main-outside's south
// edge, so the day->dusk hand-off across the edge transition isn't abrupt. Two
// knobs: how many tile-rows the cooling band spans, and how deep the indigo goes
// at the very edge (0 disables the wash). The band's indigo is the clearing's
// own sky/background colour so the two places read as one continuous evening.
const SOUTH_DUSK_ROWS = 4.5;
const SOUTH_DUSK_PEAK_ALPHA = 0.5;
const SOUTH_DUSK_INDIGO = 0x161031; // == CLEARING_DUSK.background

// Clearing shore: height (in tiles) of the feathered damp bank that blends the
// dusk grass into the water band so the waterline isn't an abrupt cut. Tunable —
// raise for a wider, softer beach; lower toward 0 for a crisper edge.
const CLEARING_SHORE_BANK_ROWS = 1.05;

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

const INTRO_PC_BUZZ_DELAY_MS = 1500;
const INTRO_THEME_HUM_VOLUME = 0.14;

// Player yardstick (mirrors roomRenderer): ____ reads ~0.88 of her frame.
const PLAYER_VISUAL_HEIGHT_PX = RECIPIENT_SPRITE.frameHeight * RECIPIENT_SPRITE.scale * 0.88;

function colorToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Alpha-measured geometry of a fingerpost's arrow board, in TEXTURE pixels (the
 * fit derives from the texture; the display derives from the kind/placement scale,
 * and `scale` — world px per texture px — bridges the two). Measured once per
 * texture (see LocationScene.measureSignpostBoard) so it adapts to any drop-in art
 * size with no baked constants.
 */
interface SignpostBoardGeometry {
  /** Source texture dimensions the px fields are measured against. */
  readonly texW: number;
  readonly texH: number;
  /** Vertical centre of the plank (px from the texture's top). */
  readonly boardCenterY: number;
  /** Horizontal centre of the rectangular shaft (px from the texture's left), for
   * the native art whose arrowhead points right — so it sits left of the board's
   * centre. Mirrored about the texture centre when the sprite is flipped. */
  readonly shaftCenterX: number;
  /** Margin-inset width of the shaft (px): the caption budget before the arrowhead. */
  readonly shaftUsableWidth: number;
}

/**
 * How much bigger than the base-font display size (`scale`) a caption may render
 * when the plank has spare width. The measured signpost art is far wider than a
 * short destination name needs, so at 1.0 the words sat small and lost on the
 * board; 1.3 lets the type grow ~30% into that headroom. The width auto-fit below
 * (`budget / captionWidth`) is still the hard cap, so a long name never overflows
 * the plank's alpha bounds no matter how high this ceiling is raised.
 */
const SIGNPOST_CAPTION_FILL = 1.3;

/**
 * Place a fingerpost's destination caption from measured board geometry. Returns
 * the world position + scale for the (never-flipped, upright) Text so it sits
 * centred on the arrow SHAFT, vertically on the plank, and auto-shrinks until it
 * fits the shaft's usable width. `scale` is the board's world-px-per-texture-px
 * (placementScale folded in, texture-size normalised), so it converts every
 * measured texture length straight to world units; the caption's ceiling is
 * `scale × SIGNPOST_CAPTION_FILL` (a name is never enlarged past that, and a long
 * one is shrunk below it to fit the shaft width). `anchor` is the board's feet
 * (origin 0.5,1). Shared by renderSignposts and the dressEdit reposition path so a
 * hand-resized board re-fits identically.
 */
function placeSignpostCaption(
  geom: SignpostBoardGeometry,
  scale: number,
  anchorX: number,
  anchorY: number,
  flip: boolean,
  captionWidth: number,
): { x: number; y: number; scale: number } {
  // Board is bottom-anchored: the shaft centre sits (texH - boardCenterY) texture
  // px above the feet.
  const y = anchorY - (geom.texH - geom.boardCenterY) * scale;
  const dx = (geom.shaftCenterX - geom.texW / 2) * scale;
  const x = anchorX + (flip ? -dx : dx);
  const budget = geom.shaftUsableWidth * scale;
  // Grow into the plank's spare width up to the fill ceiling, but never past the
  // width the shaft can hold (the auto-fit contract: no overflow past the alpha
  // bounds, at any dressEdit scale).
  const ceiling = scale * SIGNPOST_CAPTION_FILL;
  const capScale = captionWidth > 0 ? Math.min(ceiling, budget / captionWidth) : ceiling;
  return { x, y, scale: capScale };
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

/** A standing outdoor billboard that can cross ____ at an authored depth line. */
interface OutdoorDepthHandle {
  readonly id: string;
  readonly mapX: number;
  readonly mapY: number;
  readonly image: Phaser.GameObjects.Image;
  readonly label?: Phaser.GameObjects.Text;
}

interface ClearingKoiDisplay {
  readonly kind: 'koi';
  model: ClearingCurrentItem;
  readonly image: Phaser.GameObjects.Image;
  readonly baseY: number;
  readonly bobRate: number;
  readonly bobAmount: number;
}

interface ClearingMoteDisplay {
  readonly kind: 'mote';
  model: ClearingMote;
  readonly image: Phaser.GameObjects.Image;
  readonly path: ClearingMotePath;
  readonly bobRate: number;
  readonly bobAmount: number;
}

type ClearingCurrentDisplay = ClearingKoiDisplay | ClearingMoteDisplay;

interface GalaxyLetterStarDisplay {
  readonly index: number;
  readonly glow: Phaser.GameObjects.Ellipse;
  readonly star: Phaser.GameObjects.Star;
  lit: boolean;
  collected: boolean;
}

interface GalaxyLetterEndingRuntime {
  model: GalaxyLetterState;
  readonly letters: readonly Letter[];
  readonly stars: readonly GalaxyLetterStarDisplay[];
  readonly violin: Phaser.GameObjects.Image;
  readonly violinGlow: Phaser.GameObjects.Ellipse;
  readonly playKey?: Phaser.Input.Keyboard.Key;
  readonly hud: GalaxyLettersHudHandle;
  awakening: boolean;
  openingLetter: boolean;
}

const GALAXY_VIOLIN_PITCH_ID = 'a4';
const GALAXY_VIOLIN_NOTE_MS = 3600;
const GALAXY_STAR_REVEAL_SPAN_MS = 2200;

const GALAXY_STAR_COLLECT_RADIUS = 46;


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
};

// RETAKE relies on its weapon, spike, defuse, and kill cues for its soundscape.
// Fade out the room bed while it is open instead of layering synth music under
// those gameplay sounds.
const MUSIC_SILENT_ACTIVITY_IDS: ReadonlySet<string> = new Set(['valorant-split']);

// The four full-screen minigames. While one is open the global HUD chrome (the
// top-right mute toggle and the Letters/envelope inventory) is hidden via a
// body class so nothing floats over the standardized activity shell; it is
// restored the moment the activity closes. The ending reveal is deliberately
// NOT in this set — it runs its own terminal overlay flow.
const MINIGAME_ACTIVITY_IDS: ReadonlySet<string> = new Set([
  'friendone-pc-fishing',
  'valorant-split',
  'recipient-violin-piece',
  'fold-the-letters',
]);

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
  private clearingCurrentDisplays: ClearingCurrentDisplay[] = [];
  private clearingCurrentClock = 0;
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
  // Outdoor decoration billboards paired with their placement + kind, for the
  // ?dressEdit=1 editor in an outdoor area (drag/resize/delete). Collected as the
  // props + signpost render; the signpost handle also carries its label + linked
  // interaction id (for the gold-rect pairing hint).
  private outdoorPropHandles: OutdoorEditHandle[] = [];
  // Per-instance standing outdoor billboards for ?editZones=1 depth authoring
  // and runtime player/prop sorting. Flat ground scatter and overhead art are
  // intentionally excluded.
  private outdoorDepthHandles: OutdoorDepthHandle[] = [];
  // The room's home host NPC (____/____) as a dressEdit handle, so ?dressEdit=1
  // can drag it. Set when createHomeHostNpc places the sprite; undefined in rooms
  // (or outdoor areas) with no resident.
  private homeHostNpcHandle?: NpcEditHandle;
  private friendoneFollower?: Phaser.GameObjects.Sprite;
  private friendoneFollowerTrail?: FollowerTrailState;
  private friendoneFollowerRoute?: FollowerRouteState;
  // Last facing actually displayed on the follower sprite; feeds the
  // hysteresis so facing stays sticky across frames instead of flapping.
  private friendoneFollowerFacing: FollowerFacing = 'down';
  private galaxyLetterEnding?: GalaxyLetterEndingRuntime;
  private friendonePcReadyCue: Phaser.GameObjects.GameObject[] = [];
  private violinCueTimers: Phaser.Time.TimerEvent[] = [];
  private finaleActor?: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  private finaleReveal: FinaleRevealState = createFinaleReveal(false);
  /** Alpha-measured signpost board geometry, cached per texture key (measuring
   * reads the whole texture once). Keeps caption fit texture-driven. */
  private signpostGeometryCache = new Map<string, SignpostBoardGeometry>();
  private roomOrigin?: IsoOrigin;
  private dressEditFrozen = false;
  private propColliders: PropColliderRect[] = [];
  private propColliderBodies: Phaser.GameObjects.Rectangle[] = [];
  // Debug outlines (purple authored polygons / red effective rects) tracked so a
  // live zone rebuild can tear them down and redraw.
  private colliderDebugGraphics: Phaser.GameObjects.Graphics[] = [];
  // The player-vs-prop-colliders collider, kept so a live rebuild can drop and
  // re-add it against the rebuilt body set.
  private propColliderCollider?: Phaser.Physics.Arcade.Collider;
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
    this.clearingCurrentDisplays = [];
    this.clearingCurrentClock = 0;
    this.friendoneFollower = undefined;
    this.friendoneFollowerTrail = undefined;
    this.friendoneFollowerRoute = undefined;
    this.friendonePcReadyCue = [];
    this.violinCueTimers = [];
    this.finaleActor = undefined;
    this.finaleReveal = createFinaleReveal(this.state.endingCompleted);
    this.galaxyLetterEnding = undefined;
    this.collectionPanel = undefined;
  }

  create(): void {
    clearUiRoot();
    document.body.classList.toggle(
      'ending-transition-active',
      this.autoStartActivityId === 'final-keepsake-reveal',
    );
    document.body.classList.remove('ending-montage-mounted');
    const params = new URLSearchParams(window.location.search);
    // The zone editor forces the collider/zone debug overlay on so the author
    // always sees current collision truth while editing.
    this.showColliderDebug =
      params.has('dressDebug') || (import.meta.env.DEV && params.has('editZones'));
    // Interaction/exit action rectangles are a separate concern. Keep them
    // hidden during collision/depth authoring; only the explicit dressing debug
    // mode should reveal them.
    this.debugMarkers = params.has('dressDebug');
    // Mirror the current location onto the DOM so the on-screen location label
    // change is observable to smoke tests (Phaser canvas text is not queryable).
    document.body.dataset.locationId = this.location.id;
    document.body.dataset.runMode = this.state.mode ?? 'story';
    delete document.body.dataset.interiorAwakened;
    delete document.body.dataset.introThemeHum;
    delete document.body.dataset.introPcBuzz;
    delete document.body.dataset.introPcGlitch;
    delete document.body.dataset.galaxyEndingPhase;
    delete document.body.dataset.galaxyStarsLit;
    delete document.body.dataset.galaxyLettersRead;
    this.createMap();
    this.createPlayer();
    this.createFriendOneFollower();
    this.createHud();
    this.createLocationLabel();
    this.applyWarmLightingTint();
    this.applyOutdoorAwakening();
    this.createGalaxyScenery();
    this.createHomeHostNpc();
    this.applyFishbowlStoryState();
    this.applyFriendOnePcReadyState();
    this.applyEpilogueRoomState();
    // Statically awaken a dressed interior already entered post-violin (later
    // room entries); the completion seam applies it dynamically the first time.
    this.applyInteriorAwakening({ animate: false });
    playMusic(locationMusicKey(this.location.id), { fadeMs: 1200 });
    this.startStoryAudioCues();

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
      .setDepth(1000)
      // Hidden while empty: an empty Text still paints its background padding as a
      // small dark box in the corner, so visibility must track the caption content.
      .setVisible(false);

    if (this.arrivedViaEdge) {
      this.edgeCooldownUntil = this.time.now + EDGE_ARRIVAL_COOLDOWN_MS;
    }

    void this.runEnterBeats();
    if (this.location.id === 'final-spot' && !this.autoStartActivityId) {
      void this.runFinalSpotArrivalBeat();
    }
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
    this.setPrompt('');
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
  private getEffectivePropDepthOverrides(): Readonly<Record<string, PropDepthOverride>> {
    const bed = this.dressing?.props.find((placement) => placement.frame === 'bed');
    const defaults = bed ? getDefaultBedDepthOverrides(bed) : {};
    return {
      ...defaults,
      ...(this.zonesFile?.propDepthOverrides ?? {}),
    };
  }

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
    const initialZonesFile: CollisionZonesFile | undefined = this.dressing
      ? {
          locationId: this.location.id,
          zones: this.zonesFile?.zones ?? [],
          propDepthOverrides: this.getEffectivePropDepthOverrides(),
        }
      : this.zonesFile;
    void import('../game/zoneEditor').then(({ startZoneEditor }) => {
      startZoneEditor(this, {
        locationId: this.location.id,
        projection,
        playerVisual,
        dressing: this.dressing,
        outdoorDepthTargets: this.outdoorDepthHandles.map(({ id, mapX, mapY }) => ({
          id,
          mapX,
          mapY,
        })),
        initial: initialZonesFile,
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
    if (!params.has('dressEdit') || !this.projection) {
      return;
    }

    // Dressed interior rooms edit their RoomDressing props; outdoor areas edit the
    // OUTDOOR_PROPS decoration (+ the signpost). Interactables (M) mode works in
    // both (their maps carry the same Interactables/Exits/Spawns layers).
    if (this.dressing && this.roomOrigin) {
      this.startRoomDressEditor();
    } else if (this.isOutdoor() && this.outdoorPropHandles.length > 0) {
      this.startOutdoorDressEditor();
    }
  }

  private startRoomDressEditor(): void {
    const projection = this.projection!;
    const dressing = this.dressing!;
    const origin = this.roomOrigin!;
    const propHandles = this.propHandles;
    // dressEdit only consumes the legacy numeric map-y adjustment. Rotated
    // boundaries belong to editZones and remain untouched by this editor.
    const propDepthOverrides = Object.fromEntries(
      Object.entries(this.zonesFile?.propDepthOverrides ?? {}).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number',
      ),
    );
    void import('../game/dressEditor').then(({ startDressEditor }) => {
      startDressEditor(this, {
        locationId: this.location.id,
        projection,
        origin,
        dressing,
        propHandles,
        propDepthOverrides,
        npcHandles: this.homeHostNpcHandle ? [this.homeHostNpcHandle] : [],
        mapJson: this.getMapJson(),
        mapUrl: this.location.mapUrl,
        removed: getRoomLayoutRemoved(this.location.id),
        setPlayerFrozen: (frozen: boolean) => {
          this.dressEditFrozen = frozen;
        },
      });
    });
  }

  private startOutdoorDressEditor(): void {
    const projection = this.projection!;
    const handles = this.outdoorPropHandles;
    void import('../game/dressEditor').then(({ startDressEditor }) => {
      startDressEditor(this, {
        locationId: this.location.id,
        projection,
        propHandles: [],
        propDepthOverrides: {},
        mapJson: this.getMapJson(),
        mapUrl: this.location.mapUrl,
        removed: getOutdoorLayoutRemoved(this.location.id),
        setPlayerFrozen: (frozen: boolean) => {
          this.dressEditFrozen = frozen;
        },
        outdoor: {
          handles,
          reposition: (handle) => this.positionOutdoorProp(handle),
          saveRoute: '/__dev/save-outdoor-layout',
          // The linked dialogue hotspot rect for a signpost (from the tmj), shown
          // as a faint gold outline while the signpost is selected. Position-only
          // here: the rect itself is edited in the editor's Interactables (M) mode.
          signpostRect: (interactionId) => {
            const rect = this.interactions.find((it) => it.id === interactionId);
            return rect
              ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
              : undefined;
          },
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

      if (beat.id === INTRO_COMPLETE_BEAT_ID) {
        playSfx('sfx-story-hum', { volume: INTRO_THEME_HUM_VOLUME });
        document.body.dataset.introThemeHum = 'played';
      }
      await this.pauseForDialogue(beat.dialogue);
      if (beat.once !== false) {
        this.state = markBeatSeen(this.state, beat.id);
        this.registry.set('runState', this.state);
      }
      if (beat.id === INTRO_COMPLETE_BEAT_ID) {
        this.time.delayedCall(INTRO_PC_BUZZ_DELAY_MS, () => {
          playSfx('sfx-pc-fail', { volume: 0.9 });
          this.glitchRecipientPcVisual();
          document.body.dataset.introPcBuzz = 'played';
          document.body.dataset.introPcGlitch = 'played';
        });
      }
    }
  }

  private glitchRecipientPcVisual(): void {
    const desk = this.propHandles.find(({ placement }) => placement.frame === 'desk')?.image;
    if (!desk) {
      return;
    }
    this.tweens.add({
      targets: desk,
      alpha: { from: 1, to: 0.55 },
      duration: 85,
      yoyo: true,
      repeat: 3,
    });
  }

  private async runFinalSpotArrivalBeat(): Promise<void> {
    if (
      this.location.id !== 'final-spot' ||
      this.state.endingCompleted ||
      hasSeenBeat(this.state, FINAL_SPOT_ARRIVAL_BEAT_ID)
    ) {
      return;
    }
    await this.pauseForDialogue([
      { speaker: '____', text: 'Where am I? Who is that?', portraitId: 'portrait-recipient' },
    ]);
    this.state = markBeatSeen(this.state, FINAL_SPOT_ARRIVAL_BEAT_ID);
    this.registry.set('runState', this.state);
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
    this.advanceClearingCurrent(delta);

    // The dressEdit editor freezes the whole scene: the player stands still and
    // no interactions/edges fire, so arranging props never triggers gameplay.
    if (this.dressEditFrozen) {
      this.controller.update(false);
      this.syncPlayerVisual();
      this.setPrompt('');
      return;
    }

    this.controller.update(this.canMove);
    this.syncPlayerVisual();
    this.updateGalaxyLetterEnding();
    this.updateFriendOneFollower(delta);

    if (this.debugMarkers) {
      document.body.dataset.playerPos = `${Math.round(this.player.x)},${Math.round(this.player.y)}`;
    }

    if (!this.canMove) {
      this.activeObject = undefined;
      this.setPrompt('');
      return;
    }

    if (this.checkEdgeTransitions()) {
      this.activeObject = undefined;
      this.setPrompt('');
      return;
    }

    this.activeObject = this.findActiveObject();
    this.setPrompt(this.activeObject ? `E - ${this.getObjectLabel(this.activeObject)}` : '');

    if (this.activeObject && this.interactKey && Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      void this.activateObject(this.activeObject);
    }
  }

  // Sets the interaction-prompt caption, hiding the object entirely when empty so
  // its padded background never lingers as a small dark box in the corner.
  private setPrompt(text: string): void {
    this.promptText?.setText(text).setVisible(text.length > 0);
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

    const storyBlock = getStoryTravelBlock(edgeExit.destinationLocationId, this.state);
    if (storyBlock) {
      this.nudgeAwayFromEdge(edgeExit.edge);
      playSfx('sfx-story-hum', { volume: 0.22 });
      await this.pauseForDialogue([storyBlock]);
      this.edgeCooldownUntil = this.time.now + EDGE_ARRIVAL_COOLDOWN_MS;
      this.edgeTriggerBusy = false;
      return;
    }

    // The gated south edge opens only once the boat is folded; simply reaching
    // the clearing never lets ____ walk across the water.
    if (edgeExit.requiresFinalUnlock && !isBoatFolded(this.state)) {
      this.nudgeAwayFromEdge(edgeExit.edge);
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
    this.colliderDebugGraphics = [];
    this.outdoorPropHandles = [];
    this.outdoorDepthHandles = [];
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
        this.getEffectivePropDepthOverrides(),
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
      const scenery = [
        ...this.renderOutdoorExteriors(),
        ...this.renderOutdoorProps(tilemap),
        ...this.renderSignposts(tilemap),
      ];
      // Authored zones replace generated scenery colliders; before a zones file
      // exists, the scenery footprints remain the fallback.
      this.propColliders = this.resolveOutdoorZoneColliders(scenery);
    } else {
      const palette = getOutdoorPalette(this.location.id);
      this.cameras.main.setBackgroundColor(
        palette ? colorToHex(palette.background) : '#17211b',
      );
      this.createDevBackdrop(tilemap, palette);
      const scenery = this.renderOutdoorExteriors();
      this.propColliders = this.resolveOutdoorZoneColliders(scenery);
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

  // Outdoor collider assembly: generated scenery is the no-file fallback;
  // authored polygons replace it as soon as the editor saves a zones file.
  private resolveOutdoorZoneColliders(
    sceneryRects: PropColliderRect[],
  ): PropColliderRect[] {
    const polygons = this.zonesFile?.zones
      .filter((zone) => zone.points.length >= 3)
      .map((zone) => zone.points);
    return resolveOutdoorColliders(
      sceneryRects,
      polygons,
      LocationScene.ZONE_CELL_SIZE,
    );
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
        this.colliderDebugGraphics.push(outline);
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
        this.colliderDebugGraphics.push(outline);
      }
    }
  }

  // Dev-only hook (used ONLY by the ?editZones=1 zone editor). Rebuilds the
  // zone-derived collision in place from the editor's current in-memory polygons
  // so saved zones take effect immediately without a page reload. Mirrors
  // createMap's semantics EXACTLY — authored polygons replace generated
  // footprints in both rooms and outdoor areas — so a live rebuild is identical
  // to a save-then-reload cold load. Also refreshes the
  // purple-authored / red-effective debug overlay in the same pass.
  //
  // Numeric propDepthOverrides are still applied only at room render time.
  // Rotated lines are read by syncRotatedPropDepths every frame, so line edits
  // take effect immediately after this hook replaces zonesFile.
  rebuildZoneColliders(zonesFile: CollisionZonesFile): void {
    if (!import.meta.env.DEV) {
      return;
    }
    this.zonesFile = zonesFile;

    // Tear down the previous zone-derived bodies, their debug outlines, and the
    // player collider that referenced them.
    this.propColliderCollider?.destroy();
    this.propColliderCollider = undefined;
    for (const body of this.propColliderBodies) {
      body.destroy();
    }
    this.propColliderBodies = [];
    for (const graphics of this.colliderDebugGraphics) {
      graphics.destroy();
    }
    this.colliderDebugGraphics = [];

    // Saving means an authored file now exists, so its polygons replace every
    // generated footprint regardless of whether the area is indoors or out.
    this.propColliders = this.rasterizeZones(zonesFile);

    this.createPropColliderBodies();

    if (this.player && this.propColliderBodies.length > 0) {
      this.propColliderCollider = this.physics.add.collider(
        this.player,
        this.propColliderBodies,
      );
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

    // The VISUAL worn-path routing. Normally identical to the walkable openEdges
    // (centre -> every open edge + door), but Guildford's south leg toward the
    // clearing is deliberately left UNPAVED: the way down to the twilight water is
    // "off the path" — you leave the road and wander south through plain grass.
    // Targeted to main-outside's south edge only; the edge stays fully walkable
    // (the corridor mask below reads the unfiltered openEdges) and the south edge
    // is still an OPEN edge here, so no hedge is drawn across the route mouth.
    // The twilight clearing carries NO worn path at all — you arrive off the road
    // and the space reads as untouched water's-edge grass. So it gets an empty
    // path mask / no path edges (walkability is unchanged — that comes from the
    // separate corridor mask below, which still reads the full openEdges).
    const isClearing = this.location.id === 'clearing';
    const pathEdges = isClearing
      ? new Set<string>()
      : this.location.id === 'main-outside'
        ? new Set([...openEdges].filter((edge) => edge !== 'south'))
        : openEdges;

    // Layered ground (v2): grass base + transparent worn-dirt path overlays +
    // boundary hedge strip, each an independent drop-in art slot with a procedural
    // fallback (see outdoorGround.ts). The path cell mask is the same 4-connected
    // centre->edge/door routing the corridor mask uses, so paths and walkability
    // agree. The clearing then layers its dusk decoration, shore and cranes.
    const pathMask = isClearing
      ? new Array<boolean>(cols * rows).fill(false)
      : this.rasterizePathCells(cols, rows, tile, width, height, pathEdges);
    buildOutdoorGround(this, {
      width,
      height,
      tile,
      cols,
      rows,
      palette: pal,
      openEdges,
      pathOpenEdges: pathEdges,
      exits: this.exits,
      pathMask,
      dusk: this.location.id === 'clearing',
      seed: this.location.id,
    });

    if (this.location.id === 'clearing') {
      this.decorateClearing(width, height, tile);
      this.drawClearingShore(width, height, tile);
      this.spawnClearingCranes(width, height, tile);
      this.spawnClearingCurrent(width, height, tile);
    }

    // Guildford's south edge foreshadows the twilight clearing: a painterly dusk
    // band cooling the last few tile-rows toward indigo, with a few drifting
    // petals and dark pine silhouettes framing the (now unpaved) route mouth. It
    // reads in plain daylight and, being a localised world-space darkening rather
    // than a competing full-screen wash, sits quietly under the awakening overlays.
    if (this.location.id === 'main-outside') {
      this.decorateSouthDuskThreshold(width, height, tile);
    }
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
    // A per-area horizontal origin nudge (PATH_ORIGIN_COL_OFFSET) lets a yard's
    // edge road run a tile longer/shorter at its interior end while its door leg
    // stays a clean vertical on the door's column (see the const's rationale).
    const origin = cellOf(center.x, center.y);
    const colOffset = PATH_ORIGIN_COL_OFFSET[this.location.id] ?? 0;
    origin.c = Math.min(cols - 1, Math.max(0, origin.c + colOffset));
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
    const awakened = isClearingAwakened(this.state);
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

    // Soft bank: a feathered strip of damp twilight earth straddling the waterline
    // so the dusk grass melts into the water instead of cutting to it. Alpha rises
    // from the grass side to a damp peak at the water's edge, then eases back down
    // into the water — no hard rim either way — with a faint lapping highlight along
    // the seam. Painterly and quiet; height is CLEARING_SHORE_BANK_ROWS-tunable.
    // Depth -16.9 sits just over the water band but under the awakened bloom (-16),
    // and well under the drifting cranes / the kneel figure, so it disturbs none.
    const bankHeight = tile * CLEARING_SHORE_BANK_ROWS;
    const bankTop = top - bankHeight * 0.6;
    const bankSpan = bankHeight; // ~0.6 above the waterline, ~0.45 feathering below
    const bank = this.add.graphics().setDepth(-16.9);
    const dampEarth = 0x2b2637; // muted damp twilight earth (reads sandy under warm light)
    this.fillSmoothVerticalBand(
      bank,
      0,
      bankTop,
      width,
      bankSpan,
      () => dampEarth,
      (t) => {
        const waterline = 0.6; // fraction of the band that sits on the grass side
        const peak = 0.5;
        return t <= waterline
          ? peak * Math.pow(t / waterline, 1.3)
          : peak * (1 - ((t - waterline) / (1 - waterline)) * 0.85);
      },
    );

    if (!awakened) {
      return;
    }

    // Awakened: a soft bloom of light BENEATH the water only. The former warm
    // seam highlight (a lapping gleam plus a bright band straddling the
    // waterline) read as a thick, washed-out horizontal bar rather than a wet
    // gleam, so it's dropped — the feathered damp bank above already carries the
    // land→water transition. Only the cool underwater bloom remains.
    const glow = this.add.graphics().setDepth(-16);
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
    // decorative: no colliders, so they never touch the "Look over the water"
  // interaction. Depth sits above the water/glow but well below any standing
  // figure, so ____ draws in front when he kneels at the shore.
  private spawnClearingCranes(width: number, height: number, tile: number): void {
    if (!isClearingAwakened(this.state)) {
      return;
    }
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
      if (isClearingAwakened(this.state)) {
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
  // crane drifts off the downstream (west) edge so it re-enters upstream fresh.
  private randomizeCrane(
    crane: DriftingCrane,
    rng: () => number,
    baseScale: number,
    yMin: number,
    yMax: number,
  ): void {
    crane.scale = baseScale * (0.85 + rng() * 0.3); // ±15%
    // Never flipped: every crane faces LEFT (the art and the procedural fallback
    // both face left), matching the right→left drift — always head-first.
    crane.image.setScale(crane.scale);
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

  // Integrates the drifting cranes one frame: right→left downstream drift, a
  // gentle vertical bob and a slight rotation wobble, wrapping any crane that
  // leaves the west edge back to the east so the trickle loops. Driven from
  // update() before the gameplay gates, so the water keeps breathing even while
  // dressEdit is frozen.
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
      const nextX = crane.image.x - crane.speed * dt;
      const halfW = (crane.image.width * crane.scale) / 2;
      if (nextX + halfW < -tile) {
        // Off the downstream (west) edge: re-roll and re-enter from the east
        // (the texture — and so the colour variant — stays with the crane).
        this.randomizeCrane(crane, rng, crane.baseScale, yMin, yMax);
        crane.image.setX(width + tile + halfW);
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

  /** Post-violin guidance: koi drift west while motes enter from the left water,
   * curl at the centre, and stream north into the clearing. */
  private spawnClearingCurrent(width: number, height: number, tile: number): void {
    if (!isClearingAwakened(this.state)) {
      delete document.body.dataset.clearingCurrent;
      return;
    }

    this.createMoteTexture();
    const bandTop = height - tile * 2;
    const current = createClearingCurrent(
      fnv1a(`${this.location.id}:story-current`),
      width,
      bandTop,
      tile * 1.45,
    );
    const motePath = createClearingMotePath(width, bandTop, tile * 1.45);
    const addKoi = (model: ClearingCurrentItem, index: number): void => {
      const image = this.add
        .image(model.x, model.y, CLEARING_KOI_KEY)
        .setOrigin(0.5)
        .setScale(model.scale)
        .setFlipX(model.flipX)
        .setAlpha(0.42)
        .setDepth(-14.7);
      this.clearingCurrentDisplays.push({
        kind: 'koi',
        model,
        image,
        baseY: model.y,
        bobRate: 0.7 + index * 0.08,
        bobAmount: 3.5,
      });
    };
    const addMote = (model: ClearingMote, index: number): void => {
      const point = sampleClearingMoteRibbon(
        motePath,
        model.progress,
        model.spread,
        width,
        tile * 1.45,
      );
      const image = this.add
        .image(point.x, point.y, 'awaken-mote')
        .setOrigin(0.5)
        .setScale(model.scale)
        .setAlpha(0.78 + (index % 4) * 0.055)
        .setDepth(point.y + 6)
        .setTint(0xffe7a8)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.clearingCurrentDisplays.push({
        kind: 'mote',
        model,
        image,
        path: motePath,
        bobRate: 1.1 + index * 0.04,
        bobAmount: 2.5,
      });
    };
    if (this.textures.exists(CLEARING_KOI_KEY)) {
      current.koi.forEach(addKoi);
    }
    current.motes.forEach(addMote);
    document.body.dataset.clearingCurrent = 'left-water-horizontal-curve-north';
  }

  private advanceClearingCurrent(deltaMs: number): void {
    if (this.clearingCurrentDisplays.length === 0) {
      return;
    }
    this.clearingCurrentClock += Math.max(0, deltaMs) / 1000;
    for (const display of this.clearingCurrentDisplays) {
      if (display.kind === 'koi') {
        display.model = advanceClearingCurrentItem(display.model, deltaMs, this.mapDims.width);
        display.image.setPosition(
          display.model.x,
          display.baseY +
            Math.sin(this.clearingCurrentClock * display.bobRate + display.model.phase) *
              display.bobAmount,
        );
      } else {
        display.model = advanceClearingMote(display.model, deltaMs);
        const point = sampleClearingMoteRibbon(
          display.path,
          display.model.progress,
          display.model.spread,
          this.mapDims.width,
          this.mapDims.tileSize * 1.45,
        );
        display.image.setPosition(
          point.x + Math.sin(this.clearingCurrentClock * 0.7 + display.model.phase) * 2,
          point.y +
            Math.sin(this.clearingCurrentClock * display.bobRate + display.model.phase) *
              display.bobAmount,
        );
        display.image.setDepth(point.y + 6);
      }
    }
  }

  // The galaxy place's ground: the painted ocean-galaxy you stand ON. A file-first
  // painted override (galaxy-ground.png) replaces it whole; otherwise it is
  // COMPOSED from the older sky/water fallback paintings — the galaxy sky pinned
  // across the top down to a horizon, the starlit water below,
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
    if (this.location.id !== 'final-spot' || this.state.endingCompleted) {
      return;
    }
    this.createMoteTexture();
    const pos = { x: 704, y: 464 };

    const glow = this.add
      .ellipse(pos.x, pos.y + 8, 104, 28, 0xffc06a, 0.1)
      .setDepth(pos.y - 2)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.06, to: 0.14 },
      scaleX: { from: 0.92, to: 1.08 },
      scaleY: { from: 0.88, to: 1.05 },
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    if (this.textures.exists(FINALE_OMEN_KEY)) {
      this.finaleActor = this.add
        .image(pos.x, pos.y + 4, FINALE_OMEN_KEY)
        .setOrigin(0.5, 1)
        .setDisplaySize(FINALE_OMEN_DISPLAY_SIZE.width, FINALE_OMEN_DISPLAY_SIZE.height)
        .setDepth(pos.y + 4);
      document.body.dataset.finaleActor = 'omen';
    }
  }

  private createFinaleFriendTwo(x: number, y: number): Phaser.GameObjects.Sprite {
    this.createFriendTwoAnimation();
    const friendtwo = this.add
      .sprite(x, y, FRIEND_TWO_SPRITE.key, FRIEND_TWO_SPRITE.idleDownStartFrame)
      .setOrigin(FRIEND_TWO_SPRITE.origin.x, FRIEND_TWO_SPRITE.origin.y)
      .setScale(FRIEND_TWO_SPRITE.scale)
      .setDepth(y + 4);
    if (this.anims.exists(FRIEND_TWO_SPRITE.idleAnimationKey)) {
      friendtwo.play(FRIEND_TWO_SPRITE.idleAnimationKey);
    }
    return friendtwo;
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
  private createFriendOneFollower(): void {
    const eligible = new Set([
      'friend-a',
      'friendone-yard',
      'main-outside',
      'friendtwo-yard',
      'friend-b',
    ]);
    if (
      !eligible.has(this.location.id) ||
      !isFriendOneFollowing(this.state) ||
      !this.textures.exists(FRIEND_ONE_SPRITE.key)
    ) {
      delete document.body.dataset.friendoneMode;
      return;
    }

    this.createFriendOneFollowerAnimations();
    const walkingToPc = this.location.id === 'friend-b';
    const start = walkingToPc
      ? createFriendTwoRoomFriendOneRoute({ x: this.player.x, y: this.player.y }).position
      : { x: this.player.x - 64, y: this.player.y };
    if (walkingToPc) {
      this.friendoneFollowerRoute = createFriendTwoRoomFriendOneRoute({ x: this.player.x, y: this.player.y });
    } else {
      // Nearly match ____'s 250px/s walk without letting ____ overtake her.
      // Trail 104px back so her ~100px-tall sprite trails behind ____ instead
      // of visually standing on her when following vertically.
      this.friendoneFollowerTrail = createFollowerTrail(start, { speed: 246, trailDistance: 104 });
    }
    const projected = this.getProjection().project(start.x, start.y);
    this.friendoneFollower = this.add
      .sprite(projected.x, projected.y, FRIEND_ONE_SPRITE.key, 0)
      .setOrigin(FRIEND_ONE_SPRITE.origin.x, FRIEND_ONE_SPRITE.origin.y)
      .setScale(FRIEND_ONE_SPRITE.scale)
      .setDepth(projected.y);
    this.friendoneFollowerFacing = 'down';
    this.friendoneFollower.setFlipX(false);
    this.friendoneFollower.play('friendone-follower-idle-down');
    document.body.dataset.friendoneMode = walkingToPc
      ? hasSeenBeat(this.state, 'friendtwo-house-entered')
        ? 'arriving'
        : 'waiting'
      : 'following';
  }

  private createFriendOneFollowerAnimations(): void {
    const facings = ['down', 'left', 'right', 'up'] as const;
    facings.forEach((facing, index) => {
      const idleKey = `friendone-follower-idle-${facing}`;
      const walkKey = `friendone-follower-walk-${facing}`;
      // The sprite sheet's right-facing rows (2 idle / 6 walk) are defective —
      // they contain left-facing art, so playing them makes ____ moonwalk when
      // moving east. Instead we source the right-facing keys from the LEFT rows
      // (idle row 1, walk row 5) and mirror at draw time via setFlipX, so the
      // rows keyed as `-right` never get displayed.
      const idleRow = facing === 'right' ? 1 : index;
      const walkRow = facing === 'right' ? 5 : index + 4;
      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          // Side idles stay planted. Cycling tiny generated differences reads
          // as toe/hair jitter, while ____'s side silhouette is effectively still.
          // Right mirrors this single planted frame from the left row.
          frames: facing === 'left' || facing === 'right'
            ? [{ key: FRIEND_ONE_SPRITE.key, frame: idleRow * 6 }]
            : this.anims.generateFrameNumbers(FRIEND_ONE_SPRITE.key, {
                start: idleRow * 6,
                end: idleRow * 6 + 5,
              }),
          frameRate: FRIEND_ONE_SPRITE.idleFrameRate,
          repeat: -1,
        });
      }
      if (!this.anims.exists(walkKey)) {
        this.anims.create({
          key: walkKey,
          frames: this.anims.generateFrameNumbers(FRIEND_ONE_SPRITE.key, {
            start: walkRow * 6,
            end: walkRow * 6 + 5,
          }),
          frameRate: FRIEND_ONE_SPRITE.walkFrameRate,
          repeat: -1,
        });
      }
    });
  }

  private updateFriendOneFollower(deltaMs: number): void {
    const sprite = this.friendoneFollower;
    if (!sprite) {
      return;
    }
    if (this.location.id === 'friend-b') {
      const route = this.friendoneFollowerRoute;
      if (!route) return;
      if (!hasSeenBeat(this.state, 'friendtwo-house-entered')) {
        document.body.dataset.friendoneMode = 'waiting';
        this.friendoneFollowerFacing = 'down';
        sprite.setFlipX(false);
        if (sprite.anims.currentAnim?.key !== 'friendone-follower-idle-down') {
          sprite.play('friendone-follower-idle-down');
        }
        return;
      }
      const projection = this.getProjection();
      const previousProjected = projection.project(route.position.x, route.position.y);
      const next = advanceFollowerRoute(route, deltaMs);
      this.friendoneFollowerRoute = next;
      const projected = projection.project(next.position.x, next.position.y);
      sprite.setPosition(projected.x, projected.y).setDepth(projected.y);
      const facing = next.moving
        ? facingForScreenDeltaWithHysteresis(previousProjected, projected, this.friendoneFollowerFacing)
        : this.friendoneFollowerFacing;
      this.friendoneFollowerFacing = facing;
      sprite.setFlipX(facing === 'right');
      const animation = `friendone-follower-${next.moving ? 'walk' : 'idle'}-${facing}`;
      if (sprite.anims.currentAnim?.key !== animation) sprite.play(animation);
      document.body.dataset.friendoneMode = next.arrived ? 'parked' : 'arriving';
      if (this.debugMarkers) {
        document.body.dataset.friendonePos = `${Math.round(next.position.x)},${Math.round(next.position.y)}`;
      }
      return;
    }
    const trail = this.friendoneFollowerTrail;
    if (!trail) return;
    const projection = this.getProjection();
    const previousProjected = projection.project(trail.position.x, trail.position.y);
    const next = advanceFollowerTrail(trail, { x: this.player.x, y: this.player.y }, deltaMs);
    this.friendoneFollowerTrail = next;
    const projected = projection.project(next.position.x, next.position.y);
    sprite.setPosition(projected.x, projected.y).setDepth(projected.y);
    // Derive facing from screen-space movement (matches the isometric room's
    // projection) with hysteresis so it stays steady on diagonals; the trail's
    // own map-space facing is only a fallback when idle.
    const facing = next.moving
      ? facingForScreenDeltaWithHysteresis(previousProjected, projected, this.friendoneFollowerFacing)
      : this.friendoneFollowerFacing;
    this.friendoneFollowerFacing = facing;
    sprite.setFlipX(facing === 'right');
    const animation = `friendone-follower-${next.moving ? 'walk' : 'idle'}-${facing}`;
    if (sprite.anims.currentAnim?.key !== animation) {
      sprite.play(animation);
    }
    if (this.debugMarkers) {
      document.body.dataset.friendonePos = `${Math.round(next.position.x)},${Math.round(next.position.y)}`;
    }
  }

  private removeFriendOneFollower(): void {
    this.friendoneFollower?.destroy();
    this.friendoneFollower = undefined;
    this.friendoneFollowerTrail = undefined;
    this.friendoneFollowerRoute = undefined;
    document.body.dataset.friendoneMode = 'absent';
    delete document.body.dataset.friendonePos;
  }

  private applyFishbowlStoryState(): void {
    if (this.location.id !== 'friend-a') {
      delete document.body.dataset.friendoneFishCount;
      delete document.body.dataset.koiTransition;
      return;
    }
    const handle = this.propHandles.find(({ placement }) => placement.frame === 'fishbowl-table');
    if (!handle) {
      return;
    }
    const twoKoi = hasActivityCompleted(this.state, 'friendone-pc-fishing');
    if (!twoKoi) {
      delete document.body.dataset.koiTransition;
    }
    const texture = twoKoi ? STORY_KOI_BOWL_TWO_KEY : STORY_KOI_BOWL_ONE_KEY;
    if (!this.textures.exists(texture)) {
      return;
    }
    const displayHeight = handle.image.displayHeight;
    handle.image.setTexture(texture);
    const frame = handle.image.frame;
    const displayWidth = displayHeight * (frame.realWidth / Math.max(1, frame.realHeight));
    handle.image.setDisplaySize(displayWidth, displayHeight);
    document.body.dataset.friendoneFishCount = twoKoi ? '2' : '1';
  }

  /** State-derived invitation contained inside ____'s physical monitor. */
  private applyFriendOnePcReadyState(): void {
    this.friendonePcReadyCue.forEach((object) => object.destroy());
    this.friendonePcReadyCue = [];
    delete document.body.dataset.friendonePcReady;
    delete document.body.dataset.friendonePcCue;

    if (
      this.location.id !== 'friend-a' ||
      !hasSeenBeat(this.state, FRIEND_ONE_PC_READY_BEAT_ID) ||
      hasActivityCompleted(this.state, 'friendone-pc-fishing')
    ) {
      return;
    }

    const desk = this.propHandles.find(({ placement }) => placement.frame === 'desk')?.image;
    if (!desk) {
      return;
    }
    const bounds = desk.getBounds();
    const depth = desk.depth + 3;
    // The monitor glass itself wakes up: a clean light-blue sheen, without symbols,
    // scenery, status dots, bars, prompts, or an extra border.
    const screenWidth = bounds.width * FRIEND_ONE_PC_GLASS_CUE.bounds.width;
    const screenHeight = bounds.height * FRIEND_ONE_PC_GLASS_CUE.bounds.height;
    const screenLeft = bounds.x + bounds.width * FRIEND_ONE_PC_GLASS_CUE.bounds.left;
    const screenTop = bounds.y + bounds.height * FRIEND_ONE_PC_GLASS_CUE.bounds.top;
    const glassShine = this.add.graphics().setDepth(depth);
    glassShine.fillGradientStyle(
      ...FRIEND_ONE_PC_GLASS_CUE.gradient,
      0.76,
      0.7,
      0.56,
      0.62,
    );
    glassShine.fillRect(screenLeft, screenTop, screenWidth, screenHeight);
    glassShine.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: glassShine,
      alpha: { from: 0.82, to: 1 },
      duration: 1650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.friendonePcReadyCue = [glassShine];
    document.body.dataset.friendonePcReady = 'true';
    document.body.dataset.friendonePcCue = 'glass-shine';
  }

  /** Turns the fishing result into a readable world beat: the bowl ripples,
   * briefly flashes, then settles on the matched two-koi art. */
  private async revealSecondKoi(): Promise<void> {
    this.applyFriendOnePcReadyState();
    if (this.location.id !== 'friend-a') {
      this.applyFishbowlStoryState();
      return;
    }
    const handle = this.propHandles.find(({ placement }) => placement.frame === 'fishbowl-table');
    if (!handle) {
      this.applyFishbowlStoryState();
      return;
    }

    document.body.dataset.koiTransition = 'running';
    playSfx('sfx-koi-arrive');
    const bounds = handle.image.getBounds();
    const duration = new URLSearchParams(window.location.search).get('testMode') === '1' ? 70 : 420;
    const ripple = this.add
      .ellipse(bounds.centerX, bounds.y + bounds.height * 0.32, bounds.width * 0.5, bounds.height * 0.18)
      .setStrokeStyle(3, 0x8ef3e6, 0.9)
      .setFillStyle(0xf3c56d, 0.1)
      .setDepth(handle.image.depth + 4);
    const arrival = this.add
      .text(bounds.centerX, bounds.y - 8, '+1 KOI', {
        color: '#fff0b5',
        backgroundColor: '#06111add',
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '16px',
        padding: { x: 7, y: 4 },
        stroke: '#7c5429',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setAlpha(0)
      .setDepth(handle.image.depth + 5);
    this.tweens.add({
      targets: ripple,
      scaleX: 1.75,
      scaleY: 1.75,
      alpha: 0,
      duration: duration * 2,
      ease: 'Sine.easeOut',
    });
    this.tweens.add({
      targets: arrival,
      y: arrival.y - 24,
      alpha: { from: 0, to: 1 },
      duration,
      hold: duration,
      yoyo: true,
    });

    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: handle.image,
        alpha: 0.28,
        duration,
        ease: 'Sine.easeIn',
        onComplete: () => resolve(),
      });
    });
    this.applyFishbowlStoryState();
    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: handle.image,
        alpha: 1,
        duration,
        ease: 'Sine.easeOut',
        onComplete: () => resolve(),
      });
    });
    ripple.destroy();
    arrival.destroy();
    document.body.dataset.koiTransition = 'complete';
  }

  private applyEpilogueRoomState(): void {
    const photo = this.propHandles.find(
      ({ placement }) => placement.frame === 'epilogue-photo',
    );
    const editingRoom =
      import.meta.env.DEV && new URLSearchParams(window.location.search).has('dressEdit');
    photo?.image.setVisible(this.state.endingCompleted || editingRoom);

    if (this.location.id !== 'recipient-house' || !this.state.endingCompleted) {
      delete document.body.dataset.pcPowered;
      delete document.body.dataset.roomPhotoComplete;
      delete document.body.dataset.roomPhotoShear;
      delete document.body.dataset.roomPhotoTexture;
      return;
    }

    const anchors = resolveEpilogueRoomAnchors(
      this.propHandles.map(({ placement }) => ({
        ...placement,
        mapX: placement.mapX,
        mapY: placement.mapY,
      })),
    );
    const findHandle = (placement: typeof anchors.photoWall) =>
      placement
        ? this.propHandles.find((handle) => handle.placement === placement ||
            (handle.placement.frame === placement.frame &&
              handle.placement.mapX === placement.mapX &&
              handle.placement.mapY === placement.mapY))
        : undefined;
    const desk = findHandle(anchors.desk);
    const wall = findHandle(anchors.photoWall);

    if (wall && photo) {
      const photoBounds = photo.image.getBounds();
      const shearDrop = photoBounds.width * EPILOGUE_WALL_SHEAR;
      const photoCorners = {
        topLeft: { x: photoBounds.left, y: photoBounds.top },
        topRight: { x: photoBounds.right, y: photoBounds.top + shearDrop },
        bottomRight: { x: photoBounds.right, y: photoBounds.bottom },
        bottomLeft: { x: photoBounds.left, y: photoBounds.bottom - shearDrop },
      };
      document.body.dataset.roomPhotoShear = String(photo.placement.wallShear ?? 0);
      document.body.dataset.roomPhotoTexture = photo.image.texture.key;

      // Once the middle portrait is filled, the surrounding patch of wall
      // carries a quiet warm gleam. Keep it local to the frame: there is no
      // longer a separate shaft connecting the photo wall to a window.
      const gleam = this.add.graphics().setDepth(photo.image.depth - 0.01);
      gleam.setBlendMode(Phaser.BlendModes.ADD);

      // Build the aura from overlapping ellipses so it fades smoothly into the
      // wall rather than showing three hard polygon bands. The pale centre is
      // deliberately strong enough to remain visible against the light plaster.
      const auraWidth = Math.max(150, photoBounds.width * 3.15);
      const auraHeight = Math.max(132, photoBounds.height * 1.65);
      for (let ring = 10; ring >= 1; ring -= 1) {
        const scale = ring / 10;
        const alpha = 0.018 + (1 - scale) * 0.008;
        gleam.fillStyle(0xffe1a0, alpha);
        gleam.fillEllipse(
          photoBounds.centerX,
          photoBounds.centerY,
          auraWidth * scale,
          auraHeight * scale,
        );
      }

      // A brighter frame-edge shimmer makes the effect read as an intentional
      // gleam instead of ambient room lighting.
      gleam.lineStyle(2, 0xffffdc, 0.42);
      gleam.strokePoints([
        new Phaser.Geom.Point(photoCorners.topLeft.x, photoCorners.topLeft.y),
        new Phaser.Geom.Point(photoCorners.topRight.x, photoCorners.topRight.y),
        new Phaser.Geom.Point(photoCorners.bottomRight.x, photoCorners.bottomRight.y),
        new Phaser.Geom.Point(photoCorners.bottomLeft.x, photoCorners.bottomLeft.y),
      ], true);
      this.tweens.add({
        targets: gleam,
        alpha: { from: 0.78, to: 1 },
        duration: 1800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      const sparkle = this.add
        .text(photoCorners.topRight.x + 5, photoCorners.topRight.y - 5, '✦', {
          color: '#fff3bd',
          fontFamily: 'Georgia, serif',
          fontSize: '15px',
          stroke: '#d89b42',
          strokeThickness: 1,
        })
        .setOrigin(0.5)
        .setDepth(photo.image.depth + 0.01)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: sparkle,
        alpha: { from: 0.25, to: 1 },
        scale: { from: 0.72, to: 1.18 },
        duration: 1250,
        hold: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    if (desk) {
      const bounds = desk.image.getBounds();
      const screenCue = RECIPIENT_PC_MAIL_CUE.screenBounds;
      const screenLeft = bounds.x + bounds.width * screenCue.left;
      const screenTop = bounds.y + bounds.height * screenCue.top;
      const screenWidth = bounds.width * screenCue.width;
      const screenHeight = bounds.height * screenCue.height;
      // The painted CRT glass is visually weighted a touch to the right within
      // its rectangular bounds, so center the cue on the glass rather than the
      // raw crop midpoint.
      const centerX = screenLeft + screenWidth * 0.55;
      const centerY = screenTop + screenHeight / 2;

      // Leave the original CRT glass untouched. A restrained yellow halo and a
      // compact envelope communicate that the letters are waiting without
      // needing to fit a replacement surface against the monitor's curved rim.
      const halo = this.add.graphics().setDepth(desk.image.depth + 0.1);
      halo.fillStyle(RECIPIENT_PC_MAIL_CUE.color, 0.18);
      halo.fillEllipse(centerX, centerY, screenWidth * 0.72, screenHeight * 0.8);
      halo.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: halo,
        alpha: { from: 0.55, to: 1 },
        duration: 1300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      const iconWidth = screenWidth * 0.34;
      const iconHeight = screenHeight * 0.36;
      const iconLeft = centerX - iconWidth / 2;
      const iconTop = centerY - iconHeight / 2;
      const mail = this.add.graphics().setDepth(desk.image.depth + 0.11);
      mail.fillStyle(RECIPIENT_PC_MAIL_CUE.color, 1);
      mail.fillRoundedRect(iconLeft, iconTop, iconWidth, iconHeight, 1);
      mail.lineStyle(0.8, 0x8a5700, 0.95);
      mail.strokeRoundedRect(iconLeft, iconTop, iconWidth, iconHeight, 1);
      mail.beginPath();
      mail.moveTo(iconLeft + 0.8, iconTop + 0.8);
      mail.lineTo(centerX, iconTop + iconHeight * 0.62);
      mail.lineTo(iconLeft + iconWidth - 0.8, iconTop + 0.8);
      mail.strokePath();
    }
    document.body.dataset.pcPowered = 'true';
    delete document.body.dataset.roomPhotoComplete;
  }

  private startStoryAudioCues(): void {
    const scheduleNote = (
      pitchId: string,
      durationMs: number,
      delayMs: number,
      onPlay?: () => void,
      connected = false,
    ): void => {
      const pitch = getPitch(pitchId);
      if (!pitch) return;
      this.violinCueTimers.push(
        this.time.delayedCall(delayMs, () => {
          playViolinNote(pitch.frequency, durationMs, { volume: 0.34, connected });
          onPlay?.();
        }),
      );
    };

    if (
      this.location.id !== 'recipient-house' ||
      !hasActivityCompleted(this.state, RETAKE_ACTIVITY_ID) ||
      hasActivityCompleted(this.state, VIOLIN_ACTIVITY_ID) ||
      hasKeepsake(this.state, 'recipient-sheet-music') ||
      hasSeenBeat(this.state, VIOLIN_CALLED_BEAT_ID) ||
      this.state.endingCompleted
    ) {
      return;
    }
    const violin = this.propHandles.find(({ placement }) => placement.frame === 'violin')?.image;
    if (!violin) return;
    playSfx('sfx-story-hum', { volume: 0.22 });
    const emitNote = (): void => {
      const bounds = violin.getBounds();
      const glyph = this.add
        .text(bounds.centerX + (Math.random() - 0.5) * 18, bounds.y + 12, Math.random() > 0.5 ? '♪' : '♫', {
          color: '#fff0b5',
          fontFamily: 'serif',
          fontSize: '25px',
          stroke: '#7c5429',
          strokeThickness: 2,
        })
        .setDepth(violin.depth + 2)
        .setAlpha(0);
      this.tweens.add({
        targets: glyph,
        y: glyph.y - 48,
        x: glyph.x + 14,
        alpha: { from: 0, to: 0.95 },
        duration: 600,
        hold: 220,
        yoyo: true,
        onComplete: () => glyph.destroy(),
      });
    };
    const violinDelayMs = 2800;
    createViolinInvitationSchedule().forEach((note) =>
      scheduleNote(
        note.pitchId,
        note.durationMs,
        violinDelayMs + note.atMs,
        emitNote,
        note.delayMs > 0,
      ),
    );
    // Let the exact refrain fragment's final tone breathe for a fraction of a
    // beat, then have ____ react without requiring the player to touch the
    // violin. Any scheduled repeat is cancelled here.
    this.violinCueTimers.push(
      this.time.delayedCall(violinDelayMs + VIOLIN_INVITATION_DURATION_MS + 320, () => {
        void this.acknowledgeViolinCall();
      }),
    );
    document.body.dataset.violinInvitation = 'playing';
  }

  private async acknowledgeViolinCall(): Promise<void> {
    if (hasSeenBeat(this.state, VIOLIN_CALLED_BEAT_ID)) {
      this.cancelViolinCue();
      return;
    }
    // Entry dialogue or another overlay may still own the UI when the fragment
    // ends. Wait until the room is controllable rather than replacing that beat.
    if (!this.canMove) {
      this.violinCueTimers.push(
        this.time.delayedCall(200, () => void this.acknowledgeViolinCall()),
      );
      return;
    }

    this.cancelViolinCue();
    await this.pauseForDialogue([
      {
        speaker: '____',
        text: 'Did the violin just play on its own?',
        portraitId: 'portrait-recipient',
      },
    ]);
    this.state = markBeatSeen(this.state, VIOLIN_CALLED_BEAT_ID);
    this.registry.set('runState', this.state);
    document.body.dataset.violinCalled = 'acknowledged';
  }

  private cancelViolinCue(): void {
    this.violinCueTimers.forEach((timer) => timer.remove(false));
    this.violinCueTimers = [];
    delete document.body.dataset.violinInvitation;
  }

  private createHomeHostNpc(): void {
    const npc = HOME_HOST_NPCS[this.location.id];
    if (!npc || !this.textures.exists(npc.sprite.key)) {
      return;
    }
    if (
      (npc.id === 'friendone' || npc.id === 'friendtwo') &&
      !shouldShowHomeNpc(this.location.id, npc.id, this.state)
    ) {
      return;
    }
    // ____'s home billboard runs on the partial frame set (one strip per row).
    // Register every generated row up front so the idle-south clip the billboard
    // plays — and any other row a future direction switch resolves to — is live.
    if (npc.id === 'friendtwo') {
      this.createFriendTwoPartialAnimations();
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

    // Feet position: an authored dressEdit override (roomLayouts/<id>.json `npcs`
    // section, keyed by NPC id) wins over the TS default, mirroring how props take
    // their JSON layout over the TS fallback.
    const { mapX, mapY } = resolveHomeNpcPosition(npc, getRoomLayoutNpcs(this.location.id));

    const point = this.getProjection().project(mapX, mapY);
    const sprite = this.add
      .sprite(point.x, point.y, cfg.key, cfg.idleDownStartFrame)
      .setOrigin(cfg.origin.x, cfg.origin.y)
      .setScale(cfg.scale)
      .setDepth(point.y);
    if (this.anims.exists(cfg.idleAnimationKey)) {
      sprite.play(cfg.idleAnimationKey);
    }

    // Expose the placed NPC to the dressEdit editor so it can be dragged/saved.
    this.homeHostNpcHandle = { id: npc.id, sprite, mapX, mapY };
  }

  /**
   * Register ____'s partial-frame-set animations — one looping clip per
   * generated row (idle for all four facings + walk-south), each built from that
   * row's own 6-frame strip. The friend-b billboard only ever plays idle-south,
   * but registering every generated row means any key resolveFriendTwoRow() returns
   * has a live clip to play (walk-west/east/north resolve back to idle by design,
   * so they never need a clip of their own). Idempotent via the exists guards.
   */
  private createFriendTwoPartialAnimations(): void {
    for (const row of FRIEND_TWO_GENERATED_ROWS) {
      const key = friendtwoRowAnimationKey(row);
      const textureKey = friendtwoRowTextureKey(row);
      if (this.anims.exists(key) || !this.textures.exists(textureKey)) {
        continue;
      }
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(textureKey, {
          start: 0,
          end: FRIEND_TWO_PARTIAL_FRAMES.framesPerRow - 1,
        }),
        frameRate: row.startsWith('walk-')
          ? FRIEND_TWO_PARTIAL_FRAMES.walkFrameRate
          : FRIEND_TWO_PARTIAL_FRAMES.idleFrameRate,
        repeat: -1,
      });
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
    // The clearing is a TWILIGHT scene. The neighbourhood's "walking into
    // streaming daylight" awakening — a screen-wide warm additive exposure lift
    // plus a gold ambient tint and drifting warm motes — bleaches its deep
    // indigo/rose dusk and drowns the lantern/star/petal dressing, so an
    // awakened arrival (the state a real player is in by the time they reach the
    // clearing) reads as a flat, washed-out field rather than the moody twilight.
    // The clearing has its OWN awakened treatment (the shore light-bloom and the
    // warmed cranes in drawClearingShore/spawnClearingCranes), so skip the
    // generic daylight flood here and let the dusk dressing stay legible.
    if (this.location.id === 'clearing') {
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
  }

  // Post-violin awakening for dressed interiors: every room gets golden window
  // shafts, while only ____'s room also gets the open-edge spill and awakened
  // exit doormat. Applied statically on entry (animate:false) and dynamically
  // the instant the violin completes (animate:true, a ~1.5s fade-in so the beat
  // lands while ____ is still at the stand). Idempotent per scene life.
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
    const awakenDoorway = this.location.id === 'recipient-house';
    renderInteriorAwakening(
      this,
      this.dressing,
      awakenDoorway
        ? this.exits.map((exit) => ({
            x: exit.x,
            y: exit.y,
            width: exit.width,
            height: exit.height,
          }))
        : [],
      this.projection.movementOrigin,
      awakenDoorway
        ? { fadeInMs: options.animate ? 1500 : 0, floorMapRect }
        : { fadeInMs: options.animate ? 1500 : 0 },
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

  // One bulb in the northward-streaming ribbon. It rides a slow, continuous
  // upward drift (looping — a stream, not a one-shot). A synced alpha cycle
  // fades it up at the bottom of its run and back to zero at the top, so the
  // loop's snap-back never shows.
  //
  // In `ribbon` mode (post-boost) the bulbs concentrate into a loose vertical
  // band down the central path — where the signpost and the south exit sit.
  // Every bulb ENTERS at the map's south edge and runs the whole path north,
  // so the stream visibly pours in from the bottom of the map (no mid-path
  // pop-in); initial delays are staggered across a full cycle so the ribbon
  // reads as a continuous flow. They glow ADDITIVELY so they pop as warm bulbs
  // even over the brightened ground. In base mode they stay a sparse,
  // full-width, normal-blend field (the original ambient look).
  private spawnBeckoningMote(rng: () => number, tune: OutdoorAwakenTune): void {
    const width = this.mapDims.width;
    const height = this.mapDims.height;
    let x: number;
    let startY: number;
    let travel: number;
    let scale: number;
    let runMs: number;
    if (tune.ribbon) {
      // Loose central ribbon: clustered around mid-x (the path) with a soft
      // spread. Each bulb starts just off the SOUTH edge and runs north to
      // near the top of the map.
      const spread = (rng() + rng() - 1) * 0.26; // triangular ~[-0.26,0.26], centre-weighted
      x = width * (0.5 + spread);
      startY = height + 8 + rng() * 16; // just below the south edge, staggered
      const endY = height * (0.06 + rng() * 0.14); // north end of the run
      travel = startY - endY;
      // Keep the approved drift SPEED: draw from the previous travel/duration
      // joint distribution, then stretch the duration so the same px/ms now
      // covers the longer edge-to-edge run.
      const speed = (height * (0.24 + rng() * 0.16)) / (6400 + rng() * 3600);
      runMs = travel / speed;
      scale = 0.7 + rng() * 1.0;
    } else {
      x = rng() * width;
      startY = height * (0.3 + rng() * 0.55);
      travel = height * (0.22 + rng() * 0.16);
      scale = 0.5 + rng() * 0.9;
      runMs = 6400 + rng() * 3600;
    }
    const sway = 12 + rng() * 20;
    const delay = rng() * runMs;
    const mote = this.add
      .image(x, startY, 'awaken-mote')
      .setDepth(startY + 6)
      .setAlpha(0)
      .setScale(scale);
    if (tune.ribbon) {
      mote.setBlendMode(Phaser.BlendModes.ADD);
    }
    // Steady northward drift; on each loop the position snaps back down while the
    // alpha cycle (below) has it at zero, so the reset is invisible.
    this.tweens.add({
      targets: mote,
      y: startY - travel,
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
    // Alpha cycle synced to one ascent: a QUICK fade-up while the bulb is still
    // in the bottom stretch of its run (so entry reads as light pouring in from
    // the south edge, never a mid-path pop), then a long HOLD near peak through
    // the climb, fading back to zero toward the north end before the loop snaps
    // back down. The hold is what makes the ribbon read as a solid, sustained
    // flow rather than a sparse twinkle. Base mode keeps the plain triangle.
    const peak = tune.motePeakAlpha + rng() * 0.25;
    if (tune.ribbon) {
      this.tweens.add({
        targets: mote,
        alpha: { from: 0, to: peak },
        duration: runMs * 0.12,
        hold: runMs * 0.76,
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

  private createPlayer(): void {
    const mapJson = this.getMapJson();
    // Edge arrivals pass explicit map-space coords; doors/testMode use a named
    // spawn point on the destination map's Spawns layer.
    const spawn =
      this.spawnOverride ??
      getPointObject(mapJson, 'Spawns', this.registry.get('spawnId') as string);

    this.playerFacing = this.location.initialPlayerFacing ?? 'down';
    const initialSourceFacing = RECIPIENT_ANIMATION_SOURCE_FACING[this.playerFacing];
    this.createRecipientAnimations();
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'player-temp');
    this.player.setVisible(false);
    this.player.setDepth(10);
    this.player.setCollideWorldBounds(true);
    this.player.body?.setSize(36, 32);
    // Center the 36x32 body on the character's feet point (player.x, player.y).
    // The player-temp frame is 96x128 with origin 0.5/0.5, so the frame top-left
    // sits at (x-48, y-64); offset (30, 48) puts the body center at
    // (x-48+30+18, y-64+48+16) = (x, y) — symmetric blocking north and south.
    this.player.body?.setOffset(30, 48);
    this.playerVisual = this.add
      .sprite(0, 0, RECIPIENT_SPRITE.key, RECIPIENT_IDLE_ROW_START_FRAME[initialSourceFacing])
      .setOrigin(RECIPIENT_SPRITE.origin.x, RECIPIENT_SPRITE.origin.y)
      .setScale(RECIPIENT_SPRITE.scale)
      .setDepth(10);
    this.syncPlayerVisual();

    if (this.walls) {
      this.physics.add.collider(this.player, this.walls);
    }

    if (this.propColliderBodies.length > 0) {
      this.propColliderCollider = this.physics.add.collider(
        this.player,
        this.propColliderBodies,
      );
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
    // The final galaxy turns the earned letters into world collectibles. Keeping
    // the backpack panel here would let them be opened before ____ gives ____
    // the violin and would undercut the ending's reveal.
    if (this.location.id === 'final-spot') {
      this.collectionPanel = undefined;
      return;
    }
    const panel = createCollectionPanel(this.state, {
      canInteract: () => this._canMove,
      // Re-reading freezes the player (mirrors pauseForDialogue) so held movement
      // keys can't drive ____ behind the full-screen letter overlay.
      onOpenLetter: async (lines) => {
        this.canMove = false;
        await showLetterModal(lines);
        this.canMove = true;
      },
      onOpenSheetMusic: async (content) => {
        this.canMove = false;
        await showSheetMusicModal(content);
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
    // Finished rooms and outdoor areas communicate actions through their art and
    // proximity prompt. Action rectangles are authoring diagnostics only and
    // must not appear in normal play or in the collision/depth editor.
    if (
      (this.dressing || this.isOutdoor() || this.location.id === 'final-spot') &&
      !this.debugMarkers
    ) {
      return;
    }

    // Outdoor door exits are shown as a glowing doormat (createOutdoorDoorMarkers)
    // instead of a debug rect, unless explicit marker debugging is on.
    if (!this.isOutdoor() || this.debugMarkers) {
      for (const exit of this.exits) {
        this.createWorldMarker(exit, 0x74c7ec, this.getObjectLabel(exit));
      }
    }

    // The signpost hotspots now have diegetic fingerpost props; the "E - Read the
    // signpost" proximity prompt is guidance enough, so skip the translucent debug
    // rect (unless the collider-debug overlay is on).
    const signpostIds = new Set(getSignposts(this.location.id).map((s) => s.interactionId));
    for (const interaction of this.interactions) {
      if (signpostIds.has(interaction.id) && !this.debugMarkers) {
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

    for (const [index, exterior] of getExteriors(this.location.id).entries()) {
      this.renderExterior(exterior, index);
      colliders.push({
        x: exterior.mapX - exterior.footprint.w / 2,
        y: exterior.mapY - exterior.footprint.d,
        width: exterior.footprint.w,
        height: exterior.footprint.d,
      });
    }

    return colliders;
  }

  private renderExterior(exterior: ExteriorPlacement, index: number): void {
    const key = exteriorTextureKey(exterior.asset);
    const anchor = this.getProjection().project(exterior.mapX, exterior.mapY);
    const texture = this.textures.get(key);
    const sourceHeight = texture.getSourceImage().height || 360;
    const scale = (PLAYER_VISUAL_HEIGHT_PX * exterior.heightRatio) / sourceHeight;

    const image = this.add
      .image(anchor.x, anchor.y, key)
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(anchor.y);
    this.outdoorDepthHandles.push({
      id: `exterior-${exterior.asset}#${index}`,
      mapX: exterior.mapX,
      mapY: exterior.mapY,
      image,
    });
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
    // Two-cell-deep approach band only at each five-tile portal. The old full-edge
    // bands made scenery treat an entire side as an entrance even though the path
    // reaches it at the centre.
    const horizontalSpan = edgePortalSpan('north', {
      width: tilemap.widthInPixels,
      height: tilemap.heightInPixels,
      tileSize: tile,
    });
    const verticalSpan = edgePortalSpan('west', {
      width: tilemap.widthInPixels,
      height: tilemap.heightInPixels,
      tileSize: tile,
    });
    const firstPortalCol = Math.floor(horizontalSpan.start / tile);
    const lastPortalCol = Math.ceil(horizontalSpan.end / tile) - 1;
    const firstPortalRow = Math.floor(verticalSpan.start / tile);
    const lastPortalRow = Math.ceil(verticalSpan.end / tile) - 1;
    for (let c = firstPortalCol; c <= lastPortalCol; c += 1) {
      if (openEdges.has('north')) grid[0 * cols + c] = grid[1 * cols + c] = true;
      if (openEdges.has('south'))
        grid[(rows - 1) * cols + c] = grid[(rows - 2) * cols + c] = true;
    }
    for (let r = firstPortalRow; r <= lastPortalRow; r += 1) {
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
    // Per-placement scale (dressEdit resize) multiplies the kind's native size.
    const placementScale = placement.scale ?? 1;
    const scale = (kind.w / (source.width || kind.w)) * placementScale;
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

    // Clearing set pieces warm subtly once the world has awakened, matching the
    // shore band and drifting cranes (drawClearingShore/spawnClearingCranes use the
    // same 0xffe9c8 tint) so the pines/lanterns read correctly under the golden
    // shore light rather than staying flat twilight-cold.
    if (
      this.location.id === 'clearing' &&
      !kind.flat &&
      !kind.overhead &&
      isClearingAwakened(this.state)
    ) {
      image.setTint(0xffe9c8);
    }

    // Handle for the dressEdit editor (drag/resize/delete this exact billboard).
    this.outdoorPropHandles.push({ image, placement, kind });
    if (!kind.flat && !kind.overhead && placement.id) {
      this.outdoorDepthHandles.push({
        id: placement.id,
        mapX: placement.mapX,
        mapY: placement.mapY,
        image,
      });
    }

    if (kind.collider && !kind.flat && !kind.overhead) {
      // The collider footprint scales with the visual so a shrunk prop blocks
      // proportionally less ground (and a grown one blocks more).
      const cw = kind.collider.w * placementScale;
      const ch = kind.collider.h * placementScale;
      const rect: PropColliderRect = {
        x: placement.mapX - cw / 2,
        y: placement.mapY - ch,
        width: cw,
        height: ch,
      };
      // Never let a decoration body sit on a walkable corridor.
      if (corridor && this.colliderHitsCorridor(rect, corridor)) {
        return undefined;
      }
      return rect;
    }
    return undefined;
  }

  // Re-place an outdoor decoration billboard (and, for the signpost, its caption)
  // from its current placement. The dressEdit editor calls this after a drag /
  // arrow-nudge / wheel-resize so the exact anchor + scale + depth math the
  // initial render used stays the single source of truth (mirrors renderProp).
  private positionOutdoorProp(handle: OutdoorEditHandle): void {
    const { image, placement, kind, label } = handle;
    const anchor = this.getProjection().project(placement.mapX, placement.mapY);
    const source = this.textures.get(image.texture.key).getSourceImage() as { width: number };
    const scale = (kind.w / (source.width || kind.w)) * (placement.scale ?? 1);
    image.setScale(scale).setFlipX(Boolean(placement.flip)).setPosition(anchor.x, anchor.y);
    if (kind.flat) {
      image.setDepth(-14);
    } else if (kind.overhead) {
      image.setDepth(5000);
    } else {
      image.setDepth(anchor.y);
    }
    if (label) {
      // Re-run the caption auto-fit from the board's measured geometry × the
      // current display scale, so a hand-resized board re-derives the name's
      // placement/size on the arrow shaft (identical to renderSignposts).
      const geom = this.measureSignpostBoard(image.texture.key);
      const placed = placeSignpostCaption(
        geom,
        scale,
        anchor.x,
        anchor.y,
        Boolean(placement.flip),
        label.width,
      );
      label.setPosition(placed.x, placed.y).setScale(placed.scale).setDepth(anchor.y + 0.1);
    }
  }

  // The directional fingerposts for a named area: a flat front-facing post with a
  // blank arrow board, the destination name rendered ONTO its shaft in-game (so a
  // drop-in board art needs no baked text). Bottom-anchored + y-sorted like the
  // other standing props; a left-pointing sign flips the sprite but not the text.
  private renderSignposts(tilemap: Phaser.Tilemaps.Tilemap): PropColliderRect[] {
    // Position/flip/scale come from the authored outdoor layout when the author
    // hand-moved a board in dressEdit; interactionId + label stay in TS.
    const signs = getOutdoorSignposts(this.location.id);
    if (signs.length === 0) {
      return [];
    }
    const kind = PROP_KINDS[SIGNPOST_PROP_NAME];
    const key = this.ensurePropTexture(kind);
    const source = this.textures.get(key).getSourceImage() as { width: number };
    const openEdges = new Set((this.location.edgeExits ?? []).map((exit) => exit.edge));
    const corridor = this.buildCorridorMask(tilemap, openEdges);
    const colliders: PropColliderRect[] = [];

    for (const sign of signs) {
      const anchor = this.getProjection().project(sign.mapX, sign.mapY);
      const placementScale = sign.scale ?? 1;
      const scale = (kind.w / (source.width || kind.w)) * placementScale;
      const image = this.add
        .image(anchor.x, anchor.y, key)
        .setOrigin(0.5, 1)
        .setScale(scale)
        .setDepth(anchor.y);
      if (sign.flip) {
        image.setFlipX(true);
      }
      // Caption centred on the arrow plank, its position + size derived from the
      // board texture's alpha-measured geometry (plank centre, shaft centre, shaft
      // usable width) × the display scale — so the name sits on the shaft, clears
      // the arrowhead, and auto-shrinks to fit long names (KERRISDALE, ALDERGROVE)
      // for ANY art size with no baked constants. The text is a separate object
      // that is never flipped, so a left-pointing sign still reads upright. Depth
      // just above the board so the player occludes it when standing in front.
      const geom = this.measureSignpostBoard(key);
      const caption = this.add
        .text(anchor.x, anchor.y, sign.label, {
          color: '#3c2a17',
          fontSize: '16px',
          fontStyle: '800',
          fontFamily: 'Georgia, "Times New Roman", serif',
        })
        .setOrigin(0.5, 0.5)
        .setDepth(anchor.y + 0.1);
      const placed = placeSignpostCaption(
        geom,
        scale,
        anchor.x,
        anchor.y,
        Boolean(sign.flip),
        caption.width,
      );
      caption.setPosition(placed.x, placed.y).setScale(placed.scale);

      // Handle for the dressEdit editor: dragging moves the board + its caption
      // together; the linked dialogue hotspot is shown as a faint gold outline
      // while selected and is edited separately in M-mode.
      const signPlacement = {
        id: sign.id,
        name: SIGNPOST_PROP_NAME,
        mapX: sign.mapX,
        mapY: sign.mapY,
        flip: sign.flip,
        scale: sign.scale,
      };
      this.outdoorPropHandles.push({
        image,
        label: caption,
        placement: signPlacement,
        kind,
        signpostInteractionId: sign.interactionId,
      });
      if (sign.id) {
        this.outdoorDepthHandles.push({
          id: sign.id,
          mapX: sign.mapX,
          mapY: sign.mapY,
          image,
          label: caption,
        });
      }

      if (!kind.collider) {
        continue;
      }
      const cw = kind.collider.w * placementScale;
      const ch = kind.collider.h * placementScale;
      const rect: PropColliderRect = {
        x: sign.mapX - cw / 2,
        y: sign.mapY - ch,
        width: cw,
        height: ch,
      };
      if (!this.colliderHitsCorridor(rect, corridor)) {
        colliders.push(rect);
      }
    }
    return colliders;
  }

  // Alpha-measure a signpost board texture to locate its writable arrow shaft,
  // cached per texture key. Reads the whole texture once via an offscreen canvas
  // and derives, in TEXTURE px:
  //   • the plank band — the contiguous rows whose opaque width is a large
  //     fraction of the board's max width (isolates the wide arrow board from the
  //     narrow post + finial);
  //   • the shaft — the run of columns in that band at (near) full plank height;
  //     the arrowhead is where that height tapers toward the point, so it's
  //     excluded automatically for either flip direction;
  //   • the shaft's vertical centre + a margin-inset usable width for the caption.
  // Any measurement failure (headless canvas, empty texture) falls back to the
  // real-art fractions measured offline, so a caption still lands sanely.
  private measureSignpostBoard(key: string): SignpostBoardGeometry {
    const cached = this.signpostGeometryCache.get(key);
    if (cached) {
      return cached;
    }
    const source = this.textures.get(key).getSourceImage() as CanvasImageSource & {
      width: number;
      height: number;
    };
    const texW = source.width || 1;
    const texH = source.height || 1;
    // Offline-measured real-art fractions (192×224 signpost-arrow.png): plank
    // rows y19–58 (centre 0.172), shaft x40–132 (centre 0.448), usable ~0.42.
    const fallback: SignpostBoardGeometry = {
      texW,
      texH,
      boardCenterY: texH * 0.172,
      shaftCenterX: texW * 0.448,
      shaftUsableWidth: texW * 0.42,
    };
    let data: Uint8ClampedArray;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = texW;
      canvas.height = texH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        this.signpostGeometryCache.set(key, fallback);
        return fallback;
      }
      ctx.drawImage(source, 0, 0);
      data = ctx.getImageData(0, 0, texW, texH).data;
    } catch {
      this.signpostGeometryCache.set(key, fallback);
      return fallback;
    }
    const ALPHA = 40; // opaque threshold
    const alphaAt = (x: number, y: number): number => data[(y * texW + x) * 4 + 3];
    // Per-row opaque x-extent + width.
    const rowLeft = new Int32Array(texH).fill(-1);
    const rowRight = new Int32Array(texH).fill(-1);
    let maxRowWidth = 0;
    let maxRowY = 0;
    for (let y = 0; y < texH; y += 1) {
      let left = -1;
      let right = -1;
      for (let x = 0; x < texW; x += 1) {
        if (alphaAt(x, y) > ALPHA) {
          if (left < 0) {
            left = x;
          }
          right = x;
        }
      }
      rowLeft[y] = left;
      rowRight[y] = right;
      const width = left < 0 ? 0 : right - left + 1;
      if (width > maxRowWidth) {
        maxRowWidth = width;
        maxRowY = y;
      }
    }
    if (maxRowWidth <= 0) {
      this.signpostGeometryCache.set(key, fallback);
      return fallback;
    }
    // Plank band: contiguous rows around the widest row whose width is >= half the
    // max (the post + finial are far narrower, so they drop out).
    const bandThreshold = maxRowWidth * 0.5;
    const rowWidth = (y: number): number => (rowLeft[y] < 0 ? 0 : rowRight[y] - rowLeft[y] + 1);
    let boardTop = maxRowY;
    let boardBot = maxRowY;
    while (boardTop - 1 >= 0 && rowWidth(boardTop - 1) >= bandThreshold) {
      boardTop -= 1;
    }
    while (boardBot + 1 < texH && rowWidth(boardBot + 1) >= bandThreshold) {
      boardBot += 1;
    }
    const boardCenterY = (boardTop + boardBot) / 2;
    // Per-column opaque height WITHIN the plank band; the shaft is the columns at
    // (near) full band height, the arrowhead the columns where it tapers.
    let maxColHeight = 0;
    const colHeight = new Int32Array(texW);
    for (let x = 0; x < texW; x += 1) {
      let count = 0;
      for (let y = boardTop; y <= boardBot; y += 1) {
        if (alphaAt(x, y) > ALPHA) {
          count += 1;
        }
      }
      colHeight[x] = count;
      if (count > maxColHeight) {
        maxColHeight = count;
      }
    }
    // Shaft columns: >= 92% of the plank's full height (rounded corners + the
    // arrowhead's tapering base fall away). Take their bounding box.
    const shaftThreshold = maxColHeight * 0.92;
    let shaftLeft = -1;
    let shaftRight = -1;
    for (let x = 0; x < texW; x += 1) {
      if (colHeight[x] >= shaftThreshold) {
        if (shaftLeft < 0) {
          shaftLeft = x;
        }
        shaftRight = x;
      }
    }
    if (shaftLeft < 0) {
      this.signpostGeometryCache.set(key, fallback);
      return fallback;
    }
    const shaftCenterX = (shaftLeft + shaftRight) / 2;
    const shaftWidth = shaftRight - shaftLeft + 1;
    // Inset each edge by 8% so the caption keeps a clear margin off the plank ends.
    const shaftUsableWidth = shaftWidth * (1 - 2 * 0.08);
    const geom: SignpostBoardGeometry = {
      texW,
      texH,
      boardCenterY,
      shaftCenterX,
      shaftUsableWidth,
    };
    this.signpostGeometryCache.set(key, geom);
    return geom;
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
      case 'signpost-arrow': {
        // Flat, front-facing fingerpost: a straight-on post with ONE arrow-shaped
        // board pointing RIGHT (the engine flips the whole texture for the
        // left-pointing sign). The blank shaft carries the destination name, drawn
        // in-game. The caption fit is measured from this texture's alpha at runtime
        // (measureSignpostBoard), so the shaft geometry below needs no matching
        // constant — a clear rectangular plank + a distinct tapering arrowhead is
        // all the measurement needs.
        const boardTop = h * 0.15;
        const boardBot = h * 0.4;
        const boardMid = (boardTop + boardBot) / 2;
        const shaftL = w * 0.1;
        const shaftR = w * 0.74; // arrowhead base
        const tipX = w * 0.95; // arrowhead point
        const arrowPath = (): void => {
          ctx.beginPath();
          ctx.moveTo(shaftL, boardTop);
          ctx.lineTo(shaftR, boardTop);
          ctx.lineTo(tipX, boardMid);
          ctx.lineTo(shaftR, boardBot);
          ctx.lineTo(shaftL, boardBot);
          ctx.closePath();
        };
        // Post seen straight-on, running down behind the board.
        const postW = w * 0.09;
        rrect(cx - postW / 2, h * 0.28, postW, h * 0.7, postW * 0.4, '#7a5a34');
        ell(cx, h * 0.28, postW * 0.62, postW * 0.34, '#8a6a40');
        // Arrow board body (light wood), with a top highlight strip + outline.
        arrowPath();
        ctx.fillStyle = '#d8b57e';
        ctx.fill();
        ctx.save();
        arrowPath();
        ctx.clip();
        rrect(shaftL, boardTop, tipX - shaftL, (boardBot - boardTop) * 0.24, 2, '#e6c891');
        ctx.restore();
        arrowPath();
        ctx.strokeStyle = 'rgba(90,64,34,0.55)';
        ctx.lineWidth = 3;
        ctx.stroke();
        // A couple of dark nails where the board crosses the post.
        ell(cx - postW * 0.05, boardTop + (boardBot - boardTop) * 0.3, 2.2, 2.2, 'rgba(70,50,28,0.7)');
        ell(cx - postW * 0.05, boardTop + (boardBot - boardTop) * 0.7, 2.2, 2.2, 'rgba(70,50,28,0.7)');
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
      case 'pine-a':
      case 'pine-b': {
        // A painterly dark twilight pine silhouette matching the clearing's
        // treeline: deep indigo foliage (the retired procedural line used
        // 0x241d3c) built from stacked triangular tiers, a short dark trunk, and a
        // faint warm rose/gold rim down the LEFT (lantern) side so it reads as lit
        // by the paper lanterns. pine-a = tall/narrow spire; pine-b = broader.
        const narrow = kind.style === 'pine-a';
        const dark = '#221a38';
        const mid = '#2c2447';
        const deep = '#191331';
        const rim = 'rgba(247,196,150,0.5)'; // warm rose/gold lantern-side rim
        const trunkTop = h * 0.9;
        const trunkW = w * 0.09;
        // Short trunk peeking below the lowest boughs.
        rrect(cx - trunkW / 2, trunkTop, trunkW, h - trunkTop - 4, trunkW * 0.4, '#241a24');
        // Foliage: overlapping triangular tiers from a wide base up to the tip.
        const spread = narrow ? 0.34 : 0.46; // half-width of the base tier
        const tiers = narrow ? 5 : 4;
        const topY = h * 0.05;
        const baseY = h * 0.92;
        const tier = (t: number, fill: string, inset: number): void => {
          // t: 0 = bottom tier, 1 = top tier.
          const bandTop = topY + (baseY - topY) * (t * (narrow ? 0.72 : 0.66));
          const bandBot = bandTop + (baseY - topY) * (narrow ? 0.4 : 0.46);
          const halfW = w * spread * (1 - t * 0.62) * inset;
          ctx.beginPath();
          ctx.moveTo(cx, bandTop);
          ctx.lineTo(cx + halfW, bandBot);
          ctx.lineTo(cx - halfW, bandBot);
          ctx.closePath();
          ctx.fillStyle = fill;
          ctx.fill();
        };
        for (let i = 0; i < tiers; i += 1) {
          const t = i / tiers;
          tier(t, i % 2 === 0 ? dark : mid, 1);
        }
        // A deep-shadow core down the right (away from the lanterns).
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, topY);
        ctx.lineTo(cx + w * spread, baseY);
        ctx.lineTo(cx, baseY);
        ctx.closePath();
        ctx.clip();
        for (let i = 0; i < tiers; i += 1) {
          tier(i / tiers, deep, 0.98);
        }
        ctx.restore();
        // Faint warm rim-light tracing the lantern (left) edge of each tier.
        ctx.strokeStyle = rim;
        ctx.lineWidth = 1.6;
        for (let i = 0; i < tiers; i += 1) {
          const t = i / tiers;
          const bandTop = topY + (baseY - topY) * (t * (narrow ? 0.72 : 0.66));
          const bandBot = bandTop + (baseY - topY) * (narrow ? 0.4 : 0.46);
          const halfW = w * spread * (1 - t * 0.62);
          ctx.beginPath();
          ctx.moveTo(cx, bandTop);
          ctx.lineTo(cx - halfW, bandBot);
          ctx.stroke();
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

    // Sky wash: deep indigo up top warming to rose toward the water horizon. Drawn
    // as a true GPU gradient so there is no strip stepping — the old 40-rect version
    // left faint horizontal banding lines across the whole clearing grass.
    const grad = this.add.graphics().setDepth(-19.4).setAlpha(0.5);
    const skyTop = 0x1a1440;
    const horizon = 0x743f5b;
    this.fillSmoothVerticalBand(
      grad,
      0,
      0,
      width,
      height,
      (t) => mixColor(skyTop, horizon, Math.pow(t, 1.25)),
      () => 1,
    );

    // Star field across the upper reaches.
    const stars = this.add.graphics().setDepth(-19.2);
    for (let i = 0; i < 46; i += 1) {
      const sx = rng() * width;
      const sy = rng() * height * 0.52;
      stars.fillStyle(0xfdf3d6, 0.3 + rng() * 0.6);
      stars.fillCircle(sx, sy, 0.6 + rng() * 1.4);
    }

    // Distant horizon treeline at the very top corners: a THIN, far-back line that
    // now sits clearly BEHIND the real framing pines (the clearing-pine-1/2 props).
    // Kept — not retired — for depth: it reads as forest receding on the skyline,
    // not a doubling of the prop trees. Thinned from the old 6-per-side line
    // (fewer, smaller, fainter) and pushed high/small so the prop pines carry the
    // frame and this only whispers behind them.
    const pines = this.add.graphics().setDepth(-19).setAlpha(0.55);
    const drawPine = (bx: number, by: number, ph: number): void => {
      pines.fillStyle(0x201a34, 1);
      const pw = ph * 0.5;
      pines.beginPath();
      pines.moveTo(bx, by - ph);
      pines.lineTo(bx - pw / 2, by);
      pines.lineTo(bx + pw / 2, by);
      pines.closePath();
      pines.fillPath();
    };
    for (let i = 0; i < 4; i += 1) {
      drawPine(16 + i * 30 + rng() * 10, tile * (0.7 + rng() * 0.3), tile * (1.0 + rng() * 0.7));
      drawPine(width - 16 - i * 30 - rng() * 10, tile * (0.7 + rng() * 0.3), tile * (1.0 + rng() * 0.7));
    }

    // Sakura petals drifting over the grass (kept off the shore band only). The
    // clearing no longer carries a worn path, so petals scatter across the whole
    // grass including the centre — no path-shaped bare lane to route around.
    const petals = this.add.graphics().setDepth(-18);
    const pinks = [0xf4c2d4, 0xecaac4, 0xf6ccdb, 0xd79ec8];
    const shoreTop = height - tile * 2;
    for (let i = 0; i < 90; i += 1) {
      const px = rng() * width;
      const py = tile * 0.6 + rng() * (shoreTop - tile * 0.6);
      petals.fillStyle(pinks[Math.floor(rng() * pinks.length)], 0.55 + rng() * 0.35);
      const r = 1.6 + rng() * 2.4;
      petals.fillEllipse(px, py, r * 1.8, r);
    }
  }

  // Draws a smooth vertical gradient band via per-corner GPU gradient fills, so it
  // reads as continuous — no strip/step banding. Each segment interpolates colour
  // and alpha internally AND shares its endpoint values with its neighbour (pixel
  // boundaries snapped to integers so segments abut with no overlap-doubling and no
  // grass-gap), so any segment count looks seamless. colour/alpha are sampled as
  // functions of t (0 at the band top, 1 at the bottom) to keep non-linear ramps.
  private fillSmoothVerticalBand(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    colorAt: (t: number) => number,
    alphaAt: (t: number) => number,
    segments = 16,
  ): void {
    for (let i = 0; i < segments; i += 1) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const yA = Math.round(y + t0 * h);
      const yB = Math.round(y + t1 * h);
      if (yB <= yA) continue;
      const c0 = colorAt(t0);
      const c1 = colorAt(t1);
      const a0 = alphaAt(t0);
      const a1 = alphaAt(t1);
      g.fillGradientStyle(c0, c0, c1, c1, a0, a0, a1, a1);
      g.fillRect(x, yA, w, yB - yA);
    }
  }

  // Guildford's southern approach to the clearing: a gradual painterly dusk band
  // across the last SOUTH_DUSK_ROWS tile-rows so the daytime neighbourhood eases
  // into the twilight water rather than cutting to it at the edge transition. The
  // grass cools/darkens toward indigo (intensifying to SOUTH_DUSK_PEAK_ALPHA at
  // the very edge), and a few sakura petals and faint cool motes drift in the band.
  // All world-space and negative-depth so it sits under props/player; a localised
  // darkening, so the awakening's warm overlays lift it without erasing it. Seeded
  // so it's stable across reloads/screenshots.
  private decorateSouthDuskThreshold(width: number, height: number, tile: number): void {
    if (SOUTH_DUSK_PEAK_ALPHA <= 0 || SOUTH_DUSK_ROWS <= 0) {
      return;
    }
    const rng = mulberry32(fnv1a(`${this.location.id}:south-dusk`));
    const bandHeight = tile * SOUTH_DUSK_ROWS;
    const top = height - bandHeight;

    // Cooling wash: transparent at the top of the band, deepening to indigo at the
    // bottom edge. A gentle non-linear ramp keeps the top feathered and the last
    // row strongest. Drawn as a true GPU gradient (per-corner alpha) so there is no
    // strip stepping — the old discrete-rect version left faint horizontal lines.
    const wash = this.add.graphics().setDepth(-8.5);
    this.fillSmoothVerticalBand(
      wash,
      0,
      top,
      width,
      bandHeight,
      () => SOUTH_DUSK_INDIGO,
      (t) => SOUTH_DUSK_PEAK_ALPHA * Math.pow(t, 1.6),
    );

    // Sakura petals drifting in the band (echoing the clearing), sparse and only
    // where the band has begun to cool (lower two-thirds).
    const petals = this.add.graphics().setDepth(-8.3);
    const pinks = [0xf4c2d4, 0xecaac4, 0xf6ccdb, 0xd79ec8];
    for (let i = 0; i < 16; i += 1) {
      const px = rng() * width;
      const py = top + bandHeight * (0.34 + rng() * 0.62);
      petals.fillStyle(pinks[Math.floor(rng() * pinks.length)], 0.4 + rng() * 0.3);
      const r = 1.4 + rng() * 2.2;
      petals.fillEllipse(px, py, r * 1.8, r);
    }

    // Faint cool dusk motes: a handful of soft lavender specks in the upper band,
    // the first hint of the clearing's star shimmer bleeding north.
    const motes = this.add.graphics().setDepth(-8.35);
    for (let i = 0; i < 10; i += 1) {
      const mx = rng() * width;
      const my = top + bandHeight * (0.1 + rng() * 0.55);
      motes.fillStyle(0xcdb9e8, 0.22 + rng() * 0.3);
      motes.fillCircle(mx, my, 0.7 + rng() * 1.3);
    }
  }

  // A soft pulsing glow doormat, laid flat in the floor plane at each door exit
  // rect, so doorways on the (undressed) outdoor maps are findable.
  private createOutdoorDoorMarkers(): void {
    if (!this.isOutdoor() || !this.debugMarkers) {
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

    // Fill. Flat (outdoor) markers are axis-aligned rectangles that sit on the
    // ground/water, so a hard-edged fill reads as a rectangle stamped on the
    // surface — in the clearing the "Look over the water" marker looked like a
    // shadow with a crisp rim on the twilight water. Feather the fill so it fades
    // in from the edge instead: nested concentric rects, each at a fraction of the
    // target alpha, composite to the full 0.28 in the interior and taper to nearly
    // nothing at the rim (a soft falloff, ~1 tile deep — not a blur). The gold rim
    // stroke still defines the hotspot. Iso (interior) markers keep the flat fill,
    // since their corners are a parallelogram this nested-rect trick doesn't fit.
    const FILL_ALPHA = 0.28;
    if (projection.mode === 'flat') {
      const xs = polygon.map((p) => p.x);
      const ys = polygon.map((p) => p.y);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      const w = Math.max(...xs) - x0;
      const h = Math.max(...ys) - y0;
      const layers = 6;
      // Feather depth: subtle, capped so it never eats past the rect's centre.
      const feather = Math.min(14, w / 2 - 1, h / 2 - 1);
      if (feather > 0) {
        const step = feather / layers;
        // Per-layer alpha whose `layers`-fold source-over composite lands on
        // FILL_ALPHA at the fully-covered core.
        const layerAlpha = 1 - Math.pow(1 - FILL_ALPHA, 1 / layers);
        marker.fillStyle(color, layerAlpha);
        for (let i = 0; i < layers; i += 1) {
          const inset = i * step;
          marker.fillRect(x0 + inset, y0 + inset, w - inset * 2, h - inset * 2);
        }
      } else {
        marker.fillStyle(color, FILL_ALPHA);
        marker.fillPoints(polygon, true);
      }
    } else {
      marker.fillStyle(color, FILL_ALPHA);
      marker.fillPoints(polygon, true);
    }
    marker.lineStyle(3, color, 0.9);
    marker.strokePoints(polygon, true);

    // The clearing shore already has the normal proximity prompt at the bottom
    // of the screen. Keep its subtle water hotspot, but do not stamp a second,
    // oversized white label directly onto the scene.
    if (object.id === 'clearing-shore') {
      return;
    }

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
    this.playerVisual.setDepth(position.y + PLAYER_VISUAL_DEPTH_BIAS);
    this.syncRotatedPropDepths();
    this.maybeSpawnWalkDust(position);
    this.updatePlayerVisualAnimation();
  }

  private facePlayer(facing: PlayerFacing): void {
    this.playerFacing = facing;
    this.tapStepHoldUntil = 0;
    this.wasPlayerMoving = false;
    this.syncPlayerVisualFlip();
    this.playerVisual?.play(RECIPIENT_IDLE_ANIMATIONS[facing], true);
  }

  private syncRotatedPropDepths(): void {
    const overrides = this.getEffectivePropDepthOverrides();
    const playerVisual = this.playerVisual;
    if (
      !playerVisual ||
      (this.propHandles.length === 0 && this.outdoorDepthHandles.length === 0)
    ) {
      return;
    }

    // Depth lines are authored in map space but judged against the billboard's
    // rendered depth. ____ deliberately sorts 10 screen px below her physics
    // feet, so convert that same biased depth back to map space before testing
    // a line. Otherwise the collider can stop her while the line still reports
    // "behind", even after her rendered feet have visibly crossed it.
    const projection = this.getProjection();
    const sortingPoint = getPlayerDepthSortingPoint(
      projection,
      this.player.x,
      this.player.y,
    );
    for (const { placement, depthParts } of this.propHandles) {
      if (placement.fixedDepth !== undefined) {
        continue;
      }
      const bedLines = placement.frame === 'bed'
        ? getBedDepthLines(overrides, placement.frame)
        : [];
      const recipientInFrontOfBed = bedLines.length > 0
        ? isPlayerInFrontOfBedDepthLines(
            bedLines,
            sortingPoint.x,
            sortingPoint.y,
          )
        : undefined;
      const bedNaturalDepth = bedLines.length > 0
        ? Math.max(...bedLines.map((line) => projection.project(
            (line.start[0] + line.end[0]) / 2,
            (line.start[1] + line.end[1]) / 2,
          ).y))
        : undefined;
      for (const part of depthParts) {
        const line = overrides[part.depthKey] ?? overrides[placement.frame];
        if (!isRotatedPropDepthLine(line)) {
          continue;
        }
        const recipientInFront = recipientInFrontOfBed ?? isPlayerInFrontOfDepthLine(
          line,
          sortingPoint.x,
          sortingPoint.y,
        );
        // Normal props keep their line midpoint as their natural depth. A bed
        // uses the front-most midpoint of its compound boundary for both image
        // parts, so the side and foot segments cannot split the artwork across
        // ____. Only move the prop across ____ when that natural depth is on
        // the wrong side.
        const naturalDepth = bedNaturalDepth ?? projection.project(
          (line.start[0] + line.end[0]) / 2,
          (line.start[1] + line.end[1]) / 2,
        ).y;
        part.image.setDepth(
          resolvePropDepthRelativeToPlayer(naturalDepth, playerVisual.depth, recipientInFront),
        );
      }
    }

    // ____'s bedside table physically overlaps the bed art, so their relative
    // furniture stack is invariant even while each prop independently crosses
    // ____. Keep the table behind the rearmost bed layer; otherwise approaching
    // the violin can clamp the two props to opposite sides of ____ and let the
    // table jump over the duvet/headboard.
    const bedHandle = this.propHandles.find(({ placement }) => placement.frame === 'bed');
    const bedsideTableHandle = this.propHandles.find(
      ({ placement }) => placement.frame === 'bedside-table',
    );
    if (bedHandle && bedsideTableHandle) {
      const bedDepths = bedHandle.depthParts.map(({ image }) => image.depth);
      for (const { image } of bedsideTableHandle.depthParts) {
        image.setDepth(clampDepthBehindLayers(image.depth, bedDepths));
      }
    }

    // Outdoor targets use stable per-instance ids because a location can contain
    // several placements of the same prop kind. Apply the same authored-line
    // crossing rule to the billboard (and a signpost's separate caption) without
    // coupling one tree/bush/sign to its siblings.
    for (const handle of this.outdoorDepthHandles) {
      const line = overrides[handle.id];
      if (typeof line === 'number') {
        const depth = projection.project(handle.mapX, line).y;
        handle.image.setDepth(depth);
        handle.label?.setDepth(depth + 0.1);
        continue;
      }
      if (!isRotatedPropDepthLine(line)) {
        continue;
      }
      const recipientInFront = isPlayerInFrontOfDepthLine(
        line,
        sortingPoint.x,
        sortingPoint.y,
      );
      const naturalDepth = projection.project(
        (line.start[0] + line.end[0]) / 2,
        (line.start[1] + line.end[1]) / 2,
      ).y;
      const depth = resolvePropDepthRelativeToPlayer(
        naturalDepth,
        playerVisual.depth,
        recipientInFront,
      );
      handle.image.setDepth(depth);
      handle.label?.setDepth(depth + 0.1);
    }
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
    const availableInteractionIds = new Set(
      this.location.interactions
        .filter((interaction) =>
          isInteractionAvailable(interaction, this.state) &&
          !(
            interaction.endingConversation &&
            (this.state.endingCompleted || this.finaleReveal.phase !== 'omen')
          ),
        )
        .map((interaction) => interaction.id),
    );
    const objects = [
      ...this.interactions.filter((object) => availableInteractionIds.has(object.id)),
      ...this.exits,
    ];

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
      const storyBlock = getStoryTravelBlock(exit.destinationLocationId, this.state);
      if (storyBlock) {
        playSfx('sfx-story-hum', { volume: 0.22 });
        await this.pauseForDialogue([storyBlock]);
        return;
      }
      if (exit.requiresFinalUnlock && !isFinalSpotUnlocked(this.state)) {
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
    if (!isInteractionAvailable(interaction, this.state)) {
      return;
    }
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
      await showPhotoWall({ onIntroComplete: () => playSfx('sfx-photo-complete') });
      this.canMove = true;
      return;
    }

    if (interaction.id === 'recipient-pc' && this.state.endingCompleted) {
      this.canMove = false;
      const archive = showLettersScreen({
        mode: 'archive',
        letters: mergeLetterArchive(getCollectedFriendLetters(this.state)),
        onGoHome: () => this.goHome(),
      });
      await archive.closed;
      this.canMove = true;
      return;
    }

    if (interaction.id === 'recipient-pc') {
      const pcStory = resolveRecipientPcStory(this.state);
      playSfx('sfx-pc-fail');
      this.glitchRecipientPcVisual();
      let notificationPlayed = false;
      await this.pauseForDialogue(pcStory.dialogue, {
        onLineShown: (line) => {
          if (!pcStory.playNotification || notificationPlayed || line.portraitTreatment !== 'phone') {
            return;
          }
          notificationPlayed = true;
          const priorCount = Number(document.body.dataset.phoneNotificationCount ?? '0');
          document.body.dataset.phoneNotificationCount = String(priorCount + 1);
          playSfx('sfx-phone-notification');
        },
      });
      if (pcStory.marksBeatId) {
        this.state = markBeatSeen(this.state, pcStory.marksBeatId);
        this.registry.set('runState', this.state);
      }
      return;
    }
    if (interaction.id === 'recipient-violin') {
      this.cancelViolinCue();
    }

    if (interaction.id === 'recipient-mango-rice') {
      const postRetakeDialogue = resolveMangoRiceDialogue(this.state);
      if (postRetakeDialogue) {
        await this.pauseForDialogue(postRetakeDialogue);
        return;
      }
    }

    if (interaction.endingConversation) {
      await this.runFinaleConversation(interaction);
      return;
    }

    if (interaction.dialogue) {
      await this.pauseForDialogue(interaction.dialogue);
    }

    if (interaction.marksBeatId) {
      this.state = markBeatSeen(this.state, interaction.marksBeatId);
      this.registry.set('runState', this.state);
      this.applyFriendOnePcReadyState();
      if (interaction.marksBeatId === FRIEND_ONE_PC_READY_BEAT_ID) {
        playSfx('sfx-pc-ready', { volume: 0.55 });
      }
    }

    if (interaction.kind === 'activity') {
      await this.startActivity(interaction.activityId);
    }
  }

  private async runFinaleConversation(interaction: LocationInteraction): Promise<void> {
    if (this.finaleReveal.phase !== 'omen') {
      return;
    }
    await this.pauseForDialogue([
      { speaker: '____', text: 'You... who are you?', portraitId: 'portrait-recipient' },
      { speaker: 'Omen', text: '~~', portraitId: 'portrait-omen' },
    ]);
    this.finaleReveal = advanceFinaleReveal(this.finaleReveal, 'ask-identity');
    const actor = this.finaleActor;
    if (actor) {
      playSfx('sfx-omen-teleport');
      await new Promise<void>((resolve) => {
        this.tweens.add({
          targets: actor,
          alpha: 0,
          scaleX: actor.scaleX * 0.45,
          scaleY: actor.scaleY * 1.35,
          duration: 480,
          ease: 'Cubic.easeIn',
          onComplete: () => resolve(),
        });
      });
      const { x, y } = actor;
      actor.destroy();
      this.finaleActor = this.createFinaleFriendTwo(x, y - 4);
    }
    this.finaleReveal = advanceFinaleReveal(this.finaleReveal, 'transform-complete');
    document.body.dataset.finaleActor = 'friendtwo';
    if (interaction.dialogue) {
      await this.pauseForDialogue(interaction.dialogue);
    }
    this.finaleReveal = advanceFinaleReveal(this.finaleReveal, 'ending-complete');
    delete document.body.dataset.finaleActor;
    this.startGalaxyLetterEnding();
  }

  // ____'s conversation now hands the ending back to ____. One sustained
  // violin note wakes every star dotted across the galaxy; once they are shining
  // she can collect each one and open its photo-letter. Only the last closed
  // letter reveals the quiet return home.
  private startGalaxyLetterEnding(): void {
    this.canMove = false;
    this.setPrompt('');
    const letters = GALAXY_ENDING_LETTERS;
    const model = createGalaxyLetterState(letters.length);
    const stars = layoutGalaxyLetterStars(letters.length).map(
      (position, index): GalaxyLetterStarDisplay => {
        const glow = this.add
          .ellipse(position.x, position.y, 74, 74, 0x9cc8ff, 0)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(809);
        const star = this.add
          .star(position.x, position.y, 5, 8, 22, 0xfff1b8, 0.12)
          .setStrokeStyle(2, 0xb9d9ff, 0.16)
          .setScale(0.65)
          .setDepth(810);
        return { index, glow, star, lit: false, collected: false };
      },
    );

    const violinGlow = this.add
      .ellipse(0, 0, 58, 78, 0xffd27c, 0.11)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(816);
    const violin = this.add
      .image(0, 0, GALAXY_VIOLIN_KEY)
      .setDisplaySize(30, 48)
      .setAngle(8)
      .setDepth(817);
    this.tweens.add({
      targets: violinGlow,
      alpha: { from: 0.07, to: 0.2 },
      scaleX: { from: 0.86, to: 1.12 },
      scaleY: { from: 0.9, to: 1.08 },
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const hud = showGalaxyLettersHud({
      host: getUiRoot(),
      total: letters.length,
      onGoHome: () => this.goHome(),
    });
    const playKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    const runtime: GalaxyLetterEndingRuntime = {
      model,
      letters,
      stars,
      violin,
      violinGlow,
      playKey,
      hud,
      awakening: false,
      openingLetter: false,
    };
    this.galaxyLetterEnding = runtime;
    this.positionGalaxyViolin(runtime);
    this.syncGalaxyLetterObservability(runtime);

    if (letters.length === 0) {
      this.finishGalaxyLetterEnding(runtime);
    }
  }

  private updateGalaxyLetterEnding(): void {
    const runtime = this.galaxyLetterEnding;
    if (!runtime) {
      return;
    }

    this.positionGalaxyViolin(runtime);
    if (runtime.awakening) {
      return;
    }
    if (!areAllGalaxyLettersLit(runtime.model)) {
      if (runtime.playKey && Phaser.Input.Keyboard.JustDown(runtime.playKey)) {
        this.playGalaxyViolinFinale(runtime);
      }
      return;
    }

    if (runtime.openingLetter || areAllGalaxyLettersRead(runtime.model)) {
      return;
    }

    const collectible = runtime.stars.find(
      ({ index, star, collected }) =>
        !collected &&
        canCollectGalaxyLetter(runtime.model, index) &&
        Phaser.Math.Distance.Between(this.player.x, this.player.y, star.x, star.y) <=
          GALAXY_STAR_COLLECT_RADIUS,
    );
    if (collectible) {
      void this.collectGalaxyLetter(runtime, collectible);
    }
  }

  private positionGalaxyViolin(runtime: GalaxyLetterEndingRuntime): void {
    const x = (this.playerVisual?.x ?? this.player.x) + 21;
    const y = (this.playerVisual?.y ?? this.player.y) - 43;
    runtime.violin.setPosition(x, y).setDepth(this.player.y + 18);
    runtime.violinGlow.setPosition(x, y).setDepth(this.player.y + 17);
  }

  private playGalaxyViolinFinale(runtime: GalaxyLetterEndingRuntime): void {
    runtime.awakening = true;
    runtime.model = lightAllGalaxyLetters(runtime.model);
    const testMode = new URLSearchParams(window.location.search).get('testMode') === '1';
    const noteMs = testMode ? 520 : GALAXY_VIOLIN_NOTE_MS;
    const revealSpanMs = testMode ? 360 : GALAXY_STAR_REVEAL_SPAN_MS;
    const pitch = getPitch(GALAXY_VIOLIN_PITCH_ID);
    if (pitch) {
      playViolinNote(pitch.frequency, noteMs, { volume: 0.78 });
    }

    runtime.hud.setAwakening();
    this.syncGalaxyLetterObservability(runtime);

    runtime.stars.forEach((display, index) => {
      const delay = runtime.stars.length <= 1
        ? 0
        : (revealSpanMs * index) / (runtime.stars.length - 1);
      this.time.delayedCall(delay, () => {
        this.lightGalaxyLetterStar(display);
      });
    });

    this.time.delayedCall(noteMs, () => {
      runtime.awakening = false;
      runtime.hud.setCollecting(runtime.model.read.length);
      document.body.dataset.galaxyEndingPhase = 'collecting';
      this.canMove = true;
    });
  }

  private lightGalaxyLetterStar(display: GalaxyLetterStarDisplay): void {
    display.lit = true;
    display.star.setAlpha(1).setStrokeStyle(2, 0xe5f2ff, 0.9);
    display.glow.setAlpha(0.48);
    this.tweens.add({
      targets: display.star,
      scaleX: { from: 1.8, to: 1 },
      scaleY: { from: 1.8, to: 1 },
      angle: '+=36',
      duration: 520,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: display.star,
          scaleX: { from: 0.94, to: 1.08 },
          scaleY: { from: 0.94, to: 1.08 },
          duration: 1250 + display.index * 120,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      },
    });
    this.tweens.add({
      targets: display.glow,
      alpha: { from: 0.18, to: 0.55 },
      scaleX: { from: 0.72, to: 1.14 },
      scaleY: { from: 0.72, to: 1.14 },
      duration: 1450 + display.index * 100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private async collectGalaxyLetter(
    runtime: GalaxyLetterEndingRuntime,
    display: GalaxyLetterStarDisplay,
  ): Promise<void> {
    runtime.openingLetter = true;
    display.collected = true;
    runtime.hud.element.hidden = true;
    this.canMove = false;
    this.setPrompt('');

    const testMode = new URLSearchParams(window.location.search).get('testMode') === '1';
    const duration = testMode ? 60 : 360;
    await new Promise<void>((resolve) => {
      this.tweens.killTweensOf([display.star, display.glow]);
      this.tweens.add({
        targets: [display.star, display.glow],
        x: this.player.x,
        y: this.player.y - 34,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration,
        ease: 'Cubic.easeIn',
        onComplete: () => resolve(),
      });
    });
    display.star.setVisible(false);
    display.glow.setVisible(false);

    const letter = runtime.letters[display.index];
    if (letter) {
      await showPhotoLetterModal(letter);
    }
    runtime.hud.element.hidden = false;
    runtime.model = readGalaxyLetter(runtime.model, display.index);
    runtime.hud.setCollecting(runtime.model.read.length);
    runtime.openingLetter = false;
    this.syncGalaxyLetterObservability(runtime);

    if (areAllGalaxyLettersRead(runtime.model)) {
      this.finishGalaxyLetterEnding(runtime);
      return;
    }
    this.canMove = true;
  }

  private finishGalaxyLetterEnding(runtime: GalaxyLetterEndingRuntime): void {
    this.state = markEndingCompleted(this.state);
    this.registry.set('runState', this.state);
    this.canMove = false;
    runtime.hud.setComplete();
    document.body.dataset.galaxyEndingPhase = 'complete';
    this.syncGalaxyLetterObservability(runtime);
  }

  private syncGalaxyLetterObservability(runtime: GalaxyLetterEndingRuntime): void {
    document.body.dataset.galaxyEndingPhase = areAllGalaxyLettersRead(runtime.model)
      ? 'complete'
      : runtime.awakening
        ? 'awakening'
      : areAllGalaxyLettersLit(runtime.model)
        ? 'collecting'
        : 'playing';
    document.body.dataset.galaxyStarsLit = String(runtime.model.lit);
    document.body.dataset.galaxyLettersRead = String(runtime.model.read.length);
  }

  // Cross-fades the ending transition's held galaxy frame out to reveal the live,
  // playable galaxy scene beneath, then hands ____ control. Movement is frozen
  // until the frame is fully gone, so no input reaches the scene mid-reveal.
  private async revealGalaxyArrival(overlayMount: HTMLElement): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const condensedPreview =
      params.get('testMode') === '1' && params.get('fullTransitions') !== '1';
    const fadeMs = condensedPreview ? 40 : 1500;
    overlayMount.style.pointerEvents = 'none';
    overlayMount.style.transition = `opacity ${fadeMs}ms ease`;
    void overlayMount.offsetWidth;
    overlayMount.style.opacity = '0';
    await new Promise<void>((resolve) => window.setTimeout(resolve, fadeMs));
    overlayMount.remove();
    this.canMove = true;
  }

  private async pauseForDialogue(
    lines: readonly DialogueLine[],
    options: ShowDialogueOptions = {},
  ): Promise<void> {
    this.canMove = false;
    await showDialogue(lines, options);
    this.canMove = true;
  }

  private async startActivity(activityId: string): Promise<void> {
    const replayingAfterEnding = this.state.endingCompleted;
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

    // Hide the global HUD chrome (mute toggle + Letters inventory) for the
    // duration of a minigame, so only the activity's own shell is on screen.
    if (MINIGAME_ACTIVITY_IDS.has(activityId)) {
      document.body.classList.add('minigame-active');
    }
    const restoreHud = (): void => {
      document.body.classList.remove('minigame-active');
      document.body.classList.remove('ending-transition-active');
      document.body.classList.remove('ending-montage-mounted');
    };
    if (activityId === 'final-keepsake-reveal') {
      document.body.classList.add('ending-transition-active');
    }

    const activityMusic = ACTIVITY_MUSIC_BY_ID[activityId];
    const silencesMusic = MUSIC_SILENT_ACTIVITY_IDS.has(activityId);
    if (activityMusic) {
      playMusic(activityMusic, { fadeMs: 900 });
    } else if (silencesMusic) {
      stopMusic({ fadeMs: 900 });
    }
    const resumeLocationMusic = () => {
      if (activityMusic || silencesMusic) {
        playMusic(locationMusicKey(this.location.id), { fadeMs: 1200 });
      }
    };

    await activity.start({
      state: this.state,
      mount: activityMount,
      onGoHome: () => this.goHome(),
      onCancel: () => {
        restoreHud();
        activityMount.remove();
        wakeScene();
        resumeLocationMusic();
        this.canMove = true;
      },
      onComplete: async (completion) => {
        // The scene knows which registered activity produced this callback.
        // Normalize the completion here so a module can never award its keepsake
        // while accidentally failing to persist its completed activity ID.
        const recordedCompletion = {
          ...completion,
          activityId: completion.activityId ?? activityId,
        };
        // The ending's frame-sequence transition hands off to the live, playable
        // galaxy scene. Wake this scene so it renders beneath the held galaxy
        // frame (still up in the activity mount), record the activity, then
        // cross-fade that frame out and hand ____ control on the galaxy water.
        // Movement stays frozen through the fade so no input leaks to the scene.
        if (completion.endingArrival) {
          wakeScene();
          this.state = completeLocation(this.state, recordedCompletion);
          this.registry.set('runState', this.state);
          await this.revealGalaxyArrival(activityMount);
          await this.runFinalSpotArrivalBeat();
          restoreHud();
          return;
        }

        restoreHud();

        activityMount.remove();

        wakeScene();
        resumeLocationMusic();
        if (this.location.keepsake && !replayingAfterEnding) {
          playSfx('sfx-keepsake');
        }
        this.state = completeLocation(this.state, recordedCompletion);

        this.registry.set('runState', this.state);

        const completedActivityId = completion.activityId ?? activityId;
        const completionStory = getActivityCompletionStory(completedActivityId);
        if (completionStory?.playerFacing) {
          this.facePlayer(completionStory.playerFacing);
        }
        if (completedActivityId === 'friendone-pc-fishing') {
          await this.revealSecondKoi();
        }
        if (completedActivityId === RETAKE_ACTIVITY_ID) {
          this.removeFriendOneFollower();
        }

        // The awakening is the emotional beat: apply it the instant the violin
        // completes (the scene woke without re-running create()), fading the
        // golden shafts + doormat shine in over ~1.5s while ____ is still at
        // the stand — before the reward letter and any travel. Gated internally
        // on the final unlock, so only the run-completing keepsake triggers it.
        this.applyInteriorAwakening({ animate: true });
        // Epilogue/card-mode launches are clean replays: return to the room on
        // completion without re-awarding keepsakes or replaying story dialogue.
        if (!replayingAfterEnding) {
          if (this.location.rewardSheetMusic) {
            await showSheetMusicModal(this.location.rewardSheetMusic);
          } else if (
            this.location.rewardMessage &&
            this.location.rewardPresentation === 'letter'
          ) {
            await showLetterModal(this.location.rewardMessage);
          } else if (this.location.rewardMessage) {
            await this.pauseForDialogue(this.location.rewardMessage);
          }

          if (completionStory?.worldDialogue.length) {
            await this.pauseForDialogue(completionStory.worldDialogue);
          }
        }

        // Some activities deliver the player elsewhere on completion (the origami
        // ritual carries her INTO the lantern clearing). Restart into that
        // destination instead of resuming the current location. Cards mode is a
        // replay gallery, so completing Boatigami leaves ____ at its launch point
        // instead of forcing the terminal ending sequence.
        if (completion.travelTo && !isCardMode(this.state)) {
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
   * The quiet return after every galaxy letter-star has been read. Dismisses the
   * ending HUD and restarts the world into ____'s awakened room with control
   * restored — the game's soft landing. `endingCompleted` is already set, so the
   * room comes up in its golden state and the photo wall reveals.
   */
  private goHome(): void {
    // Re-arm key capture defensively and clear the galaxy HUD before we leave.
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
