import type { ActivityModule } from './activityTypes';
import { playMusic, playSfx } from '../game/audio';
import { isImageUrl } from '../game/assetProbe';

/**
 * The ending transition. After the sail-away cinematic holds on its key art, the
 * boat drifts on out to sea: a slow, breathing cross-fade through a short frame
 * sequence — the open water under a first hint of galaxy, then the water turning
 * to galaxy, and finally the composed ocean-galaxy — with the paper boat (the
 * SAME hull / sail / lantern / rider pieces the cinematic composites) riding on
 * top the whole way, drifting smaller as it goes. It ends holding on the galaxy
 * and hands off (`endingArrival`) to the live, playable galaxy scene, where ____
 * regains control and walks up to ____.
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

interface EndingTiming {
  /** Hold on the opening frame before the first cross-fade begins. */
  readonly openHoldMs: number;
  /** Length of each breathing cross-fade between frames. */
  readonly crossFadeMs: number;
  /** How long the boat takes to fade away as the galaxy settles. */
  readonly boatFadeMs: number;
  /** Final hold on the pure galaxy before handing off to the scene. */
  readonly galaxyHoldMs: number;
}

const REAL_TIMING: EndingTiming = {
  openHoldMs: 1400,
  crossFadeMs: 3200,
  boatFadeMs: 2200,
  galaxyHoldMs: 2400,
};

// testMode collapses the pacing so the Playwright full-run smoke stays fast and
// deterministic without losing a beat of the sequence.
const TEST_TIMING: EndingTiming = {
  openHoldMs: 40,
  crossFadeMs: 50,
  boatFadeMs: 40,
  galaxyHoldMs: 40,
};

function isTestMode(): boolean {
  return new URL(window.location.href).searchParams.get('testMode') === '1';
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
    const timing = isTestMode() ? TEST_TIMING : REAL_TIMING;
    const assets = await probeAssets();

    const { frame, boat, galaxy, layers } = buildTransition(mount, assets, timing);

    // The ending swell + bed rise as the drift begins.
    playMusic('music-ending', { fadeMs: isTestMode() ? 200 : 3200 });

    // Reveal the opening frame + boat, and let the boat begin its slow drift.
    void frame(0).offsetWidth; // reflow so the initial opacity transitions apply
    if (boat) {
      boat.classList.add('ending-frames__boat--drift');
    }
    frame(0).style.opacity = '1';
    await wait(timing.openHoldMs);

    // Cross-fade through each subsequent painted frame, ending on the galaxy.
    for (let index = 1; index < layers; index += 1) {
      frame(index).style.opacity = '1';
      // The swell lands as the water turns to galaxy (the penultimate fade).
      if (index === layers - 1) {
        playSfx('sfx-ending-swell');
      }
      await wait(timing.crossFadeMs);
    }

    // The galaxy holds; the boat fades away so the handoff to the (boatless)
    // playable galaxy scene is seamless.
    if (boat) {
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
  // fading it in reveals it over the one before — a breathing cross-fade.
  const frames: HTMLElement[] = [];

  if (assets.keyArt) {
    frames.push(imageLayer(ASSET.keyArt, timing));
  }
  if (assets.waterArrival) {
    frames.push(imageLayer(ASSET.waterArrival, timing));
  }
  if (assets.waterToGalaxy) {
    frames.push(imageLayer(ASSET.waterToGalaxy, timing));
  }
  const galaxy = galaxyLayer(timing);
  frames.push(galaxy);

  for (const layer of frames) {
    stage.append(layer);
  }

  // The boat rides on top of every frame — the SAME pieces the sail-away
  // cinematic composites, so it never changes identity.
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
  };
}

function imageLayer(url: string, timing: EndingTiming): HTMLElement {
  const layer = document.createElement('div');
  layer.className = 'ending-frames__layer ending-frames__layer--photo';
  layer.style.backgroundImage = `url('${url}')`;
  layer.style.transitionDuration = `${timing.crossFadeMs}ms`;
  return layer;
}

// The composed ocean-galaxy: the SAME painted sky/water layers the wash used,
// stacked with drifting sunbeams. Always present (pure CSS over the existing
// ending-sky / ending-water art), so it is the guaranteed terminal frame.
function galaxyLayer(timing: EndingTiming): HTMLElement {
  const layer = document.createElement('div');
  layer.className = 'ending-frames__layer ending-frames__layer--galaxy';
  layer.dataset.endingGalaxy = '';
  layer.style.transitionDuration = `${timing.crossFadeMs}ms`;

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
  boat.append(
    piece('ending-frames__hull', assets.hull ? ASSET.hull : undefined),
    piece('ending-frames__sail', assets.sail ? ASSET.sail : undefined),
    piece('ending-frames__lantern', assets.lantern ? ASSET.lantern : undefined),
    piece('ending-frames__rider', assets.rider ? ASSET.rider : undefined),
  );
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
