import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLetterModal, showLetterModal } from '../../src/ui/letterModal';

beforeEach(() => {
  document.body.innerHTML = '<div id="ui-root"><aside class="collection-panel">Keepsakes</aside></div>';
});

describe('createLetterModal', () => {
  it('renders letter content as safe text inside an accessible modal', () => {
    const onAction = vi.fn();
    const modal = createLetterModal({
      speaker: '<img src=x>',
      text: '<button>Unsafe</button>',
      actionLabel: 'Keep reading',
      onAction,
    });

    expect(modal.className).toBe('letter-modal');
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.querySelector('.letter-modal__speaker')?.textContent).toBe('<img src=x>');
    expect(modal.querySelector('.letter-modal__text')?.textContent).toBe(
      '<button>Unsafe</button>',
    );
    expect(modal.querySelector('.letter-modal img')).toBeNull();
    expect(modal.querySelector('.letter-modal__text button')).toBeNull();

    modal.querySelector<HTMLButtonElement>('.letter-modal__action')?.click();
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('omits the speaker line when one is not provided', () => {
    const modal = createLetterModal({
      text: 'Three doors are waiting.',
      onAction: vi.fn(),
    });

    expect(modal.querySelector('.letter-modal__speaker')).toBeNull();
    expect(modal.querySelector('.letter-modal__action')?.textContent).toBe('Continue');
  });
});

describe('showLetterModal', () => {
  it('renders a letter line and resolves after the action removes it', async () => {
    const promise = showLetterModal([
      {
        speaker: '____',
        text: '',
      },
    ]);

    const root = document.querySelector<HTMLElement>('#ui-root');
    expect(root?.querySelector('.collection-panel')?.textContent).toBe('Keepsakes');
    expect(root?.querySelector('[data-ui-layer="letter"]')).not.toBeNull();
    expect(root?.querySelector('.letter-modal__speaker')?.textContent).toBe('____');
    expect(root?.querySelector('.letter-modal__text')?.textContent).toBe(
      '',
    );

    root?.querySelector<HTMLButtonElement>('.letter-modal__action')?.click();
    await promise;

    expect(root?.querySelector('.collection-panel')?.textContent).toBe('Keepsakes');
    expect(root?.querySelector('[data-ui-layer="letter"]')).toBeNull();
  });

  it('advances through multiple lines before resolving', async () => {
    const promise = showLetterModal([
      { speaker: '____', text: 'First page.' },
      { speaker: '____', text: 'Second page.' },
    ]);
    const root = document.querySelector<HTMLElement>('#ui-root');

    expect(root?.querySelector('.letter-modal__speaker')?.textContent).toBe('____');
    expect(root?.querySelector('.letter-modal__text')?.textContent).toBe('First page.');

    root?.querySelector<HTMLButtonElement>('.letter-modal__action')?.click();
    expect(root?.querySelector('.letter-modal__speaker')?.textContent).toBe('____');
    expect(root?.querySelector('.letter-modal__text')?.textContent).toBe('Second page.');

    root?.querySelector<HTMLButtonElement>('.letter-modal__action')?.click();
    await promise;
    expect(root?.querySelector('[data-ui-layer="letter"]')).toBeNull();
  });

  it('resolves and clears an active letter when a new one starts', async () => {
    const first = showLetterModal([{ text: 'First letter.' }]);
    const second = showLetterModal([{ text: 'Second letter.' }]);

    await first;

    const root = document.querySelector<HTMLElement>('#ui-root');
    expect(root?.querySelector('.letter-modal__text')?.textContent).toBe('Second letter.');

    root?.querySelector<HTMLButtonElement>('.letter-modal__action')?.click();
    await second;
    expect(root?.querySelector('[data-ui-layer="letter"]')).toBeNull();
  });

  it('advances when clicking anywhere on the letter, not just the Continue button', async () => {
    const promise = showLetterModal([
      { text: 'First page.' },
      { text: 'Second page.' },
    ]);
    const root = document.querySelector<HTMLElement>('#ui-root');

    expect(root?.querySelector('.letter-modal__text')?.textContent).toBe('First page.');

    root?.querySelector<HTMLElement>('.letter-modal__text')?.click();
    expect(root?.querySelector('.letter-modal__text')?.textContent).toBe('Second page.');

    root?.querySelector<HTMLElement>('.letter-modal')?.click();
    await promise;
    expect(root?.querySelector('[data-ui-layer="letter"]')).toBeNull();
  });
});
