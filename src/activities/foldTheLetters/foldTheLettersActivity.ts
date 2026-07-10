import type { ActivityModule } from '../activityTypes';
import { addKeyboardActivation } from '../activityDom';
import { playSfx, playViolinNote } from '../../game/audio';
import {
  advanceComponent,
  applyFoldDrag,
  applyHoist,
  applyKindle,
  applyRoll,
  assembledComponentCount,
  componentProgress,
  createRitualState,
  currentComponent,
  currentHullCrease,
  currentVerb,
  FOLD_COMPONENTS,
  HULL_CREASES,
  isAssembled,
  isCatchingWind,
  isComplete,
  kindleProgress,
  LANTERN_STAVES,
  rollNoteIndex,
  rollProgress,
  SAIL_FACE_LINES,
  SAIL_FOLD_CREASE,
  type HullCrease,
  type RitualState,
} from './foldModel';
import { FoldStage } from './foldStage';
import './foldTheLetters.css';

/**
 * The keepsake ritual at the clearing shore. ____ makes a paper boat from her
 * three carried keepsakes, each with its OWN verb: she FOLDS ____'s letter into
 * the hull, HOISTS ____'s letter as the sail, and ROLLs her sheet music into a
 * lantern before HOLDing to kindle it. Then the boat sets on the water and she
 * drifts south into the ending. Impossible to fail. On completion the activity
 * travels the player INTO the lantern clearing (final-spot).
 */

interface FoldTiming {
  readonly assembledHoldMs: number;
  readonly expandMs: number;
  readonly sailAwayMs: number;
}

const REAL_TIMING: FoldTiming = {
  assembledHoldMs: 1000,
  expandMs: 1200,
  sailAwayMs: 7000,
};

const TEST_TIMING: FoldTiming = {
  assembledHoldMs: 40,
  expandMs: 40,
  sailAwayMs: 80,
};

// The notes of ____'s piece, plucked one by one as the sheet music rolls. A
// warm ascending D-major motif; reused through the violin note synth.
const ROLL_NOTE_FREQS = [293.66, 440, 587.33, 739.99, 880, 1108.73];

// Keyboard-assist gesture sizes (accessibility + deterministic driving).
const KEY_HOIST_PX = 130;
const KEY_ROLL_RAD = Math.PI * 0.85;
const KEY_KINDLE_MS = 420;

function isTestMode(): boolean {
  return new URL(window.location.href).searchParams.get('testMode') === '1';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const foldTheLettersActivity: ActivityModule = {
  id: 'fold-the-letters',
  title: 'fold',
  async start({ mount, onCancel, onComplete }) {
    const timing = isTestMode() ? TEST_TIMING : REAL_TIMING;

    mount.innerHTML = `
      <section class="activity-panel activity-panel--fold" role="dialog" aria-label="fold" data-fold-panel>
        <h2>fold</h2>
        <p class="fold-caption" data-fold-hint>Three keepsakes, carried a long way. Give them to the water.</p>
        <div class="fold-stage">
          <canvas class="fold-stage__canvas" data-fold-canvas></canvas>
        </div>
        <div class="activity-actions">
          <button type="button" data-fold-cancel>Cancel</button>
          ${isTestMode() ? '<button type="button" data-fold-test-complete>Fold the boat</button>' : ''}
        </div>
      </section>
    `;

    const panel = mount.querySelector<HTMLElement>('[data-fold-panel]');
    const canvas = mount.querySelector<HTMLCanvasElement>('[data-fold-canvas]');
    const hint = mount.querySelector<HTMLElement>('[data-fold-hint]');
    const cancelButton = mount.querySelector<HTMLButtonElement>('[data-fold-cancel]');
    if (!panel || !canvas || !hint || !cancelButton) {
      throw new Error('Unable to mount the fold activity.');
    }

    let finished = false;
    let sailingAway = false;
    let assembling = false;
    let lastNoteSounded = 0;
    let state: RitualState = createRitualState();

    const stage = new FoldStage(canvas, {
      onFoldDrag: (dx, dy) => handleFoldDrag(dx, dy),
      onHoist: (px) => handleHoist(px),
      onRoll: (angle) => handleRoll(angle),
      onKindleChange: (held) => {
        kindleHeld = held;
      },
    });

    let kindleHeld = false;

    const setHint = (text: string): void => {
      hint.textContent = text;
    };

    const componentTextLines = (): string[] => {
      const component = currentComponent(state);
      if (!component) {
        return [];
      }
      if (component.id === 'hull') {
        return HULL_CREASES.map((c) => c.snippet);
      }
      if (component.id === 'sail') {
        return [...SAIL_FACE_LINES];
      }
      return [...LANTERN_STAVES];
    };

    const verbHint = (): string => {
      const component = currentComponent(state);
      const verb = currentVerb(state);
      if (!component) {
        return '';
      }
      if (verb === 'fold') {
        const crease = component.id === 'hull' ? currentHullCrease(state) : SAIL_FOLD_CREASE;
        return `${component.label} — ${crease?.hint ?? ''}`;
      }
      if (verb === 'hoist') {
        return `${component.label} — hoist the sail: drag up the mast, ride the wind as it catches`;
      }
      if (verb === 'roll') {
        return `${component.label} — roll the page: circle it into a lantern`;
      }
      if (verb === 'kindle') {
        return `${component.label} — press and hold to kindle the light`;
      }
      return component.label;
    };

    const syncDataAttrs = (): void => {
      const component = currentComponent(state);
      const verb = currentVerb(state);
      panel.dataset.foldComponent = component?.id ?? '';
      panel.dataset.foldVerb = verb ?? '';
      panel.dataset.foldAssembled = String(assembledComponentCount(state));
      panel.dataset.foldProgress = componentProgress(state).toFixed(3);
      if (verb === 'fold') {
        const crease = component?.id === 'hull' ? currentHullCrease(state) : SAIL_FOLD_CREASE;
        panel.dataset.foldCreaseAxis = crease?.dragAxis ?? '';
        panel.dataset.foldCreaseToward = crease?.toward ?? '';
      } else {
        delete panel.dataset.foldCreaseAxis;
        delete panel.dataset.foldCreaseToward;
      }
      panel.dataset.ritualComplete = isComplete(state) ? '1' : '0';
    };

    const syncStage = (): void => {
      stage.setVerb(currentVerb(state) ?? 'fold');
      const component = currentComponent(state);
      stage.setCrease(component?.id === 'hull' ? currentHullCrease(state) : undefined);
      stage.setHoist(state.hoistProgress, isCatchingWind(state.hoistProgress));
      stage.setRoll(rollProgress(state));
      stage.setKindle(kindleProgress(state));
      stage.setAssembled(assembledComponentCount(state));
      setHint(verbHint());
      syncDataAttrs();
    };

    const showComponent = (): void => {
      const component = currentComponent(state);
      if (!component) {
        return;
      }
      stage.setComponent(component.id, currentVerb(state) ?? 'fold', assembledComponentCount(state), componentTextLines());
      syncStage();
    };

    const finish = (callback: () => void): void => {
      if (finished) {
        return;
      }
      finished = true;
      stage.dispose();
      window.removeEventListener('keydown', handleKeydown, true);
      callback();
    };

    const cancel = (): void => {
      if (sailingAway) {
        return;
      }
      finish(onCancel);
    };

    const complete = (): void =>
      finish(() =>
        onComplete({
          locationId: 'clearing',
          activityId: 'fold-the-letters',
          travelTo: { locationId: 'final-spot', spawnId: 'near-lantern' },
        }),
      );

    // --- gesture handlers ---------------------------------------------------

    function handleFoldDrag(dx: number, dy: number): void {
      if (finished || sailingAway || assembling || currentVerb(state) !== 'fold') {
        return;
      }
      const component = currentComponent(state);
      const foldingCrease: HullCrease | undefined =
        component?.id === 'hull' ? currentHullCrease(state) : SAIL_FOLD_CREASE;
      const next = applyFoldDrag(state, dx, dy);
      if (next === state || !foldingCrease) {
        return; // wrong direction / too short — no-op, try again
      }
      state = next;
      playSfx('sfx-paper-fold');
      // Animate the flip of the crease that just took, then continue.
      stage.playFold(foldingCrease, () => {
        if (finished) {
          return;
        }
        afterGesture();
      });
    }

    let wasCatching = false;
    function handleHoist(px: number): void {
      if (finished || sailingAway || assembling || currentVerb(state) !== 'hoist') {
        return;
      }
      const next = applyHoist(state, px);
      if (next === state) {
        return;
      }
      state = next;
      // A cloth-and-rope catch when the sail bites the wind.
      const catching = isCatchingWind(state.hoistProgress);
      if (catching && !wasCatching) {
        playSfx('sfx-sail-hoist', { volume: 0.7 });
      }
      wasCatching = catching;
      afterGesture();
    }

    function handleRoll(angle: number): void {
      if (finished || sailingAway || assembling || currentVerb(state) !== 'roll') {
        return;
      }
      const next = applyRoll(state, angle);
      if (next === state) {
        return;
      }
      state = next;
      // Pluck the notes of the piece, one per threshold crossed.
      const reached = rollNoteIndex(state);
      while (lastNoteSounded < reached) {
        const freq = ROLL_NOTE_FREQS[lastNoteSounded % ROLL_NOTE_FREQS.length];
        playViolinNote(freq, 520, { volume: 0.5 });
        lastNoteSounded += 1;
      }
      afterGesture();
    }

    function afterGesture(): void {
      if (isAssembled(state)) {
        void runAssemblyBeat();
        return;
      }
      syncStage();
    }

    async function runAssemblyBeat(): Promise<void> {
      if (assembling) {
        return;
      }
      assembling = true;
      const assembledComponent = currentComponent(state);
      stage.setAssembled(assembledComponentCount(state));
      stage.setCrease(undefined);
      stage.setHoist(1, false);
      stage.setRoll(1);
      stage.setKindle(1);
      // Each component clicks together with its own voice.
      if (assembledComponent?.id === 'sail') {
        playSfx('sfx-sail-hoist');
      } else if (assembledComponent?.id === 'lantern') {
        playSfx('sfx-lantern-kindle');
      }
      playSfx('sfx-keepsake', { rate: 0.9, volume: 0.6 });
      setHint(assembledComponent?.assembledLine ?? '');
      syncDataAttrs();
      await wait(timing.assembledHoldMs);
      if (finished) {
        return;
      }
      state = advanceComponent(state);
      assembling = false;
      lastNoteSounded = 0;
      if (isComplete(state)) {
        await sailAway();
        return;
      }
      showComponent();
    }

    // --- kindle hold loop ---------------------------------------------------
    let lastTs = performance.now();
    const kindleLoop = (ts: number): void => {
      if (finished) {
        return;
      }
      const dt = Math.min(64, ts - lastTs);
      lastTs = ts;
      if (!sailingAway && !assembling && currentVerb(state) === 'kindle') {
        const before = state;
        state = applyKindle(state, dt, kindleHeld);
        if (state !== before) {
          stage.setKindle(kindleProgress(state));
          syncDataAttrs();
          if (isAssembled(state)) {
            void runAssemblyBeat();
          }
        }
      }
      requestAnimationFrame(kindleLoop);
    };
    requestAnimationFrame(kindleLoop);

    // --- keyboard assist ----------------------------------------------------

    const handleKeydown = (event: KeyboardEvent): void => {
      if (finished) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') {
        return;
      }
      if (sailingAway || assembling) {
        return;
      }
      const verb = currentVerb(state);
      if (!verb) {
        return;
      }
      event.preventDefault();
      if (verb === 'fold') {
        const component = currentComponent(state);
        const crease = component?.id === 'hull' ? currentHullCrease(state) : SAIL_FOLD_CREASE;
        if (!crease) {
          return;
        }
        const drag = validDragFor(crease);
        handleFoldDrag(drag.dx, drag.dy);
      } else if (verb === 'hoist') {
        handleHoist(KEY_HOIST_PX);
      } else if (verb === 'roll') {
        handleRoll(KEY_ROLL_RAD);
      } else if (verb === 'kindle') {
        const before = state;
        state = applyKindle(state, KEY_KINDLE_MS, true);
        if (state !== before) {
          stage.setKindle(kindleProgress(state));
          if (isAssembled(state)) {
            void runAssemblyBeat();
          } else {
            syncDataAttrs();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeydown, true);

    async function sailAway(): Promise<void> {
      if (sailingAway || finished) {
        return;
      }
      sailingAway = true;
      syncDataAttrs();
      setHint('The boat opens out, dimensional and whole. Its lantern catches.');
      playSfx('sfx-boat-expand');
      await wait(timing.expandMs);
      if (finished) {
        return;
      }

      const cinematic = buildSailAwayCinematic(stage.getLoadedPieceUrls());
      mount.append(cinematic);
      void cinematic.offsetWidth;
      cinematic.classList.add('fold-sail--go');
      playSfx('sfx-water-lap');
      await wait(timing.sailAwayMs / 2);
      playSfx('sfx-water-lap');
      await wait(timing.sailAwayMs / 2);
      complete();
    }

    cancelButton.addEventListener('click', cancel);
    addKeyboardActivation(cancelButton, cancel);

    if (isTestMode()) {
      const testButton = mount.querySelector<HTMLButtonElement>('[data-fold-test-complete]');
      if (testButton) {
        const skip = (): void => {
          if (finished || sailingAway || assembling) {
            return;
          }
          stage.setAssembled(FOLD_COMPONENTS.length);
          state = { ...createRitualState(), componentIndex: FOLD_COMPONENTS.length - 1, phase: 'complete' };
          syncDataAttrs();
          void sailAway();
        };
        testButton.addEventListener('click', skip);
        addKeyboardActivation(testButton, skip);
      }
    }

    showComponent();
  },
};

/** A drag vector guaranteed valid for the given crease's required axis. */
function validDragFor(crease: HullCrease): { dx: number; dy: number } {
  if (crease.dragAxis === 'horizontal') {
    return { dx: crease.toward === 'left' ? -60 : 60, dy: 3 };
  }
  if (crease.dragAxis === 'vertical') {
    return { dx: 3, dy: crease.toward === 'up' ? -60 : 60 };
  }
  return { dx: 50, dy: 50 };
}

function buildSailAwayCinematic(pieces: Partial<Record<string, string>>): HTMLElement {
  const stage = document.createElement('div');
  stage.className = 'fold-sail';
  stage.dataset.foldSail = '';
  stage.setAttribute('aria-hidden', 'true');

  const sky = document.createElement('div');
  sky.className = 'fold-sail__sky';
  const water = document.createElement('div');
  water.className = 'fold-sail__water';

  const boat = document.createElement('div');
  boat.className = 'fold-sail__boat';

  // Composite the SAME three pieces as the stage: file-first <img> when the art
  // exists, else the procedural CSS shapes. An optional recipient-in-boat overlay
  // rides on top file-first; otherwise the CSS rider is used.
  const hull = pieceEl('fold-sail__hull', pieces.hull);
  const sail = pieceEl('fold-sail__sail', pieces.sail);
  const lantern = pieceEl('fold-sail__lantern', pieces.lantern);
  const rider = pieces['recipient-boat']
    ? pieceEl('fold-sail__rider', pieces['recipient-boat'])
    : (() => {
        const r = document.createElement('span');
        r.className = 'fold-sail__rider';
        return r;
      })();
  boat.append(hull, sail, lantern, rider);

  const petals = document.createElement('div');
  petals.className = 'fold-sail__petals';
  for (let i = 0; i < 7; i += 1) {
    const petal = document.createElement('span');
    petal.className = `fold-sail__petal fold-sail__petal--${i}`;
    petals.append(petal);
  }

  stage.append(sky, water, boat, petals);
  return stage;
}

function pieceEl(className: string, url?: string): HTMLElement {
  if (url) {
    const img = document.createElement('img');
    img.className = `${className} ${className}--art`;
    img.src = url;
    img.alt = '';
    return img;
  }
  const span = document.createElement('span');
  span.className = className;
  return span;
}
