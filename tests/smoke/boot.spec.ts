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
// into her room. Verifies the intro beat, an easter egg, and the PC/text inciting beat.
test('cold open plays, then lands in ____’s room with the unpowered PC and ____ text', async ({ page }) => {
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
  await expect(page.locator('body')).toHaveAttribute('data-intro-theme-hum', 'played');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Is this my room?')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Or... somebody’s version of it.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Whoever put me here must know me pretty well.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('body')).not.toHaveAttribute('data-intro-pc-buzz');
  await expect(page.locator('body')).toHaveAttribute('data-intro-pc-buzz', 'played', {
    timeout: 2500,
  });
  await expect(page.locator('body')).toHaveAttribute('data-intro-pc-glitch', 'played');

  // The PC is dark and fails to boot, then ____'s phone message supplies the
  // first destination. The room was rearranged
  // (dressEdit): the desk now sits north-east of the entrance rather than on the
  // spawn, so walk to it — ArrowRight moves +x/−y in this iso room, straight
  // into the desk — and use it.
  await canvas.click();
  let pcBeatShown = false;
  for (let step = 0; step < 18 && !pcBeatShown; step += 1) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(90);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('E', { delay: 25 });
    if (await page.getByText('Come on...').isVisible().catch(() => false)) {
      pcBeatShown = true;
      break;
    }
    await dismissDialogue(page);
  }
  expect(pcBeatShown).toBe(true);
  await expect(page.locator('body')).not.toHaveAttribute('data-phone-notification-count');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Nothing. It won’t even turn on.')).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-phone-notification-count');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('1 NEW MESSAGE')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-phone-notification-count', '1');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Hey! Happy birthday! Still coming over today?')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('I’m coming over today?')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('I think I forgot ;-; I’ll head over now!')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-phone-notification-count', '1');

  // The same permanent PC hotspot remains usable, but the inciting text is a
  // one-shot story beat. A second check only confirms that the machine is dark
  // and must not schedule another notification or replay ____'s message.
  await canvas.click();
  await page.keyboard.press('E', { delay: 25 });
  await expect(page.getByText('Still nothing. The screen is dark.')).toBeVisible();
  await expect(page.getByText('1 NEW MESSAGE')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-phone-notification-count', '1');
  await page.getByRole('button', { name: 'Continue' }).click();
  // Let the
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
  const eggPhrases = ['photographs', 'One frame is left empty', 'Mango sticky rice'];
  const dialogueText = page.locator('.dialogue-box__text');

  // Hold Up+Right continuously and poll, rather than pulsing short taps: under
  // full-suite load the frame rate starves and a 90ms tap can move the player
  // barely at all, silently eating the whole step budget. Skip E for the first
  // few polls so we walk clear of the desk rect.
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

    // A stray beat while still on the desk rect — dismiss it,
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

test('the hidden password command launches the isolated cards-mode room', async ({ page }) => {
  await page.goto('/');

  const bootScreen = page.locator('.boot-screen');
  const prompt = page.locator('.boot-screen__prompt');
  await expect(bootScreen).toBeVisible();

  // Four lines, four fast-forwards: stop at the final gate instead of letting
  // an ordinary fifth key launch the story run.
  for (let line = 0; line < 4; line += 1) {
    await page.keyboard.press('Enter');
  }
  await expect(prompt).toBeVisible();

  await page.keyboard.press('/');
  await page.keyboard.press('p');
  await expect(page.locator('.boot-screen__completion')).toHaveText('assword');
  await expect(page.locator('.boot-screen__tab-hint')).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.locator('.boot-screen__lines')).toContainText('/password\npassword:');
  await page.keyboard.type('pewpew');

  await expect(bootScreen).toHaveCount(0);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-run-mode', 'cards');
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'recipient-house');
  await expect(page.locator('body')).toHaveAttribute('data-pc-powered', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-interior-awakened', 'true');

  const letters = page.locator('.collection-panel');
  await expect(letters).toContainText('____’s Letter');
  await expect(letters).toContainText('____’s Letter');
  await expect(letters).toContainText('The piece on the stand');
  await expect(page.getByText('Where am I?')).toHaveCount(0);
});
