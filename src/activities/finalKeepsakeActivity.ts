import type { ActivityModule } from './activityTypes';
import type { DialogueLine } from '../content/types';
import {
  createPlacement,
  ENDING_KEEPSAKE_ID,
  FINAL_ENDING_LETTERS,
  FINAL_KEEPSAKES,
  isFullyPlaced,
  lightLantern,
  placeNextKeepsake,
  type PlacementModel,
} from './finalKeepsake/endingModel';
import { playMusic, playSfx } from '../game/audio';
import { getUiRoot } from '../ui/domRoot';
import { showLetterModal } from '../ui/letterModal';
import { showLettersScreen } from '../ui/lettersScreen';

/**
 * The ending. She places the three keepsakes around the lantern one by one;
 * it catches light; the world washes away into the ocean-galaxy; two short
 * letters arrive; then the game returns to the cold-open screen — now warm,
 * lit, and full of letters from her friends.
 *
 * DOM-based (like an activity) for reliability and pacing. The keepsake
 * placement, the wash, and the letters screen are code-drawn/CSS so nothing
 * blocks on generated art; the painted sky/water layers drop in on top.
 */

interface EndingTiming {
  readonly placeIntervalMs: number;
  readonly settleMs: number;
  readonly litHoldMs: number;
  readonly preWashMs: number;
  readonly swellAtMs: number;
  readonly washHoldMs: number;
}

const REAL_TIMING: EndingTiming = {
  placeIntervalMs: 780,
  settleMs: 620,
  litHoldMs: 1400,
  preWashMs: 900,
  swellAtMs: 1300,
  washHoldMs: 2100,
};

// testMode collapses the pacing so the Playwright full-run smoke stays fast
// and deterministic without losing a single beat of the sequence.
const TEST_TIMING: EndingTiming = {
  placeIntervalMs: 40,
  settleMs: 30,
  litHoldMs: 40,
  preWashMs: 30,
  swellAtMs: 30,
  washHoldMs: 40,
};

function isTestMode(): boolean {
  return new URL(window.location.href).searchParams.get('testMode') === '1';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const finalKeepsakeActivity: ActivityModule = {
  id: 'final-keepsake-reveal',
  title: 'The Lantern Clearing',
  async start({ mount, onComplete }) {
    const timing = isTestMode() ? TEST_TIMING : REAL_TIMING;
    const { stage, keepsakeEls, lantern, ocean } = buildStage(mount);

    // a. Place the keepsakes, one by one, around the lantern.
    let placement: PlacementModel = createPlacement(FINAL_KEEPSAKES.length);
    for (let index = 0; index < keepsakeEls.length; index += 1) {
      await wait(timing.placeIntervalMs);
      placement = placeNextKeepsake(placement);
      keepsakeEls[index]?.classList.add('ending-keepsake--placed');
      playSfx('sfx-keepsake');
      await wait(timing.settleMs);
    }

    // …then the lantern lights.
    if (isFullyPlaced(placement)) {
      placement = lightLantern(placement);
      lantern.classList.add('ending-lantern--lit');
      playSfx('sfx-keepsake', { rate: 0.7 });
    }
    await wait(timing.litHoldMs);

    // b. The wash: the clearing dissolves into the ocean-galaxy.
    await wait(timing.preWashMs);
    ocean.setAttribute('aria-hidden', 'false');
    stage.classList.add('ending-stage--wash');
    playMusic('music-ending', { fadeMs: 3000 });
    await wait(timing.swellAtMs);
    playSfx('sfx-ending-swell');
    await wait(timing.washHoldMs);

    // c. The two final letters, over the ocean-galaxy.
    for (const letter of FINAL_ENDING_LETTERS) {
      await showLetterModal(letter as readonly DialogueLine[]);
    }

    // d. Back to the cold-open screen — now warm, lit, full of letters.
    //    Mount the persistent letters screen above the ocean, then let the
    //    scene mark the ending complete and remove the ocean beneath it.
    showLettersScreen({ host: getUiRoot(), fadeIn: true });
    onComplete({ locationId: 'final-spot', keepsakeId: ENDING_KEEPSAKE_ID });
  },
};

interface StageParts {
  readonly stage: HTMLElement;
  readonly keepsakeEls: readonly HTMLElement[];
  readonly lantern: HTMLElement;
  readonly ocean: HTMLElement;
}

// Resting positions for the three keepsakes: a small triangle at the base of
// the lantern (percentages of the stage).
const KEEPSAKE_SLOTS: readonly { left: number; top: number }[] = [
  { left: 39, top: 55 },
  { left: 61, top: 55 },
  { left: 50, top: 63 },
];

function buildStage(mount: HTMLElement): StageParts {
  const stage = document.createElement('div');
  stage.className = 'ending-stage';
  stage.dataset.endingStage = '';
  stage.setAttribute('role', 'dialog');
  stage.setAttribute('aria-label', 'The Lantern Clearing');

  // The clearing — the world before it washes away.
  const clearing = document.createElement('div');
  clearing.className = 'ending-clearing';

  // She arrives by boat: it rests at the lantern table, and the three letters
  // she folded it from unfold themselves one by one around the light.
  const caption = document.createElement('p');
  caption.className = 'ending-caption';
  caption.textContent = 'The boat rests. The letters open, and the music uncurls beside them.';
  clearing.append(caption);

  const boat = document.createElement('div');
  boat.className = 'ending-boat';
  const boatHull = document.createElement('span');
  boatHull.className = 'ending-boat__hull';
  const boatSail = document.createElement('span');
  boatSail.className = 'ending-boat__sail';
  boat.append(boatHull, boatSail);
  clearing.append(boat);

  const lantern = document.createElement('div');
  lantern.className = 'ending-lantern';
  const lanternGlow = document.createElement('span');
  lanternGlow.className = 'ending-lantern__glow';
  const lanternBody = document.createElement('span');
  lanternBody.className = 'ending-lantern__body';
  lantern.append(lanternGlow, lanternBody);

  const keepsakeEls = FINAL_KEEPSAKES.map((keepsake, index) => {
    const slot = KEEPSAKE_SLOTS[index] ?? { left: 50, top: 60 };
    const img = document.createElement('img');
    img.className = 'ending-keepsake ending-keepsake--letter';
    img.src = keepsake.iconUrl;
    img.alt = `${keepsake.label}, unfolding`;
    img.style.left = `${slot.left}%`;
    img.style.top = `${slot.top}%`;
    img.style.transitionDuration = '620ms';
    clearing.append(img);
    return img;
  });

  clearing.append(lantern);

  // The ocean-galaxy — washes in.
  const ocean = document.createElement('div');
  ocean.className = 'ending-ocean';
  ocean.dataset.endingOcean = '';
  ocean.setAttribute('aria-hidden', 'true');

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

  const recipient = document.createElement('div');
  recipient.className = 'ending-ocean__recipient';
  recipient.setAttribute('aria-hidden', 'true');

  ocean.append(sky, water, beams, recipient);
  stage.append(clearing, ocean);
  mount.append(stage);

  return { stage, keepsakeEls, lantern, ocean };
}
