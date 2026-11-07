import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '../../api/client';
import type { DiagramRead } from '../../api/useDiagram';
import { useSaveStateStore } from '../../app/saveState';
import { createTestQueryClient } from '../../test/providers';
import { renderApp } from '../../test/renderApp';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

const DIAGRAM_ID = '5b1f6c0e-2c1d-4c8e-9d43-7a1b2f3e4d50';
const NAME = 'Customer refund flow';

const DIAGRAM: DiagramRead = {
  id: DIAGRAM_ID,
  name: NAME,
  fileName: 'customer-refund-flow.swimlane.json',
  revision: 1,
  createdAt: '2026-11-01T09:00:00Z',
  updatedAt: '2026-11-06T09:00:00Z',
  document: { name: NAME } as DiagramRead['document'],
};

function renderDiagram() {
  renderApp(`/diagrams/${DIAGRAM_ID}`, undefined, createTestQueryClient());
}

afterEach(() => {
  vi.resetAllMocks();
  useSaveStateStore.getState().set(null);
});

describe('SwimlanePage', () => {
  it('shows a loading skeleton while the diagram loads', () => {
    apiRequestMock.mockReturnValue(new Promise(() => undefined));

    renderDiagram();

    expect(screen.getByLabelText('Loading the diagram')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows "Couldn\'t load the diagram." with Retry when loading fails', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(500, 'Boom'));

    renderDiagram();

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the diagram.");
  });

  it('shows the not-found empty state with Go home on 404', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(404, "We couldn't find that diagram."));

    renderDiagram();

    expect(await screen.findByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  });

  it('G-1 shows Saved to customer-refund-flow.swimlane.json once loaded', async () => {
    apiRequestMock.mockResolvedValue(DIAGRAM);

    renderDiagram();

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved to customer-refund-flow.swimlane.json',
    );
  });

  it('G-2 shows the diagram name in an editable field', async () => {
    apiRequestMock.mockResolvedValue(DIAGRAM);

    renderDiagram();

    expect(await screen.findByLabelText('Diagram name')).toHaveValue(NAME);
  });
});
