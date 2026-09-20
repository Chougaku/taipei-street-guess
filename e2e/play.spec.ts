import { expect, test, type Page } from '@playwright/test';

/**
 * Opens the guess map (a bottom sheet on phones) and waits for Google Maps to render.
 * The map only initialises once it is on screen, so the sheet has to be opened first.
 */
async function openGuessMap(page: Page) {
  // The button only exists in the compact layout, so give it a moment before falling through.
  const openMap = page.getByRole('button', { name: /^地圖$|^Map$/ });
  const isCompact = await openMap
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (isCompact) await openMap.click();
  await expect(page.locator('.gm-style').first()).toBeVisible({ timeout: 30_000 });
}

/** Clicks the middle of the guess map to drop a pin. */
async function placePin(page: Page) {
  const map = page.locator('.gm-style').first();
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function startClassicGame(page: Page, slug = 'daan') {
  await page.goto(`/maps/${slug}`);
  await page.getByRole('button', { name: /開始遊戲|Play/ }).click();
  await expect(page).toHaveURL(/\/game\//, { timeout: 30_000 });
  await expect(page.getByTestId('streetview-mock')).toBeVisible();
  // The loading overlay has to disappear once the panorama is ready.
  await expect(page.getByText(/街景載入中|Loading Street View/)).toBeHidden();
}

test.describe('classic game', () => {
  test('plays a round and shows the result', async ({ page }) => {
    await startClassicGame(page);
    await openGuessMap(page);

    await expect(page.getByRole('button', { name: /在地圖上放置圖釘|Place your pin/ })).toBeVisible();
    await placePin(page);

    const guess = page.getByRole('button', { name: /^猜測$|^Guess$/ }).first();
    await expect(guess).toBeEnabled();
    await guess.click();

    // Round result: score, distance and the next-round button.
    await expect(page.getByText(/第 1 回合|Round 1/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/距離|away/)).toBeVisible();
    const next = page.getByRole('button', { name: /下一回合|Next round/ });
    await expect(next).toBeVisible();
    await next.click();

    // Round 2 starts with a fresh panorama and an empty pin.
    await expect(page.getByText('2 / 5')).toBeVisible({ timeout: 30_000 });
  });

  test('keeps the game after a reload', async ({ page }) => {
    await startClassicGame(page, 'xinyi');
    const url = page.url();
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(page.getByText('1 / 5')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('navigation', () => {
  test('home lists the official maps and game modes', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /你在臺北的哪裡|Where in Taipei/ })).toBeVisible();
    await expect(page.getByText(/臺北市全區|Taipei City/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/大安區|Da'an/).first()).toBeVisible();
  });

  test('daily challenge page offers today’s game', async ({ page }) => {
    await page.goto('/daily');
    await expect(page.getByRole('heading', { name: /每日挑戰|Daily Challenge/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /接受挑戰|Accept challenge/ })).toBeVisible();
  });

  test('leaderboards and profile load', async ({ page }) => {
    await page.goto('/leaderboards');
    await expect(page.getByRole('heading', { name: /排行榜|Leaderboards/ })).toBeVisible({ timeout: 30_000 });
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /設定|Settings/ })).toBeVisible();
  });
});

test.describe('streak mode', () => {
  test('starts a district streak and guesses a region', async ({ page }) => {
    await page.goto('/streak');
    await page.getByRole('button', { name: /開始連勝|Start streak/ }).click();
    await expect(page).toHaveURL(/\/streak\//, { timeout: 30_000 });
    await openGuessMap(page);
    await placePin(page);
    const guess = page.getByRole('button', { name: /猜測：|Guess: / }).first();
    await expect(guess).toBeEnabled();
    await guess.click();
    await expect(page.getByText(/答對了|答錯了|Correct|Wrong/)).toBeVisible({ timeout: 30_000 });
  });
});
