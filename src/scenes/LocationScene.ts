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

export class LocationScene extends Phaser.Scene {
  private location!: LocationDefinition;
  private state: RunState = createInitialRunState('entry');
  private player!: Phaser.Physics.Arcade.Sprite;
  private controller!: PlayerController;
  private canMove = true;
  private exits: RectObject[] = [];
  private interactions: RectObject[] = [];
  private interactKey?: Phaser.Input.Keyboard.Key;
  private promptText?: Phaser.GameObjects.Text;
  private activeObject?: RectObject;
  private walls?: Phaser.Tilemaps.TilemapLayer;

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

    this.createDevBackdrop(tilemap);

    tilemap.createLayer('Ground', [floorTileset, wallTileset], 0, 0)?.setDepth(-10);
    const walls = tilemap.createLayer('Collision', [floorTileset, wallTileset], 0, 0);
    walls?.setDepth(-9);
    walls?.setCollisionByExclusion([-1, 0]);
    this.walls = walls ?? undefined;

    const mapJson = this.getMapJson();
    this.exits = getRectObjects(mapJson, 'Exits');
    this.interactions = getRectObjects(mapJson, 'Interactables');
    this.physics.world.setBounds(0, 0, tilemap.widthInPixels, tilemap.heightInPixels);
    this.cameras.main.setBounds(0, 0, tilemap.widthInPixels, tilemap.heightInPixels);
    this.createWorldMarkers();
  }

  private createDevBackdrop(tilemap: Phaser.Tilemaps.Tilemap): void {
    const width = tilemap.widthInPixels;
    const height = tilemap.heightInPixels;
    const graphics = this.add.graphics().setDepth(-20);

    graphics.fillStyle(0x7fa46b, 1);
    graphics.fillRect(0, 0, width, height);

    graphics.lineStyle(1, 0x5f8050, 0.45);
    for (let x = 0; x <= width; x += tilemap.tileWidth) {
      graphics.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += tilemap.tileHeight) {
      graphics.lineBetween(0, y, width, y);
    }

    graphics.fillStyle(0x8a6a4f, 1);
    graphics.fillRect(0, 0, width, tilemap.tileHeight);
    graphics.fillRect(0, height - tilemap.tileHeight, width, tilemap.tileHeight);
    graphics.fillRect(0, 0, tilemap.tileWidth, height);
    graphics.fillRect(width - tilemap.tileWidth, 0, tilemap.tileWidth, height);
  }

  private createPlayer(): void {
    const mapJson = this.getMapJson();
    const spawn = getPointObject(mapJson, 'Spawns', this.registry.get('spawnId') as string);

    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'player-temp');
    this.player.setDepth(10);
    this.player.setCollideWorldBounds(true);
    this.player.body?.setSize(36, 32);
    this.player.body?.setOffset(30, 86);

    if (this.walls) {
      this.physics.add.collider(this.player, this.walls);
    }

    this.controller = new PlayerController(this, this.player);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
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
    this.add
      .rectangle(object.x, object.y, object.width, object.height, color, 0.22)
      .setOrigin(0, 0)
      .setStrokeStyle(3, color, 0.85)
      .setDepth(4);

    this.add
      .text(object.x + 8, object.y + 8, label, {
        color: '#1b1f1f',
        backgroundColor: '#fff7e8',
        padding: { x: 8, y: 5 },
        fontSize: '14px',
        fontStyle: '700',
        wordWrap: { width: Math.max(96, object.width - 16) },
      })
      .setDepth(5);
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
