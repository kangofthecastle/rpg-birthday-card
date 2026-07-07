import type { DialogueLine } from '../content/types';
import { playSfx } from '../game/audio';
import { getUiRoot } from './domRoot';

export interface LetterModalOptions {
  readonly speaker?: string;
  readonly text: string;
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
  action.addEventListener('click', options.onAction);

  paper.append(body, action);
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
