import { getUiRoot } from './domRoot';

export interface InteractionPromptHandle {
  readonly element: HTMLElement;
  setLabel(label: string): void;
  remove(): void;
}

/**
 * A crisp DOM interaction prompt, mounted in the same viewport-aligned UI root
 * as dialogue. Keeping it out of Phaser avoids canvas texture resampling at
 * fractional Scale.FIT sizes while preserving the game's dialogue typography.
 */
export function createInteractionPrompt(
  host: HTMLElement = getUiRoot(),
): InteractionPromptHandle {
  host.querySelector('[data-ui-layer="interaction-prompt"]')?.remove();

  const prompt = document.createElement('div');
  prompt.className = 'interaction-prompt';
  prompt.dataset.uiLayer = 'interaction-prompt';
  prompt.dataset.interactionPrompt = '';
  prompt.setAttribute('role', 'status');
  prompt.setAttribute('aria-live', 'polite');
  prompt.hidden = true;

  host.append(prompt);

  let currentLabel = '';
  const setLabel = (nextLabel: string): void => {
    const label = nextLabel.trim();
    if (label === currentLabel) {
      return;
    }

    currentLabel = label;
    prompt.textContent = label ? `E - ${label}` : '';
    prompt.hidden = label.length === 0;
    if (label) {
      prompt.setAttribute('aria-label', `Press E to ${label}`);
    } else {
      prompt.removeAttribute('aria-label');
    }
  };

  return {
    element: prompt,
    setLabel,
    remove: () => prompt.remove(),
  };
}
