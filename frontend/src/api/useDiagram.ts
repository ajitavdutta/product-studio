import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from '../app/SnackbarProvider';
import { apiRequest, apiUpload } from './client';
import type { components } from './types';
import { roadmapKeys, type DeleteImpact, type DocumentSummary } from './useRoadmap';

export type DiagramRead = components['schemas']['DiagramRead'];
export type DiagramCreate = components['schemas']['DiagramCreate'];

export const diagramKeys = {
  list: ['diagrams'] as const,
  /** Prefix of every diagram detail query, for invalidating them all. */
  all: ['diagram'] as const,
  detail: (id: string) => ['diagram', id] as const,
  deleteImpact: (id: string) => ['diagram', id, 'deleteImpact'] as const,
};

const DELETE_FAILED_MESSAGE = "Couldn't delete that diagram";

function diagramPath(id: string): string {
  return `/diagrams/${encodeURIComponent(id)}`;
}

/** The detail query; `staleTime: Infinity` for the same reason as `roadmapQueryOptions`. */
export function diagramQueryOptions(id: string) {
  return queryOptions({
    queryKey: diagramKeys.detail(id),
    queryFn: () => apiRequest<DiagramRead>('GET', diagramPath(id)),
    staleTime: Infinity,
  });
}

export function useDiagrams() {
  return useQuery({
    queryKey: diagramKeys.list,
    queryFn: () => apiRequest<DocumentSummary[]>('GET', '/diagrams'),
  });
}

export function useDiagram(id: string) {
  return useQuery(diagramQueryOptions(id));
}

/** What deleting the diagram would unlink, for the confirmation dialog. */
export function useDiagramDeleteImpact(id: string, enabled: boolean) {
  return useQuery({
    queryKey: diagramKeys.deleteImpact(id),
    queryFn: () => apiRequest<DeleteImpact>('GET', `${diagramPath(id)}/delete-impact`),
    enabled,
  });
}

/** SW-21: a new diagram from three blank lanes or from a roadmap's teams. */
export function useCreateDiagram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: DiagramCreate) => apiRequest<DiagramRead>('POST', '/diagrams', request),
    onSuccess: (created) => {
      queryClient.setQueryData(diagramKeys.detail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: diagramKeys.list });
    },
  });
}

/** SW-21: upload a `.swimlane.json` file; the caller shows `ApiError.errors` when it's rejected. */
export function useImportDiagramJson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => apiUpload<DiagramRead>('/diagrams/import-json', file, file.name),
    onSuccess: (imported) => {
      queryClient.setQueryData(diagramKeys.detail(imported.id), imported);
      void queryClient.invalidateQueries({ queryKey: diagramKeys.list });
    },
  });
}

export function useDeleteDiagram() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  return useMutation({
    mutationFn: (id: string) => apiRequest<DeleteImpact>('DELETE', diagramPath(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: diagramKeys.list });
      const previous = queryClient.getQueryData<DocumentSummary[]>(diagramKeys.list);
      queryClient.setQueryData<DocumentSummary[]>(diagramKeys.list, (list) =>
        list?.filter((summary) => summary.id !== id),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData(diagramKeys.list, context?.previous);
      snackbar.error(DELETE_FAILED_MESSAGE);
    },
    onSuccess: (_impact, id) => {
      queryClient.removeQueries({ queryKey: diagramKeys.detail(id) });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: diagramKeys.list });
      // Deleting a diagram removes it from roadmaps' linkedDiagrams, so those are stale.
      void queryClient.invalidateQueries({ queryKey: roadmapKeys.list });
      void queryClient.invalidateQueries({ queryKey: roadmapKeys.all });
    },
  });
}
