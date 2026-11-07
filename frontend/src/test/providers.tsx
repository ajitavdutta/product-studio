import { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
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
