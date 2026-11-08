import { fileURLToPath } from 'node:url';
import { expect, test, type TestInfo } from '@playwright/test';

// The ids and names `make seed` loads from docs/examples (run it before these journeys).
const DEMO_ROADMAP_ID = '0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31';
const DEMO_ROADMAP_NAME = 'Payments Platform H1 2027';
const DEMO_ROADMAP_FILE = 'payments-platform-h1-2027.json';
const V0_ROADMAP = fileURLToPath(new URL('../../docs/examples/roadmap.v0.json', import.meta.url));
const ROADMAP_URL = /\/roadmaps\/([0-9a-f-]{36})$/;
const DESKTOP_WIDTH = 1440;
const MOBILE_WIDTH = 390;

/** Playwright still runs afterEach for a skipped test; cleanup there must do nothing. */
function wasSkipped(testInfo: TestInfo): boolean {
  return testInfo.expectedStatus === 'skipped';
}

test.describe('desktop home journeys', () => {
  test.skip(({ viewport }) => viewport?.width !== DESKTOP_WIDTH, 'Desktop journey');

  const createdRoadmapIds: string[] = [];

  test.afterEach(async ({ request }, testInfo) => {
    if (wasSkipped(testInfo)) return;
    for (const id of createdRoadmapIds.splice(0)) {
      // Never delete the seeded demo, even if an import reused its id.
      if (id !== DEMO_ROADMAP_ID) await request.delete(`/api/roadmaps/${id}`);
    }
  });

  test('HOME-2 lists the seeded demo roadmap and opens it', async ({ page }) => {
    await page.goto('/');
    const recent = page.getByRole('region', { name: 'Recent roadmaps' });
    await expect(recent.getByText(DEMO_ROADMAP_NAME, { exact: true }).first()).toBeVisible();
    await expect(recent.getByText(DEMO_ROADMAP_FILE, { exact: true }).first()).toBeVisible();

    await recent
      .getByRole('button', { name: `Open ${DEMO_ROADMAP_NAME}` })
      .first()
      .click();

    await expect(page).toHaveURL(ROADMAP_URL);
    await expect(page.getByRole('heading', { name: DEMO_ROADMAP_NAME })).toBeVisible();
  });

  test('HOME-1 open a saved roadmap with docs/examples/roadmap.v0.json migrates and opens', async ({
    page,
    request,
  }) => {
    await page.goto('/');

    await page.getByLabel('Roadmap .json file').setInputFiles(V0_ROADMAP);

    await expect(page).toHaveURL(ROADMAP_URL);
    const id = ROADMAP_URL.exec(new URL(page.url()).pathname)?.[1] ?? '';
    createdRoadmapIds.push(id);
    await expect(page.getByRole('heading', { name: DEMO_ROADMAP_NAME })).toBeVisible();
    const saved = (await (await request.get(`/api/roadmaps/${id}`)).json()) as {
      document: { schemaVersion: number };
    };
    expect(saved.document.schemaVersion).toBe(1);
  });
});

test('G-5 home has no horizontal scroll at 390px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only smoke test');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Import from Jira' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent roadmaps' })).toBeVisible();

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);

  expect(scrollWidth).toBeLessThanOrEqual(MOBILE_WIDTH);
});
