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
const CAPTURED_PHOTO_STORAGE_KEY = 'a-game:photo-wall:webcam-photo';
const PHOTO_WALL_PHOTO_ROUTE = '/__dev/photo-wall-photo';
const SAVED_PHOTO_URL = '/assets/photos/photo-wall-camera.jpg';
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

export interface PhotoHeroTransitionContext {
  readonly hero: HTMLElement;
  readonly destination: HTMLElement;
  readonly transform: HeroTransform;
  readonly reducedMotion: boolean;
}

export type PhotoHeroTransition = (
  context: PhotoHeroTransitionContext,
) => Promise<void>;

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
  /** Injectable webcam request for tests; the default runs only after a click. */
  readonly getUserMedia?: () => Promise<MediaStream>;
  /** Injectable frame capture for tests. */
  readonly capturePhoto?: (video: HTMLVideoElement) => string;
  /** Injectable countdown wait for tests; defaults to one second per number. */
  readonly countdownDelay?: (milliseconds: number) => Promise<void>;
  /** Injectable local persistence hooks for tests. */
  readonly loadCapturedPhoto?: () => string | undefined;
  readonly saveCapturedPhoto?: (src: string) => void;
  readonly clearCapturedPhoto?: () => void;
  /** Injectable game-file persistence hooks for tests. */
  readonly loadSavedGamePhoto?: () => Promise<string | undefined>;
  readonly savePhotoToGame?: (dataUrl: string) => Promise<string>;
  readonly deletePhotoFromGame?: () => Promise<void>;
  /** Injectable layout and transition hooks for tests. */
  readonly measureRect?: (element: HTMLElement) => MeasuredRect;
  readonly prefersReducedMotion?: () => boolean;
  readonly transition?: PhotoHeroTransition;
  /** Fires once the photo wall has populated and is ready. */
  readonly onIntroComplete?: () => void;
}

/** A resolved item on the wall: a real photo, or a warm placeholder. */
interface WallItem {
  caption: string;
  /** Absolute URL for a real photo, or undefined for a placeholder. */
  src?: string;
  /** Placeholder gradient seed (stable warm variation). */
  readonly tone: number;
  readonly camera?: boolean;
  savedToGame?: boolean;
}

function loadCapturedPhoto(): string | undefined {
  try {
    return localStorage.getItem(CAPTURED_PHOTO_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveCapturedPhoto(src: string): void {
  try {
    localStorage.setItem(CAPTURED_PHOTO_STORAGE_KEY, src);
  } catch {
    // The captured photo still remains for this open wall if storage is unavailable.
  }
}

function clearCapturedPhoto(): void {
  try {
    localStorage.removeItem(CAPTURED_PHOTO_STORAGE_KEY);
  } catch {
    // There is nothing else to clear when browser storage is unavailable.
  }
}

export async function loadSavedGamePhoto(
  protocol = window.location.protocol,
  request: typeof fetch = fetch,
): Promise<string | undefined> {
  try {
    const response = await request(PHOTO_WALL_PHOTO_ROUTE, { cache: 'no-cache' });
    if (response.ok) {
      const result = (await response.json()) as { exists?: boolean; src?: string };
      if (result.exists && typeof result.src === 'string') return result.src;
    }
  } catch {
    // Packaged builds do not expose the Vite-only save route.
  }

  if (protocol !== 'app:') return undefined;

  try {
    const response = await request(SAVED_PHOTO_URL, { cache: 'no-cache' });
    return response.ok ? SAVED_PHOTO_URL : undefined;
  } catch {
    return undefined;
  }
}

async function savePhotoToGame(dataUrl: string): Promise<string> {
  const response = await fetch(PHOTO_WALL_PHOTO_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataUrl }),
  });
  if (!response.ok) {
    throw new Error('The photo could not be written to the game files.');
  }
  const result = (await response.json()) as { src?: string };
  if (typeof result.src !== 'string') {
    throw new Error('The game did not return the saved photo path.');
  }
  return result.src;
}

async function deletePhotoFromGame(): Promise<void> {
  const response = await fetch(PHOTO_WALL_PHOTO_ROUTE, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error('The saved photo could not be deleted from the game files.');
  }
}

function requestWebcam(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error('Camera access is unavailable in this browser.'));
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
    audio: false,
  });
}

function captureVideoFrame(video: HTMLVideoElement): string {
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('The camera frame could not be captured.');
  }
  // Match the mirrored selfie preview in the saved photograph.
  context.translate(width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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
    duration: reducedMotion ? 200 : 900,
    easing: reducedMotion ? 'ease' : 'cubic-bezier(0.22, 0.72, 0.24, 1)',
    fill: 'forwards',
  });
  if (animation) {
    await animation.finished.catch(() => undefined);
  }
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

function resolveItems(
  manifest: PhotoManifest | undefined,
  capturedPhoto: string | undefined,
  savedGamePhoto: string | undefined,
): WallItem[] {
  // The packaged fallback is the canonical game asset. Prefer it over a stale
  // webcam data URL left in localStorage so the read-only build does not offer
  // to save a photo that is already bundled inside the app.
  const bundledGamePhoto = savedGamePhoto === SAVED_PHOTO_URL;
  const cameraPhoto = bundledGamePhoto
    ? savedGamePhoto
    : capturedPhoto ?? savedGamePhoto;
  const camera: WallItem = {
    caption: cameraPhoto ? 'today' : 'take a photo',
    src: cameraPhoto,
    tone: 0,
    camera: true,
    savedToGame:
      bundledGamePhoto ||
      (Boolean(savedGamePhoto) &&
        (!capturedPhoto || capturedPhoto.startsWith(SAVED_PHOTO_URL))),
  };
  const photos = manifest?.photos ?? [];
  if (photos.length > 0) {
    const realPhotos: WallItem[] = photos.slice(0, 29).map((photo, index) => ({
      caption: photo.caption ?? '',
      src: photo.src.startsWith('/') || /^https?:/.test(photo.src)
        ? photo.src
        : `${PHOTO_BASE}${photo.src}`,
      tone: (index + 1) % PLACEHOLDER_CAPTIONS.length,
    }));
    const remainingPlaceholders = Math.max(0, PLACEHOLDER_COUNT - realPhotos.length);
    return [
      camera,
      ...realPhotos,
      ...Array.from({ length: remainingPlaceholders }, (_unused, index) => ({
        caption: PLACEHOLDER_CAPTIONS[(realPhotos.length + index) % PLACEHOLDER_CAPTIONS.length],
        tone: (realPhotos.length + index) % PLACEHOLDER_CAPTIONS.length,
      })),
    ];
  }
  // Empty / missing manifest → soft placeholders so the wall feels composed.
  return [
    camera,
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

export function showPhotoWall(options: PhotoWallOptions = {}): Promise<void> {
  const host = options.host ?? getUiRoot();
  const loadManifest = options.loadManifest ?? fetchManifest;
  const getUserMedia = options.getUserMedia ?? requestWebcam;
  const capturePhoto = options.capturePhoto ?? captureVideoFrame;
  const countdownDelay = options.countdownDelay ?? wait;
  const readCapturedPhoto = options.loadCapturedPhoto ?? loadCapturedPhoto;
  const persistCapturedPhoto = options.saveCapturedPhoto ?? saveCapturedPhoto;
  const removeCapturedPhoto = options.clearCapturedPhoto ?? clearCapturedPhoto;
  const readSavedGamePhoto = options.loadSavedGamePhoto ?? loadSavedGamePhoto;
  const writePhotoToGame = options.savePhotoToGame ?? savePhotoToGame;
  const removePhotoFromGame = options.deletePhotoFromGame ?? deletePhotoFromGame;
  const measureRect = options.measureRect ?? ((element) => element.getBoundingClientRect());
  const reducedMotion = (options.prefersReducedMotion ?? prefersReducedMotion)();
  const transition = options.transition ?? runPhotoHeroTransition;

  return new Promise<void>((resolve) => {
    const overlay = document.createElement('section');
    overlay.className = 'photo-wall';
    overlay.dataset.photoWall = '';
    overlay.dataset.photoIntro = 'complete';
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
    let captureHero: HTMLElement | undefined;
    let cameraStream: MediaStream | undefined;
    let introComplete = false;
    let closed = false;
    let refreshCameraControls: (() => void) | undefined;

    const closeLightbox = (): void => {
      if (lightbox) {
        lightbox.remove();
        lightbox = undefined;
      }
    };

    const stopCamera = (): void => {
      cameraStream?.getTracks().forEach((track) => track.stop());
      cameraStream = undefined;
    };

    const revealWall = (): void => {
      overlay.classList.remove('photo-wall--introducing');
      overlay.classList.add('photo-wall--ready');
      overlay.dataset.photoIntro = 'complete';
      if (!introComplete) {
        introComplete = true;
        options.onIntroComplete?.();
      }
      overlay.focus({ preventScroll: true });
    };

    const removeCaptureHero = (): void => {
      stopCamera();
      captureHero?.remove();
      captureHero = undefined;
    };

    const updateCameraFrame = (frame: HTMLElement, item: WallItem): HTMLElement => {
      const oldMedia = frame.querySelector<HTMLElement>('.photo-wall__media');
      const media = buildMedia(item, false);
      oldMedia?.replaceWith(media);
      const caption = frame.querySelector<HTMLElement>('.photo-wall__caption');
      if (caption) {
        caption.textContent = item.caption;
      }
      frame.setAttribute(
        'aria-label',
        item.src ? 'Retake photo with webcam' : 'Take photo with webcam',
      );
      return media;
    };

    const buildFileControls = (item: WallItem, frame: HTMLElement): HTMLElement => {
      const controls = document.createElement('div');
      controls.className = 'photo-wall__file-controls';

      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'photo-wall__file-button photo-wall__file-save';
      saveButton.setAttribute('aria-label', 'Save photo to game files');
      saveButton.title = 'Save photo to game files';
      saveButton.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5V3Zm3 2v5h8V5H8Zm0 9v5h8v-5H8Z"/></svg>';

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'photo-wall__file-button photo-wall__file-delete';
      deleteButton.setAttribute('aria-label', 'Delete photo');
      deleteButton.title = 'Delete photo';
      deleteButton.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l1 2h4v2H3V6h4l1-2Zm-2 6h12l-1 11H7L6 10Zm3 2v6h2v-6H9Zm4 0v6h2v-6h-2Z"/></svg>';

      const fileStatus = document.createElement('span');
      fileStatus.className = 'photo-wall__file-status';
      fileStatus.setAttribute('aria-live', 'polite');

      const refresh = (): void => {
        const hasPhoto = Boolean(item.src);
        const hasUnsavedJpeg = item.src?.startsWith('data:image/jpeg;base64,') ?? false;
        saveButton.disabled = !hasUnsavedJpeg || Boolean(item.savedToGame);
        deleteButton.disabled = !hasPhoto;
        saveButton.classList.toggle('is-saved', Boolean(item.savedToGame));
        fileStatus.textContent = item.savedToGame
          ? 'saved in game files'
          : hasPhoto
            ? 'not saved yet'
            : 'no photo yet';
      };
      refreshCameraControls = refresh;

      saveButton.addEventListener('click', async () => {
        if (!item.src || item.savedToGame || !item.src.startsWith('data:image/jpeg;base64,')) {
          return;
        }
        saveButton.disabled = true;
        deleteButton.disabled = true;
        fileStatus.textContent = 'saving…';
        try {
          const savedSrc = await writePhotoToGame(item.src);
          item.src = savedSrc;
          item.savedToGame = true;
          persistCapturedPhoto(savedSrc);
          updateCameraFrame(frame, item);
          refresh();
        } catch {
          fileStatus.textContent = 'could not save to game files';
          saveButton.disabled = false;
          deleteButton.disabled = false;
        }
      });

      deleteButton.addEventListener('click', async () => {
        if (!item.src) return;
        saveButton.disabled = true;
        deleteButton.disabled = true;
        fileStatus.textContent = 'deleting…';
        try {
          if (item.savedToGame) {
            await removePhotoFromGame();
          }
          removeCapturedPhoto();
          item.src = undefined;
          item.caption = 'take a photo';
          item.savedToGame = false;
          updateCameraFrame(frame, item);
          refresh();
        } catch {
          fileStatus.textContent = 'could not delete the saved file';
          refresh();
        }
      });

      controls.append(saveButton, deleteButton, fileStatus);
      refresh();
      return controls;
    };

    const openCaptureHero = (item: WallItem, destination: HTMLElement): void => {
      closeLightbox();
      removeCaptureHero();
      overlay.classList.remove('photo-wall--ready');
      overlay.classList.add('photo-wall--introducing');
      overlay.dataset.photoIntro = 'running';

      const hero = document.createElement('section');
      hero.className = 'photo-wall__camera-hero';
      hero.dataset.photoHero = '';
      hero.setAttribute('role', 'dialog');
      hero.setAttribute('aria-label', 'Take a photo');

      const tape = document.createElement('span');
      tape.className = 'photo-wall__tape';
      tape.setAttribute('aria-hidden', 'true');

      const cameraButton = document.createElement('button');
      cameraButton.type = 'button';
      cameraButton.className = 'photo-wall__camera-trigger';

      const status = document.createElement('p');
      status.className = 'photo-wall__camera-status';

      const actions = document.createElement('div');
      actions.className = 'photo-wall__camera-actions';

      const renderStill = (): void => {
        cameraButton.disabled = false;
        cameraButton.replaceChildren(buildMedia(item, true));
        cameraButton.setAttribute(
          'aria-label',
          item.src ? 'Retake photo with webcam' : 'Open webcam',
        );
        status.textContent = item.src ? 'retake this photo' : 'take a photo';
        actions.replaceChildren();
      };

      cameraButton.addEventListener('click', async () => {
        cameraButton.disabled = true;
        status.textContent = 'allow camera access…';
        try {
          const stream = await getUserMedia();
          if (closed || captureHero !== hero) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          cameraStream = stream;
          const video = document.createElement('video');
          video.className = 'photo-wall__camera-preview';
          video.autoplay = true;
          video.muted = true;
          video.playsInline = true;
          video.srcObject = stream;
          cameraButton.replaceChildren(video);
          cameraButton.setAttribute('aria-label', 'Camera preview');
          status.textContent = 'when you’re ready';

          const shutter = document.createElement('button');
          shutter.type = 'button';
          shutter.className = 'photo-wall__camera-shutter';
          shutter.textContent = 'take photo';

          const cancel = document.createElement('button');
          cancel.type = 'button';
          cancel.className = 'photo-wall__camera-cancel';
          cancel.textContent = 'cancel';

          cancel.addEventListener('click', () => {
            stopCamera();
            renderStill();
          });
          shutter.addEventListener('click', async () => {
            const countdown = document.createElement('span');
            countdown.className = 'photo-wall__camera-countdown';
            countdown.setAttribute('aria-live', 'assertive');
            cameraButton.append(countdown);
            shutter.disabled = true;
            cancel.disabled = true;
            try {
              status.textContent = 'hold still';
              for (const number of ['3', '2', '1']) {
                if (closed || captureHero !== hero) {
                  return;
                }
                countdown.textContent = number;
                await countdownDelay(1_000);
              }
              if (closed || captureHero !== hero) {
                return;
              }
              const src = capturePhoto(video);
              item.src = src;
              item.caption = 'today';
              item.savedToGame = false;
              persistCapturedPhoto(src);
              const destinationMedia = updateCameraFrame(destination, item);
              refreshCameraControls?.();
              stopCamera();
              cameraButton.replaceChildren(buildMedia(item, true));
              status.textContent = 'today';
              actions.replaceChildren();
              await transition({
                hero,
                destination: destinationMedia,
                transform: calculateHeroTransform(measureRect(hero), measureRect(destinationMedia)),
                reducedMotion,
              });
              if (!closed && captureHero === hero) {
                removeCaptureHero();
                revealWall();
              }
            } catch {
              countdown.remove();
              shutter.disabled = false;
              cancel.disabled = false;
              status.textContent = 'That photo could not be saved. Try again.';
            }
          });
          actions.replaceChildren(shutter, cancel);
        } catch {
          cameraButton.disabled = false;
          status.textContent = 'Camera unavailable. Allow access, then try again.';
          actions.replaceChildren();
        }
      });

      hero.append(tape, cameraButton, status, actions);
      captureHero = hero;
      overlay.append(hero);
      renderStill();
      cameraButton.focus({ preventScroll: true });
    };

    const close = (): void => {
      if (closed) {
        return;
      }
      closed = true;
      closeLightbox();
      removeCaptureHero();
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
      const media = buildMedia(item, true);
      figure.append(media);
      if (media instanceof HTMLImageElement) {
        const syncPhotoAspect = (): void => {
          if (media.naturalWidth <= 0 || media.naturalHeight <= 0) return;
          figure.style.setProperty(
            '--photo-aspect',
            String(media.naturalWidth / media.naturalHeight),
          );
          figure.classList.add('photo-wall__lightbox-figure--photo');
        };
        if (media.complete) {
          syncPhotoAspect();
        } else {
          media.addEventListener('load', syncPhotoAspect, { once: true });
        }
      }
      if (item.caption) {
        figure.classList.add('photo-wall__lightbox-figure--captioned');
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
      if (
        (event.key === 'ArrowRight' || event.key === 'ArrowLeft') &&
        !lightbox &&
        !captureHero
      ) {
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
      if (captureHero) {
        removeCaptureHero();
        revealWall();
      } else if (lightbox) {
        closeLightbox();
      } else {
        close();
      }
    };

    closeButton.addEventListener('click', close);
    document.addEventListener('keydown', onKeydown, true);

    void Promise.all([loadManifest(), readSavedGamePhoto()]).then(([manifest, savedGamePhoto]) => {
      if (closed) {
        return;
      }
      const items = resolveItems(manifest, readCapturedPhoto(), savedGamePhoto);
      let cameraItem: WallItem | undefined;
      let cameraFrame: HTMLElement | undefined;
      items.forEach((item, index) => {
        const frame = document.createElement('button');
        frame.type = 'button';
        frame.className = 'photo-wall__frame';
        const isEmptyFrame = !item.camera && !item.src && item.caption === EMPTY_FRAME_CAPTION;
        if (item.camera) {
          frame.classList.add('photo-wall__frame--camera');
          frame.dataset.cameraPhoto = '';
          frame.setAttribute(
            'aria-label',
            item.src ? 'Retake photo with webcam' : 'Take photo with webcam',
          );
          cameraItem = item;
          cameraFrame = frame;
        } else if (!item.src) {
          frame.classList.add('photo-wall__frame--placeholder');
        }
        if (isEmptyFrame) {
          frame.classList.add('photo-wall__frame--empty');
        }
        frame.style.setProperty('--rot', `${rotationFor(index)}deg`);
        frame.style.setProperty('--tone', String(item.tone));
        if (!item.camera) {
          frame.setAttribute(
            'aria-label',
            item.caption ? `Enlarge photo: ${item.caption}` : 'Enlarge photo',
          );
        }

        const tape = document.createElement('span');
        tape.className = 'photo-wall__tape';
        tape.setAttribute('aria-hidden', 'true');

        const media = buildMedia(item, false);
        frame.append(tape, media);
        if (item.caption) {
          frame.classList.add('photo-wall__frame--captioned');
          const caption = document.createElement('span');
          caption.className = 'photo-wall__caption';
          caption.textContent = item.caption;
          frame.append(caption);
        }
        frame.addEventListener('click', () => {
          if (item.camera) {
            openCaptureHero(item, frame);
          } else {
            openLightbox(item);
          }
        });
        if (item.camera) {
          const cameraSlot = document.createElement('div');
          cameraSlot.className = 'photo-wall__camera-slot';
          cameraSlot.style.setProperty('--rot', `${rotationFor(index)}deg`);
          cameraSlot.append(frame, buildFileControls(item, frame));
          board.append(cameraSlot);
        } else {
          board.append(frame);
        }
      });
      if (cameraItem && cameraFrame && !cameraItem.src) {
        openCaptureHero(cameraItem, cameraFrame);
      } else {
        revealWall();
      }
    });
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
  if (item.camera) {
    const camera = document.createElement('span');
    camera.className = large
      ? 'photo-wall__media photo-wall__camera-placeholder photo-wall__media--large'
      : 'photo-wall__media photo-wall__camera-placeholder';
    const icon = document.createElement('span');
    icon.className = 'photo-wall__camera-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '📷';
    camera.append(icon);
    return camera;
  }
  const rect = document.createElement('span');
  rect.className = large
    ? 'photo-wall__media photo-wall__media--placeholder photo-wall__media--large'
    : 'photo-wall__media photo-wall__media--placeholder';
  rect.style.setProperty('--tone', String(item.tone));
  rect.setAttribute('aria-hidden', 'true');
  return rect;
}
