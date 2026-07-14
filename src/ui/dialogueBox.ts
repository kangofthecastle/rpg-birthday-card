import type { DialogueLine } from '../content/types';
import { playSfx } from '../game/audio';
import { getUiRoot } from './domRoot';

interface ActiveDialogue {
  readonly host: HTMLElement;
  readonly resolve: () => void;
  readonly cleanup: () => void;
}

const PORTRAIT_URL_BY_ID: Readonly<Record<string, string>> = {
  'character-recipient-walk-8dir': '/assets/sprites/characters/recipient-idle-walk-8dir-v1-alpha.png',
  'portrait-recipient': '/assets/portraits/portrait-recipient.png',
  'portrait-friendone': '/assets/portraits/portrait-friendone.png',
  'portrait-friend-b': '/assets/portraits/portrait-friendtwo.png',
  'portrait-friend-a': '/assets/portraits/portrait-friendone.png',
  'portrait-omen': '/assets/activities/valorant-split/omen.png',
  'inspect-signpost': '/assets/props/outdoor/signpost.png',
  'inspect-water': '/assets/tiles/shore-water.png',
  'inspect-friendone-pc': '/assets/portraits/objects/friendone-pc.png',
  'inspect-friendtwo-setup': '/assets/portraits/objects/friendtwo-setup.png',
  'inspect-violin': '/assets/portraits/objects/violin.png',
  'inspect-mango-rice': '/assets/props/singles/recipient-house-kitchen.png',
  'inspect-photo-wall': '/assets/portraits/objects/photo-wall.png',
  'inspect-bed': '/assets/props/singles/recipient-house-bed.png',
  'inspect-recipient-pc': '/assets/props/singles/recipient-house-desk.png',
};

const PORTRAIT_ID_BY_SPEAKER: Readonly<Record<string, string>> = {
  ____: 'portrait-recipient',
  ____: 'portrait-friendone',
  ____: 'portrait-friend-b',
  Omen: 'portrait-omen',
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

      playSfx('sfx-dialogue-advance');
      render();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) {
        return;
      }

      event.preventDefault();
      advance();
    };

    // A left-click anywhere on the dialogue advances it too, not just the
    // Continue button. `click` fires only for the primary button, so
    // right-clicks are ignored.
    const handleClick = () => {
      advance();
    };

    activeDialogue = {
      host,
      resolve: complete,
      cleanup: () => {
        document.removeEventListener('keydown', handleKeyDown);
        host.removeEventListener('click', handleClick);
      },
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
    host.addEventListener('click', handleClick);
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

  const portraitId = line.portraitId ??
    (line.speaker ? PORTRAIT_ID_BY_SPEAKER[line.speaker] : undefined) ??
    'portrait-recipient';
  const portraitUrl = PORTRAIT_URL_BY_ID[portraitId] ?? PORTRAIT_URL_BY_ID['portrait-recipient'];
  if (line.portraitTreatment === 'phone') {
    portraitFrame.classList.add('dialogue-box__portrait-frame--phone');
    const phone = document.createElement('div');
    phone.className = 'dialogue-box__phone';
    phone.setAttribute('aria-hidden', 'true');

    const speaker = document.createElement('span');
    speaker.className = 'dialogue-box__phone-speaker';

    const screen = document.createElement('span');
    screen.className = 'dialogue-box__phone-screen';

    const envelope = document.createElement('span');
    envelope.className = 'dialogue-box__phone-envelope';
    const mailIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mailIcon.dataset.phoneMailIcon = '';
    mailIcon.setAttribute('viewBox', '0 0 24 16');
    mailIcon.setAttribute('aria-hidden', 'true');
    mailIcon.setAttribute('focusable', 'false');
    const mailBody = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    mailBody.setAttribute('x', '1');
    mailBody.setAttribute('y', '1');
    mailBody.setAttribute('width', '22');
    mailBody.setAttribute('height', '14');
    mailBody.setAttribute('rx', '2');
    const mailFlap = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    mailFlap.setAttribute('d', 'M2 3l10 7 10-7');
    const mailFold = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    mailFold.setAttribute('d', 'M2 14l7-6m13 6l-7-6');
    mailIcon.append(mailBody, mailFlap, mailFold);
    envelope.append(mailIcon);

    const messageMark = document.createElement('span');
    messageMark.className = 'dialogue-box__phone-message-mark';

    const status = document.createElement('span');
    status.className = 'dialogue-box__phone-status';

    const label = document.createElement('span');
    label.className = 'dialogue-box__phone-label';
    label.textContent = 'NEW MSG';
    screen.append(envelope, messageMark, label);

    const keypad = document.createElement('span');
    keypad.className = 'dialogue-box__phone-keypad';
    for (let index = 0; index < 12; index += 1) {
      const key = document.createElement('span');
      key.className = 'dialogue-box__phone-key';
      keypad.append(key);
    }

    phone.append(speaker, status, screen, keypad);
    portraitFrame.append(phone);
  } else if (portraitUrl) {
    const isObjectPortrait = portraitId.startsWith('inspect-');
    if (isObjectPortrait) {
      portraitFrame.classList.add('dialogue-box__portrait-frame--object');
    }
    const portrait = document.createElement('img');
    portrait.className = 'dialogue-box__portrait';
    if (isObjectPortrait) {
      portrait.classList.add('dialogue-box__portrait--object');
    }
    portrait.src = portraitUrl;
    portrait.alt = '';
    portrait.decoding = 'async';
    portraitFrame.append(portrait);
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
  if (line.emphasis === 'italic') {
    text.classList.add('dialogue-box__text--italic');
  }
  text.textContent = line.text;
  content.append(text);

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'dialogue-box__action';
  action.textContent = 'Continue';
  // The dialogue host advances on any click; keep the button's own click from
  // bubbling so it advances exactly once.
  action.addEventListener('click', (event) => {
    event.stopPropagation();
    onNext();
  });
  content.append(action);

  box.append(portraitFrame, content);

  return box;
}
