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
  it('renders one letter icon per entry with from-name labels', () => {
    showLettersScreen({ letters: LETTERS, openLetter: () => Promise.resolve() });

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

    expect(openLetter).toHaveBeenCalledWith([{ speaker: '____', text: 'first' }]);
    expect(first?.classList.contains('letters-screen__letter--read')).toBe(true);
    // Not all read yet — the quiet line stays hidden.
    expect(document.querySelector('.letters-screen__birthday')?.hasAttribute('hidden')).toBe(true);
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

  it('reveals a "go home" affordance once all letters are read and calls back', async () => {
    const onGoHome = vi.fn();
    showLettersScreen({ letters: LETTERS, openLetter: () => Promise.resolve(), onGoHome });

    const goHome = document.querySelector<HTMLButtonElement>('.letters-screen__go-home');
    expect(goHome).not.toBeNull();
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

  it('omits the "go home" affordance when no handler is provided', async () => {
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
