import type { DialogueLine } from '../content/types';
import { getUiRoot } from './domRoot';

interface ActiveDialogue {
  readonly host: HTMLElement;
  readonly resolve: () => void;
}

let activeDialogue: ActiveDialogue | undefined;

export function showDialogue(lines: readonly DialogueLine[]): Promise<void> {
  activeDialogue?.resolve();
  activeDialogue?.host.remove();
  activeDialogue = undefined;

  return new Promise((resolve) => {
    const host = getDialogueHost();
    let index = 0;

    const complete = () => {
      if (activeDialogue?.host === host) {
        activeDialogue = undefined;
      }

      host.remove();
      resolve();
    };

    activeDialogue = {
      host,
      resolve: complete,
    };

    const render = () => {
      const line = lines[index];

      if (!line) {
        complete();
        return;
      }

      host.replaceChildren(createDialogueBox(line, () => {
        index += 1;

        if (index >= lines.length) {
          complete();
          return;
        }

        render();
      }));
    };

    render();
  });
}

function getDialogueHost(): HTMLElement {
  const root = getUiRoot();
  const existingHost = root.querySelector<HTMLElement>('[data-ui-layer="dialogue"]');

  if (existingHost) {
    existingHost.replaceChildren();
    return existingHost;
  }

  const host = document.createElement('div');
  host.dataset.uiLayer = 'dialogue';
  root.append(host);
  return host;
}

function createDialogueBox(line: DialogueLine, onNext: () => void): HTMLElement {
  const box = document.createElement('section');
  box.className = 'dialogue-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-live', 'polite');

  if (line.speaker) {
    const speaker = document.createElement('strong');
    speaker.className = 'dialogue-box__speaker';
    speaker.textContent = line.speaker;
    box.append(speaker);
  }

  const text = document.createElement('p');
  text.textContent = line.text;
  box.append(text);

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'dialogue-box__next';
  next.textContent = 'Continue';
  next.addEventListener('click', onNext);
  box.append(next);

  return box;
}
