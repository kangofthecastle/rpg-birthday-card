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
    expect(
      root?.querySelector<HTMLImageElement>('.dialogue-box__portrait')?.getAttribute('src'),
    ).toBe('/assets/portraits/portrait-recipient.png');
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
    expect(root?.querySelector('.dialogue-box__portrait-frame--empty')).toBeNull();
    expect(
      root?.querySelector<HTMLImageElement>('.dialogue-box__portrait')?.getAttribute('src'),
    ).toBe('/assets/portraits/portrait-recipient.png');
    expect(root?.querySelector('.dialogue-box__action')?.textContent).toBe('Continue');

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    await promise;
  });

  it('renders known portraits and falls back to ____ instead of an empty frame', async () => {
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
        portraitId: 'portrait-never-exists',
      },
    ]);

    expect(
      root?.querySelector<HTMLImageElement>('.dialogue-box__portrait')?.getAttribute('src'),
    ).toBe('/assets/portraits/portrait-recipient.png');
    expect(root?.querySelector('.dialogue-box__portrait-frame--empty')).toBeNull();

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    await unknown;
  });

  it('renders inspected objects as contained object portraits', async () => {
    const promise = showDialogue([
      { text: 'The violin waits.', portraitId: 'inspect-violin' },
    ]);
    const root = document.querySelector<HTMLElement>('#ui-root');

    expect(root?.querySelector('.dialogue-box__portrait-frame--object')).not.toBeNull();
    const portrait = root?.querySelector<HTMLImageElement>('.dialogue-box__portrait--object');
    expect(portrait?.getAttribute('src')).toBe('/assets/portraits/objects/violin.png');
    expect(root?.querySelector('.dialogue-box__portrait-frame--empty')).toBeNull();

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    await promise;
  });

  it('renders Omen dialogue with the existing in-game Omen portrait', async () => {
    const promise = showDialogue([
      {
        speaker: 'Omen',
        text: 'Unintelligible sounds from the void',
        portraitId: 'portrait-omen',
        emphasis: 'italic',
      },
    ]);
    const root = document.querySelector<HTMLElement>('#ui-root');

    expect(
      root?.querySelector<HTMLImageElement>('.dialogue-box__portrait')?.getAttribute('src'),
    ).toBe('/assets/activities/valorant-split/omen.png');
    expect(root?.querySelector('.dialogue-box__text--italic')?.textContent).toBe(
      'Unintelligible sounds from the void',
    );

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    await promise;
  });

  it('renders phone-treated dialogue as a softened retro feature phone', async () => {
    const promise = showDialogue([
      { speaker: '____', text: 'hey, come over!!', portraitTreatment: 'phone' },
    ]);
    const root = document.querySelector<HTMLElement>('#ui-root');

    const frame = root?.querySelector('.dialogue-box__portrait-frame');
    expect(frame?.classList.contains('dialogue-box__portrait-frame--phone')).toBe(true);
    expect(frame?.classList.contains('dialogue-box__portrait-frame--empty')).toBe(false);
    const phone = frame?.querySelector('.dialogue-box__phone');
    expect(phone?.getAttribute('aria-hidden')).toBe('true');
    expect(phone?.querySelector('.dialogue-box__phone-speaker')).not.toBeNull();
    expect(phone?.querySelector('.dialogue-box__phone-screen')).not.toBeNull();
    expect(phone?.querySelector('.dialogue-box__phone-envelope')).not.toBeNull();
    expect(phone?.querySelector('svg[data-phone-mail-icon]')).not.toBeNull();
    expect(phone?.querySelector('.dialogue-box__phone-message-mark')).not.toBeNull();
    expect(phone?.querySelector('.dialogue-box__phone-status')).not.toBeNull();
    expect(phone?.querySelector('.dialogue-box__phone-label')?.textContent).toBe('NEW MSG');
    expect(phone?.querySelectorAll('.dialogue-box__phone-key').length).toBe(12);
    expect(phone?.querySelector('[data-phone-message]')).toBeNull();

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    await promise;
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

  it('announces each line only when that line is actually shown', async () => {
    const onLineShown = vi.fn();
    const lines = [
      { text: 'The PC stays dark.' },
      { text: '1 NEW MESSAGE', portraitTreatment: 'phone' as const },
    ];
    const promise = showDialogue(lines, { onLineShown });
    const root = document.querySelector<HTMLElement>('#ui-root');

    expect(onLineShown).toHaveBeenCalledTimes(1);
    expect(onLineShown).toHaveBeenLastCalledWith(lines[0], 0);

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    expect(root?.querySelector('.dialogue-box__text')?.textContent).toBe('1 NEW MESSAGE');
    expect(onLineShown).toHaveBeenCalledTimes(2);
    expect(onLineShown).toHaveBeenLastCalledWith(lines[1], 1);

    root?.querySelector<HTMLButtonElement>('.dialogue-box__action')?.click();
    await promise;
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

  it('advances when clicking anywhere on the dialogue, not just the Continue button', async () => {
    const promise = showDialogue([{ text: 'First' }, { text: 'Second' }]);
    const root = document.querySelector<HTMLElement>('#ui-root');

    expect(root?.querySelector('.dialogue-box__text')?.textContent).toBe('First');

    // Click the body text, away from the Continue button — exactly one advance.
    root?.querySelector<HTMLElement>('.dialogue-box__text')?.click();
    expect(root?.querySelector('.dialogue-box__text')?.textContent).toBe('Second');

    // A click on the box itself finishes the dialogue.
    root?.querySelector<HTMLElement>('.dialogue-box')?.click();
    await promise;
    expect(root?.querySelector('[data-ui-layer="dialogue"]')).toBeNull();
  });
});
