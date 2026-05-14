export interface LetterModalOptions {
  readonly speaker?: string;
  readonly text: string;
  readonly actionLabel?: string;
  readonly onAction: () => void;
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
