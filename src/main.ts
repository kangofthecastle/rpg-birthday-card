import './styles.css';

const root = document.querySelector<HTMLDivElement>('#game-root');

if (!root) {
  throw new Error('Missing #game-root');
}

root.innerHTML = '<div class="boot-message">A-Game is booting...</div>';
