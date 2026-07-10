import { getUiRoot } from './domRoot';

/**
 * The post-ending photo wall: a warm, full-screen collage of framed photos and
 * polaroids of ____. Data-driven and file-first — it reads
 * `public/assets/photos/manifest.json` (drop image files in that folder, list
 * them there with optional captions). When the manifest is empty or missing it
 * composes ~8 soft placeholder polaroids so the wall already feels lived-in.
 *
 * Interaction: click a photo to enlarge it in a lightbox; Esc or a click outside
 * closes the lightbox; Esc again (or the close button) closes the wall. Mounted
 * as a DOM overlay; `showPhotoWall` resolves once the wall is dismissed, so the
 * scene can hold control while it is open and restore it on close.
 */

const MANIFEST_URL = '/assets/photos/manifest.json';
const PHOTO_BASE = '/assets/photos/';
const PLACEHOLDER_COUNT = 8;
const PLACEHOLDER_CAPTIONS = [
  'a photo goes here',
  'a good day',
  'the gold hour',
  'somewhere warm',
  'the three of you',
  'mid-laugh',
  'a quiet evening',
  'for the next good day',
];

export interface PhotoEntry {
  readonly src: string;
  readonly caption?: string;
}

export interface PhotoManifest {
  readonly photos: readonly PhotoEntry[];
}

export interface PhotoWallOptions {
  /** Where to mount. Defaults to the shared UI root. */
  readonly host?: HTMLElement;
  /** Injectable for tests; defaults to fetching the manifest file. */
  readonly loadManifest?: () => Promise<PhotoManifest | undefined>;
}

/** A resolved item on the wall: a real photo, or a warm placeholder. */
interface WallItem {
  readonly caption: string;
  /** Absolute URL for a real photo, or undefined for a placeholder. */
  readonly src?: string;
  /** Placeholder gradient seed (stable warm variation). */
  readonly tone: number;
}

async function fetchManifest(): Promise<PhotoManifest | undefined> {
  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!response.ok) {
      return undefined;
    }
    const data = (await response.json()) as PhotoManifest;
    return data && Array.isArray(data.photos) ? data : undefined;
  } catch {
    return undefined;
  }
}

function resolveItems(manifest: PhotoManifest | undefined): WallItem[] {
  const photos = manifest?.photos ?? [];
  if (photos.length > 0) {
    return photos.slice(0, 30).map((photo, index) => ({
      caption: photo.caption ?? '',
      src: photo.src.startsWith('/') || /^https?:/.test(photo.src)
        ? photo.src
        : `${PHOTO_BASE}${photo.src}`,
      tone: index % PLACEHOLDER_CAPTIONS.length,
    }));
  }
  // Empty / missing manifest → soft placeholders so the wall feels composed.
  return Array.from({ length: PLACEHOLDER_COUNT }, (_unused, index) => ({
    caption: PLACEHOLDER_CAPTIONS[index % PLACEHOLDER_CAPTIONS.length],
    tone: index % PLACEHOLDER_CAPTIONS.length,
  }));
}

/** Small, stable per-index scatter so the collage looks pinned, not gridded. */
function rotationFor(index: number): number {
  return (((index * 37) % 9) - 4) * 0.7; // ~ -2.8deg .. +2.8deg
}

export function showPhotoWall(options: PhotoWallOptions = {}): Promise<void> {
  const host = options.host ?? getUiRoot();
  const loadManifest = options.loadManifest ?? fetchManifest;

  return new Promise<void>((resolve) => {
    const overlay = document.createElement('section');
    overlay.className = 'photo-wall';
    overlay.dataset.photoWall = '';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '____’s photo wall');
    overlay.tabIndex = -1;

    const header = document.createElement('header');
    header.className = 'photo-wall__header';
    const heading = document.createElement('h2');
    heading.className = 'photo-wall__heading';
    heading.textContent = 'the photo wall';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'photo-wall__close';
    closeButton.setAttribute('aria-label', 'Close the photo wall');
    closeButton.textContent = '×';
    header.append(heading, closeButton);

    const board = document.createElement('div');
    board.className = 'photo-wall__board';

    overlay.append(header, board);
    host.append(overlay);

    let lightbox: HTMLElement | undefined;
    let closed = false;

    const closeLightbox = (): void => {
      if (lightbox) {
        lightbox.remove();
        lightbox = undefined;
      }
    };

    const close = (): void => {
      if (closed) {
        return;
      }
      closed = true;
      closeLightbox();
      document.removeEventListener('keydown', onKeydown, true);
      overlay.remove();
      resolve();
    };

    const openLightbox = (item: WallItem): void => {
      closeLightbox();
      lightbox = document.createElement('div');
      lightbox.className = 'photo-wall__lightbox';
      lightbox.dataset.photoLightbox = '';

      const figure = document.createElement('figure');
      figure.className = 'photo-wall__lightbox-figure';
      figure.append(buildMedia(item, true));
      if (item.caption) {
        const cap = document.createElement('figcaption');
        cap.className = 'photo-wall__lightbox-caption';
        cap.textContent = item.caption;
        figure.append(cap);
      }
      lightbox.append(figure);

      // Click outside the figure closes only the lightbox.
      lightbox.addEventListener('click', (event) => {
        if (event.target === lightbox) {
          closeLightbox();
        }
      });
      overlay.append(lightbox);
    };

    const onKeydown = (event: KeyboardEvent): void => {
      // Bail if this wall is gone (closed, or its host was torn down elsewhere).
      if (closed || !overlay.isConnected) {
        return;
      }
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (lightbox) {
        closeLightbox();
      } else {
        close();
      }
    };

    closeButton.addEventListener('click', close);
    document.addEventListener('keydown', onKeydown, true);

    void loadManifest().then((manifest) => {
      if (closed) {
        return;
      }
      const items = resolveItems(manifest);
      items.forEach((item, index) => {
        const frame = document.createElement('button');
        frame.type = 'button';
        frame.className = 'photo-wall__frame';
        if (!item.src) {
          frame.classList.add('photo-wall__frame--placeholder');
        }
        frame.style.setProperty('--rot', `${rotationFor(index)}deg`);
        frame.style.setProperty('--tone', String(item.tone));
        frame.setAttribute(
          'aria-label',
          item.caption ? `Enlarge photo: ${item.caption}` : 'Enlarge photo',
        );

        const tape = document.createElement('span');
        tape.className = 'photo-wall__tape';
        tape.setAttribute('aria-hidden', 'true');

        frame.append(tape, buildMedia(item, false));
        if (item.caption) {
          const caption = document.createElement('span');
          caption.className = 'photo-wall__caption';
          caption.textContent = item.caption;
          frame.append(caption);
        }
        frame.addEventListener('click', () => openLightbox(item));
        board.append(frame);
      });
    });

    requestAnimationFrame(() => overlay.focus({ preventScroll: true }));
  });
}

/** A photo's visual: a real <img> when a src exists, else a warm gradient rect. */
function buildMedia(item: WallItem, large: boolean): HTMLElement {
  if (item.src) {
    const img = document.createElement('img');
    img.className = large ? 'photo-wall__media photo-wall__media--large' : 'photo-wall__media';
    img.src = item.src;
    img.alt = item.caption || 'A photo of ____';
    img.loading = 'lazy';
    return img;
  }
  const rect = document.createElement('span');
  rect.className = large
    ? 'photo-wall__media photo-wall__media--placeholder photo-wall__media--large'
    : 'photo-wall__media photo-wall__media--placeholder';
  rect.style.setProperty('--tone', String(item.tone));
  rect.setAttribute('aria-hidden', 'true');
  return rect;
}
