import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BOOT_LINES, runBootScreen } from '../../src/ui/bootScreen';

function pressKey(key = 'Enter'): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key }));
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
    expect(DEFAULT_BOOT_LINES).toContain('FOR RECIPIENT — v1.0');
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
    await promise;

    expect(overlay()).toBeNull();
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
});
