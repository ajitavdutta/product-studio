import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from '../app/SnackbarProvider';
import { apiRequest, apiUpload } from './client';
import type { components } from './types';
import { diagramKeys } from './useDiagram';

export type RoadmapRead = components['schemas']['RoadmapRead'];
export type RoadmapDocument = components['schemas']['RoadmapDocument'];
export type DocumentSummary = components['schemas']['DocumentSummary'];
export type DeleteImpact = components['schemas']['DeleteImpact'];

export const roadmapKeys = {
  list: ['roadmaps'] as const,
  /** Prefix of every roadmap detail query, for invalidating them all. */
  all: ['roadmap'] as const,
  detail: (id: string) => ['roadmap', id] as const,
  deleteImpact: (id: string) => ['roadmap', id, 'deleteImpact'] as const,
};

const DELETE_FAILED_MESSAGE = "Couldn't delete that roadmap";

function roadmapPath(id: string): string {
  return `/roadmaps/${encodeURIComponent(id)}`;
}

/**
 * The detail query. `staleTime: Infinity` because autosave keeps this cache entry
 * authoritative (optimistic edits plus the confirmed revision); a background refetch
 * could otherwise replace unsent edits. A 409 refetches explicitly.
 */
export function roadmapQueryOptions(id: string) {
  return queryOptions({
    queryKey: roadmapKeys.detail(id),
    queryFn: () => apiRequest<RoadmapRead>('GET', roadmapPath(id)),
    staleTime: Infinity,
  });
}

export function useRoadmaps() {
  return useQuery({
    queryKey: roadmapKeys.list,
    queryFn: () => apiRequest<DocumentSummary[]>('GET', '/roadmaps'),
  });
}

export function useRoadmap(id: string) {
  return useQuery(roadmapQueryOptions(id));
}

/** What deleting the roadmap would unlink, for the confirmation dialog. */
export function useRoadmapDeleteImpact(id: string, enabled: boolean) {
  return useQuery({
    queryKey: roadmapKeys.deleteImpact(id),
    queryFn: () => apiRequest<DeleteImpact>('GET', `${roadmapPath(id)}/delete-impact`),
    enabled,
  });
}

export function useCreateRoadmap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (document: RoadmapDocument) =>
      apiRequest<RoadmapRead>('POST', '/roadmaps', document),
    onSuccess: (created) => {
      queryClient.setQueryData(roadmapKeys.detail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: roadmapKeys.list });
    },
  });
}

/** RM-16: upload a `.json` file; the caller shows `ApiError.errors` when it's rejected. */
export function useImportRoadmapJson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => apiUpload<RoadmapRead>('/roadmaps/import-json', file, file.name),
    onSuccess: (imported) => {
      queryClient.setQueryData(roadmapKeys.detail(imported.id), imported);
      void queryClient.invalidateQueries({ queryKey: roadmapKeys.list });
    },
  });
}

export function useDeleteRoadmap() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  return useMutation({
    mutationFn: (id: string) => apiRequest<DeleteImpact>('DELETE', roadmapPath(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: roadmapKeys.list });
      const previous = queryClient.getQueryData<DocumentSummary[]>(roadmapKeys.list);
      queryClient.setQueryData<DocumentSummary[]>(roadmapKeys.list, (list) =>
        list?.filter((summary) => summary.id !== id),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData(roadmapKeys.list, context?.previous);
      snackbar.error(DELETE_FAILED_MESSAGE);
    },
    onSuccess: (_impact, id) => {
      queryClient.removeQueries({ queryKey: roadmapKeys.detail(id) });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: roadmapKeys.list });
      // Deleting a roadmap unlinks its diagrams, so their cached copies are stale.
      void queryClient.invalidateQueries({ queryKey: diagramKeys.list });
      void queryClient.invalidateQueries({ queryKey: diagramKeys.all });
    },
  });
}
