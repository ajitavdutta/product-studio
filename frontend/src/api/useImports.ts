import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { apiRequest, apiUpload } from './client';
import type { components } from './types';
import { templateKeys } from './useMappingTemplates';
import { roadmapKeys, type RoadmapRead } from './useRoadmap';

export type ImportSessionRead = components['schemas']['ImportSessionRead'];
export type ImportColumn = components['schemas']['ImportColumn'];
export type ImportMapping = components['schemas']['ImportMapping'];
export type ImportCommit = components['schemas']['ImportCommit'];
export type ImportPreview = components['schemas']['ImportPreview'];
export type SampleExportInfo = components['schemas']['SampleExportInfo'];
/** IMP-4: a roadmap field a Jira column can map to; `ignore` is "Don't import". */
export type RoadmapField = ImportMapping['columns'][string];

export const importKeys = {
  /** Prefix of every import query, for removing a session and its previews together. */
  all: (id: string) => ['import', id] as const,
  session: (id: string) => ['import', id, 'session'] as const,
  preview: (id: string, mapping: ImportMapping) => ['import', id, 'preview', mapping] as const,
  sample: ['imports', 'sample'] as const,
};

function importPath(id: string): string {
  return `/imports/${encodeURIComponent(id)}`;
}

/** `?templateId=` when a template is chosen (IMP-9); nothing for "None — map manually". */
function templateQuery(templateId: string | null | undefined): string {
  return templateId ? `?templateId=${encodeURIComponent(templateId)}` : '';
}

function seedSession(queryClient: QueryClient, session: ImportSessionRead): void {
  queryClient.setQueryData(importKeys.session(session.id), session);
}

/** The bundled sample's file name and row count, for "Use the sample export (55 issues)". */
export function useSampleExportInfo() {
  return useQuery({
    queryKey: importKeys.sample,
    queryFn: () => apiRequest<SampleExportInfo>('GET', '/imports/jira/sample'),
    staleTime: Infinity,
  });
}

export interface UploadJiraExportVariables {
  file: File;
  templateId?: string | null;
}

/** IMP-1: upload a Jira CSV, JSON or XML export; a 413 or 422 carries the reason in `detail`. */
export function useUploadJiraExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, templateId }: UploadJiraExportVariables) =>
      apiUpload<ImportSessionRead>(`/imports/jira${templateQuery(templateId)}`, file, file.name),
    onSuccess: (session) => {
      seedSession(queryClient, session);
    },
  });
}

/** Start an import session from the bundled sample export. */
export function useStartSampleImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId?: string | null) =>
      apiRequest<ImportSessionRead>('POST', `/imports/jira/sample${templateQuery(templateId)}`),
    onSuccess: (session) => {
      seedSession(queryClient, session);
    },
  });
}

/**
 * The session behind the Map page, so a reload works. Sessions don't change on the
 * server, so the seeded copy from the upload never goes stale.
 */
export function useImportSession(id: string) {
  return useQuery({
    queryKey: importKeys.session(id),
    queryFn: () => apiRequest<ImportSessionRead>('GET', importPath(id)),
    staleTime: Infinity,
  });
}

/**
 * IMP-11: the live preview for a mapping. The caller passes a mapping debounced by
 * 300 ms (ASSUMPTION), or `undefined` until it has one. The previous preview stays
 * on screen while the next one loads.
 */
export function useImportPreview(id: string, mapping: ImportMapping | undefined) {
  return useQuery({
    // The disabled branch never runs its queryFn, so this placeholder key is never fetched.
    queryKey: mapping ? importKeys.preview(id, mapping) : [...importKeys.all(id), 'preview'],
    queryFn: () => {
      if (!mapping) throw new Error('useImportPreview ran without a mapping');
      return apiRequest<ImportPreview>('POST', `${importPath(id)}/preview`, mapping);
    },
    enabled: mapping !== undefined,
    placeholderData: keepPreviousData,
  });
}

/** IMP-12: create the roadmap. The server deletes the session, so the cache drops it too. */
export function useCommitImport(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commit: ImportCommit) =>
      apiRequest<RoadmapRead>('POST', `${importPath(id)}/commit`, commit),
    onSuccess: (created) => {
      queryClient.setQueryData(roadmapKeys.detail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: roadmapKeys.list });
      void queryClient.invalidateQueries({ queryKey: templateKeys });
      queryClient.removeQueries({ queryKey: importKeys.all(id) });
    },
  });
}
