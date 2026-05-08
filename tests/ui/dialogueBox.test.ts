import { beforeEach, describe, expect, it } from 'vitest';
import { showDialogue } from '../../src/ui/dialogueBox';

describe('showDialogue', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ui-root"><aside class="collection-panel">Keepsakes</aside></div>';
  });

  it('renders authored dialogue as text without replacing other UI layers', async () => {
    const promise = showDialogue([
      {
        speaker: '<img src=x>',
        text: '<button>Unsafe</button>',
      },
    ]);

    const root = document.querySelector<HTMLElement>('#ui-root');
    expect(root?.querySelector('.collection-panel')?.textContent).toBe('Keepsakes');
    expect(root?.querySelector('[data-ui-layer="dialogue"]')).not.toBeNull();
    expect(root?.querySelector('.dialogue-box__speaker')?.textContent).toBe('<img src=x>');
    expect(root?.querySelector('.dialogue-box p')?.textContent).toBe('<button>Unsafe</button>');
    expect(root?.querySelector('.dialogue-box img')).toBeNull();
    expect(root?.querySelector('.dialogue-box p button')).toBeNull();

    root?.querySelector<HTMLButtonElement>('.dialogue-box__next')?.click();
    await promise;

    expect(root?.querySelector('.collection-panel')?.textContent).toBe('Keepsakes');
    expect(root?.querySelector('[data-ui-layer="dialogue"]')).toBeNull();
  });

  it('resolves and clears the active dialogue when a new dialogue starts', async () => {
    const first = showDialogue([{ text: 'First' }]);
    const second = showDialogue([{ text: 'Second' }]);

    await first;

    const root = document.querySelector<HTMLElement>('#ui-root');
    expect(root?.querySelector('.dialogue-box p')?.textContent).toBe('Second');

    root?.querySelector<HTMLButtonElement>('.dialogue-box__next')?.click();
    await second;
    expect(root?.querySelector('[data-ui-layer="dialogue"]')).toBeNull();
  });
});
