import type { DialogueLine } from '../content/types';
import { getUiRoot } from './domRoot';

export function showDialogue(lines: readonly DialogueLine[]): Promise<void> {
  return new Promise((resolve) => {
    const root = getUiRoot();
    let index = 0;

    const render = () => {
      const line = lines[index];
      root.innerHTML = `
        <section class="dialogue-box" role="dialog" aria-live="polite">
          ${line.speaker ? `<strong class="dialogue-box__speaker">${line.speaker}</strong>` : ''}
          <p>${line.text}</p>
          <button type="button" class="dialogue-box__next">Continue</button>
        </section>
      `;

      root.querySelector('.dialogue-box__next')?.addEventListener('click', () => {
        index += 1;

        if (index >= lines.length) {
          root.innerHTML = '';
          resolve();
          return;
        }

        render();
      });
    };

    render();
  });
}
