import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SnackbarProvider } from './SnackbarProvider';
import { theme } from './theme';

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
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
