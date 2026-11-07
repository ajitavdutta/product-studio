import { render } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { AppProviders, createQueryClient } from '../app/AppProviders';
import { routes as appRoutes } from '../app/router';

/** Render a route table (the real one by default) at `path` inside the app providers. */
export function renderApp(
  path: string,
  routes: RouteObject[] = appRoutes,
  queryClient: QueryClient = createQueryClient(),
) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}
