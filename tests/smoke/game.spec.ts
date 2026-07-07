import { expect, test } from '@playwright/test';

// testMode skips the cold-open boot overlay and lands straight in a location.
test('boots the game and shows the canvas', async ({ page }) => {
  await page.goto('/?testMode=1');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Keepsakes');
});

test('shows an interaction prompt when the player reaches the entry sign', async ({
  page,
}) => {
  await page.goto('/?testMode=1&locationId=entry&spawnId=start');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Keepsakes');

  await canvas.click();
  await page.keyboard.press('E', { delay: 50 });

  await expect(
    page.getByText('Two doors, and a path between them.'),
  ).toBeVisible();
});
