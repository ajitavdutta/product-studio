import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import example from '../../../../docs/examples/roadmap.example.json';
import { ApiError, apiRequest } from '../../api/client';
import type { RoadmapDocument, RoadmapRead } from '../../api/useRoadmap';
import { useSaveStateStore } from '../../app/saveState';
import { createTestQueryClient, seedEmptyDocumentLists } from '../../test/providers';
import { renderApp } from '../../test/renderApp';
import { useRoadmapEditor } from './state';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

const ROADMAP_ID = '0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31';
const DOCUMENT = example as RoadmapDocument;

const ROADMAP: RoadmapRead = {
  id: ROADMAP_ID,
  name: DOCUMENT.name,
  fileName: 'payments-platform-h1-2027.json',
  revision: 1,
  createdAt: '2026-11-01T09:00:00Z',
  updatedAt: '2026-11-06T09:00:00Z',
  document: DOCUMENT,
};

function renderRoadmap() {
  renderApp(`/roadmaps/${ROADMAP_ID}`, undefined, seedEmptyDocumentLists(createTestQueryClient()));
}

function roadmapWith(changes: Partial<RoadmapDocument>): RoadmapRead {
  return { ...ROADMAP, document: { ...DOCUMENT, ...changes } };
}

beforeEach(() => {
  // Only Date is faked: autosave's debounce and React Query keep real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-06T12:00:00'));
  window.localStorage.clear();
  useRoadmapEditor.setState({
    view: 'months',
    groupBy: 'team',
    selectedItemId: null,
    showMilestoneLines: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  useSaveStateStore.getState().set(null);
});

describe('RoadmapPage', () => {
  it('shows a loading skeleton while the roadmap loads', () => {
    apiRequestMock.mockReturnValue(new Promise(() => undefined));

    renderRoadmap();

    expect(screen.getByLabelText('Loading the roadmap')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an error with Retry that reloads the roadmap', async () => {
    apiRequestMock.mockRejectedValueOnce(new ApiError(500, 'Boom')).mockResolvedValue(ROADMAP);
    renderRoadmap();

    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('toolbar', { name: 'Roadmap' })).toBeInTheDocument();
  });

  it('shows "Couldn\'t load the roadmap." when loading fails', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(500, 'Boom'));

    renderRoadmap();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the roadmap.");
  });

  it('shows the not-found empty state with Import from Jira on 404', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(404, "We couldn't find that roadmap."));

    renderRoadmap();

    expect(await screen.findByRole('link', { name: 'Import from Jira' })).toHaveAttribute(
      'href',
      '/import',
    );
  });

  it('G-1 shows Saved to payments-platform-h1-2027.json once loaded', async () => {
    apiRequestMock.mockResolvedValue(ROADMAP);

    renderRoadmap();

    expect(await screen.findByText('Saved to payments-platform-h1-2027.json')).toBeInTheDocument();
  });

  it('RM-1 shows the source chip', async () => {
    apiRequestMock.mockResolvedValue(ROADMAP);

    renderRoadmap();

    expect(await screen.findByText('From Jira · imported 6 Nov 2026, 17:10')).toBeInTheDocument();
  });

  it('RM-1 the timescale toggle marks the active view with aria-pressed', async () => {
    apiRequestMock.mockResolvedValue(ROADMAP);
    renderRoadmap();

    await userEvent.click(await screen.findByRole('button', { name: 'Sprints' }));

    expect(screen.getByRole('button', { name: 'Sprints' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('RM-1 Group by offers Release only as a disabled option', async () => {
    apiRequestMock.mockResolvedValue(ROADMAP);
    renderRoadmap();

    const select = await screen.findByRole('combobox', { name: 'Group by' });

    expect(within(select).getByRole('option', { name: 'Release' })).toBeDisabled();
  });

  it('RM-1 Export… opens the export page for this roadmap and view', async () => {
    apiRequestMock.mockResolvedValue(ROADMAP);
    renderRoadmap();

    await userEvent.click(await screen.findByRole('button', { name: 'Export…' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Exports' })).toBeInTheDocument();
  });

  it('RM-2 summary cards from roadmap.example.json', async () => {
    apiRequestMock.mockResolvedValue(ROADMAP);
    renderRoadmap();
    const card = async (name: string) => (await screen.findByRole('region', { name })).textContent;

    expect([
      await card('Issues done'),
      await card('At risk'),
      await card('Next milestone'),
      await card('Current sprint'),
      await card('Unscheduled'),
    ]).toEqual([
      'Issues done28%',
      'At risk2 epicsReal-time fraud scoring v2, Settlement reports export',
      'Next milestoneBeta launch15 Jan 2027 · in 70 days',
      'Current sprintPI 4 · 2026 · S32 Nov – 15 Nov · 9 days left',
      'Unscheduled5 issuesNo start or due date in Jira',
    ]);
  });

  it('RM-11 clicking a chip schedules it in the next sprint and autosaves', async () => {
    apiRequestMock.mockImplementation((method) =>
      method === 'PATCH'
        ? Promise.resolve({ revision: 2, fileName: ROADMAP.fileName })
        : Promise.resolve(ROADMAP),
    );
    renderRoadmap();

    await userEvent.click(await screen.findByRole('button', { name: /^Schedule PAY-170 / }));

    expect(await screen.findByText('PAY-170 scheduled in PI 4 · 2026 S4')).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledWith('PATCH', `/roadmaps/${ROADMAP_ID}`, {
      baseVersion: 1,
      ops: [
        { op: 'set', path: '/items/it-pay-170/start', value: '2026-11-16' },
        { op: 'set', path: '/items/it-pay-170/end', value: '2026-11-29' },
        { op: 'set', path: '/items/it-pay-170/editedFields', value: ['start', 'end'] },
      ],
    });
  });

  it('RM-11 without a next sprint the chip asks for a PI instead of saving', async () => {
    apiRequestMock.mockResolvedValue(
      roadmapWith({ timeline: { ...DOCUMENT.timeline, pis: DOCUMENT.timeline.pis.slice(0, 1) } }),
    );
    vi.setSystemTime(new Date('2026-12-20T12:00:00'));
    renderRoadmap();

    await userEvent.click(await screen.findByRole('button', { name: /^Schedule PAY-170 / }));

    expect(
      await screen.findByText('Add a PI in Manage PIs to schedule this item'),
    ).toBeInTheDocument();
  });

  it('RM-11 the tray shows five chips and expands the rest', async () => {
    const extra = {
      ...DOCUMENT.items[10],
      id: 'it-extra',
      key: 'PAY-999',
      title: 'Extra',
    } as RoadmapDocument['items'][number];
    apiRequestMock.mockResolvedValue(roadmapWith({ items: [...DOCUMENT.items, extra] }));
    renderRoadmap();

    await userEvent.click(await screen.findByRole('button', { name: '+ 1 more' }));

    expect(screen.getByRole('button', { name: /^Schedule PAY-999 / })).toBeInTheDocument();
  });

  it('RM-12 hides IP in the legend in Months', async () => {
    apiRequestMock.mockResolvedValue(ROADMAP);
    renderRoadmap();

    const legend = await screen.findByRole('list', { name: 'Legend' });

    expect(within(legend).queryByText(/IP sprint/)).toBeNull();
  });

  it('RM-12 shows IP in the legend in Sprints', async () => {
    apiRequestMock.mockResolvedValue(ROADMAP);
    renderRoadmap();

    await userEvent.click(await screen.findByRole('button', { name: 'Sprints' }));

    expect(
      within(screen.getByRole('list', { name: 'Legend' })).getByText(/IP sprint/),
    ).toBeInTheDocument();
  });
});
