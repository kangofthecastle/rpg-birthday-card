import { expect, test } from '@playwright/test';

test('completes ____ PC fishing activity through test mode', async ({ page }) => {
  await page.goto(
    '/?testMode=1&locationId=friend-a&spawnId=near-friendone-pc&seedBeats=friendone-text-read,friendone-pc-ready',
  );

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Backpack');
  await expect(page.locator('body')).toHaveAttribute('data-friendone-pc-ready', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-friendone-pc-cue', 'glass-shine');

  await canvas.click();
  await page.keyboard.down('E');
  await page.waitForTimeout(120);
  await page.keyboard.up('E');

  await expect(page.getByText('The PC monitor warms into a soft pond scene.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('dialog', { name: '____ Fishing' })).toBeVisible();
  await page.getByRole('button', { name: 'Complete fishing' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-friendone-fish-count', '2');
  await expect(page.locator('body')).toHaveAttribute('data-koi-transition', 'complete');
  await expect(page.locator('body')).not.toHaveAttribute('data-friendone-pc-ready');

  await expect(page.getByText('____')).toBeVisible();
  await expect(page.locator('.letter-modal__text')).toHaveText('');
  await expect(page.locator('.collection-panel')).not.toContainText('____’s Letter');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('There. Now they have company.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('So down!')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.locator('.collection-panel')).toContainText('____’s Letter');
});
