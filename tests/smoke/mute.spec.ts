import { expect, test } from '@playwright/test';

// The persistent top-right mute toggle controls audio and reflects its state.
test('the mute button toggles from the top-right corner', async ({ page }) => {
  await page.goto('/?testMode=1&locationId=recipient-house&spawnId=front-door');
  await expect(page.locator('canvas')).toBeVisible();

  const mute = page.getByRole('button', { name: 'Mute audio' });
  await expect(mute).toBeVisible();
  await expect(mute).toHaveAttribute('aria-pressed', 'false');

  await mute.click();

  // Muting flips it to an unmute control that reports the pressed state.
  const unmute = page.getByRole('button', { name: 'Unmute audio' });
  await expect(unmute).toBeVisible();
  await expect(unmute).toHaveAttribute('aria-pressed', 'true');

  await unmute.click();
  await expect(page.getByRole('button', { name: 'Mute audio' })).toBeVisible();
});
