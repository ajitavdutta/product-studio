import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

const FIXTURE_CSV = fileURLToPath(
  new URL('../../docs/fixtures/jira/payments-export.csv', import.meta.url),
);
const FIXTURE_FILE_NAME = 'payments-export.csv';
const SAVED_FILE_NAME = 'payments-export.json';
const SAMPLE_BUTTON = 'Use the sample export (55 issues)';
const COMPONENTS_WARNING = '"Components" isn\'t mapped yet';
const DONT_IMPORT = "Don't import";
const NO_TEMPLATE = 'None — map manually';
const ROADMAP_URL = /\/roadmaps\/[0-9a-f-]{36}$/;
const MAP_URL = /\/import\/[0-9a-f-]{36}$/;
const DESKTOP_WIDTH = 1440;
const MOBILE_WIDTH = 390;

/** Playwright still runs afterEach for a skipped test; cleanup there must do nothing. */
function wasSkipped(testInfo: TestInfo): boolean {
  return testInfo.expectedStatus === 'skipped';
}

async function templateIds(request: APIRequestContext): Promise<string[]> {
  const response = await request.get('/api/mapping-templates');
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { id: string }[]).map((template) => template.id);
}

async function chooseOption(page: Page, comboboxName: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: comboboxName }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** The Map table's field selects are native `<select>`s. */
async function setRoadmapField(page: Page, columnLabel: string, field: string): Promise<void> {
  await page.getByLabel(`Roadmap field for ${columnLabel}`).selectOption({ label: field });
}

/** Home → Import from Jira → no template → the sample export, ending on Map fields. */
async function startSampleImport(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import from Jira' }).click();
  await expect(page).toHaveURL(/\/import$/);
  // A template left by another run would change the suggestions; map from scratch.
  await chooseOption(page, 'Mapping template', NO_TEMPLATE);
  await page.getByRole('button', { name: SAMPLE_BUTTON }).click();
  await expect(page).toHaveURL(MAP_URL);
  await expect(page.getByRole('heading', { name: 'Map Jira fields' })).toBeVisible();
}

test.describe('desktop import journeys', () => {
  test.skip(({ viewport }) => viewport?.width !== DESKTOP_WIDTH, 'Desktop journey');

  let templatesBefore: string[] = [];
  const createdRoadmapIds: string[] = [];

  test.beforeEach(async ({ request }) => {
    templatesBefore = await templateIds(request);
  });

  test.afterEach(async ({ request }, testInfo) => {
    if (wasSkipped(testInfo)) return;
    for (const id of createdRoadmapIds.splice(0)) {
      await request.delete(`/api/roadmaps/${id}`);
    }
    for (const id of await templateIds(request)) {
      if (!templatesBefore.includes(id)) await request.delete(`/api/mapping-templates/${id}`);
    }
  });

  test('IMP import sample → fix Components → create', async ({ page }) => {
    await startSampleImport(page);
    const warnings = page.getByRole('list', { name: 'Import warnings' });
    await expect(page.getByText('Auto-mapped 13 of 14')).toBeVisible();
    await expect(warnings).toContainText(COMPONENTS_WARNING);

    await setRoadmapField(page, 'Components', DONT_IMPORT);

    await expect(page.getByText('Auto-mapped 14 of 14')).toBeVisible();
    await expect(warnings).not.toContainText(COMPONENTS_WARNING);

    await page.getByRole('button', { name: 'Create roadmap & save JSON' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create roadmap' });
    await expect(dialog).toContainText(SAVED_FILE_NAME);
    const downloadEvent = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Create & save' }).click();

    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(SAVED_FILE_NAME);
    await expect(page).toHaveURL(ROADMAP_URL);
    createdRoadmapIds.push(new URL(page.url()).pathname.split('/').pop() ?? '');
    await expect(page.getByText(`Saved ${SAVED_FILE_NAME}`)).toBeVisible();
  });

  test("IMP-10 create is disabled when Title is set to Don't import", async ({ page }) => {
    await startSampleImport(page);
    const create = page.getByRole('button', { name: 'Create roadmap & save JSON' });
    await expect(create).toBeEnabled();

    await setRoadmapField(page, 'Summary', DONT_IMPORT);

    await expect(create).toBeDisabled();
    await expect(page.getByText('Map Key and Title to continue')).toBeVisible();
  });

  test('IMP-1 uploading the fixture CSV shows 10 KB · 55 issues · Jira CSV', async ({ page }) => {
    await page.goto('/import');
    await chooseOption(page, 'Mapping template', NO_TEMPLATE);

    await page.getByLabel('Drop your Jira export here').setInputFiles(FIXTURE_CSV);

    await expect(page).toHaveURL(MAP_URL);
    await expect(
      page.getByText(`${FIXTURE_FILE_NAME} · 10 KB · 55 issues · Jira CSV`),
    ).toBeVisible();
  });
});

test('G-5 map page stacks the preview below the table with no page-level horizontal scroll', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only smoke test');
  await startSampleImport(page);
  const table = page.getByRole('region', { name: 'Map Jira columns to roadmap fields' });
  const preview = page.getByRole('region', { name: 'Preview' });
  await expect(preview.getByText('Epics', { exact: true })).toBeVisible();

  const tableBox = await table.boundingBox();
  const previewBox = await preview.boundingBox();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);

  expect(tableBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(previewBox?.y ?? 0).toBeGreaterThanOrEqual((tableBox?.y ?? 0) + (tableBox?.height ?? 0));
  expect(scrollWidth).toBeLessThanOrEqual(MOBILE_WIDTH);
});
