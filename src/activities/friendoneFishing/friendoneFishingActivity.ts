import type { ActivityModule } from '../activityTypes';
import { addKeyboardActivation } from '../activityDom';
import { createActivityCloseButton } from '../activityShell';
import type { FriendOneFishingSceneCallbacks } from './FriendOneFishingScene';

const CLOSE_ART_URL = '/assets/activities/friendone-fishing/close-x.png';

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

export function createFriendOneFishingActivity(
  createFishingGame: CreateFishingGame = createDefaultFishingGame,
): ActivityModule {
  return {
    id: 'friendone-pc-fishing',
    title: '____ Fishing',
    async start({ mount, onCancel, onComplete }) {
      const testMode = isTestMode();

      mount.innerHTML = `
        <section class="activity-panel activity-shell activity-shell--fishing" role="dialog" aria-label="____ Fishing">
          <h2 class="activity-shell__title">Fishing</h2>
          <div class="activity-shell__viewport">
            <div class="friendone-fishing-game__host" data-friendone-fishing-host></div>
          </div>
          <p class="activity-shell__controls">Hold Space, Enter, or click to lift the fish · Keep it inside the green bar · Esc to leave</p>
          ${
            testMode
              ? '<div class="activity-shell__actions"><button type="button" data-friendone-fishing-test-complete>Complete fishing</button></div>'
              : ''
          }
        </section>
      `;

      const section = mount.querySelector<HTMLElement>('.activity-shell');
      const host = mount.querySelector<HTMLElement>('[data-friendone-fishing-host]');

      if (!section || !host) {
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
            activityId: 'friendone-pc-fishing',
            keepsakeId: 'glowing-koi-scale',
          }),
        );
      const cancelFishing = (): void => finish(onCancel);
      const sceneCallbacks: FriendOneFishingSceneCallbacks = {
        onComplete: completeFishing,
        onCancel: cancelFishing,
      };

      section.append(
        createActivityCloseButton({
          onClose: cancelFishing,
          dataAttr: 'data-friendone-fishing-cancel',
          artUrl: CLOSE_ART_URL,
        }),
      );

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
