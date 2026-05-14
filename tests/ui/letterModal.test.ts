import { describe, expect, it, vi } from 'vitest';
import { createLetterModal } from '../../src/ui/letterModal';

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
