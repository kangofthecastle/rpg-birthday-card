import { expect, test, type Page } from '@playwright/test';

// The keepsake ritual: with all three keepsakes in hand, the clearing's southern
// shore unlocks. Looking over the water makes the boat — ____'s letter FOLDED into
// the hull, ____'s letter HOISTED as the sail, ____'s sheet music ROLLED and
// KINDLED into the lantern — and the sail-away cinematic carries her INTO the
// lantern clearing (final-spot).
//
// Two smokes: the first drives the ACTUAL gestures (real pointer strokes per verb,
// read off the panel's data-fold-* observability) all the way through the
// cinematic AND proves she arrives with CONTROL by opening the ending; the second
// keeps the fast test-mode skip path.

const CANVAS_W = 640;
const CANVAS_H = 400;
// Paper / stage centre in the canvas's logical space.
const CX = 326;
const CY = 183;

async function walkToShore(page: Page): Promise<void> {
  const foldPanel = page.getByRole('dialog', { name: 'fold' });
  const continueButton = page.getByRole('button', { name: 'Continue' });
  for (let step = 0; step < 30 && (await foldPanel.count()) === 0; step += 1) {
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click().catch(() => undefined);
      await page.waitForTimeout(30);
      continue;
    }
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(110);
    await page.keyboard.up('ArrowDown');
    await page.keyboard.press('E', { delay: 25 });
    await page.waitForTimeout(30);
  }
  await expect(foldPanel).toBeVisible();
}

test('makes the boat with real gestures and arrives at the lantern clearing WITH control', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/?testMode=1&locationId=clearing&spawnId=start&seedKeepsakes=all');
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'clearing');

  await canvas.click();
  await walkToShore(page);

  const panel = page.locator('[data-fold-panel]');
  const foldCanvas = page.getByRole('dialog', { name: 'fold' }).locator('canvas');
  await expect(panel.locator('[data-fold-hint]')).toHaveText(
    "____'s letter, the hull: Drag the top edge down onto the bottom",
  );
  await expect(
    page.getByText('Three keepsakes, carried a long way. Give them to the water.'),
  ).toHaveCount(0);

  // Logical (0..640, 0..400) → client px, using the live canvas box.
  const toClient = async (lx: number, ly: number): Promise<{ x: number; y: number }> => {
    const box = (await foldCanvas.boundingBox())!;
    return { x: box.x + (lx / CANVAS_W) * box.width, y: box.y + (ly / CANVAS_H) * box.height };
  };
  const dragLine = async (
    a: { x: number; y: number },
    b: { x: number; y: number },
    steps = 14,
  ): Promise<void> => {
    const p0 = await toClient(a.x, a.y);
    const p1 = await toClient(b.x, b.y);
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    for (let s = 1; s <= steps; s += 1) {
      await page.mouse.move(p0.x + (p1.x - p0.x) * (s / steps), p0.y + (p1.y - p0.y) * (s / steps));
      await page.waitForTimeout(6);
    }
    await page.mouse.up();
  };
  const circleDrag = async (r: number, turns = 1.3, steps = 44): Promise<void> => {
    const start = await toClient(CX + r, CY);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let s = 1; s <= steps; s += 1) {
      const a = (s / steps) * Math.PI * 2 * turns;
      const p = await toClient(CX + Math.cos(a) * r, CY + Math.sin(a) * r);
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(6);
    }
    await page.mouse.up();
  };
  const attr = async (n: string): Promise<string | null> =>
    (await panel.count()) === 0 ? null : panel.getAttribute(n).catch(() => null);

  // FIRST: prove the fold is DIRECT — the paper tracks the pointer mid-drag, and
  // an early release falls the flap back open with no penalty. Drag the top edge
  // partway down (not past the commit threshold), watch the live fold-progress
  // rise under the finger, then let go early.
  expect(await attr('data-fold-verb')).toBe('fold');
  {
    // Stay short of the commit threshold: the top edge only comes partway down.
    const a = await toClient(CX, 70);
    const b = await toClient(CX, 150);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    let sawProgress = 0;
    for (let s = 1; s <= 10; s += 1) {
      await page.mouse.move(a.x + (b.x - a.x) * (s / 10), a.y + (b.y - a.y) * (s / 10));
      await page.waitForTimeout(10);
      sawProgress = Math.max(sawProgress, Number((await attr('data-fold-fold-progress')) ?? '0'));
    }
    // The paper visibly folded partway under the pointer …
    expect(sawProgress).toBeGreaterThan(0.1);
    await page.mouse.up();
    await page.waitForTimeout(300);
    // … and, released early, it fell back open — the hull did not advance.
    expect(Number((await attr('data-fold-progress')) ?? '1')).toBeLessThan(0.15);
    expect(await attr('data-fold-verb')).toBe('fold');
  }

  // Drive each verb with the gesture it actually expects, reading the current
  // verb (and the pending hull crease's required drag axis) off the panel.
  let sawHoist = false;
  let sawRoll = false;
  let sawKindle = false;
  for (let i = 0; i < 80; i += 1) {
    if ((await panel.count()) === 0) break;
    if ((await attr('data-ritual-complete')) === '1') break;
    const verb = await attr('data-fold-verb');
    if (verb === 'fold') {
      // A continuous drag that carries the flap past the commit threshold; the
      // exact stroke depends on the pending fold (read off the panel).
      const axis = await attr('data-fold-crease-axis');
      const kind = await attr('data-fold-crease-kind');
      if (kind === 'open') await dragLine({ x: CX - 78, y: CY }, { x: CX + 78, y: CY }, 18);
      else if (axis === 'vertical') await dragLine({ x: CX, y: CY - 75 }, { x: CX, y: CY + 75 }, 18);
      else if (axis === 'horizontal') await dragLine({ x: CX - 84, y: CY }, { x: CX + 84, y: CY }, 18);
      // The sail's diagonal fold now creases top-left→bottom-right and folds the
      // top-RIGHT corner over, so the grabbed corner travels up-right → down-left.
      else await dragLine({ x: CX + 66, y: CY - 62 }, { x: CX - 66, y: CY + 66 }, 18);
      await page.waitForTimeout(520); // let the fold settle home
    } else if (verb === 'hoist') {
      sawHoist = true;
      // Pull the sail up the mast, pinned to the pointer (kept in the visible band).
      await dragLine({ x: CX, y: 215 }, { x: CX, y: 45 }, 20);
      await page.waitForTimeout(70);
    } else if (verb === 'roll') {
      sawRoll = true;
      await circleDrag(55);
      await page.waitForTimeout(50);
    } else if (verb === 'kindle') {
      sawKindle = true;
      const p = await toClient(CX, CY);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await expect(panel).toHaveAttribute('data-fold-kindle-music', 'violin');
      await page.waitForTimeout(1700); // hold to kindle (~1.5s)
      await page.mouse.up();
      await page.waitForTimeout(120);
    } else {
      await page.waitForTimeout(120);
    }
  }

  // All three distinct verbs were genuinely exercised.
  expect(sawHoist && sawRoll && sawKindle).toBe(true);

  // The ritual carries her INTO the lantern clearing (the travelTo integration).
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'final-spot', {
    timeout: 15000,
  });

  // The short transition itself is asserted by the skip-path test below. Once it
  // has handed off, ____ reacts automatically before the player walks to Omen.
  const arrivalQuestion = page.getByText('Where am I? Who is that?');
  const identityQuestion = page.getByText('You... who are you?');
  const conversationLine = page.getByText('Hey! Took you a minute, huh?');
  await expect(arrivalQuestion).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.locator('canvas').first().click();
  for (let step = 0; step < 80 && !(await identityQuestion.isVisible().catch(() => false)); step += 1) {
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(90);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('E', { delay: 20 });
    await page.waitForTimeout(40);
  }
  await expect(identityQuestion).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('~~')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(conversationLine).toBeVisible();
});

test('folds the boat via the test-mode skip and arrives at the lantern clearing', async ({
  page,
}) => {
  await page.goto('/?testMode=1&locationId=clearing&spawnId=start&seedKeepsakes=all');
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'clearing');

  await canvas.click();
  await walkToShore(page);

  // testMode skip: fold straight to the finished boat and run the sail-away.
  await page.getByRole('button', { name: 'Fold the boat' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'final-spot', {
    timeout: 15000,
  });
  // The arrival frame-sequence transition auto-plays on landing.
  await expect(page.locator('[data-ending-frames]')).toBeVisible({ timeout: 15000 });
});

test('returns to the clearing after Boatigami in card mode without a persistent still', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/?testMode=1&cardMode=1&locationId=clearing&spawnId=start');
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await canvas.click();
  await walkToShore(page);

  await page.getByRole('button', { name: 'Fold the boat' }).click();

  await expect(page.getByRole('dialog', { name: 'fold' })).toHaveCount(0, {
    timeout: 5000,
  });
  await expect(page.locator('body')).toHaveAttribute('data-location-id', 'clearing');
  await expect(page.locator('[data-ending-bridge]')).toHaveCount(0);
  await expect(canvas).toBeVisible();
});
