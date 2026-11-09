import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import example from '../../../../docs/examples/roadmap.example.json';
import { ApiError, apiRequest, type HttpMethod } from '../../api/client';
import type { RoadmapDocument, RoadmapRead } from '../../api/useRoadmap';
import { useSaveStateStore } from '../../app/saveState';
import { createTestQueryClient, seedEmptyDocumentLists } from '../../test/providers';
import { renderApp } from '../../test/renderApp';
import { createRoadmapEditorStore, useRoadmapEditor } from './state';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);
const ROADMAP_ID = '0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31';
const ROADMAP: RoadmapRead = {
  id: ROADMAP_ID,
  name: example.name,
  fileName: 'payments-platform-h1-2027.json',
  revision: 1,
  createdAt: '2026-11-01T09:00:00Z',
  updatedAt: '2026-11-06T09:00:00Z',
  document: example as RoadmapDocument,
};
const SETTINGS = {
  displayName: '',
  jiraBaseUrl: null,
  defaultPresetId: null,
  piCadence: { sprintsPerPi: 6, ipSprint: true },
};

type PatchHandler = (body: unknown) => Promise<unknown>;

function serve(
  onPatch: PatchHandler = () => Promise.resolve({ revision: 2, fileName: ROADMAP.fileName }),
) {
  apiRequestMock.mockImplementation((method: HttpMethod, path: string, body?: unknown) => {
    if (method === 'PATCH') return onPatch(body);
    if (path === '/settings') return Promise.resolve(SETTINGS);
    return Promise.resolve(ROADMAP);
  });
}

function patchCalls() {
  return apiRequestMock.mock.calls.filter(([method]) => method === 'PATCH');
}

const bar = (key: string) =>
  screen.findByRole('button', { name: new RegExp(`^${key} .*% complete`) });
const panel = () => screen.getByRole('complementary', { name: 'Epic details' });

async function openPay142() {
  renderApp(`/roadmaps/${ROADMAP_ID}`, undefined, seedEmptyDocumentLists(createTestQueryClient()));
  await userEvent.click(await bar('PAY-142'));
  return panel();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-06T12:00:00'));
  window.localStorage.clear();
  useRoadmapEditor.setState({
    view: 'months',
    selectedItemId: null,
    panelOpen: true,
    groupBy: 'team',
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  useSaveStateStore.getState().set(null);
});

describe('Detail panel', () => {
  it('RM-13 shows the empty prompt until an epic is selected', async () => {
    serve();
    renderApp(
      `/roadmaps/${ROADMAP_ID}`,
      undefined,
      seedEmptyDocumentLists(createTestQueryClient()),
    );

    expect(await screen.findByText('Click a bar to see and edit an epic.')).toBeInTheDocument();
  });

  it('RM-13 shows the stored progress, issue counts and span', async () => {
    serve();
    const details = await openPay142();

    expect([
      within(details).getByText('Progress from 18 Jira issues').nextSibling?.textContent,
      within(details).getByText('2 to do').parentElement?.textContent,
      within(details).getByText(/^Runs /).textContent,
    ]).toEqual([
      '61%',
      '11 done5 in progress2 to do',
      'Runs PI 4 · 2026 S4 → PI 1 · 2027 S3 · crosses Beta launch',
    ]);
  });

  it('RM-13 changing Start moves the bar and sends one PATCH', async () => {
    serve();
    const details = await openPay142();
    const before = (await bar('PAY-142')).style.left;

    fireEvent.change(within(details).getByLabelText('Start'), { target: { value: '2026-12-01' } });

    expect((await bar('PAY-142')).style.left).not.toBe(before);
    await vi.waitFor(() => {
      expect(patchCalls()).toHaveLength(1);
    });
  });

  it('RM-13 edits add editedFields', async () => {
    serve();
    const details = await openPay142();

    fireEvent.change(within(details).getByLabelText('Status'), { target: { value: 'at-risk' } });

    await vi.waitFor(() => {
      expect(patchCalls()[0]?.[2]).toEqual({
        baseVersion: 1,
        ops: [
          { op: 'set', path: '/items/it-pay-142/statusId', value: 'at-risk' },
          { op: 'set', path: '/items/it-pay-142/editedFields', value: ['statusId'] },
        ],
      });
    });
  });

  it('RM-13 rejects end before start', async () => {
    serve();
    const details = await openPay142();

    fireEvent.change(within(details).getByLabelText('End'), { target: { value: '2026-11-01' } });

    expect([within(details).getByRole('alert').textContent, patchCalls().length]).toEqual([
      "End date can't be before the start date",
      0,
    ]);
  });

  it('RM-13 an invalid date goes back to the saved one on blur', async () => {
    serve();
    const details = await openPay142();
    const end = within(details).getByLabelText('End');

    fireEvent.change(end, { target: { value: '2026-11-01' } });
    fireEvent.blur(end);

    expect(end).toHaveValue('2027-01-29');
  });

  it('RM-13 a failed save rolls back and shows the snackbar', async () => {
    serve(() => Promise.reject(new ApiError(500, 'Boom')));
    const details = await openPay142();

    fireEvent.change(within(details).getByLabelText('Status'), { target: { value: 'done' } });

    expect(await screen.findByText("Couldn't save that change")).toBeInTheDocument();
    expect(within(panel()).getByLabelText('Status')).toHaveValue('in-progress');
  });

  it('NF-4 Open in Jira is a plain link to the issue', async () => {
    serve();
    const details = await openPay142();

    expect(within(details).getByRole('link', { name: 'Open in Jira ↗' })).toHaveAttribute(
      'href',
      'https://your-site.atlassian.net/browse/PAY-142',
    );
  });

  it('RM-13 the footer shows when the roadmap was last synced', async () => {
    serve();
    const details = await openPay142();

    expect(within(details).getByText('Synced from Jira 6 Nov, 17:10')).toBeInTheDocument();
  });

  it('RM-14 collapsed state survives a remount', async () => {
    serve();
    const details = await openPay142();

    await userEvent.click(within(details).getByRole('button', { name: 'Collapse epic details' }));

    expect([
      screen.getByRole('button', { name: 'Expand epic details' }),
      createRoadmapEditorStore().getState().panelOpen,
    ]).toEqual([document.activeElement, false]);
  });

  it('RM-14 the rail names the selected epic', async () => {
    serve();
    const details = await openPay142();

    await userEvent.click(within(details).getByRole('button', { name: 'Collapse epic details' }));

    expect(
      within(screen.getByRole('complementary', { name: 'Epic details (collapsed)' })).getByText(
        'PAY-142 · Saved cards & one-click checkout',
      ),
    ).toBeInTheDocument();
  });

  it('RM-11 Unschedule then Undo restores the dates', async () => {
    serve();
    const details = await openPay142();

    await userEvent.click(within(details).getByRole('button', { name: 'Unschedule' }));
    await screen.findByText('PAY-142 moved to Unscheduled');
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });

    expect(await bar('PAY-142')).toHaveAccessibleName(/16 Nov to 29 Jan$/);
  });
});
