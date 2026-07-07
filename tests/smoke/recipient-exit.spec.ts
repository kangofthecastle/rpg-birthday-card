import { expect, test } from '@playwright/test';

// Dressed rooms hide the debug rects, so the exit is shown as a diegetic
// doormat. This walks ____ from her spawn to that doormat and out to the
// Starting Path, proving the exit is findable and the E-prompt transitions.
test('walks from spawn to the doormat and steps outside to the Starting Path', async ({
  page,
}) => {
  await page.goto('/?testMode=1&locationId=recipient-house&spawnId=front-door');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  // The current location is mirrored onto the DOM so the label change is testable.
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'recipient-house');

  // Clear any enter-beat dialogue so the player can move.
  for (let i = 0; i < 6; i += 1) {
    const continueBtn = page.getByRole('button', { name: 'Continue' });
    if (await continueBtn.isVisible().catch(() => false)) {
      await continueBtn.click().catch(() => {});
      await page.waitForTimeout(120);
    } else {
      break;
    }
  }
  await canvas.click();

  // The doormat sits at the bottom-front of the room, past the desk. Down+Left
  // steers ____ south-west, threading the lane beside the desk collider and
  // onto the mat. Press E each step until the exit fires; dismiss any stray
  // interaction dialogue (e.g. the desk PC) and keep walking.
  let exited = false;
  for (let step = 0; step < 30 && !exited; step += 1) {
    await page.keyboard.down('ArrowDown');
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(120);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(60);

    await page.keyboard.press('E', { delay: 30 });
    await page.waitForTimeout(120);

    if ((await page.locator('body').getAttribute('data-location-id')) === 'entry') {
      exited = true;
      break;
    }

    const continueBtn = page.getByRole('button', { name: 'Continue' });
    while (await continueBtn.isVisible().catch(() => false)) {
      await continueBtn.click().catch(() => {});
      await page.waitForTimeout(80);
    }
    await canvas.click();
  }

  expect(exited).toBe(true);
  // The location label has changed: we are now on the Starting Path.
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'entry');
});
