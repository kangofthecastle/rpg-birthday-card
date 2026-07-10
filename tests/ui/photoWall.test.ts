import { beforeEach, describe, expect, it } from 'vitest';
import { showPhotoWall, type PhotoManifest } from '../../src/ui/photoWall';

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
  it('composes ~8 warm placeholder polaroids when the manifest is empty', async () => {
    void showPhotoWall({ loadManifest: async () => ({ photos: [] }) });
    await flush();

    const wall = document.querySelector('[data-photo-wall]');
    expect(wall).not.toBeNull();
    const frames = document.querySelectorAll('.photo-wall__frame');
    expect(frames).toHaveLength(8);
    // All placeholders (no real <img>), with faint captions.
    expect(document.querySelectorAll('.photo-wall__frame--placeholder')).toHaveLength(8);
    expect(document.querySelector('.photo-wall__media--placeholder')).not.toBeNull();
    expect(document.querySelector('.photo-wall__caption')?.textContent).toBe('a photo goes here');
  });

  it('composes placeholders when the manifest is missing entirely', async () => {
    void showPhotoWall({ loadManifest: async () => undefined });
    await flush();
    expect(document.querySelectorAll('.photo-wall__frame')).toHaveLength(8);
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
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute('src')).toBe('/assets/photos/01.png');
    expect(imgs[1].getAttribute('src')).toBe('/assets/photos/boardwalk.jpg');
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
