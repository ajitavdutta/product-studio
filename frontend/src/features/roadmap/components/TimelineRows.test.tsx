import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import example from '../../../../../docs/examples/roadmap.example.json';
import type { RoadmapDocument } from '../../../api/useRoadmap';
import type { RowGrouping } from '../../../lib/roadmap/rows';
import { defaultRange, type DateRange } from '../../../lib/timeline';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { selectItem } from '../selectItem';
import { useRoadmapEditor } from '../state';
import { TimelineRows } from './TimelineRows';

const DOCUMENT = example as RoadmapDocument;
const MONTHS_RANGE = defaultRange('months', DOCUMENT.timeline, DOCUMENT.items);
const PAY_142_ANY_BAR = /^PAY-142 .*% complete/;
const PAY_142_BAR = /^PAY-142 Saved cards & one-click checkout, In progress, 61% complete/;

interface RenderOptions {
  document?: RoadmapDocument;
  groupBy?: RowGrouping;
  range?: DateRange;
  selectedItemId?: string | null;
  onSelect?: (itemId: string) => void;
}

function renderRows({
  document = DOCUMENT,
  groupBy = 'team',
  range = MONTHS_RANGE,
  selectedItemId = null,
  onSelect = vi.fn(),
}: RenderOptions = {}) {
  render(
    <TimelineRows
      lanes={document.lanes}
      items={document.items}
      statuses={document.statuses}
      groupBy={groupBy}
      range={range}
      selectedItemId={selectedItemId}
      onSelect={onSelect}
    />,
    { wrapper: providersFor(createTestQueryClient()) },
  );
  return { onSelect };
}

function SelectedRows() {
  const selectedItemId = useRoadmapEditor((state) => state.selectedItemId);
  return (
    <TimelineRows
      lanes={DOCUMENT.lanes}
      items={DOCUMENT.items}
      statuses={DOCUMENT.statuses}
      groupBy="team"
      range={MONTHS_RANGE}
      selectedItemId={selectedItemId}
      onSelect={selectItem}
    />
  );
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-06T12:00:00'));
  localStorage.clear();
  useRoadmapEditor.setState({ selectedItemId: null, panelOpen: false });
});

describe('TimelineRows', () => {
  it('RM-3 renders team headers with epic counts', () => {
    renderRows();

    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Checkout· 3 epics',
      'Risk & Fraud· 2 epics',
      'Platform· 2 epics',
      'Merchant Experience· 3 epics',
    ]);
  });

  it('RM-3 says "1 epic" for a lane with a single scheduled epic', () => {
    const document = {
      ...DOCUMENT,
      items: DOCUMENT.items.filter((item) => item.key !== 'RSK-036'),
    };

    renderRows({ document });

    expect(screen.getByRole('heading', { name: /^Risk & Fraud/ })).toHaveTextContent(/· 1 epic$/);
  });

  it('RM-1 epic grouping shows no team headers', () => {
    renderRows({ groupBy: 'epic' });

    expect(screen.queryAllByRole('heading')).toHaveLength(0);
  });

  it('RM-8 labels the bar with key, title, status, stored progress and dates', () => {
    renderRows();

    expect(
      screen.getByRole('button', {
        name: 'PAY-142 Saved cards & one-click checkout, In progress, 61% complete, 16 Nov to 29 Jan',
      }),
    ).toBeInTheDocument();
  });

  it('RM-8 the progress line shows the stored progress, not one computed from issues', () => {
    const document = {
      ...DOCUMENT,
      items: DOCUMENT.items.map((item) =>
        item.key === 'PAY-142' ? { ...item, progress: 7 } : item,
      ),
    };

    renderRows({ document });

    const bar = screen.getByRole('button', { name: /^PAY-142 .*, 7% complete/ });
    expect(within(bar).getByTestId('progress')).toHaveStyle({ width: '7%' });
  });

  it('RM-8 clicking a bar selects it and opens the panel', async () => {
    render(<SelectedRows />, { wrapper: providersFor(createTestQueryClient()) });

    await userEvent.click(screen.getByRole('button', { name: PAY_142_BAR }));

    const { selectedItemId, panelOpen } = useRoadmapEditor.getState();
    expect({ selectedItemId, panelOpen }).toEqual({
      selectedItemId: 'it-pay-142',
      panelOpen: true,
    });
  });

  it('RM-8 clicking the row label selects it', async () => {
    const { onSelect } = renderRows();

    await userEvent.click(
      screen.getByRole('button', { name: 'RSK-031 Real-time fraud scoring v2' }),
    );

    expect(onSelect).toHaveBeenCalledWith('it-rsk-031');
  });

  it('RM-8 marks the selected epic for assistive technology', () => {
    renderRows({ selectedItemId: 'it-pay-142' });

    expect(screen.getByRole('button', { name: PAY_142_BAR })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('RM-8 bar width follows the dates', () => {
    // 61-day range; a 15-day epic starting on day 15 spans 15/61 of the track.
    const range = { start: '2026-11-01', endExclusive: '2027-01-01' };
    const document = {
      ...DOCUMENT,
      items: DOCUMENT.items.map((item) =>
        item.key === 'PAY-142' ? { ...item, start: '2026-11-16', end: '2026-11-30' } : item,
      ),
    };

    renderRows({ document, range });

    const bar = screen.getByRole('button', { name: PAY_142_ANY_BAR });
    // (100% − 220px) × 15/61 − 4px, which jsdom simplifies to 24.5902% − 58.0984px.
    expect(bar.style.width).toBe('calc(24.5902% - 58.0984px)');
  });

  it('RM-8 bar starts 2px after its start date', () => {
    const range = { start: '2026-11-01', endExclusive: '2027-01-01' };
    const document = {
      ...DOCUMENT,
      items: DOCUMENT.items.map((item) =>
        item.key === 'PAY-142' ? { ...item, start: '2026-11-16', end: '2026-11-30' } : item,
      ),
    };

    renderRows({ document, range });

    const bar = screen.getByRole('button', { name: PAY_142_ANY_BAR });
    // 220px + (100% − 220px) × 15/61 + 2px, which jsdom simplifies to 24.5902% + 167.902px.
    expect(bar.style.left).toBe('calc(24.5902% + 167.902px)');
  });

  it('RM-8 an epic outside the visible range keeps its label but has no bar', () => {
    const range = { start: '2026-11-02', endExclusive: '2026-11-16' };

    renderRows({ range });

    expect({
      label: screen.queryByRole('button', { name: 'MX-081 Dispute self-service' }) !== null,
      bar: screen.queryByRole('button', { name: /^MX-081 .*complete/ }) !== null,
    }).toEqual({ label: true, bar: false });
  });

  it('RM-3 shows an empty state when nothing is scheduled', () => {
    const document = {
      ...DOCUMENT,
      items: DOCUMENT.items.map((item) => ({ ...item, start: null, end: null })),
    };

    renderRows({ document, groupBy: 'epic' });

    expect(screen.getByText(/No epics are scheduled yet/)).toBeInTheDocument();
  });
});
