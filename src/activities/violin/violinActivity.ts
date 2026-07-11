import type { ActivityModule } from '../activityTypes';
import { addKeyboardActivation } from '../activityDom';
import type { ViolinSceneCallbacks } from './ViolinScene';
import './violin.css';

interface ViolinGameHandle {
  destroy(): void;
}

type CreateViolinGame = (
  parent: HTMLElement,
  callbacks: ViolinSceneCallbacks,
) => ViolinGameHandle | Promise<ViolinGameHandle>;

async function createDefaultViolinGame(
  parent: HTMLElement,
  callbacks: ViolinSceneCallbacks,
): Promise<ViolinGameHandle> {
  const [Phaser, { ViolinScene }] = await Promise.all([
    import('phaser'),
    import('./ViolinScene'),
  ]);

  const game = new Phaser.Game({
    backgroundColor: '#1c1622',
    // The scene is authored in a 640x360 logical space but rendered into a 2x
    // backing buffer (1280x720): the near-fullscreen panel then upscales a sharp
    // buffer instead of a chunky 640-wide one. ViolinScene applies the matching
    // camera zoom + text resolution; Scale.FIT fits the crisp buffer to the panel.
    height: 720,
    parent,
    scale: {
      autoCenter: Phaser.Scale.CENTER_BOTH,
      mode: Phaser.Scale.FIT,
    },
    scene: new ViolinScene(callbacks),
    type: Phaser.AUTO,
    width: 1280,
  });

  return {
    destroy: () => game.destroy(true),
  };
}

function isTestMode(): boolean {
  return new URL(window.location.href).searchParams.get('testMode') === '1';
}

export function createViolinActivity(
  createViolinGame: CreateViolinGame = createDefaultViolinGame,
): ActivityModule {
  return {
    id: 'recipient-violin-piece',
    title: 'the piece on the stand',
    async start({ mount, onCancel, onComplete }) {
      const testMode = isTestMode();

      mount.innerHTML = `
        <section class="activity-panel activity-panel--violin" role="dialog" aria-label="the piece on the stand">
          <h2>the piece on the stand</h2>
          <p class="violin-game__caption">It has waited on the stand all this while. Both parts are ready now — play it through, and let it finish.</p>
          <div class="violin-game">
            <div class="violin-game__host" data-violin-host></div>
          </div>
          <div class="activity-actions">
            <button type="button" data-violin-cancel>Cancel</button>
            ${testMode ? '<button type="button" data-violin-test-complete>Finish the piece</button>' : ''}
          </div>
        </section>
      `;

      const host = mount.querySelector<HTMLElement>('[data-violin-host]');
      const cancelButton = mount.querySelector<HTMLButtonElement>('[data-violin-cancel]');

      if (!host || !cancelButton) {
        throw new Error('Unable to mount the violin activity.');
      }

      let finished = false;
      let game: ViolinGameHandle | null = null;

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

      const completePiece = (): void =>
        finish(() =>
          onComplete({
            locationId: 'recipient-house',
            keepsakeId: 'golden-hour-photo',
          }),
        );
      const cancelPiece = (): void => finish(onCancel);
      const sceneCallbacks: ViolinSceneCallbacks = {
        onComplete: completePiece,
        onCancel: cancelPiece,
      };

      cancelButton.addEventListener('click', cancelPiece, { once: true });
      addKeyboardActivation(cancelButton, cancelPiece);

      if (testMode) {
        const completeButton = mount.querySelector<HTMLButtonElement>('[data-violin-test-complete]');

        if (!completeButton) {
          throw new Error('Unable to mount the violin activity.');
        }

        completeButton.addEventListener('click', completePiece);
        addKeyboardActivation(completeButton, completePiece);
      }

      try {
        const createdGame = await createViolinGame(host, sceneCallbacks);

        if (finished) {
          createdGame.destroy();
          return;
        }

        game = createdGame;
      } catch {
        cancelPiece();
      }
    },
  };
}

export const violinActivity = createViolinActivity();
