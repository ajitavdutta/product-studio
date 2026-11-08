import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useParams, type RouteObject } from 'react-router';
import { ApiError, apiRequest, apiUpload, type HttpMethod } from '../../api/client';
import type { ImportSessionRead } from '../../api/useImports';
import type { MappingTemplateRead } from '../../api/useMappingTemplates';
import type { DocumentSummary } from '../../api/useRoadmap';
import { createTestQueryClient } from '../../test/providers';
import { renderApp } from '../../test/renderApp';
import { ImportPage } from './ImportPage';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  apiRequest: vi.fn(),
  apiUpload: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);
const apiUploadMock = vi.mocked(apiUpload);

const SESSION: ImportSessionRead = {
  id: '5b0f8f1e-3c55-4a8e-9a0b-6f1d2e3c4b5a',
  fileName: 'payments-export.csv',
  size: 12_345,
  format: 'csv',
  formatLabel: 'Jira CSV',
  encoding: 'utf-8-sig',
  rowCount: 55,
  columns: [],
  ignoredColumns: [],
  statuses: [],
  templateId: null,
  suggestedName: 'Payments export',
  createdAt: '2026-11-06T09:00:00Z',
};
const ROADMAP: DocumentSummary = {
  id: '0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31',
  kind: 'roadmap',
  name: 'Payments Platform H1 2027',
  fileName: 'payments-platform-h1-2027.json',
  schemaVersion: 1,
  revision: 3,
  updatedAt: '2026-11-02T12:00:00Z',
};
const OLDER_TEMPLATE: MappingTemplateRead = {
  id: 'tpl-default',
  name: 'Jira Cloud — default',
  columnMap: {},
  statusMap: {},
  updatedAt: '2026-10-01T12:00:00Z',
};
const NEWER_TEMPLATE: MappingTemplateRead = {
  id: 'tpl-payments',
  name: 'Jira Cloud — Payments',
  columnMap: {},
  statusMap: {},
  updatedAt: '2026-11-01T12:00:00Z',
};

interface Fixtures {
  templates?: MappingTemplateRead[];
  roadmaps?: DocumentSummary[];
}

/** Answer the page's GETs and the sample POST; anything else never settles. */
function serve({ templates = [], roadmaps = [] }: Fixtures = {}) {
  apiRequestMock.mockImplementation((method: HttpMethod, path: string) => {
    if (method === 'GET' && path === '/mapping-templates') return Promise.resolve(templates);
    if (method === 'GET' && path === '/roadmaps') return Promise.resolve(roadmaps);
    if (method === 'GET' && path === '/diagrams') return Promise.resolve([]);
    if (method === 'GET' && path === '/imports/jira/sample') {
      return Promise.resolve({ fileName: 'payments-export.csv', rowCount: 55 });
    }
    if (method === 'POST' && path.startsWith('/imports/jira/sample')) {
      return Promise.resolve(SESSION);
    }
    return new Promise(() => undefined);
  });
}

function MapStub() {
  const { sessionId } = useParams();
  return <p>Map page for {sessionId}</p>;
}

function RoadmapStub() {
  const { id } = useParams();
  return <p>Roadmap {id}</p>;
}

// The Map page belongs to another step; a stub shows where the upload navigated.
const ROUTES: RouteObject[] = [
  { path: '/import', element: <ImportPage /> },
  { path: '/import/:sessionId', element: <MapStub /> },
  { path: '/roadmaps/:id', element: <RoadmapStub /> },
];

function renderImport(path = '/import') {
  renderApp(path, ROUTES, createTestQueryClient());
}

function csvFile(): File {
  return new File(['Issue key,Summary\nMX-1,Card vault\n'], 'payments-export.csv', {
    type: 'text/csv',
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('ImportPage', () => {
  it('IMP-1 uploads a dropped CSV and opens Map fields', async () => {
    serve();
    apiUploadMock.mockResolvedValue(SESSION);
    renderImport();

    await userEvent.upload(screen.getByLabelText(/Drop your Jira export here/), csvFile());

    expect(await screen.findByText(`Map page for ${SESSION.id}`)).toBeInTheDocument();
  });

  it('IMP-1 shows the server reason when a file is rejected', async () => {
    serve();
    apiUploadMock.mockRejectedValue(
      new ApiError(422, "This doesn't look like a Jira export: no Issue key or Summary column."),
    );
    renderImport();

    await userEvent.upload(screen.getByLabelText(/Drop your Jira export here/), csvFile());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("This doesn't look like a Jira export");
    expect(within(alert).getByRole('button', { name: 'Choose another file' })).toBeInTheDocument();
  });

  it('IMP-1 sample button shows the issue count and starts the sample import', async () => {
    serve();
    renderImport();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Use the sample export (55 issues)' }),
    );

    expect(await screen.findByText(`Map page for ${SESSION.id}`)).toBeInTheDocument();
  });

  it('IMP-1 ?sample=1 starts the sample import on arrival', async () => {
    serve();
    renderImport('/import?sample=1');

    expect(await screen.findByText(`Map page for ${SESSION.id}`)).toBeInTheDocument();
  });

  it('IMP-2 opening a saved roadmap bypasses mapping', async () => {
    serve({ roadmaps: [ROADMAP] });
    renderImport();

    await userEvent.click(await screen.findByRole('button', { name: `Open ${ROADMAP.name}` }));

    expect(await screen.findByText(`Roadmap ${ROADMAP.id}`)).toBeInTheDocument();
  });

  it('IMP-2 loading a .json file opens the roadmap it creates', async () => {
    serve();
    apiUploadMock.mockResolvedValue({ id: ROADMAP.id });
    renderImport();

    await userEvent.upload(
      screen.getByLabelText('Roadmap .json file'),
      new File(['{}'], 'saved.json', { type: 'application/json' }),
    );

    expect(await screen.findByText(`Roadmap ${ROADMAP.id}`)).toBeInTheDocument();
    expect(apiUploadMock).toHaveBeenCalledWith(
      '/roadmaps/import-json',
      expect.any(File),
      'saved.json',
    );
  });

  it('IMP-3 export help discloses three steps', async () => {
    serve();
    renderImport();

    await userEvent.click(screen.getByRole('button', { name: 'How do I export from Jira?' }));

    const help = screen.getByRole('region', { name: 'How do I export from Jira?' });
    const steps = within(help).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'In Jira, open Filters and run the filter or JQL for your epics and stories.',
      'Choose Export → Export CSV (all fields).',
      'Drop the file here.',
    ]);
  });

  it('IMP-9 sends the selected template id', async () => {
    serve({ templates: [OLDER_TEMPLATE, NEWER_TEMPLATE] });
    apiUploadMock.mockResolvedValue(SESSION);
    renderImport();

    // The most recently updated template is the default; choose the other one.
    const select = await screen.findByRole('combobox', { name: 'Mapping template' });
    expect(select).toHaveTextContent(NEWER_TEMPLATE.name);
    await userEvent.click(select);
    await userEvent.click(screen.getByRole('option', { name: OLDER_TEMPLATE.name }));
    await userEvent.upload(screen.getByLabelText(/Drop your Jira export here/), csvFile());

    await waitFor(() => {
      expect(apiUploadMock).toHaveBeenCalledWith(
        `/imports/jira?templateId=${OLDER_TEMPLATE.id}`,
        expect.any(File),
        'payments-export.csv',
      );
    });
  });
});
