import type { ActivityModule } from '../activityTypes';
import { addKeyboardActivation } from '../activityDom';
import { createActivityCloseButton } from '../activityShell';
import { SPLIT_CONFIG } from './splitModel';
import type { SplitSceneCallbacks } from './SplitScene';
import { playSfx } from '../../game/audio';
import { showDialogue } from '../../ui/dialogueBox';

const CLOSE_ART_URL = '/assets/activities/valorant-split/close-x.png';

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

export function createValorantSplitActivity(
  createSplitGame: CreateSplitGame = createDefaultSplitGame,
): ActivityModule {
  return {
    id: 'valorant-split',
    title: 'RETAKE.EXE',
    async start({ mount, onCancel, onComplete }) {
      const testMode = isTestMode();

      mount.innerHTML = `
        <section class="activity-panel activity-shell activity-shell--valorant-split" role="dialog" aria-label="RETAKE.EXE">
          <h2 class="activity-shell__title">RETAKE.EXE</h2>
          <div class="activity-shell__viewport">
            <div class="valorant-split-game__host" data-valorant-split-host></div>
          </div>
          <p class="activity-shell__controls">WASD or Arrows to move · Mouse to aim · Click to fire · Hold 4 on the spike to defuse · Esc to leave</p>
          ${
            testMode
              ? '<div class="activity-shell__actions"><button type="button" data-valorant-split-test-complete>Defuse the spike</button></div>'
              : ''
          }
        </section>
      `;

      const section = mount.querySelector<HTMLElement>('.activity-shell');
      const host = mount.querySelector<HTMLElement>('[data-valorant-split-host]');

      if (!section || !host) {
        throw new Error('Unable to mount SPLIT.EXE activity.');
      }

      let finished = false;
      let game: SplitGameHandle | null = null;
      let readyPromise: Promise<void> | null = null;

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
            activityId: 'valorant-split',
            keepsakeId: 'defused-spike-charm',
          }),
        );
      const cancelSplit = (): void => finish(onCancel);
      const runLeadIn = async (): Promise<void> => {
        if (finished) {
          return;
        }

        await showDialogue([
          {
            speaker: '____',
            text: 'Omen? You don’t play Omen very often.',
            portraitId: 'portrait-recipient',
          },
        ]);

        if (finished) {
          return;
        }

        playSfx('sfx-omen-void');
        await showDialogue([
          { speaker: 'Omen', text: '~~', portraitId: 'portrait-omen' },
        ]);
      };
      const sceneCallbacks: SplitSceneCallbacks = {
        onReady: () => {
          readyPromise ??= runLeadIn();
          return readyPromise;
        },
        onComplete: completeSplit,
        onCancel: cancelSplit,
      };

      section.append(
        createActivityCloseButton({
          onClose: cancelSplit,
          dataAttr: 'data-valorant-split-cancel',
          artUrl: CLOSE_ART_URL,
        }),
      );

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
