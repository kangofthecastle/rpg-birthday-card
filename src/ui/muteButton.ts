// A small, always-visible mute toggle pinned to the top-right corner. Wired to
// the audio manager's persisted mute state (see game/audio.ts), so the choice
// survives reloads and is honoured even before the AudioContext is armed.
import { initAudio, isMuted, toggleMuted } from '../game/audio';

const SPEAKER = '<path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" />';
const WAVES =
  '<path d="M16 8.6a4.2 4.2 0 0 1 0 6.8M18.8 6a7.6 7.6 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />';
const CROSS =
  '<path d="M16.5 9.5l6 5M22.5 9.5l-6 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />';

function iconSvg(muted: boolean): string {
  return (
    '<svg class="mute-button__icon" viewBox="0 0 24 24" width="22" height="22" ' +
    `aria-hidden="true" focusable="false">${SPEAKER}${muted ? CROSS : WAVES}</svg>`
  );
}

/** Builds a mute-toggle button already synced to the current audio state. */
export function createMuteButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mute-button';

  const sync = (): void => {
    const muted = isMuted();
    button.classList.toggle('mute-button--muted', muted);
    button.setAttribute('aria-pressed', String(muted));
    button.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
    button.title = muted ? 'Unmute' : 'Mute';
    button.innerHTML = iconSvg(muted);
  };

  button.addEventListener('click', () => {
    // The click is a user gesture, so arm WebAudio here in case a testMode path
    // skipped the boot screen; the toggle then takes effect immediately.
    initAudio();
    toggleMuted();
    sync();
  });

  sync();
  return button;
}

/** Mounts the mute button once onto `host` (defaults to <body> so it persists
 * across the scene changes that clear #ui-root). Returns the existing button if
 * one is already mounted. */
export function mountMuteButton(host: HTMLElement = document.body): HTMLButtonElement {
  const existing = host.querySelector<HTMLButtonElement>('.mute-button');
  if (existing) {
    return existing;
  }

  const button = createMuteButton();
  host.append(button);
  return button;
}
