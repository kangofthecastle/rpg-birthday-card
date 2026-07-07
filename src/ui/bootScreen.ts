/**
 * Cold-open boot overlay. A DOM-only "old PC booting" sequence that plays over
 * a black page before the Phaser game is created. Lines type out with a
 * typewriter effect; any key fast-forwards the line currently typing; once every
 * line is shown a "press any key" gate waits for one final key, then a CRT
 * power-on flash reveals the game.
 *
 * Reused later by the post-ending letters screen (Phase 3).
 */
export const DEFAULT_BOOT_LINES: readonly string[] = [
  'FOR RECIPIENT — v1.0',
  'loading: one small world..........ok',
  'loading: everyone who loves you...ok',
  'warning: contents may cause smiling',
];

export interface BootScreenOptions {
  readonly lines?: readonly string[];
  readonly host?: HTMLElement;
  readonly typeDelayMs?: number;
  readonly flashMs?: number;
  readonly promptLabel?: string;
}

type Phase = 'typing' | 'prompt' | 'done';

export function runBootScreen(options: BootScreenOptions = {}): Promise<void> {
  const lines = options.lines ?? DEFAULT_BOOT_LINES;
  const typeDelayMs = options.typeDelayMs ?? 40;
  const flashMs = options.flashMs ?? 260;
  const promptLabel = options.promptLabel ?? 'press any key';
  const host = options.host ?? document.body;

  const { overlay, linesEl, cursorEl, promptEl } = createBootScreenDom();
  host.append(overlay);

  return new Promise<void>((resolve) => {
    let lineIndex = 0;
    let charIndex = 0;
    let phase: Phase = 'typing';
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clearTimer = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const renderLines = (): void => {
      const parts: string[] = [];

      for (let index = 0; index < lineIndex; index += 1) {
        parts.push(lines[index]);
      }

      if (lineIndex < lines.length) {
        parts.push(lines[lineIndex].slice(0, charIndex));
      }

      linesEl.textContent = parts.join('\n');
    };

    const enterPromptPhase = (): void => {
      phase = 'prompt';
      promptEl.textContent = promptLabel;
      promptEl.hidden = false;
    };

    const advanceToNextLine = (): void => {
      lineIndex += 1;
      charIndex = 0;

      if (lineIndex >= lines.length) {
        enterPromptPhase();
        return;
      }

      renderLines();
      timer = setTimeout(typeStep, typeDelayMs);
    };

    function typeStep(): void {
      timer = undefined;
      const line = lines[lineIndex];
      charIndex = Math.min(charIndex + 1, line.length);
      renderLines();

      if (charIndex >= line.length) {
        advanceToNextLine();
        return;
      }

      timer = setTimeout(typeStep, typeDelayMs);
    }

    const finish = (): void => {
      if (phase === 'done') {
        return;
      }

      phase = 'done';
      document.removeEventListener('keydown', onKeyDown);
      clearTimer();
      cursorEl.hidden = true;
      overlay.classList.add('boot-screen--flash');
      timer = setTimeout(() => {
        overlay.remove();
        resolve();
      }, flashMs);
    };

    function onKeyDown(event: KeyboardEvent): void {
      if (event.repeat) {
        return;
      }

      if (phase === 'typing') {
        event.preventDefault();
        clearTimer();
        charIndex = lines[lineIndex].length;
        renderLines();
        advanceToNextLine();
        return;
      }

      if (phase === 'prompt') {
        event.preventDefault();
        finish();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    if (lines.length === 0) {
      enterPromptPhase();
      return;
    }

    renderLines();
    timer = setTimeout(typeStep, typeDelayMs);
  });
}

interface BootScreenDom {
  readonly overlay: HTMLElement;
  readonly linesEl: HTMLElement;
  readonly cursorEl: HTMLElement;
  readonly promptEl: HTMLElement;
}

function createBootScreenDom(): BootScreenDom {
  const overlay = document.createElement('div');
  overlay.className = 'boot-screen';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Booting');

  const crt = document.createElement('div');
  crt.className = 'boot-screen__crt';

  const console_ = document.createElement('div');
  console_.className = 'boot-screen__console';

  const linesEl = document.createElement('pre');
  linesEl.className = 'boot-screen__lines';
  linesEl.setAttribute('aria-live', 'polite');

  const cursorEl = document.createElement('span');
  cursorEl.className = 'boot-screen__cursor';
  cursorEl.setAttribute('aria-hidden', 'true');

  const promptEl = document.createElement('p');
  promptEl.className = 'boot-screen__prompt';
  promptEl.hidden = true;

  console_.append(linesEl, cursorEl);
  crt.append(console_, promptEl);
  overlay.append(crt);

  return { overlay, linesEl, cursorEl, promptEl };
}
