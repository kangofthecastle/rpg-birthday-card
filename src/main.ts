import Phaser from 'phaser';
import { createGameConfig } from './game/gameConfig';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#game-root');

if (!root) {
  throw new Error('Missing #game-root');
}

new Phaser.Game(createGameConfig(root));
