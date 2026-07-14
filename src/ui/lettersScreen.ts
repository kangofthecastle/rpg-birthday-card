import { LETTERS, type Letter } from '../content/letters';
import {
  allLettersRead,
  createLettersRead,
  HAPPY_BIRTHDAY_LINE,
  isLetterRead,
  markLetterRead,
  type LettersReadModel,
} from '../activities/finalKeepsake/endingModel';
import { playMusic } from '../game/audio';
import { getUiRoot } from './domRoot';
import { showLetterModal } from './letterModal';

/**
 * The post-ending letters screen. Fades from the ocean back to the cold-open
 * boot screen — but now warm and lit, covered with a letter from every entry
 * in `src/content/letters.ts`. Keyboard (arrows + Enter) and mouse both open a
 * letter via the shared letter modal; read letters get a subtle read state.
 * Once the last unread letter closes, a small quiet line fades in. The screen
 * persists — the game is over.
 *
 * Visually rhymes with `bootScreen` (same monospace/scanline language) but
 * warm instead of dark.
 */

type OpenLetter = (
  lines: readonly { speaker?: string; text: string }[],
) => Promise<void>;

export interface LettersScreenOptions {
  /** Terminal birthday screen by default; archive mode is closable. */
  readonly mode?: 'ending' | 'archive';
  /** Where to mount. Defaults to the shared UI root. */
  readonly host?: HTMLElement;
  /** Letters to show. Defaults to the paste-in `LETTERS` list. */
  readonly letters?: readonly Letter[];
  /** Injectable for tests; defaults to the shared letter modal. */
  readonly openLetter?: OpenLetter;
  /** Start faded-out and let the caller fade in. Defaults to false. */
  readonly fadeIn?: boolean;
  /** Previously read letter indexes, restored when reopening the archive. */
  readonly initialReadIndices?: readonly number[];
  /**
   * Optional quiet "go home" affordance, revealed once every letter is read.
   * When provided, a gentle button appears beside the "happy birthday" line and
   * calls this to dismiss the screen and return to ____'s room.
   */
  readonly onGoHome?: () => void;
}

export interface LettersScreenHandle {
  readonly element: HTMLElement;
  /** Resolves when a closable archive (or the ending's go-home action) dismisses. */
  readonly closed: Promise<void>;
}

export function showLettersScreen(
  options: LettersScreenOptions = {},
): LettersScreenHandle {
  const host = options.host ?? getUiRoot();
  const letters = options.letters ?? LETTERS;
  const openLetter = options.openLetter ?? ((lines) => showLetterModal(lines));
  const mode = options.mode ?? 'ending';
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  let model: LettersReadModel = (options.initialReadIndices ?? []).reduce(
    (current, index) => markLetterRead(current, index),
    createLettersRead(letters.length),
  );
  let selectedIndex = 0;
  let opening = false;

  const overlay = document.createElement('section');
  overlay.className = 'letters-screen';
  overlay.dataset.lettersMode = mode;
  overlay.classList.add(`letters-screen--${mode}`);
  if (options.fadeIn) {
    overlay.classList.add('letters-screen--enter');
  }
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', mode === 'archive' ? 'Letters archive' : 'Letters for ____');

  let archiveClosed = false;
  const closeArchive = (): void => {
    if (archiveClosed || opening) {
      return;
    }
    archiveClosed = true;
    document.removeEventListener('keydown', onArchiveKeydown, true);
    overlay.remove();
    resolveClosed();
  };
  function onArchiveKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !overlay.isConnected || opening) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    closeArchive();
  }

  const crt = document.createElement('div');
  crt.className = 'letters-screen__crt';

  if (mode === 'archive') {
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'letters-screen__close';
    closeButton.setAttribute('aria-label', 'Close the letters archive');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', closeArchive);
    overlay.append(closeButton);
    document.addEventListener('keydown', onArchiveKeydown, true);
  }

  const title = document.createElement('h1');
  title.className = 'letters-screen__title';
  title.textContent = 'FOR RECIPIENT';

  const subtitle = document.createElement('p');
  subtitle.className = 'letters-screen__subtitle';
  subtitle.textContent = 'letters from everyone who loves you';

  const grid = document.createElement('ul');
  grid.className = 'letters-screen__grid';

  const buttons: HTMLButtonElement[] = letters.map((letter, index) => {
    const item = document.createElement('li');
    item.className = 'letters-screen__item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'letters-screen__letter';
    button.dataset.letterIndex = String(index);
    button.setAttribute('aria-label', `Letter from ${letter.from}`);
    if (isLetterRead(model, index)) {
      button.classList.add('letters-screen__letter--read');
      button.setAttribute('aria-pressed', 'true');
    }

    const icon = document.createElement('span');
    icon.className = 'letters-screen__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✉';

    const from = document.createElement('span');
    from.className = 'letters-screen__from';
    from.textContent = letter.from;

    button.append(icon, from);
    button.addEventListener('click', () => {
      void open(index);
    });

    item.append(button);
    grid.append(item);
    return button;
  });

  const birthday = document.createElement('p');
  birthday.className = 'letters-screen__birthday';
  birthday.textContent = HAPPY_BIRTHDAY_LINE;
  birthday.hidden = true;

  // A quiet way back once every letter is read — the game's soft landing.
  const goHome = document.createElement('button');
  goHome.type = 'button';
  goHome.className = 'letters-screen__go-home';
  goHome.textContent = 'go home';
  goHome.hidden = true;
  if (options.onGoHome) {
    goHome.addEventListener('click', () => {
      overlay.remove();
      resolveClosed();
      options.onGoHome?.();
    });
  }

  crt.append(title, subtitle, grid, birthday, goHome);
  overlay.append(crt);

  const setSelected = (index: number): void => {
    if (buttons.length === 0) {
      return;
    }
    selectedIndex = ((index % buttons.length) + buttons.length) % buttons.length;
    buttons.forEach((button, buttonIndex) => {
      button.tabIndex = buttonIndex === selectedIndex ? 0 : -1;
    });
    buttons[selectedIndex]?.focus({ preventScroll: true });
  };

  const focusFirstUnread = (): void => {
    const nextUnread = buttons.findIndex(
      (_, index) => !isLetterRead(model, index),
    );
    setSelected(nextUnread === -1 ? selectedIndex : nextUnread);
  };

  async function open(index: number): Promise<void> {
    if (opening || index < 0 || index >= letters.length) {
      return;
    }
    opening = true;
    selectedIndex = index;

    // Note: the shared letter modal plays 'sfx-letter-open' itself (main has
    // advanced past this branch's base); no call here or it doubles up.
    const letter = letters[index];
    await openLetter([{ speaker: letter.from, text: letter.text }]);

    model = markLetterRead(model, index);
    buttons[index]?.classList.add('letters-screen__letter--read');
    buttons[index]?.setAttribute('aria-pressed', 'true');

    if (mode === 'ending' && allLettersRead(model)) {
      birthday.hidden = false;
      overlay.classList.add('letters-screen--complete');
      if (options.onGoHome) {
        goHome.hidden = false;
      }
    }

    opening = false;
    focusFirstUnread();
  }

  overlay.addEventListener('keydown', (event) => {
    if (buttons.length === 0) {
      return;
    }
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        setSelected(selectedIndex + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        setSelected(selectedIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        setSelected(0);
        break;
      case 'End':
        event.preventDefault();
        setSelected(buttons.length - 1);
        break;
      default:
        break;
    }
  });

  host.append(overlay);

  buttons.forEach((button, index) => {
    button.tabIndex = index === 0 ? 0 : -1;
  });
  // Reveal-then-focus so the entry fade can run before the caret lands.
  requestAnimationFrame(() => {
    overlay.classList.remove('letters-screen--enter');
    buttons[0]?.focus({ preventScroll: true });
  });

  playMusic('music-letters', { fadeMs: 2000 });

  return { element: overlay, closed };
}
