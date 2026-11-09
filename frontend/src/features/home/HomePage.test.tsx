import roadmapExample from '../../../../docs/examples/roadmap.example.json';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, apiUpload, type HttpMethod } from '../../api/client';
import type { DeleteImpact, DocumentSummary, RoadmapRead } from '../../api/useRoadmap';
import { createTestQueryClient } from '../../test/providers';
import { renderApp } from '../../test/renderApp';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  apiRequest: vi.fn(),
  apiUpload: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);
const apiUploadMock = vi.mocked(apiUpload);

const ROADMAP: DocumentSummary = {
  id: '0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31',
  kind: 'roadmap',
  name: 'Payments Platform H1 2027',
  fileName: 'payments-platform-h1-2027.json',
  schemaVersion: 1,
  revision: 3,
  // Midday UTC, so the date reads 2 Nov 2026 in any time zone the tests run in.
  updatedAt: '2026-11-02T12:00:00Z',
};
const DIAGRAM: DocumentSummary = {
  id: '5b1f6c0e-2c1d-4c8e-9d43-7a1b2f3e4d50',
  kind: 'diagram',
  name: 'Customer refund flow',
  fileName: 'customer-refund-flow.swimlane.json',
  schemaVersion: 1,
  revision: 1,
  updatedAt: '2026-10-28T12:00:00Z',
};
const IMPACT: DeleteImpact = {
  id: ROADMAP.id,
  kind: 'roadmap',
  name: ROADMAP.name,
  unlinks: [],
  message: 'Deleting it unlinks 1 diagram: Customer refund flow.',
};

type Route = (method: HttpMethod, path: string) => unknown;

/** Answer requests by method and path; anything unhandled never settles. */
function serve(route: Route) {
  apiRequestMock.mockImplementation((method, path) => {
    const answer = route(method, path);
    if (answer instanceof Error) return Promise.reject(answer);
    return answer === undefined ? new Promise(() => undefined) : Promise.resolve(answer);
  });
}

function serveLists(roadmaps: DocumentSummary[], diagrams: DocumentSummary[]): Route {
  return (method, path) => {
    if (method !== 'GET') return undefined;
    if (path === '/roadmaps') return roadmaps;
    if (path === '/diagrams') return diagrams;
    return undefined;
  };
}

function renderHome() {
  renderApp('/', undefined, createTestQueryClient());
}

function list(name: string) {
  return screen.getByRole('region', { name });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('HomePage', () => {
  it('HOME-1 shows the three tiles', () => {
    serve(serveLists([], []));

    renderHome();

    expect(
      ['Import from Jira', 'Open a saved roadmap', 'Swimlane diagrams'].map(
        (name) => screen.getAllByRole('button', { name }).length,
      ),
    ).toEqual([1, 1, 1]);
  });

  it('HOME-1 open a saved roadmap uploads the json and opens it', async () => {
    serve(serveLists([], []));
    const imported: RoadmapRead = {
      id: ROADMAP.id,
      name: ROADMAP.name,
      fileName: ROADMAP.fileName,
      revision: 1,
      createdAt: '2026-11-06T09:00:00Z',
      updatedAt: '2026-11-06T09:00:00Z',
      // The editor needs a full document to render.
      document: { ...(roadmapExample as RoadmapRead['document']), name: ROADMAP.name },
    };
    apiUploadMock.mockResolvedValue(imported);
    renderHome();

    await userEvent.upload(
      screen.getByLabelText('Roadmap .json file'),
      new File(['{}'], 'payments.json', { type: 'application/json' }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: ROADMAP.name }),
    ).toBeInTheDocument();
  });

  it('HOME-1 open a saved roadmap shows the server reason when the file is rejected', async () => {
    serve(serveLists([], []));
    apiUploadMock.mockRejectedValue(new ApiError(422, "This file isn't a roadmap."));
    renderHome();

    await userEvent.upload(
      screen.getByLabelText('Roadmap .json file'),
      new File(['{}'], 'other.json', { type: 'application/json' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent("This file isn't a roadmap.");
  });

  it('HOME-1 Swimlane diagrams opens the most recent diagram', async () => {
    serve(serveLists([], [DIAGRAM]));
    renderHome();
    await within(list('Swimlane diagrams')).findByText(DIAGRAM.name);

    await userEvent.click(screen.getByRole('button', { name: 'Swimlane diagrams' }));

    expect(apiRequestMock).toHaveBeenCalledWith('GET', `/diagrams/${DIAGRAM.id}`);
  });

  it('HOME-1 Swimlane diagrams creates a blank diagram when there are none', async () => {
    const lists = serveLists([], []);
    serve((method, path) =>
      method === 'POST' && path === '/diagrams' ? { id: DIAGRAM.id } : lists(method, path),
    );
    renderHome();
    await within(list('Swimlane diagrams')).findByText('No diagrams yet.');

    await userEvent.click(screen.getByRole('button', { name: 'Swimlane diagrams' }));

    expect(apiRequestMock).toHaveBeenCalledWith('POST', '/diagrams', {
      name: 'Untitled workflow',
      lanesFrom: 'blank',
    });
  });

  it('HOME-2 lists recent roadmaps with name, file name and updated date', async () => {
    serve(serveLists([ROADMAP], []));

    renderHome();

    const row = (await within(list('Recent roadmaps')).findByText(ROADMAP.name)).closest('li');
    expect(row).toHaveTextContent(`${ROADMAP.name}${ROADMAP.fileName}Updated 2 Nov 2026Open`);
  });

  it('HOME-2 shows at most five documents per list', async () => {
    const many = Array.from({ length: 7 }, (_, index) => ({
      ...ROADMAP,
      id: `00000000-0000-4000-8000-00000000000${String(index)}`,
      name: `Roadmap ${String(index)}`,
    }));
    serve(serveLists(many, []));

    renderHome();

    await within(list('Recent roadmaps')).findByText('Roadmap 0');
    expect(within(list('Recent roadmaps')).getAllByRole('listitem')).toHaveLength(5);
  });

  it('HOME-2 shows the empty state with Import from Jira', async () => {
    serve(serveLists([], []));

    renderHome();

    expect(
      await within(list('Recent roadmaps')).findByRole('link', { name: 'Import from Jira' }),
    ).toHaveAttribute('href', '/import');
  });

  it('HOME-2 shows an error with Retry', async () => {
    let failures = 1;
    serve((method, path) => {
      if (path === '/roadmaps' && failures > 0) {
        failures -= 1;
        return new ApiError(500, 'Boom');
      }
      return serveLists([ROADMAP], [])(method, path);
    });
    renderHome();

    await userEvent.click(
      await within(list('Recent roadmaps')).findByRole('button', { name: 'Retry' }),
    );

    expect(await within(list('Recent roadmaps')).findByText(ROADMAP.name)).toBeInTheDocument();
  });

  it('deletes a roadmap after confirming the unlink message', async () => {
    const lists = serveLists([ROADMAP], []);
    serve((method, path) => {
      if (path === `/roadmaps/${ROADMAP.id}/delete-impact`) return IMPACT;
      if (method === 'DELETE') return IMPACT;
      return lists(method, path);
    });
    renderHome();

    await userEvent.click(await screen.findByRole('button', { name: `Delete ${ROADMAP.name}` }));
    const dialog = screen.getByRole('dialog', { name: `Delete “${ROADMAP.name}”?` });
    expect(await within(dialog).findByText(IMPACT.message)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(`Deleted ${ROADMAP.name}`)).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledWith('DELETE', `/roadmaps/${ROADMAP.id}`);
  });

  it('cancelling the delete confirmation deletes nothing', async () => {
    const lists = serveLists([ROADMAP], []);
    serve((method, path) =>
      path === `/roadmaps/${ROADMAP.id}/delete-impact` ? IMPACT : lists(method, path),
    );
    renderHome();

    await userEvent.click(await screen.findByRole('button', { name: `Delete ${ROADMAP.name}` }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(apiRequestMock).not.toHaveBeenCalledWith('DELETE', expect.anything());
  });
});
