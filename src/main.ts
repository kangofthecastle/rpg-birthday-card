import Phaser from 'phaser';
import { createGameConfig } from './game/gameConfig';
import { runBootScreen } from './ui/bootScreen';
import './styles.css';

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
