import type { ActivityModule } from '../activityTypes';
import type { FriendOneFishingSceneCallbacks } from './FriendOneFishingScene';

interface FishingGameHandle {
  destroy(): void;
}

type CreateFishingGame = (
  parent: HTMLElement,
  callbacks: FriendOneFishingSceneCallbacks,
) => FishingGameHandle | Promise<FishingGameHandle>;

async function createDefaultFishingGame(
  parent: HTMLElement,
  callbacks: FriendOneFishingSceneCallbacks,
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
    scene: new FriendOneFishingScene(callbacks),
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

function addKeyboardActivation(
  button: HTMLButtonElement,
  activate: () => void,
): void {
  button.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      activate();
    },
    { capture: true },
  );
}

export function createFriendOneFishingActivity(
  createFishingGame: CreateFishingGame = createDefaultFishingGame,
): ActivityModule {
  return {
    id: 'friendone-pc-fishing',
    title: '____ Fishing',
    async start({ mount, onCancel, onComplete }) {
      const testMode = isTestMode();

      mount.innerHTML = `
        <section class="activity-panel activity-panel--friendone-fishing" role="dialog" aria-label="____ Fishing">
          <h2>____ Fishing</h2>
          <div class="friendone-fishing-game">
            <div class="friendone-fishing-game__host" data-friendone-fishing-host></div>
          </div>
          <div class="activity-actions">
            <button type="button" data-friendone-fishing-cancel>Cancel</button>
            ${testMode ? '<button type="button" data-friendone-fishing-test-complete>Complete fishing</button>' : ''}
          </div>
        </section>
      `;

      const host = mount.querySelector<HTMLElement>('[data-friendone-fishing-host]');
      const cancelButton = mount.querySelector<HTMLButtonElement>(
        '[data-friendone-fishing-cancel]',
      );

      if (!host || !cancelButton) {
        throw new Error('Unable to mount ____ Fishing activity.');
      }

      let finished = false;
      let game: FishingGameHandle | null = null;

      const destroyGame = (): void => {
        game?.destroy();
        game = null;
      };

      const finish = (callback: () => void): void => {
        if (finished) {
          return;
        }

        finished = true;
        destroyGame();
        callback();
      };

      const completeFishing = (): void =>
        finish(() =>
          onComplete({
            locationId: 'friend-a',
            keepsakeId: 'glowing-koi-scale',
          }),
        );
      const cancelFishing = (): void => finish(onCancel);
      const sceneCallbacks: FriendOneFishingSceneCallbacks = {
        onComplete: completeFishing,
        onCancel: cancelFishing,
      };

      cancelButton.addEventListener('click', cancelFishing, {
        once: true,
      });
      addKeyboardActivation(cancelButton, cancelFishing);

      if (testMode) {
        const completeButton = mount.querySelector<HTMLButtonElement>(
          '[data-friendone-fishing-test-complete]',
        );

        if (!completeButton) {
          throw new Error('Unable to mount ____ Fishing activity.');
        }

        completeButton.addEventListener('click', completeFishing);
        addKeyboardActivation(completeButton, completeFishing);
      }

      try {
        const createdGame = await createFishingGame(host, sceneCallbacks);

        if (finished) {
          createdGame.destroy();
          return;
        }

        game = createdGame;
      } catch {
        cancelFishing();
      }
    },
  };
}

export const friendoneFishingActivity = createFriendOneFishingActivity();
