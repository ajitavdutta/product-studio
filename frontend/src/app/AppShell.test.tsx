import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';
import { DEMO_DIAGRAM_ID, DEMO_ROADMAP_ID } from './demoDocuments';
import { useSaveStateStore } from './saveState';

afterEach(() => {
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

  it('G-1 Roadmap and Swimlanes link to the seeded demo documents', () => {
    renderApp('/');

    expect({
      roadmap: within(mainNav()).getByRole('link', { name: 'Roadmap' }).getAttribute('href'),
      swimlanes: within(mainNav()).getByRole('link', { name: 'Swimlanes' }).getAttribute('href'),
    }).toEqual({
      roadmap: `/roadmaps/${DEMO_ROADMAP_ID}`,
      swimlanes: `/diagrams/${DEMO_DIAGRAM_ID}`,
    });
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
