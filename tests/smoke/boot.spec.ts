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

  // ____ spawns at her desk: the PC is dark until both friend keepsakes exist.
  await canvas.click();
  await page.keyboard.press('E', { delay: 50 });
  await expect(page.getByText('NO SIGNAL')).toBeVisible();
  // The dark-PC beat is a single cozy line now; dismiss it.
  await dismissDialogue(page);

  // Walk up toward the props along the far wall and confirm an easter-egg
  // prompt fires. Any of ____'s room easter eggs counts.
  await canvas.click();

  // Any of ____'s room easter eggs counts. The violin stand (top-left) is now
  // a *locked* activity rather than an egg, so head up-and-right toward the
  // mango corner (a plain easter egg): ArrowRight moves +x/−y in this iso room,
  // which walks from the desk straight into the mango-rice prop.
  const eggPhrases = ['Mango sticky rice', 'the next good day', 'photographs'];
  const dialogueText = page.locator('.dialogue-box__text');

  let easterEggShown = false;
  for (let step = 0; step < 24 && !easterEggShown; step += 1) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(90);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('E', { delay: 25 });

    if (!(await dialogueText.isVisible().catch(() => false))) {
      continue;
    }

    const text = (await dialogueText.textContent().catch(() => '')) ?? '';
    if (eggPhrases.some((phrase) => text.includes(phrase))) {
      easterEggShown = true;
      break;
    }

    // NO SIGNAL / a locked beat — dismiss and keep going. (Phaser keyboard input
    // is global, so no canvas re-click is needed between steps — re-clicking an
    // obscured canvas mid dialogue-fade can stall.)
    await dismissDialogue(page);
  }
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
