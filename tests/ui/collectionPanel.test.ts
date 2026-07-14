import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCollectionPanel } from '../../src/ui/collectionPanel';
import type { RunState } from '../../src/game/runState';

vi.mock('../../src/content/locations', () => ({
  LOCATIONS: [
    // A location without a keepsake is skipped by the panel.
    { id: 'entry', keepsake: undefined },
    {
      id: 'friend-a',
      keepsake: {
        id: 'glowing-koi-scale',
        label: 'Glowing <img src=x onerror=alert(1)> Koi Scale',
        description: 'The koi scale description.',
        iconAssetId: 'keepsake-glowing-koi-scale',
      },
      rewardPresentation: 'letter',
      rewardMessage: [{ speaker: '____', text: 'Even inside a tiny game.' }],
    },
    {
      id: 'friend-b',
      keepsake: {
        id: 'friend-b-keepsake',
        label: 'friend-b label',
        description: 'friend-b description.',
        iconAssetId: 'keepsake-friend-b',
      },
    },
    {
      id: 'recipient-house',
      keepsake: {
        id: 'recipient-sheet-music',
        label: 'The Piece You Finally Played',
        description: 'This fallback should not be shown.',
        iconAssetId: 'keepsake-golden-hour-photo',
      },
      rewardSheetMusic: {
        title: 'Do You Hear the People Sing?',
        imageSrc: '/sheet-music.png',
        imageAlt: '____’s handwritten sheet music',
      },
    },
  ],
}));

function stateWith(collectedKeepsakeIds: readonly string[]): RunState {
  return {
    currentLocationId: 'entry',
    completedLocationIds: [],
    collectedKeepsakeIds: [...collectedKeepsakeIds],
    completedActivityIds: [],
    wonActivityIds: [],
    seenBeatIds: [],
    endingCompleted: false,
  };
}

describe('createCollectionPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ui-root"></div>';
  });

  it('shows a gentle empty state when no letters are collected', () => {
    const { element } = createCollectionPanel(stateWith([]));

    expect(element.classList.contains('collection-panel')).toBe(true);
    expect(element.querySelector('h2')?.textContent).toBe('Letters');
    expect(element.querySelector('.collection-panel__empty')).not.toBeNull();
    expect(element.querySelector('.letter-stack')).toBeNull();
  });

  it('renders one envelope per collected letter with its icon and safe label', () => {
    const { element } = createCollectionPanel(stateWith(['glowing-koi-scale']));

    const items = element.querySelectorAll<HTMLButtonElement>('.letter-stack__item');
    expect(items).toHaveLength(1);

    const icon = items[0]?.querySelector<HTMLImageElement>('.letter-stack__icon');
    expect(icon?.getAttribute('src')).toBe(
      '/assets/keepsakes/keepsake-glowing-koi-scale.png',
    );

    // Author-controlled label is set via textContent, so no markup is injected.
    const label = items[0]?.querySelector('.letter-stack__label');
    expect(label?.textContent).toBe('Glowing <img src=x onerror=alert(1)> Koi Scale');
    expect(items[0]?.querySelector('.letter-stack__label img')).toBeNull();
    expect(items[0]?.getAttribute('aria-label')).toContain(
      'Glowing <img src=x onerror=alert(1)> Koi Scale',
    );

    // Only collected letters appear — no placeholders for the uncollected one.
    expect(element.textContent).not.toContain('friend-b label');
    expect(items).toHaveLength(1);
  });

  it('renders a fanning stack sized by the collected count', () => {
    const { element } = createCollectionPanel(
      stateWith(['glowing-koi-scale', 'friend-b-keepsake']),
    );

    const stack = element.querySelector<HTMLElement>('.letter-stack');
    expect(stack?.style.getPropertyValue('--n')).toBe('2');

    const items = element.querySelectorAll<HTMLButtonElement>('.letter-stack__item');
    expect(items).toHaveLength(2);
    expect(items[0]?.style.getPropertyValue('--i')).toBe('0');
    expect(items[1]?.style.getPropertyValue('--i')).toBe('1');
  });

  it('opens the letter through the reader on click, using the reward message', async () => {
    const onOpenLetter = vi.fn().mockResolvedValue(undefined);
    const { element } = createCollectionPanel(stateWith(['glowing-koi-scale']), {
      onOpenLetter,
    });

    element.querySelector<HTMLButtonElement>('.letter-stack__item')?.click();

    expect(onOpenLetter).toHaveBeenCalledOnce();
    expect(onOpenLetter).toHaveBeenCalledWith([
      { speaker: '____', text: 'Even inside a tiny game.' },
    ]);
  });

  it('falls back to the keepsake description when there is no reward message', () => {
    const onOpenLetter = vi.fn().mockResolvedValue(undefined);
    const { element } = createCollectionPanel(stateWith(['friend-b-keepsake']), {
      onOpenLetter,
    });

    element.querySelector<HTMLButtonElement>('.letter-stack__item')?.click();

    expect(onOpenLetter).toHaveBeenCalledWith([{ text: 'friend-b description.' }]);
  });

  it('reopens ____’s illustrated score instead of showing the keepsake description', () => {
    const onOpenLetter = vi.fn().mockResolvedValue(undefined);
    const onOpenSheetMusic = vi.fn().mockResolvedValue(undefined);
    const { element } = createCollectionPanel(stateWith(['recipient-sheet-music']), {
      onOpenLetter,
      onOpenSheetMusic,
    });

    element.querySelector<HTMLButtonElement>('.letter-stack__item')?.click();

    expect(onOpenLetter).not.toHaveBeenCalled();
    expect(onOpenSheetMusic).toHaveBeenCalledWith({
      title: 'Do You Hear the People Sing?',
      imageSrc: '/sheet-music.png',
      imageAlt: '____’s handwritten sheet music',
    });
  });

  it('never opens a letter while the interaction guard is closed', () => {
    const onOpenLetter = vi.fn().mockResolvedValue(undefined);
    const { element } = createCollectionPanel(stateWith(['glowing-koi-scale']), {
      onOpenLetter,
      canInteract: () => false,
    });

    element.querySelector<HTMLButtonElement>('.letter-stack__item')?.click();

    expect(onOpenLetter).not.toHaveBeenCalled();
  });

  it('does not leave the stack focused open after pointer activation', async () => {
    const onOpenLetter = vi.fn().mockResolvedValue(undefined);
    const { element } = createCollectionPanel(stateWith(['glowing-koi-scale']), {
      onOpenLetter,
    });
    document.body.append(element);
    const item = element.querySelector<HTMLButtonElement>('.letter-stack__item')!;

    item.focus();
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await vi.waitFor(() => expect(onOpenLetter).toHaveBeenCalledOnce());
    await Promise.resolve();

    expect(document.activeElement).not.toBe(item);
    expect(element.querySelector('.letter-stack:focus-within')).toBeNull();
  });
});
