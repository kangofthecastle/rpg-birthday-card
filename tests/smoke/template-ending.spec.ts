import { expect, test } from '@playwright/test';

async function dismissContinues(page: import('@playwright/test').Page, max: number): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    const button = page.getByRole('button', { name: 'Continue' });
    try {
      await button.waitFor({ state: 'visible', timeout: 2000 });
      await button.click();
    } catch {
      break;
    }
  }
}

test('plays the galaxy violin and collects every letter-star before going home', async ({
  page,
}) => {
  // The playable finale is a long flow: approach ____, complete the full
  // conversation, awaken every authored star with one note, read them, then go home.
  test.setTimeout(90_000);
  await page.goto(
    '/?testMode=1&dressDebug=1&locationId=final-spot&spawnId=near-lantern&seedKeepsakes=all',
  );
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'final-spot');

  // The backpack is deliberately absent here: its earned letters have become
  // world collectibles and cannot be opened before the finale.
  await expect(page.locator('.collection-panel')).toHaveCount(0);
  const continueButton = page.getByRole('button', { name: 'Continue' });

  // ____ reacts to the unfamiliar figure on arrival, before the player chooses
  // to walk up and talk to Omen.
  const arrivalQuestion = page.getByText('Where am I? Who is that?');
  const identityQuestion = page.getByText('You... who are you?');
  const conversationLine = page.getByText('Hey! Took you a minute, huh?');
  await expect(arrivalQuestion).toBeVisible();
  await continueButton.click();

  // Walk up (north) to Omen at the warm glow and press E to begin the reveal.
  await canvas.click({ force: true });
  for (let step = 0; step < 70 && !(await identityQuestion.isVisible().catch(() => false)); step += 1) {
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(70);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('E', { delay: 15 });
    await page.waitForTimeout(25);
  }
  await expect(identityQuestion).toBeVisible();
  await continueButton.click();
  await expect(page.getByText('~~')).toBeVisible();
  await continueButton.click();
  await expect(conversationLine).toBeVisible();

  const galaxyHud = page.locator('[data-galaxy-letters-hud]');
  // Click through the remaining conversation until ____ receives the violin.
  for (let step = 0; step < 40 && (await galaxyHud.count()) === 0; step += 1) {
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click().catch(() => undefined);
    }
    await page.waitForTimeout(70);
  }
  await expect(galaxyHud).toHaveCount(1, { timeout: 15_000 });
  await expect(galaxyHud).toBeVisible();
  await expect(page.getByText('press e')).toBeVisible();
  await expect(page.locator('.letters-screen')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-galaxy-ending-phase', 'playing');

  // One sustained note awakens all twelve authored stars dotted around the galaxy.
  await canvas.click({ force: true });
  await page.keyboard.down('E');
  await page.waitForTimeout(100);
  await page.keyboard.up('E');
  await expect(page.locator('body')).toHaveAttribute('data-galaxy-ending-phase', 'awakening');
  await expect(page.locator('body')).toHaveAttribute('data-galaxy-stars-lit', '12');
  await expect(page.locator('body')).toHaveAttribute('data-galaxy-ending-phase', 'collecting');
  await expect(galaxyHud).toBeHidden();

  // The stars are scattered across these map-space positions. Steer closed-loop
  // using the same debug position hook as the photo-wall tests, letting the
  // collision radius open each letter naturally rather than invoking test APIs.
  // Collect in a clockwise walking route; letter indexes do not prescribe an order.
  const targets = [
    { x: 1130, y: 250 },
    { x: 1240, y: 470 },
    { x: 1190, y: 780 },
    { x: 1080, y: 870 },
    { x: 980, y: 610 },
    { x: 620, y: 840 },
    { x: 240, y: 710 },
    { x: 150, y: 540 },
    { x: 340, y: 430 },
    { x: 180, y: 176 },
    { x: 520, y: 190 },
    { x: 850, y: 330 },
  ];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const modal = page.locator('.letter-modal');
    for (let step = 0; step < 100 && (await modal.count()) === 0; step += 1) {
      const pos = (await page.locator('body').getAttribute('data-player-pos')) ?? '';
      const [x = 704, y = 520] = pos.split(',').map(Number);
      const dx = target.x - x;
      const dy = target.y - y;
      const key = Math.abs(dx) > Math.abs(dy)
        ? dx < 0 ? 'ArrowLeft' : 'ArrowRight'
        : dy < 0 ? 'ArrowUp' : 'ArrowDown';
      await page.keyboard.down(key);
      await page.waitForTimeout(70);
      await page.keyboard.up(key);
      await page.waitForTimeout(20);
    }
    await expect(modal).toBeVisible();
    await expect(modal.locator('.letter-modal__speaker')).not.toBeEmpty();
    await expect(modal.locator('.photo-letter-modal__photo-placeholder')).toHaveCount(0);
    await expect(modal.locator('.letter-modal__text')).toHaveText('[Add a birthday message here.]');
    await expect(modal.locator('.photo-letter-modal__photo')).toHaveCount(0);
    await modal.getByRole('button', { name: 'Continue' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('body')).toHaveAttribute(
      'data-galaxy-letters-read',
      String(index + 1),
    );
  }

  await expect(page.getByText('happy birthday, ____.')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-galaxy-ending-phase', 'complete');

  // Only reading every scattered star gives ____ the quiet return-home action.
  const goHome = page.getByRole('button', { name: 'go home' });
  await expect(goHome).toBeVisible();
  await goHome.click();

  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'recipient-house', {
    timeout: 15000,
  });
  await expect(page.locator('.letters-screen')).toHaveCount(0);

  // Control is restored in the awakened room (the return-home enter beats play,
  // then normal dialogue works). The post-ending photo-wall unlock is asserted by
  // its own dedicated test above, so this one stops here to stay within budget.
  await dismissContinues(page, 8);
});
