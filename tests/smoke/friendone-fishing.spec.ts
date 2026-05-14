import { expect, test } from '@playwright/test';

test('completes ____ PC fishing activity through test mode', async ({ page }) => {
  await page.goto('/?testMode=1&locationId=friend-a&spawnId=near-friendone-pc');

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Keepsakes');

  await canvas.click();
  await page.keyboard.down('E');
  await page.waitForTimeout(120);
  await page.keyboard.up('E');

  await expect(page.getByText('The PC monitor warms into a soft pond scene.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('dialog', { name: '____ Fishing' })).toBeVisible();
  await page.getByRole('button', { name: 'Complete fishing' }).click();

  await expect(page.getByText('____')).toBeVisible();
  await expect(page.getByText('')).toBeVisible();
  await expect(page.locator('.collection-panel')).not.toContainText('Glowing Koi Scale');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.locator('.collection-panel')).toContainText('Glowing Koi Scale');
});
