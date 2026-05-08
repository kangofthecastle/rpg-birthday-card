import Phaser from 'phaser';

export function createTempTextures(scene: Phaser.Scene): void {
  createTile(scene, 'tile-floor', 0x4d6f52, 0x6f8a63);
  createTile(scene, 'tile-wall', 0x604c3f, 0x8a6a4f);
  createPlayer(scene);
}

function createTile(
  scene: Phaser.Scene,
  key: string,
  baseColor: number,
  accentColor: number,
): void {
  if (scene.textures.exists(key)) {
    return;
  }

  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(baseColor, 1);
  graphics.fillRect(0, 0, 64, 64);
  graphics.lineStyle(2, accentColor, 1);
  graphics.strokeRect(1, 1, 62, 62);
  graphics.generateTexture(key, 64, 64);
  graphics.destroy();
}

function createPlayer(scene: Phaser.Scene): void {
  if (scene.textures.exists('player-temp')) {
    return;
  }

  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(0x2f4550, 1);
  graphics.fillRoundedRect(26, 20, 44, 78, 12);
  graphics.fillStyle(0xf2c9a0, 1);
  graphics.fillCircle(48, 28, 18);
  graphics.lineStyle(3, 0xf1d79a, 1);
  graphics.strokeRoundedRect(26, 20, 44, 78, 12);
  graphics.generateTexture('player-temp', 96, 128);
  graphics.destroy();
}
