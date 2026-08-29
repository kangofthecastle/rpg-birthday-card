import type { ActivityModule } from '../activityTypes';
import { addKeyboardActivation } from '../activityDom';
import { createActivityCloseButton } from '../activityShell';
import type { ViolinSceneCallbacks } from './ViolinScene';
import { prepareViolinSamples } from '../../game/audio';
import { RHYTHM_KEY_HINT, VIOLIN_PASS_SCORE } from './violinModel';
import './violin.css';

const CLOSE_ART_URL = '/assets/activities/violin/close-x.png';

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
      await prepareViolinSamples();
      const testMode = isTestMode();

      mount.innerHTML = `
        <section class="activity-panel activity-shell activity-shell--violin" role="dialog" aria-label="the piece on the stand">
          <h2 class="activity-shell__title">The piece on the stand</h2>
          <div class="activity-shell__viewport">
            <div class="violin-game__host" data-violin-host></div>
          </div>
          <p class="activity-shell__controls">Press Space to begin · play each note at the line · ${RHYTHM_KEY_HINT} · score ${VIOLIN_PASS_SCORE.toLocaleString()} to pass · Esc to leave</p>
          ${
            testMode
              ? '<div class="activity-shell__actions"><button type="button" data-violin-test-complete>Finish the piece</button></div>'
              : ''
          }
        </section>
      `;

      const section = mount.querySelector<HTMLElement>('.activity-shell');
      const host = mount.querySelector<HTMLElement>('[data-violin-host]');

      if (!section || !host) {
        throw new Error('Unable to mount the violin activity.');
      }

      let finished = false;
      let game: ViolinGameHandle | null = null;

      const destroyGame = (): void => {
        const activeGame = game;
        game = null;
        try {
          activeGame?.destroy();
        } catch {
          // Phaser teardown is best-effort. A renderer cleanup failure must not
          // undo an activity result that the story has already committed.
        }
      };

      const finish = (callback: () => void): void => {
        if (finished) {
          return;
        }

        finished = true;
        // Commit the activity before tearing down the Phaser instance. The real
        // rhythm path calls us from inside that instance's own update loop; if
        // destruction interrupts the loop, story completion must already have
        // recorded the keepsake and awakening.
        try {
          callback();
        } finally {
          destroyGame();
        }
      };

      const completePiece = (): void =>
        finish(() =>
          onComplete({
            locationId: 'recipient-house',
            activityId: 'recipient-violin-piece',
            keepsakeId: 'recipient-sheet-music',
          }),
        );
      // This is ____'s required home keepsake, not an optional score chase.
      // Leaving through either the shell X or the rhythm scene's Escape path
      // should still hand the sheet music back to the room. Otherwise the
      // player can close the game after hearing the piece but before its result
      // callback and silently lose the item needed to continue the story.
      const leavePiece = (): void => completePiece();
      const sceneCallbacks: ViolinSceneCallbacks = {
        onComplete: completePiece,
        onCancel: leavePiece,
      };

      section.append(
        createActivityCloseButton({
          onClose: leavePiece,
          dataAttr: 'data-violin-cancel',
          artUrl: CLOSE_ART_URL,
        }),
      );

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
        onCancel();
      }
    },
  };
}

export const violinActivity = createViolinActivity();
