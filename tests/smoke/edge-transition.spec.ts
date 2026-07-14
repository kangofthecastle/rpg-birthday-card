import { expect, test } from '@playwright/test';

// Outdoor areas connect edge-to-edge: walking off a map side (no E-press) drops
// the player into the neighbouring area on its opposite edge. This walks off
// main-outside's west edge and lands in ____'s block.
test('walks off the west edge of main-outside into ____’s block', async ({ page }) => {
  // Spawn mid-height (just outside ____'s door) so the straight-west walk has
  // plenty of vertical margin away from the open south edge.
  await page.goto(
    '/?testMode=1&locationId=main-outside&spawnId=from-recipient-house&seedKeepsakes=glowing-koi-scale',
  );

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'main-outside');

  await canvas.click();

  // Flat outdoor movement maps directly to world axes. Keep y fixed inside the
  // centred five-tile portal while walking straight west.
  let arrived = false;
  for (let step = 0; step < 40 && !arrived; step += 1) {
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(110);
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(40);
    arrived =
      (await page.locator('body').getAttribute('data-location-id')) === 'friendtwo-yard';
  }

  expect(arrived).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'friendtwo-yard');
});

test('the south path into the clearing is open before any papers are collected', async ({ page }) => {
  await page.goto('/?testMode=1&locationId=main-outside&spawnId=start');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'main-outside');
  await canvas.click();

  // main-outside is a flat outdoor map, so Down is direct world-south. The
  // start spawn is already close to the open south edge.
  let arrived = false;
  for (let step = 0; step < 20 && !arrived; step += 1) {
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(110);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(40);
    arrived = (await page.locator('body').getAttribute('data-location-id')) === 'clearing';
  }

  expect(arrived).toBe(true);
});
