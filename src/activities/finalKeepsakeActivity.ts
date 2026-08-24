import type { ActivityModule } from './activityTypes';
import { playMusic, playSfx } from '../game/audio';
import { isImageUrl } from '../game/assetProbe';

/**
 * The ending transition. It mounts with the sail-away key art ALREADY held at
 * full opacity — the persistent bridge on the UI root has been covering the scene
 * swap, so the painting continues unbroken with no re-fade and no opening hold.
 * The preceding fold activity may hold its sail-away painting across the scene
 * swap, but that painting is not one of this transition's frames. This sequence
 * starts directly on water-arrival, then breathes through the horizon bridge and
 * an exact crop of ____'s painted galaxy ground. The composited boat drifts
 * smaller toward the painted horizon and fades as the ocean gives way to ground.
 * It ends holding on the painting and hands off (`endingArrival`) to the live scene.
 *
 * File-first and gracefully degrading: each painted frame is probed; an absent
 * frame is simply skipped (both absent → the key art fades straight into the
 * terminal crop of the playable painting).
 */

const ASSET = {
  waterArrival: '/assets/ending/water-arrival.png',
  waterToGalaxy: '/assets/ending/water-to-galaxy.png',
  hull: '/assets/activities/fold-the-letters/hull.png',
  sail: '/assets/activities/fold-the-letters/sail.png',
  lantern: '/assets/activities/fold-the-letters/lantern.png',
  rider: '/assets/activities/fold-the-letters/recipient-boat.png',
} as const;

// Per-transition cross-fade knobs — one named, tunable value per dissolve (no
// single shared crossFadeMs). Each frame layer's own fade-in duration is driven
// from the value for the dissolve that reveals it; the boat drift duration is
// derived from their sum (see start()). Single source: every ms lives here.
interface EndingTiming {
  /** Quiet opening hold so the boat has time to appear on dark water. */
  readonly waterHoldMs: number;
  /** Water-arrival → water-to-galaxy dissolve. */
  readonly waterToGalaxyMs: number;
  /** Horizon bridge → exact painted-ground crop dissolve (more room to breathe). */
  readonly galaxyComposeMs: number;
  /** How long the boat takes to fade in (with water-arrival) and out. */
  readonly boatFadeMs: number;
  /** Final hold on the pure galaxy before handing off to the scene. */
  readonly galaxyHoldMs: number;
}

const REAL_TIMING: EndingTiming = {
  waterHoldMs: 2800,
  waterToGalaxyMs: 4200,
  galaxyComposeMs: 4700,
  boatFadeMs: 2200,
  galaxyHoldMs: 900,
};

// testMode collapses the pacing so the Playwright full-run smoke stays fast and
// deterministic without losing a beat of the sequence.
const TEST_TIMING: EndingTiming = {
  waterHoldMs: 20,
  waterToGalaxyMs: 50,
  galaxyComposeMs: 50,
  boatFadeMs: 40,
  galaxyHoldMs: 40,
};

function isTestMode(): boolean {
  return new URL(window.location.href).searchParams.get('testMode') === '1';
}

function useFullTransitionTiming(): boolean {
  return new URL(window.location.href).searchParams.get('fullTransitions') === '1';
}

function usesCondensedTiming(): boolean {
  return prefersReducedMotion() || (isTestMode() && !useFullTransitionTiming());
}

// Reduced-motion collapses to the near-instant test pacing so the JS-driven
// inline transitions (which override the CSS reduced-motion block) still honor
// the user's preference — single source, no double-maintained ms.
function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Probe results are stable per page load; cache them so a replayed ending never
// re-probes (and the graceful-degradation smoke, which renames frames aside, is
// unaffected because the fresh page reloads the module).
let probed: {
  waterArrival: boolean;
  waterToGalaxy: boolean;
  hull: boolean;
  sail: boolean;
  lantern: boolean;
  rider: boolean;
} | null = null;

async function probeAssets(): Promise<NonNullable<typeof probed>> {
  if (probed) {
    return probed;
  }
  const [waterArrival, waterToGalaxy, hull, sail, lantern, rider] =
    await Promise.all([
      isImageUrl(ASSET.waterArrival),
      isImageUrl(ASSET.waterToGalaxy),
      isImageUrl(ASSET.hull),
      isImageUrl(ASSET.sail),
      isImageUrl(ASSET.lantern),
      isImageUrl(ASSET.rider),
    ]);
  probed = { waterArrival, waterToGalaxy, hull, sail, lantern, rider };
  return probed;
}

export const finalKeepsakeActivity: ActivityModule = {
  id: 'final-keepsake-reveal',
  title: 'Out to Sea',
  async start({ mount, onComplete }) {
    const condensedTiming = usesCondensedTiming();
    const timing = condensedTiming ? TEST_TIMING : REAL_TIMING;
    const assets = await probeAssets();

    const { frame, boat, galaxy, layers, frameFades } = buildTransition(mount, assets, timing);
    // The first montage frame is now mounted, so the temporary scene-restart
    // cover can step out without exposing the destination canvas underneath.
    document.body.classList.add('ending-montage-mounted');

    // The drift spans every fade AFTER frame 0 — the boat is on screen for all of
    // them and lands exactly as the galaxy settles. Synced to the frame-sequence
    // length from one JS source (the CSS drift no longer hard-codes a duration).
    const driftMs =
      timing.waterHoldMs + frameFades.slice(1).reduce((sum, ms) => sum + ms, 0);
    const boatFadeInMs = timing.boatFadeMs;
    const boatFadeInDelayMs = 0;

    const appearBoat = (): void => {
      if (!boat) {
        return;
      }
      boat.style.transition =
        `transform ${driftMs}ms cubic-bezier(0.3, 0, 0.4, 1), ` +
        `opacity ${boatFadeInMs}ms ease ${boatFadeInDelayMs}ms`;
      void boat.offsetWidth;
      boat.classList.add('ending-frames__boat--drift');
      boat.style.opacity = '1';
    };

    // The ending swell + bed rise as the drift begins.
    playMusic('music-ending', { fadeMs: condensedTiming ? 200 : 3200 });

    // Pin the water-arrival opening frame while later frames retain their gentle
    // drift. Boatigami now hands off directly without a persistent still-image
    // bridge, so this activity owns the complete arrival presentation.
    frame(0).style.animation = 'none';
    frame(0).style.opacity = '1';
    void frame(0).offsetWidth;

    appearBoat();
    await wait(timing.waterHoldMs);

    let boatFadeStarted = false;
    // Cross-fade through each subsequent painted frame, ending on the galaxy.
    for (let index = 1; index < layers; index += 1) {
      // Keep the boat through the entire horizon bridge. It disappears only as
      // ____'s exact final painting arrives underneath it.
      if (index === layers - 1 && boat) {
        boat.style.transition =
          `transform ${driftMs}ms cubic-bezier(0.3, 0, 0.4, 1), ` +
          `opacity ${timing.boatFadeMs}ms ease`;
        boat.style.opacity = '0';
        boatFadeStarted = true;
      }
      frame(index).style.opacity = '1';
      // The swell lands as the water turns to galaxy (the penultimate fade).
      if (index === layers - 1) {
        playSfx('sfx-ending-swell');
      }
      await wait(frameFades[index]!);
    }

    // In a degraded one-frame sequence there was no final dissolve to trigger
    // the fade, so still remove the boat before handing off to the live scene.
    if (boat && !boatFadeStarted) {
      boat.style.transition = `opacity ${timing.boatFadeMs}ms ease`;
      boat.style.opacity = '0';
    }
    // The exact arrival crop holds so its fade reveals the matching live view.
    galaxy.dataset.endingGalaxy = 'settled';
    // In the normal multi-frame sequence the boat has already completed its fade
    // during the long galaxy dissolve, so only the authored final hold remains.
    // A degraded one-frame fallback still waits for its just-started boat fade.
    await wait(
      boatFadeStarted
        ? timing.galaxyHoldMs
        : Math.max(timing.boatFadeMs, timing.galaxyHoldMs),
    );

    // Hand off to the live scene: it wakes beneath this held galaxy frame,
    // cross-fades it out, and hands ____ control on the galaxy water.
    onComplete({
      locationId: 'final-spot',
      activityId: 'final-keepsake-reveal',
      endingArrival: true,
    });
  },
};

interface TransitionParts {
  /** Returns the frame layer at sequence index (0 = opening). */
  readonly frame: (index: number) => HTMLElement;
  /** The composited boat, or undefined if no pieces resolved. */
  readonly boat: HTMLElement | undefined;
  /** The final composed-galaxy layer. */
  readonly galaxy: HTMLElement;
  /** How many frame layers are in the sequence. */
  readonly layers: number;
  /** Per-frame fade-in duration (ms), parallel to the frame sequence. Index 0 is
   *  unused (frame 0 is shown at full opacity without a fade). */
  readonly frameFades: readonly number[];
}

function buildTransition(
  mount: HTMLElement,
  assets: NonNullable<typeof probed>,
  timing: EndingTiming,
): TransitionParts {
  const stage = document.createElement('div');
  stage.className = 'ending-frames';
  stage.dataset.endingFrames = '';
  stage.dataset.endingStage = ''; // back-compat observability hook for smokes
  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', 'The boat drifts from dark water into the galaxy.');

  // The ordered frame sequence: painted frames when present (file-first), always
  // ending on the exact painted arrival crop. Each layer stacks above the previous so
  // fading it in reveals it over the one before — a breathing cross-fade. Each
  // frame carries the duration of the dissolve that reveals IT (frame 0 has no
  // dissolve; its value is unused).
  const frames: HTMLElement[] = [];
  const frameFades: number[] = [];
  const push = (layer: HTMLElement, fadeMs: number): void => {
    frames.push(layer);
    frameFades.push(fadeMs);
    stage.append(layer);
  };

  if (assets.waterArrival) {
    push(imageLayer(ASSET.waterArrival, timing.waterToGalaxyMs), timing.waterToGalaxyMs);
  }
  if (assets.waterToGalaxy) {
    push(imageLayer(ASSET.waterToGalaxy, timing.waterToGalaxyMs), timing.waterToGalaxyMs);
  }
  const galaxy = galaxyLayer(timing.galaxyComposeMs);
  push(galaxy, timing.galaxyComposeMs);

  // The boat rides on top of every frame — the SAME pieces the sail-away
  // cinematic composites, so it never changes identity. It starts hidden and
  // fades in with the water-arrival dissolve (see start()).
  const boat = buildBoat(assets);
  if (boat) {
    stage.append(boat);
  }

  mount.append(stage);

  return {
    frame: (index) => frames[Math.min(index, frames.length - 1)]!,
    boat,
    galaxy,
    layers: frames.length,
    frameFades,
  };
}

function imageLayer(url: string, fadeMs: number): HTMLElement {
  const layer = document.createElement('div');
  layer.className = 'ending-frames__layer ending-frames__layer--photo';
  layer.style.backgroundImage = `url('${url}')`;
  layer.style.transitionDuration = `${fadeMs}ms`;
  return layer;
}

// The exact 1280x720 camera crop of galaxy-ground.png. It is deliberately still:
// the held overlay fades directly onto the same pixels in the live scene.
function galaxyLayer(fadeMs: number): HTMLElement {
  const layer = document.createElement('div');
  layer.className = 'ending-frames__layer ending-frames__layer--galaxy';
  layer.dataset.endingGalaxy = '';
  layer.style.transitionDuration = `${fadeMs}ms`;

  return layer;
}

function buildBoat(assets: NonNullable<typeof probed>): HTMLElement | undefined {
  if (!assets.hull && !assets.sail && !assets.lantern && !assets.rider) {
    return undefined;
  }
  const boat = document.createElement('div');
  boat.className = 'ending-frames__boat';
  boat.dataset.endingBoat = '';
  if (assets.rider) {
    // recipient-boat.png is a COMPLETE painted boat (hull + sail + lantern + ____), so
    // it stands alone — stacking the separate hull/sail/lantern pieces under it
    // would show two hulls. Render ONLY the rider painting when it resolves.
    boat.append(piece('ending-frames__rider', ASSET.rider));
  } else {
    // No complete-boat art: assemble from whichever individual pieces exist.
    boat.append(
      piece('ending-frames__hull', assets.hull ? ASSET.hull : undefined),
      piece('ending-frames__sail', assets.sail ? ASSET.sail : undefined),
      piece('ending-frames__lantern', assets.lantern ? ASSET.lantern : undefined),
    );
  }
  return boat;
}

function piece(className: string, url?: string): HTMLElement {
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
