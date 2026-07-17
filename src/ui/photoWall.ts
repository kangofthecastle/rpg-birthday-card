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
export const BOAT_PHOTO_SRC =
  '/assets/photos/recipient-boat-wall-photo.png';
// The one frame left empty on the wall, "labelled in careful handwriting" — kept
// waiting for the next good day.
const EMPTY_FRAME_CAPTION = 'for the next good day';
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

export interface MeasuredRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface HeroTransform {
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
}

/**
 * A centered, aspect-preserving transform from the hero image to the image in
 * the first frame. Measuring the images themselves keeps frame padding and
 * rotation out of the geometry.
 */
export function calculateHeroTransform(
  hero: MeasuredRect,
  destination: MeasuredRect,
): HeroTransform {
  const scale = Math.min(
    destination.width / Math.max(hero.width, 1),
    destination.height / Math.max(hero.height, 1),
  );
  return {
    translateX:
      destination.left + destination.width / 2 - hero.left - (hero.width * scale) / 2,
    translateY:
      destination.top + destination.height / 2 - hero.top - (hero.height * scale) / 2,
    scale,
  };
}

export interface PhotoWallOptions {
  /** Where to mount. Defaults to the shared UI root. */
  readonly host?: HTMLElement;
  /** Injectable for tests; defaults to fetching the manifest file. */
  readonly loadManifest?: () => Promise<PhotoManifest | undefined>;
  /** Injectable layout measurement; defaults to getBoundingClientRect(). */
  readonly measureRect?: (element: HTMLElement) => MeasuredRect;
  /** Injectable accessibility preference; defaults to matchMedia(). */
  readonly prefersReducedMotion?: () => boolean;
  /** Injectable animation driver; defaults to the Web Animations API. */
  readonly transition?: PhotoHeroTransition;
  /** Fires once the full-screen boat still has settled into the first frame. */
  readonly onIntroComplete?: () => void;
}

export interface PhotoHeroTransitionContext {
  readonly hero: HTMLElement;
  readonly destination: HTMLElement;
  readonly transform: HeroTransform;
  readonly reducedMotion: boolean;
}

export type PhotoHeroTransition = (
  context: PhotoHeroTransitionContext,
) => Promise<void>;

/** A resolved item on the wall: a real photo, or a warm placeholder. */
interface WallItem {
  readonly caption: string;
  /** Absolute URL for a real photo, or undefined for a placeholder. */
  readonly src?: string;
  /** Placeholder gradient seed (stable warm variation). */
  readonly tone: number;
  readonly storyPhoto?: 'boat';
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
  const boat: WallItem = {
    caption: 'the next good day',
    src: BOAT_PHOTO_SRC,
    tone: 0,
    storyPhoto: 'boat',
  };
  if (photos.length > 0) {
    return [
      boat,
      ...photos.slice(0, 29).map((photo, index) => ({
        caption: photo.caption ?? '',
        src: photo.src.startsWith('/') || /^https?:/.test(photo.src)
          ? photo.src
          : `${PHOTO_BASE}${photo.src}`,
        tone: (index + 1) % PLACEHOLDER_CAPTIONS.length,
      })),
    ];
  }
  // Empty / missing manifest → soft placeholders so the wall feels composed.
  return [
    boat,
    ...Array.from({ length: PLACEHOLDER_COUNT }, (_unused, index) => ({
      caption: PLACEHOLDER_CAPTIONS[index % PLACEHOLDER_CAPTIONS.length],
      tone: index % PLACEHOLDER_CAPTIONS.length,
    })),
  ];
}

/** Small, stable per-index scatter so the collage looks pinned, not gridded. */
function rotationFor(index: number): number {
  return (((index * 37) % 9) - 4) * 0.7; // ~ -2.8deg .. +2.8deg
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

async function runPhotoHeroTransition({
  hero,
  transform,
  reducedMotion,
}: PhotoHeroTransitionContext): Promise<void> {
  const keyframes: Keyframe[] = reducedMotion
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [
        { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
        {
          transform: `translate3d(${transform.translateX}px, ${transform.translateY}px, 0) scale(${transform.scale})`,
          opacity: 1,
        },
      ];
  const animation = hero.animate?.(keyframes, {
    duration: reducedMotion ? 240 : 900,
    easing: reducedMotion ? 'ease' : 'cubic-bezier(0.22, 0.72, 0.24, 1)',
    fill: 'forwards',
  });
  if (animation) {
    await animation.finished.catch(() => undefined);
    return;
  }

  const final = keyframes[keyframes.length - 1];
  if (final.transform) {
    hero.style.transform = String(final.transform);
  }
  if (final.opacity !== undefined) {
    hero.style.opacity = String(final.opacity);
  }
}

export function showPhotoWall(options: PhotoWallOptions = {}): Promise<void> {
  const host = options.host ?? getUiRoot();
  const loadManifest = options.loadManifest ?? fetchManifest;
  const measureRect = options.measureRect ?? ((element) => element.getBoundingClientRect());
  const reducedMotion = (options.prefersReducedMotion ?? prefersReducedMotion)();
  const transition = options.transition ?? runPhotoHeroTransition;

  return new Promise<void>((resolve) => {
    const overlay = document.createElement('section');
    overlay.className = 'photo-wall';
    overlay.classList.add('photo-wall--introducing');
    overlay.dataset.photoWall = '';
    overlay.dataset.photoIntro = 'running';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '____’s photo wall');
    overlay.tabIndex = -1;

    const header = document.createElement('header');
    header.className = 'photo-wall__header';
    const heading = document.createElement('h2');
    heading.className = 'photo-wall__heading';
    heading.textContent = 'photo wall';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'photo-wall__close';
    closeButton.setAttribute('aria-label', 'Close the photo wall');
    closeButton.textContent = '×';
    header.append(heading, closeButton);

    const board = document.createElement('div');
    board.className = 'photo-wall__board';

    // One horizontal row: the mouse wheel maps to sideways travel (scroll down
    // → right, up → left), and the arrow keys page frame by frame.
    board.addEventListener(
      'wheel',
      (event) => {
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
          event.preventDefault();
          board.scrollLeft += event.deltaY;
        }
      },
      { passive: false },
    );

    const scrollStep = (): number => {
      const frame = board.querySelector<HTMLElement>('.photo-wall__frame');
      return frame ? frame.offsetWidth + 24 : 260;
    };
    const scrollByStep = (direction: 1 | -1): void => {
      if (typeof board.scrollBy === 'function') {
        board.scrollBy({ left: direction * scrollStep(), behavior: 'smooth' });
      } else {
        board.scrollLeft += direction * scrollStep();
      }
    };

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
      if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && !lightbox) {
        event.preventDefault();
        event.stopPropagation();
        scrollByStep(event.key === 'ArrowRight' ? 1 : -1);
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
      let storyFrame: HTMLElement | undefined;
      let storyImage: HTMLElement | undefined;
      items.forEach((item, index) => {
        const frame = document.createElement('button');
        frame.type = 'button';
        frame.className = 'photo-wall__frame';
        if (item.storyPhoto) {
          frame.dataset.storyPhoto = item.storyPhoto;
          storyFrame = frame;
        }
        const isEmptyFrame = !item.src && item.caption === EMPTY_FRAME_CAPTION;
        if (!item.src) {
          frame.classList.add('photo-wall__frame--placeholder');
        }
        if (isEmptyFrame) {
          frame.classList.add('photo-wall__frame--empty');
        }
        frame.style.setProperty('--rot', item.storyPhoto ? '0deg' : `${rotationFor(index)}deg`);
        frame.style.setProperty('--tone', String(item.tone));
        frame.setAttribute(
          'aria-label',
          item.caption ? `Enlarge photo: ${item.caption}` : 'Enlarge photo',
        );

        const tape = document.createElement('span');
        tape.className = 'photo-wall__tape';
        tape.setAttribute('aria-hidden', 'true');

        const media = buildMedia(item, false);
        if (item.storyPhoto) {
          storyImage = media;
        }
        frame.append(tape, media);
        if (item.caption) {
          const caption = document.createElement('span');
          caption.className = 'photo-wall__caption';
          caption.textContent = item.caption;
          frame.append(caption);
        }
        frame.addEventListener('click', () => openLightbox(item));
        board.append(frame);
      });

      if (!storyFrame || !storyImage) {
        return;
      }

      const hero = document.createElement('img');
      hero.className = 'photo-wall__hero';
      hero.dataset.photoHero = '';
      hero.setAttribute('aria-hidden', 'true');
      hero.src = BOAT_PHOTO_SRC;
      hero.alt = '';
      hero.decoding = 'async';
      overlay.append(hero);

      if (reducedMotion) {
        overlay.classList.add('photo-wall--reduced-motion');
      }
      const context: PhotoHeroTransitionContext = {
        hero,
        destination: storyImage,
        transform: calculateHeroTransform(measureRect(hero), measureRect(storyImage)),
        reducedMotion,
      };
      void transition(context).then(() => {
        if (closed) {
          return;
        }
        overlay.classList.remove('photo-wall--introducing');
        overlay.classList.add('photo-wall--ready');
        overlay.dataset.photoIntro = 'complete';
        hero.remove();
        options.onIntroComplete?.();
        overlay.focus({ preventScroll: true });
      });
    });
  });
}

/** A photo's visual: a real <img> when a src exists, else a warm gradient rect. */
function buildMedia(item: WallItem, large: boolean): HTMLElement {
  if (item.src) {
    const img = document.createElement('img');
    img.className = large ? 'photo-wall__media photo-wall__media--large' : 'photo-wall__media';
    if (item.storyPhoto && !large) {
      img.classList.add('photo-wall__media--story');
    }
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
