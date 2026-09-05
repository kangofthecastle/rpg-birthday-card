import { expect, test } from '@playwright/test';

test('centers the game and UI with a 125% enlargement cap after window resizes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?testMode=1&locationId=main-outside&spawnId=from-recipient-house');
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'main-outside');
  const canvas = page.locator('#game-root canvas');
  const frame = page.locator('#viewport-frame');

  for (const [width, height] of [
    [1280, 720], [1600, 900], [1920, 1080], [2560, 1440], [3440, 1440], [3840, 2160],
    [960, 540], [800, 900], [1280, 720],
  ]) {
    await page.setViewportSize({ width, height });
    const scale = Math.min(width / 1280, height / 720, 1.25);
    const expectedWidth = 1280 * scale;
    const expectedHeight = 720 * scale;
    await expect.poll(async () => {
      const box = await canvas.boundingBox();
      const ui = await frame.boundingBox();
      if (!box || !ui) return false;
      return Math.abs(box.width - expectedWidth) <= 1
        && Math.abs(box.height - expectedHeight) <= 1
        && Math.abs(box.x - (width - expectedWidth) / 2) <= 1
        && Math.abs(box.y - (height - expectedHeight) / 2) <= 1
        && Math.abs(ui.x - box.x) <= 1 && Math.abs(ui.y - box.y) <= 1
        && Math.abs(ui.width - box.width) <= 1 && Math.abs(ui.height - box.height) <= 1;
    }).toBe(true);
  }
  expect(errors).toEqual([]);
});
