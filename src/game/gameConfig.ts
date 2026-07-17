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
    // Cap presentation at 60fps. On high-refresh monitors (e.g. 170Hz) the
    // uncapped loop renders motion so smoothly that the 10fps walk poses read
    // as a strobing slideshow; 60fps restores the look the game was tuned
    // against on a 60Hz display, on any panel.
    fps: {
      limit: 60,
    },
    scale: {
      // Fixed 1280x720 logical resolution, letterboxed and centered in the
      // window. FIT keeps the whole 16:9 frame visible at any window size; the
      // page background around it is the deliberate letterbox color. Per-map
      // camera zoom (see LocationScene.applyCameraBounds) then covers the frame
      // so no map is left pinned to a corner with dead-space around it.
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
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
