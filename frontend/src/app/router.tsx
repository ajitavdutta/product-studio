// Keep these paths in step with ROUTES in .claude/skills/prototype-parity/scripts/capture.mjs.
import { createBrowserRouter, type RouteObject } from 'react-router';
import { ExportsPage } from '../features/export/ExportsPage';
import { HomePage } from '../features/home/HomePage';
import { NotFoundPage } from '../features/home/NotFoundPage';
import { ImportPage } from '../features/import/ImportPage';
import { MapFieldsPage } from '../features/import/MapFieldsPage';
import { RoadmapPage } from '../features/roadmap/RoadmapPage';
import { SwimlanePage } from '../features/swimlane/SwimlanePage';
import { AppShell } from './AppShell';
import { RouteError } from './RouteError';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'import', element: <ImportPage /> },
      { path: 'import/:sessionId', element: <MapFieldsPage /> },
      { path: 'roadmaps/:id', element: <RoadmapPage /> },
      { path: 'diagrams/:id', element: <SwimlanePage /> },
      { path: 'exports', element: <ExportsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
