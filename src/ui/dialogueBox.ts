import type { DialogueLine } from '../content/types';
import { getUiRoot } from './domRoot';

interface ActiveDialogue {
  readonly host: HTMLElement;
  readonly resolve: () => void;
  readonly cleanup: () => void;
}

const PORTRAIT_URL_BY_ID: Readonly<Record<string, string>> = {
  'character-recipient-walk-8dir': '/assets/sprites/characters/recipient-idle-walk-8dir-v1-alpha.png',
  'character-friendthree-walk-4dir': '/assets/sprites/characters/friendthree-walk-4dir-v1-alpha.png',
  'character-friendone-walk-4dir': '/assets/sprites/characters/friendone-walk-4dir-v2-alpha.png',
  'portrait-friendthree': '/assets/sprites/characters/friendthree-walk-4dir-v1-alpha.png',
  'portrait-friendone': '/assets/sprites/characters/friendone-idle-walk-4dir-v1-alpha.png',
  'portrait-friend-b': '/assets/sprites/characters/friendtwo-idle-walk-4dir-v1-alpha.png',
};

let activeDialogue: ActiveDialogue | undefined;

export function showDialogue(lines: readonly DialogueLine[]): Promise<void> {
  closeActiveDialogue();

  if (lines.length === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const host = getDialogueHost();
    let index = 0;
    let isComplete = false;

    const complete = () => {
      if (isComplete) {
        return;
      }

      isComplete = true;
      activeDialogue?.cleanup();

      if (activeDialogue?.host === host) {
        activeDialogue = undefined;
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) {
        return;
      }

      event.preventDefault();
      advance();
    };

    activeDialogue = {
      host,
      resolve: complete,
      cleanup: () => document.removeEventListener('keydown', handleKeyDown),
    };

    const render = () => {
      const line = lines[index];

      if (!line) {
        complete();
        return;
      }

      host.replaceChildren(createDialogueBox(line, advance));
      host.querySelector<HTMLButtonElement>('.dialogue-box__action')?.focus({ preventScroll: true });
    };

    document.addEventListener('keydown', handleKeyDown);
    render();
  });
}

function closeActiveDialogue(): void {
  activeDialogue?.resolve();
  activeDialogue = undefined;
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

  const portraitFrame = document.createElement('div');
  portraitFrame.className = 'dialogue-box__portrait-frame';

  const portraitUrl = line.portraitId ? PORTRAIT_URL_BY_ID[line.portraitId] : undefined;
  if (portraitUrl) {
    const portrait = document.createElement('img');
    portrait.className = 'dialogue-box__portrait';
    portrait.src = portraitUrl;
    portrait.alt = '';
    portrait.decoding = 'async';
    portraitFrame.append(portrait);
  } else {
    portraitFrame.classList.add('dialogue-box__portrait-frame--empty');
  }

  const content = document.createElement('div');
  content.className = 'dialogue-box__content';

  if (line.speaker) {
    const speaker = document.createElement('strong');
    speaker.className = 'dialogue-box__speaker';
    speaker.textContent = line.speaker;
    content.append(speaker);
  }

  const text = document.createElement('p');
  text.className = 'dialogue-box__text';
  text.textContent = line.text;
  content.append(text);

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'dialogue-box__action';
  action.textContent = 'Continue';
  action.addEventListener('click', onNext);
  content.append(action);

  box.append(portraitFrame, content);

  return box;
}
