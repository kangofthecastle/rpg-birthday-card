import type { ActivityModule } from '../activityTypes';
import { SPLIT_CONFIG } from './splitModel';
import type { SplitSceneCallbacks } from './SplitScene';

interface SplitGameHandle {
  destroy(): void;
}

type CreateSplitGame = (
  parent: HTMLElement,
  callbacks: SplitSceneCallbacks,
) => SplitGameHandle | Promise<SplitGameHandle>;

async function createDefaultSplitGame(
  parent: HTMLElement,
  callbacks: SplitSceneCallbacks,
): Promise<SplitGameHandle> {
  const [Phaser, { SplitScene }] = await Promise.all([
    import('phaser'),
    import('./SplitScene'),
  ]);

  const game = new Phaser.Game({
    backgroundColor: '#14171d',
    height: SPLIT_CONFIG.arena.height,
    parent,
    scale: {
      autoCenter: Phaser.Scale.CENTER_BOTH,
      mode: Phaser.Scale.FIT,
    },
    scene: new SplitScene(callbacks),
    type: Phaser.AUTO,
    width: SPLIT_CONFIG.arena.width,
  });

  return {
    destroy: () => game.destroy(true),
  };
}

function isTestMode(): boolean {
  return new URL(window.location.href).searchParams.get('testMode') === '1';
}

function addKeyboardActivation(button: HTMLButtonElement, activate: () => void): void {
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

export function createValorantSplitActivity(
  createSplitGame: CreateSplitGame = createDefaultSplitGame,
): ActivityModule {
  return {
    id: 'valorant-split',
    title: 'SPLIT.EXE',
    async start({ mount, onCancel, onComplete }) {
      const testMode = isTestMode();

      mount.innerHTML = `
        <section class="activity-panel activity-panel--valorant-split" role="dialog" aria-label="SPLIT.EXE">
          <h2>SPLIT.EXE</h2>
          <div class="valorant-split-game">
            <div class="valorant-split-game__host" data-valorant-split-host></div>
          </div>
          <div class="activity-actions">
            <button type="button" data-valorant-split-cancel>Cancel</button>
            ${testMode ? '<button type="button" data-valorant-split-test-complete>Defuse the spike</button>' : ''}
          </div>
        </section>
      `;

      const host = mount.querySelector<HTMLElement>('[data-valorant-split-host]');
      const cancelButton = mount.querySelector<HTMLButtonElement>('[data-valorant-split-cancel]');

      if (!host || !cancelButton) {
        throw new Error('Unable to mount SPLIT.EXE activity.');
      }

      let finished = false;
      let game: SplitGameHandle | null = null;

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

      const completeSplit = (): void =>
        finish(() =>
          onComplete({
            locationId: 'friend-b',
            keepsakeId: 'defused-spike-charm',
          }),
        );
      const cancelSplit = (): void => finish(onCancel);
      const sceneCallbacks: SplitSceneCallbacks = {
        onComplete: completeSplit,
        onCancel: cancelSplit,
      };

      cancelButton.addEventListener('click', cancelSplit, { once: true });
      addKeyboardActivation(cancelButton, cancelSplit);

      if (testMode) {
        const completeButton = mount.querySelector<HTMLButtonElement>(
          '[data-valorant-split-test-complete]',
        );

        if (!completeButton) {
          throw new Error('Unable to mount SPLIT.EXE activity.');
        }

        completeButton.addEventListener('click', completeSplit);
        addKeyboardActivation(completeButton, completeSplit);
      }

      try {
        const createdGame = await createSplitGame(host, sceneCallbacks);

        if (finished) {
          createdGame.destroy();
          return;
        }

        game = createdGame;
      } catch {
        cancelSplit();
      }
    },
  };
}

export const valorantSplitActivity = createValorantSplitActivity();
