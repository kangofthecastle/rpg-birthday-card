import type { DialogueLine } from '../content/types';
import type { Letter } from '../content/letters';
import { playSfx } from '../game/audio';
import { getUiRoot } from './domRoot';

export interface LetterModalOptions {
  readonly speaker?: string;
  readonly text: string;
  readonly actionLabel?: string;
  readonly onAction: () => void;
}

export interface SheetMusicModalOptions {
  readonly title: string;
  readonly imageSrc: string;
  readonly imageAlt: string;
  readonly actionLabel?: string;
  readonly onAction: () => void;
}

export interface PhotoLetterModalOptions {
  readonly speaker?: string;
  readonly ariaLabel?: string;
  readonly prefaceText?: string;
  readonly text?: string;
  readonly photoSrc?: string;
  readonly photoAlt?: string;
  readonly photoCaption?: string;
  readonly actionLabel?: string;
  readonly onAction: () => void;
}

interface ActiveLetter {
  readonly host: HTMLElement;
  readonly resolve: () => void;
}

let activeLetter: ActiveLetter | undefined;

export function showLetterModal(lines: readonly DialogueLine[]): Promise<void> {
  closeActiveLetter();

  if (lines.length === 0) {
    return Promise.resolve();
  }

  playSfx('sfx-letter-open');

  return new Promise((resolve) => {
    const host = getLetterHost();
    let index = 0;
    let isComplete = false;

    const complete = () => {
      if (isComplete) {
        return;
      }

      isComplete = true;
      if (activeLetter?.host === host) {
        activeLetter = undefined;
      }

      host.remove();
      resolve();
    };

    const advance = () => {
      index += 1;

      if (index >= lines.length) {
        complete();
        return;
      }

      render();
    };

    activeLetter = {
      host,
      resolve: complete,
    };

    const render = () => {
      const line = lines[index];

      if (!line) {
        complete();
        return;
      }

      host.replaceChildren(
        createLetterModal({
          speaker: line.speaker,
          text: line.text,
          onAction: advance,
        }),
      );
      host.querySelector<HTMLButtonElement>('.letter-modal__action')?.focus({ preventScroll: true });
    };

    render();
  });
}

export function showSheetMusicModal(
  content: Omit<SheetMusicModalOptions, 'onAction'>,
): Promise<void> {
  closeActiveLetter();
  playSfx('sfx-letter-open');

  return new Promise((resolve) => {
    const host = getLetterHost();
    let complete = false;
    const finish = () => {
      if (complete) return;
      complete = true;
      if (activeLetter?.host === host) activeLetter = undefined;
      host.remove();
      resolve();
    };
    activeLetter = { host, resolve: finish };
    host.replaceChildren(createSheetMusicModal({ ...content, onAction: finish }));
    host.querySelector<HTMLButtonElement>('.letter-modal__action')?.focus({ preventScroll: true });
  });
}

/** Opens one of the final constellation's photo-ready letters. */
export function showPhotoLetterModal(letter: Letter): Promise<void> {
  closeActiveLetter();
  playSfx('sfx-letter-open');

  return new Promise((resolve) => {
    const host = getLetterHost();
    let complete = false;
    const finish = () => {
      if (complete) return;
      complete = true;
      if (activeLetter?.host === host) activeLetter = undefined;
      host.remove();
      resolve();
    };
    activeLetter = { host, resolve: finish };
    host.replaceChildren(
      createPhotoLetterModal({
        speaker: letter.showAuthorHeading === false ? undefined : letter.from || undefined,
        ariaLabel: letter.from ? `Letter from ${letter.from}` : 'Letter',
        prefaceText: letter.deliveryPreface,
        text: letter.text,
        photoSrc: letter.photoSrc,
        photoAlt: letter.photoAlt,
        photoCaption: letter.photoCaption,
        onAction: finish,
      }),
    );
    host.querySelector<HTMLButtonElement>('.letter-modal__action')?.focus({ preventScroll: true });
  });
}

export function createLetterModal(options: LetterModalOptions): HTMLElement {
  const modal = document.createElement('section');
  modal.className = 'letter-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-live', 'polite');

  const paper = document.createElement('div');
  paper.className = 'letter-modal__paper';

  const body = document.createElement('div');
  body.className = 'letter-modal__body';

  if (options.speaker) {
    const speaker = document.createElement('strong');
    speaker.className = 'letter-modal__speaker';
    speaker.textContent = options.speaker;
    body.append(speaker);
  }

  const text = document.createElement('p');
  text.className = 'letter-modal__text';
  text.textContent = options.text;
  body.append(text);

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'letter-modal__action';
  action.textContent = options.actionLabel ?? 'Continue';
  // Keep action clicks inside the modal. Unlike dialogue, clicking the paper
  // itself never advances or closes a letter.
  action.addEventListener('click', (event) => {
    event.stopPropagation();
    options.onAction();
  });

  paper.append(body, action);
  modal.append(paper);

  return modal;
}

export function createSheetMusicModal(options: SheetMusicModalOptions): HTMLElement {
  const modal = document.createElement('section');
  modal.className = 'letter-modal sheet-music-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', options.title);

  const paper = document.createElement('div');
  paper.className = 'letter-modal__paper sheet-music-modal__paper';

  const image = document.createElement('img');
  image.className = 'sheet-music-modal__image';
  image.src = options.imageSrc;
  image.alt = options.imageAlt;

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'letter-modal__action sheet-music-modal__action';
  action.textContent = options.actionLabel ?? 'Continue';
  action.addEventListener('click', (event) => {
    event.stopPropagation();
    options.onAction();
  });

  paper.append(image, action);
  modal.append(paper);
  return modal;
}

export function createPhotoLetterModal(options: PhotoLetterModalOptions): HTMLElement {
  const modal = document.createElement('section');
  modal.className = 'letter-modal photo-letter-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute(
    'aria-label',
    options.ariaLabel ?? (options.speaker ? `Letter from ${options.speaker}` : 'Letter'),
  );

  const paper = document.createElement('div');
  paper.className = 'letter-modal__paper photo-letter-modal__paper';

  const page = document.createElement('div');
  page.className = 'photo-letter-modal__page';
  const hasPrefacePage = Boolean(options.prefaceText);
  const hasLetterPage = Boolean(options.speaker || options.text);
  const hasPhotoPage = Boolean(options.photoSrc || options.photoCaption);
  let currentPage: 'preface' | 'letter' | 'photo' = hasPrefacePage
    ? 'preface'
    : hasLetterPage
      ? 'letter'
      : 'photo';

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'letter-modal__action photo-letter-modal__action';

  const renderPage = (): void => {
    page.replaceChildren();
    page.className = `photo-letter-modal__page photo-letter-modal__page--${currentPage}`;
    paper.dataset.photoLetterPage = currentPage;

    if (currentPage === 'preface' || currentPage === 'letter') {
      const body = document.createElement('div');
      body.className = 'letter-modal__body photo-letter-modal__body';
      if (currentPage === 'letter' && options.speaker) {
        const speaker = document.createElement('strong');
        speaker.className = 'letter-modal__speaker';
        speaker.textContent = options.speaker;
        body.append(speaker);
      }
      const pageText = currentPage === 'preface' ? options.prefaceText : options.text;
      if (pageText) {
        const text = document.createElement('p');
        text.className = 'letter-modal__text';
        text.textContent = pageText;
        body.append(text);
      }
      page.append(body);
    } else {
      const photoFrame = document.createElement('figure');
      photoFrame.className = 'photo-letter-modal__photo-frame';
      if (options.photoSrc) {
        const photo = document.createElement('img');
        photo.className = 'photo-letter-modal__photo';
        photo.src = options.photoSrc;
        photo.alt = options.photoAlt ?? '';
        const syncPhotoAspect = (): void => {
          if (photo.naturalWidth <= 0 || photo.naturalHeight <= 0) return;
          const aspect = photo.naturalWidth / photo.naturalHeight;
          photoFrame.style.setProperty(
            '--photo-aspect',
            String(aspect),
          );
          photoFrame.style.setProperty('--photo-width-px', `${480 * aspect}px`);
          photoFrame.style.setProperty('--photo-width-vh', `${52 * aspect}vh`);
          photoFrame.classList.add('photo-letter-modal__photo-frame--ready');
        };
        photo.addEventListener('load', syncPhotoAspect, { once: true });
        if (photo.complete) {
          syncPhotoAspect();
        }
        photoFrame.append(photo);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'photo-letter-modal__photo-placeholder';
        placeholder.setAttribute('role', 'img');
        placeholder.setAttribute('aria-label', 'Photo placeholder');
        photoFrame.append(placeholder);
      }
      if (options.photoCaption) {
        photoFrame.classList.add('photo-letter-modal__photo-frame--captioned');
        const caption = document.createElement('figcaption');
        caption.className = 'photo-letter-modal__photo-caption';
        caption.textContent = options.photoCaption;
        photoFrame.append(caption);
      }
      page.append(photoFrame);
    }

    const hasNextPage = currentPage === 'preface'
      ? hasLetterPage || hasPhotoPage
      : currentPage === 'letter' && hasPhotoPage;
    action.textContent = hasNextPage ? 'Next' : options.actionLabel ?? 'Continue';
  };

  action.addEventListener('click', (event) => {
    event.stopPropagation();
    if (currentPage === 'preface' && (hasLetterPage || hasPhotoPage)) {
      currentPage = hasLetterPage ? 'letter' : 'photo';
      renderPage();
      action.focus({ preventScroll: true });
      return;
    }
    if (currentPage === 'letter' && hasPhotoPage) {
      currentPage = 'photo';
      renderPage();
      action.focus({ preventScroll: true });
      return;
    }
    options.onAction();
  });

  renderPage();
  paper.append(page, action);
  modal.append(paper);
  return modal;
}

function closeActiveLetter(): void {
  activeLetter?.resolve();
  activeLetter = undefined;
}

function getLetterHost(): HTMLElement {
  const root = getUiRoot();
  const existingHost = root.querySelector<HTMLElement>('[data-ui-layer="letter"]');

  if (existingHost) {
    existingHost.replaceChildren();
    return existingHost;
  }

  const host = document.createElement('div');
  host.dataset.uiLayer = 'letter';
  root.append(host);
  return host;
}
