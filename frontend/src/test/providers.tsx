import { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { diagramKeys } from '../api/useDiagram';
import { roadmapKeys } from '../api/useRoadmap';
import { AppProviders } from '../app/AppProviders';

/** A query client for tests: no retries, so error states show at once. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** A `renderHook` wrapper that puts the app providers around the hook under test. */
export function providersFor(queryClient: QueryClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return <AppProviders queryClient={queryClient}>{children}</AppProviders>;
  };
}

/**
 * Give the roadmap and diagram lists (read by the main nav and Home) an empty, never-stale
 * answer, so a page test's single-purpose `apiRequest` mock only sees its own requests.
 */
export function seedEmptyDocumentLists(queryClient: QueryClient): QueryClient {
  for (const queryKey of [roadmapKeys.list, diagramKeys.list]) {
    queryClient.setQueryDefaults(queryKey, { staleTime: Infinity });
    queryClient.setQueryData(queryKey, []);
  }
  return queryClient;
}
