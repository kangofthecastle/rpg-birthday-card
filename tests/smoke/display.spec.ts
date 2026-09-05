import { expect, test } from '@playwright/test';

test('centers the game and UI with a 125% enlargement cap after window resizes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?testMode=1&locationId=main-outside&spawnId=from-recipient-house');
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'main-outside');
  const canvas = page.locator('#game-root canvas');
  const frame = page.locator('#viewport-frame');
  const bezel = page.locator('.monitor-shell');

  for (const [width, height] of [
    [1280, 720], [1600, 900], [1920, 1080], [2560, 1440], [3440, 1440], [3840, 2160],
    [960, 540], [800, 900], [1280, 720],
  ]) {
    await page.setViewportSize({ width, height });
    const reserveX = Math.min(148, Math.max(0, (width - 1280) * 0.3));
    const reserveY = Math.min(136, Math.max(0, (height - 720) * 0.36));
    const scale = Math.min((width - reserveX * 2) / 1280, (height - reserveY * 2) / 720, 1.25);
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
    const hasBezel = (width - expectedWidth) / 2 >= 32 && (height - expectedHeight) / 2 >= 32;
    if (hasBezel) {
      await expect(bezel).toBeVisible();
      const shell = (await bezel.boundingBox())!;
      expect(shell.x).toBeGreaterThanOrEqual(0);
      expect(shell.y).toBeGreaterThanOrEqual(0);
      expect(shell.x + shell.width).toBeLessThanOrEqual(width);
      expect(shell.y + shell.height).toBeLessThanOrEqual(height);
      await expect(bezel).toHaveAttribute('aria-hidden', 'true');
      expect(await bezel.evaluate((element) => {
        const casing = getComputedStyle(element);
        const inset = getComputedStyle(element, '::before');
        return casing.borderLeftColor === casing.borderRightColor
          && inset.borderLeftColor === inset.borderRightColor;
      })).toBe(true);
      await expect(bezel.locator('.monitor-shell__badge')).toHaveText('/password: pewpew');
    } else {
      await expect(bezel).toBeHidden();
    }
  }
  expect(errors).toEqual([]);
});
