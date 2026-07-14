import { expect, test } from '@playwright/test';

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
  await page.goto(
    '/?testMode=1&locationId=recipient-house&spawnId=near-pc&seedKeepsakes=glowing-koi-scale,defused-spike-charm',
  );

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Letters');

  // Clear the intro + warm return-home enter beats.
  await dismissContinues(page, 6);

  // The invitation belongs to the violin, not its interaction hotspot: the
  // fragment plays by itself and ____ acknowledges it immediately afterward.
  await expect(page.getByText('Did the violin just make noise on its own?')).toBeVisible({
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
  await expect(rewardPaper).toContainText('Do You Hear the People Sing?');
  await expect(rewardPaper).not.toContainText('completed sheet music');
  await expect(page.getByText('...wait. I know this song!')).toHaveCount(0);
  await rewardPaper.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('...wait. I know this song!')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.collection-panel')).toContainText(
    'The Piece You Finally Played',
  );
});

// Real-gameplay path: actually echo phrase 1 on the mapped keys. This guards the
// input seam that was silently broken (the underlying room's global A/S/D
// capture swallowed the echo before the violin's separate Phaser game saw it).
// The scene mirrors its model state onto the panel dataset (data-violin-state /
// -phrase / -echo) so the test waits deterministically under CPU contention
// rather than screenshot-matching. Phrase 1 is D E F♯ G A = keys A S D F G; she
// plays every note herself (no takeover), then a short handoff beat flips the
// phrase index as phrase 2 begins to play.
test('echoes phrase 1 on the mapped keys, recovering from a wrong note', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(
    '/?testMode=1&locationId=recipient-house&spawnId=near-pc&seedKeepsakes=glowing-koi-scale,defused-spike-charm',
  );

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Letters');

  await dismissContinues(page, 6);
  await canvas.click();
  await walkToViolin(page);
  await dismissContinues(page, 4);

  const panel = page.locator('.activity-shell--violin');
  await expect(panel).toBeVisible();

  // Press a note key with a real hold (a few frames) and retry until the target
  // dataset attribute reaches the wanted value. This is robust to an occasional
  // lost key event under CPU contention; a re-press only fires after a generous
  // settle (a landed press registers within a couple frames), so a correct note
  // can never double-register into a wrong one.
  const pressUntil = async (code: string, attr: string, value: string): Promise<void> => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if ((await panel.getAttribute(attr)) === value) return;
      await page.keyboard.down(code);
      await page.waitForTimeout(60);
      await page.keyboard.up(code);
      try {
        await expect(panel).toHaveAttribute(attr, value, { timeout: 800 });
        return;
      } catch {
        await page.waitForTimeout(150);
      }
    }
    await expect(panel).toHaveAttribute(attr, value, { timeout: 3000 });
  };

  // Phrase 1 plays itself, then opens the echo ("now you").
  await expect(panel).toHaveAttribute('data-violin-phrase', '0', { timeout: 20000 });
  await expect(panel).toHaveAttribute('data-violin-state', 'echo', { timeout: 20000 });

  // A wrong note gently wavers: the phrase resets and plays itself again from the
  // top (no soft-lock), then re-opens the echo.
  await pressUntil('KeyF', 'data-violin-state', 'playback');
  await expect(panel).toHaveAttribute('data-violin-state', 'echo', { timeout: 20000 });
  await expect(panel).toHaveAttribute('data-violin-phrase', '0');

  // Echo the phrase correctly (D E F♯ G A = A S D F G), one note at a time,
  // waiting on the echo cursor between presses.
  await pressUntil('KeyA', 'data-violin-echo', '1');
  await pressUntil('KeyS', 'data-violin-echo', '2');
  await pressUntil('KeyD', 'data-violin-echo', '3');
  await pressUntil('KeyF', 'data-violin-echo', '4');

  // Landing phrase 1's last note herself opens the handoff beat, which flips the
  // phrase index as phrase 2 begins to play (no takeover, instant handoff).
  await pressUntil('KeyG', 'data-violin-phrase', '1');
});
