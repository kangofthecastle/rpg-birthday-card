import { beforeEach, describe, expect, it } from 'vitest';
import { isMuted, setMuted } from '../../src/game/audio';
import { createMuteButton, mountMuteButton } from '../../src/ui/muteButton';

beforeEach(() => {
  document.body.innerHTML = '';
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  setMuted(false);
});

describe('mute button', () => {
  it('reflects the current mute state and toggles audio on click', () => {
    const button = createMuteButton();

    expect(isMuted()).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Mute audio');
    expect(button.classList.contains('mute-button--muted')).toBe(false);

    button.click();

    expect(isMuted()).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Unmute audio');
    expect(button.classList.contains('mute-button--muted')).toBe(true);

    button.click();

    expect(isMuted()).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('starts muted when the persisted preference is muted', () => {
    setMuted(true);
    const button = createMuteButton();

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.classList.contains('mute-button--muted')).toBe(true);
  });

  it('mounts a single instance onto the host', () => {
    const first = mountMuteButton(document.body);
    const second = mountMuteButton(document.body);

    expect(first).toBe(second);
    expect(document.body.querySelectorAll('.mute-button')).toHaveLength(1);
  });
});
