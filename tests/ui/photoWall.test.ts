import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  showPhotoWall,
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
  window.localStorage.clear();
});

describe('showPhotoWall', () => {
  it('keeps the first frame as a camera slot and never injects the boat photo', async () => {
    void showPhotoWall({
      loadManifest: async () => ({ photos: [{ src: '01.png', caption: 'later' }] }),
    });
    await flush();

    const frames = document.querySelectorAll<HTMLButtonElement>('.photo-wall__frame');
    expect(frames).toHaveLength(9);
    expect(frames[0]?.hasAttribute('data-camera-photo')).toBe(true);
    expect(frames[0]?.querySelector('.photo-wall__camera-icon')).not.toBeNull();
    expect(frames[1]?.querySelector('img')?.getAttribute('src')).toBe('/assets/photos/01.png');
    expect(document.querySelectorAll('.photo-wall__frame--placeholder')).toHaveLength(7);
    expect(document.querySelector('[data-photo-hero]')).not.toBeNull();
    expect(document.querySelector('.photo-wall__camera-cancel')).toBeNull();
  });

  it('signals when the wall is ready', async () => {
    const onIntroComplete = vi.fn();
    void showPhotoWall({
      loadManifest: async () => ({ photos: [] }),
      onIntroComplete,
    });
    await flush();
    await flush();

    expect(onIntroComplete).not.toHaveBeenCalled();
    pressEscape();
    expect(onIntroComplete).toHaveBeenCalledTimes(1);
  });

  it('composes eight warm placeholders when the manifest is empty', async () => {
    void showPhotoWall({ loadManifest: async () => ({ photos: [] }) });
    await flush();

    const wall = document.querySelector('[data-photo-wall]');
    expect(wall).not.toBeNull();
    const frames = document.querySelectorAll('.photo-wall__frame');
    expect(frames).toHaveLength(9);
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

  it('renders real photos from the manifest and keeps remaining empty frames', async () => {
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
    expect(document.querySelectorAll('.photo-wall__frame')).toHaveLength(9);
    expect(document.querySelectorAll('.photo-wall__frame--placeholder')).toHaveLength(6);
  });

  it('captures a webcam photo and transitions it into the camera frame', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop }],
    }) as unknown as MediaStream);
    const capturePhoto = vi.fn(() => 'data:image/jpeg;base64,new-photo');
    const saveCapturedPhoto = vi.fn();
    const transition = vi.fn(async () => undefined);
    const countdownNumbers: string[] = [];

    void showPhotoWall({
      loadManifest: async () => ({ photos: [] }),
      getUserMedia,
      capturePhoto,
      countdownDelay: async () => {
        countdownNumbers.push(
          document.querySelector('.photo-wall__camera-countdown')?.textContent ?? '',
        );
      },
      saveCapturedPhoto,
      measureRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      transition,
    });
    await flush();

    document.querySelector<HTMLButtonElement>('.photo-wall__camera-trigger')?.click();
    await flush();
    document.querySelector<HTMLButtonElement>('.photo-wall__camera-shutter')?.click();
    await flush();
    await flush();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(capturePhoto).toHaveBeenCalledTimes(1);
    expect(countdownNumbers).toEqual(['3', '2', '1']);
    expect(saveCapturedPhoto).toHaveBeenCalledWith('data:image/jpeg;base64,new-photo');
    expect(transition).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-photo-hero]')).toBeNull();
    expect(
      document.querySelector<HTMLImageElement>('[data-camera-photo] img')?.getAttribute('src'),
    ).toBe('data:image/jpeg;base64,new-photo');
    expect(document.querySelector<HTMLButtonElement>('.photo-wall__file-save')?.disabled).toBe(
      false,
    );
  });

  it('saves a captured photo to the game asset and can delete it again', async () => {
    const stop = vi.fn();
    const saveCapturedPhoto = vi.fn();
    const clearCapturedPhoto = vi.fn();
    const savePhotoToGame = vi.fn(async () =>
      '/assets/photos/photo-wall-camera.jpg?v=123',
    );
    const deletePhotoFromGame = vi.fn(async () => undefined);

    void showPhotoWall({
      loadManifest: async () => ({ photos: [] }),
      loadSavedGamePhoto: async () => undefined,
      getUserMedia: async () => ({
        getTracks: () => [{ stop }],
      }) as unknown as MediaStream,
      capturePhoto: () => 'data:image/jpeg;base64,new-photo',
      countdownDelay: async () => undefined,
      saveCapturedPhoto,
      clearCapturedPhoto,
      savePhotoToGame,
      deletePhotoFromGame,
      measureRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      transition: async () => undefined,
    });
    await flush();

    document.querySelector<HTMLButtonElement>('.photo-wall__camera-trigger')?.click();
    await flush();
    document.querySelector<HTMLButtonElement>('.photo-wall__camera-shutter')?.click();
    await flush();
    await flush();

    document.querySelector<HTMLButtonElement>('.photo-wall__file-save')?.click();
    await flush();

    expect(savePhotoToGame).toHaveBeenCalledWith('data:image/jpeg;base64,new-photo');
    expect(saveCapturedPhoto).toHaveBeenLastCalledWith(
      '/assets/photos/photo-wall-camera.jpg?v=123',
    );
    expect(document.querySelector('.photo-wall__file-status')?.textContent).toBe(
      'saved in game files',
    );
    expect(document.querySelector<HTMLButtonElement>('.photo-wall__file-save')?.disabled).toBe(
      true,
    );

    document.querySelector<HTMLButtonElement>('.photo-wall__file-delete')?.click();
    await flush();

    expect(deletePhotoFromGame).toHaveBeenCalledTimes(1);
    expect(clearCapturedPhoto).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-camera-photo] img')).toBeNull();
    expect(document.querySelector('[data-camera-photo] .photo-wall__camera-icon')).not.toBeNull();
    expect(document.querySelector('.photo-wall__file-status')?.textContent).toBe('no photo yet');
  });

  it('loads a photo that was previously saved in the game files', async () => {
    void showPhotoWall({
      loadManifest: async () => ({ photos: [] }),
      loadCapturedPhoto: () => undefined,
      loadSavedGamePhoto: async () => '/assets/photos/photo-wall-camera.jpg?v=456',
    });
    await flush();

    expect(
      document.querySelector<HTMLImageElement>('[data-camera-photo] img')?.getAttribute('src'),
    ).toBe('/assets/photos/photo-wall-camera.jpg?v=456');
    expect(document.querySelector<HTMLButtonElement>('.photo-wall__file-save')?.disabled).toBe(
      true,
    );
    expect(document.querySelector<HTMLButtonElement>('.photo-wall__file-delete')?.disabled).toBe(
      false,
    );
    expect(document.querySelector('.photo-wall__file-status')?.textContent).toBe(
      'saved in game files',
    );
  });

  it('opens a lightbox on click and Esc closes only it, then the wall', async () => {
    const closed = showPhotoWall({ loadManifest: async () => ({ photos: [] }) });
    await flush();
    pressEscape();

    const firstFrame = document.querySelector<HTMLButtonElement>('.photo-wall__frame--placeholder');
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

  it('sizes a focused real photo from its displayed orientation', async () => {
    void showPhotoWall({
      loadManifest: async () => ({
        photos: [{ src: 'portrait.jpg', caption: 'portrait memory' }],
      }),
    });
    await flush();
    pressEscape();

    document
      .querySelector<HTMLImageElement>('img[src="/assets/photos/portrait.jpg"]')
      ?.closest<HTMLButtonElement>('.photo-wall__frame')
      ?.click();

    const largePhoto = document.querySelector<HTMLImageElement>(
      '.photo-wall__media--large',
    );
    Object.defineProperties(largePhoto, {
      naturalWidth: { configurable: true, value: 1350 },
      naturalHeight: { configurable: true, value: 1800 },
    });
    largePhoto?.dispatchEvent(new Event('load'));

    const figure = document.querySelector<HTMLElement>('.photo-wall__lightbox-figure');
    expect(figure?.classList.contains('photo-wall__lightbox-figure--photo')).toBe(true);
    expect(figure?.style.getPropertyValue('--photo-aspect')).toBe('0.75');
  });

  it('clicking the lightbox scrim closes just the lightbox', async () => {
    void showPhotoWall({ loadManifest: async () => ({ photos: [] }) });
    await flush();
    pressEscape();

    document.querySelector<HTMLButtonElement>('.photo-wall__frame--placeholder')?.click();
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
