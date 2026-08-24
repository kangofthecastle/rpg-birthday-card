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
  readonly text?: string;
  readonly photoSrc?: string;
  readonly photoAlt?: string;
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
      host.removeEventListener('click', handleClick);

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

    // A left-click anywhere on the letter advances it too, not just the
    // Continue button.
    const handleClick = () => {
      advance();
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

    host.addEventListener('click', handleClick);
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
        speaker: letter.from || undefined,
        text: letter.text,
        photoSrc: letter.photoSrc,
        photoAlt: letter.photoAlt,
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
  // The letter host advances on any click; keep the button's own click from
  // bubbling so it advances exactly once.
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
  modal.setAttribute('aria-label', options.speaker ? `Letter from ${options.speaker}` : 'Letter');

  const paper = document.createElement('div');
  paper.className = 'letter-modal__paper photo-letter-modal__paper';

  const photoFrame = document.createElement('figure');
  photoFrame.className = 'photo-letter-modal__photo-frame';
  if (options.photoSrc) {
    const photo = document.createElement('img');
    photo.className = 'photo-letter-modal__photo';
    photo.src = options.photoSrc;
    photo.alt = options.photoAlt ?? '';
    photoFrame.append(photo);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'photo-letter-modal__photo-placeholder';
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', 'Photo placeholder');
    photoFrame.append(placeholder);
  }
  paper.append(photoFrame);

  if (options.speaker || options.text) {
    const body = document.createElement('div');
    body.className = 'letter-modal__body photo-letter-modal__body';
    if (options.speaker) {
      const speaker = document.createElement('strong');
      speaker.className = 'letter-modal__speaker';
      speaker.textContent = options.speaker;
      body.append(speaker);
    }
    if (options.text) {
      const text = document.createElement('p');
      text.className = 'letter-modal__text';
      text.textContent = options.text;
      body.append(text);
    }
    paper.append(body);
  }

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'letter-modal__action photo-letter-modal__action';
  action.textContent = options.actionLabel ?? 'Continue';
  action.addEventListener('click', (event) => {
    event.stopPropagation();
    options.onAction();
  });

  paper.append(action);
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
