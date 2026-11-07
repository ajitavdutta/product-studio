import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { AppProviders, createQueryClient } from './app/AppProviders';
import { createAppRouter } from './app/router';

const rootElement = document.getElementById('root');
if (rootElement === null) throw new Error('index.html is missing the #root element');

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders queryClient={createQueryClient()}>
      <RouterProvider router={createAppRouter()} />
    </AppProviders>
  </StrictMode>,
);
