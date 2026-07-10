import { expect, test } from '@playwright/test';

// testMode skips the cold-open boot overlay and lands straight in a location.
test('boots the game and shows the canvas', async ({ page }) => {
  await page.goto('/?testMode=1');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Letters');
});

test('shows an interaction prompt when the player reaches the signpost', async ({
  page,
}) => {
  await page.goto('/?testMode=1&locationId=main-outside&spawnId=start');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Letters');

  await canvas.click();

  // The signpost stands north of the spawn. Up+two-Rights nets straight world-
  // north (x steady); press E each step until the signpost dialogue fires.
  const pattern = ['ArrowUp', 'ArrowRight', 'ArrowRight'] as const;
  const signpost = page.getByText('Arrows point every way');
  let shown = false;
  for (let step = 0; step < 24 && !shown; step += 1) {
    const key = pattern[step % pattern.length];
    await page.keyboard.down(key);
    await page.waitForTimeout(110);
    await page.keyboard.up(key);
    await page.keyboard.press('E', { delay: 30 });
    await page.waitForTimeout(80);
    shown = await signpost.isVisible().catch(() => false);
  }

  await expect(signpost).toBeVisible();
});
