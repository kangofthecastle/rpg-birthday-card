import type Phaser from 'phaser';

// Keeps #viewport-frame exactly aligned to the letterboxed canvas box so all DOM
// UI (mounted inside it) composes within the game frame rather than the window.
// Under Scale.FIT the canvas is CSS-sized + centered by Phaser; we mirror that
// rect onto the frame on every layout change (window resize, scale resize, and
// any canvas size change caught by a ResizeObserver).
export function syncViewportFrame(game: Phaser.Game): void {
  const frame = document.querySelector<HTMLElement>('#viewport-frame');
  const app = document.querySelector<HTMLElement>('#app');

  if (!frame || !app) {
    return;
  }

  const apply = (): void => {
    const canvas = game.canvas;

    if (!canvas) {
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const appRect = app.getBoundingClientRect();

    if (canvasRect.width === 0 || canvasRect.height === 0) {
      return;
    }

    frame.style.left = `${Math.round(canvasRect.left - appRect.left)}px`;
    frame.style.top = `${Math.round(canvasRect.top - appRect.top)}px`;
    frame.style.width = `${Math.round(canvasRect.width)}px`;
    frame.style.height = `${Math.round(canvasRect.height)}px`;
  };

  // Phaser mutates the canvas size on the next tick after a resize event, so
  // defer the read to the following frame to catch the settled layout.
  const schedule = (): void => {
    requestAnimationFrame(apply);
  };

  window.addEventListener('resize', schedule);
  game.scale.on('resize', schedule);

  game.events.once('ready', () => {
    apply();

    if (typeof ResizeObserver !== 'undefined' && game.canvas) {
      new ResizeObserver(schedule).observe(game.canvas);
    }
  });

  schedule();
}
