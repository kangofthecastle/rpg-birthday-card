/**
 * Cold-open boot overlay. A DOM-only "old PC booting" sequence that plays over
 * a black page before the Phaser game is created. Lines type out with a
 * typewriter effect; any key or a left-click fast-forwards the line currently
 * typing; once every line is shown a "press any key" gate waits for one final
 * key or click, then a CRT power-on flash reveals the game. The one exception is
 * `/`, which opens the unobtrusive password prompt for card mode.
 *
 * Reused later by the post-ending letters screen (Phase 3).
 */
import { initAudio, playSfx } from '../game/audio';

export const DEFAULT_BOOT_LINES: readonly string[] = [
  'FOR RECIPIENT — v1.72',
  'loading: one small world..........ok',
  'loading: bad jokes................ok',
  'warning: contents may cause smiling',
];

export interface BootScreenOptions {
  readonly lines?: readonly string[];
  readonly host?: HTMLElement;
  readonly typeDelayMs?: number;
  readonly flashMs?: number;
  readonly promptLabel?: string;
}

export type BootLaunchMode = 'story' | 'cards';

export interface BootScreenResult {
  readonly mode: BootLaunchMode;
}

type Phase = 'typing' | 'prompt' | 'command' | 'password' | 'done';

const PASSWORD_COMMAND = '/password';
const CARD_MODE_PASSWORD = 'pewpew';

export function runBootScreen(options: BootScreenOptions = {}): Promise<BootScreenResult> {
  const lines = options.lines ?? DEFAULT_BOOT_LINES;
  const typeDelayMs = options.typeDelayMs ?? 40;
  const flashMs = options.flashMs ?? 260;
  const promptLabel = options.promptLabel ?? 'press any key';
  const host = options.host ?? document.body;

  const {
    overlay,
    textNode,
    cursorEl,
    completionEl,
    tabHintEl,
    promptEl,
  } = createBootScreenDom();
  host.append(overlay);

  return new Promise<BootScreenResult>((resolve) => {
    let lineIndex = 0;
    let charIndex = 0;
    let phase: Phase = 'typing';
    let commandInput = '';
    let passwordInput = '';
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

      // Write into the dedicated text node, not textContent: the caret is an
      // inline child of the <pre> (so it shares the text's line box) and must
      // survive each re-render sitting right after the last typed character.
      textNode.nodeValue = parts.join('\n');
    };

    const enterPromptPhase = (): void => {
      phase = 'prompt';
      promptEl.textContent = promptLabel;
      promptEl.hidden = false;
    };

    const bootText = (): string => lines.join('\n');

    const renderCommandInput = (): void => {
      textNode.nodeValue = `${bootText()}\n${commandInput}`;
      const isKnownPrefix = PASSWORD_COMMAND.startsWith(commandInput);
      const showSuggestion =
        isKnownPrefix && commandInput.length > 1 && commandInput !== PASSWORD_COMMAND;
      completionEl.textContent = showSuggestion
        ? PASSWORD_COMMAND.slice(commandInput.length)
        : '';
      completionEl.hidden = !showSuggestion;
      tabHintEl.hidden = completionEl.hidden;
    };

    const renderPasswordInput = (): void => {
      textNode.nodeValue = `${bootText()}\n${PASSWORD_COMMAND}\npassword: ${passwordInput}`;
      completionEl.hidden = true;
      tabHintEl.hidden = true;
    };

    const enterCommandPhase = (): void => {
      phase = 'command';
      promptEl.hidden = true;
      commandInput = '/';
      renderCommandInput();
    };

    const enterPasswordPhase = (): void => {
      phase = 'password';
      commandInput = PASSWORD_COMMAND;
      passwordInput = '';
      renderPasswordInput();
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

    const finish = (mode: BootLaunchMode): void => {
      if (phase === 'done') {
        return;
      }

      phase = 'done';
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      clearTimer();
      cursorEl.hidden = true;
      overlay.classList.add('boot-screen--flash');
      timer = setTimeout(() => {
        overlay.remove();
        resolve({ mode });
      }, flashMs);
    };

    const acknowledgeKey = (): void => {
      // A key is a user gesture, so this is the earliest safe moment to arm
      // WebAudio (autoplay policy).
      initAudio();
      playSfx('sfx-boot-key');
    };

    // Any key or a left-click advances the boot sequence: while typing it
    // fast-forwards the current line; at the final "press any key" gate it
    // dismisses the prompt and reveals the game.
    const advanceBoot = (): void => {
      acknowledgeKey();

      if (phase === 'typing') {
        clearTimer();
        charIndex = lines[lineIndex].length;
        renderLines();
        advanceToNextLine();
        return;
      }

      if (phase === 'prompt') {
        finish('story');
      }
    };

    const handleCommandKey = (event: KeyboardEvent): void => {
      acknowledgeKey();

      if (
        event.key === 'Tab' &&
        commandInput.length > 1 &&
        PASSWORD_COMMAND.startsWith(commandInput)
      ) {
        enterPasswordPhase();
        return;
      }

      if (event.key === 'Backspace') {
        // Keep the leading slash in place: it is the deliberate entrance into
        // the hidden prompt, not ordinary console text.
        commandInput = commandInput.length > 1 ? commandInput.slice(0, -1) : '/';
        renderCommandInput();
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      commandInput += event.key;
      if (commandInput === PASSWORD_COMMAND) {
        enterPasswordPhase();
        return;
      }
      renderCommandInput();
    };

    const handlePasswordKey = (event: KeyboardEvent): void => {
      acknowledgeKey();

      if (event.key === 'Backspace') {
        passwordInput = passwordInput.slice(0, -1);
        renderPasswordInput();
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      passwordInput += event.key;
      renderPasswordInput();
      if (passwordInput === CARD_MODE_PASSWORD) {
        finish('cards');
      }
    };

    function onKeyDown(event: KeyboardEvent): void {
      if (event.repeat) {
        return;
      }

      event.preventDefault();
      if (phase === 'prompt' && event.key === '/') {
        acknowledgeKey();
        enterCommandPhase();
        return;
      }
      if (phase === 'command') {
        handleCommandKey(event);
        return;
      }
      if (phase === 'password') {
        handlePasswordKey(event);
        return;
      }
      advanceBoot();
    }

    function onPointerDown(event: PointerEvent): void {
      // Left button only; button 0 also covers trackpad taps and touch.
      if (event.button !== 0) {
        return;
      }

      advanceBoot();
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);

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
  readonly textNode: Text;
  readonly cursorEl: HTMLElement;
  readonly completionEl: HTMLElement;
  readonly tabHintEl: HTMLElement;
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

  // The typed text lives in its own node so the caret can be an inline sibling
  // that trails the last character and shares its line box.
  const textNode = document.createTextNode('');

  const cursorEl = document.createElement('span');
  cursorEl.className = 'boot-screen__cursor';
  cursorEl.setAttribute('aria-hidden', 'true');

  const completionEl = document.createElement('span');
  completionEl.className = 'boot-screen__completion';
  completionEl.setAttribute('aria-hidden', 'true');
  completionEl.hidden = true;

  const tabHintEl = document.createElement('span');
  tabHintEl.className = 'boot-screen__tab-hint';
  tabHintEl.dataset.symbol = '⇥';
  tabHintEl.setAttribute('aria-label', 'Press Tab to complete');
  tabHintEl.hidden = true;

  const promptEl = document.createElement('p');
  promptEl.className = 'boot-screen__prompt';
  promptEl.hidden = true;

  linesEl.append(textNode, cursorEl, completionEl, tabHintEl);
  console_.append(linesEl);
  crt.append(console_, promptEl);
  overlay.append(crt);

  return {
    overlay,
    linesEl,
    textNode,
    cursorEl,
    completionEl,
    tabHintEl,
    promptEl,
  };
}
