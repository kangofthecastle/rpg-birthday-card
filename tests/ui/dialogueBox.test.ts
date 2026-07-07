import { beforeEach, describe, expect, it } from 'vitest';
import { showDialogue } from '../../src/ui/dialogueBox';

describe('showDialogue', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ui-root"><aside class="collection-panel">Keepsakes</aside></div>';
  });

  it('renders authored dialogue as safe text without replacing other UI layers', async () => {
    const promise = showDialogue([
      {
        speaker: '<img src=x>',
        text: '<button>Unsafe</button>',
      },
    ]);

    const root = document.querySelector<HTMLElement>('#ui-root');
    expect(root?.querySelector('.collection-panel')?.textContent).toBe('Keepsakes');
    expect(root?.querySelector('[data-ui-layer="dialogue"]')).not.toBeNull();
    expect(root?.querySelector('.dialogue-box')?.getAttribute('role')).toBe('dialog');
    expect(root?.querySelector('.dialogue-box')?.getAttribute('aria-live')).toBe('polite');
    expect(root?.querySelector('.dialogue-box__speaker')?.textContent).toBe('<img src=x>');
    expect(root?.querySelector('.dialogue-box__text')?.textContent).toBe('<button>Unsafe</button>');
    expect(root?.querySelector('.dialogue-box img')).toBeNull();
    expect(root?.querySelector('.dialogue-box__text button')).toBeNull();

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    await promise;

    expect(root?.querySelector('.collection-panel')?.textContent).toBe('Keepsakes');
    expect(root?.querySelector('[data-ui-layer="dialogue"]')).toBeNull();
  });

  it('omits the speaker label when one is not provided', async () => {
    const promise = showDialogue([{ text: 'Each door holds a small piece of the way forward.' }]);
    const root = document.querySelector<HTMLElement>('#ui-root');

    expect(root?.querySelector('.dialogue-box__speaker')).toBeNull();
    expect(root?.querySelector('.dialogue-box__portrait-frame')).not.toBeNull();
    expect(root?.querySelector('.dialogue-box__portrait-frame--empty')).not.toBeNull();
    expect(root?.querySelector('.dialogue-box__action')?.textContent).toBe('Continue');

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    await promise;
  });

  it('renders known portraits and falls back to an empty portrait frame for unknown ids', async () => {
    const known = showDialogue([
      {
        text: '____ waits beside the pond.',
        portraitId: 'portrait-friendone',
      },
    ]);
    const root = document.querySelector<HTMLElement>('#ui-root');
    const portrait = root?.querySelector<HTMLImageElement>('.dialogue-box__portrait');

    expect(portrait?.getAttribute('src')).toBe('/assets/portraits/portrait-friendone.png');
    expect(portrait?.getAttribute('alt')).toBe('');

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    await known;

    const unknown = showDialogue([
      {
        text: 'The portrait has not arrived yet.',
        portraitId: 'portrait-friend-a',
      },
    ]);

    expect(root?.querySelector('.dialogue-box__portrait')).toBeNull();
    expect(root?.querySelector('.dialogue-box__portrait-frame--empty')).not.toBeNull();

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    await unknown;
  });

  it('advances through multiple lines before resolving', async () => {
    const promise = showDialogue([{ text: 'First' }, { speaker: 'River', text: 'Second' }]);
    const root = document.querySelector<HTMLElement>('#ui-root');

    expect(root?.querySelector('.dialogue-box__text')?.textContent).toBe('First');

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    expect(root?.querySelector('.dialogue-box__speaker')?.textContent).toBe('River');
    expect(root?.querySelector('.dialogue-box__text')?.textContent).toBe('Second');

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    await promise;
    expect(root?.querySelector('[data-ui-layer="dialogue"]')).toBeNull();
  });

  it('resolves and clears the active dialogue when a new dialogue starts', async () => {
    const first = showDialogue([{ text: 'First' }]);
    const second = showDialogue([{ text: 'Second' }]);

    await first;

    const root = document.querySelector<HTMLElement>('#ui-root');
    expect(root?.querySelector('.dialogue-box__text')?.textContent).toBe('Second');

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    await second;
    expect(root?.querySelector('[data-ui-layer="dialogue"]')).toBeNull();
  });

  it('resolves empty dialogue without creating a host', async () => {
    const root = document.querySelector<HTMLElement>('#ui-root');

    await showDialogue([]);

    expect(root?.querySelector('[data-ui-layer="dialogue"]')).toBeNull();
    expect(root?.querySelector('.collection-panel')?.textContent).toBe('Keepsakes');
  });

  it('advances with Enter and Space while ignoring held-key repeats', async () => {
    const promise = showDialogue([{ text: 'First' }, { text: 'Second' }]);
    const root = document.querySelector<HTMLElement>('#ui-root');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true }));
    expect(root?.querySelector('.dialogue-box__text')?.textContent).toBe('First');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(root?.querySelector('.dialogue-box__text')?.textContent).toBe('Second');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    await promise;
    expect(root?.querySelector('[data-ui-layer="dialogue"]')).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(root?.querySelector('[data-ui-layer="dialogue"]')).toBeNull();
  });
});
