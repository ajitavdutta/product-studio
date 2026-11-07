import { screen, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, providersFor } from '../test/providers';
import { ApiError, apiRequest, apiUpload } from './client';
import {
  roadmapKeys,
  useDeleteRoadmap,
  useImportRoadmapJson,
  useRoadmap,
  type DocumentSummary,
  type RoadmapRead,
} from './useRoadmap';

vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  apiRequest: vi.fn(),
  apiUpload: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);
const apiUploadMock = vi.mocked(apiUpload);

const ROADMAP_ID = '0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31';

function roadmapRead(overrides: Partial<RoadmapRead> = {}): RoadmapRead {
  return {
    id: ROADMAP_ID,
    name: 'Payments Platform H1 2027',
    fileName: 'payments-platform-h1-2027.json',
    revision: 3,
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-06T09:00:00Z',
    document: { name: 'Payments Platform H1 2027' } as RoadmapRead['document'],
    ...overrides,
  };
}

function summary(id: string, name: string): DocumentSummary {
  return {
    id,
    kind: 'roadmap',
    name,
    fileName: `${name}.json`,
    schemaVersion: 1,
    revision: 1,
    updatedAt: '2026-11-06T09:00:00Z',
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('useRoadmap', () => {
  it('uses the ["roadmap", id] query key', async () => {
    const queryClient = createTestQueryClient();
    apiRequestMock.mockResolvedValue(roadmapRead());

    const { result } = renderHook(() => useRoadmap(ROADMAP_ID), {
      wrapper: providersFor(queryClient),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(queryClient.getQueryData(['roadmap', ROADMAP_ID])).toEqual(roadmapRead());
  });

  it('fetches GET /roadmaps/<id>', async () => {
    apiRequestMock.mockResolvedValue(roadmapRead());

    const { result } = renderHook(() => useRoadmap(ROADMAP_ID), {
      wrapper: providersFor(createTestQueryClient()),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequestMock).toHaveBeenCalledWith('GET', `/roadmaps/${ROADMAP_ID}`);
  });
});

describe('useImportRoadmapJson', () => {
  it('RM-16 import-json puts the new roadmap in the cache', async () => {
    const queryClient = createTestQueryClient();
    const imported = roadmapRead({ id: 'r-new', revision: 1 });
    apiUploadMock.mockResolvedValue(imported);
    const { result } = renderHook(() => useImportRoadmapJson(), {
      wrapper: providersFor(queryClient),
    });

    await result.current.mutateAsync(new File(['{}'], 'plan.json'));

    expect(queryClient.getQueryData(roadmapKeys.detail('r-new'))).toEqual(imported);
  });

  it('RM-16 passes the server errors list to the caller', async () => {
    const errors = [{ path: '/items/0/end', message: 'Item PAY-142 has an end date before its start date' }];
    apiUploadMock.mockRejectedValue(new ApiError(422, errors[0]?.message ?? '', errors));
    const { result } = renderHook(() => useImportRoadmapJson(), {
      wrapper: providersFor(createTestQueryClient()),
    });

    await expect(result.current.mutateAsync(new File(['{}'], 'bad.json'))).rejects.toMatchObject({
      errors,
    });
  });
});

describe('useDeleteRoadmap', () => {
  it('removes the roadmap from the list before the server answers', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(roadmapKeys.list, [summary('a', 'Alpha'), summary('b', 'Beta')]);
    apiRequestMock.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useDeleteRoadmap(), {
      wrapper: providersFor(queryClient),
    });

    result.current.mutate('a');

    await waitFor(() => {
      expect(
        queryClient.getQueryData<DocumentSummary[]>(roadmapKeys.list)?.map((row) => row.id),
      ).toEqual(['b']);
    });
  });

  it('rolls back an optimistic delete and shows a snackbar on failure', async () => {
    const queryClient = createTestQueryClient();
    const list = [summary('a', 'Alpha'), summary('b', 'Beta')];
    queryClient.setQueryData(roadmapKeys.list, list);
    apiRequestMock.mockImplementation((method) =>
      method === 'DELETE'
        ? Promise.reject(new ApiError(500, 'Boom'))
        : Promise.resolve(list),
    );
    const { result } = renderHook(() => useDeleteRoadmap(), {
      wrapper: providersFor(queryClient),
    });

    await result.current.mutateAsync('a').catch(() => undefined);

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete that roadmap");
    expect(queryClient.getQueryData(roadmapKeys.list)).toEqual(list);
  });
});
