import Phaser from 'phaser';

export function createTempTextures(scene: Phaser.Scene): void {
  createFloorTile(scene);
  createWallTile(scene);
  createPlayer(scene);
}

function createFloorTile(scene: Phaser.Scene): void {
  if (scene.textures.exists('tile-floor')) {
    return;
  }

  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(0x86a86b, 1);
  graphics.fillRect(0, 0, 64, 64);
  graphics.fillStyle(0x9dbd82, 1);
  graphics.fillRect(0, 0, 32, 32);
  graphics.fillRect(32, 32, 32, 32);
  graphics.lineStyle(1, 0x6f8f58, 0.55);
  graphics.lineBetween(0, 0, 64, 0);
  graphics.lineBetween(0, 32, 64, 32);
  graphics.lineBetween(0, 63, 64, 63);
  graphics.lineBetween(0, 0, 0, 64);
  graphics.lineBetween(32, 0, 32, 64);
  graphics.lineBetween(63, 0, 63, 64);
  graphics.fillStyle(0xf1d79a, 0.75);
  graphics.fillCircle(12, 48, 3);
  graphics.fillCircle(52, 18, 2);
  graphics.generateTexture('tile-floor', 64, 64);
  graphics.destroy();
}

function createWallTile(scene: Phaser.Scene): void {
  if (scene.textures.exists('tile-wall')) {
    return;
  }

  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(0x8a6a4f, 1);
  graphics.fillRect(0, 0, 64, 64);
  graphics.fillStyle(0xa47c58, 1);
  graphics.fillRect(0, 0, 64, 20);
  graphics.fillRect(0, 42, 64, 22);
  graphics.lineStyle(2, 0x543c30, 0.7);
  graphics.strokeRect(1, 1, 62, 62);
  graphics.lineBetween(0, 21, 64, 21);
  graphics.lineBetween(0, 42, 64, 42);
  graphics.generateTexture('tile-wall', 64, 64);
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
