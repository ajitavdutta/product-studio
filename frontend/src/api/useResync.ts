import { useMutation } from '@tanstack/react-query';
import { apiRequest, apiUpload } from './client';
import type { components } from './types';
import type { RoadmapRead } from './useRoadmap';

export type RoadmapResyncRead = components['schemas']['RoadmapResyncRead'];
export type ResyncChange = components['schemas']['ResyncChange'];
type ResyncApply = components['schemas']['ResyncApply'];

function resyncPath(roadmapId: string): string {
  return `/roadmaps/${encodeURIComponent(roadmapId)}/resync`;
}

export interface CreateResyncInput {
  file: File;
  /** From `resyncMappingFields`: `{templateId}`, `{mapping: 'auto'}`, or `{}` for the roadmap's own template. */
  mapping: Readonly<Record<string, string>>;
}

/** RM-15 step 1: upload a newer Jira export and get the diff against the roadmap. */
export function useCreateResync(roadmapId: string) {
  return useMutation({
    mutationFn: ({ file, mapping }: CreateResyncInput) =>
      apiUpload<RoadmapResyncRead>(resyncPath(roadmapId), file, file.name, mapping),
  });
}

export interface ApplyResyncInput {
  resyncId: string;
  request: ResyncApply;
}

/**
 * RM-15 step 2: apply exactly the chosen change ids. The server returns the saved roadmap;
 * `replace` (autosave's) puts it in the cache so its revision is the next PATCH's base.
 */
export function useApplyResync(roadmapId: string, replace: (read: RoadmapRead) => void) {
  return useMutation({
    mutationFn: ({ resyncId, request }: ApplyResyncInput) =>
      apiRequest<RoadmapRead>(
        'POST',
        `${resyncPath(roadmapId)}/${encodeURIComponent(resyncId)}/apply`,
        request,
      ),
    onSuccess: replace,
  });
}
