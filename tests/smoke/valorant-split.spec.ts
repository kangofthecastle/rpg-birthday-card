import { expect, test } from '@playwright/test';

test('completes SPLIT.EXE at ____ house through test mode', async ({ page }) => {
  await page.goto('/?testMode=1&locationId=friend-b&spawnId=near-friendtwo-pc');

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Keepsakes');

  await canvas.click();
  await page.keyboard.down('E');
  await page.waitForTimeout(120);
  await page.keyboard.up('E');

  await expect(page.getByText('The monitor flickers to a familiar loadout screen.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('dialog', { name: 'SPLIT.EXE' })).toBeVisible();
  await page.getByRole('button', { name: 'Defuse the spike' }).click();

  await expect(page.getByText('See? Told you.')).toBeVisible();
  await expect(page.locator('.collection-panel')).not.toContainText('Defused Spike Charm');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('This year threw everything it had at you')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.locator('.collection-panel')).toContainText('Defused Spike Charm');
});
