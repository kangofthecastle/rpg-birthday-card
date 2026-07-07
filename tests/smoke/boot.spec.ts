import { expect, test } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Walk up toward the props along the far wall and confirm an easter-egg
  // prompt fires. Any of ____'s room easter eggs counts.
  await canvas.click();

  const eggPhrases = [
    'already in tune',
    "how many times it's been seen",
    'Mango sticky rice',
    'the next good day',
    'rest easy here',
  ];
  const dialogueText = page.locator('.dialogue-box__text');

  let easterEggShown = false;
  for (let step = 0; step < 20 && !easterEggShown; step += 1) {
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(120);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('E', { delay: 30 });

    if (!(await dialogueText.isVisible().catch(() => false))) {
      continue;
    }

    const text = (await dialogueText.textContent().catch(() => '')) ?? '';
    if (eggPhrases.some((phrase) => text.includes(phrase))) {
      easterEggShown = true;
      break;
    }

    // NO SIGNAL — the player is still at the desk. Dismiss and keep walking up.
    await page.getByRole('button', { name: 'Continue' }).click().catch(() => {});
    await page.getByRole('button', { name: 'Continue' }).click().catch(() => {});
    await canvas.click();
  }
  expect(easterEggShown).toBe(true);
});
