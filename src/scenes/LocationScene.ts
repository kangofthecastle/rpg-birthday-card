import Phaser from 'phaser';
import { getActivity } from '../activities/activityRegistry';
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
import type { DialogueLine, LocationDefinition, LocationInteraction } from '../content/types';
import {
  completeLocation,
  createInitialRunState,
  hasAllFriendKeepsakes,
  isFinalSpotUnlocked,
  markBeatSeen,
  markEndingCompleted,
  setCurrentLocation,
  type RunState,
} from '../game/runState';
import { isInteractionLocked, shouldPlayEnterBeat } from '../game/interactionState';
import {
  getIsoBounds,
  getIsoRectCorners,
  getIsoTileCorners,
  projectToIso,
  type IsoOrigin,
  type IsoPoint,
} from '../game/isometricProjection';
import { playMusic, playSfx, type MusicKey } from '../game/audio';
import { getPointObject, getRectObjects, type RectObject, type TiledMapJson } from '../game/mapHelpers';
import { getPlayerFacingFromScreenMovement, PlayerController } from '../game/playerController';
import { renderCollectionPanel } from '../ui/collectionPanel';
import { showDialogue } from '../ui/dialogueBox';
import { clearUiRoot, getUiRoot } from '../ui/domRoot';
import { showLetterModal } from '../ui/letterModal';
import { SceneKeys } from './sceneKeys';

interface LocationSceneData {
  readonly locationId: string;
  readonly spawnId?: string;
  readonly state?: RunState;
}

// Ambient bed per location; activities layer their own bed on top and the
// location bed resumes when they end. The ending swaps beds itself.
const MUSIC_BY_LOCATION_ID: Readonly<Record<string, MusicKey>> = {
  'recipient-house': 'music-home',
  entry: 'music-path',
  'friend-a': 'music-home',
  'friend-b': 'music-home',
  'final-spot': 'music-path',
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
  private state: RunState = createInitialRunState('entry');
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
  private isoOrigin?: IsoOrigin;

  constructor() {
    super(SceneKeys.Location);
  }

  init(data: LocationSceneData): void {
    this.location = getLocation(data.locationId);
    this.state = setCurrentLocation(data.state ?? createInitialRunState('entry'), data.locationId);
    this.registry.set('runState', this.state);
    this.registry.set('spawnId', data.spawnId ?? this.location.defaultSpawnId);
  }

  create(): void {
    clearUiRoot();
    this.createMap();
    this.createPlayer();
    this.createHud();
    this.createLocationLabel();
    this.applyWarmLightingTint();
    playMusic(locationMusicKey(this.location.id), { fadeMs: 1200 });

    this.interactKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.promptText = this.add
      .text(24, this.scale.height - 64, '', {
        color: '#fff7e8',
        backgroundColor: '#1b1f1f',
        padding: { x: 12, y: 8 },
        fontSize: '18px',
      })
      .setScrollFactor(0)
      .setDepth(1000);

    void this.runEnterBeats();
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

    if (!this.canMove) {
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

  private createMap(): void {
    const tilemap = this.make.tilemap({ key: this.location.mapKey });
    const floorTileset = tilemap.addTilesetImage('temp-floor', 'tile-floor');
    const wallTileset = tilemap.addTilesetImage('temp-wall', 'tile-wall');

    if (!floorTileset || !wallTileset) {
      throw new Error(`Missing tileset for ${this.location.id}`);
    }

    this.isoOrigin = this.createIsoOrigin(tilemap);
    this.cameras.main.setBackgroundColor('#17211b');
    this.createDevBackdrop(tilemap);

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

    const isoBounds = getIsoBounds(tilemap.widthInPixels, tilemap.heightInPixels, this.isoOrigin);
    this.cameras.main.setBounds(0, 0, isoBounds.maxX + 192, isoBounds.maxY + 224);
    this.createWorldMarkers();
  }

  private createDevBackdrop(tilemap: Phaser.Tilemaps.Tilemap): void {
    const origin = this.getIsoOrigin();
    const width = tilemap.widthInPixels;
    const height = tilemap.heightInPixels;
    const isoBounds = getIsoBounds(width, height, origin);
    const graphics = this.add.graphics().setDepth(-20);

    graphics.fillStyle(0x17211b, 1);
    graphics.fillRect(0, 0, isoBounds.maxX + 192, isoBounds.maxY + 224);

    this.drawIsoSideFace(
      graphics,
      [projectToIso(0, height, origin), projectToIso(width, height, origin)],
      48,
      0x5d4a36,
    );
    this.drawIsoSideFace(
      graphics,
      [projectToIso(width, 0, origin), projectToIso(width, height, origin)],
      48,
      0x6b523c,
    );

    for (let row = 0; row < tilemap.height; row += 1) {
      for (let column = 0; column < tilemap.width; column += 1) {
        const isBorder =
          row === 0 || column === 0 || row === tilemap.height - 1 || column === tilemap.width - 1;
        const isAlternate = (row + column) % 2 === 0;
        const color = isBorder ? 0x8a6a4f : isAlternate ? 0x88ad70 : 0x7fa46b;
        const strokeColor = isBorder ? 0x5d4334 : 0x5f8050;
        const polygon = this.toPhaserPoints(
          getIsoTileCorners(
            column * tilemap.tileWidth,
            row * tilemap.tileHeight,
            tilemap.tileWidth,
            origin,
          ),
        );

        graphics.fillStyle(color, 1);
        graphics.fillPoints(polygon, true);
        graphics.lineStyle(1, strokeColor, isBorder ? 0.85 : 0.45);
        graphics.strokePoints(polygon, true);
      }
    }
  }

  private createPlayer(): void {
    const mapJson = this.getMapJson();
    const spawn = getPointObject(mapJson, 'Spawns', this.registry.get('spawnId') as string);

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

    this.controller = new PlayerController(this, this.player, {
      movementProjection: this.getIsoOrigin(),
    });
    this.cameras.main.startFollow(this.playerVisual, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(240, 180);
  }

  private createHud(): void {
    getUiRoot().insertAdjacentHTML('beforeend', renderCollectionPanel(this.state));
  }

  private createLocationLabel(): void {
    this.add
      .text(24, 24, this.location.title, {
        color: '#fff7e8',
        backgroundColor: '#1b1f1f',
        padding: { x: 14, y: 10 },
        fontSize: '20px',
        fontStyle: '700',
      })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  private createWorldMarkers(): void {
    for (const exit of this.exits) {
      this.createWorldMarker(exit, 0x74c7ec, this.getObjectLabel(exit));
    }

    for (const interaction of this.interactions) {
      this.createWorldMarker(interaction, 0xf1d79a, this.getObjectLabel(interaction));
    }
  }

  private createWorldMarker(object: RectObject, color: number, label: string): void {
    const origin = this.getIsoOrigin();
    const center = projectToIso(object.x + object.width / 2, object.y + object.height / 2, origin);
    const marker = this.add.graphics().setDepth(4);
    const polygon = this.toPhaserPoints(
      getIsoRectCorners(object.x, object.y, object.width, object.height, origin),
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

    const position = projectToIso(this.player.x, this.player.y, this.getIsoOrigin());
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
    const screenVelocity = this.projectMapVelocityToScreen(velocity.x, velocity.y);
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

    const screenVelocity = this.projectMapVelocityToScreen(velocity.x, velocity.y);
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

  private projectMapVelocityToScreen(x: number, y: number): IsoPoint {
    const verticalScale = this.getIsoOrigin().verticalScale ?? 0.5;

    return {
      x: (x - y) / 2,
      y: ((x + y) * verticalScale) / 2,
    };
  }

  private getIsoOrigin(): IsoOrigin {
    if (!this.isoOrigin) {
      throw new Error('Isometric origin is unavailable before map creation');
    }

    return this.isoOrigin;
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
    const playerBounds = this.player.getBounds();
    const objects = [...this.interactions, ...this.exits];

    return objects.find((object) =>
      Phaser.Geom.Intersects.RectangleToRectangle(
        playerBounds,
        new Phaser.Geom.Rectangle(object.x, object.y, object.width, object.height),
      ),
    );
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
        await this.pauseForDialogue([
          { text: 'The clearing feels close, but some keepsakes are still missing.' },
        ]);
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

    if (interaction.dialogue) {
      await this.pauseForDialogue(interaction.dialogue);
    }

    if (interaction.kind === 'activity') {
      await this.startActivity(interaction.activityId);
    }
  }

  private async pauseForDialogue(lines: readonly DialogueLine[]): Promise<void> {
    this.canMove = false;
    await showDialogue(lines);
    this.canMove = true;
  }

  private async startActivity(activityId: string): Promise<void> {
    this.canMove = false;
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
      onCancel: () => {
        activityMount.remove();
        resumeLocationMusic();
        this.canMove = true;
      },
      onComplete: async (completion) => {
        activityMount.remove();
        resumeLocationMusic();
        if (this.location.keepsake) {
          playSfx('sfx-keepsake');
        }
        this.state = completeLocation(this.state, completion);

        if (completion.locationId === 'final-spot') {
          this.state = markEndingCompleted(this.state);
        }

        this.registry.set('runState', this.state);

        if (this.location.rewardMessage && this.location.rewardPresentation === 'letter') {
          await showLetterModal(this.location.rewardMessage);
        } else if (this.location.rewardMessage) {
          await this.pauseForDialogue(this.location.rewardMessage);
        }

        this.refreshCollectionPanel();
        this.canMove = true;
      },
    });
  }
}
