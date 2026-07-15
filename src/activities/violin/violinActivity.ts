import type { ActivityModule } from '../activityTypes';
import { addKeyboardActivation } from '../activityDom';
import { createActivityCloseButton } from '../activityShell';
import type { ViolinSceneCallbacks } from './ViolinScene';
import { prepareViolinSamples } from '../../game/audio';
import { VIOLIN_KEY_HINT } from './melody';
import { createViolinModes, type ViolinModes } from './violinModes';
import './violin.css';

const CLOSE_ART_URL = '/assets/activities/violin/close-x.png';

interface ViolinGameHandle {
  destroy(): void;
}

type CreateViolinGame = (
  parent: HTMLElement,
  callbacks: ViolinSceneCallbacks,
  modes: ViolinModes,
) => ViolinGameHandle | Promise<ViolinGameHandle>;

async function createDefaultViolinGame(
  parent: HTMLElement,
  callbacks: ViolinSceneCallbacks,
  modes: ViolinModes,
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
    scene: new ViolinScene(callbacks, modes),
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
          <div class="violin-header">
            <h2 class="activity-shell__title">The piece on the stand</h2>
            <div class="violin-modes" role="group" aria-label="Game modes">
              <button type="button" class="violin-mode-btn" data-violin-advanced aria-pressed="false" title="Read pitch as a sound graph instead of notation">Advanced</button>
              <button type="button" class="violin-mode-btn" data-violin-practice aria-pressed="false" title="Free play — try the keys with no song or scoring">Practice</button>
              <button type="button" class="violin-mode-btn" data-violin-mistakes aria-pressed="false" title="Forgive one wrong note per note — recover by playing the right one">Mistakes allowed</button>
              <button type="button" class="violin-mode-btn" data-violin-guidance aria-pressed="false" title="Light the next key to press while echoing">Key guidance</button>
            </div>
          </div>
          <div class="activity-shell__viewport">
            <div class="violin-game__host" data-violin-host></div>
          </div>
          <p class="activity-shell__controls">Echo the melody back on ${VIOLIN_KEY_HINT} · modes at the top · Esc to leave</p>
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

      // Live mode/setting flags, mutated in place by the header cluster and read
      // by the scene each frame. Fresh per mount — leaving and re-entering the
      // activity resets to normal mode (the simplest sensible reset).
      const modes = createViolinModes();

      const advancedButton = mount.querySelector<HTMLButtonElement>('[data-violin-advanced]');
      const practiceButton = mount.querySelector<HTMLButtonElement>('[data-violin-practice]');
      const mistakesButton = mount.querySelector<HTMLButtonElement>('[data-violin-mistakes]');
      const guidanceButton = mount.querySelector<HTMLButtonElement>('[data-violin-guidance]');

      if (!advancedButton || !practiceButton || !mistakesButton || !guidanceButton) {
        throw new Error('Unable to mount the violin activity.');
      }

      const syncModeButtons = (): void => {
        advancedButton.setAttribute('aria-pressed', String(modes.advanced));
        practiceButton.setAttribute('aria-pressed', String(modes.practice));
        mistakesButton.setAttribute('aria-pressed', String(modes.mistakesAllowed));
        guidanceButton.setAttribute('aria-pressed', String(modes.keyGuidance));
        // Advanced (the graph is forced), Mistakes (no scoring), and guidance
        // (no expected note) are moot while practising.
        advancedButton.disabled = modes.practice;
        mistakesButton.disabled = modes.practice;
        guidanceButton.disabled = modes.practice;
      };

      const toggleMode = (button: HTMLButtonElement, apply: () => void): void => {
        const handler = (): void => {
          apply();
          syncModeButtons();
        };
        button.addEventListener('click', handler);
        addKeyboardActivation(button, handler);
      };

      toggleMode(advancedButton, () => {
        modes.advanced = !modes.advanced;
      });
      toggleMode(practiceButton, () => {
        modes.practice = !modes.practice;
      });
      toggleMode(mistakesButton, () => {
        modes.mistakesAllowed = !modes.mistakesAllowed;
      });
      toggleMode(guidanceButton, () => {
        modes.keyGuidance = !modes.keyGuidance;
      });
      syncModeButtons();

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
            activityId: 'recipient-violin-piece',
            keepsakeId: 'recipient-sheet-music',
          }),
        );
      const cancelPiece = (): void => finish(onCancel);
      const sceneCallbacks: ViolinSceneCallbacks = {
        onComplete: completePiece,
        onCancel: cancelPiece,
      };

      section.append(
        createActivityCloseButton({
          onClose: cancelPiece,
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
        const createdGame = await createViolinGame(host, sceneCallbacks, modes);

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
