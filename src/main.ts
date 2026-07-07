import Phaser from 'phaser';
import { initAudio } from './game/audio';
import { createGameConfig } from './game/gameConfig';
import { runBootScreen } from './ui/bootScreen';
import './styles.css';

// Fallback for paths that skip the boot overlay (testMode): arm WebAudio on
// the first user gesture of any kind.
document.addEventListener('keydown', () => initAudio(), { once: true });
document.addEventListener('pointerdown', () => initAudio(), { once: true });

const root = document.querySelector<HTMLDivElement>('#game-root');

if (!root) {
  throw new Error('Missing #game-root');
}

const gameRoot = root;

function isTestMode(): boolean {
  return new URLSearchParams(window.location.search).get('testMode') === '1';
}

async function bootGame(): Promise<void> {
  // testMode drives the existing smoke suite straight into a location, so the
  // cold-open overlay must be skipped entirely there.
  if (!isTestMode()) {
    await runBootScreen();
  }

  new Phaser.Game(createGameConfig(gameRoot));
}

void bootGame();
