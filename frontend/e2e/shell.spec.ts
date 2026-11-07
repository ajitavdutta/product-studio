import { expect, test } from '@playwright/test';

const NAV_LINK_NAMES = ['Import', 'Roadmap', 'Swimlanes', 'Exports'] as const;
const APP_BAR_HEIGHT = 56;
const MOBILE_WIDTH = 390;

test('G-1 shell shows wordmark, main nav and navigates with active state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Product Studio home' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link')).toHaveText([...NAV_LINK_NAMES]);

  const importLink = nav.getByRole('link', { name: 'Import' });
  await importLink.click();

  await expect(page).toHaveURL(/\/import$/);
  await expect(importLink).toHaveAttribute('aria-current', 'page');
});

test('G-1 shell is 56px tall at 1440', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop-only measurement');
  await page.goto('/');

  const box = await page.getByRole('banner').boundingBox();

  expect(box?.height).toBe(APP_BAR_HEIGHT);
});

test('G-5 shell has no horizontal scroll at 390px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only smoke test');
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const name of NAV_LINK_NAMES) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);

  expect(scrollWidth).toBeLessThanOrEqual(MOBILE_WIDTH);
});

test('API health is proxied through Vite', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: 'ok' });
});
