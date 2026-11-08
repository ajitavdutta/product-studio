import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, providersFor } from '../test/providers';
import { apiRequest, apiUpload } from './client';
import {
  importKeys,
  useCommitImport,
  useImportPreview,
  useStartSampleImport,
  useUploadJiraExport,
  type ImportCommit,
  type ImportMapping,
  type ImportPreview,
  type ImportSessionRead,
} from './useImports';
import { templateKeys } from './useMappingTemplates';
import { roadmapKeys, type RoadmapRead } from './useRoadmap';

vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  apiRequest: vi.fn(),
  apiUpload: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);
const apiUploadMock = vi.mocked(apiUpload);

const SESSION_ID = '5b0f8f1e-3c55-4a8e-9a0b-6f1d2e3c4b5a';
const TEMPLATE_ID = 'tpl-payments';

function session(overrides: Partial<ImportSessionRead> = {}): ImportSessionRead {
  return {
    id: SESSION_ID,
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
    ...overrides,
  };
}

function mapping(name: string): ImportMapping {
  return { columns: { 'issue key': 'key', summary: 'title' }, statusMap: {}, name };
}

function preview(epics: number): ImportPreview {
  return {
    epics,
    issues: 55,
    teams: 4,
    milestones: 0,
    warnings: [],
    firstEpics: [],
    moreEpics: 0,
    unmappedColumns: [],
    missingRequired: [],
    fileName: 'payments-export.json',
    sizeEstimateBytes: 20_000,
    document: { name: 'Payments export' } as ImportPreview['document'],
  };
}

function roadmapRead(): RoadmapRead {
  return {
    id: SESSION_ID,
    name: 'Payments export',
    fileName: 'payments-export.json',
    revision: 1,
    createdAt: '2026-11-06T09:00:00Z',
    updatedAt: '2026-11-06T09:00:00Z',
    document: { name: 'Payments export' } as RoadmapRead['document'],
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('useUploadJiraExport', () => {
  it('IMP-1 upload seeds the session cache', async () => {
    const queryClient = createTestQueryClient();
    apiUploadMock.mockResolvedValue(session());
    const { result } = renderHook(() => useUploadJiraExport(), {
      wrapper: providersFor(queryClient),
    });
    const file = new File(['Issue key,Summary\n'], 'payments-export.csv', { type: 'text/csv' });

    await act(() => result.current.mutateAsync({ file }));

    expect(queryClient.getQueryData(importKeys.session(SESSION_ID))).toEqual(session());
  });

  it('IMP-9 sends the selected template id in the upload query', async () => {
    apiUploadMock.mockResolvedValue(session());
    const { result } = renderHook(() => useUploadJiraExport(), {
      wrapper: providersFor(createTestQueryClient()),
    });
    const file = new File(['Issue key,Summary\n'], 'payments-export.csv');

    await act(() => result.current.mutateAsync({ file, templateId: TEMPLATE_ID }));

    expect(apiUploadMock).toHaveBeenCalledWith(
      `/imports/jira?templateId=${TEMPLATE_ID}`,
      file,
      'payments-export.csv',
    );
  });
});

describe('useStartSampleImport', () => {
  it('IMP-1 starting the sample seeds the session cache', async () => {
    const queryClient = createTestQueryClient();
    apiRequestMock.mockResolvedValue(session());
    const { result } = renderHook(() => useStartSampleImport(), {
      wrapper: providersFor(queryClient),
    });

    await act(() => result.current.mutateAsync(null));

    expect(apiRequestMock).toHaveBeenCalledWith('POST', '/imports/jira/sample');
    expect(queryClient.getQueryData(importKeys.session(SESSION_ID))).toEqual(session());
  });
});

describe('useImportPreview', () => {
  it('IMP-11 preview keeps the previous data while refetching', async () => {
    apiRequestMock.mockResolvedValueOnce(preview(13));
    const { result, rerender } = renderHook(
      ({ current }: { current: ImportMapping }) => useImportPreview(SESSION_ID, current),
      { wrapper: providersFor(createTestQueryClient()), initialProps: { current: mapping('A') } },
    );
    await waitFor(() => {
      expect(result.current.data?.epics).toBe(13);
    });
    apiRequestMock.mockReturnValueOnce(new Promise(() => undefined));

    rerender({ current: mapping('B') });

    await waitFor(() => {
      expect(result.current.isPlaceholderData).toBe(true);
    });
    expect(result.current.data?.epics).toBe(13);
  });

  it('IMP-11 does not request a preview until there is a mapping', () => {
    renderHook(() => useImportPreview(SESSION_ID, undefined), {
      wrapper: providersFor(createTestQueryClient()),
    });

    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});

describe('useCommitImport', () => {
  it('IMP-12 commit seeds the roadmap and invalidates lists', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(importKeys.session(SESSION_ID), session());
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    apiRequestMock.mockResolvedValue(roadmapRead());
    const { result } = renderHook(() => useCommitImport(SESSION_ID), {
      wrapper: providersFor(queryClient),
    });
    const commit: ImportCommit = { ...mapping('Payments export'), updateTemplate: true };

    await act(() => result.current.mutateAsync(commit));

    expect({
      roadmap: queryClient.getQueryData(roadmapKeys.detail(SESSION_ID)),
      session: queryClient.getQueryData(importKeys.session(SESSION_ID)),
      invalidated: invalidate.mock.calls.map(([filters]) => filters?.queryKey),
    }).toEqual({
      roadmap: roadmapRead(),
      session: undefined,
      invalidated: [roadmapKeys.list, templateKeys],
    });
  });
});
