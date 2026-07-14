import { LOCATIONS } from '../content/locations';
import type { DialogueLine, SheetMusicReward } from '../content/types';
import type { RunState } from '../game/runState';
import { showLetterModal, showSheetMusicModal } from './letterModal';

/**
 * The in-world "Letters" HUD. Every keepsake a friend gives ____ is a letter;
 * once collected it lives here as a little envelope in a soft stack. Hovering
 * (or focusing, for keyboard) fans the stack out like a hand of cards so she can
 * pick one to read again. Letters reopen through {@link showLetterModal}; ____'s
 * music keepsake reopens the illustrated score instead of inventing letter copy.
 *
 * The panel is deliberately NOT a `.activity-panel` (that class force-centres and
 * caps width at 560px — see styles.css); it keeps its own top-right corner slot.
 *
 * Interaction is gated by an injected `canInteract` guard so the HUD can never
 * steal a click mid-dialogue or mid-activity. Keyboard nav mirrors the
 * post-ending letters screen: roving tabindex + arrows, Enter/Space to open.
 */

export interface CollectionPanelOptions {
  /** Opens a letter. Injectable for tests; defaults to the shared modal. */
  readonly onOpenLetter?: (lines: readonly DialogueLine[]) => Promise<void> | void;
  /** Reopens an illustrated score. Injectable so the world can freeze while it is open. */
  readonly onOpenSheetMusic?: (content: SheetMusicReward) => Promise<void> | void;
  /**
   * Guard checked before a letter opens. Returns false while the player is
   * frozen (dialogue/activity/reward) so the HUD never steals a click or a
   * keyboard activation. Defaults to always-open.
   */
  readonly canInteract?: () => boolean;
}

export interface CollectionPanelHandle {
  readonly element: HTMLElement;
}

interface EntryBase {
  readonly keepsakeId: string;
  readonly label: string;
  readonly iconAssetId: string;
}

type LetterEntry =
  | (EntryBase & {
      readonly kind: 'letter';
      readonly lines: readonly DialogueLine[];
    })
  | (EntryBase & {
      readonly kind: 'sheet-music';
      readonly content: SheetMusicReward;
    });

/** Every keepsake-bearing location, in play order, that the run has collected. */
function collectedLetters(state: RunState): LetterEntry[] {
  return LOCATIONS.flatMap<LetterEntry>((location): LetterEntry[] => {
    const keepsake = location.keepsake;
    if (!keepsake || !state.collectedKeepsakeIds.includes(keepsake.id)) {
      return [];
    }
    if (location.rewardSheetMusic) {
      return [
        {
          kind: 'sheet-music' as const,
          keepsakeId: keepsake.id,
          label: keepsake.label,
          iconAssetId: keepsake.iconAssetId,
          content: location.rewardSheetMusic,
        },
      ];
    }

    // The reward message IS the letter as first read; non-score keepsakes retain
    // the description fallback so older content can never open an empty reader.
    const lines: readonly DialogueLine[] =
      location.rewardMessage && location.rewardMessage.length > 0
        ? location.rewardMessage
        : [{ text: keepsake.description }];
    return [
      {
        kind: 'letter' as const,
        keepsakeId: keepsake.id,
        label: keepsake.label,
        iconAssetId: keepsake.iconAssetId,
        lines,
      },
    ];
  });
}

/** Total number of letters the run can ever hold — for the quiet progress count. */
function totalLetterCount(): number {
  return LOCATIONS.filter((location) => location.keepsake !== undefined).length;
}

export function createCollectionPanel(
  state: RunState,
  options: CollectionPanelOptions = {},
): CollectionPanelHandle {
  const onOpenLetter =
    options.onOpenLetter ?? ((lines) => showLetterModal(lines));
  const onOpenSheetMusic =
    options.onOpenSheetMusic ?? ((content) => showSheetMusicModal(content));
  const canInteract = options.canInteract ?? (() => true);

  const letters = collectedLetters(state);
  const total = totalLetterCount();

  const panel = document.createElement('aside');
  panel.className = 'collection-panel';
  panel.setAttribute('aria-label', 'Letters collection');

  const heading = document.createElement('h2');
  heading.textContent = 'Letters';
  panel.append(heading);

  if (letters.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'collection-panel__empty';
    empty.textContent = 'The letters you gather will rest here.';
    panel.append(empty);
    return { element: panel };
  }

  const stack = document.createElement('div');
  stack.className = 'letter-stack';
  stack.setAttribute('role', 'list');
  stack.style.setProperty('--n', String(letters.length));

  const caption = document.createElement('p');
  caption.className = 'collection-panel__caption';
  caption.setAttribute('aria-hidden', 'true');
  const defaultCaption =
    total > 1 ? `${letters.length} of ${total} collected` : 'A letter, kept close';
  caption.textContent = defaultCaption;

  let selectedIndex = letters.length - 1; // the most-recent letter sits on top

  const setSelected = (index: number): void => {
    selectedIndex = ((index % buttons.length) + buttons.length) % buttons.length;
    buttons.forEach((button, buttonIndex) => {
      button.tabIndex = buttonIndex === selectedIndex ? 0 : -1;
    });
    buttons[selectedIndex]?.focus({ preventScroll: true });
  };

  const buttons: HTMLButtonElement[] = letters.map((entry, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'letter-stack__item';
    item.dataset.letterIndex = String(index);
    // Styling hook: lets styles.css give an individual keepsake's art a
    // display-only rotation (--art-rotate) without touching the asset.
    item.dataset.keepsakeId = entry.keepsakeId;
    item.style.setProperty('--i', String(index));
    item.setAttribute('role', 'listitem');
    item.setAttribute('aria-label', `Re-read ${entry.label}`);
    item.tabIndex = index === selectedIndex ? 0 : -1;

    const face = document.createElement('span');
    face.className = 'letter-stack__face';

    if (entry.iconAssetId) {
      const icon = document.createElement('img');
      icon.className = 'letter-stack__icon';
      icon.src = `/assets/keepsakes/${encodeURIComponent(entry.iconAssetId)}.png`;
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');
      face.append(icon);
    }

    // Label text stays in the DOM (the visible caption echoes it on hover); it's
    // the accessible/searchable name of each letter.
    const label = document.createElement('span');
    label.className = 'letter-stack__label';
    label.textContent = entry.label;
    face.append(label);

    item.append(face);

    let opening = false;
    const activate = async (restoreKeyboardFocus: boolean): Promise<void> => {
      if (opening || !canInteract()) {
        return;
      }
      opening = true;
      caption.textContent = entry.label;
      try {
        if (entry.kind === 'sheet-music') {
          await onOpenSheetMusic(entry.content);
        } else {
          await onOpenLetter(entry.lines);
        }
      } finally {
        opening = false;
      }
      if (restoreKeyboardFocus) {
        item.focus({ preventScroll: true });
      } else {
        item.blur();
      }
    };

    item.addEventListener('click', (event) => {
      event.stopPropagation();
      // Browser-generated keyboard activation dispatches click with detail 0.
      // Restore focus for that path so arrow navigation continues; a pointer
      // click should not leave :focus-within holding the fan open after close.
      void activate(event.detail === 0);
    });
    item.addEventListener('mouseenter', () => {
      caption.textContent = entry.label;
    });
    item.addEventListener('focus', () => {
      selectedIndex = index;
      buttons.forEach((button, buttonIndex) => {
        button.tabIndex = buttonIndex === index ? 0 : -1;
      });
      caption.textContent = entry.label;
    });

    return item;
  });

  for (const button of buttons) {
    stack.append(button);
  }

  stack.addEventListener('mouseleave', () => {
    caption.textContent = defaultCaption;
  });
  stack.addEventListener('focusout', (event) => {
    // Reset the caption only when focus leaves the stack entirely.
    if (!stack.contains(event.relatedTarget as Node | null)) {
      caption.textContent = defaultCaption;
    }
  });

  stack.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        setSelected(selectedIndex + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        setSelected(selectedIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        setSelected(0);
        break;
      case 'End':
        event.preventDefault();
        setSelected(buttons.length - 1);
        break;
      default:
        break;
    }
  });

  panel.append(stack, caption);
  return { element: panel };
}
