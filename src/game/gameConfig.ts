import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { LocationScene } from '../scenes/LocationScene';

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: 1280,
    height: 720,
    backgroundColor: '#1f2a2a',
    pixelArt: true,
    scale: {
      // Fit smaller windows, but stop enlarging at 125% of the authored size.
      // Phaser owns both sizing and centering so input coordinates and the
      // viewport-aligned DOM UI stay correct, including in fullscreen.
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      max: { width: 1600, height: 900 },
    },
    physics: {
      default: 'arcade',
      arcade: {
        debug: false,
      },
    },
    scene: [BootScene, LocationScene],
  };
}
