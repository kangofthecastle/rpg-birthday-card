import { expect, test } from '@playwright/test';

// testMode skips the cold-open boot overlay and lands straight in a location.
test('boots the game and shows the canvas', async ({ page }) => {
  await page.goto('/?testMode=1');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Backpack');
});

// The Guildford fingerposts are decoration-only now (locations.ts strips the
// main-signpost interaction), so the old "read the signpost" smoke can never
// fire. Cover the outdoor E-interaction path with the door that still works:
// walking up to ____'s front door and entering.
test('enters ____’s house from the path with E at the front door', async ({
  page,
}) => {
  await page.goto('/?testMode=1&locationId=main-outside&spawnId=from-recipient-house');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'main-outside');

  await canvas.click();

  // The from-recipient-house spawn sits just south of the front-door exit rect
  // (672,148 128x88; main-outside is FLAT projection, so ArrowUp is straight
  // world-north). Walk north pressing E each step until the door fires.
  let inside = false;
  for (let step = 0; step < 12 && !inside; step += 1) {
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(110);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('E', { delay: 30 });
    await page.waitForTimeout(80);
    inside =
      (await page.locator('body').getAttribute('data-location-id')) === 'recipient-house';
  }

  expect(inside).toBe(true);
});
