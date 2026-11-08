import { useQuery } from '@tanstack/react-query';
import { apiRequest } from './client';
import type { components } from './types';

export type MappingTemplateRead = components['schemas']['MappingTemplateRead'];

export const templateKeys = ['templates'] as const;

/** IMP-9: the saved Jira mapping templates, for the template picker on the Upload step. */
export function useMappingTemplates() {
  return useQuery({
    queryKey: templateKeys,
    queryFn: () => apiRequest<MappingTemplateRead[]>('GET', '/mapping-templates'),
  });
}
