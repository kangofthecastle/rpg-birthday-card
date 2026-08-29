import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BOOT_LINES, runBootScreen } from '../../src/ui/bootScreen';

const CARD_PASSWORD_KEYS = 'pewpew';

function pressKey(key = 'Enter'): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

function clickPointer(button = 0): void {
  document.dispatchEvent(new MouseEvent('pointerdown', { button }));
}

function overlay(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.boot-screen');
}

function linesText(): string {
  return document.querySelector('.boot-screen__lines')?.textContent ?? '';
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('runBootScreen', () => {
  it('exposes the approved cold-open lines', () => {
    expect(DEFAULT_BOOT_LINES).toContain('FOR RECIPIENT — v1.72');
    expect(DEFAULT_BOOT_LINES.some((line) => line.includes('may cause smiling'))).toBe(true);
  });

  it('types each line out then gates on a final key press', async () => {
    const promise = runBootScreen({
      lines: ['AB', 'CD'],
      typeDelayMs: 10,
      flashMs: 20,
    });

    expect(overlay()).not.toBeNull();
    expect(document.querySelector<HTMLElement>('.boot-screen__prompt')?.hidden).toBe(true);

    // Type the whole sequence out.
    await vi.advanceTimersByTimeAsync(200);

    expect(linesText()).toBe('AB\nCD');
    const prompt = document.querySelector<HTMLElement>('.boot-screen__prompt');
    expect(prompt?.hidden).toBe(false);
    expect(prompt?.textContent).toBe('press any key');

    // The gate key triggers the flash + reveal.
    pressKey();
    expect(overlay()?.classList.contains('boot-screen--flash')).toBe(true);

    await vi.advanceTimersByTimeAsync(30);
    await expect(promise).resolves.toEqual({ mode: 'story' });

    expect(overlay()).toBeNull();
  });

  it('opens the password command instead of dismissing when slash is pressed at the gate', async () => {
    const promise = runBootScreen({ lines: ['READY'], typeDelayMs: 5, flashMs: 10 });
    await vi.advanceTimersByTimeAsync(100);

    pressKey('/');

    expect(overlay()?.classList.contains('boot-screen--flash')).toBe(false);
    expect(document.querySelector<HTMLElement>('.boot-screen__prompt')?.hidden).toBe(true);
    expect(document.querySelector('.boot-screen__completion')?.textContent).toBe('');
    expect(document.querySelector<HTMLElement>('.boot-screen__completion')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('.boot-screen__tab-hint')?.hidden).toBe(true);

    // A bare slash is only the doorway. The autocomplete appears once the
    // command is recognisable as /password.
    pressKey('Tab');
    expect(linesText()).toContain('READY\n/');
    expect(linesText()).not.toContain('/password\npassword:');

    pressKey('p');
    expect(document.querySelector<HTMLElement>('.boot-screen__completion')?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('.boot-screen__tab-hint')?.hidden).toBe(false);
    expect(
      document.querySelector<HTMLElement>('.boot-screen__tab-hint')?.dataset.symbol,
    ).toBe('⇥');
    expect(document.querySelector('.boot-screen__completion')?.textContent).toBe('assword');

    // Leave the promise settled so the test cannot leak document listeners.
    pressKey('Tab');
    for (const key of CARD_PASSWORD_KEYS) pressKey(key);
    await vi.advanceTimersByTimeAsync(20);
    await expect(promise).resolves.toEqual({ mode: 'cards' });
  });

  it('tabs the suggested command onto its own line and launches card mode for pewpew', async () => {
    const promise = runBootScreen({ lines: ['READY'], typeDelayMs: 5, flashMs: 10 });
    await vi.advanceTimersByTimeAsync(100);

    pressKey('/');
    pressKey('p');
    pressKey('Tab');

    expect(linesText()).toContain('READY\n/password\npassword: ');
    expect(document.querySelector<HTMLElement>('.boot-screen__completion')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('.boot-screen__tab-hint')?.hidden).toBe(true);

    for (const key of CARD_PASSWORD_KEYS) pressKey(key);
    expect(linesText()).toContain('password: pewpew');
    expect(overlay()?.classList.contains('boot-screen--flash')).toBe(true);

    await vi.advanceTimersByTimeAsync(20);
    await expect(promise).resolves.toEqual({ mode: 'cards' });
    expect(overlay()).toBeNull();
  });

  it('accepts the fully typed password command without requiring Tab', async () => {
    const promise = runBootScreen({ lines: ['READY'], typeDelayMs: 5, flashMs: 10 });
    await vi.advanceTimersByTimeAsync(100);

    pressKey('/');
    for (const key of 'password') pressKey(key);
    expect(linesText()).toContain('READY\n/password\npassword: ');

    for (const key of CARD_PASSWORD_KEYS) pressKey(key);
    await vi.advanceTimersByTimeAsync(20);
    await expect(promise).resolves.toEqual({ mode: 'cards' });
  });

  it('lets any key fast-forward the line that is currently typing', async () => {
    const promise = runBootScreen({
      lines: ['LONG-FIRST-LINE', 'second'],
      typeDelayMs: 40,
      flashMs: 10,
    });

    // Only a couple of characters in before we skip.
    await vi.advanceTimersByTimeAsync(80);
    expect(linesText().length).toBeLessThan('LONG-FIRST-LINE'.length);

    pressKey(' ');
    expect(linesText().startsWith('LONG-FIRST-LINE')).toBe(true);

    await vi.advanceTimersByTimeAsync(400);
    expect(linesText()).toBe('LONG-FIRST-LINE\nsecond');

    pressKey();
    await vi.advanceTimersByTimeAsync(20);
    await promise;
    expect(overlay()).toBeNull();
  });

  it('mounts into a provided host element', async () => {
    const host = document.createElement('div');
    document.body.append(host);

    const promise = runBootScreen({ lines: ['x'], host, typeDelayMs: 5, flashMs: 5 });
    await vi.advanceTimersByTimeAsync(20);

    expect(host.querySelector('.boot-screen')).not.toBeNull();

    pressKey();
    await vi.advanceTimersByTimeAsync(10);
    await promise;
    expect(host.querySelector('.boot-screen')).toBeNull();
  });

  it('lets a left-click stand in for the final gate key', async () => {
    const promise = runBootScreen({ lines: ['AB'], typeDelayMs: 10, flashMs: 20 });

    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelector<HTMLElement>('.boot-screen__prompt')?.hidden).toBe(false);

    clickPointer();
    expect(overlay()?.classList.contains('boot-screen--flash')).toBe(true);

    await vi.advanceTimersByTimeAsync(30);
    await promise;
    expect(overlay()).toBeNull();
  });

  it('lets a left-click fast-forward the line that is currently typing', async () => {
    const promise = runBootScreen({
      lines: ['LONG-FIRST-LINE', 'second'],
      typeDelayMs: 40,
      flashMs: 10,
    });

    await vi.advanceTimersByTimeAsync(80);
    expect(linesText().length).toBeLessThan('LONG-FIRST-LINE'.length);

    clickPointer();
    expect(linesText().startsWith('LONG-FIRST-LINE')).toBe(true);

    await vi.advanceTimersByTimeAsync(400);
    expect(linesText()).toBe('LONG-FIRST-LINE\nsecond');

    clickPointer();
    await vi.advanceTimersByTimeAsync(20);
    await promise;
    expect(overlay()).toBeNull();
  });

  it('ignores non-left mouse buttons at the gate', async () => {
    const promise = runBootScreen({ lines: ['AB'], typeDelayMs: 10, flashMs: 20 });

    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelector<HTMLElement>('.boot-screen__prompt')?.hidden).toBe(false);

    // A right-click (button 2) must not dismiss the gate.
    clickPointer(2);
    expect(overlay()?.classList.contains('boot-screen--flash')).toBe(false);

    // …but a left-click still does.
    clickPointer(0);
    expect(overlay()?.classList.contains('boot-screen--flash')).toBe(true);

    await vi.advanceTimersByTimeAsync(30);
    await promise;
    expect(overlay()).toBeNull();
  });
});
