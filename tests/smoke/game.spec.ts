import { expect, test } from '@playwright/test';

test('boots the game and shows the canvas', async ({ page }) => {
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Keepsakes');
});

test('shows an interaction prompt when the player reaches the entry sign', async ({
  page,
}) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Keepsakes');

  await canvas.click();
  await page.keyboard.press('E', { delay: 50 });

  await expect(
    page.getByText('Three doors are waiting. Each one holds a small piece of the way forward.'),
  ).toBeVisible();
});
