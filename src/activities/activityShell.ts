/**
 * Shared chrome for the four minigame activities (fishing, RETAKE.EXE, the
 * violin piece, Boatigami). Every activity now wears the SAME shell: a title at
 * the top-left, a standard-size viewport, a single muted controls strip beneath
 * it, and a standard X close button pinned to the top-right corner.
 *
 * The close button follows the repo's file-first drop-in convention: it renders
 * a clean procedural X immediately (a rounded-square button with an X), then
 * probes an optional per-game PNG and swaps it in ONLY once it has fully
 * decoded — so themed art is a zero-code drop-in and the game always works with
 * no art at all. Drop-in slots (square PNG, transparent, ~128x128 recommended):
 *   /assets/activities/friendone-fishing/close-x.png
 *   /assets/activities/valorant-split/close-x.png
 *   /assets/activities/violin/close-x.png
 *   /assets/activities/fold-the-letters/close-x.png
 */
import { isImageUrl } from '../game/assetProbe';
import { addKeyboardActivation } from './activityDom';

// Procedural fallback: a rounded-square button carrying a crisp X. Drawn in the
// warm parchment accent (#f1d79a) that frames every activity panel.
const CLOSE_X_SVG =
  '<svg class="activity-close__icon" viewBox="0 0 44 44" width="44" height="44" ' +
  'aria-hidden="true" focusable="false">' +
  '<rect x="2.5" y="2.5" width="39" height="39" rx="11" ' +
  'fill="rgba(18,20,24,0.72)" stroke="#f1d79a" stroke-width="2.5" />' +
  '<path d="M15 15 L29 29 M29 15 L15 29" fill="none" stroke="#f1d79a" ' +
  'stroke-width="3.4" stroke-linecap="round" />' +
  '</svg>';

/**
 * Builds the standard X close button. `onClose` is what Cancel used to do — the
 * exact same safe teardown. `dataAttr` is the legacy `data-*-cancel` hook each
 * activity's tests/smokes still target, kept so the button IS the old Cancel in
 * every way but its look and position. `artUrl` is the optional themed PNG.
 */
export function createActivityCloseButton(options: {
  onClose: () => void;
  dataAttr: string;
  artUrl: string;
}): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'activity-close';
  button.setAttribute('aria-label', 'Close');
  button.title = 'Close';
  button.setAttribute(options.dataAttr, '');
  button.innerHTML = CLOSE_X_SVG;

  button.addEventListener('click', options.onClose, { once: true });
  addKeyboardActivation(button, options.onClose);

  // File-first: swap the procedural X for themed art only when it is present and
  // has fully decoded (COMPLETE), so a 404 or half-loaded image never flashes.
  void isImageUrl(options.artUrl).then((ok) => {
    if (!ok) {
      return;
    }
    const img = new Image();
    img.alt = '';
    img.className = 'activity-close__art';
    img.addEventListener('load', () => {
      if (img.complete && img.naturalWidth > 0) {
        button.innerHTML = '';
        button.append(img);
        button.classList.add('activity-close--art');
      }
    });
    img.src = options.artUrl;
  });

  return button;
}
