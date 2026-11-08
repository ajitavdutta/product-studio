import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '../../api/client';
import type { ImportSessionRead } from '../../api/useImports';
import { PREVIEW } from '../../test/importFixtures';
import { createTestQueryClient } from '../../test/providers';
import { renderApp } from '../../test/renderApp';
import { MapFieldsPage } from './MapFieldsPage';
import { useImportDraftStore } from './state';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

const SESSION: ImportSessionRead = {
  id: '6a0c1f1e-1d2b-4c3a-9e8f-7a6b5c4d3e2f',
  fileName: 'payments-export.csv',
  size: 12_345,
  format: 'csv',
  formatLabel: 'Jira CSV',
  encoding: 'utf-8-sig',
  rowCount: 55,
  columns: [
    {
      id: 'issue key',
      name: 'Issue key',
      label: 'Issue key',
      samples: ['PAY-142'],
      fill: 1,
      repeatCount: 1,
      suggestedField: 'key',
      confidence: 'exact',
    },
    {
      id: 'summary',
      name: 'Summary',
      label: 'Summary',
      samples: ['Saved cards'],
      fill: 1,
      repeatCount: 1,
      suggestedField: 'title',
      confidence: 'exact',
    },
    {
      id: 'components',
      name: 'Components',
      label: 'Components',
      samples: ['Wallet'],
      fill: 0.27,
      repeatCount: 2,
    },
  ],
  ignoredColumns: ['Priority', 'Assignee'],
  statuses: [{ jiraStatus: 'Blocked', count: 2, statusId: 'at-risk' }],
  templateId: null,
  suggestedName: 'Payments export',
  createdAt: '2026-11-06T11:40:00Z',
};

const CREATED = {
  id: SESSION.id,
  name: 'Payments export',
  fileName: 'payments-export.json',
  revision: 1,
  createdAt: '2026-11-06T11:41:00Z',
  updatedAt: '2026-11-06T11:41:00Z',
  document: PREVIEW.document,
};

const ROUTES = [
  { path: '/import/:sessionId', element: <MapFieldsPage /> },
  { path: '/roadmaps/:roadmapId', element: <h1>Roadmap page</h1> },
];

type Answer = () => Promise<unknown>;

/** Answer the session GET with `session`, the preview with `PREVIEW`, and the commit with `commit`. */
function renderPage(session: Answer, commit: Answer = () => Promise.resolve(CREATED)) {
  apiRequestMock.mockImplementation((_method, path) => {
    if (path.endsWith('/preview')) return Promise.resolve(PREVIEW);
    if (path.endsWith('/commit')) return commit();
    return session();
  });
  renderApp(`/import/${SESSION.id}`, ROUTES, createTestQueryClient());
}

const CREATE = { name: 'Create roadmap & save JSON' };

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  useImportDraftStore.setState({ drafts: {} });
});

describe('MapFieldsPage', () => {
  it('IMP-1 shows the file name, issue count and detected format', async () => {
    renderPage(() => Promise.resolve(SESSION));

    expect(await screen.findByText(/· 55 issues · Jira CSV/)).toHaveTextContent(
      'payments-export.csv',
    );
  });

  it('IMP-1 shows the uploaded file size after the upload', async () => {
    renderPage(() => Promise.resolve(SESSION));

    expect(await screen.findByText(/· 55 issues · Jira CSV/)).toHaveTextContent(
      'payments-export.csv · 12 KB · 55 issues · Jira CSV',
    );
  });

  it('marks Map fields as the current step', async () => {
    renderPage(() => Promise.resolve(SESSION));

    const steps = await screen.findByRole('list', { name: 'Import steps' });
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('Map fields');
  });

  it("IMP-5 choosing Don't import for the last unmapped column completes the mapping", async () => {
    renderPage(() => Promise.resolve(SESSION));

    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Roadmap field for Components' }),
      "Don't import",
    );

    expect(screen.getByRole('status')).toHaveTextContent('Auto-mapped 3 of 3');
  });

  it('IMP-5 assigning Key to another column frees the first one', async () => {
    renderPage(() => Promise.resolve(SESSION));

    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Roadmap field for Components' }),
      'Key',
    );

    expect(
      screen.getByRole('combobox', { name: 'Roadmap field for Issue key' }),
    ).toHaveDisplayValue('Choose a field…');
  });

  it('IMP-7 a new status becomes the mapped status', async () => {
    renderPage(() => Promise.resolve(SESSION));

    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Roadmap status for Blocked' }),
      'New status…',
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Status name' }), 'Waiting{Enter}');

    expect(
      await screen.findByRole('combobox', { name: 'Roadmap status for Blocked' }),
    ).toHaveDisplayValue('Waiting');
  });

  it('IMP-8 keeps a roll-up rule the user turns on', async () => {
    renderPage(() => Promise.resolve(SESSION));

    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Turn Fix versions into milestones' }),
    );

    expect(useImportDraftStore.getState().drafts[SESSION.id]?.mapping.rollup).toEqual({
      rollUpStories: true,
      useSprintDates: true,
      unscheduledTray: true,
      fixVersionsAsMilestones: true,
    });
  });

  it('shows the expired state with Upload again on a 404', async () => {
    renderPage(() =>
      Promise.reject(new ApiError(404, 'That import has expired. Upload the file again.')),
    );

    expect(await screen.findByRole('link', { name: 'Upload again' })).toHaveAttribute(
      'href',
      '/import',
    );
  });

  it('IMP-11 shows the live preview beside the mapping', async () => {
    renderPage(() => Promise.resolve(SESSION));

    expect(await screen.findByLabelText('Roadmap JSON')).toHaveTextContent(
      '"items": [ … 12 epics ]',
    );
  });

  it('IMP-11 asks for a new preview after a mapping change', async () => {
    renderPage(() => Promise.resolve(SESSION));
    await screen.findByLabelText('Roadmap JSON');

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Roadmap field for Components' }),
      "Don't import",
    );

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        'POST',
        `/imports/${SESSION.id}/preview`,
        expect.objectContaining({
          columns: expect.objectContaining({ components: 'ignore' }) as unknown,
        }),
      );
    });
  });

  it('IMP-10 create stays disabled while Title is unmapped', async () => {
    renderPage(() => Promise.resolve(SESSION));
    await screen.findByLabelText('Roadmap JSON');

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Roadmap field for Summary' }),
      "Don't import",
    );

    expect(screen.getByRole('button', CREATE)).toBeDisabled();
  });

  it('IMP-12 marks Preview & save as the current step while confirming', async () => {
    renderPage(() => Promise.resolve(SESSION));
    await screen.findByLabelText('Roadmap JSON');

    await userEvent.click(screen.getByRole('button', CREATE));

    const steps = screen.getByRole('list', { name: 'Import steps', hidden: true });
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('Preview & save');
  });

  it('IMP-12 creates, downloads and opens the roadmap', async () => {
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(`${this.getAttribute('href') ?? ''} ${this.download}`);
    });
    renderPage(() => Promise.resolve(SESSION));
    await screen.findByLabelText('Roadmap JSON');

    await userEvent.click(screen.getByRole('button', CREATE));
    await userEvent.click(await screen.findByRole('button', { name: 'Create & save' }));

    expect({
      page: await screen.findByRole('heading', { name: 'Roadmap page' }),
      downloads: clicked,
      snackbar: screen.getByText('Saved payments-export.json'),
      commit: apiRequestMock.mock.calls.find(([, path]) => path.endsWith('/commit'))?.[2],
    }).toEqual({
      page: expect.anything() as unknown,
      downloads: [`/api/roadmaps/${SESSION.id}/document payments-export.json`],
      snackbar: expect.anything() as unknown,
      commit: expect.objectContaining({ name: 'Payments export', updateTemplate: true }) as unknown,
    });
  });

  it('IMP-12 keeps the dialog open and shows the reason on failure', async () => {
    renderPage(
      () => Promise.resolve(SESSION),
      () => Promise.reject(new ApiError(422, 'Map Key and Title before creating the roadmap')),
    );
    await screen.findByLabelText('Roadmap JSON');

    await userEvent.click(screen.getByRole('button', CREATE));
    await userEvent.click(await screen.findByRole('button', { name: 'Create & save' }));

    expect(
      within(screen.getByRole('dialog', { name: 'Create roadmap' })).getByRole('alert'),
    ).toHaveTextContent('Map Key and Title before creating the roadmap');
  });

  it('shows an error with Retry when the session fails to load', async () => {
    renderPage(() => Promise.reject(new ApiError(500, 'Server error')));

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
