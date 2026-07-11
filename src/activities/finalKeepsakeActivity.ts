import type { ActivityModule } from './activityTypes';
import { playMusic, playSfx } from '../game/audio';
import { isImageUrl } from '../game/assetProbe';

/**
 * The ending transition. It mounts with the sail-away key art ALREADY held at
 * full opacity — the persistent bridge on the UI root has been covering the scene
 * swap, so the painting continues unbroken with no re-fade and no opening hold.
 * Then a single dissolve carries the key art into water-arrival (the composited
 * paper boat — the SAME hull / sail / lantern / rider pieces the sail-away
 * bridge implied — fading in as the painting's boat is covered, so only ever one
 * boat is visible). From there it breathes on through water-to-galaxy and the
 * composed ocean-galaxy, the boat drifting smaller toward (but never across) the
 * painted horizon, then fading out as the galaxy settles. It ends holding on the
 * galaxy and hands off (`endingArrival`) to the live, playable galaxy scene.
 *
 * File-first and gracefully degrading: each painted frame is probed; an absent
 * frame is simply skipped (both absent → the key art fades straight into the
 * code-composed galaxy). Nothing blocks on generated art — the galaxy layer is
 * composed from the existing ending-sky/ending-water via CSS, always present.
 */

const ASSET = {
  keyArt: '/assets/activities/fold-the-letters/sail-away-key-art.png',
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
  /** Key art → water-arrival: the single boat-reveal dissolve. */
  readonly keyArtToWaterMs: number;
  /** Water-arrival → water-to-galaxy dissolve. */
  readonly waterToGalaxyMs: number;
  /** Water-to-galaxy → composed galaxy dissolve (more room to breathe). */
  readonly galaxyComposeMs: number;
  /** How long the boat takes to fade in (with water-arrival) and out. */
  readonly boatFadeMs: number;
  /** Final hold on the pure galaxy before handing off to the scene. */
  readonly galaxyHoldMs: number;
}

// Single-boat handoff tuning for the key-art → water dissolve (fractions of that
// dissolve). Frame 0 (the painted key art, whose painted boat is the "boat")
// fades OUT over the back portion so it has receded before the composited drift
// boat appears; the drift boat holds hidden until near the end, then fades in
// quickly — so the painted boat is essentially gone first (only a trace overlap).
const FRAME0_FADE_START_FRAC = 0.5;
const BOAT_REVEAL_START_FRAC = 0.75;

const REAL_TIMING: EndingTiming = {
  keyArtToWaterMs: 3200,
  waterToGalaxyMs: 3200,
  galaxyComposeMs: 4200,
  boatFadeMs: 2200,
  galaxyHoldMs: 2400,
};

// testMode collapses the pacing so the Playwright full-run smoke stays fast and
// deterministic without losing a beat of the sequence.
const TEST_TIMING: EndingTiming = {
  keyArtToWaterMs: 50,
  waterToGalaxyMs: 50,
  galaxyComposeMs: 50,
  boatFadeMs: 40,
  galaxyHoldMs: 40,
};

function isTestMode(): boolean {
  return new URL(window.location.href).searchParams.get('testMode') === '1';
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
  keyArt: boolean;
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
  const [keyArt, waterArrival, waterToGalaxy, hull, sail, lantern, rider] =
    await Promise.all([
      isImageUrl(ASSET.keyArt),
      isImageUrl(ASSET.waterArrival),
      isImageUrl(ASSET.waterToGalaxy),
      isImageUrl(ASSET.hull),
      isImageUrl(ASSET.sail),
      isImageUrl(ASSET.lantern),
      isImageUrl(ASSET.rider),
    ]);
  probed = { keyArt, waterArrival, waterToGalaxy, hull, sail, lantern, rider };
  return probed;
}

export const finalKeepsakeActivity: ActivityModule = {
  id: 'final-keepsake-reveal',
  title: 'Out to Sea',
  async start({ mount, onComplete }) {
    const timing = isTestMode() || prefersReducedMotion() ? TEST_TIMING : REAL_TIMING;
    const assets = await probeAssets();

    const { frame, boat, galaxy, layers, frameFades } = buildTransition(mount, assets, timing);

    // The boat rides from the water-arrival dissolve onward: with key art present
    // it fades in as the (boatless) water frame dissolves over the painting, so
    // the painting's boat hands off to the composited one with never two visible.
    // Without key art (graceful degrade) the water frame is frame 0, so the boat
    // is present from the start.
    const boatAppearIndex = assets.keyArt ? 1 : 0;
    // The drift spans every fade AFTER frame 0 — the boat is on screen for all of
    // them and lands exactly as the galaxy settles. Synced to the frame-sequence
    // length from one JS source (the CSS drift no longer hard-codes a duration).
    const driftMs = frameFades.slice(1).reduce((sum, ms) => sum + ms, 0);
    // Hold the composited boat hidden until the LAST quarter of the water-arrival
    // dissolve, then fade it in over that quarter: by then the empty-ocean frame
    // has all but covered the key art's (large, foreground) painted boat AND the
    // key art itself is fading out (see below), so the painted boat is essentially
    // gone before the (small, distant) composited boat appears — never two boats
    // at once. In the degraded frame-0 path there is no dissolve, so plain-fade it.
    const boatDissolveMs = boatAppearIndex >= 1 ? frameFades[boatAppearIndex]! : timing.boatFadeMs;
    const boatFadeInMs =
      boatAppearIndex >= 1
        ? Math.round(boatDissolveMs * (1 - BOAT_REVEAL_START_FRAC))
        : timing.boatFadeMs;
    const boatFadeInDelayMs = boatAppearIndex >= 1 ? boatDissolveMs - boatFadeInMs : 0;

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
    playMusic('music-ending', { fadeMs: isTestMode() ? 200 : 3200 });

    // Frame 0 comes up at full opacity IMMEDIATELY — the sail-away key art holds
    // unbroken (the bridge on the UI root has been covering the scene swap). No
    // re-fade, no opening hold. The bridge key art is STATIC (no Ken-Burns), so
    // pin frame 0 to the same static scale (kill the ending-frame-drift it would
    // otherwise inherit) — otherwise the swap pops from scale 1.0 to the drift's
    // 1.015 start. Subsequent frames keep their drift. Set opacity before any
    // forced reflow so the layer never paints transparent, then remove the bridge
    // now that we cover it. (Degraded path: no bridge/key art, keep the drift.)
    if (assets.keyArt) {
      frame(0).style.animation = 'none';
    }
    frame(0).style.opacity = '1';
    void frame(0).offsetWidth;
    document.querySelector('[data-ending-bridge]')?.remove();

    if (boatAppearIndex === 0) {
      appearBoat();
    }

    // Cross-fade through each subsequent painted frame, ending on the galaxy.
    for (let index = 1; index < layers; index += 1) {
      frame(index).style.opacity = '1';
      // As the water frame dissolves in over the painted key art (the boat-reveal
      // dissolve), fade the key art (frame 0) OUT over the back portion of the
      // SAME dissolve — it is never left pinned at 1 under the stack, and its
      // painted boat has receded by the time the composited boat appears.
      if (index === boatAppearIndex && assets.keyArt) {
        const dissolveMs = frameFades[index]!;
        const frame0FadeMs = Math.round(dissolveMs * (1 - FRAME0_FADE_START_FRAC));
        const frame0FadeDelayMs = dissolveMs - frame0FadeMs;
        frame(0).style.transition = `opacity ${frame0FadeMs}ms ease ${frame0FadeDelayMs}ms`;
        void frame(0).offsetWidth;
        frame(0).style.opacity = '0';
      }
      if (index === boatAppearIndex) {
        appearBoat();
      }
      // The swell lands as the water turns to galaxy (the penultimate fade).
      if (index === layers - 1) {
        playSfx('sfx-ending-swell');
      }
      await wait(frameFades[index]!);
    }

    // The galaxy holds; the boat fades away so the handoff to the (boatless)
    // playable galaxy scene is seamless.
    if (boat) {
      boat.style.transition = `opacity ${timing.boatFadeMs}ms ease`;
      boat.style.opacity = '0';
    }
    galaxy.dataset.endingGalaxy = 'settled';
    await wait(Math.max(timing.boatFadeMs, timing.galaxyHoldMs));

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
  stage.setAttribute('aria-label', 'The boat drifts out into the ocean-galaxy.');

  // The ordered frame sequence: painted frames when present (file-first), always
  // ending on the code-composed galaxy. Each layer stacks above the previous so
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

  if (assets.keyArt) {
    push(imageLayer(ASSET.keyArt, timing.keyArtToWaterMs), timing.keyArtToWaterMs);
  }
  if (assets.waterArrival) {
    push(imageLayer(ASSET.waterArrival, timing.keyArtToWaterMs), timing.keyArtToWaterMs);
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

// The composed ocean-galaxy: the SAME painted sky/water layers the wash used,
// stacked with drifting sunbeams. Always present (pure CSS over the existing
// ending-sky / ending-water art), so it is the guaranteed terminal frame.
function galaxyLayer(fadeMs: number): HTMLElement {
  const layer = document.createElement('div');
  layer.className = 'ending-frames__layer ending-frames__layer--galaxy';
  layer.dataset.endingGalaxy = '';
  layer.style.transitionDuration = `${fadeMs}ms`;

  const sky = document.createElement('div');
  sky.className = 'ending-ocean__sky';
  const water = document.createElement('div');
  water.className = 'ending-ocean__water';
  const beams = document.createElement('div');
  beams.className = 'ending-ocean__beams';
  for (let index = 0; index < 3; index += 1) {
    const beam = document.createElement('span');
    beam.className = `ending-ocean__beam ending-ocean__beam--${index}`;
    beams.append(beam);
  }
  layer.append(sky, water, beams);
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
