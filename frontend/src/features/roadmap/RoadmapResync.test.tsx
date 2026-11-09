import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import example from '../../../../docs/examples/roadmap.example.json';
import { ApiError, apiRequest, apiUpload, type HttpMethod } from '../../api/client';
import type { MappingTemplateRead } from '../../api/useMappingTemplates';
import type { ResyncChange, RoadmapResyncRead } from '../../api/useResync';
import type { RoadmapDocument, RoadmapRead } from '../../api/useRoadmap';
import { useSaveStateStore } from '../../app/saveState';
import { createTestQueryClient, seedEmptyDocumentLists } from '../../test/providers';
import { renderApp } from '../../test/renderApp';
import { useRoadmapEditor } from './state';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  apiRequest: vi.fn(),
  apiUpload: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);
const apiUploadMock = vi.mocked(apiUpload);

const DOCUMENT = example as RoadmapDocument;
const ROADMAP_ID = DOCUMENT.id;
const RESYNC_ID = '5b0c3f7e-0000-4000-8000-000000000001';
const ROADMAP: RoadmapRead = {
  id: ROADMAP_ID,
  name: DOCUMENT.name,
  fileName: 'payments-platform-h1-2027.json',
  revision: 4,
  createdAt: '2026-11-01T09:00:00Z',
  updatedAt: '2026-11-06T09:00:00Z',
  document: DOCUMENT,
};
const TEMPLATE: MappingTemplateRead = {
  id: 'tpl-jira-cloud-payments',
  name: 'Jira Cloud · Payments',
  columnMap: {},
  statusMap: {},
  updatedAt: '2026-11-01T09:00:00Z',
};
const EXPORT_FILE = new File(['Key,Summary'], 'payments-export.csv', { type: 'text/csv' });

function change(id: string, extra: Partial<ResyncChange> = {}): ResyncChange {
  return {
    id,
    kind: 'dates',
    itemKey: 'PAY-155',
    itemTitle: 'UPI AutoPay mandates',
    before: '1 Dec 2026 – 12 Mar 2027',
    after: '1 Dec 2026 – 26 Mar 2027',
    conflict: false,
    alreadyApplied: false,
    ...extra,
  };
}

const CHANGES: ResyncChange[] = [
  change('dates:PAY-155'),
  change('progress:MX-077', {
    kind: 'progress',
    itemKey: 'MX-077',
    itemTitle: 'Merchant payouts dashboard',
    before: '0%',
    after: '15%',
  }),
  change('dates:PAY-142', {
    itemKey: 'PAY-142',
    itemTitle: 'Saved cards & one-click checkout',
    conflict: true,
    conflictReason: 'You changed the dates by hand',
  }),
  change('status:RSK-031', {
    kind: 'status',
    itemKey: 'RSK-031',
    before: 'In progress',
    after: 'At risk',
    alreadyApplied: true,
  }),
];

function resyncWith(changes: ResyncChange[]): RoadmapResyncRead {
  return {
    id: RESYNC_ID,
    roadmapId: ROADMAP_ID,
    baseRevision: 4,
    fileName: 'payments-export.csv',
    templateName: TEMPLATE.name,
    changes,
    unchanged: 7,
    warnings: ['PAY-200 ends after the last PI — add one in Manage PIs'],
  };
}

const APPLIED: RoadmapRead = {
  ...ROADMAP,
  revision: 5,
  document: {
    ...DOCUMENT,
    items: DOCUMENT.items.map((item) =>
      item.key === 'PAY-155' ? { ...item, end: '2027-03-26' } : item,
    ),
  },
};

function mockServer(
  apply: () => Promise<unknown> = () => Promise.resolve(APPLIED),
  templates: MappingTemplateRead[] = [TEMPLATE],
) {
  apiRequestMock.mockImplementation((method: HttpMethod, path: string) => {
    if (method === 'GET' && path === `/roadmaps/${ROADMAP_ID}`) return Promise.resolve(ROADMAP);
    if (method === 'GET' && path === '/mapping-templates') return Promise.resolve(templates);
    if (method === 'POST' && path.endsWith('/apply')) return apply();
    return Promise.reject(new Error(`Unexpected ${method} ${path}`));
  });
}

async function openReview(changes: ResyncChange[] = CHANGES) {
  apiUploadMock.mockResolvedValue(resyncWith(changes));
  renderApp(`/roadmaps/${ROADMAP_ID}`, undefined, seedEmptyDocumentLists(createTestQueryClient()));
  await userEvent.click(await screen.findByRole('button', { name: 'Re-sync from new export' }));
  const dialog = await screen.findByRole('dialog', { name: 'Re-sync from a new Jira export' });
  await within(dialog).findByLabelText('Mapping template');
  await userEvent.upload(within(dialog).getByLabelText(/Drop your Jira export here/), EXPORT_FILE);
  await within(dialog).findByText(/Comparing/);
  return dialog;
}

function checkedState(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('checkbox')
    .map((box) => [box.closest('label')?.textContent, (box as HTMLInputElement).checked]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-06T12:00:00'));
  window.localStorage.clear();
  useRoadmapEditor.setState({ view: 'months', groupBy: 'team', selectedItemId: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  useSaveStateStore.getState().set(null);
});

describe('Re-sync', () => {
  it('RM-15 uploads with the roadmap’s own mapping template', async () => {
    mockServer();

    await openReview();

    expect(apiUploadMock).toHaveBeenCalledWith(
      `/roadmaps/${ROADMAP_ID}/resync`,
      EXPORT_FILE,
      'payments-export.csv',
      { templateId: 'tpl-jira-cloud-payments' },
    );
  });

  it('RM-15 matches columns automatically when the roadmap’s template was deleted', async () => {
    mockServer(undefined, []);

    await openReview();

    expect(apiUploadMock.mock.calls[0]?.[3]).toEqual({ mapping: 'auto' });
  });

  it('RM-15 choosing Automatic sends mapping=auto without a template', async () => {
    mockServer();
    apiUploadMock.mockResolvedValue(resyncWith(CHANGES));
    renderApp(
      `/roadmaps/${ROADMAP_ID}`,
      undefined,
      seedEmptyDocumentLists(createTestQueryClient()),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Re-sync from new export' }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(
      await within(dialog).findByRole('combobox', { name: 'Mapping template' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: 'Automatic — match columns by name' }),
    );
    await userEvent.upload(
      within(dialog).getByLabelText(/Drop your Jira export here/),
      EXPORT_FILE,
    );

    expect(apiUploadMock.mock.calls[0]?.[3]).toEqual({ mapping: 'auto' });
  });

  it('RM-15 lists changes and pre-selects non-conflicts', async () => {
    mockServer();

    const dialog = await openReview();

    expect(checkedState(dialog)).toEqual([
      ['PAY-155 dates: 1 Dec 2026 – 12 Mar 2027 → 1 Dec 2026 – 26 Mar 2027', true],
      ['MX-077 progress: 0% → 15%', true],
      ['PAY-142 dates: 1 Dec 2026 – 12 Mar 2027 → 1 Dec 2026 – 26 Mar 2027', false],
    ]);
  });

  it('RM-15 shows conflicts with their reason, already-applied rows and warnings', async () => {
    mockServer();

    const dialog = await openReview();

    expect(within(dialog).getByText('You changed the dates by hand')).toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: 'Already applied' })).toHaveTextContent(
      'RSK-031 status: In progress → At risk (already applied)',
    );
    expect(within(dialog).getByText(/PAY-200 ends after the last PI/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Apply 2 changes' })).toBeEnabled();
  });

  it('RM-15 Apply sends only checked ids and updates the timeline', async () => {
    mockServer();
    const dialog = await openReview();

    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^MX-077/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply 1 change' }));

    expect(apiRequestMock).toHaveBeenCalledWith(
      'POST',
      `/roadmaps/${ROADMAP_ID}/resync/${RESYNC_ID}/apply`,
      { baseVersion: 4, changeIds: ['dates:PAY-155'] },
    );
    expect(
      await screen.findByRole('button', { name: /^PAY-155 .* to 26 Mar$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Roadmap updated from Jira')).toBeInTheDocument();
  });

  it('RM-15 stale export returns to step 1 with the message', async () => {
    mockServer(() =>
      Promise.reject(
        new ApiError(409, 'This roadmap changed since you uploaded the export. Upload it again.'),
      ),
    );
    const dialog = await openReview();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply 2 changes' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This roadmap changed since you uploaded the export. Upload it again.',
    );
    expect(within(dialog).getByLabelText(/Drop your Jira export here/)).toBeInTheDocument();
  });

  it('RM-15 a rejected selection keeps the review open with the reason', async () => {
    mockServer(() => Promise.reject(new ApiError(422, 'Choose at least one change to apply')));
    const dialog = await openReview();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply 2 changes' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Choose at least one change to apply');
    // Pinned beside the actions, outside the scrolling list of changes.
    expect(alert.closest('.MuiDialogContent-root')).toBeNull();
  });

  it('RM-15 Apply is disabled when nothing is checked', async () => {
    mockServer();
    const dialog = await openReview([change('dates:PAY-155')]);

    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^PAY-155/ }));

    expect(within(dialog).getByRole('button', { name: 'Apply 0 changes' })).toBeDisabled();
  });

  it('RM-15 an export with no changes says it matches', async () => {
    mockServer();

    const dialog = await openReview([]);

    expect(within(dialog).getByText('This export matches your roadmap.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Apply/ })).not.toBeInTheDocument();
  });

  it('RM-15 an unreadable export shows the server reason on step 1', async () => {
    mockServer();
    apiUploadMock.mockRejectedValue(
      new ApiError(
        422,
        "Couldn't find the Key and Summary columns in this file. Import it from the Import page instead.",
      ),
    );
    renderApp(
      `/roadmaps/${ROADMAP_ID}`,
      undefined,
      seedEmptyDocumentLists(createTestQueryClient()),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Re-sync from new export' }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.upload(
      within(dialog).getByLabelText(/Drop your Jira export here/),
      EXPORT_FILE,
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Couldn't find the Key and Summary columns",
    );
  });
});
