import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showLettersScreen } from '../../src/ui/lettersScreen';
import type { Letter } from '../../src/content/letters';

const LETTERS: readonly Letter[] = [
  { from: '____', text: 'first' },
  { from: '____', text: 'second' },
];

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  document.body.innerHTML = '<div id="ui-root"></div>';
});

describe('showLettersScreen', () => {
  it('archive mode exposes a close button and resolves when dismissed', async () => {
    const handle = showLettersScreen({
      mode: 'archive',
      letters: LETTERS,
      openLetter: () => Promise.resolve(),
    });

    const close = document.querySelector<HTMLButtonElement>('.letters-screen__close');
    expect(handle.element.dataset.lettersMode).toBe('archive');
    expect(handle.element.getAttribute('aria-label')).toBe('Letters archive');
    expect(close?.getAttribute('aria-label')).toBe('Close the letters archive');

    close?.click();
    await handle.closed;
    expect(document.querySelector('.letters-screen')).toBeNull();
  });

  it('Escape closes archive mode without invoking the ending go-home action', async () => {
    const onGoHome = vi.fn();
    const handle = showLettersScreen({
      mode: 'archive',
      letters: LETTERS,
      openLetter: () => Promise.resolve(),
      onGoHome,
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('.letters-screen')).toBeNull();
    await handle.closed;
    expect(onGoHome).not.toHaveBeenCalled();
  });

  it('does not close the archive underneath an open letter', async () => {
    let finishLetter!: () => void;
    const handle = showLettersScreen({
      mode: 'archive',
      letters: LETTERS,
      openLetter: () =>
        new Promise<void>((resolve) => {
          finishLetter = resolve;
        }),
    });

    document.querySelector<HTMLButtonElement>('.letters-screen__letter')?.click();
    await flush();
    document.querySelector<HTMLButtonElement>('.letters-screen__close')?.click();
    expect(document.querySelector('.letters-screen')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.letters-screen')).not.toBeNull();

    finishLetter();
    await flush();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await handle.closed;
    expect(document.querySelector('.letters-screen')).toBeNull();
  });

  it('archive mode restores the supplied read state', () => {
    showLettersScreen({
      mode: 'archive',
      letters: LETTERS,
      initialReadIndices: [0],
      openLetter: () => Promise.resolve(),
    });

    const buttons = document.querySelectorAll<HTMLButtonElement>('.letters-screen__letter');
    expect(buttons[0]?.classList.contains('letters-screen__letter--read')).toBe(true);
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]?.classList.contains('letters-screen__letter--read')).toBe(false);
  });

  it('archive mode never replays the terminal birthday but keeps a working go-home exit', async () => {
    const onGoHome = vi.fn();
    const handle = showLettersScreen({
      mode: 'archive',
      letters: LETTERS,
      openLetter: () => Promise.resolve(),
      onGoHome,
    });

    expect(document.querySelector('.letters-screen__birthday')?.hasAttribute('hidden')).toBe(true);
    const goHome = document.querySelector<HTMLButtonElement>('.letters-screen__go-home');
    expect(goHome?.hasAttribute('hidden')).toBe(false);

    goHome?.click();
    await handle.closed;
    expect(onGoHome).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.letters-screen')).toBeNull();
  });

  it('renders one letter icon per entry with from-name labels', () => {
    showLettersScreen({ letters: LETTERS, openLetter: () => Promise.resolve() });

    expect(document.querySelector('.letters-screen__date')?.textContent).toBe(
      'Saturday August 29, 2026',
    );
    const buttons = document.querySelectorAll('.letters-screen__letter');
    expect(buttons).toHaveLength(2);
    expect(
      [...buttons].map((b) => b.querySelector('.letters-screen__from')?.textContent),
    ).toEqual(['____', '____']);
    expect(document.querySelector('.letters-screen__birthday')?.hasAttribute('hidden')).toBe(true);
  });

  it('opens a letter through the modal and marks it read', async () => {
    const openLetter = vi.fn(() => Promise.resolve());
    showLettersScreen({ letters: LETTERS, openLetter });

    const first = document.querySelector<HTMLButtonElement>('.letters-screen__letter');
    first?.click();
    await flush();

    expect(openLetter).toHaveBeenCalledWith([{ speaker: undefined, text: 'first' }]);
    expect(first?.classList.contains('letters-screen__letter--read')).toBe(true);
    // Not all read yet — the quiet line stays hidden.
    expect(document.querySelector('.letters-screen__birthday')?.hasAttribute('hidden')).toBe(true);
  });

  it('omits author headings from every archived letter', async () => {
    const openLetter = vi.fn(() => Promise.resolve());
    showLettersScreen({
      mode: 'archive',
      letters: [{ from: '____', text: 'Happy Birthday!' }],
      openLetter,
    });

    document.querySelector<HTMLButtonElement>('.letters-screen__letter')?.click();
    await flush();

    expect(openLetter).toHaveBeenCalledWith([
      { speaker: undefined, text: 'Happy Birthday!' },
    ]);
  });

  it('keeps photographs separate when reopening a letter from the house archive', async () => {
    const letter: Letter = {
      from: '____',
      showAuthorHeading: false,
      text: 'Happy Birthday!',
      photoSrc: '/assets/photos/friendone-spring-break.jpg',
      photoCaption: 'Spring Break together.',
    };
    const openLetter = vi.fn(() => Promise.resolve());
    showLettersScreen({
      mode: 'archive',
      letters: [letter],
      openLetter,
    });

    document.querySelector<HTMLButtonElement>('.letters-screen__letter')?.click();
    await flush();

    expect(openLetter).toHaveBeenCalledWith([
      { speaker: undefined, text: 'Happy Birthday!' },
    ]);
  });

  it('reveals "happy birthday" only after the last unread letter closes', async () => {
    showLettersScreen({ letters: LETTERS, openLetter: () => Promise.resolve() });

    const buttons = document.querySelectorAll<HTMLButtonElement>('.letters-screen__letter');
    buttons[0]?.click();
    await flush();
    expect(document.querySelector('.letters-screen__birthday')?.hasAttribute('hidden')).toBe(true);

    buttons[1]?.click();
    await flush();

    const birthday = document.querySelector('.letters-screen__birthday');
    expect(birthday?.hasAttribute('hidden')).toBe(false);
    expect(birthday?.textContent).toBe('happy birthday, recipient.');
  });

  it('reveals a "go back" affordance once all letters are read and calls back', async () => {
    const onGoHome = vi.fn();
    showLettersScreen({ letters: LETTERS, openLetter: () => Promise.resolve(), onGoHome });

    const goHome = document.querySelector<HTMLButtonElement>('.letters-screen__go-home');
    expect(goHome).not.toBeNull();
    expect(goHome?.textContent).toBe('go back');
    // Hidden until every letter is read.
    expect(goHome?.hasAttribute('hidden')).toBe(true);

    const buttons = document.querySelectorAll<HTMLButtonElement>('.letters-screen__letter');
    buttons[0]?.click();
    await flush();
    expect(goHome?.hasAttribute('hidden')).toBe(true);
    buttons[1]?.click();
    await flush();

    expect(goHome?.hasAttribute('hidden')).toBe(false);
    goHome?.click();
    expect(onGoHome).toHaveBeenCalledTimes(1);
    // The overlay is dismissed on go-home.
    expect(document.querySelector('.letters-screen')).toBeNull();
  });

  it('omits the "go back" affordance when no handler is provided', async () => {
    showLettersScreen({ letters: LETTERS, openLetter: () => Promise.resolve() });
    const buttons = document.querySelectorAll<HTMLButtonElement>('.letters-screen__letter');
    buttons[0]?.click();
    await flush();
    buttons[1]?.click();
    await flush();

    const goHome = document.querySelector<HTMLButtonElement>('.letters-screen__go-home');
    // Present in the DOM but never revealed without a handler.
    expect(goHome?.hasAttribute('hidden')).toBe(true);
  });

  it('moves selection with arrow keys', () => {
    showLettersScreen({ letters: LETTERS, openLetter: () => Promise.resolve() });

    const buttons = document.querySelectorAll<HTMLButtonElement>('.letters-screen__letter');
    buttons[0]?.focus();
    buttons[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(document.activeElement).toBe(buttons[1]);

    buttons[1]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    expect(document.activeElement).toBe(buttons[0]);
  });
});
