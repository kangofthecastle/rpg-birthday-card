/**
 * Shared DOM helpers for the activity overlays (each activity mounts its own
 * DOM control strip over the room scene).
 */

/**
 * Make a button activate on Enter/Space via a capturing keydown listener that
 * preventDefaults + stopPropagation, so the room game beneath never also sees
 * the key. Mirrors the browser's native button activation but works even when
 * another Phaser game is holding global key capture.
 */
export function addKeyboardActivation(
  button: HTMLButtonElement,
  activate: () => void,
): void {
  button.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      activate();
    },
    { capture: true },
  );
}
