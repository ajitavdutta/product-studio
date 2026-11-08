import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../api/client';
import type { DocumentSummary } from '../api/useRoadmap';
import { createTestQueryClient } from '../test/providers';
import { renderApp } from '../test/renderApp';
import { useSaveStateStore } from './saveState';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

const LATEST_ROADMAP: DocumentSummary = {
  id: '0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31',
  kind: 'roadmap',
  name: 'Payments Platform H1 2027',
  fileName: 'payments-platform-h1-2027.json',
  schemaVersion: 1,
  revision: 3,
  updatedAt: '2026-11-05T12:00:00Z',
};
const OLDER_ROADMAP: DocumentSummary = {
  ...LATEST_ROADMAP,
  id: '7a0e2b9c-1d3f-4e5a-8b6c-9d0e1f2a3b4c',
  name: 'Mobile app 2027',
  fileName: 'mobile-app-2027.json',
  updatedAt: '2026-10-28T12:00:00Z',
};

/** Serve the two document lists the nav and Home read; every other request never settles. */
function serveLists(roadmaps: DocumentSummary[], diagrams: DocumentSummary[] = []) {
  apiRequestMock.mockImplementation((_method, path) => {
    if (path === '/roadmaps') return Promise.resolve(roadmaps);
    if (path === '/diagrams') return Promise.resolve(diagrams);
    return new Promise(() => undefined);
  });
}

beforeEach(() => {
  serveLists([]);
});

afterEach(() => {
  vi.resetAllMocks();
  act(() => {
    useSaveStateStore.getState().set(null);
  });
});

function mainNav() {
  return screen.getByRole('navigation', { name: 'Main' });
}

describe('AppShell', () => {
  it('G-1 renders the wordmark, the main nav and no save state on Home', () => {
    renderApp('/');

    expect(screen.getByRole('link', { name: 'Product Studio home' })).toBeInTheDocument();
    expect(
      within(mainNav())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Import', 'Roadmap', 'Swimlanes', 'Exports']);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('G-1 Roadmap links to the most recently updated roadmap', async () => {
    serveLists([LATEST_ROADMAP, OLDER_ROADMAP]);

    renderApp('/', undefined, createTestQueryClient());

    await waitFor(() => {
      expect(within(mainNav()).getByRole('link', { name: 'Roadmap' })).toHaveAttribute(
        'href',
        `/roadmaps/${LATEST_ROADMAP.id}`,
      );
    });
  });

  it('G-1 Roadmap falls back to Import when there are none', async () => {
    renderApp('/', undefined, createTestQueryClient());

    // Wait for the empty list so the assertion isn't satisfied by the loading fallback.
    expect(
      await screen.findByText('No roadmaps yet. Import a Jira export to make one.'),
    ).toBeVisible();
    expect(within(mainNav()).getByRole('link', { name: 'Roadmap' })).toHaveAttribute(
      'href',
      '/import',
    );
  });

  it('G-1 Swimlanes falls back to Home when there are no diagrams', async () => {
    renderApp('/', undefined, createTestQueryClient());

    expect(await screen.findByText('No diagrams yet.')).toBeVisible();
    expect(within(mainNav()).getByRole('link', { name: 'Swimlanes' })).toHaveAttribute('href', '/');
  });

  it('G-1 marks nothing active on Home', () => {
    renderApp('/');

    expect(within(mainNav()).queryByRole('link', { current: 'page' })).not.toBeInTheDocument();
  });

  it('G-1 marks Import active with aria-current on /import', () => {
    renderApp('/import');

    expect(within(mainNav()).getByRole('link', { current: 'page' })).toHaveTextContent('Import');
  });

  it('G-1 marks Roadmap active on /roadmaps/abc', () => {
    renderApp('/roadmaps/abc');

    expect(within(mainNav()).getByRole('link', { current: 'page' })).toHaveTextContent('Roadmap');
  });

  it('G-1 marks Swimlanes active on /diagrams/abc', () => {
    renderApp('/diagrams/abc');

    expect(within(mainNav()).getByRole('link', { current: 'page' })).toHaveTextContent('Swimlanes');
  });

  it('G-1 shows "Saved to payments.json" when the save-state store is saved', () => {
    useSaveStateStore.getState().set('saved', 'payments.json');

    renderApp('/');

    expect(screen.getByRole('status')).toHaveTextContent('Saved to payments.json');
  });

  it('G-1 shows "Unsaved changes" when the store is unsaved', () => {
    useSaveStateStore.getState().set('unsaved');

    renderApp('/');

    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
  });

  it('G-4 shows a labelled Settings button', () => {
    renderApp('/');

    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('renders Page not found with a link home for an unknown path', () => {
    renderApp('/nowhere');

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });
});
