import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';

// Each journey works on its own copy of the example roadmap, made through import-json and
// deleted afterwards, so journeys never share data or depend on order (`make seed` is still
// needed for the app's other journeys).
const EXAMPLE_ROADMAP = fileURLToPath(
  new URL('../../docs/examples/roadmap.example.json', import.meta.url),
);
const V0_ROADMAP = fileURLToPath(new URL('../../docs/examples/roadmap.v0.json', import.meta.url));
const RESYNC_CSV = fileURLToPath(
  new URL('../../docs/fixtures/jira/payments-export.csv', import.meta.url),
);
const ROADMAP_NAME = 'E2E Payments roadmap';
const ROADMAP_FILE = 'e2e-payments-roadmap.json';
const FROZEN_NOW = new Date('2026-11-06T12:00:00');
const DESKTOP_WIDTH = 1440;
const MOBILE_WIDTH = 390;
const ROADMAP_URL = /\/roadmaps\/([0-9a-f-]{36})$/;
/** Enough Tab presses to reach any control in a dialog. */
const MAX_TAB_STOPS = 40;
/** One line of 10–11px header text; two lines would be at least twice this. */
const ONE_LINE_MAX_PX = 18;

interface RoadmapRead {
  id: string;
  revision: number;
  document: Record<string, unknown>;
}

const createdIds: string[] = [];

/** Playwright still runs afterEach for a skipped test; cleanup there must do nothing. */
function wasSkipped(testInfo: TestInfo): boolean {
  return testInfo.expectedStatus === 'skipped';
}

async function createThrowawayRoadmap(request: APIRequestContext): Promise<string> {
  const example = JSON.parse(readFileSync(EXAMPLE_ROADMAP, 'utf8')) as Record<string, unknown>;
  const response = await request.post('/api/roadmaps/import-json', {
    multipart: {
      file: {
        name: 'e2e-roadmap.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ ...example, name: ROADMAP_NAME })),
      },
    },
  });
  expect(response.ok()).toBe(true);
  const { id } = (await response.json()) as RoadmapRead;
  createdIds.push(id);
  return id;
}

async function readRoadmap(request: APIRequestContext, id: string): Promise<RoadmapRead> {
  const response = await request.get(`/api/roadmaps/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as RoadmapRead;
}

async function openRoadmap(page: Page, id: string): Promise<void> {
  await page.goto(`/roadmaps/${id}`);
  await expect(page.getByRole('heading', { name: ROADMAP_NAME, level: 1 })).toBeVisible();
}

function saveState(page: Page): Locator {
  return page.getByRole('banner').getByRole('status');
}

function epicBar(page: Page, key: string): Locator {
  return page
    .getByRole('region', { name: 'Roadmap timeline' })
    .getByRole('button', { name: new RegExp(`^${key} .*% complete`) });
}

function currentSprintCell(page: Page): Locator {
  return page.getByRole('group', { name: 'Timeline header' }).locator('[aria-current="date"]');
}

/** Keyboard only: press Tab until `target` has focus. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let presses = 0; presses < MAX_TAB_STOPS; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

/** Re-sync from the protected Jira fixture and wait for the diff. */
/**
 * The keys that type `iso` into a native date input. Chromium orders the segments by the
 * host's regional settings, so learn the order from a plain, uncontrolled input first.
 */
async function dateKeystrokes(page: Page, iso: string): Promise<string> {
  const probe = await page.context().newPage();
  await probe.setContent('<input type="date" aria-label="Probe">');
  await probe.getByLabel('Probe').focus();
  await probe.keyboard.type('01022003');
  const probed = await probe.getByLabel('Probe').inputValue();
  await probe.close();
  const [year, month, day] = iso.split('-');
  const order: Record<string, string> = {
    '2003-02-01': `${day}${month}${year}`,
    '2003-01-02': `${month}${day}${year}`,
  };
  const keys = order[probed];
  if (!keys) throw new Error(`Unknown date segment order (probe gave "${probed}")`);
  return keys;
}

async function uploadResync(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Re-sync from new export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Re-sync from a new Jira export' });
  await dialog.getByLabel('Drop your Jira export here').setInputFiles(RESYNC_CSV);
  await expect(dialog.getByRole('list', { name: 'Changes from Jira' })).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FROZEN_NOW);
});

test.afterEach(async ({ request }, testInfo) => {
  if (wasSkipped(testInfo)) return;
  for (const id of createdIds.splice(0)) {
    await request.delete(`/api/roadmaps/${id}`);
  }
});

test.describe('desktop roadmap journeys', () => {
  test.skip(({ viewport }) => viewport?.width !== DESKTOP_WIDTH, 'Desktop journey');

  let roadmapId = '';

  test.beforeEach(async ({ request }) => {
    roadmapId = await createThrowawayRoadmap(request);
  });

  test('RM-5 sprint view shows dates on one line at 100% and compact at Fit', async ({ page }) => {
    await openRoadmap(page, roadmapId);
    await page
      .getByRole('group', { name: 'Timescale' })
      .getByRole('button', { name: 'Sprints' })
      .click();
    const current = currentSprintCell(page);
    const dates = current.locator('small');

    await expect(current).toContainText('S3');
    await expect(dates).toHaveText('2 Nov – 15 Nov');
    expect((await dates.boundingBox())?.height ?? 0).toBeLessThanOrEqual(ONE_LINE_MAX_PX);

    await page.getByRole('button', { name: 'Fit' }).click();

    await expect(dates).toHaveText(/^(2–15 Nov|2 Nov)$/);
    const timeline = page.getByRole('region', { name: 'Roadmap timeline' });
    const overflow = await timeline.evaluate((box) => box.scrollWidth - box.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('RM-13 editing start date moves the bar and survives reload', async ({ page, request }) => {
    const startKeys = await dateKeystrokes(page, '2026-11-30');
    await openRoadmap(page, roadmapId);
    const bar = epicBar(page, 'PAY-142');
    await expect(bar).toHaveAccessibleName(/16 Nov to 29 Jan$/);
    const leftBefore = (await bar.boundingBox())?.x ?? 0;
    await bar.click();
    const panel = page.getByRole('complementary', { name: 'Epic details' });

    await panel.getByLabel('Start', { exact: true }).focus();
    await page.keyboard.type(startKeys);

    await expect(bar).toHaveAccessibleName(/30 Nov to 29 Jan$/);
    expect((await bar.boundingBox())?.x ?? 0).toBeGreaterThan(leftBefore);
    await expect(saveState(page)).toHaveText(`Saved to ${ROADMAP_FILE}`);
    await page.reload();
    await expect(epicBar(page, 'PAY-142')).toHaveAccessibleName(/30 Nov to 29 Jan$/);
    const saved = await readRoadmap(request, roadmapId);
    const items = saved.document.items as { key: string; start: string }[];
    expect(items.find((item) => item.key === 'PAY-142')?.start).toBe('2026-11-30');
  });

  test('RM-14 collapsed panel persists after reload', async ({ page }) => {
    await openRoadmap(page, roadmapId);

    await page.getByRole('button', { name: 'Collapse epic details' }).click();

    const rail = page.getByRole('complementary', { name: 'Epic details (collapsed)' });
    await expect(rail).toBeVisible();
    await page.reload();
    await expect(rail).toBeVisible();
    await expect(page.getByRole('button', { name: 'Expand epic details' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const railWidth = (await rail.boundingBox())?.width ?? 0;
    expect(railWidth).toBe(48);
  });

  test('RM-20 Ctrl+wheel zooms around the pointer', async ({ page }) => {
    await openRoadmap(page, roadmapId);
    const timeline = page.getByRole('region', { name: 'Roadmap timeline' });
    const box = await timeline.boundingBox();
    if (!box) throw new Error('The timeline has no box');
    const anchorX = 600;
    /** Fraction of the date track under the pointer: (scrollLeft + ax − 220) / (W − 220). */
    const trackFractionAtPointer = () =>
      timeline.evaluate((scrollBox, ax) => {
        const content = scrollBox.firstElementChild as HTMLElement;
        return (scrollBox.scrollLeft + ax - 220) / (content.offsetWidth - 220);
      }, anchorX);
    const before = await trackFractionAtPointer();
    await page.mouse.move(box.x + anchorX, box.y + 200);

    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -60);
    await page.keyboard.up('Control');

    await expect(page.getByRole('button', { name: /^Zoom 1\d\d%/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Zoom 100%/ })).toHaveCount(0);
    expect(await timeline.evaluate((scrollBox) => scrollBox.scrollLeft)).toBeGreaterThan(0);
    expect(Math.abs((await trackFractionAtPointer()) - before)).toBeLessThan(0.005);
    // Horizontal only: the page itself did not zoom and rows keep their height.
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  });

  test('RM-16 Save JSON → Open JSON round-trips', async ({ page, request }, testInfo) => {
    await openRoadmap(page, roadmapId);
    await page.getByRole('button', { name: 'Save JSON' }).click();
    const dialog = page.getByRole('dialog', { name: 'Save roadmap JSON' });
    await expect(dialog.getByLabel('Roadmap JSON')).toContainText(`"name": "${ROADMAP_NAME}"`);

    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('link', { name: 'Download' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(ROADMAP_FILE);
    const savedPath = testInfo.outputPath(ROADMAP_FILE);
    await download.saveAs(savedPath);
    const downloaded = JSON.parse(readFileSync(savedPath, 'utf8')) as Record<string, unknown>;
    expect(downloaded).toEqual((await readRoadmap(request, roadmapId)).document);
    await dialog.getByRole('button', { name: 'Close' }).click();

    await page.getByLabel('Open JSON').setInputFiles(savedPath);

    await expect(page).not.toHaveURL(new RegExp(roadmapId));
    await expect(page).toHaveURL(ROADMAP_URL);
    const reopenedId = ROADMAP_URL.exec(page.url())?.[1] ?? '';
    createdIds.push(reopenedId);
    await expect(page.getByRole('heading', { name: ROADMAP_NAME, level: 1 })).toBeVisible();
    const reopened = (await readRoadmap(request, reopenedId)).document;
    // A taken id is replaced on import; everything else comes back unchanged.
    expect({ ...reopened, id: downloaded.id }).toEqual(downloaded);
  });

  test('RM-16 docs/examples/roadmap.v0.json opens through Open JSON', async ({ page }) => {
    await openRoadmap(page, roadmapId);

    await page.getByLabel('Open JSON').setInputFiles(V0_ROADMAP);

    await expect(page).not.toHaveURL(new RegExp(roadmapId));
    await expect(page).toHaveURL(ROADMAP_URL);
    createdIds.push(ROADMAP_URL.exec(page.url())?.[1] ?? '');
    await expect(
      page.getByRole('heading', { name: 'Payments Platform H1 2027', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Roadmap timeline' })).toBeVisible();
  });

  test('RM-15 re-sync from payments-export.csv shows the diff and applies', async ({
    page,
    request,
  }) => {
    await openRoadmap(page, roadmapId);
    const dialog = await uploadResync(page);
    const changes = dialog.getByRole('list', { name: 'Changes from Jira' });
    await expect(changes).toContainText('PAY-142 progress');
    await expect(
      dialog.getByText('Your PM notes, milestones and manual edits are kept.'),
    ).toBeVisible();

    // Leave one change out; only the checked ones are applied.
    await changes.getByRole('checkbox', { name: /^MX-070 progress/ }).uncheck();
    const apply = dialog.getByRole('button', { name: /^Apply \d+ changes$/ });
    await apply.click();

    await expect(page.getByText('Roadmap updated from Jira')).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(epicBar(page, 'PAY-142')).toHaveAccessibleName(/, 70% complete,/);
    await expect(epicBar(page, 'MX-070')).toHaveAccessibleName(/, 30% complete,/);
    await page.reload();
    await expect(epicBar(page, 'PAY-142')).toHaveAccessibleName(/, 70% complete,/);
    const saved = await readRoadmap(request, roadmapId);
    expect((saved.document.milestones as unknown[]).length).toBe(3);
  });

  test('RM-9-editor milestones: add, rename, freeze, delete by keyboard; re-sync keeps them', async ({
    page,
    request,
  }) => {
    /** What the server has saved, as `name:kind:date-or-start`, waiting out the text debounce. */
    const savedMilestones = () =>
      expect.poll(async () => {
        const { document } = await readRoadmap(request, roadmapId);
        return (
          document.milestones as { name: string; kind: string; date?: string; start?: string }[]
        )
          .map(
            (milestone) =>
              `${milestone.name}:${milestone.kind}:${milestone.date ?? milestone.start ?? ''}`,
          )
          .sort();
      });
    // Learned before the roadmap opens, so the probe page never takes focus mid-journey.
    const pilotDateKeys = await dateKeystrokes(page, '2027-02-10');
    await openRoadmap(page, roadmapId);
    const trigger = page.getByRole('button', { name: 'Edit milestones' });
    const milestonesRow = page.getByRole('group', { name: 'Milestones' });
    const dialog = page.getByRole('dialog', { name: 'Milestones' });

    await test.step('add "Pilot" on 2027-02-10; the diamond survives a reload', async () => {
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(dialog).toBeVisible();
      await tabTo(page, dialog.getByRole('button', { name: 'Add milestone' }));
      await page.keyboard.press('Enter');
      const name = dialog.getByRole('textbox', { name: 'Name' }).last();
      await expect(name).toBeFocused();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('Pilot');
      await page.keyboard.press('Enter');
      const date = dialog.getByLabel('Date').last();
      await expect(date).toBeFocused();
      await page.keyboard.type(pilotDateKeys);
      await expect(date).toHaveValue('2027-02-10');
      await expect(name).toHaveValue('Pilot');

      await page.keyboard.press('Escape');

      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(milestonesRow.getByRole('button', { name: 'Pilot · 10 Feb' })).toBeVisible();
      await savedMilestones().toContain('Pilot:milestone:2027-02-10');
      await page.reload();
      await expect(milestonesRow.getByRole('button', { name: 'Pilot · 10 Feb' })).toBeVisible();
    });

    await test.step('switch it to a freeze window; the freeze chip appears', async () => {
      await trigger.focus();
      await page.keyboard.press('Enter');
      const pilotRow = dialog.getByRole('listitem', { name: 'Pilot' });
      await tabTo(page, pilotRow.getByRole('combobox', { name: 'Type' }));
      await page.keyboard.press('Enter');
      await page.getByRole('option', { name: 'Freeze window' }).press('Enter');
      await expect(pilotRow.getByLabel('Start')).toHaveValue('2027-02-10');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await savedMilestones().toContain('Pilot:freeze:2027-02-10');

      await expect(
        milestonesRow.getByRole('img', { name: 'Pilot · 10 Feb – 10 Feb' }),
      ).toBeVisible();
      await expect(milestonesRow.getByRole('button', { name: 'Pilot · 10 Feb' })).toHaveCount(0);
    });

    await test.step('a re-sync keeps the edited milestones', async () => {
      const resync = await uploadResync(page);
      await resync.getByRole('button', { name: /^Apply \d+ changes$/ }).click();
      await expect(page.getByText('Roadmap updated from Jira')).toBeVisible();
      await page.reload();
      await expect(
        milestonesRow.getByRole('img', { name: 'Pilot · 10 Feb – 10 Feb' }),
      ).toBeVisible();
      await expect(
        milestonesRow.getByRole('button', { name: 'Beta launch · 15 Jan' }),
      ).toBeVisible();
    });

    await test.step('delete: Cancel keeps it, Delete removes it after a reload', async () => {
      await trigger.focus();
      await page.keyboard.press('Enter');
      const deletePilot = dialog.getByRole('button', { name: 'Delete Pilot' });
      await tabTo(page, deletePilot);
      await page.keyboard.press('Enter');
      const confirmation = dialog.getByRole('group', { name: 'Delete Pilot?' });
      await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(confirmation).toBeHidden();
      await expect(deletePilot).toBeFocused();

      await page.keyboard.press('Enter');
      await tabTo(page, confirmation.getByRole('button', { name: 'Delete' }));
      await page.keyboard.press('Enter');

      await expect(dialog.getByRole('listitem', { name: 'Pilot' })).toHaveCount(0);
      await tabTo(page, dialog.getByRole('button', { name: 'Done' }));
      await page.keyboard.press('Enter');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await savedMilestones().toEqual([
        'Beta launch:milestone:2027-01-15',
        'Code freeze:freeze:2027-03-15',
        'General availability (GA):milestone:2027-04-20',
      ]);
      await page.reload();
      await expect(milestonesRow.getByRole('img', { name: /^Pilot/ })).toHaveCount(0);
      await expect(
        milestonesRow.getByRole('button', { name: 'Beta launch · 15 Jan' }),
      ).toBeVisible();
    });
  });
});

test.describe('typing into autosaved fields', () => {
  test.skip(({ viewport }) => viewport?.width !== DESKTOP_WIDTH, 'Desktop journey');

  test('RM-9-editor typing a date by keyboard in the Milestones dialog sets that date', async ({
    page,
    request,
  }) => {
    const roadmapId = await createThrowawayRoadmap(request);
    const keys = await dateKeystrokes(page, '2027-02-10');
    await openRoadmap(page, roadmapId);
    await page.getByRole('button', { name: 'Edit milestones' }).click();
    const dialog = page.getByRole('dialog', { name: 'Milestones' });
    await dialog.getByRole('button', { name: 'Add milestone' }).click();
    const date = dialog.getByLabel('Date').last();
    await date.focus();

    await page.keyboard.type(keys);

    await expect(date).toHaveValue('2027-02-10');
  });

  test('RM-9-editor typing a name quickly in the Milestones dialog keeps every character', async ({
    page,
    request,
  }) => {
    const roadmapId = await createThrowawayRoadmap(request);
    await openRoadmap(page, roadmapId);
    await page.getByRole('button', { name: 'Edit milestones' }).click();
    const dialog = page.getByRole('dialog', { name: 'Milestones' });
    const name = dialog.getByRole('listitem', { name: 'Beta launch' }).getByLabel('Name');
    await name.focus();
    await page.keyboard.press('End');

    await page.keyboard.type(' pilot');

    await expect(name).toHaveValue('Beta launch pilot');
  });

  test('RM-13 typing a start date by keyboard in the detail panel sets that date', async ({
    page,
    request,
  }) => {
    const roadmapId = await createThrowawayRoadmap(request);
    const keys = await dateKeystrokes(page, '2026-11-30');
    await openRoadmap(page, roadmapId);
    await epicBar(page, 'PAY-142').click();
    const start = page
      .getByRole('complementary', { name: 'Epic details' })
      .getByLabel('Start', { exact: true });
    await start.focus();

    await page.keyboard.type(keys);

    await expect(start).toHaveValue('2026-11-30');
  });
});

test('G-5 roadmap at 390px: toolbar wraps, panel below, timeline scrolls inside its box', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only smoke test');
  const roadmapId = await createThrowawayRoadmap(request);
  await openRoadmap(page, roadmapId);
  const toolbar = page.getByRole('toolbar', { name: 'Roadmap' });
  const resync = await toolbar
    .getByRole('button', { name: 'Re-sync from new export' })
    .boundingBox();
  const exportButton = await toolbar.getByRole('button', { name: 'Export…' }).boundingBox();
  const timeline = page.getByRole('region', { name: 'Roadmap timeline' });
  const timelineBox = await timeline.boundingBox();
  const panelBox = await page.getByRole('complementary', { name: 'Epic details' }).boundingBox();

  expect(exportButton?.y ?? 0).toBeGreaterThan(resync?.y ?? 0);
  expect(panelBox?.y ?? 0).toBeGreaterThanOrEqual(
    (timelineBox?.y ?? 0) + (timelineBox?.height ?? 0),
  );
  expect(await timeline.evaluate((box) => box.scrollWidth > box.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    MOBILE_WIDTH,
  );
});
