import { expect, test, type Page } from '@playwright/test';
import type PhaserType from 'phaser';

interface GameProbeState {
  readonly locationId?: string;
  readonly activeObjectId?: string;
  readonly playerX?: number;
  readonly playerY?: number;
}

interface MapPoint {
  readonly x: number;
  readonly y: number;
}

async function holdKey(page: Page, key: string, durationMs: number): Promise<void> {
  await page.keyboard.down(key);

  try {
    await page.waitForTimeout(durationMs);
  } finally {
    await page.keyboard.up(key);
  }
}

async function installGameProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const host = window as typeof window & {
      Phaser?: {
        Game: typeof PhaserType.Game;
      };
      __aGameSmokeProbe?: unknown;
    };

    let phaserValue: typeof host.Phaser;

    Object.defineProperty(host, 'Phaser', {
      configurable: true,
      get() {
        return phaserValue;
      },
      set(value: typeof host.Phaser) {
        phaserValue = value;

        if (!value) {
          return;
        }

        const OriginalGame = value.Game;

        value.Game = class extends OriginalGame {
          constructor(...args: ConstructorParameters<typeof OriginalGame>) {
            super(...args);
            host.__aGameSmokeProbe = this;
          }
        };
      },
    });
  });
}

async function getGameProbeState(page: Page): Promise<GameProbeState> {
  return page.evaluate(() => {
    const host = window as typeof window & {
      __aGameSmokeProbe?: {
        scene?: {
          getScene?: (key: string) => {
            location?: { id?: string };
            activeObject?: { id?: string };
            player?: { x?: number; y?: number };
          };
        };
      };
    };
    const scene = host.__aGameSmokeProbe?.scene?.getScene?.('LocationScene');

    return {
      locationId: scene?.location?.id,
      activeObjectId: scene?.activeObject?.id,
      playerX: scene?.player?.x,
      playerY: scene?.player?.y,
    };
  });
}

async function interact(page: Page): Promise<void> {
  await page.keyboard.press('E', { delay: 100 });
}

function projectToScreen(point: MapPoint): MapPoint {
  return {
    x: (point.x - point.y) / 2,
    y: (point.x + point.y) / 4,
  };
}

async function moveToActiveObject(
  page: Page,
  target: MapPoint,
  activeObjectId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await getGameProbeState(page);

    if (state.activeObjectId === activeObjectId) {
      return;
    }

    if (typeof state.playerX !== 'number' || typeof state.playerY !== 'number') {
      await page.waitForTimeout(50);
      continue;
    }

    const player = projectToScreen({ x: state.playerX, y: state.playerY });
    const destination = projectToScreen(target);
    const dx = destination.x - player.x;
    const dy = destination.y - player.y;

    if (Math.abs(dx) > 12) {
      await holdKey(page, dx > 0 ? 'ArrowRight' : 'ArrowLeft', 100);
    }

    if (Math.abs(dy) > 8) {
      await holdKey(page, dy > 0 ? 'ArrowDown' : 'ArrowUp', 100);
    }
  }

  const state = await getGameProbeState(page);
  throw new Error(
    `Could not reach ${activeObjectId}; active=${state.activeObjectId ?? 'none'} location=${
      state.locationId ?? 'unknown'
    } player=(${Math.round(state.playerX ?? 0)}, ${Math.round(state.playerY ?? 0)})`,
  );
}

test('opens ____ strategy table from ____ house and completes a short win path', async ({
  page,
}) => {
  await installGameProbe(page);
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Keepsakes');

  await canvas.click();

  await moveToActiveObject(page, { x: 1088, y: 304 }, 'to-friend-c');
  await interact(page);
  await expect
    .poll(async () => (await getGameProbeState(page)).locationId)
    .toBe('friend-c');

  await moveToActiveObject(page, { x: 896, y: 496 }, 'friendthree-strategy-table');
  await interact(page);

  await expect(
    page.getByText('Three minutes. Tiny island. I promise I will not overthink every road.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('dialog', { name: '____ Island' })).toBeVisible();

  await page.locator('[data-friendthree-action="build-road:e0"]').click();
  await page.locator('[data-friendthree-action="build-road:e1"]').click();
  await page.locator('[data-friendthree-action="build-road:e2"]').click();
  await page.locator('[data-friendthree-action="build-settlement:n3"]').click();

  await expect(page.getByRole('dialog', { name: '____ Island' })).toBeHidden();
  await expect
    .poll(async () => (await getGameProbeState(page)).locationId)
    .toBe('friend-c');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.collection-panel')).toContainText('Keepsakes');
});
