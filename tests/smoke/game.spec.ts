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

  // The signpost dialogue rect sits due north of the spawn on the central path
  // (main-outside is FLAT projection: ArrowUp is straight world-north, x steady).
  // The old Up+Right+Right pattern predates the flat switch — Rights now drift
  // east, and it only connected because the pre-fingerpost signs south of the
  // road happened to funnel the walk. Walk straight north; press E each step
  // until the junction signpost dialogue fires.
  const signpost = page.getByText('Arrows point every way');
  let shown = false;
  for (let step = 0; step < 24 && !shown; step += 1) {
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(110);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('E', { delay: 30 });
    await page.waitForTimeout(80);
    shown = await signpost.isVisible().catch(() => false);
  }

  await expect(signpost).toBeVisible();
});
