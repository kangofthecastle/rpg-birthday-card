import { HAPPY_BIRTHDAY_LINE } from '../activities/finalKeepsake/endingModel';
import { getUiRoot } from './domRoot';

export interface GalaxyLettersHudOptions {
  readonly total: number;
  readonly host?: HTMLElement;
  readonly onGoHome: () => void;
}

export interface GalaxyLettersHudHandle {
  readonly element: HTMLElement;
  setPlaying(): void;
  setAwakening(): void;
  setCollecting(read: number): void;
  setComplete(): void;
  destroy(): void;
}

/** Minimal finale host: a plain play instruction, then the final return choice. */
export function showGalaxyLettersHud(
  options: GalaxyLettersHudOptions,
): GalaxyLettersHudHandle {
  const host = options.host ?? getUiRoot();
  const overlay = document.createElement('section');
  overlay.className = 'galaxy-letters-hud';
  overlay.dataset.galaxyLettersHud = '';
  overlay.dataset.phase = 'playing';
  overlay.setAttribute('aria-label', 'Galaxy ending');
  overlay.hidden = true;

  const card = document.createElement('div');
  card.className = 'galaxy-letters-hud__card';

  const instruction = document.createElement('p');
  instruction.className = 'galaxy-letters-hud__instruction';
  instruction.textContent = 'press e';

  const birthday = document.createElement('p');
  birthday.className = 'galaxy-letters-hud__birthday';
  birthday.textContent = HAPPY_BIRTHDAY_LINE;
  birthday.hidden = true;

  const goHome = document.createElement('button');
  goHome.type = 'button';
  goHome.className = 'galaxy-letters-hud__go-home';
  goHome.textContent = 'go home';
  goHome.hidden = true;
  goHome.addEventListener('click', options.onGoHome);

  card.append(instruction, birthday, goHome);
  overlay.append(card);
  host.append(overlay);

  const handle: GalaxyLettersHudHandle = {
    element: overlay,
    setPlaying() {
      overlay.dataset.phase = 'playing';
      overlay.hidden = false;
      instruction.hidden = false;
      birthday.hidden = true;
      goHome.hidden = true;
    },
    setAwakening() {
      overlay.dataset.phase = 'awakening';
      instruction.hidden = true;
      overlay.hidden = true;
    },
    setCollecting(_read) {
      overlay.dataset.phase = 'collecting';
      instruction.hidden = true;
      overlay.hidden = true;
    },
    setComplete() {
      overlay.dataset.phase = 'complete';
      overlay.hidden = false;
      instruction.hidden = true;
      birthday.hidden = false;
      goHome.hidden = false;
      goHome.focus({ preventScroll: true });
    },
    destroy() {
      overlay.remove();
    },
  };

  handle.setPlaying();
  return handle;
}
