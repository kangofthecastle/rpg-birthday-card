import { expect, test } from '@playwright/test';
import { VIOLIN_SAMPLE_URLS } from '../../src/game/violinSamples';

test('ships decodable sampled violin anchors', async ({ page }) => {
  await page.goto('/?testMode=1');

  const decoded = await page.evaluate(async (urls) => {
    const context = new AudioContext();
    const results: Array<{ duration: number; ok: boolean; url: string }> = [];
    for (const url of urls) {
      try {
        const response = await fetch(url);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        results.push({ duration: buffer.duration, ok: response.ok, url });
      } catch {
        results.push({ duration: 0, ok: false, url });
      }
    }
    await context.close();
    return results;
  }, [...VIOLIN_SAMPLE_URLS]);

  expect(decoded.filter((sample) => !sample.ok)).toEqual([]);
  expect(Math.min(...decoded.map((sample) => sample.duration))).toBeGreaterThan(0.45);
});

async function dismissContinues(
  page: import('@playwright/test').Page,
  max: number,
): Promise<void> {
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

/** Walks the player from the PC/front-door spawn toward the violin stand across
 * the room. recipient-house is an iso interior, so holding Up drives the player
 * toward the top-left corner where the stand sits. The spawn sits right next to
 * the PC, whose easter-egg dialogue we may trip on the way — E cannot dismiss a
 * DialogueBox, so any stray dialogue is cleared via its Continue button to keep
 * the player moving. Press E each step until the piece's lead-in appears. */
async function walkToViolin(page: import('@playwright/test').Page): Promise<void> {
  const leadIn = page.getByText('already in tune');
  const continueButton = page.getByRole('button', { name: 'Continue' });
  for (let step = 0; step < 90; step += 1) {
    if (await leadIn.isVisible().catch(() => false)) {
      return;
    }
    // Clear any stray easter-egg dialogue (e.g. the PC by the spawn) so the
    // player can keep walking.
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click().catch(() => undefined);
      continue;
    }
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(130);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('E', { delay: 20 });
    await page.waitForTimeout(30);
  }
  await expect(leadIn).toBeVisible();
}

// "The piece on the stand" is ____'s self-keepsake activity: with both friend
// keepsakes in hand, the piece that's waited on her music stand all game
// unlocks, and playing it through awards ____'s sheet music. This drives it
// through the test-mode skip button (mirrors the friendone/valorant smokes), seeding
// the two friend keepsakes so the violin unlocks (as ending.spec does).
test('plays the piece on the stand through test mode', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(
    '/?testMode=1&locationId=recipient-house&spawnId=near-pc&seedKeepsakes=glowing-koi-scale,defused-spike-charm',
  );

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Backpack');

  // Clear the intro + warm return-home enter beats.
  await dismissContinues(page, 6);

  // The invitation belongs to the violin, not its interaction hotspot: the
  // fragment plays by itself and ____ acknowledges it immediately afterward.
  await expect(page.getByText('Did the violin just play on its own?')).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole('button', { name: 'Continue' }).click();

  await canvas.click();
  await walkToViolin(page);

  // Advance the two lead-in lines → the activity opens.
  await dismissContinues(page, 4);

  await expect(
    page.getByRole('dialog', { name: 'the piece on the stand' }),
  ).toBeVisible();

  // Pre-completion the room shows NO awakening.
  await expect(page.locator('body')).not.toHaveAttribute('data-interior-awakened');

  await page.getByRole('button', { name: 'Finish the piece' }).click();

  // The moment the piece completes (all three keepsakes now held), the interior
  // awakens IN PLACE — the scene wakes without re-running create(), and the
  // golden window shafts + doormat shine fade in. This is the beat that leads
  // the player back outside; assert it lands before we even dismiss the letter.
  await expect(page.locator('body')).toHaveAttribute(
    'data-interior-awakened',
    'true',
    { timeout: 10000 },
  );

  // The acquired paper is the score itself. Only after the sheet-music modal
  // closes does ____'s recognition land in the ordinary dialogue UI.
  const rewardPaper = page.locator('.letter-modal');
  await expect(rewardPaper).toBeVisible();
  await expect(rewardPaper.getByRole('img', { name: /____’s handwritten sheet music/ })).toBeVisible();
  await expect(rewardPaper).toHaveAttribute('aria-label', 'Do You Hear the People Sing?');
  await expect(rewardPaper).not.toContainText('Do You Hear the People Sing?');
  await expect(rewardPaper).not.toContainText('completed sheet music');
  await expect(page.getByText('...wait. I know this song!')).toHaveCount(0);
  await rewardPaper.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('...wait. I know this song!')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.collection-panel')).toContainText(
    'The piece on the stand',
  );
});

// Real-gameplay path: land the opening rhythm note on its timing line. This
// guards the input seam that was silently broken in the old echo game (the
// underlying room's global A/S/D capture swallowed activity input). Canvas
// state is mirrored to data attributes so the smoke can verify timing and score
// without screenshot matching.
test('hits the opening rhythm note on time and starts a combo', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(
    '/?testMode=1&locationId=recipient-house&spawnId=near-pc&seedKeepsakes=glowing-koi-scale,defused-spike-charm',
  );

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Backpack');

  await dismissContinues(page, 6);
  await canvas.click();
  await walkToViolin(page);
  await dismissContinues(page, 4);

  const panel = page.locator('.activity-shell--violin');
  await expect(panel).toBeVisible();

  await expect(panel).toHaveAttribute('data-violin-state', 'ready');
  await page.keyboard.press('Space');
  await expect(panel).toHaveAttribute('data-violin-state', 'count-in');
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.activity-shell--violin')?.dataset.violinWindow === 'true',
    undefined,
    { timeout: 10000 },
  );
  // Opening A4 is grouped into the high J lane. Press when the count-in opens;
  // the forgiving Good window intentionally accommodates scheduling jitter.
  await page.keyboard.press('KeyJ');
  await expect(panel).toHaveAttribute('data-violin-max-combo', '1');
  expect(Number(await panel.getAttribute('data-violin-score'))).toBeGreaterThan(0);
});
