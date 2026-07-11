import type { ActivityModule } from '../activityTypes';
import { addKeyboardActivation } from '../activityDom';
import { playSfx, playViolinNote } from '../../game/audio';
import {
  advanceComponent,
  applyKindle,
  applyRoll,
  assembledComponentCount,
  commitFold,
  componentProgress,
  createRitualState,
  currentComponent,
  currentFoldCrease,
  currentHullShape,
  currentVerb,
  FOLD_COMPONENTS,
  HULL_CREASES,
  isAssembled,
  isCatchingWind,
  isComplete,
  kindleProgress,
  LANTERN_STAVES,
  releaseFold,
  rollNoteIndex,
  rollProgress,
  SAIL_FACE_LINES,
  setFoldProgress,
  setHoistProgress,
  willCommitFold,
  type RitualState,
} from './foldModel';
import { FoldStage } from './foldStage';
import { isImageUrl } from '../../game/assetProbe';
import { getUiRoot } from '../../ui/domRoot';
import './foldTheLetters.css';

// Optional full-scene backdrop for the sail-away cinematic. File-first: when
// present it cross-fades in over the composited boat as the drift begins and
// holds through the travel. Absent → the procedural water/petals scene alone.
const SAIL_AWAY_KEY_ART_URL = '/assets/activities/fold-the-letters/sail-away-key-art.png';
let sailAwayKeyArtUrl: string | undefined;
let sailAwayKeyArtProbed = false;

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
  /** Cross-fade of the sail-away key art in over the fold stage. Single source
   *  for the bridge's key-art opacity transition (set inline from here). */
  readonly keyArtFadeMs: number;
  /** The folded-triangle → mast bridge after the sail fold commits (Change 2). In
   *  the same family as the hand-downs; fast path in test timing. */
  readonly sailIntroMs: number;
}

const REAL_TIMING: FoldTiming = {
  assembledHoldMs: 1000,
  expandMs: 1200,
  sailAwayMs: 7000,
  keyArtFadeMs: 2600,
  sailIntroMs: 750,
};

const TEST_TIMING: FoldTiming = {
  assembledHoldMs: 40,
  expandMs: 40,
  sailAwayMs: 80,
  keyArtFadeMs: 40,
  sailIntroMs: 40,
};

// The notes of ____'s piece, plucked one by one as the sheet music rolls. A
// warm ascending D-major motif; reused through the violin note synth.
const ROLL_NOTE_FREQS = [293.66, 440, 587.33, 739.99, 880, 1108.73];

// Keyboard-assist gesture sizes (accessibility + deterministic driving).
const KEY_HOIST_STEP = 0.34;
const KEY_ROLL_RAD = Math.PI * 0.85;
const KEY_KINDLE_MS = 420;

function isTestMode(): boolean {
  return new URL(window.location.href).searchParams.get('testMode') === '1';
}

// Reduced-motion collapses the auto beats to the near-instant test pacing so the
// JS-driven inline transitions (which override the CSS reduced-motion block)
// still honor the user's preference — single source, no double-maintained ms.
function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const foldTheLettersActivity: ActivityModule = {
  id: 'fold-the-letters',
  title: 'fold',
  async start({ mount, onCancel, onComplete }) {
    const timing = isTestMode() || prefersReducedMotion() ? TEST_TIMING : REAL_TIMING;

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
    // True while the sail's fold → hoist bridge plays (the folded triangle flying
    // to the mast). Input + keyboard-assist are locked until the sail arrives.
    let transitioning = false;
    let lastNoteSounded = 0;
    let state: RitualState = createRitualState();

    const stage = new FoldStage(canvas, {
      onFoldProgress: (t) => handleFoldProgress(t),
      onFoldRelease: () => handleFoldRelease(),
      onHoistProgress: (progress) => handleHoistProgress(progress),
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
        const crease = currentFoldCrease(state);
        return `${component.label} — ${crease?.hint ?? ''}`;
      }
      if (verb === 'hoist') {
        return `${component.label} — hoist the sail: drag it up the mast to the top`;
      }
      if (verb === 'roll') {
        return `${component.label} — roll the page: drag it sideways into a lantern`;
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
      // The live 0..1 progress of the fold currently under the pointer — the
      // observability hook the smoke reads to prove the paper tracks the drag.
      panel.dataset.foldFoldProgress = state.foldProgress.toFixed(3);
      if (verb === 'fold') {
        const crease = currentFoldCrease(state);
        panel.dataset.foldCreaseAxis = crease?.dragAxis ?? '';
        panel.dataset.foldCreaseToward = crease?.toward ?? '';
        panel.dataset.foldCreaseKind = crease?.kind ?? '';
      } else {
        delete panel.dataset.foldCreaseAxis;
        delete panel.dataset.foldCreaseToward;
        delete panel.dataset.foldCreaseKind;
      }
      panel.dataset.ritualComplete = isComplete(state) ? '1' : '0';
    };

    const syncStage = (): void => {
      stage.setVerb(currentVerb(state) ?? 'fold');
      const component = currentComponent(state);
      if (component?.id === 'hull') {
        stage.setHullShape(currentHullShape(state));
      }
      stage.setCrease(currentFoldCrease(state));
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
          travelTo: {
            locationId: 'final-spot',
            spawnId: 'near-lantern',
            // The boat lands IN the ending: final-spot auto-starts the reveal on
            // arrival, no interim walk or E-press.
            autoStartActivityId: 'final-keepsake-reveal',
          },
        }),
      );

    // --- gesture handlers ---------------------------------------------------

    // A fold is now DIRECT: the flap tracks the pointer continuously (progress),
    // and only on release do we decide commit (past the threshold) vs fall back
    // open. No threshold-triggered canned tween.
    function handleFoldProgress(t: number): void {
      if (finished || sailingAway || assembling || transitioning || currentVerb(state) !== 'fold') {
        return;
      }
      state = setFoldProgress(state, t);
      syncDataAttrs();
    }

    function handleFoldRelease(): void {
      if (finished || sailingAway || assembling || transitioning || currentVerb(state) !== 'fold') {
        return;
      }
      const commit = willCommitFold(state);
      if (commit) {
        playSfx('sfx-paper-fold');
      }
      // The stage eases the flap the rest of the way home (commit) or back open
      // (fall back), then we settle the model. Seamless: at progress 1 the flap's
      // silhouette already equals the next shape, so the swap doesn't jump.
      stage.settleFold(commit, () => onFoldSettled(commit));
    }

    // Shared landing for a settled fold (pointer release AND keyboard-assist): the
    // sail's diagonal fold bridges into the hoist via the folded-triangle-to-mast
    // transition; every other fold just advances.
    function onFoldSettled(commit: boolean): void {
      if (finished) {
        return;
      }
      const component = currentComponent(state);
      const wasSailFold = commit && component?.id === 'sail' && currentVerb(state) === 'fold';
      state = commit ? commitFold(state) : releaseFold(state);
      if (wasSailFold && state.sailFolded) {
        runSailHoistIntro();
      } else {
        afterGesture();
      }
    }

    // The folded sail triangle flies to the mast, then the hoist begins with the
    // sail arriving. Configure the hoist seat (verb → hoist, hoist 0) first so the
    // stage knows where to land the triangle, lock input, then play the bridge.
    function runSailHoistIntro(): void {
      transitioning = true;
      syncStage();
      stage.playSailHoistIntro(timing.sailIntroMs, () => {
        transitioning = false;
        if (!finished) {
          syncStage();
        }
      });
    }

    let wasCatching = false;
    function handleHoistProgress(progress: number): void {
      if (finished || sailingAway || assembling || transitioning || currentVerb(state) !== 'hoist') {
        return;
      }
      const next = setHoistProgress(state, progress);
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
      if (finished || sailingAway || assembling || transitioning || currentVerb(state) !== 'roll') {
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
      // Push the COMPLETED silhouette so the hand-down captures the finished piece
      // (the hull's last fold settles to 'boat', not the stale 'peak'), then hand
      // the full-size piece DOWN into its tray anchor across the hold window — it
      // shrinks/moves into place, and the tray piece only appears when it lands
      // (no doubling of the big view and the small tray piece).
      stage.setCrease(undefined);
      if (assembledComponent?.id === 'hull') {
        stage.setHullShape('boat');
      }
      stage.setHoist(1, false);
      stage.setRoll(1);
      stage.setKindle(1);
      if (assembledComponent) {
        stage.playHandDown(
          assembledComponent.id,
          assembledComponentCount(state),
          Math.max(1, timing.assembledHoldMs * 0.85),
        );
      }
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
      if (!sailingAway && !assembling && !transitioning && currentVerb(state) === 'kindle') {
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
      if (sailingAway || assembling || transitioning) {
        return;
      }
      const verb = currentVerb(state);
      if (!verb) {
        return;
      }
      event.preventDefault();
      if (verb === 'fold') {
        // Play the whole fold as an animation, then settle it home — through the
        // shared landing, so the sail fold also bridges into the hoist.
        playSfx('sfx-paper-fold');
        stage.playAutoFold(() => onFoldSettled(true));
      } else if (verb === 'hoist') {
        handleHoistProgress(state.hoistProgress + KEY_HOIST_STEP);
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

      if (!sailAwayKeyArtProbed) {
        sailAwayKeyArtProbed = true;
        sailAwayKeyArtUrl = (await isImageUrl(SAIL_AWAY_KEY_ART_URL))
          ? SAIL_AWAY_KEY_ART_URL
          : undefined;
        if (finished) {
          return;
        }
      }
      // The fold stage dissolves DIRECTLY into the sail-away key art — the
      // painting's boat IS the boat, so there is no composited DOM boat and no
      // gradient starfield here. The bridge mounts on the persistent UI root (NOT
      // this activity's mount) so it survives the mount teardown + scene restart
      // into final-spot and covers the swap: the live scene is never exposed
      // before the ending frame sequence, which removes the bridge once its own
      // key-art layer is up.
      const bridge = buildSailAwayBridge(sailAwayKeyArtUrl, timing.keyArtFadeMs);
      if (bridge) {
        getUiRoot().append(bridge);
        void bridge.offsetWidth;
        bridge.classList.add('fold-sail--go');
        // Fade the fold modal chrome AND its canvas (the assembled boat is drawn
        // on that canvas, inside the panel) out in lockstep with the key art
        // fading IN — same duration/easing — so the painting REPLACES the modal
        // rather than blending through it, and there is never a second boat under
        // the transparent-host bridge. Disable + hide the buttons first so a ghost
        // Cancel/Fold can't be clicked as the panel recedes.
        // Non-null: the mount guard above throws if either is missing (asserted
        // here because sailAway is a hoisted declaration, so TS widens them back).
        const foldPanel = panel!;
        const foldCancel = cancelButton!;
        foldCancel.disabled = true;
        const testCompleteButton = mount.querySelector<HTMLButtonElement>('[data-fold-test-complete]');
        if (testCompleteButton) {
          testCompleteButton.disabled = true;
        }
        foldPanel.style.pointerEvents = 'none';
        foldPanel.style.transition = `opacity ${timing.keyArtFadeMs}ms ease`;
        void foldPanel.offsetWidth;
        foldPanel.style.opacity = '0';
      }
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

// The sail-away bridge: the fold stage dissolving into the full-scene key art
// (the painting's boat IS the boat — no composited DOM boat, no gradient sky/
// water). Drifting petals ride over it. Transparent host so the fold stage shows
// through as the painting cross-fades in. Mounted on the persistent UI root so it
// holds unbroken across the scene swap into the ending frame sequence, which
// finds it by `data-ending-bridge` and removes it once its own key-art layer is
// up. Absent art → no bridge (graceful degrade).
function buildSailAwayBridge(
  keyArtUrl: string | undefined,
  keyArtFadeMs: number,
): HTMLElement | null {
  if (!keyArtUrl) {
    return null;
  }
  const stage = document.createElement('div');
  stage.className = 'fold-sail';
  stage.dataset.foldSail = '';
  stage.dataset.endingBridge = '';
  stage.setAttribute('aria-hidden', 'true');

  const keyart = document.createElement('img');
  keyart.className = 'fold-sail__keyart';
  keyart.src = keyArtUrl;
  keyart.alt = '';
  // Single-source transition: duration from FoldTiming.keyArtFadeMs, not a
  // hand-synced value in the CSS.
  keyart.style.transition = `opacity ${keyArtFadeMs}ms ease`;

  const petals = document.createElement('div');
  petals.className = 'fold-sail__petals';
  for (let i = 0; i < 7; i += 1) {
    const petal = document.createElement('span');
    petal.className = `fold-sail__petal fold-sail__petal--${i}`;
    petals.append(petal);
  }

  stage.append(keyart, petals);
  return stage;
}
