import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, providersFor } from '../test/providers';
import { apiRequest } from './client';
import { diagramKeys, useCreateDiagram, useDiagram, type DiagramRead } from './useDiagram';

vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  apiRequest: vi.fn(),
  apiUpload: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

const DIAGRAM_ID = '5b1f6c0e-2c1d-4c8e-9d43-7a1b2f3e4d50';
const ROADMAP_ID = '0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31';

function diagramRead(overrides: Partial<DiagramRead> = {}): DiagramRead {
  return {
    id: DIAGRAM_ID,
    name: 'Customer refund flow',
    fileName: 'customer-refund-flow.swimlane.json',
    revision: 1,
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-06T09:00:00Z',
    document: { name: 'Customer refund flow' } as DiagramRead['document'],
    ...overrides,
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('useDiagram', () => {
  it('uses the ["diagram", id] query key', async () => {
    const queryClient = createTestQueryClient();
    apiRequestMock.mockResolvedValue(diagramRead());

    const { result } = renderHook(() => useDiagram(DIAGRAM_ID), {
      wrapper: providersFor(queryClient),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(queryClient.getQueryData(['diagram', DIAGRAM_ID])).toEqual(diagramRead());
  });
});

describe('useCreateDiagram', () => {
  it('SW-21 creates a diagram from roadmap teams', async () => {
    const queryClient = createTestQueryClient();
    const created = diagramRead({ id: 'd-new', name: 'Untitled workflow' });
    apiRequestMock.mockResolvedValue(created);
    const { result } = renderHook(() => useCreateDiagram(), {
      wrapper: providersFor(queryClient),
    });

    await result.current.mutateAsync({
      name: 'Untitled workflow',
      lanesFrom: 'roadmap',
      roadmapId: ROADMAP_ID,
    });

    expect({
      request: apiRequestMock.mock.calls[0],
      cached: queryClient.getQueryData(diagramKeys.detail('d-new')),
    }).toEqual({
      request: [
        'POST',
        '/diagrams',
        { name: 'Untitled workflow', lanesFrom: 'roadmap', roadmapId: ROADMAP_ID },
      ],
      cached: created,
    });
  });
});
