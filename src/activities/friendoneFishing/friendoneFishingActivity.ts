import type { ActivityModule } from '../activityTypes';

interface FishingGameHandle {
  destroy(): void;
}

type CreateFishingGame = (
  parent: HTMLElement,
) => FishingGameHandle | Promise<FishingGameHandle>;

async function createDefaultFishingGame(
  parent: HTMLElement,
): Promise<FishingGameHandle> {
  const [Phaser, { FriendOneFishingScene }] = await Promise.all([
    import('phaser'),
    import('./FriendOneFishingScene'),
  ]);

  const game = new Phaser.Game({
    backgroundColor: '#102a3a',
    height: 360,
    parent,
    scale: {
      autoCenter: Phaser.Scale.CENTER_BOTH,
      mode: Phaser.Scale.FIT,
    },
    scene: FriendOneFishingScene,
    type: Phaser.AUTO,
    width: 640,
  });

  return {
    destroy: () => game.destroy(true),
  };
}

function isTestMode(): boolean {
  return new URL(window.location.href).searchParams.get('testMode') === '1';
}

export function createFriendOneFishingActivity(
  createFishingGame: CreateFishingGame = createDefaultFishingGame,
): ActivityModule {
  return {
    id: 'friendone-pc-fishing',
    title: '____ Fishing',
    async start({ mount, onCancel, onComplete }) {
      mount.innerHTML = `
        <section class="activity-panel" role="dialog" aria-label="____ Fishing">
          <h2>____ Fishing</h2>
          <div data-friendone-fishing-host></div>
          <div class="activity-actions">
            <button type="button" data-friendone-fishing-cancel>Cancel</button>
            <button type="button" data-friendone-fishing-test-complete${isTestMode() ? '' : ' hidden'}>Complete fishing</button>
          </div>
        </section>
      `;

      const host = mount.querySelector<HTMLElement>('[data-friendone-fishing-host]');
      const cancelButton = mount.querySelector<HTMLButtonElement>(
        '[data-friendone-fishing-cancel]',
      );
      const completeButton = mount.querySelector<HTMLButtonElement>(
        '[data-friendone-fishing-test-complete]',
      );

      if (!host || !cancelButton || !completeButton) {
        throw new Error('Unable to mount ____ Fishing activity.');
      }

      const game = await createFishingGame(host);
      let finished = false;
      const finish = (callback: () => void): void => {
        if (finished) {
          return;
        }

        finished = true;
        game.destroy();
        callback();
      };

      cancelButton.addEventListener('click', () => finish(onCancel), {
        once: true,
      });
      completeButton.addEventListener('click', () =>
        finish(() =>
          onComplete({
            locationId: 'friend-a',
            keepsakeId: 'glowing-koi-scale',
          }),
        ),
      );
    },
  };
}

export const friendoneFishingActivity = createFriendOneFishingActivity();
