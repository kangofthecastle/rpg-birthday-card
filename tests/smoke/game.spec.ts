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
  await page.locator('canvas').click();
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(200);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.down('E');
  await page.waitForTimeout(100);
  await page.keyboard.up('E');

  await expect(
    page.getByText('Three doors are waiting. Each one holds a small piece of the way forward.'),
  ).toBeVisible();
});
