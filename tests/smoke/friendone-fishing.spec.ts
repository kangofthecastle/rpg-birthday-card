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
  const interactionPrompt = page.locator('[data-interaction-prompt]');
  await expect(interactionPrompt).toBeVisible();
  await expect(interactionPrompt).toContainText('E');
  await expect(interactionPrompt).toContainText('Enter the fishing game');

  await canvas.click();
  await page.keyboard.down('E');
  await page.waitForTimeout(120);
  await page.keyboard.up('E');

  await expect(page.getByText('The PC monitor warms into a soft pond scene.')).toBeVisible();
  await expect(interactionPrompt).toBeHidden();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('dialog', { name: '____ Fishing' })).toBeVisible();
  await page.getByRole('button', { name: 'Complete fishing' }).click();

  // The letter is the immediate reward. Its paper must close before the bowl,
  // +1 KOI animation, and koi-arrival sound are allowed to fire.
  await expect(page.locator('.letter-modal__speaker')).toHaveCount(0);
  await expect(page.locator('.letter-modal__text')).toContainText('Happy Birthday ____!!!!!');
  await expect(page.locator('body')).not.toHaveAttribute('data-koi-transition');
  await expect(page.locator('.collection-panel')).not.toContainText('____’s Letter');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.photo-letter-modal__photo-caption')).toContainText(
    '[Example caption]',
  );
  await expect(page.locator('body')).not.toHaveAttribute('data-koi-transition');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-friendone-fish-count', '2');
  await expect(page.locator('body')).toHaveAttribute('data-koi-transition', 'complete');
  await expect(page.locator('body')).not.toHaveAttribute('data-friendone-pc-ready');

  await expect(page.getByText('There. Now they have company.')).toBeVisible();
  for (let line = 0; line < 6; line += 1) {
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  await expect(page.locator('.collection-panel')).toContainText('____’s Letter');
});
