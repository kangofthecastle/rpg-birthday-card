import Phaser from 'phaser';
import { initAudio } from './game/audio';
import { createGameConfig } from './game/gameConfig';
import { runBootScreen } from './ui/bootScreen';
import { mountMuteButton } from './ui/muteButton';
import { syncViewportFrame } from './ui/viewportFrame';
import './styles.css';

// Fallback for paths that skip the boot overlay (testMode): arm WebAudio on
// the first user gesture of any kind.
document.addEventListener('keydown', () => initAudio(), { once: true });
document.addEventListener('pointerdown', () => initAudio(), { once: true });

// A persistent top-right mute toggle, mounted inside the viewport frame (a
// sibling of #ui-root, so the scene changes that clear #ui-root leave it be) so
// it anchors to the game frame's corner rather than the window's. It sits under
// the z-1000 boot overlay, so it reveals itself once the cold-open finishes.
mountMuteButton(document.querySelector<HTMLElement>('#viewport-frame') ?? document.body);

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

  const game = new Phaser.Game(createGameConfig(gameRoot));
  syncViewportFrame(game);
  // Dev-only handle so tooling (and the dressEdit drive) can introspect the
  // running game — e.g. locate a prop's on-screen bounds to click it. Stripped
  // from production builds.
  if (import.meta.env.DEV) {
    (window as unknown as { __game?: Phaser.Game }).__game = game;
  }
}

void bootGame();
