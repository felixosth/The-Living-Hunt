import { expect, type Page, test } from '@playwright/test';
import type { Snapshot } from '../src/sim/snapshot';

declare global {
  interface Window {
    livingHunt: { snapshot(): Snapshot; stateHash(): string };
  }
}

const snap = (page: Page) => page.evaluate(() => window.livingHunt.snapshot());

async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/**
 * Hold a key until `done` holds. Software-rendered CI browsers can run at a
 * few frames per second, so a fixed hold time may cover only one game tick.
 */
async function holdUntil(page: Page, key: string, done: () => Promise<boolean>) {
  await page.keyboard.down(key);
  try {
    await expect.poll(done, { timeout: 20_000 }).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
}

test('boots, walks, saves and loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?seed=7');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.getByTestId('hud')).toContainText('Autumn 8, Year 1');
  // The intro closes on any key.
  await expect(page.getByTestId('intro')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('intro')).toBeHidden();

  // Walking east moves the player.
  const start = await snap(page);
  await holdUntil(page, 'KeyD', async () => (await snap(page)).player.x > start.player.x + 1);

  // Crouching and keeping still means studying the ground.
  await page.keyboard.press('KeyC');
  await expect(page.getByTestId('searching')).toBeVisible();
  await page.keyboard.press('KeyC');
  // The journal and help open and close.
  await page.keyboard.press('KeyJ');
  await expect(page.getByTestId('journal')).toContainText('roe deer');
  await page.keyboard.press('KeyJ');
  await page.keyboard.press('KeyH');
  await expect(page.getByTestId('help')).toBeVisible();
  await page.keyboard.press('KeyH');

  // Pause, quicksave and remember the exact state.
  await page.keyboard.press('Backquote');
  await expect(page.getByTestId('debug-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByTestId('quicksave').click();
  await expect(page.getByTestId('toast')).toContainText('Saved');
  const saved = await snap(page);
  const savedHash = await page.evaluate(() => window.livingHunt.stateHash());

  // Let time pass and walk away, then quickload.
  await page.getByRole('button', { name: '10×' }).click();
  await hold(page, 'KeyS', 600);
  await page.getByRole('button', { name: 'Pause' }).click();
  expect((await snap(page)).tick).toBeGreaterThan(saved.tick);

  await page.getByTestId('quickload').click();
  await expect(page.getByTestId('toast')).toContainText('Loaded');
  const loaded = await snap(page);
  expect(loaded.tick).toBe(saved.tick);
  expect(loaded.time).toBe(saved.time);
  expect(loaded.player.x).toBe(saved.player.x);
  expect(loaded.player.y).toBe(saved.player.y);
  expect(await page.evaluate(() => window.livingHunt.stateHash())).toBe(savedHash);

  expect(errors).toEqual([]);
});
