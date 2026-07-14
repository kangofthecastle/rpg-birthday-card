import { expect, test } from '@playwright/test';

test('completes RETAKE.EXE at ____ house through test mode', async ({ page }) => {
  await page.goto(
    '/?testMode=1&locationId=friend-b&spawnId=near-friendtwo-pc&seedKeepsakes=glowing-koi-scale',
  );

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Letters');
  await expect(page.locator('body')).toHaveAttribute('data-friendone-mode', 'waiting');

  // ____ stays beside ____ through the empty-house exchange. Her walk begins
  // only after ____'s final "He did say LAN party..." line is dismissed.
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-friendone-mode', 'waiting');
  }
  await expect(page.getByText('He did say LAN party...')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-friendone-mode', 'arriving');

  await canvas.click();
  await page.keyboard.down('E');
  await page.waitForTimeout(120);
  await page.keyboard.up('E');

  // The game is visibly loaded before ____ comments on the selected agent.
  await expect(page.getByRole('dialog', { name: 'RETAKE.EXE' })).toBeVisible();
  await expect(page.getByText('Omen? You don’t play Omen very often.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('~~')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Defuse the spike' }).click();

  await expect(page.getByText(/Sorry I had to leave before the round ended/)).toBeVisible();
  await expect(page.locator('.collection-panel')).not.toContainText('____’s Letter');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('____?')).toBeVisible();
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  await expect(page.locator('.collection-panel')).toContainText('____’s Letter');
});
