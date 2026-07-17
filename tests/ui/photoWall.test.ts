import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateHeroTransform,
  showPhotoWall,
  type PhotoHeroTransitionContext,
  type PhotoManifest,
} from '../../src/ui/photoWall';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function pressEscape(): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
}

beforeEach(() => {
  document.body.innerHTML = '<div id="ui-root"></div>';
});

describe('showPhotoWall', () => {
  it('calculates the measured transform from the full-screen hero to the first frame', () => {
    expect(
      calculateHeroTransform(
        { left: 10, top: 20, width: 600, height: 770 },
        { left: 210, top: 120, width: 120, height: 154 },
      ),
    ).toEqual({ translateX: 200, translateY: 100, scale: 0.2 });
  });

  it('always injects the purpose-built portrait Boatigami photo as the unrotated first frame', async () => {
    void showPhotoWall({
      loadManifest: async () => ({ photos: [{ src: '01.png', caption: 'later' }] }),
    });
    await flush();

    const frames = document.querySelectorAll<HTMLButtonElement>('.photo-wall__frame');
    expect(frames).toHaveLength(2);
    expect(frames[0]?.dataset.storyPhoto).toBe('boat');
    expect(frames[0]?.querySelector('img')?.getAttribute('src')).toBe(
      '/assets/photos/recipient-boat-wall-photo.png',
    );
    expect(frames[0]?.style.getPropertyValue('--rot')).toBe('0deg');
    expect(frames[0]?.querySelector('img')?.classList).toContain('photo-wall__media--story');
    expect(frames[1]?.querySelector('img')?.getAttribute('src')).toBe('/assets/photos/01.png');
  });

  it('holds a full-screen boat hero while it transitions into the measured first frame', async () => {
    let finish!: () => void;
    const transition = vi.fn(
      () => new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );

    void showPhotoWall({
      loadManifest: async () => ({ photos: [] }),
      prefersReducedMotion: () => false,
      measureRect: (element) =>
        element.hasAttribute('data-photo-hero')
          ? { left: 340, top: 20, width: 600, height: 770 }
          : { left: 100, top: 80, width: 120, height: 154 },
      transition,
    });
    await flush();

    const hero = document.querySelector<HTMLElement>('[data-photo-hero]');
    const destination = document.querySelector<HTMLElement>(
      '[data-story-photo="boat"] .photo-wall__media--story',
    );
    expect(hero).not.toBeNull();
    expect(hero?.tagName).toBe('IMG');
    expect(destination?.tagName).toBe('IMG');
    expect(transition).toHaveBeenCalledWith({
      hero,
      destination,
      reducedMotion: false,
      transform: {
        translateX: -240,
        translateY: 60,
        scale: 0.2,
      },
    });

    finish();
    await flush();
    expect(document.querySelector('[data-photo-hero]')).toBeNull();
    expect(document.querySelector('[data-photo-wall]')?.getAttribute('data-photo-intro')).toBe(
      'complete',
    );
  });

  it('uses a direct crossfade when reduced motion is preferred', async () => {
    let context: PhotoHeroTransitionContext | undefined;
    void showPhotoWall({
      loadManifest: async () => ({ photos: [] }),
      prefersReducedMotion: () => true,
      measureRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      transition: async (value) => {
        context = value;
      },
    });
    await flush();

    expect(context?.reducedMotion).toBe(true);
    expect(document.querySelector('[data-photo-wall]')?.classList).toContain(
      'photo-wall--reduced-motion',
    );
  });

  it('signals when the hero has finished entering the first wall frame', async () => {
    const onIntroComplete = vi.fn();
    void showPhotoWall({
      loadManifest: async () => ({ photos: [] }),
      transition: async () => undefined,
      measureRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      onIntroComplete,
    });
    await flush();
    await flush();

    expect(onIntroComplete).toHaveBeenCalledTimes(1);
  });

  it('composes the boat photo plus ~8 warm placeholders when the manifest is empty', async () => {
    void showPhotoWall({ loadManifest: async () => ({ photos: [] }) });
    await flush();

    const wall = document.querySelector('[data-photo-wall]');
    expect(wall).not.toBeNull();
    const frames = document.querySelectorAll('.photo-wall__frame');
    expect(frames).toHaveLength(9);
    // The story photo is real; the remaining eight retain the warm placeholders.
    expect(document.querySelectorAll('.photo-wall__frame--placeholder')).toHaveLength(8);
    expect(document.querySelector('.photo-wall__media--placeholder')).not.toBeNull();
    expect(
      document.querySelector('.photo-wall__frame--placeholder .photo-wall__caption')?.textContent,
    ).toBe('a photo goes here');
  });

  it('composes placeholders when the manifest is missing entirely', async () => {
    void showPhotoWall({ loadManifest: async () => undefined });
    await flush();
    expect(document.querySelectorAll('.photo-wall__frame')).toHaveLength(9);
  });

  it('renders real photos from the manifest, resolving bare filenames', async () => {
    const manifest: PhotoManifest = {
      photos: [
        { src: '01.png', caption: 'the gold hour' },
        { src: '/assets/photos/boardwalk.jpg' },
      ],
    };
    void showPhotoWall({ loadManifest: async () => manifest });
    await flush();

    const imgs = document.querySelectorAll<HTMLImageElement>('img.photo-wall__media');
    expect(imgs).toHaveLength(3);
    expect(imgs[0].getAttribute('src')).toBe(
      '/assets/photos/recipient-boat-wall-photo.png',
    );
    expect(imgs[1].getAttribute('src')).toBe('/assets/photos/01.png');
    expect(imgs[2].getAttribute('src')).toBe('/assets/photos/boardwalk.jpg');
    expect(document.querySelectorAll('.photo-wall__frame--placeholder')).toHaveLength(0);
  });

  it('opens a lightbox on click and Esc closes only it, then the wall', async () => {
    const closed = showPhotoWall({ loadManifest: async () => ({ photos: [] }) });
    await flush();

    const firstFrame = document.querySelector<HTMLButtonElement>('.photo-wall__frame');
    firstFrame?.click();
    expect(document.querySelector('[data-photo-lightbox]')).not.toBeNull();

    // First Escape closes the lightbox but leaves the wall up.
    pressEscape();
    expect(document.querySelector('[data-photo-lightbox]')).toBeNull();
    expect(document.querySelector('[data-photo-wall]')).not.toBeNull();

    // Second Escape closes the wall and resolves the promise.
    pressEscape();
    await closed;
    expect(document.querySelector('[data-photo-wall]')).toBeNull();
  });

  it('clicking the lightbox scrim closes just the lightbox', async () => {
    void showPhotoWall({ loadManifest: async () => ({ photos: [] }) });
    await flush();

    document.querySelector<HTMLButtonElement>('.photo-wall__frame')?.click();
    const lightbox = document.querySelector<HTMLElement>('[data-photo-lightbox]');
    expect(lightbox).not.toBeNull();
    // A click landing on the scrim itself (not the figure) dismisses it.
    lightbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('[data-photo-lightbox]')).toBeNull();
    expect(document.querySelector('[data-photo-wall]')).not.toBeNull();
  });

  it('the close button dismisses the wall and resolves', async () => {
    const closed = showPhotoWall({ loadManifest: async () => ({ photos: [] }) });
    await flush();

    document.querySelector<HTMLButtonElement>('.photo-wall__close')?.click();
    await closed;
    expect(document.querySelector('[data-photo-wall]')).toBeNull();
  });
});
