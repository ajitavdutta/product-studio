import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test';

// The ids and names `make seed` loads from docs/examples (run it before these journeys).
const DEMO_ROADMAP_NAME = 'Payments Platform H1 2027';
const DEMO_ROADMAP_FILE = 'payments-platform-h1-2027.json';
const DEMO_DIAGRAM_ID = '5b1f6c0e-2c1d-4c8e-9d43-7a1b2f3e4d50';
const DEMO_DIAGRAM_NAME = 'Customer refund flow';
const DEMO_DIAGRAM_FILE = 'customer-refund-flow.swimlane.json';
// Same slug as the seeded name, so the file name in the indicator stays the same.
const RENAMED_DIAGRAM = 'Customer Refund Flow';
const E2E_DISPLAY_NAME = 'E2E Tester';
const DESKTOP_WIDTH = 1440;
const MOBILE_WIDTH = 390;

/**
 * Playwright still runs afterEach for a skipped test. Cleanup in a skipped (mobile) copy would
 * undo the desktop run's edits while it is still checking them.
 */
function wasSkipped(testInfo: TestInfo): boolean {
  return testInfo.expectedStatus === 'skipped';
}

async function renameDiagram(request: APIRequestContext, name: string): Promise<void> {
  const current = await request.get(`/api/diagrams/${DEMO_DIAGRAM_ID}`);
  expect(current.ok()).toBe(true);
  const { revision, document } = (await current.json()) as {
    revision: number;
    document: { name: string };
  };
  if (document.name === name) return;
  const patched = await request.patch(`/api/diagrams/${DEMO_DIAGRAM_ID}`, {
    data: { baseVersion: revision, ops: [{ op: 'set', path: '/name', value: name }] },
  });
  expect(patched.ok()).toBe(true);
}

test.describe('desktop journeys', () => {
  // These journeys write shared seeded data; run them once, not once per viewport.
  test.skip(({ viewport }) => viewport?.width !== DESKTOP_WIDTH, 'Desktop journey');

  test('G-1 Roadmap nav opens the demo roadmap and shows Saved to payments-platform-h1-2027.json', async ({
    page,
  }) => {
    await page.goto('/');

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Roadmap' })
      .click();

    await expect(page.getByRole('heading', { name: DEMO_ROADMAP_NAME })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('status')).toHaveText(
      `Saved to ${DEMO_ROADMAP_FILE}`,
    );
  });

  test.describe('G-2 diagram autosave', () => {
    test.afterEach(async ({ request }, testInfo) => {
      if (wasSkipped(testInfo)) return;
      await renameDiagram(request, DEMO_DIAGRAM_NAME);
    });

    test('G-2 renaming the demo diagram autosaves and survives reload', async ({ page }) => {
      await page.goto(`/diagrams/${DEMO_DIAGRAM_ID}`);
      const nameField = page.getByLabel('Diagram name');
      const saveState = page.getByRole('banner').getByRole('status');
      await expect(nameField).toHaveValue(DEMO_DIAGRAM_NAME);

      await nameField.fill(RENAMED_DIAGRAM);

      await expect(saveState).toHaveText('Unsaved changes');
      await expect(saveState).toHaveText(`Saved to ${DEMO_DIAGRAM_FILE}`);
      await page.reload();
      await expect(page.getByLabel('Diagram name')).toHaveValue(RENAMED_DIAGRAM);
    });
  });

  test.describe('G-4 settings', () => {
    let originalDisplayName = '';

    test.beforeEach(async ({ request }) => {
      const settings = (await (await request.get('/api/settings')).json()) as {
        displayName: string;
      };
      originalDisplayName = settings.displayName;
    });

    test.afterEach(async ({ request }, testInfo) => {
      if (wasSkipped(testInfo)) return;
      const restored = await request.put('/api/settings', {
        data: { displayName: originalDisplayName },
      });
      expect(restored.ok()).toBe(true);
    });

    test('G-4 settings dialog saves the display name', async ({ page, request }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Settings' }).click();
      const dialog = page.getByRole('dialog', { name: 'Settings' });
      await dialog.getByLabel('Display name').fill(E2E_DISPLAY_NAME);

      await dialog.getByRole('button', { name: 'Save' }).click();

      await expect(page.getByText('Settings saved')).toBeVisible();
      await expect(dialog).toBeHidden();
      await expect
        .poll(
          async () =>
            ((await (await request.get('/api/settings')).json()) as { displayName: string })
              .displayName,
        )
        .toBe(E2E_DISPLAY_NAME);
      await page.reload();
      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(
        page.getByRole('dialog', { name: 'Settings' }).getByLabel('Display name'),
      ).toHaveValue(E2E_DISPLAY_NAME);
    });
  });
});

test('G-5 demo roadmap page has no horizontal scroll at 390px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only smoke test');
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Roadmap' })
    .click();
  await expect(page.getByRole('heading', { name: DEMO_ROADMAP_NAME })).toBeVisible();

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);

  expect(scrollWidth).toBeLessThanOrEqual(MOBILE_WIDTH);
});
