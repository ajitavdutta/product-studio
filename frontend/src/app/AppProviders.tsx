import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import { SnackbarProvider } from './SnackbarProvider';
import { theme } from './theme';

const MAX_QUERY_RETRIES = 1;

/** A 4xx (such as a 404 for a deleted document) won't change on retry, so show it at once. */
function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const isClientError = error instanceof ApiError && error.status >= 400 && error.status < 500;
  return !isClientError && failureCount < MAX_QUERY_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } });
}

interface AppProvidersProps {
  queryClient: QueryClient;
  children: ReactNode;
}

/** Theme, server-state cache and snackbars, shared by the app and its tests. */
export function AppProviders({ queryClient, children }: AppProvidersProps) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
