import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLetterModal,
  createPhotoLetterModal,
  createSheetMusicModal,
  showLetterModal,
  showPhotoLetterModal,
} from '../../src/ui/letterModal';
import {
  FRIEND_TWO_BIRTHDAY_LETTER,
  FRIEND_TWO_RETAKE_NOTE,
  getFriendTwoRetakeLetter,
} from '../../src/content/letters';

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

describe('createSheetMusicModal', () => {
  it('shows the acquired score as art with an exact accessible title', () => {
    const onAction = vi.fn();
    const modal = createSheetMusicModal({
      title: 'Do You Hear the People Sing?',
      imageSrc: '/assets/activities/fold-the-letters/paper-sheetmusic.png',
      imageAlt: '____’s handwritten sheet music',
      onAction,
    });

    expect(modal.getAttribute('aria-label')).toBe('Do You Hear the People Sing?');
    expect(modal.querySelector('.sheet-music-modal__title')).toBeNull();
    const image = modal.querySelector<HTMLImageElement>('.sheet-music-modal__image');
    expect(image?.getAttribute('src')).toBe(
      '/assets/activities/fold-the-letters/paper-sheetmusic.png',
    );
    expect(image?.getAttribute('alt')).toBe('____’s handwritten sheet music');
    expect(modal.querySelector('.letter-modal__text')).toBeNull();
    expect(modal.querySelector('.sheet-music-modal__action')?.textContent).toBe('Continue');

    modal.querySelector<HTMLButtonElement>('.letter-modal__action')?.click();
    expect(onAction).toHaveBeenCalledOnce();
  });
});

describe('createPhotoLetterModal', () => {
  it('renders a blank photo-ready letter slot without fake copy', () => {
    const modal = createPhotoLetterModal({ onAction: vi.fn() });

    expect(modal.getAttribute('aria-label')).toBe('Letter');
    expect(modal.querySelector('.photo-letter-modal__photo-placeholder')).not.toBeNull();
    expect(modal.querySelector('.letter-modal__speaker')).toBeNull();
    expect(modal.querySelector('.letter-modal__text')).toBeNull();
  });

  it('opens ____’s birthday letter at its salutation without a redundant sender heading', async () => {
    const promise = showPhotoLetterModal(FRIEND_TWO_BIRTHDAY_LETTER);
    const modal = document.querySelector<HTMLElement>('.photo-letter-modal');

    expect(modal?.getAttribute('aria-label')).toBe('Letter from ____');
    expect(modal?.querySelector('.letter-modal__speaker')).toBeNull();
    expect(modal?.querySelector('.letter-modal__text')?.textContent).toMatch(
      /^Happy birthday ____!/,
    );
    expect(modal?.querySelector('.photo-letter-modal__photo')).toBeNull();
    expect(modal?.querySelector('.letter-modal__action')?.textContent).toBe('Next');

    modal?.querySelector<HTMLButtonElement>('.letter-modal__action')?.click();
    expect(modal?.querySelector('.letter-modal__text')).toBeNull();
    expect(
      modal?.querySelector<HTMLImageElement>('.photo-letter-modal__photo')?.getAttribute('src'),
    ).toBe('/assets/photos/friendtwo-cherry-blossoms.jpg');
    expect(modal?.querySelector('.photo-letter-modal__photo-caption')?.textContent).toBe(
      '',
    );
    expect(modal?.querySelector('.letter-modal__action')?.textContent).toBe('Continue');

    modal?.querySelector<HTMLButtonElement>('.letter-modal__action')?.click();
    await promise;
  });

  it('shows the RETAKE continuity line before the real letter and photograph', async () => {
    const promise = showPhotoLetterModal(getFriendTwoRetakeLetter());
    const modal = document.querySelector<HTMLElement>('.photo-letter-modal');
    const action = modal?.querySelector<HTMLButtonElement>('.letter-modal__action');

    expect(modal?.querySelector('.letter-modal__text')?.textContent).toBe(
      FRIEND_TWO_RETAKE_NOTE,
    );
    expect(modal?.querySelector('.letter-modal__speaker')).toBeNull();
    expect(action?.textContent).toBe('Next');

    action?.click();
    expect(modal?.querySelector('.letter-modal__text')?.textContent).toMatch(
      /^Happy birthday ____!/,
    );
    expect(modal?.querySelector('.photo-letter-modal__photo')).toBeNull();
    expect(action?.textContent).toBe('Next');

    action?.click();
    expect(modal?.querySelector('.letter-modal__text')).toBeNull();
    expect(modal?.querySelector('.photo-letter-modal__photo')).not.toBeNull();
    expect(action?.textContent).toBe('Continue');

    action?.click();
    await promise;
  });

  it('shows authored copy first and its photograph with caption on page two', () => {
    const onAction = vi.fn();
    const modal = createPhotoLetterModal({
      speaker: '____',
      text: 'For ____.',
      photoSrc: '/assets/photos/friendone-and-recipient.png',
      photoAlt: '____ and ____ together',
      photoCaption: 'Spring Break together.',
      photoCropTop: 10,
      onAction,
    });

    expect(modal.getAttribute('aria-label')).toBe('Letter from ____');
    expect(modal.querySelector('.letter-modal__speaker')?.textContent).toBe('____');
    expect(modal.querySelector('.letter-modal__text')?.textContent).toBe('For ____.');
    expect(modal.querySelector('.photo-letter-modal__photo')).toBeNull();
    const letterPage = modal.querySelector('.photo-letter-modal__page');

    modal.querySelector<HTMLButtonElement>('.letter-modal__action')?.click();
    expect(modal.querySelector('.photo-letter-modal__page')).not.toBe(letterPage);
    const photo = modal.querySelector<HTMLImageElement>('.photo-letter-modal__photo');
    expect(photo?.getAttribute('src')).toBe('/assets/photos/friendone-and-recipient.png');
    expect(photo?.getAttribute('alt')).toBe('____ and ____ together');
    Object.defineProperties(photo, {
      naturalWidth: { value: 1200 },
      naturalHeight: { value: 1600 },
    });
    photo?.dispatchEvent(new Event('load'));
    const photoFrame = modal.querySelector<HTMLElement>('.photo-letter-modal__photo-frame');
    expect(photoFrame?.classList.contains('photo-letter-modal__photo-frame--ready')).toBe(true);
    expect(photoFrame?.classList.contains('photo-letter-modal__photo-frame--captioned')).toBe(true);
    expect(photoFrame?.classList.contains('photo-letter-modal__photo-frame--crop-top')).toBe(true);
    expect(photoFrame?.style.getPropertyValue('--photo-crop-top')).toBe('10px');
    expect(photoFrame?.style.getPropertyValue('--photo-aspect')).toBe('0.75');
    expect(photoFrame?.style.getPropertyValue('--photo-width-px')).toBe('360px');
    expect(photoFrame?.style.getPropertyValue('--photo-width-vh')).toBe('39vh');
    expect(modal.querySelector('.photo-letter-modal__photo-caption')?.textContent).toBe(
      'Spring Break together.',
    );
    expect(modal.querySelector('.letter-modal__speaker')).toBeNull();
    expect(modal.querySelector('.letter-modal__text')).toBeNull();
    expect(onAction).not.toHaveBeenCalled();

    modal.querySelector<HTMLButtonElement>('.letter-modal__action')?.click();
    expect(onAction).toHaveBeenCalledOnce();
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

  it('does not treat clicks on the letter paper like dialogue advancement', async () => {
    const promise = showLetterModal([
      { text: 'First page.' },
      { text: 'Second page.' },
    ]);
    const root = document.querySelector<HTMLElement>('#ui-root');

    expect(root?.querySelector('.letter-modal__text')?.textContent).toBe('First page.');

    root?.querySelector<HTMLElement>('.letter-modal__text')?.click();
    expect(root?.querySelector('.letter-modal__text')?.textContent).toBe('First page.');

    root?.querySelector<HTMLButtonElement>('.letter-modal__action')?.click();
    expect(root?.querySelector('.letter-modal__text')?.textContent).toBe('Second page.');

    root?.querySelector<HTMLElement>('.letter-modal')?.click();
    expect(root?.querySelector('.letter-modal__text')?.textContent).toBe('Second page.');

    root?.querySelector<HTMLButtonElement>('.letter-modal__action')?.click();
    await promise;
    expect(root?.querySelector('[data-ui-layer="letter"]')).toBeNull();
  });
});
