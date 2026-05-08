import Phaser from 'phaser';
import { getActivity } from '../activities/activityRegistry';
import { getLocation } from '../content/locations';
import type { DialogueLine, LocationDefinition, LocationInteraction } from '../content/types';
import {
  completeLocation,
  createInitialRunState,
  isFinalSpotUnlocked,
  markEndingCompleted,
  setCurrentLocation,
  type RunState,
} from '../game/runState';
import {
  getIsoBounds,
  getIsoRectCorners,
  getIsoTileCorners,
  projectToIso,
  type IsoOrigin,
  type IsoPoint,
} from '../game/isometricProjection';
import { getPointObject, getRectObjects, type RectObject, type TiledMapJson } from '../game/mapHelpers';
import { PlayerController } from '../game/playerController';
import { renderCollectionPanel } from '../ui/collectionPanel';
import { showDialogue } from '../ui/dialogueBox';
import { clearUiRoot, getUiRoot } from '../ui/domRoot';
import { SceneKeys } from './sceneKeys';

interface LocationSceneData {
  readonly locationId: string;
  readonly spawnId?: string;
  readonly state?: RunState;
}

type PlayerFacing = 'down' | 'left' | 'right' | 'up';

const RECIPIENT_SPRITESHEET_KEY = 'recipient-walk-4dir';
const RECIPIENT_ANIMATIONS: Record<PlayerFacing, string> = {
  down: 'recipient-walk-down',
  left: 'recipient-walk-left',
  right: 'recipient-walk-right',
  up: 'recipient-walk-up',
};
const RECIPIENT_ROW_START_FRAME: Record<PlayerFacing, number> = {
  down: 0,
  left: 6,
  right: 12,
  up: 18,
};

export class LocationScene extends Phaser.Scene {
  private location!: LocationDefinition;
  private state: RunState = createInitialRunState('entry');
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerVisual?: Phaser.GameObjects.Sprite;
  private playerFacing: PlayerFacing = 'down';
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
      .sprite(0, 0, RECIPIENT_SPRITESHEET_KEY, RECIPIENT_ROW_START_FRAME.down)
      .setOrigin(0.5, 0.9)
      .setScale(0.55)
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
    this.playerVisual.setPosition(position.x, position.y);
    this.playerVisual.setDepth(position.y + 10);
    this.updatePlayerVisualAnimation();
  }

  private createRecipientAnimations(): void {
    for (const [facing, key] of Object.entries(RECIPIENT_ANIMATIONS) as [PlayerFacing, string][]) {
      if (this.anims.exists(key)) {
        continue;
      }

      const start = RECIPIENT_ROW_START_FRAME[facing];
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(RECIPIENT_SPRITESHEET_KEY, {
          start,
          end: start + 5,
        }),
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  private updatePlayerVisualAnimation(): void {
    const visual = this.playerVisual;

    if (!visual) {
      return;
    }

    const velocity = this.player.body?.velocity;

    if (!velocity || velocity.lengthSq() < 1) {
      visual.stop();
      visual.setFrame(RECIPIENT_ROW_START_FRAME[this.playerFacing]);
      return;
    }

    const screenVelocity = this.projectMapVelocityToScreen(velocity.x, velocity.y);
    this.playerFacing =
      Math.abs(screenVelocity.x) > Math.abs(screenVelocity.y)
        ? screenVelocity.x > 0
          ? 'right'
          : 'left'
        : screenVelocity.y > 0
          ? 'down'
          : 'up';

    visual.play(RECIPIENT_ANIMATIONS[this.playerFacing], true);
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
          { text: 'The clearing feels close, but three keepsakes are still needed.' },
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

    await activity.start({
      state: this.state,
      mount: activityMount,
      onCancel: () => {
        activityMount.remove();
        this.canMove = true;
      },
      onComplete: async (completion) => {
        activityMount.remove();
        this.state = completeLocation(this.state, completion);

        if (completion.locationId === 'final-spot') {
          this.state = markEndingCompleted(this.state);
        }

        this.registry.set('runState', this.state);
        this.refreshCollectionPanel();

        if (this.location.rewardMessage) {
          await this.pauseForDialogue(this.location.rewardMessage);
        }

        this.canMove = true;
      },
    });
  }
}
