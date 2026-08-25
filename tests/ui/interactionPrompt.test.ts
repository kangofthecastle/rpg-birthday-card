import { beforeEach, describe, expect, it } from 'vitest';
import { createInteractionPrompt } from '../../src/ui/interactionPrompt';

describe('interaction prompt', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ui-root"></div>';
  });

  it('stays hidden until an interaction label is available', () => {
    const prompt = createInteractionPrompt();

    expect(prompt.element.hidden).toBe(true);
    prompt.setLabel('Enter the fishing game');
    expect(prompt.element.hidden).toBe(false);
    expect(prompt.element.textContent).toBe('E - Enter the fishing game');
    expect(prompt.element.getAttribute('aria-label')).toBe(
      'Press E to Enter the fishing game',
    );
  });

  it('hides cleanly and removes its accessible label when ____ cannot interact', () => {
    const prompt = createInteractionPrompt();
    prompt.setLabel('Step outside');
    prompt.setLabel('');

    expect(prompt.element.hidden).toBe(true);
    expect(prompt.element.hasAttribute('aria-label')).toBe(false);
  });

  it('renders labels as text and replaces any stale prompt host', () => {
    const first = createInteractionPrompt();
    first.setLabel('<button>Unsafe</button>');
    const second = createInteractionPrompt();

    expect(document.querySelectorAll('[data-ui-layer="interaction-prompt"]')).toHaveLength(1);
    expect(first.element.isConnected).toBe(false);
    expect(second.element.querySelector('button')).toBeNull();
  });
});
