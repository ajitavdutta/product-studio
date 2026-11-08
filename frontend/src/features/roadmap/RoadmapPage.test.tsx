import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '../../api/client';
import type { RoadmapRead } from '../../api/useRoadmap';
import { useSaveStateStore } from '../../app/saveState';
import { createTestQueryClient, seedEmptyDocumentLists } from '../../test/providers';
import { renderApp } from '../../test/renderApp';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

const ROADMAP_ID = '0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31';
const NAME = 'Payments Platform H1 2027';

const ROADMAP: RoadmapRead = {
  id: ROADMAP_ID,
  name: NAME,
  fileName: 'payments-platform-h1-2027.json',
  revision: 1,
  createdAt: '2026-11-01T09:00:00Z',
  updatedAt: '2026-11-06T09:00:00Z',
  document: { name: NAME } as RoadmapRead['document'],
};

function renderRoadmap() {
  renderApp(`/roadmaps/${ROADMAP_ID}`, undefined, seedEmptyDocumentLists(createTestQueryClient()));
}

afterEach(() => {
  vi.resetAllMocks();
  useSaveStateStore.getState().set(null);
});

describe('RoadmapPage', () => {
  it('shows a loading skeleton while the roadmap loads', () => {
    apiRequestMock.mockReturnValue(new Promise(() => undefined));

    renderRoadmap();

    expect(screen.getByLabelText('Loading the roadmap')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an error with Retry that reloads the roadmap', async () => {
    apiRequestMock.mockRejectedValueOnce(new ApiError(500, 'Boom')).mockResolvedValue(ROADMAP);
    renderRoadmap();

    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { level: 1, name: NAME })).toBeInTheDocument();
  });

  it('shows "Couldn\'t load the roadmap." when loading fails', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(500, 'Boom'));

    renderRoadmap();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the roadmap.");
  });

  it('shows the not-found empty state with Import from Jira on 404', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(404, "We couldn't find that roadmap."));

    renderRoadmap();

    expect(await screen.findByRole('link', { name: 'Import from Jira' })).toHaveAttribute(
      'href',
      '/import',
    );
  });

  it('G-1 shows Saved to payments-platform-h1-2027.json once loaded', async () => {
    apiRequestMock.mockResolvedValue(ROADMAP);

    renderRoadmap();

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved to payments-platform-h1-2027.json',
    );
  });

  it('G-2 renaming shows Unsaved changes, then Saved to the new file name', async () => {
    apiRequestMock.mockImplementation((method) =>
      method === 'PATCH'
        ? Promise.resolve({ revision: 2, fileName: 'payments-2027.json' })
        : Promise.resolve(ROADMAP),
    );
    renderRoadmap();
    const field = await screen.findByLabelText('Roadmap name');

    await userEvent.clear(field);
    await userEvent.type(field, 'Payments 2027');

    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    expect(await screen.findByText('Saved to payments-2027.json', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('G-2 asks for a name instead of saving a blank one', async () => {
    apiRequestMock.mockResolvedValue(ROADMAP);
    renderRoadmap();
    const field = await screen.findByLabelText('Roadmap name');

    await userEvent.clear(field);

    expect(screen.getByText('Enter a name')).toBeInTheDocument();
  });
});
