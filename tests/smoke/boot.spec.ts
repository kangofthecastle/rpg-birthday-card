import { expect, test } from '@playwright/test';

// Clicks any visible dialogue Continue button(s) to clear a beat, short-circuiting
// as soon as none is showing (so it never blocks waiting on a button that isn't
// there — e.g. the single-line dark-PC beat).
async function dismissDialogue(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const button = page.getByRole('button', { name: 'Continue' });
    if (!(await button.isVisible().catch(() => false))) {
      break;
    }
    await button.click().catch(() => {});
    await page.waitForTimeout(50);
  }
}

// A fresh load (no testMode) plays the cold-open boot overlay, then drops ____
// into her room. Verifies the intro beat, an easter egg, and the dark PC.
test('cold open plays, then lands in ____’s room with the dark PC', async ({ page }) => {
  await page.goto('/');

  // The boot overlay is up and the game canvas has not been created yet.
  const bootScreen = page.locator('.boot-screen');
  await expect(bootScreen).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);

  // Any key advances the typed lines; keep pressing until the overlay clears.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(160);
    if ((await bootScreen.count()) === 0) {
      break;
    }
  }
  await expect(bootScreen).toHaveCount(0);

  // The Phaser game is now revealed.
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  // Cold-open intro beat.
  await expect(page.getByText('Where am I?')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('somebody made it')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // The PC is dark until both friend keepsakes exist. The room was rearranged
  // (dressEdit): the desk now sits north-east of the entrance rather than on the
  // spawn, so walk to it — ArrowRight moves +x/−y in this iso room, straight
  // into the desk — and use it.
  await canvas.click();
  let darkPcShown = false;
  for (let step = 0; step < 18 && !darkPcShown; step += 1) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(90);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('E', { delay: 25 });
    if (await page.getByText('NO SIGNAL').isVisible().catch(() => false)) {
      darkPcShown = true;
      break;
    }
    await dismissDialogue(page);
  }
  expect(darkPcShown).toBe(true);
  // The dark-PC beat is a single cozy line now; dismiss it, then let the
  // dialogue fade-out finish — movement input is swallowed while it fades, so
  // walking off immediately can silently lose the first steps of the egg walk.
  await dismissDialogue(page);
  await page.waitForTimeout(450);

  // From the desk, continue up-and-right to the photo wall on the north-east
  // wall and confirm a (non-PC) easter-egg prompt fires. Any of ____'s plain
  // easter eggs counts. (The violin stand is now a *locked* activity, not an
  // egg; the mango corner moved south-east, so the photo wall is the reliable
  // target from the desk.)
  await canvas.click();
  const eggPhrases = ['photographs', 'the next good day', 'Mango sticky rice'];
  const dialogueText = page.locator('.dialogue-box__text');

  // Hold Up+Right continuously and poll, rather than pulsing short taps: under
  // full-suite load the frame rate starves and a 90ms tap can move the player
  // barely at all, silently eating the whole step budget. Skip E for the first
  // few polls so we walk clear of the desk rect (pressing E immediately just
  // re-fires NO SIGNAL in place).
  let easterEggShown = false;
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  for (let step = 0; step < 40 && !easterEggShown; step += 1) {
    await page.waitForTimeout(120);
    if (step < 4) {
      continue;
    }
    await page.keyboard.press('E', { delay: 25 });

    if (!(await dialogueText.isVisible().catch(() => false))) {
      continue;
    }

    const text = (await dialogueText.textContent().catch(() => '')) ?? '';
    if (eggPhrases.some((phrase) => text.includes(phrase))) {
      easterEggShown = true;
      break;
    }

    // A stray beat (e.g. NO SIGNAL while still on the desk rect) — dismiss it,
    // re-focus the canvas, and re-hold the walk keys (the dialogue overlay
    // steals focus, dropping the held arrows).
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('ArrowUp');
    await dismissDialogue(page);
    await canvas.click();
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('ArrowRight');
  }
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowUp');
  expect(easterEggShown).toBe(true);
});

// The boot gate must also accept mouse left-clicks, not just keys, so the game
// is fully playable with the mouse alone.
test('cold open can be advanced by mouse clicks alone', async ({ page }) => {
  await page.goto('/');

  const bootScreen = page.locator('.boot-screen');
  await expect(bootScreen).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);

  // Left-click repeatedly to fast-forward the typed lines and pass the final
  // "press any key" gate, without touching the keyboard.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.mouse.click(640, 360);
    await page.waitForTimeout(160);
    if ((await bootScreen.count()) === 0) {
      break;
    }
  }
  await expect(bootScreen).toHaveCount(0);

  // The Phaser game is revealed, same as the keyboard path.
  await expect(page.locator('canvas')).toBeVisible();
});
